import { defaultScenario } from "./scenarios.js";
import { runSingleSimulation, runMonteCarlo } from "./simulator.js";

function formatCurrency(value) {
  return `£${Math.round(value).toLocaleString("en-GB")}`;
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
let ruinChartInstance = null;

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

function renderRuinChart(depletionProbabilityByYear) {
  if (ruinChartInstance) {
    ruinChartInstance.destroy();
  }

  ruinChartInstance = buildChart("ruinChart", {
    type: "line",
    data: {
      labels: depletionProbabilityByYear.map((r) => `Year ${r.year}`),
      datasets: [
        {
          label: "Probability of depletion",
          data: depletionProbabilityByYear.map((r) => r.probability * 100),
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
          beginAtZero: true,
          max: 100,
          ticks: {
            callback(value) {
              return `${value}%`;
            }
          }
        }
      }
    }
  });
}

window.addEventListener("DOMContentLoaded", () => {
  const singleResult = runSingleSimulation(defaultScenario);
  const monteCarlo = runMonteCarlo(defaultScenario);

  let showFullTimeline = false;

  renderSummary(monteCarlo);
  renderCashflowChart(singleResult.records);
  renderPortfolioChart(monteCarlo.yearlyPercentiles);
  renderRuinChart(monteCarlo.depletionProbabilityByYear);
  renderTable(singleResult.records, showFullTimeline);

  const toggleBtn = document.getElementById("toggleTableBtn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      showFullTimeline = !showFullTimeline;
      toggleBtn.textContent = showFullTimeline
        ? "Show first 10 years"
        : "Show full timeline";
      renderTable(singleResult.records, showFullTimeline);
    });
  }
});