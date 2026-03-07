import { defaultScenario, stressTestLibrary } from "./scenarios.js";
import { buildScenarioFromInputs, runMonteCarlo, runSingleSimulation, runStressTests } from "./simulator.js";

const state = {
  charts: {},
  currentScenario: null,
};

const els = {};

function byId(id) {
  return document.getElementById(id);
}

function formatCurrency(value) {
  return `£${Math.round(value).toLocaleString("en-GB")}`;
}

function formatNumber(value) {
  return Math.round(value).toLocaleString("en-GB");
}

function formatPercentFromRatio(value, decimals = 1) {
  return `${(value * 100).toFixed(decimals)}%`;
}

function formatPlainPercent(value, decimals = 1) {
  return `${Number(value).toFixed(decimals)}%`;
}

function removeCommas(value) {
  return String(value).replace(/,/g, "");
}

function formatInputInteger(el, value) {
  el.value = Number(value).toLocaleString("en-GB");
}

function formatDisplayValue(isReal, nominal, real) {
  return isReal ? real : nominal;
}

function getFormInputs() {
  return {
    startPortfolio: Number(removeCommas(els.startPortfolio.value)),
    annualSpending: Number(removeCommas(els.annualSpending.value)),
    years: Number(els.years.value),
    inflation: Number(els.inflation.value),
    stockAllocation: Number(els.stockAllocation.value),
    bondAllocation: 100 - Number(els.stockAllocation.value),
    stockReturn: Number(els.stockReturn.value),
    stockVol: Number(els.stockVol.value),
    bondReturn: Number(els.bondReturn.value),
    bondVol: Number(els.bondVol.value),
    person1Age: Number(els.person1Age.value),
    person2Age: Number(els.person2Age.value),
    person1StatePensionAge: Number(els.person1StatePensionAge.value),
    person2StatePensionAge: Number(els.person2StatePensionAge.value),
    statePensionToday: Number(removeCommas(els.statePensionToday.value)),
    monteCarloRuns: Number(removeCommas(els.monteCarloRuns.value)),
    seed: Number(els.seed.value),
    upperGuardrail: Number(els.upperGuardrail.value),
    lowerGuardrail: Number(els.lowerGuardrail.value),
    cutPct: Number(els.cutPct.value),
    raisePct: Number(els.raisePct.value),
    skipInflationAfterNegativeReturn: els.skipInflationAfterNegativeReturn.checked,
  };
}

function validateInputs(inputs) {
  if (inputs.startPortfolio <= 0) return "Starting portfolio must be above zero.";
  if (inputs.annualSpending <= 0) return "Annual spending must be above zero.";
  if (inputs.stockAllocation < 0 || inputs.stockAllocation > 100) return "Equity allocation must be between 0 and 100.";
  if (inputs.monteCarloRuns < 100) return "Monte Carlo runs should be at least 100.";
  if (inputs.years < 1) return "Simulation years must be at least 1.";
  if (inputs.lowerGuardrail <= 0 || inputs.upperGuardrail <= 0) return "Guardrails must be above zero.";
  if (inputs.lowerGuardrail >= inputs.upperGuardrail) return "Lower guardrail must be below upper guardrail.";
  return null;
}

function showError(message) {
  els.errorBox.style.display = message ? "block" : "none";
  els.errorBox.textContent = message || "";
}

function populateDefaults() {
  formatInputInteger(els.startPortfolio, defaultScenario.startPortfolio);
  formatInputInteger(els.annualSpending, defaultScenario.annualSpending);
  els.annualSpendingSlider.value = defaultScenario.annualSpending;
  els.years.value = defaultScenario.years;
  els.inflation.value = (defaultScenario.inflation * 100).toFixed(1);
  els.stockAllocation.value = defaultScenario.stockAllocation * 100;
  els.stockAllocationSlider.value = defaultScenario.stockAllocation * 100;
  els.bondAllocation.value = defaultScenario.bondAllocation * 100;
  els.stockReturn.value = (defaultScenario.assumptions.stockReturn * 100).toFixed(1);
  els.stockVol.value = (defaultScenario.assumptions.stockVol * 100).toFixed(1);
  els.bondReturn.value = (defaultScenario.assumptions.bondReturn * 100).toFixed(1);
  els.bondVol.value = (defaultScenario.assumptions.bondVol * 100).toFixed(1);
  els.person1Age.value = defaultScenario.person1Age;
  els.person2Age.value = defaultScenario.person2Age;
  els.person1StatePensionAge.value = defaultScenario.person1StatePensionAge;
  els.person2StatePensionAge.value = defaultScenario.person2StatePensionAge;
  formatInputInteger(els.statePensionToday, defaultScenario.statePensionToday);
  formatInputInteger(els.monteCarloRuns, defaultScenario.monteCarloRuns);
  els.seed.value = defaultScenario.seed;
  els.upperGuardrail.value = defaultScenario.rules.upperGuardrail.toFixed(2);
  els.lowerGuardrail.value = defaultScenario.rules.lowerGuardrail.toFixed(2);
  els.cutPct.value = defaultScenario.rules.cutPct * 100;
  els.raisePct.value = defaultScenario.rules.raisePct * 100;
  els.skipInflationAfterNegativeReturn.checked = defaultScenario.rules.skipInflationAfterNegativeReturn;
  els.showRealValues.checked = false;
  els.showFullTimeline.checked = false;
}

function bindElements() {
  [
    "startPortfolio", "annualSpending", "annualSpendingSlider", "years", "inflation", "stockAllocation",
    "stockAllocationSlider", "bondAllocation", "stockReturn", "stockVol", "bondReturn", "bondVol",
    "person1Age", "person2Age", "person1StatePensionAge", "person2StatePensionAge",
    "statePensionToday", "monteCarloRuns", "seed", "upperGuardrail", "lowerGuardrail",
    "cutPct", "raisePct", "skipInflationAfterNegativeReturn", "runBtn", "resetBtn",
    "showRealValues", "showFullTimeline", "summary", "stressSummary", "stressTable", "results-table",
    "errorBox", "heroPill", "stressScenarioCount"
  ].forEach((id) => {
    els[id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = byId(id);
  });

  els.cashflowChart = byId("cashflowChart");
  els.portfolioChart = byId("portfolioChart");
  els.failureChart = byId("failureChart");
  els.stressChart = byId("stressChart");
}

function attachInputFormatting() {
  [els.startPortfolio, els.annualSpending, els.statePensionToday, els.monteCarloRuns].forEach((input) => {
    input.addEventListener("blur", () => {
      const n = Number(removeCommas(input.value));
      if (!Number.isNaN(n) && n !== 0) input.value = n.toLocaleString("en-GB");
    });
  });

  els.stockAllocationSlider.addEventListener("input", () => {
    els.stockAllocation.value = els.stockAllocationSlider.value;
    els.bondAllocation.value = 100 - Number(els.stockAllocation.value);
  });

  els.stockAllocation.addEventListener("input", () => {
    const value = Math.max(0, Math.min(100, Number(els.stockAllocation.value) || 0));
    els.stockAllocation.value = value;
    els.stockAllocationSlider.value = value;
    els.bondAllocation.value = 100 - value;
  });

  els.annualSpendingSlider.addEventListener("input", () => {
    formatInputInteger(els.annualSpending, Number(els.annualSpendingSlider.value));
  });
}

function renderMetricCards(cards, targetEl) {
  targetEl.innerHTML = cards.map((card) => `
    <article class="metric-card ${card.tone || ""}">
      <div class="metric-label">${card.label}</div>
      <div class="metric-value">${card.value}</div>
      ${card.sub ? `<div class="metric-sub">${card.sub}</div>` : ""}
    </article>
  `).join("");
}

function renderSummary(monteCarlo, isReal) {
  renderMetricCards([
    {
      label: "Success rate",
      value: formatPercentFromRatio(monteCarlo.successRate),
      sub: "Runs that did not deplete within the selected horizon",
      tone: monteCarlo.successRate >= 0.8 ? "metric-good" : "metric-bad",
    },
    {
      label: "Median ending value",
      value: formatCurrency(formatDisplayValue(isReal, monteCarlo.medianEndingValue, monteCarlo.medianEndingValueReal)),
      sub: isReal ? "Median outcome in today’s money" : "Median nominal outcome",
    },
    {
      label: "P10 ending value",
      value: formatCurrency(formatDisplayValue(isReal, monteCarlo.p10EndingValue, monteCarlo.p10EndingValueReal)),
      sub: "Downside decile outcome",
    },
    {
      label: "P90 ending value",
      value: formatCurrency(formatDisplayValue(isReal, monteCarlo.p90EndingValue, monteCarlo.p90EndingValueReal)),
      sub: "Upside decile outcome",
    },
    {
      label: "Worst ending value",
      value: formatCurrency(formatDisplayValue(isReal, monteCarlo.worstEndingValue, monteCarlo.worstEndingValueReal)),
      sub: "Worst simulated path ending value",
      tone: "metric-bad",
    },
    {
      label: "Monte Carlo runs",
      value: formatNumber(monteCarlo.runs),
      sub: "Seeded for repeatable results",
    },
  ], els.summary);
}

function renderStressSummary(monteCarlo, stressResults, isReal) {
  const failedScenarios = stressResults.filter((r) => r.failureYear !== null).length;
  const worstScenario = [...stressResults].sort((a, b) => {
    const aValue = formatDisplayValue(isReal, a.endingValue, a.endingValueReal);
    const bValue = formatDisplayValue(isReal, b.endingValue, b.endingValueReal);
    return aValue - bValue;
  })[0];

  renderMetricCards([
    {
      label: "Average GK cuts",
      value: monteCarlo.downside.averageCutsPerRun.toFixed(2),
      sub: "Average cuts per Monte Carlo run",
    },
    {
      label: "Average GK raises",
      value: monteCarlo.downside.averageRaisesPerRun.toFixed(2),
      sub: "Average raises per Monte Carlo run",
    },
    {
      label: "Inflation skips",
      value: monteCarlo.downside.averageInflationSkipsPerRun.toFixed(2),
      sub: "Average skipped upratings per run",
    },
    {
      label: "Worst stress outcome",
      value: worstScenario ? worstScenario.name : "—",
      sub: worstScenario ? formatCurrency(formatDisplayValue(isReal, worstScenario.endingValue, worstScenario.endingValueReal)) : "—",
      tone: "metric-bad",
    },
    {
      label: "Stress failures",
      value: `${failedScenarios}/${stressResults.length}`,
      sub: failedScenarios ? "At least one deterministic path depleted" : "All deterministic paths survived",
      tone: failedScenarios ? "metric-bad" : "metric-good",
    },
    {
      label: "Earliest depletion",
      value: monteCarlo.downside.earliestDepletionYear ? `Year ${monteCarlo.downside.earliestDepletionYear}` : "None",
      sub: monteCarlo.downside.medianFailureYear ? `Median failed run in year ${Math.round(monteCarlo.downside.medianFailureYear)}` : "No failed Monte Carlo runs",
      tone: monteCarlo.downside.earliestDepletionYear ? "metric-bad" : "metric-good",
    },
  ], els.stressSummary);
}

function destroyChart(name) {
  if (state.charts[name]) state.charts[name].destroy();
}

function lineChart(ctx, config) {
  return new Chart(ctx, {
    type: "line",
    data: config.data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      elements: {
        line: { tension: 0.28 },
        point: { radius: 0 },
      },
      plugins: {
        legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 10 } },
        tooltip: {
          callbacks: {
            label(item) {
              const y = item.raw;
              if (typeof y === "number") {
                if (config.percent) return `${item.dataset.label}: ${y.toFixed(1)}%`;
                return `${item.dataset.label}: ${formatCurrency(y)}`;
              }
              return item.dataset.label;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(160, 174, 192, 0.12)" },
          ticks: { maxTicksLimit: 8 },
        },
        y: {
          grid: { color: "rgba(160, 174, 192, 0.16)" },
          ticks: {
            callback(value) {
              return config.percent ? `${value}%` : formatCurrency(value);
            },
          },
        },
      },
    },
  });
}

function renderCashflowChart(records, isReal) {
  destroyChart("cashflow");
  state.charts.cashflow = lineChart(els.cashflowChart, {
    data: {
      labels: records.map((row) => `Year ${row.year}`),
      datasets: [
        { label: "Household spending", data: records.map((r) => formatDisplayValue(isReal, r.spendingTarget, r.spendingTargetReal)), borderWidth: 3 },
        { label: "State pension income", data: records.map((r) => formatDisplayValue(isReal, r.statePensionIncome, r.statePensionIncomeReal)), borderWidth: 3 },
        { label: "Portfolio withdrawals", data: records.map((r) => formatDisplayValue(isReal, r.withdrawal, r.withdrawalReal)), borderWidth: 3 },
      ],
    },
  });
}

function renderPortfolioChart(monteCarlo, isReal) {
  destroyChart("portfolio");
  const convert = (arr) => arr.map((value, idx) => {
    if (!isReal) return value;
    const inflationFactor = (1 + state.currentScenario.inflation) ** (idx + 1);
    return value / inflationFactor;
  });
  state.charts.portfolio = lineChart(els.portfolioChart, {
    data: {
      labels: monteCarlo.percentilePaths.p50.map((_, idx) => `Year ${idx + 1}`),
      datasets: [
        { label: "P10 path", data: convert(monteCarlo.percentilePaths.p10), borderWidth: 2 },
        { label: "Median path", data: convert(monteCarlo.percentilePaths.p50), borderWidth: 3 },
        { label: "P90 path", data: convert(monteCarlo.percentilePaths.p90), borderWidth: 2 },
      ],
    },
  });
}

function renderFailureChart(monteCarlo) {
  destroyChart("failure");
  state.charts.failure = lineChart(els.failureChart, {
    percent: true,
    data: {
      labels: monteCarlo.failureProbabilityByYear.map((_, idx) => `Year ${idx + 1}`),
      datasets: [{ label: "Probability of depletion", data: monteCarlo.failureProbabilityByYear.map((v) => v * 100), borderWidth: 3 }],
    },
  });
}

function renderStressChart(stressResults, isReal) {
  destroyChart("stress");
  state.charts.stress = lineChart(els.stressChart, {
    data: {
      labels: stressResults[0].portfolioPath.map((_, idx) => `Year ${idx + 1}`),
      datasets: stressResults.map((result) => ({
        label: result.name,
        data: result.records.map((row) => formatDisplayValue(isReal, row.endPortfolio, row.endPortfolioReal)),
        borderWidth: ["early-crash", "deep-bear-start", "inflation-shock"].includes(result.key) ? 3 : 2,
      })),
    },
  });
}

function renderStressTable(stressResults, isReal) {
  const rows = stressResults.map((result) => {
    const endValue = formatDisplayValue(isReal, result.endingValue, result.endingValueReal);
    const worstPoint = Math.min(...result.records.map((r) => formatDisplayValue(isReal, r.endPortfolio, r.endPortfolioReal)));
    return `
      <tr>
        <td><span class="stress-badge">${result.name}</span></td>
        <td>${result.description}</td>
        <td>${formatCurrency(endValue)}</td>
        <td>${formatCurrency(worstPoint)}</td>
        <td>${result.failureYear ? `Year ${result.failureYear}` : "Survived"}</td>
        <td>${result.cuts}</td>
        <td>${result.raises}</td>
        <td>${result.inflationSkips}</td>
      </tr>
    `;
  }).join("");

  els.stressTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Scenario</th>
          <th>Description</th>
          <th>Ending value</th>
          <th>Worst point</th>
          <th>Failure year</th>
          <th>GK cuts</th>
          <th>GK raises</th>
          <th>Inflation skips</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderTable(records, showFullTimeline, isReal) {
  const rows = (showFullTimeline ? records : records.slice(0, 12)).map((row) => `
    <tr>
      <td>${row.year}</td>
      <td>${row.age1}</td>
      <td>${row.age2}</td>
      <td>${formatCurrency(formatDisplayValue(isReal, row.startPortfolio, row.startPortfolioReal))}</td>
      <td>${formatCurrency(formatDisplayValue(isReal, row.spendingTarget, row.spendingTargetReal))}</td>
      <td>${formatCurrency(formatDisplayValue(isReal, row.statePensionIncome, row.statePensionIncomeReal))}</td>
      <td>${formatCurrency(formatDisplayValue(isReal, row.withdrawal, row.withdrawalReal))}</td>
      <td>${formatPercentFromRatio(row.returnPct)}</td>
      <td>${formatCurrency(formatDisplayValue(isReal, row.endPortfolio, row.endPortfolioReal))}</td>
      <td>${formatPlainPercent(row.inflationRate * 100)}</td>
      <td>${row.events.join(", ") || "—"}</td>
    </tr>
  `).join("");

  els.resultsTable.innerHTML = `
    <thead>
      <tr>
        <th>Year</th>
        <th>Age 1</th>
        <th>Age 2</th>
        <th>Start portfolio</th>
        <th>Spending target</th>
        <th>State pension</th>
        <th>Withdrawal</th>
        <th>Return</th>
        <th>End portfolio</th>
        <th>Inflation</th>
        <th>Events</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

function run() {
  const inputs = getFormInputs();
  const error = validateInputs(inputs);
  showError(error);
  if (error) return;

  const scenario = buildScenarioFromInputs(inputs);
  state.currentScenario = scenario;
  const monteCarlo = runMonteCarlo(scenario);
  const baseRun = runSingleSimulation(scenario, {
    stockReturns: Array.from({ length: scenario.years }, () => scenario.assumptions.stockReturn),
    bondReturns: Array.from({ length: scenario.years }, () => scenario.assumptions.bondReturn),
  });
  const stressResults = runStressTests(scenario);
  const isReal = els.showRealValues.checked;

  els.heroPill.textContent = isReal ? "Real values" : "Nominal values";
  els.stressScenarioCount.textContent = `${stressTestLibrary.length} scenarios`;
  renderSummary(monteCarlo, isReal);
  renderStressSummary(monteCarlo, stressResults, isReal);
  renderCashflowChart(baseRun.records, isReal);
  renderPortfolioChart(monteCarlo, isReal);
  renderFailureChart(monteCarlo);
  renderStressChart(stressResults, isReal);
  renderStressTable(stressResults, isReal);
  renderTable(baseRun.records, els.showFullTimeline.checked, isReal);
}

function initialise() {
  bindElements();
  populateDefaults();
  attachInputFormatting();

  els.runBtn.addEventListener("click", run);
  els.resetBtn.addEventListener("click", () => {
    populateDefaults();
    run();
  });
  els.showRealValues.addEventListener("change", run);
  els.showFullTimeline.addEventListener("change", run);

  run();
}

initialise();
