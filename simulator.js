export const SCENARIO_NAMES = [
  "Early equity crash",
  "Lost decade",
  "Inflation spike",
  "Bond bear market",
  "Late crash",
  "Reverse sequence",
  "Stagnation",
  "Boom then bust"
];

export const DEFAULTS = {
  years: 30,
  simulationRuns: 10000,
  initialPortfolio: 1000000,
  initialSpending: 40000,
  inflationRate: 2.5,
  rebalanceAnnually: true,

  equityAllocation: 60,
  bondAllocation: 20,
  cashAllocation: 20,

  equityReturn: 7.0,
  equityVolatility: 15.0,
  bondReturn: 3.0,
  bondVolatility: 6.0,
  cashReturn: 4.0,
  cashVolatility: 1.0,

  initialWithdrawalRate: 4.0,
  upperGuardrail: 20,
  lowerGuardrail: 20,
  adjustmentPct: 10,

  person1Age: 57,
  person1PensionAge: 67,
  person1PensionAmount: 12547,
  person2Age: 58,
  person2PensionAge: 67,
  person2PensionAmount: 12547,

  skipInflationAfterNegative: true,
  seed: null
};

export function getDefaultInputs() {
  return structuredClone(DEFAULTS);
}

export function validateInputs(inputs) {
  const errors = [];
  const allocTotal = inputs.equityAllocation + inputs.bondAllocation + inputs.cashAllocation;

  if (Math.abs(allocTotal - 100) > 0.001) {
    errors.push("Equity, bond and cashlike allocations must add up to 100%.");
  }

  if (inputs.years < 1 || inputs.years > 60) {
    errors.push("Retirement period must be between 1 and 60 years.");
  }

  if (inputs.simulationRuns < 100 || inputs.simulationRuns > 50000) {
    errors.push("Monte Carlo runs must be between 100 and 50,000.");
  }

  if (inputs.initialPortfolio <= 0) {
    errors.push("Initial portfolio must be greater than zero.");
  }

  if (inputs.initialSpending < 0) {
    errors.push("Initial household spending cannot be negative.");
  }

  if (inputs.initialWithdrawalRate <= 0) {
    errors.push("Initial withdrawal rate must be greater than zero.");
  }

  if (inputs.upperGuardrail < 0 || inputs.lowerGuardrail < 0 || inputs.adjustmentPct < 0) {
    errors.push("Guardrails and adjustment size cannot be negative.");
  }

  return errors;
}

export function runRetirementSimulation(inputs) {
  const paths = new Array(inputs.simulationRuns);
  let successCount = 0;
  const baseSeed = inputs.seed == null ? randomIntSeed() : Math.trunc(inputs.seed);

  for (let i = 0; i < inputs.simulationRuns; i += 1) {
    const path = simulateRandomPath(inputs, baseSeed + i * 7919);
    paths[i] = path;
    if (!path.depleted) successCount += 1;
  }

  const percentiles = buildPercentileSeries(paths, inputs.years);
  const medianPath = findMedianPath(paths);
  const stressTests = buildStressTests(inputs);
  const worstStress = stressTests.reduce((worst, current) => {
    if (!worst) return current;
    return current.endingPortfolio < worst.endingPortfolio ? current : worst;
  }, null);

  const cashRunwayYears =
    inputs.initialSpending > 0
      ? (inputs.initialPortfolio * (inputs.cashAllocation / 100)) / inputs.initialSpending
      : 0;

  return {
    inputs,
    successRate: successCount / inputs.simulationRuns,
    percentiles,
    medianPath: medianPath.yearly,
    stressTests,
    worstStress,
    cashRunwayYears
  };
}

export function buildStressTests(inputs) {
  const scenarios = [
    buildEarlyCrashScenario(inputs.years),
    buildLostDecadeScenario(inputs.years),
    buildInflationSpikeScenario(inputs.years),
    buildBondBearScenario(inputs.years),
    buildLateCrashScenario(inputs.years),
    buildReverseSequenceScenario(inputs.years),
    buildStagnationScenario(inputs.years),
    buildBoomBustScenario(inputs.years)
  ];

  return scenarios.map((scenario, index) =>
    simulateDeterministicScenario(inputs, scenario, SCENARIO_NAMES[index])
  );
}

function simulateRandomPath(inputs, seed) {
  const random = mulberry32(seed);

  let spendingNominal = inputs.initialSpending;
  let cumulativeInflationIndex = 1;
  let equityValue = inputs.initialPortfolio * (inputs.equityAllocation / 100);
  let bondValue = inputs.initialPortfolio * (inputs.bondAllocation / 100);
  let cashValue = inputs.initialPortfolio * (inputs.cashAllocation / 100);

  const startWithdrawalRate = inputs.initialWithdrawalRate / 100;
  const upperRate = startWithdrawalRate * (1 + inputs.upperGuardrail / 100);
  const lowerRate = startWithdrawalRate * (1 - inputs.lowerGuardrail / 100);
  const adjustmentFactor = inputs.adjustmentPct / 100;
  const inflationRate = inputs.inflationRate / 100;

  const yearly = new Array(inputs.years);
  let depleted = false;

  let p1Pension = 0;
  let p2Pension = 0;
  const p1StartsInYear = Math.max(1, inputs.person1PensionAge - inputs.person1Age + 1);
  const p2StartsInYear = Math.max(1, inputs.person2PensionAge - inputs.person2Age + 1);

  for (let year = 1; year <= inputs.years; year += 1) {
    const idx = year - 1;
    const startPortfolio = equityValue + bondValue + cashValue;

    if (year > 1) {
      const previousPortfolioReturn = yearly[idx - 1].portfolioReturn;
      const shouldSkipInflation = inputs.skipInflationAfterNegative && previousPortfolioReturn < 0;
      if (!shouldSkipInflation) spendingNominal *= 1 + inflationRate;
    }

    cumulativeInflationIndex *= 1 + inflationRate;

    if (year === p1StartsInYear) {
      p1Pension = inputs.person1PensionAmount * Math.pow(1 + inflationRate, year - 1);
    } else if (year > p1StartsInYear && p1Pension > 0) {
      p1Pension *= 1 + inflationRate;
    }

    if (year === p2StartsInYear) {
      p2Pension = inputs.person2PensionAmount * Math.pow(1 + inflationRate, year - 1);
    } else if (year > p2StartsInYear && p2Pension > 0) {
      p2Pension *= 1 + inflationRate;
    }

    const statePensionNominal = p1Pension + p2Pension;
    let targetPortfolioWithdrawal = Math.max(0, spendingNominal - statePensionNominal);

    if (startPortfolio > 0) {
      const currentWithdrawalRate = targetPortfolioWithdrawal / startPortfolio;
      if (currentWithdrawalRate > upperRate) {
        targetPortfolioWithdrawal *= 1 - adjustmentFactor;
      } else if (currentWithdrawalRate < lowerRate) {
        targetPortfolioWithdrawal *= 1 + adjustmentFactor;
      }
    }

    const withdrawn = withdrawFromBuckets(equityValue, bondValue, cashValue, targetPortfolioWithdrawal);
    equityValue = withdrawn.equityValue;
    bondValue = withdrawn.bondValue;
    cashValue = withdrawn.cashValue;
    const actualPortfolioWithdrawal = withdrawn.withdrawnAmount;

    if (actualPortfolioWithdrawal < targetPortfolioWithdrawal) depleted = true;

    const equityReturn = randomNormal(inputs.equityReturn / 100, inputs.equityVolatility / 100, random);
    const bondReturn = randomNormal(inputs.bondReturn / 100, inputs.bondVolatility / 100, random);
    const cashReturn = randomNormal(inputs.cashReturn / 100, inputs.cashVolatility / 100, random);

    equityValue *= 1 + equityReturn;
    bondValue *= 1 + bondReturn;
    cashValue *= 1 + cashReturn;

    if (inputs.rebalanceAnnually) {
      const total = equityValue + bondValue + cashValue;
      if (total > 0) {
        equityValue = total * (inputs.equityAllocation / 100);
        bondValue = total * (inputs.bondAllocation / 100);
        cashValue = total * (inputs.cashAllocation / 100);
      }
    }

    const endPortfolio = Math.max(0, equityValue + bondValue + cashValue);
    const portfolioReturn =
      startPortfolio > 0
        ? (endPortfolio + actualPortfolioWithdrawal - startPortfolio) / startPortfolio
        : -1;

    yearly[idx] = {
      year,
      startPortfolio,
      endPortfolio,
      spendingNominal,
      statePensionNominal,
      portfolioWithdrawalNominal: actualPortfolioWithdrawal,
      equityReturn,
      bondReturn,
      cashReturn,
      portfolioReturn,
      inflationIndex: cumulativeInflationIndex,
      startPortfolioReal: startPortfolio / cumulativeInflationIndex,
      endPortfolioReal: endPortfolio / cumulativeInflationIndex,
      spendingReal: spendingNominal / cumulativeInflationIndex,
      statePensionReal: statePensionNominal / cumulativeInflationIndex,
      portfolioWithdrawalReal: actualPortfolioWithdrawal / cumulativeInflationIndex
    };
  }

  return {
    yearly,
    depleted,
    endingPortfolio: yearly[yearly.length - 1]?.endPortfolio ?? 0
  };
}

function simulateDeterministicScenario(inputs, scenario, name) {
  let spendingNominal = inputs.initialSpending;
  let cumulativeInflationIndex = 1;
  let equityValue = inputs.initialPortfolio * (inputs.equityAllocation / 100);
  let bondValue = inputs.initialPortfolio * (inputs.bondAllocation / 100);
  let cashValue = inputs.initialPortfolio * (inputs.cashAllocation / 100);

  const startWithdrawalRate = inputs.initialWithdrawalRate / 100;
  const upperRate = startWithdrawalRate * (1 + inputs.upperGuardrail / 100);
  const lowerRate = startWithdrawalRate * (1 - inputs.lowerGuardrail / 100);
  const adjustmentFactor = inputs.adjustmentPct / 100;

  const yearly = new Array(inputs.years);
  let depleted = false;

  let p1Pension = 0;
  let p2Pension = 0;
  const p1StartsInYear = Math.max(1, inputs.person1PensionAge - inputs.person1Age + 1);
  const p2StartsInYear = Math.max(1, inputs.person2PensionAge - inputs.person2Age + 1);

  for (let year = 1; year <= inputs.years; year += 1) {
    const idx = year - 1;
    const scenarioYear = scenario[Math.min(idx, scenario.length - 1)];
    const inflationRate = scenarioYear.inflation;
    const startPortfolio = equityValue + bondValue + cashValue;

    if (year > 1) {
      const previousPortfolioReturn = yearly[idx - 1].portfolioReturn;
      const shouldSkipInflation = inputs.skipInflationAfterNegative && previousPortfolioReturn < 0;
      if (!shouldSkipInflation) spendingNominal *= 1 + inflationRate;
    }

    cumulativeInflationIndex *= 1 + inflationRate;

    if (year === p1StartsInYear) {
      p1Pension = inputs.person1PensionAmount * Math.pow(1 + inflationRate, year - 1);
    } else if (year > p1StartsInYear && p1Pension > 0) {
      p1Pension *= 1 + inflationRate;
    }

    if (year === p2StartsInYear) {
      p2Pension = inputs.person2PensionAmount * Math.pow(1 + inflationRate, year - 1);
    } else if (year > p2StartsInYear && p2Pension > 0) {
      p2Pension *= 1 + inflationRate;
    }

    const statePensionNominal = p1Pension + p2Pension;
    let targetPortfolioWithdrawal = Math.max(0, spendingNominal - statePensionNominal);

    if (startPortfolio > 0) {
      const currentWithdrawalRate = targetPortfolioWithdrawal / startPortfolio;
      if (currentWithdrawalRate > upperRate) {
        targetPortfolioWithdrawal *= 1 - adjustmentFactor;
      } else if (currentWithdrawalRate < lowerRate) {
        targetPortfolioWithdrawal *= 1 + adjustmentFactor;
      }
    }

    const withdrawn = withdrawFromBuckets(equityValue, bondValue, cashValue, targetPortfolioWithdrawal);
    equityValue = withdrawn.equityValue;
    bondValue = withdrawn.bondValue;
    cashValue = withdrawn.cashValue;
    const actualPortfolioWithdrawal = withdrawn.withdrawnAmount;

    if (actualPortfolioWithdrawal < targetPortfolioWithdrawal) depleted = true;

    equityValue *= 1 + scenarioYear.equity;
    bondValue *= 1 + scenarioYear.bond;
    cashValue *= 1 + scenarioYear.cash;

    if (inputs.rebalanceAnnually) {
      const total = equityValue + bondValue + cashValue;
      if (total > 0) {
        equityValue = total * (inputs.equityAllocation / 100);
        bondValue = total * (inputs.bondAllocation / 100);
        cashValue = total * (inputs.cashAllocation / 100);
      }
    }

    const endPortfolio = Math.max(0, equityValue + bondValue + cashValue);
    const portfolioReturn =
      startPortfolio > 0
        ? (endPortfolio + actualPortfolioWithdrawal - startPortfolio) / startPortfolio
        : -1;

    yearly[idx] = {
      year,
      startPortfolio,
      endPortfolio,
      endPortfolioReal: endPortfolio / cumulativeInflationIndex,
      spendingNominal,
      spendingReal: spendingNominal / cumulativeInflationIndex,
      statePensionNominal,
      statePensionReal: statePensionNominal / cumulativeInflationIndex,
      portfolioWithdrawalNominal: actualPortfolioWithdrawal,
      portfolioWithdrawalReal: actualPortfolioWithdrawal / cumulativeInflationIndex,
      equityReturn: scenarioYear.equity,
      bondReturn: scenarioYear.bond,
      cashReturn: scenarioYear.cash,
      portfolioReturn
    };
  }

  return {
    name,
    depleted,
    yearly,
    endingPortfolio: yearly[yearly.length - 1]?.endPortfolio ?? 0,
    endingPortfolioReal: yearly[yearly.length - 1]?.endPortfolioReal ?? 0
  };
}

function buildPercentileSeries(paths, years) {
  const portfolio = new Array(years);
  const spending = new Array(years);

  for (let yearIndex = 0; yearIndex < years; yearIndex += 1) {
    const endNominal = new Array(paths.length);
    const endReal = new Array(paths.length);
    const spendingNominal = new Array(paths.length);
    const spendingReal = new Array(paths.length);
    const pensionNominal = new Array(paths.length);
    const pensionReal = new Array(paths.length);
    const withdrawalNominal = new Array(paths.length);
    const withdrawalReal = new Array(paths.length);

    for (let i = 0; i < paths.length; i += 1) {
      const row = paths[i].yearly[yearIndex];
      endNominal[i] = row.endPortfolio;
      endReal[i] = row.endPortfolioReal;
      spendingNominal[i] = row.spendingNominal;
      spendingReal[i] = row.spendingReal;
      pensionNominal[i] = row.statePensionNominal;
      pensionReal[i] = row.statePensionReal;
      withdrawalNominal[i] = row.portfolioWithdrawalNominal;
      withdrawalReal[i] = row.portfolioWithdrawalReal;
    }

    portfolio[yearIndex] = {
      year: yearIndex + 1,
      nominal: percentileTriplet(endNominal),
      real: percentileTriplet(endReal)
    };

    spending[yearIndex] = {
      year: yearIndex + 1,
      spendingNominal: percentileTriplet(spendingNominal),
      spendingReal: percentileTriplet(spendingReal),
      pensionNominal: percentileTriplet(pensionNominal),
      pensionReal: percentileTriplet(pensionReal),
      withdrawalNominal: percentileTriplet(withdrawalNominal),
      withdrawalReal: percentileTriplet(withdrawalReal)
    };
  }

  return { portfolio, spending };
}

function findMedianPath(paths) {
  const sorted = [...paths].sort((a, b) => a.endingPortfolio - b.endingPortfolio);
  return sorted[Math.floor(sorted.length / 2)];
}

function withdrawFromBuckets(equityValue, bondValue, cashValue, amountNeeded) {
  let remaining = amountNeeded;

  const fromCash = Math.min(cashValue, remaining);
  cashValue -= fromCash;
  remaining -= fromCash;

  const fromBonds = Math.min(bondValue, remaining);
  bondValue -= fromBonds;
  remaining -= fromBonds;

  const fromEquities = Math.min(equityValue, remaining);
  equityValue -= fromEquities;
  remaining -= fromEquities;

  return {
    equityValue,
    bondValue,
    cashValue,
    withdrawnAmount: amountNeeded - remaining
  };
}

function percentileTriplet(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p10: quantile(sorted, 0.1),
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9)
  };
}

function quantile(sortedValues, q) {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];

  const pos = (sortedValues.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;

  if (sortedValues[base + 1] !== undefined) {
    return sortedValues[base] + rest * (sortedValues[base + 1] - sortedValues[base]);
  }
  return sortedValues[base];
}

function randomNormal(mean, sd, random) {
  const u1 = Math.max(random(), 1e-12);
  const u2 = Math.max(random(), 1e-12);
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * sd;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randomIntSeed() {
  return Math.floor(Math.random() * 2147483647);
}

function buildEarlyCrashScenario(years) {
  const scenario = [];
  for (let i = 0; i < years; i += 1) {
    if (i === 0) scenario.push({ equity: -0.28, bond: 0.02, cash: 0.04, inflation: 0.03 });
    else if (i === 1) scenario.push({ equity: -0.12, bond: 0.01, cash: 0.04, inflation: 0.03 });
    else scenario.push({ equity: 0.07, bond: 0.03, cash: 0.04, inflation: 0.025 });
  }
  return scenario;
}

function buildLostDecadeScenario(years) {
  const scenario = [];
  for (let i = 0; i < years; i += 1) {
    if (i < 10) scenario.push({ equity: 0.0, bond: 0.025, cash: 0.035, inflation: 0.025 });
    else scenario.push({ equity: 0.08, bond: 0.03, cash: 0.04, inflation: 0.025 });
  }
  return scenario;
}

function buildInflationSpikeScenario(years) {
  const scenario = [];
  for (let i = 0; i < years; i += 1) {
    if (i < 3) scenario.push({ equity: -0.05, bond: -0.07, cash: 0.045, inflation: 0.08 });
    else if (i < 6) scenario.push({ equity: 0.04, bond: 0.0, cash: 0.04, inflation: 0.05 });
    else scenario.push({ equity: 0.07, bond: 0.03, cash: 0.04, inflation: 0.025 });
  }
  return scenario;
}

function buildBondBearScenario(years) {
  const scenario = [];
  for (let i = 0; i < years; i += 1) {
    if (i < 3) scenario.push({ equity: 0.02, bond: -0.12, cash: 0.04, inflation: 0.04 });
    else scenario.push({ equity: 0.07, bond: 0.03, cash: 0.04, inflation: 0.025 });
  }
  return scenario;
}

function buildLateCrashScenario(years) {
  const scenario = [];
  for (let i = 0; i < years; i += 1) {
    if (i === years - 3) scenario.push({ equity: -0.10, bond: 0.0, cash: 0.04, inflation: 0.03 });
    else if (i === years - 2) scenario.push({ equity: -0.22, bond: 0.01, cash: 0.04, inflation: 0.03 });
    else if (i === years - 1) scenario.push({ equity: -0.12, bond: 0.02, cash: 0.04, inflation: 0.03 });
    else scenario.push({ equity: 0.07, bond: 0.03, cash: 0.04, inflation: 0.025 });
  }
  return scenario;
}

function buildReverseSequenceScenario(years) {
  const scenario = [];
  for (let i = 0; i < years; i += 1) {
    if (i < 5) scenario.push({ equity: 0.14, bond: 0.05, cash: 0.04, inflation: 0.025 });
    else if (i < 10) scenario.push({ equity: 0.10, bond: 0.04, cash: 0.04, inflation: 0.025 });
    else if (i < 15) scenario.push({ equity: 0.06, bond: 0.03, cash: 0.04, inflation: 0.025 });
    else scenario.push({ equity: -0.08, bond: 0.01, cash: 0.04, inflation: 0.03 });
  }
  return scenario;
}

function buildStagnationScenario(years) {
  const scenario = [];
  for (let i = 0; i < years; i += 1) {
    scenario.push({ equity: 0.03, bond: 0.02, cash: 0.03, inflation: 0.025 });
  }
  return scenario;
}

function buildBoomBustScenario(years) {
  const scenario = [];
  for (let i = 0; i < years; i += 1) {
    if (i < 4) scenario.push({ equity: 0.16, bond: 0.04, cash: 0.04, inflation: 0.025 });
    else if (i < 7) scenario.push({ equity: -0.18, bond: -0.03, cash: 0.04, inflation: 0.04 });
    else scenario.push({ equity: 0.07, bond: 0.03, cash: 0.04, inflation: 0.025 });
  }
  return scenario;
}
