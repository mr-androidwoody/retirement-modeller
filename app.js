import { DEFAULT_INPUTS, runRetirementSimulation, validateInputs } from "./simulator.js";

const formattedIntegerFieldIds = [
  "initialPortfolio",
  "initialSpending",
  "person1PensionToday",
  "person2PensionToday",
  "monteCarloRuns",
  "seed"
];

const els = {
  years: document.getElementById("years"),
  initialPortfolio: document.getElementById("initialPortfolio"),
  initialSpending: document.getElementById("initialSpending"),
  equityAllocation: document.getElementById("equityAllocation"),
  bondAllocation: document.getElementById("bondAllocation"),
  cashlikeAllocation: document.getElementById("cashlikeAllocation"),
  rebalanceToTarget: document.getElementById("rebalanceToTarget"),
  equityReturn: document.getElementById("equityReturn"),
  equityVolatility: document.getElementById("equityVolatility"),
  bondReturn: document.getElementById("bondReturn"),
  bondVolatility: document.getElementById("bondVolatility"),
  cashlikeReturn: document.getElementById("cashlikeReturn"),
  cashlikeVolatility: document.getElementById("cashlikeVolatility"),
  inflation: document.getElementById("inflation"),
  person1Age: document.getElementById("person1Age"),
  person1PensionAge: document.getElementById("person1PensionAge"),
  person1PensionToday: document.getElementById("person1PensionToday"),
  person2Age: document.getElementById("person2Age"),
  person2PensionAge: document.getElementById("person2PensionAge"),
  person2PensionToday: document.getElementById("person2PensionToday"),
  upperGuardrail: document.getElementById("upperGuardrail"),
  lowerGuardrail: document.getElementById("lowerGuardrail"),
  adjustmentSize: document.getElementById("adjustmentSize"),
  monteCarloRuns: document.getElementById("monteCarloRuns"),
  seed: document.getElementById("seed"),
  skipInflationAfterNegative: document.getElementById("skipInflationAfterNegative"),
  showRealValues: document.getElementById("showRealValues"),
  showFullTable: document.getElementById("showFullTable"),
  runSimulationBtn: document.getElementById("runSimulationBtn"),
  resetDefaultsBtn: document.getElementById("resetDefaultsBtn"),
  errorBox: document.getElementById("errorBox"),
  summarySuccessRate: document.getElementById("summarySuccessRate"),
  summaryMedianEnd: document.getElementById("summaryMedianEnd"),
  summaryWorstStress: document.getElementById("summaryWorstStress"),
  summaryWorstStressDesc: document.getElementById("summaryWorstStressDesc"),
  summaryCashRunway: document.getElementById("summaryCashRunway"),
  portfolioChart: document.getElementById("portfolioChart"),
  spendingChart: document.getElementById("spendingChart"),
  tableCard: document.getElementById("tableCard"),
  resultsTable: document.getElementById("resultsTable")
};

let worker = null;
let latestResult = null;

initialise();

function initialise() {
  setupWorker();
  applyDefaults();
  attachFormatting();
  attachEvents();
  runSimulation();
}

function setupWorker() {
  try {
    worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });

    worker.onmessage = (event) => {
      setBusy(false);

      if (!event.data?.ok) {
        showError(event.data?.error || "Simulation failed.");
        return;
      }

      latestResult = event.data.result;
      hideError();
      renderAll();
    };

    worker.onerror = () => {
      worker = null;
      setBusy(false);
      showError("Web Worker failed to load. Falling back to main-thread simulation.");
    };
  } catch {
    worker = null;
  }
}

function applyDefaults() {
  setFieldValue("years", DEFAULT_INPUTS.years);
  setFieldValue("initialPortfolio", DEFAULT_INPUTS.initialPortfolio, true);
  setFieldValue("initialSpending", DEFAULT_INPUTS.initialSpending, true);
  setFieldValue("equityAllocation", DEFAULT_INPUTS.equityAllocation);
  setFieldValue("bondAllocation", DEFAULT_INPUTS.bondAllocation);
  setFieldValue("cashlikeAllocation", DEFAULT_INPUTS.cashlikeAllocation);
  els.rebalanceToTarget.checked = DEFAULT_INPUTS.rebalanceToTarget;
  setFieldValue("equityReturn", DEFAULT_INPUTS.equityReturn);
  setFieldValue("equityVolatility", DEFAULT_INPUTS.equityVolatility);
  setFieldValue("bondReturn", DEFAULT_INPUTS.bondReturn);
  setFieldValue("bondVolatility", DEFAULT_INPUTS.bondVolatility);
  setFieldValue("cashlikeReturn", DEFAULT_INPUTS.cashlikeReturn);
  setFieldValue("cashlikeVolatility", DEFAULT_INPUTS.cashlikeVolatility);
  setFieldValue("inflation", DEFAULT_INPUTS.inflation);
  setFieldValue("person1Age", DEFAULT_INPUTS.person1Age);
  setFieldValue("person1PensionAge", DEFAULT_INPUTS.person1PensionAge);
  setFieldValue("person1PensionToday", DEFAULT_INPUTS.person1PensionToday, true);
  setFieldValue("person2Age", DEFAULT_INPUTS.person2Age);
  setFieldValue("person2PensionAge", DEFAULT_INPUTS.person2PensionAge);
  setFieldValue("person2PensionToday", DEFAULT_INPUTS.person2PensionToday, true);
  setFieldValue("upperGuardrail", DEFAULT_INPUTS.upperGuardrail);
  setFieldValue("lowerGuardrail", DEFAULT_INPUTS.lowerGuardrail);
  setFieldValue("adjustmentSize", DEFAULT_INPUTS.adjustmentSize);
  setFieldValue("monteCarloRuns", DEFAULT_INPUTS.monteCarloRuns, true);
  els.seed.value = "";
  els.skipInflationAfterNegative.checked = DEFAULT_INPUTS.skipInflationAfterNegative;
  els.showRealValues.checked = DEFAULT_INPUTS.showRealValues;
  els.showFullTable.checked = DEFAULT_INPUTS.showFullTable;
  toggleTableVisibility();
}

function attachFormatting() {
  formattedIntegerFieldIds.forEach((fieldId) => {
    const input = els[fieldId];
    if (!input) return;

    input.addEventListener("focus", () => {
      input.value = unformatNumberString(input.value);
    });

    input.addEventListener("blur", () => {
      if (fieldId === "seed" && input.value.trim() === "") {
        input.value = "";
        return;
      }

      const value = parseLooseNumber(input.value);
      input.value = Number.isFinite(value) ? formatInteger(value) : "";
    });
  });
}

function attachEvents() {
  els.runSimulationBtn.addEventListener("click", runSimulation);

  els.resetDefaultsBtn.addEventListener("click", () => {
    applyDefaults();
    runSimulation();
  });

  els.showRealValues.addEventListener("change", () => {
    if (!latestResult) return;
    renderAll();
  });

  els.showFullTable.addEventListener("change", () => {
    toggleTableVisibility();
  });

  window.addEventListener("resize", debounce(() => {
    if (latestResult) {
      renderCharts();
    }
  }, 100));
}

function setFieldValue(id, value, formatAsInteger = false) {
  if (!els[id]) return;
  els[id].value = formatAsInteger ? formatInteger(value) : String(value);
}

function gatherInputs() {
  return {
    years: parseLooseInteger(els.years.value),
    initialPortfolio: parseLooseNumber(els.initialPortfolio.value),
    initialSpending: parseLooseNumber(els.initialSpending.value),
    equityAllocation: parseLooseNumber(els.equityAllocation.value),
    bondAllocation: parseLooseNumber(els.bondAllocation.value),
    cashlikeAllocation: parseLooseNumber(els.cashlikeAllocation.value),
    rebalanceToTarget: els.rebalanceToTarget.checked,
    equityReturn: parseLooseNumber(els.equityReturn.value),
    equityVolatility: parseLooseNumber(els.equityVolatility.value),
    bondReturn: parseLooseNumber(els.bondReturn.value),
    bondVolatility: parseLooseNumber(els.bondVolatility.value),
    cashlikeReturn: parseLooseNumber(els.cashlikeReturn.value),
    cashlikeVolatility: parseLooseNumber(els.cashlikeVolatility.value),
    inflation: parseLooseNumber(els.inflation.value),
    person1Age: parseLooseInteger(els.person1Age.value),
    person1PensionAge: parseLooseInteger(els.person1PensionAge.value),
    person1PensionToday: parseLooseNumber(els.person1PensionToday.value),
    person2Age: parseLooseInteger(els.person2Age.value),
    person2PensionAge: parseLooseInteger(els.person2PensionAge.value),
    person2PensionToday: parseLooseNumber(els.person2PensionToday.value),
    upperGuardrail: parseLooseNumber(els.upperGuardrail.value),
    lowerGuardrail: parseLooseNumber(els.lowerGuardrail.value),
    adjustmentSize: parseLooseNumber(els.adjustmentSize.value),
    monteCarloRuns: parseLooseInteger(els.monteCarloRuns.value),
    seed: els.seed.value.trim() === "" ? null : parseLooseInteger(els.seed.value),
    skipInflationAfterNegative: els.skipInflationAfterNegative.checked,
    showRealValues: els.showRealValues.checked,
    showFullTable: els.showFullTable.checked
  };
}

function runSimulation() {
  const inputs = gatherInputs();
  const errors = validateInputs({ ...DEFAULT_INPUTS, ...inputs });

  if (errors.length > 0) {
    showError(errors.join(" "));
    return;
  }

  hideError();
  setBusy(true);

  if (worker) {
    worker.postMessage({ type: "run", inputs });
    return;
  }

  try {
    latestResult = runRetirementSimulation(inputs);
    setBusy(false);
    renderAll();
  } catch (error) {
    setBusy(false);
    showError(error instanceof Error ? error.message : "Simulation failed.");
  }
}

function renderAll() {
  toggleTableVisibility();
  renderSummary();
  renderCharts();
  renderTable();
}

function renderSummary() {
  const useReal = els.showRealValues.checked;
  const percentileSeries = useReal
    ? latestResult.monteCarlo.realPercentiles
    : latestResult.monteCarlo.nominalPercentiles;

  const medianEnd = percentileSeries.p50[percentileSeries.p50.length - 1];
  const hasStressSummary = latestResult.summary && latestResult.summary.worstStressName;

  els.summarySuccessRate.textContent = formatPercent(latestResult.monteCarlo.successRate);
  els.summaryMedianEnd.textContent = formatCurrency(medianEnd);

  if (hasStressSummary) {
    els.summaryWorstStress.textContent = latestResult.summary.worstStressName;
    els.summaryWorstStressDesc.textContent = `Lowest ending portfolio across the deterministic stress paths: ${formatCurrency(
      useReal ? latestResult.summary.worstStressTerminalReal : latestResult.summary.worstStressTerminalNominal
    )}.`;
  } else {
    els.summaryWorstStress.textContent = "Removed";
    els.summaryWorstStressDesc.textContent = "Deterministic stress scenarios are no longer shown in the UI.";
  }

  const runway = latestResult.summary?.cashRunwayYears;
  els.summaryCashRunway.textContent =
    runway === Number.POSITIVE_INFINITY ? "No draw" : formatYears(runway);
}

function renderCharts() {
  renderPortfolioChart();
  renderSpendingChart();
}

function renderPortfolioChart() {
  const useReal = els.showRealValues.checked;
  const percentileSeries = useReal
    ? latestResult.monteCarlo.realPercentiles
    : latestResult.monteCarlo.nominalPercentiles;
  const basePath = useReal ? latestResult.baseCase.pathReal : latestResult.baseCase.pathNominal;
  const labels = buildYearLabels(latestResult.inputs.years);

  drawLineChart(els.portfolioChart, {
    labels,
    band: {
      lower: percentileSeries.p10,
      upper: percentileSeries.p90,
      fillStyle: "rgba(45, 91, 255, 0.15)"
    },
    lines: [
      {
        label: "Median Monte Carlo",
        values: percentileSeries.p50,
        color: "#2d5bff",
        width: 3
      },
      {
        label: "Deterministic base case",
        values: basePath,
        color: "#0f766e",
        width: 2.5
      }
    ],
    yFormatter: formatCurrency
  });
}

function renderSpendingChart() {
  const useReal = els.showRealValues.checked;
  const rows = latestResult.baseCase.rows;

  drawLineChart(els.spendingChart, {
    labels: rows.map((row) => row.year),
    lines: [
      {
        label: "Total household spending",
        values: rows.map((row) => useReal ? row.spendingReal : row.spendingNominal),
        color: "#6d28d9",
        width: 3
      },
      {
        label: "State pension income",
        values: rows.map((row) => useReal ? row.statePensionReal : row.statePensionNominal),
        color: "#15803d",
        width: 2.5
      },
      {
        label: "Portfolio withdrawals",
        values: rows.map((row) => useReal ? row.withdrawalReal : row.withdrawalNominal),
        color: "#dc2626",
        width: 2.5
      }
    ],
    yFormatter: formatCurrency
  });
}

function renderTable() {
  if (!els.resultsTable || !latestResult?.baseCase?.rows) return;

  const useReal = els.showRealValues.checked;
  const rows = latestResult.baseCase.rows;
  const thead = els.resultsTable.querySelector("thead");
  const tbody = els.resultsTable.querySelector("tbody");

  thead.innerHTML = `
    <tr>
      <th>Year</th>
      <th>Age 1</th>
      <th>Age 2</th>
      <th>Start portfolio</th>
      <th>Household spending</th>
      <th>State pension</th>
      <th>Portfolio withdrawal</th>
      <th>End portfolio</th>
    </tr>
  `;

  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.year}</td>
      <td>${row.age1}</td>
      <td>${row.age2}</td>
      <td>${formatCurrency(useReal ? row.startPortfolioReal : row.startPortfolioNominal)}</td>
      <td>${formatCurrency(useReal ? row.spendingReal : row.spendingNominal)}</td>
      <td>${formatCurrency(useReal ? row.statePensionReal : row.statePensionNominal)}</td>
      <td>${formatCurrency(useReal ? row.withdrawalReal : row.withdrawalNominal)}</td>
      <td>${formatCurrency(useReal ? row.endPortfolioReal : row.endPortfolioNominal)}</td>
    </tr>
  `).join("");
}

function toggleTableVisibility() {
  els.tableCard.classList.toggle("hidden", !els.showFullTable.checked);
}

function setBusy(isBusy) {
  els.runSimulationBtn.disabled = isBusy;
  els.resetDefaultsBtn.disabled = isBusy;
  els.runSimulationBtn.textContent = isBusy ? "Running..." : "Run simulation";
}

function showError(message) {
  els.errorBox.style.display = "block";
  els.errorBox.textContent = message;
}

function hideError() {
  els.errorBox.style.display = "none";
  els.errorBox.textContent = "";
}

function parseLooseNumber(value) {
  const cleaned = String(value ?? "").replace(/,/g, "").trim();
  if (cleaned === "") return NaN;
  return Number(cleaned);
}

function parseLooseInteger(value) {
  const numeric = parseLooseNumber(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : NaN;
}

function unformatNumberString(value) {
  return String(value ?? "").replace(/,/g, "");
}

function formatInteger(value) {
  if (!Number.isFinite(value)) return "";
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 0
  }).format(value);
}

function formatCurrency(value) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0
  }).format(value);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatYears(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)} years`;
}

function buildYearLabels(years) {
  return Array.from({ length: years + 1 }, (_, index) => index);
}

function drawLineChart(canvas, config) {
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width));
  const height = canvas.height || 320;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const padding = { top: 20, right: 20, bottom: 56, left: 110 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const allValues = [];

  if (config.band) {
    allValues.push(...config.band.lower, ...config.band.upper);
  }

  config.lines.forEach((line) => {
    allValues.push(...line.values);
  });

  const minY = 0;
  const maxY = niceMax(Math.max(...allValues, 1));

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  drawGrid(ctx, width, height, padding, minY, maxY, config.yFormatter);

  if (config.band) {
    drawBand(ctx, config.band.lower, config.band.upper, {
      width: plotWidth,
      height: plotHeight,
      left: padding.left,
      top: padding.top,
      minY,
      maxY,
      fill: config.band.fillStyle
    });
  }

  config.lines.forEach((line) => {
    drawSeries(ctx, line.values, {
      width: plotWidth,
      height: plotHeight,
      left: padding.left,
      top: padding.top,
      minY,
      maxY,
      color: line.color,
      lineWidth: line.width || 2
    });
  });

  drawXAxis(ctx, config.labels, width, height, padding);
  drawLegend(ctx, config.lines, width, height);
}

function drawGrid(ctx, width, height, padding, minY, maxY, yFormatter) {
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const steps = 5;

  ctx.strokeStyle = "#d7deea";
  ctx.fillStyle = "#657086";
  ctx.lineWidth = 1;
  ctx.font = "12px Inter, system-ui, sans-serif";

  for (let i = 0; i <= steps; i += 1) {
    const ratio = i / steps;
    const y = padding.top + plotHeight - ratio * plotHeight;
    const value = minY + ratio * (maxY - minY);

    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + plotWidth, y);
    ctx.stroke();

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(yFormatter(value), padding.left - 10, y);
  }

  ctx.strokeStyle = "#9aa9c2";
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + plotHeight);
  ctx.lineTo(padding.left + plotWidth, padding.top + plotHeight);
  ctx.stroke();
}

function drawBand(ctx, lower, upper, opts) {
  const count = Math.max(lower.length, upper.length);
  if (count < 2) return;

  ctx.beginPath();

  for (let i = 0; i < upper.length; i += 1) {
    const x = opts.left + (i / (count - 1)) * opts.width;
    const y = scaleY(upper[i], opts.minY, opts.maxY, opts.top, opts.height);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  for (let i = lower.length - 1; i >= 0; i -= 1) {
    const x = opts.left + (i / (count - 1)) * opts.width;
    const y = scaleY(lower[i], opts.minY, opts.maxY, opts.top, opts.height);
    ctx.lineTo(x, y);
  }

  ctx.closePath();
  ctx.fillStyle = opts.fill;
  ctx.fill();
}

function drawSeries(ctx, values, opts) {
  if (!values || values.length < 2) return;

  ctx.beginPath();

  values.forEach((value, index) => {
    const x = opts.left + (index / (values.length - 1)) * opts.width;
    const y = scaleY(value, opts.minY, opts.maxY, opts.top, opts.height);

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.strokeStyle = opts.color;
  ctx.lineWidth = opts.lineWidth;
  ctx.stroke();
}

function drawXAxis(ctx, labels, width, height, padding) {
  const plotWidth = width - padding.left - padding.right;
  const bottom = height - padding.bottom;
  const tickCount = Math.min(6, labels.length - 1);
  const lastIndex = labels.length - 1;

  ctx.fillStyle = "#657086";
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  for (let i = 0; i <= tickCount; i += 1) {
    const ratio = i / tickCount;
    const index = Math.round(ratio * lastIndex);
    const x = padding.left + ratio * plotWidth;

    ctx.beginPath();
    ctx.moveTo(x, bottom);
    ctx.lineTo(x, bottom + 6);
    ctx.strokeStyle = "#9aa9c2";
    ctx.stroke();

    ctx.fillText(String(labels[index]), x, bottom + 10);
  }
}

function drawLegend(ctx, lines, width, height) {
  const startX = 20;
  let x = startX;
  let y = height - 18;
  const boxSize = 12;
  const gap = 8;
  const itemSpacing = 16;
  const rowHeight = 20;

  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  lines.forEach((line) => {
    const labelWidth = ctx.measureText(line.label).width;
    const itemWidth = boxSize + gap + labelWidth;

    if (x + itemWidth > width - 20) {
      x = startX;
      y -= rowHeight;
    }

    const boxY = y - boxSize / 2;

    ctx.fillStyle = line.color;
    ctx.fillRect(x, boxY, boxSize, boxSize);

    ctx.fillStyle = "#657086";
    ctx.fillText(line.label, x + boxSize + gap, y);

    x += itemWidth + itemSpacing;
  });
}

function scaleY(value, minY, maxY, top, height) {
  if (maxY === minY) {
    return top + height / 2;
  }

  const ratio = (value - minY) / (maxY - minY);
  return top + height - ratio * height;
}

function niceMax(value) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

function debounce(fn, wait) {
  let timeoutId = null;

  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), wait);
  };
}