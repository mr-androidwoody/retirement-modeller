import { stressTestLibrary } from "./scenarios.js";

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function normalFromUniform(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function quantile(sortedValues, p) {
  if (!sortedValues.length) return 0;
  const idx = (sortedValues.length - 1) * p;
  const low = Math.floor(idx);
  const high = Math.ceil(idx);
  if (low === high) return sortedValues[low];
  const weight = idx - low;
  return sortedValues[low] * (1 - weight) + sortedValues[high] * weight;
}

function percentileByYear(paths, p) {
  if (!paths.length) return [];
  const years = paths[0].length;
  const result = [];
  for (let i = 0; i < years; i += 1) {
    const sorted = paths.map((path) => path[i]).sort((a, b) => a - b);
    result.push(quantile(sorted, p));
  }
  return result;
}

function blendedReturn(stockAllocation, stockReturn, bondReturn) {
  return stockAllocation * stockReturn + (1 - stockAllocation) * bondReturn;
}

function realValue(nominal, inflationFactor) {
  return nominal / inflationFactor;
}

export function buildScenarioFromInputs(inputs) {
  return {
    startPortfolio: inputs.startPortfolio,
    years: inputs.years,
    stockAllocation: inputs.stockAllocation / 100,
    bondAllocation: inputs.bondAllocation / 100,
    annualSpending: inputs.annualSpending,
    inflation: inputs.inflation / 100,
    statePensionToday: inputs.statePensionToday,
    person1Age: inputs.person1Age,
    person2Age: inputs.person2Age,
    person1StatePensionAge: inputs.person1StatePensionAge,
    person2StatePensionAge: inputs.person2StatePensionAge,
    monteCarloRuns: inputs.monteCarloRuns,
    seed: inputs.seed,
    rules: {
      upperGuardrail: inputs.upperGuardrail,
      lowerGuardrail: inputs.lowerGuardrail,
      cutPct: inputs.cutPct / 100,
      raisePct: inputs.raisePct / 100,
      skipInflationAfterNegativeReturn: inputs.skipInflationAfterNegativeReturn,
    },
    assumptions: {
      stockReturn: inputs.stockReturn / 100,
      stockVol: inputs.stockVol / 100,
      bondReturn: inputs.bondReturn / 100,
      bondVol: inputs.bondVol / 100,
    },
  };
}

export function runSingleSimulation(scenario, customPath = null) {
  const records = [];
  const portfolioPath = [];
  const failureProbabilityPath = [];

  let portfolio = scenario.startPortfolio;
  let annualSpending = scenario.annualSpending;
  let inflationFactor = 1;
  let previousReturn = null;
  let cuts = 0;
  let raises = 0;
  let inflationSkips = 0;
  let failureYear = null;

  for (let year = 1; year <= scenario.years; year += 1) {
    const age1 = scenario.person1Age + (year - 1);
    const age2 = scenario.person2Age + (year - 1);
    const events = [];
    const startPortfolio = portfolio;

    const inflationRate = customPath?.inflationPath?.[year - 1] ?? scenario.inflation;
    const pensionPerPerson = scenario.statePensionToday * inflationFactor;
    const statePensionIncome =
      (age1 >= scenario.person1StatePensionAge ? pensionPerPerson : 0) +
      (age2 >= scenario.person2StatePensionAge ? pensionPerPerson : 0);

    if (year > 1) {
      if (!(scenario.rules.skipInflationAfterNegativeReturn && previousReturn !== null && previousReturn < 0)) {
        annualSpending *= 1 + inflationRate;
      } else {
        inflationSkips += 1;
        events.push("Inflation skipped");
      }
    }

    const withdrawalRate = startPortfolio > 0 ? annualSpending / startPortfolio : Infinity;
    const baseRate = scenario.annualSpending / scenario.startPortfolio;

    if (withdrawalRate > baseRate * scenario.rules.upperGuardrail) {
      annualSpending *= 1 - scenario.rules.cutPct;
      cuts += 1;
      events.push("GK cut");
    } else if (withdrawalRate < baseRate * scenario.rules.lowerGuardrail) {
      annualSpending *= 1 + scenario.rules.raisePct;
      raises += 1;
      events.push("GK raise");
    }

    const withdrawal = Math.max(annualSpending - statePensionIncome, 0);
    const stockReturn = customPath?.stockReturns?.[year - 1] ?? scenario.assumptions.stockReturn;
    const bondReturn = customPath?.bondReturns?.[year - 1] ?? scenario.assumptions.bondReturn;
    const portfolioReturn = blendedReturn(scenario.stockAllocation, stockReturn, bondReturn);
    const endPortfolio = Math.max((startPortfolio - withdrawal) * (1 + portfolioReturn), 0);

    if (endPortfolio === 0 && failureYear === null) {
      failureYear = year;
      events.push("Depleted");
    }

    records.push({
      year,
      age1,
      age2,
      startPortfolio,
      spendingTarget: annualSpending,
      statePensionIncome,
      withdrawal,
      returnPct: portfolioReturn,
      endPortfolio,
      inflationRate,
      inflationFactor,
      startPortfolioReal: realValue(startPortfolio, inflationFactor),
      spendingTargetReal: realValue(annualSpending, inflationFactor),
      statePensionIncomeReal: realValue(statePensionIncome, inflationFactor),
      withdrawalReal: realValue(withdrawal, inflationFactor),
      endPortfolioReal: realValue(endPortfolio, inflationFactor),
      events,
    });

    portfolioPath.push(endPortfolio);
    failureProbabilityPath.push(endPortfolio === 0 ? 1 : 0);
    portfolio = endPortfolio;
    previousReturn = portfolioReturn;
    inflationFactor *= 1 + inflationRate;
  }

  return {
    records,
    endingValue: records.at(-1)?.endPortfolio ?? 0,
    endingValueReal: records.at(-1)?.endPortfolioReal ?? 0,
    worstValue: Math.min(...portfolioPath, scenario.startPortfolio),
    success: portfolio > 0,
    failureYear,
    cuts,
    raises,
    inflationSkips,
    portfolioPath,
    failureProbabilityPath,
  };
}

export function runMonteCarlo(scenario) {
  const runs = [];
  const portfolioPaths = [];
  const failureFlagsByYear = Array.from({ length: scenario.years }, () => []);
  const rng = mulberry32(Number(scenario.seed) || 12345);

  for (let i = 0; i < scenario.monteCarloRuns; i += 1) {
    const stockReturns = [];
    const bondReturns = [];

    for (let year = 0; year < scenario.years; year += 1) {
      stockReturns.push(scenario.assumptions.stockReturn + scenario.assumptions.stockVol * normalFromUniform(rng));
      bondReturns.push(scenario.assumptions.bondReturn + scenario.assumptions.bondVol * normalFromUniform(rng));
    }

    const result = runSingleSimulation(scenario, { stockReturns, bondReturns });
    runs.push(result);
    portfolioPaths.push(result.portfolioPath);

    for (let year = 0; year < scenario.years; year += 1) {
      const hasFailedByYear = result.failureYear !== null && result.failureYear <= year + 1 ? 1 : 0;
      failureFlagsByYear[year].push(hasFailedByYear);
    }
  }

  const endingValues = runs.map((run) => run.endingValue).sort((a, b) => a - b);
  const endingValuesReal = runs.map((run) => run.endingValueReal).sort((a, b) => a - b);
  const failureYears = runs.map((run) => run.failureYear).filter((value) => value !== null).sort((a, b) => a - b);
  const successCount = runs.filter((run) => run.success).length;

  return {
    runs: scenario.monteCarloRuns,
    successRate: successCount / scenario.monteCarloRuns,
    medianEndingValue: quantile(endingValues, 0.5),
    medianEndingValueReal: quantile(endingValuesReal, 0.5),
    p10EndingValue: quantile(endingValues, 0.1),
    p10EndingValueReal: quantile(endingValuesReal, 0.1),
    p90EndingValue: quantile(endingValues, 0.9),
    p90EndingValueReal: quantile(endingValuesReal, 0.9),
    worstEndingValue: endingValues[0] ?? 0,
    worstEndingValueReal: endingValuesReal[0] ?? 0,
    percentilePaths: {
      p10: percentileByYear(portfolioPaths, 0.1),
      p50: percentileByYear(portfolioPaths, 0.5),
      p90: percentileByYear(portfolioPaths, 0.9),
    },
    downside: {
      averageCutsPerRun: runs.reduce((sum, run) => sum + run.cuts, 0) / scenario.monteCarloRuns,
      averageRaisesPerRun: runs.reduce((sum, run) => sum + run.raises, 0) / scenario.monteCarloRuns,
      averageInflationSkipsPerRun: runs.reduce((sum, run) => sum + run.inflationSkips, 0) / scenario.monteCarloRuns,
      earliestDepletionYear: failureYears.length ? failureYears[0] : null,
      medianFailureYear: failureYears.length ? quantile(failureYears, 0.5) : null,
    },
    failureProbabilityByYear: failureFlagsByYear.map((yearFlags) => yearFlags.reduce((a, b) => a + b, 0) / yearFlags.length),
    representativeRun: runs[Math.floor(runs.length / 2)],
  };
}

export function runStressTests(scenario) {
  return stressTestLibrary.map((test) => {
    const result = runSingleSimulation(scenario, test);
    return {
      ...test,
      ...result,
    };
  });
}
