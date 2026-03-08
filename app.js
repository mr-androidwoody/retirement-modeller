import {
  getDefaultInputs,
  runRetirementSimulation,
  validateInputs
} from "./simulator.js";

const FIELD_IDS = [
  "years",
  "simulationRuns",
  "initialPortfolio",
  "initialSpending",
  "inflationRate",
  "rebalanceAnnually",
  "equityAllocation",
  "bondAllocation",
  "cashAllocation",
  "equityReturn",
  "equityVolatility",
  "bondReturn",
  "bondVolatility",
  "cashReturn",
  "cashVolatility",
  "initialWithdrawalRate",
  "upperGuardrail",
  "lowerGuardrail",
  "adjustmentPct",
  "person1Age",
  "person1PensionAge",
  "person1PensionAmount",
  "person2Age",
  "person2PensionAge",
  "person2PensionAmount"
];

const toggleIds = [
  "skipInflationAfterNegative",
  "showRealValues",
  "showFullTable"
];

let portfolioChart = null;
let spendingChart = null;
let stressChart = null;

document.addEventListener("DOMContentLoaded", () => {
  applyDefaults();
  wireEvents();
  runSimulation();
});

function wireEvents() {
  document.getElementById("runSimulationBtn").addEventListener("click", runSimulation);
  document.getElementById("resetDefaultsBtn").addEventListener("click", () => {
    applyDefaults();
    runSimulation();
  });

  for (const id of FIELD_IDS) {
    document.getElementById(id).addEventListener("input", handleLiveUiState);
    document.getElementById(id).addEventListener("change", handleLiveUiState);
  }

  for (const id of toggleIds) {
    document.getElementById(id).addEventListener("change", () => {
      if (id === "showFullTable") {
        toggleTableVisibility();
      }
      if (id === "showRealValues") {
        runSimulation();
      }
    });
  }
}

function applyDefaults() {
  const defaults = getDefaultInputs();

  setValue("years", defaults.years);
  setValue("simulationRuns", defaults.simulationRuns);
  setValue("initialPortfolio", defaults.initialPortfolio);
  setValue("initialSpending", defaults.initialSpending);
  setValue("inflationRate", defaults.inflationRate);
  setValue("rebalanceAnnually", String(defaults.rebalanceAnnually));

  setValue("equityAllocation", defaults.equityAllocation);
  setValue("bondAllocation", defaults.bondAllocation);
  setValue("cashAllocation", defaults.cashAllocation);

  setValue("equityReturn", defaults.equityReturn);
  setValue("equityVolatility", defaults.equityVolatility);
  setValue("bondReturn", defaults.bondReturn);
  setValue("bondVolatility", defaults.bondVolatility);
  setValue("cashReturn", defaults.cashReturn);
  setValue("cashVolatility", defaults.cashVolatility);

  setValue("initialWithdrawalRate", defaults.initialWithdrawalRate);
  setValue("upperGuardrail", defaults.upperGuardrail);
  setValue("lowerGuardrail", defaults.lowerGuardrail);
  setValue("adjustmentPct", defaults.adjustmentPct);

  setValue("person1Age", defaults.person1Age);
  setValue("person1PensionAge", defaults.person1PensionAge);
  setValue("person1PensionAmount", defaults.person1PensionAmount);

  setValue("person2Age", defaults.person2Age);
  setValue("person2PensionAge", defaults.person2PensionAge);
  setValue("person2PensionAmount", defaults.person2PensionAmount);

  document.getElementById("skipInflationAfterNegative").checked = true;
  document.getElementById("showRealValues").checked = true;
  document.getElementById("showFullTable").checked = true;

  handleLiveUiState();
  toggleTableVisibility();
}

function handleLiveUiState() {
  const total =
    readNumber("equityAllocation") +
    readNumber("bondAllocation") +
    readNumber("cashAllocation");

  const totalEl = document.getElementById("allocationTotal");
  totalEl.textContent = `Allocation total: ${formatNumber(total, 0)}%`;

  if (Math.abs(total - 100) < 0.001) {
    totalEl.className = "allocation-total positive";
  } else {
    totalEl.className = "allocation-total negative";
  }
}

function runSimulation() {
  const inputs = collectInputs();
  const errors = validateInputs(inputs);

  renderValidation(errors);
  toggleTableVisibility();

  if (errors.length > 0) {
    clearCharts();
    clearSummary();
    clearTable();
    return;
  }

  const result = runRetirementSimulation(inputs);
  renderSummary(result);
  renderCharts(result);
  renderTable(result);
}

function collectInputs() {
  return {
    years: readNumber("years"),
    simulationRuns: readNumber("simulationRuns"),
    initialPortfolio: readNumber("initialPortfolio"),
    initialSpending: readNumber("initialSpending"),
    inflationRate: readNumber("inflationRate"),
    rebalanceAnnually: document.getElementById("rebalanceAnnually").value === "true",

    equityAllocation: readNumber("equityAllocation"),
    bondAllocation: readNumber("bondAllocation"),
    cashAllocation: readNumber("cashAllocation"),

    equityReturn: readNumber("equityReturn"),
    equityVolatility: readNumber("equityVolatility"),
    bondReturn: readNumber("bondReturn"),
    bondVolatility: readNumber("bondVolatility"),
    cashReturn: readNumber("cashReturn"),
    cashVolatility: readNumber("cashVolatility"),

    initialWithdrawalRate: readNumber("initialWithdrawalRate"),
    upperGuardrail: readNumber("upperGuardrail"),
    lowerGuardrail: readNumber("lowerGuardrail"),
    adjustmentPct: readNumber("adjustmentPct"),

    person1Age: readNumber("person1Age"),
    person1PensionAge: readNumber("person1PensionAge"),
    person1PensionAmount: readNumber("person1PensionAmount"),
    person2Age: readNumber("person2Age"),
    person2PensionAge: readNumber("person2PensionAge"),
    person2PensionAmount: readNumber("person2PensionAmount"),

    skipInflationAfterNegative:
      document.getElementById("skipInflationAfterNegative").checked
  };
}

function renderValidation(errors) {
  const banner = document.getElementById("validationBanner");

  if (!errors.length) {
    banner.classList.add("hidden");
    banner.textContent = "";
    return;
  }

  banner.classList.remove("hidden");
  banner.textContent = errors.join(" ");
}

function renderSummary(result) {
  const realValues = document.getElementById("showRealValues").checked;
  const medianEnding = result.medianPath.yearly[result.medianPath.yearly.length - 1];
  const worst = result.worstStress;

  document.getElementById("successRateValue").textContent = formatPercent(
    result.successRate,
    1
  );

  document.getElementById("medianEndingValue").textContent = realValues
    ? formatCurrency(medianEnding.endPortfolioReal)
    : formatCurrency(medianEnding.endPortfolio);

  document.getElementById("worstStressValue").textContent = worst
    ? `${worst.name}: ${formatCurrency(
        realValues ? worst.endingPortfolioReal : worst.endingPortfolio
      )}`
    : "—";

  document.getElementById("worstStressNote").textContent = worst
    ? worst.depleted
      ? "This stress path depleted before the end of the plan."
      : "This was the weakest non-random stress result."
    : "—";

  document.getElementById("cashRunwayValue").textContent = `${formatNumber(
    result.cashRunwayYears,
    1
  )} yrs`;
}

function clearSummary() {
  document.getElementById("successRateValue").textContent = "—";
  document.getElementById("medianEndingValue").textContent = "—";
  document.getElementById("worstStressValue").textContent = "—";
  document.getElementById("worstStressNote").textContent = "—";
  document.getElementById("cashRunwayValue").textContent = "—";
}

function renderCharts(result) {
  clearCharts();

  const realValues = document.getElementById("showRealValues").checked;

  portfolioChart = new Chart(document.getElementById("portfolioChart"), {
    type: "line",
    data: buildPortfolioChartData(result, realValues),
    options: buildLineChartOptions("£")
  });

  spendingChart = new Chart(document.getElementById("spendingChart"), {
    type: "line",
    data: buildSpendingChartData(result, realValues),
    options: buildLineChartOptions("£")
  });

  stressChart = new Chart(document.getElementById("stressChart"), {
    type: "line",
    data: buildStressChartData(result, realValues),
    options: buildLineChartOptions("£")
  });
}

function clearCharts() {
  if (portfolioChart) {
    portfolioChart.destroy();
    portfolioChart = null;
  }
  if (spendingChart) {
    spendingChart.destroy();
    spendingChart = null;
  }
  if (stressChart) {
    stressChart.destroy();
    stressChart = null;
  }
}

function buildPortfolioChartData(result, realValues) {
  const labels = result.percentiles.portfolio.map((row) => row.year);
  const upper = result.percentiles.portfolio.map((row) =>
    realValues ? row.real.p90 : row.nominal.p90
  );
  const median = result.percentiles.portfolio.map((row) =>
    realValues ? row.real.p50 : row.nominal.p50
  );
  const lower = result.percentiles.portfolio.map((row) =>
    realValues ? row.real.p10 : row.nominal.p10
  );

  return {
    labels,
    datasets: [
      {
        label: "90th percentile",
        data: upper,
        borderColor: "rgba(113, 132, 168, 0.9)",
        backgroundColor: "rgba(188, 200, 224, 0.32)",
        pointRadius: 0,
        borderWidth: 2,
        fill: false,
        tension: 0.2
      },
      {
        label: "Range 10th–90th",
        data: lower,
        borderColor: "rgba(188, 200, 224, 0)",
        backgroundColor: "rgba(188, 200, 224, 0.32)",
        pointRadius: 0,
        borderWidth: 0,
        fill: "-1",
        tension: 0.2
      },
      {
        label: "Median",
        data: median,
        borderColor: "rgba(44, 92, 197, 1)",
        backgroundColor: "rgba(44, 92, 197, 0.12)",
        pointRadius: 0,
        borderWidth: 2.4,
        fill: false,
        tension: 0.2
      },
      {
        label: "10th percentile",
        data: lower,
        borderColor: "rgba(210, 54, 78, 0.95)",
        backgroundColor: "rgba(210, 54, 78, 0.08)",
        pointRadius: 0,
        borderWidth: 2,
        fill: false,
        tension: 0.2
      }
    ]
  };
}

function buildSpendingChartData(result, realValues) {
  const labels = result.percentiles.spending.map((row) => row.year);

  const spendingMedian = result.percentiles.spending.map((row) =>
    realValues ? row.spendingReal.p50 : row.spendingNominal.p50
  );

  const spendingP90 = result.percentiles.spending.map((row) =>
    realValues ? row.spendingReal.p90 : row.spendingNominal.p90
  );

  const spendingP10 = result.percentiles.spending.map((row) =>
    realValues ? row.spendingReal.p10 : row.spendingNominal.p10
  );

  const withdrawalMedian = result.percentiles.spending.map((row) =>
    realValues ? row.withdrawalReal.p50 : row.withdrawalNominal.p50
  );

  const pensionMedian = result.percentiles.spending.map((row) =>
    realValues ? row.pensionReal.p50 : row.pensionNominal.p50
  );

  return {
    labels,
    datasets: [
      {
        label: "Total spending range (10th–90th)",
        data: spendingP90,
        borderColor: "rgba(180, 193, 220, 0.0)",
        backgroundColor: "rgba(193, 205, 228, 0.24)",
        pointRadius: 0,
        borderWidth: 0,
        fill: false,
        tension: 0.2
      },
      {
        label: "Spending floor",
        data: spendingP10,
        borderColor: "rgba(180, 193, 220, 0.0)",
        backgroundColor: "rgba(193, 205, 228, 0.24)",
        pointRadius: 0,
        borderWidth: 0,
        fill: "-1",
        tension: 0.2
      },
      {
        label: "Median total household spending",
        data: spendingMedian,
        borderColor: "rgba(44, 92, 197, 1)",
        backgroundColor: "rgba(44, 92, 197, 0.08)",
        pointRadius: 0,
        borderWidth: 2.4,
        fill: false,
        tension: 0.2
      },
      {
        label: "Median portfolio withdrawals",
        data: withdrawalMedian,
        borderColor: "rgba(201, 61, 76, 0.96)",
        backgroundColor: "rgba(201, 61, 76, 0.08)",
        pointRadius: 0,
        borderWidth: 2.1,
        fill: false,
        tension: 0.2
      },
      {
        label: "Median state pension income",
        data: pensionMedian,
        borderColor: "rgba(19, 137, 90, 0.96)",
        backgroundColor: "rgba(19, 137, 90, 0.08)",
        pointRadius: 0,
        borderWidth: 2.1,
        fill: false,
        tension: 0.2
      }
    ]
  };
}

function buildStressChartData(result, realValues) {
  const labels = result.stressTests[0]?.yearly.map((row) => row.year) ?? [];

  const palette = [
    "#2c5cc5",
    "#d2364e",
    "#13895a",
    "#9a5de0",
    "#c97a10",
    "#547089",
    "#0f6379",
    "#7b3340"
  ];

  const datasets = result.stressTests.map((scenario, index) => ({
    label: scenario.name,
    data: scenario.yearly.map((row) =>
      realValues ? row.endPortfolioReal : row.endPortfolio
    ),
    borderColor: palette[index % palette.length],
    backgroundColor: palette[index % palette.length],
    pointRadius: 0,
    borderWidth: 2,
    fill: false,
    tension: 0.15
  }));

  return { labels, datasets };
}

function buildLineChartOptions(prefix) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false
    },
    plugins: {
      legend: {
        position: "top",
        align: "start",
        labels: {
          boxWidth: 22,
          boxHeight: 8,
          usePointStyle: false,
          color: "#334155",
          padding: 18
        }
      },
      tooltip: {
        callbacks: {
          label(context) {
            const label = context.dataset.label ? `${context.dataset.label}: ` : "";
            return `${label}${formatCurrency(context.parsed.y)}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          color: "rgba(148, 163, 184, 0.14)"
        },
        ticks: {
          color: "#64748b"
        },
        title: {
          display: true,
          text: "Year",
          color: "#64748b",
          font: {
            weight: "600"
          }
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: "rgba(148, 163, 184, 0.18)"
        },
        ticks: {
          color: "#64748b",
          callback(value) {
            return compactCurrency(value);
          }
        }
      }
    }
  };
}

function renderTable(result) {
  const realValues = document.getElementById("showRealValues").checked;
  const table = document.getElementById("resultsTable");
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");

  const rows = result.medianPath.yearly;

  thead.innerHTML = `
    <tr>
      <th>Year</th>
      <th>Start portfolio</th>
      <th>Household spending</th>
      <th>State pension</th>
      <th>Portfolio withdrawal</th>
      <th>Portfolio return</th>
      <th>Equity return</th>
      <th>Bond return</th>
      <th>Cash return</th>
      <th>End portfolio</th>
    </tr>
  `;

  tbody.innerHTML = rows
    .map((row) => {
      const startPortfolio = realValues ? row.startPortfolioReal : row.startPortfolio;
      const spending = realValues ? row.spendingReal : row.spendingNominal;
      const pension = realValues ? row.statePensionReal : row.statePensionNominal;
      const withdrawal = realValues
        ? row.portfolioWithdrawalReal
        : row.portfolioWithdrawalNominal;
      const endPortfolio = realValues ? row.endPortfolioReal : row.endPortfolio;

      return `
        <tr>
          <td>${row.year}</td>
          <td>${formatCurrency(startPortfolio)}</td>
          <td>${formatCurrency(spending)}</td>
          <td>${formatCurrency(pension)}</td>
          <td>${formatCurrency(withdrawal)}</td>
          <td class="${row.portfolioReturn < 0 ? "negative" : "positive"}">${formatPercent(
            row.portfolioReturn,
            1
          )}</td>
          <td class="${row.equityReturn < 0 ? "negative" : "positive"}">${formatPercent(
            row.equityReturn,
            1
          )}</td>
          <td class="${row.bondReturn < 0 ? "negative" : "positive"}">${formatPercent(
            row.bondReturn,
            1
          )}</td>
          <td class="${row.cashReturn < 0 ? "negative" : "positive"}">${formatPercent(
            row.cashReturn,
            1
          )}</td>
          <td>${formatCurrency(endPortfolio)}</td>
        </tr>
      `;
    })
    .join("");
}

function clearTable() {
  const table = document.getElementById("resultsTable");
  table.querySelector("thead").innerHTML = "";
  table.querySelector("tbody").innerHTML = "";
}

function toggleTableVisibility() {
  const show = document.getElementById("showFullTable").checked;
  document.getElementById("yearlyTableCard").classList.toggle("hidden", !show);
}

function setValue(id, value) {
  document.getElementById(id).value = value;
}

function readNumber(id) {
  const value = Number(document.getElementById(id).value);
  return Number.isFinite(value) ? value : 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0
  }).format(value);
}

function compactCurrency(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function formatPercent(value, digits = 1) {
  return `${formatNumber(value * 100, digits)}%`;
}

function formatNumber(value, digits = 1) {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}