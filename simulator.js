import { buildStressScenarios } from "./scenarios.js";

export const DEFAULT_INPUTS = {
  years: 35,
  initialPortfolio: 1000000,
  initialSpending: 40000,
  equityAllocation: 60,
  bondAllocation: 25,
  cashlikeAllocation: 15,
  rebalanceToTarget: true,
  equityReturn: 7.0,
  equityVolatility: 18.0,
  bondReturn: 3.0,
  bondVolatility: 7.0,
  cashlikeReturn: 4.0,
  cashlikeVolatility: 1.5,
  inflation: 2.5,
  person1Age: 57,
  person1PensionAge: 67,
  person1PensionToday: 12547,
  person2Age: 58,
  person2PensionAge: 67,
  person2PensionToday: 12547,
  upperGuardrail: 20,
  lowerGuardrail: 20,
  adjustmentSize: 10,
  monteCarloRuns: 10000,
  seed: null,
  skipInflationAfterNegative: false,
  showRealValues: true,
  showFullTable: true
};

export function validateInputs(inputs) {
  const errors = [];

  const numericChecks = [
    ["Retirement years", inputs.years],
    ["Initial portfolio", inputs.initialPortfolio],
    ["Initial household spending", inputs.initialSpending],
    ["Equity allocation", inputs.equityAllocation],
    ["Bond allocation", inputs.bondAllocation],
    ["Cashlike allocation", inputs.cashlikeAllocation],
    ["Equity return", inputs.equityReturn],
    ["Equity volatility", inputs.equityVolatility],
    ["Bond return", inputs.bondReturn],
    ["Bond volatility", inputs.bondVolatility],
    ["Cashlike return", inputs.cashlikeReturn],
    ["Cashlike volatility", inputs.cashlikeVolatility],
    ["Inflation", inputs.inflation],
    ["Person 1 age", inputs.person1Age],
    ["Person 1 pension age", inputs.person1PensionAge],
    ["Person 1 pension today", inputs.person1PensionToday],
    ["Person 2 age", inputs.person2Age],
    ["Person 2 pension age", inputs.person2PensionAge],
    ["Person 2 pension today", inputs.person2PensionToday],
    ["Upper guardrail", inputs.upperGuardrail],
    ["Lower guardrail", inputs.lowerGuardrail],
    ["Adjustment size", inputs.adjustmentSize],
    ["Monte Carlo runs", inputs.monteCarloRuns]
  ];

  for (const [label, value] of numericChecks) {
    if (!Number.isFinite(value)) {
      errors.push(`${label} must be a valid number.`);
    }
  }

  if (!Number.isInteger(inputs.years) || inputs.years < 1 || inputs.years > 80) {
    errors.push("Retirement years must be a whole number between 1 and 80.");
  }

  const allocationTotal =
    inputs.equityAllocation + inputs.bondAllocation + inputs.cashlikeAllocation;

  if (Math.abs(allocationTotal - 100) > 0.01) {
    errors.push("Equity, bond and cashlike allocations must add up to 100%.");
  }

  if (inputs.initialPortfolio <= 0) {
    errors.push("Initial portfolio must be greater than zero.");
  }

  if (inputs.initialSpending < 0) {
    errors.push("Initial household spending cannot be negative.");
  }

  if (inputs.monteCarloRuns < 100 || inputs.monteCarloRuns > 200000) {
    errors.push("Monte Carlo runs must be between 100 and 200,000.");
  }

  if (inputs.equityVolatility < 0 || inputs.bondVolatility < 0 || inputs.cashlikeVolatility < 0) {
    errors.push("Volatility assumptions cannot be negative.");
  }

  if (inputs.inflation < 0) {
    errors.push("Inflation cannot be negative.");
  }

  if (inputs.person1Age < 18 || inputs.person2Age < 18) {
    errors.push("Current ages must be at least 18.");
  }

  if (inputs.person1PensionAge < 18 || inputs.person2PensionAge < 18) {
    errors.push("Pension ages must be at least 18.");
  }

  if (inputs.person1PensionToday < 0 || inputs.person2PensionToday < 0) {
    errors.push("State pension amounts cannot be negative.");
  }

  if (inputs.upperGuardrail < 0 || inputs.lowerGuardrail < 0 || inputs.adjustmentSize < 0) {
    errors.push("Guardrails and adjustment size cannot be negative.");
  }

  if (inputs.seed !== null && !Number.isInteger(inputs.seed)) {
    errors.push("Seed must be a whole number when provided.");
  }

  return errors;
}

export function runRetirementSimulation(rawInputs) {
  const inputs = sanitiseInputs(rawInputs);
  const validationErrors = validateInputs(inputs);

  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join(" "));
  }

  const baseCase = runSinglePath(inputs, {
    type: "deterministic"
  });

  const stressScenarios = buildStressScenarios(inputs.years, inputs);
  const stressTests = stressScenarios.map((scenario) =>
    runSinglePath(inputs, {
      type: "scenario",
      scenario
    })
  );

  const monteCarlo = runMonteCarlo(inputs);

  const worstStress = stressTests.reduce((worst, current) => {
    if (!worst) return current;
    return current.terminalNominal < worst.terminalNominal ? current : worst;
  }, null);

  const immediatePensionOffset =
    pensionForYear(inputs.person1Age, inputs.person1PensionAge, inputs.person1PensionToday, 1) +
    pensionForYear(inputs.person2Age, inputs.person2PensionAge, inputs.person2PensionToday, 1);

  const startingNetWithdrawal = Math.max(0, inputs.initialSpending - immediatePensionOffset);
  const startingCashlike = inputs.initialPortfolio * (inputs.cashlikeAllocation / 100);

  return {
    inputs,
    baseCase,
    stressTests,
    monteCarlo,
    summary: {
      cashRunwayYears:
        startingNetWithdrawal > 0 ? startingCashlike / startingNetWithdrawal : Number.POSITIVE_INFINITY,
      worstStressName: worstStress ? worstStress.name : "—",
      worstStressTerminalNominal: worstStress ? worstStress.terminalNominal : 0,
      worstStressTerminalReal: worstStress ? worstStress.terminalReal : 0
    }
  };
}

function sanitiseInputs(inputs) {
  return {
    ...DEFAULT_INPUTS,
    ...inputs,
    years: toInt(inputs.years, DEFAULT_INPUTS.years),
    initialPortfolio: toNumber(inputs.initialPortfolio, DEFAULT_INPUTS.initialPortfolio),
    initialSpending: toNumber(inputs.initialSpending, DEFAULT_INPUTS.initialSpending),
    equityAllocation: toNumber(inputs.equityAllocation, DEFAULT_INPUTS.equityAllocation),
    bondAllocation: toNumber(inputs.bondAllocation, DEFAULT_INPUTS.bondAllocation),
    cashlikeAllocation: toNumber(inputs.cashlikeAllocation, DEFAULT_INPUTS.cashlikeAllocation),
    rebalanceToTarget: Boolean(inputs.rebalanceToTarget),
    equityReturn: toNumber(inputs.equityReturn, DEFAULT_INPUTS.equityReturn) / 100,
    equityVolatility: toNumber(inputs.equityVolatility, DEFAULT_INPUTS.equityVolatility) / 100,
    bondReturn: toNumber(inputs.bondReturn, DEFAULT_INPUTS.bondReturn) / 100,
    bondVolatility: toNumber(inputs.bondVolatility, DEFAULT_INPUTS.bondVolatility) / 100,
    cashlikeReturn: toNumber(inputs.cashlikeReturn, DEFAULT_INPUTS.cashlikeReturn) / 100,
    cashlikeVolatility: toNumber(inputs.cashlikeVolatility, DEFAULT_INPUTS.cashlikeVolatility) / 100,
    inflation: toNumber(inputs.inflation, DEFAULT_INPUTS.inflation) / 100,
    person1Age: toInt(inputs.person1Age, DEFAULT_INPUTS.person1Age),
    person1PensionAge: toInt(inputs.person1PensionAge, DEFAULT_INPUTS.person1PensionAge),
    person1PensionToday: toNumber(inputs.person1PensionToday, DEFAULT_INPUTS.person1PensionToday),
    person2Age: toInt(inputs.person2Age, DEFAULT_INPUTS.person2Age),
    person2PensionAge: toInt(inputs.person2PensionAge, DEFAULT_INPUTS.person2PensionAge),
    person2PensionToday: toNumber(inputs.person2PensionToday, DEFAULT_INPUTS.person2PensionToday),
    upperGuardrail: toNumber(inputs.upperGuardrail, DEFAULT_INPUTS.upperGuardrail) / 100,
    lowerGuardrail: toNumber(inputs.lowerGuardrail, DEFAULT_INPUTS.lowerGuardrail) / 100,
    adjustmentSize: toNumber(inputs.adjustmentSize, DEFAULT_INPUTS.adjustmentSize) / 100,
    monteCarloRuns: toInt(inputs.monteCarloRuns, DEFAULT_INPUTS.monteCarloRuns),
    seed:
      inputs.seed === null || inputs.seed === undefined || inputs.seed === ""
        ? null
        : toInt(inputs.seed, DEFAULT_INPUTS.seed ?? 1),
    skipInflationAfterNegative: Boolean(inputs.skipInflationAfterNegative),
    showRealValues: Boolean(inputs.showRealValues),
    showFullTable: Boolean(inputs.showFullTable)
  };
}

function runMonteCarlo(inputs) {
  const yearCount = inputs.years;
  const runCount = inputs.monteCarloRuns;
  const nominalPathsByYear = Array.from({ length: yearCount + 1 }, () => []);
  const realPathsByYear = Array.from({ length: yearCount + 1 }, () => []);
  let successCount = 0;

  for (let runIndex = 0; runIndex < runCount; runIndex += 1) {
    const seedBase = inputs.seed === null ? null : inputs.seed + runIndex;
    const rng = createRng(seedBase);
    const path = runSinglePath(inputs, {
      type: "montecarlo",
      rng
    });

    if (!path.depleted) {
      successCount += 1;
    }

    nominalPathsByYear[0].push(inputs.initialPortfolio);
    realPathsByYear[0].push(inputs.initialPortfolio);

    path.rows.forEach((row, index) => {
      nominalPathsByYear[index + 1].push(row.endPortfolioNominal);
      realPathsByYear[index + 1].push(row.endPortfolioReal);
    });
  }

  return {
    runs: runCount,
    successRate: successCount / runCount,
    nominalPercentiles: buildPercentileSeries(nominalPathsByYear),
    realPercentiles: buildPercentileSeries(realPathsByYear)
  };
}

function buildPercentileSeries(pathsByYear) {
  return {
    p10: pathsByYear.map((values) => percentile(values, 0.1)),
    p50: pathsByYear.map((values) => percentile(values, 0.5)),
    p90: pathsByYear.map((values) => percentile(values, 0.9))
  };
}

function runSinglePath(inputs, mode) {
  const targets = {
    equity: inputs.equityAllocation / 100,
    bond: inputs.bondAllocation / 100,
    cashlike: inputs.cashlikeAllocation / 100
  };

  let balances = {
    equity: inputs.initialPortfolio * targets.equity,
    bond: inputs.initialPortfolio * targets.bond,
    cashlike: inputs.initialPortfolio * targets.cashlike
  };

  const rows = [];
  const initialWithdrawalRate = inputs.initialSpending / inputs.initialPortfolio;
  let spending = inputs.initialSpending;
  let depleted = false;
  let depletionYear = null;
  let inflationIndex = 1;
  let previousPortfolioReturn = null;

  for (let yearIndex = 0; yearIndex < inputs.years; yearIndex += 1) {
    const yearNumber = yearIndex + 1;
    const startPortfolio = totalPortfolio(balances);

    const inflationRate = getYearInflationRate(inputs, mode, yearIndex);

    if (yearIndex > 0) {
      const skipInflation =
        inputs.skipInflationAfterNegative && previousPortfolioReturn !== null && previousPortfolioReturn < 0;

      if (!skipInflation) {
        spending *= 1 + inflationRate;
      }

      if (startPortfolio > 0) {
        const currentWithdrawalRate = spending / startPortfolio;
        if (currentWithdrawalRate > initialWithdrawalRate * (1 + inputs.upperGuardrail)) {
          spending *= 1 - inputs.adjustmentSize;
        } else if (currentWithdrawalRate < initialWithdrawalRate * (1 - inputs.lowerGuardrail)) {
          spending *= 1 + inputs.adjustmentSize;
        }
      }
    }

    const statePension1 = pensionForYear(
      inputs.person1Age + yearIndex,
      inputs.person1PensionAge,
      inputs.person1PensionToday,
      inflationIndex
    );
    const statePension2 = pensionForYear(
      inputs.person2Age + yearIndex,
      inputs.person2PensionAge,
      inputs.person2PensionToday,
      inflationIndex
    );

    const totalStatePension = statePension1 + statePension2;
    const withdrawalNeeded = Math.max(0, spending - totalStatePension);

    const startBalancesBeforeWithdrawal = { ...balances };
    const withdrawalActual = withdrawFromBuckets(balances, withdrawalNeeded);

    if (withdrawalActual < withdrawalNeeded && !depleted) {
      depleted = true;
      depletionYear = yearNumber;
    }

    const afterWithdrawalTotal = totalPortfolio(balances);
    const returns = getYearAssetReturns(inputs, mode, yearIndex);
    const weightedReturnBeforeGrowth = weightedReturn(balances, returns);

    balances = {
      equity: Math.max(0, balances.equity * (1 + returns.equity)),
      bond: Math.max(0, balances.bond * (1 + returns.bond)),
      cashlike: Math.max(0, balances.cashlike * (1 + returns.cashlike))
    };

    if (inputs.rebalanceToTarget) {
      balances = rebalance(balances, targets);
    }

    const endPortfolio = totalPortfolio(balances);
    const inflationIndexAfterYear = inflationIndex * (1 + inflationRate);

    rows.push({
      year: yearNumber,
      age1: inputs.person1Age + yearIndex,
      age2: inputs.person2Age + yearIndex,
      startPortfolioNominal: startPortfolio,
      endPortfolioNominal: endPortfolio,
      spendingNominal: spending,
      statePensionNominal: totalStatePension,
      withdrawalNominal: withdrawalActual,
      inflationRate,
      equityReturn: returns.equity,
      bondReturn: returns.bond,
      cashlikeReturn: returns.cashlike,
      portfolioReturn: afterWithdrawalTotal > 0 ? weightedReturnBeforeGrowth : 0,
      startPortfolioReal: startPortfolio / inflationIndex,
      endPortfolioReal: endPortfolio / inflationIndexAfterYear,
      spendingReal: spending / inflationIndex,
      statePensionReal: totalStatePension / inflationIndex,
      withdrawalReal: withdrawalActual / inflationIndex
    });

    previousPortfolioReturn = afterWithdrawalTotal > 0 ? weightedReturnBeforeGrowth : 0;
    inflationIndex = inflationIndexAfterYear;

    if (depleted) {
      balances = { equity: 0, bond: 0, cashlike: 0 };
    }

    void startBalancesBeforeWithdrawal;
  }

  const pathNominal = [inputs.initialPortfolio, ...rows.map((row) => row.endPortfolioNominal)];
  const pathReal = [inputs.initialPortfolio, ...rows.map((row) => row.endPortfolioReal)];

  return {
    name: mode.type === "scenario" ? mode.scenario.name : "Base case",
    rows,
    pathNominal,
    pathReal,
    terminalNominal: rows.length > 0 ? rows[rows.length - 1].endPortfolioNominal : inputs.initialPortfolio,
    terminalReal: rows.length > 0 ? rows[rows.length - 1].endPortfolioReal : inputs.initialPortfolio,
    depleted,
    depletionYear
  };
}

function getYearInflationRate(inputs, mode, yearIndex) {
  if (mode.type === "scenario") {
    return mode.scenario.inflationRates[yearIndex] ?? inputs.inflation;
  }

  if (mode.type === "montecarlo") {
    return clamp(randomNormal(mode.rng, inputs.inflation, Math.max(0.0025, inputs.inflation * 0.35)), -0.01, 0.12);
  }

  return inputs.inflation;
}

function getYearAssetReturns(inputs, mode, yearIndex) {
  if (mode.type === "scenario") {
    return {
      equity: mode.scenario.equityReturns[yearIndex] ?? inputs.equityReturn,
      bond: mode.scenario.bondReturns[yearIndex] ?? inputs.bondReturn,
      cashlike: mode.scenario.cashlikeReturns[yearIndex] ?? inputs.cashlikeReturn
    };
  }

  if (mode.type === "montecarlo") {
    return {
      equity: clamp(randomNormal(mode.rng, inputs.equityReturn, inputs.equityVolatility), -0.95, 1.5),
      bond: clamp(randomNormal(mode.rng, inputs.bondReturn, inputs.bondVolatility), -0.6, 0.6),
      cashlike: clamp(randomNormal(mode.rng, inputs.cashlikeReturn, inputs.cashlikeVolatility), -0.1, 0.2)
    };
  }

  return {
    equity: inputs.equityReturn,
    bond: inputs.bondReturn,
    cashlike: inputs.cashlikeReturn
  };
}

function pensionForYear(currentAge, pensionAge, pensionToday, inflationIndex) {
  if (currentAge < pensionAge) {
    return 0;
  }

  return pensionToday * inflationIndex;
}

function withdrawFromBuckets(balances, amountNeeded) {
  let remaining = amountNeeded;
  let withdrawn = 0;
  const order = ["cashlike", "bond", "equity"];

  for (const bucket of order) {
    if (remaining <= 0) break;
    const available = balances[bucket];
    const take = Math.min(available, remaining);
    balances[bucket] -= take;
    withdrawn += take;
    remaining -= take;
  }

  return withdrawn;
}

function rebalance(balances, targets) {
  const total = totalPortfolio(balances);

  return {
    equity: total * targets.equity,
    bond: total * targets.bond,
    cashlike: total * targets.cashlike
  };
}

function weightedReturn(balances, returns) {
  const total = totalPortfolio(balances);
  if (total <= 0) return 0;

  return (
    (balances.equity / total) * returns.equity +
    (balances.bond / total) * returns.bond +
    (balances.cashlike / total) * returns.cashlike
  );
}

function totalPortfolio(balances) {
  return balances.equity + balances.bond + balances.cashlike;
}

function percentile(values, p) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function createRng(seed) {
  if (seed === null || seed === undefined) {
    return Math.random;
  }

  let state = (seed >>> 0) || 1;

  return function rng() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomNormal(rng, mean, standardDeviation) {
  let u = 0;
  let v = 0;

  while (u === 0) u = rng();
  while (v === 0) v = rng();

  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * standardDeviation;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toInt(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}