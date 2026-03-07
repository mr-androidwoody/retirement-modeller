import { defaultScenario } from "./scenarios.js";
import { runSingleSimulation, runMonteCarlo } from "./simulator.js";

function formatCurrency(value) {
  return `£${Math.round(value).toLocaleString("en-GB")}`;
}

function formatNumberWithCommas(value) {
  if (value === "" || value === null || value === undefined) return "";
  const num = Number(String(value).replace(/,/g, ""));
  if (Number.isNaN(num)) return "";
  return num.toLocaleString("en-GB");
}

function removeCommas(value) {
  if (!value) return value;
  return String(value).replace(/,/g, "");
}

function formatPercent(value, decimals = 1) {
  return `${(value * 100).toFixed(decimals)}%`;
}

function renderSummary(monteCarlo) {
  const summaryEl = document.getElementById("summary");
  if (!summaryEl) return;

  summaryEl.innerHTML = `
    <div class="card">
      <div class="card-title">Monte Carlo runs</div>
      <div class="card-value">${monteCarlo.runs}</div>
    </div>
    <div class="card">
      <div class="card-title">Success rate</div>
      <div class="card-value">${formatPercent(monteCarlo.successRate)}</div>
    </div>
    <div class="card">
      <div class="card-title">Median ending value</div>
      <div class="card-value">${formatCurrency(monteCarlo.medianEndingValue)}</div>
    </div>
    <div class="card">
      <div class="card-title">P10 ending value</div>
      <div class="card-value">${formatCurrency(monteCarlo.p10EndingValue)}</div>
    </div>
    <div class="card">
      <div class="card-title">P90 ending value</div>
      <div class="card-value">${formatCurrency(monteCarlo.p90EndingValue)}</div>
    </div>
  `;
}

function renderStressSummary(monteCarlo) {
  const stressEl = document.getElementById("stressSummary");
  if (!stressEl) return;

  const earliestDepletion =
    monteCarlo.downside.earliestDepletionYear === null
      ? "No failures"
      : `Year ${monteCarlo.downside.earliestDepletionYear}`;

  const medianFailureYear =
    monteCarlo.downside.medianFailureYear === null
      ? "No failures"
      : `Year ${Math.round(monteCarlo.downside.medianFailureYear)}`;

  stressEl.innerHTML = `
    <div class="card">
      <div class="card-title">Worst ending value</div>
      <div class="card-value">${formatCurrency(monteCarlo.worstEndingValue)}</div>
    </div>
    <div class="card">
      <div class="card-title">Average GK cuts per run</div>
      <div class="card-value">${monteCarlo.downside.averageCutsPerRun.toFixed(2)}</div>
    </div>
    <div class="card">
      <div class="card-title">Average GK raises per run</div>
      <div class="card-value">${monteCarlo.downside.averageRaisesPerRun.toFixed(2)}</div>
    </div>
    <div class="card">
      <div class="card-title">Average inflation skips per run</div>
      <div class="card-value">${monteCarlo.downside.averageInflationSkipsPerRun.toFixed(2)}</div>
    </div>
    <div class="card">
      <div class="card-title">Earliest depletion year</div>
      <div class="card-value">${earliestDepletion}</div>
    </div>
    <div class="card">
      <div class="card-title">Median failure year</div>
      <div class="card-value">${medianFailureYear}</div>
    </div>
  `;
}

function renderTable(records, showFullTimeline) {
  const tableEl = document.getElementById("results-table");
  if (!tableEl) return;

  const rowsToShow = showFullTimeline ? records : records.slice(0, 10);

  const rows = rowsToShow
    .map(
      (row) => `
        <tr>
          <td>${row.year}</td>
          <td>${row.age1}</td>
          <td>${row.age2}</td>
          <td>${formatCurrency(row.startPortfolio)}</td>
          <td>${formatCurrency(row.spendingTarget)}</td>
          <td>${formatCurrency(row.statePensionIncome)}</td>
          <td>${formatCurrency(row.withdrawal)}</td>
          <td>${formatPercent(row.returnPct)}</td>
          <td>${formatCurrency(row.endPortfolio)}</td>
          <td>${row.events.join(", ")}</td>
        </tr>
      `
    )
    .join("");

  tableEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Year</th>
          <th>Age 1</th>
          <th>Age 2</th>
          <th>Start Portfolio</th>
          <th>Spending Target</th>
          <th>State Pension</th>
          <th>Withdrawal</th>
          <th>Return</th>
          <th>End Portfolio</th>
          <th>Events</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

let cashflowChartInstance = null;
let portfolioChartInstance = null;

function buildChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  canvas.height = 360;
  return new Chart(canvas, config);
}

function renderCashflowChart(records) {
  if (cashflowChartInstance) {
    cashflowChartInstance.destroy();
  }

  cashflowChartInstance = buildChart("cashflowChart", {
    type: "line",
    data: {
      labels: records.map((r) => `Year ${r.year}`),
      datasets: [
        {
          label: "Total household spending",
          data: records.map((r) => r.spendingTarget),
          borderWidth: 2
        },
        {
          label: "State pension income",
          data: records.map((r) => r.statePensionIncome),
          borderWidth: 2
        },
        {
          label: "Portfolio withdrawals",
          data: records.map((r) => r.withdrawal),
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top"
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

function renderPortfolioChart(yearlyPercentiles) {
  if (portfolioChartInstance) {
    portfolioChartInstance.destroy();
  }

  portfolioChartInstance = buildChart("portfolioChart", {
    type: "line",
    data: {
      labels: yearlyPercentiles.map((r) => `Year ${r.year}`),
      datasets: [
        {
          label: "P10 portfolio",
          data: yearlyPercentiles.map((r) => r.p10),
          borderWidth: 2
        },
        {
          label: "Median portfolio",
          data: yearlyPercentiles.map((r) => r.median),
          borderWidth: 2
        },
        {
          label: "P90 portfolio",
          data: yearlyPercentiles.map((r) => r.p90),
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top"
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function populateInputs(scenario) {
  const stockPct = scenario.stockAllocation * 100;
  const bondPct = scenario.bondAllocation * 100;

  setInputValue("startPortfolio", formatNumberWithCommas(scenario.startPortfolio));
  setInputValue("annualSpending", formatNumberWithCommas(scenario.annualSpending));
  setInputValue("annualSpendingSlider", scenario.annualSpending);
  setInputValue("stockAllocation", stockPct);
  setInputValue("stockAllocationSlider", stockPct);
  setInputValue("bondAllocation", bondPct);
  setInputValue("years", scenario.years);
  setInputValue("monteCarloRuns", scenario.monteCarloRuns);
  setInputValue("seed", scenario.seed);
  setInputValue("inflation", scenario.inflation * 100);
  setInputValue("person1Age", scenario.person1Age);
  setInputValue("person2Age", scenario.person2Age);
  setInputValue("person1StatePensionAge", scenario.person1StatePensionAge);
  setInputValue("person2StatePensionAge", scenario.person2StatePensionAge);
  setInputValue("statePensionToday", formatNumberWithCommas(scenario.statePensionToday));
}

function getNumberValue(id) {
  const raw = document.getElementById(id).value;
  return Number(removeCommas(raw));
}

function updateBondAllocationFromStock() {
  const stockEl = document.getElementById("stockAllocation");
  const bondEl = document.getElementById("bondAllocation");
  if (!stockEl || !bondEl) return;

  const stock = Number(removeCommas(stockEl.value));
  const bond = 100 - stock;
  bondEl.value = Number.isFinite(bond) ? bond : 0;
}

function readScenarioFromInputs() {
  return {
    ...defaultScenario,
    startPortfolio: getNumberValue("startPortfolio"),
    annualSpending: getNumberValue("annualSpending"),
    stockAllocation: getNumberValue("stockAllocation") / 100,
    bondAllocation: getNumberValue("bondAllocation") / 100,
    years: getNumberValue("years"),
    monteCarloRuns: getNumberValue("monteCarloRuns"),
    seed: getNumberValue("seed"),
    inflation: getNumberValue("inflation") / 100,
    person1Age: getNumberValue("person1Age"),
    person2Age: getNumberValue("person2Age"),
    person1StatePensionAge: getNumberValue("person1StatePensionAge"),
    person2StatePensionAge: getNumberValue("person2StatePensionAge"),
    statePensionToday: getNumberValue("statePensionToday")
  };
}

function showError(message) {
  const errorBox = document.getElementById("errorBox");
  if (!errorBox) return;
  errorBox.style.display = "block";
  errorBox.textContent = message;
}

function hideError() {
  const errorBox = document.getElementById("errorBox");
  if (!errorBox) return;
  errorBox.style.display = "none";
  errorBox.textContent = "";
}

function validateInputScenario(scenario) {
  if (Math.abs(scenario.stockAllocation + scenario.bondAllocation - 1) > 0.000001) {
    throw new Error("Equity and bond allocations must add up to 100%.");
  }

  if (scenario.startPortfolio <= 0) {
    throw new Error("Starting portfolio must be greater than 0.");
  }

  if (scenario.annualSpending < 0) {
    throw new Error("Annual spending cannot be negative.");
  }

  if (scenario.years <= 0) {
    throw new Error("Simulation years must be greater than 0.");
  }

  if (scenario.monteCarloRuns <= 0) {
    throw new Error("Monte Carlo runs must be greater than 0.");
  }

  if (scenario.person1StatePensionAge < scenario.person1Age) {
    throw new Error("Person 1 state pension age cannot be below current age.");
  }

  if (scenario.person2StatePensionAge < scenario.person2Age) {
    throw new Error("Person 2 state pension age cannot be below current age.");
  }
}

function enableCommaFormatting(id) {
  const input = document.getElementById(id);
  if (!input) return;

  input.addEventListener("input", () => {
    const digitsOnly = removeCommas(input.value);

    if (digitsOnly === "") {
      input.value = "";
      return;
    }

    if (!/^\d*\.?\d*$/.test(digitsOnly)) {
      return;
    }

    const parts = digitsOnly.split(".");
    const integerPart = parts[0];
    const decimalPart = parts[1];

    const formattedInteger = integerPart === ""
      ? ""
      : Number(integerPart).toLocaleString("en-GB");

    input.value =
      decimalPart !== undefined
        ? `${formattedInteger}.${decimalPart}`
        : formattedInteger;
  });

  input.addEventListener("blur", () => {
    const raw = removeCommas(input.value);
    if (raw === "" || Number.isNaN(Number(raw))) return;
    input.value = formatNumberWithCommas(raw);
  });
}

function wireUpSliders() {
  const spendingInput = document.getElementById("annualSpending");
  const spendingSlider = document.getElementById("annualSpendingSlider");

  if (spendingInput && spendingSlider) {
    spendingSlider.addEventListener("input", () => {
      spendingInput.value = formatNumberWithCommas(spendingSlider.value);
    });

    spendingInput.addEventListener("input", () => {
      const raw = removeCommas(spendingInput.value);
      spendingSlider.value = raw || 0;
    });
  }

  const stockInput = document.getElementById("stockAllocation");
  const stockSlider = document.getElementById("stockAllocationSlider");

  if (stockInput && stockSlider) {
    stockSlider.addEventListener("input", () => {
      stockInput.value = stockSlider.value;
      updateBondAllocationFromStock();
    });

    stockInput.addEventListener("input", () => {
      stockSlider.value = removeCommas(stockInput.value) || 0;
      updateBondAllocationFromStock();
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  let showFullTimeline = false;

  function runFromInputs() {
    try {
      hideError();

      updateBondAllocationFromStock();

      const scenario = readScenarioFromInputs();
      validateInputScenario(scenario);

      const singleResult = runSingleSimulation(scenario);
      const monteCarlo = runMonteCarlo(scenario);

      renderSummary(monteCarlo);
      renderStressSummary(monteCarlo);
      renderCashflowChart(singleResult.records);
      renderPortfolioChart(monteCarlo.yearlyPercentiles);
      renderTable(singleResult.records, showFullTimeline);
    } catch (error) {
      showError(error.message);
    }
  }

  populateInputs(defaultScenario);
  updateBondAllocationFromStock();
  wireUpSliders();

  enableCommaFormatting("startPortfolio");
  enableCommaFormatting("annualSpending");
  enableCommaFormatting("statePensionToday");

  runFromInputs();

  const runBtn = document.getElementById("runBtn");
  if (runBtn) {
    runBtn.addEventListener("click", runFromInputs);
  }

  const resetBtn = document.getElementById("resetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      populateInputs(defaultScenario);
      updateBondAllocationFromStock();
      runFromInputs();
    });
  }

  const toggleBtn = document.getElementById("toggleTableBtn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      showFullTimeline = !showFullTimeline;
      toggleBtn.textContent = showFullTimeline
        ? "Show first 10 years"
        : "Show full timeline";
      runFromInputs();
    });
  }
});