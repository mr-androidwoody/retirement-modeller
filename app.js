import { defaultScenario } from "./scenarios.js";
import { runSingleSimulation, runMonteCarlo } from "./simulator.js";

window.addEventListener("DOMContentLoaded", () => {
  const single = runSingleSimulation(defaultScenario);
  const monteCarlo = runMonteCarlo(defaultScenario);

  const summaryEl = document.getElementById("summary");
  const tableEl = document.getElementById("results-table");

  if (summaryEl) {
    summaryEl.innerHTML = `
      <p><strong>Monte Carlo runs:</strong> ${monteCarlo.runs}</p>
      <p><strong>Success rate:</strong> ${(monteCarlo.successRate * 100).toFixed(1)}%</p>
      <p><strong>Median ending value:</strong> £${Math.round(monteCarlo.medianEndingValue).toLocaleString("en-GB")}</p>
      <p><strong>P10 ending value:</strong> £${Math.round(monteCarlo.p10EndingValue).toLocaleString("en-GB")}</p>
      <p><strong>P90 ending value:</strong> £${Math.round(monteCarlo.p90EndingValue).toLocaleString("en-GB")}</p>
    `;
  }

  if (tableEl) {
    const rows = single
      .slice(0, 10)
      .map(
        (row) => `
          <tr>
            <td>${row.year}</td>
            <td>${row.age1}</td>
            <td>${row.age2}</td>
            <td>£${Math.round(row.startPortfolio).toLocaleString("en-GB")}</td>
            <td>£${Math.round(row.spendingTarget).toLocaleString("en-GB")}</td>
            <td>£${Math.round(row.statePensionIncome).toLocaleString("en-GB")}</td>
            <td>£${Math.round(row.withdrawal).toLocaleString("en-GB")}</td>
            <td>${(row.returnPct * 100).toFixed(1)}%</td>
            <td>£${Math.round(row.endPortfolio).toLocaleString("en-GB")}</td>
            <td>${row.events.join(", ")}</td>
          </tr>
        `
      )
      .join("");

    tableEl.innerHTML = `
      <table border="1" cellpadding="6" cellspacing="0">
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
});