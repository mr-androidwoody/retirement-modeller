const SCENARIO_NAMES = [
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
  simulationRuns: 3000,
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
  person2PensionAmount: 12547
};

export function getDefaultInputs() {
  return structuredClone(DEFAULTS);
}

export function validateInputs(inputs) {
  const errors = [];

  const allocTotal =
    inputs.equityAllocation + inputs.bondAllocation + inputs.cashAllocation;

  if (Math.abs(allocTotal - 100) > 0.001) {
    errors.push("Equity, bond and cash allocations must add up to 100%.");
  }

  if (inputs.years < 1 || inputs.years > 60) {
    errors.push("Retirement period must be between 1 and 60 years.");
  }

  if (inputs.simulationRuns < 100 || inputs.simulationRuns > 20000) {
    errors.push("Monte Carlo runs must be between 100 and 20,000.");
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

  if (inputs.upperGuardrail < 0 || inputs.lowerGuardrail < 0) {
    errors.push("Guardrails cannot be negative.");
  }

  if (inputs.adjustmentPct < 0) {
    errors.push("Adjustment size cannot be negative.");
  }

  return errors;
}

export function runRetirementSimulation(inputs) {
  const paths = [];
  let successCount = 0;

  for (let i = 0; i < inputs.simulationRuns; i += 1) {
    const path = simulateMonteCarloPath(inputs, i + 1);
    paths.push(path);
    if (!path.depleted) successCount += 1;
  }

  const percentiles = buildPercentileSeries(paths, inputs.years);
  const medianPath = findMedianPath(paths);
  const stressTests = runStressTests(inputs);

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
    medianPath,
    stressTests,
    worstStress,
    cashRunwayYears,
    scenarioNames: SCENARIO_NAMES
  };
}

function simulateMonteCarloPath(inputs, seedIndex) {
  const random = mulberry32(987654 + seedIndex * 7919);

  let spendingNominal = inputs.initialSpending;
  let cumulativeInflationIndex = 1;

  let equityValue = inputs.initialPortfolio * (inputs.equityAllocation / 100);
  let bondValue = inputs.initialPortfolio * (inputs.bondAllocation / 100);
  let cashValue = inputs.initialPortfolio * (inputs.cashAllocation / 100);

  const startingWithdrawalRate = inputs.initialWithdrawalRate / 100;
  const upperRate = startingWithdrawalRate * (1 + inputs.upperGuardrail / 100);
  const lowerRate = startingWithdrawalRate * (1 - inputs.lowerGuardrail / 100);
  const adjustmentFactor = inputs.adjustmentPct / 100;
  const inflationRate = inputs.inflationRate / 100;

  const yearly = [];
  let depleted = false;
  let depletionYear = null;

  for (let year = 1; year <= inputs.years; year += 1) {
    const startPortfolio = equityValue + bondValue + cashValue;

    if (year > 1) {
      const shouldSkipInflation =
        inputs.skipInflationAfterNegative && yearly[yearly.length - 1].portfolioReturn < 0;

      if (!shouldSkipInflation) {
        spendingNominal *= 1 + inflationRate;
      }
    }

    cumulativeInflationIndex *= 1 + inflationRate;

    const statePensionNominal = computeHouseholdPension(inputs, year, inflationRate);
    let targetPortfolioWithdrawal = Math.max(0, spendingNominal - statePensionNominal);

    if (startPortfolio > 0) {
      const currentWithdrawalRate = targetPortfolioWithdrawal / startPortfolio;

      if (currentWithdrawalRate > upperRate) {
        targetPortfolioWithdrawal *= 1 - adjustmentFactor;
      } else if (currentWithdrawalRate < lowerRate) {
        targetPortfolioWithdrawal *= 1 + adjustmentFactor;
      }
    }

    const withdrawn = withdrawFromBuckets(
      { equityValue, bondValue, cashValue },
      targetPortfolioWithdrawal
    );

    equityValue = withdrawn.equityValue;
    bondValue = withdrawn.bondValue;
    cashValue = withdrawn.cashValue;

    const actualPortfolioWithdrawal = withdrawn.withdrawnAmount;

    if (actualPortfolioWithdrawal < targetPortfolioWithdrawal && !depleted) {
      depleted = true;
      depletionYear = year;
    }

    const eqReturn = randomNormal(
      inputs.equityReturn / 100,
      inputs.equityVolatility / 100,
      random
    );
    const bondReturn = randomNormal(
      inputs.bondReturn / 100,
      inputs.bondVolatility / 100,
      random
    );
    const cashReturn = randomNormal(
      inputs.cashReturn / 100,
      inputs.cashVolatility / 100,
      random
    );

    equityValue *= 1 + eqReturn;
    bondValue *= 1 + bondReturn;
    cashValue *= 1 + cashReturn;

    if (inputs.rebalanceAnnually) {
      const rebalanced = rebalanceToTarget(
        equityValue,
        bondValue,
        cashValue,
        inputs.equityAllocation / 100,
        inputs.bondAllocation / 100,
        inputs.cashAllocation / 100
      );

      equityValue = rebalanced.equityValue;
      bondValue = rebalanced.bondValue;
      cashValue = rebalanced.cashValue;
    }

    const endPortfolio = Math.max(0, equityValue + bondValue + cashValue);
    const portfolioReturn =
      startPortfolio > 0
        ? (endPortfolio + actualPortfolioWithdrawal - startPortfolio) / startPortfolio
        : -1;

    yearly.push({
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
    });
  }

  return {
    yearly,
    depleted,
    depletionYear,
    endingPortfolio: yearly[yearly.length - 1]?.endPortfolio ?? 0
  };
}

function buildPercentileSeries(paths, years) {
  const portfolio = [];
  const spending = [];

  for (let yearIndex = 0; yearIndex < years; yearIndex += 1) {
    const endNominal = [];
    const endReal = [];
    const spendingNominal = [];
    const spendingReal = [];
    const pensionNominal = [];
    const pensionReal = [];
    const withdrawalNominal = [];
    const withdrawalReal = [];

    for (const path of paths) {
      const row = path.yearly[yearIndex];
      endNominal.push(row.endPortfolio);
      endReal.push(row.endPortfolioReal);
      spendingNominal.push(row.spendingNominal);
      spendingReal.push(row.spendingReal);
      pensionNominal.push(row.statePensionNominal);
      pensionReal.push(row.statePensionReal);
      withdrawalNominal.push(row.portfolioWithdrawalNominal);
      withdrawalReal.push(row.portfolioWithdrawalReal);
    }

    portfolio.push({
      year: yearIndex + 1,
      nominal: percentileTriplet(endNominal),
      real: percentileTriplet(endReal)
    });

    spending.push({
      year: yearIndex + 1,
      spendingNominal: percentileTriplet(spendingNominal),
      spendingReal: percentileTriplet(spendingReal),
      pensionNominal: percentileTriplet(pensionNominal),
      pensionReal: percentileTriplet(pensionReal),
      withdrawalNominal: percentileTriplet(withdrawalNominal),
      withdrawalReal: percentileTriplet(withdrawalReal)
    });
  }

  return { portfolio, spending };
}

function findMedianPath(paths) {
  const sorted = [...paths].sort((a, b) => a.endingPortfolio - b.endingPortfolio);
  return sorted[Math.floor(sorted.length / 2)];
}

function runStressTests(inputs) {
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

function simulateDeterministicScenario(inputs, scenario, name) {
  let spendingNominal = inputs.initialSpending;
  let cumulativeInflationIndex = 1;

  let equityValue = inputs.initialPortfolio * (inputs.equityAllocation / 100);
  let bondValue = inputs.initialPortfolio * (inputs.bondAllocation / 100);
  let cashValue = inputs.initialPortfolio * (inputs.cashAllocation / 100);

  const startingWithdrawalRate = inputs.initialWithdrawalRate / 100;
  const upperRate = startingWithdrawalRate * (1 + inputs.upperGuardrail / 100);
  const lowerRate = startingWithdrawalRate * (1 - inputs.lowerGuardrail / 100);
  const adjustmentFactor = inputs.adjustmentPct / 100;

  const yearly = [];
  let depleted = false;

  for (let year = 1; year <= inputs.years; year += 1) {
    const scenarioYear = scenario[Math.min(year - 1, scenario.length - 1)];
    const inflationRate = scenarioYear.inflation;

    const startPortfolio = equityValue + bondValue + cashValue;

    if (year > 1) {
      const shouldSkipInflation =
        inputs.skipInflationAfterNegative && yearly[yearly.length - 1].portfolioReturn < 0;

      if (!shouldSkipInflation) {
        spendingNominal *= 1 + inflationRate;
      }
    }

    cumulativeInflationIndex *= 1 + inflationRate;

    const statePensionNominal = computeHouseholdPension(inputs, year, inflationRate);
    let targetPortfolioWithdrawal = Math.max(0, spendingNominal - statePensionNominal);

    if (startPortfolio > 0) {
      const currentWithdrawalRate = targetPortfolioWithdrawal / startPortfolio;

      if (currentWithdrawalRate > upperRate) {
        targetPortfolioWithdrawal *= 1 - adjustmentFactor;
      } else if (currentWithdrawalRate < lowerRate) {
        targetPortfolioWithdrawal *= 1 + adjustmentFactor;
      }
    }

    const withdrawn = withdrawFromBuckets(
      { equityValue, bondValue, cashValue },
      targetPortfolioWithdrawal
    );

    equityValue = withdrawn.equityValue;
    bondValue = withdrawn.bondValue;
    cashValue = withdrawn.cashValue;

    const actualPortfolioWithdrawal = withdrawn.withdrawnAmount;

    if (actualPortfolioWithdrawal < targetPortfolioWithdrawal) {
      depleted = true;
    }

    equityValue *= 1 + scenarioYear.equity;
    bondValue *= 1 + scenarioYear.bond;
    cashValue *= 1 + scenarioYear.cash;

    if (inputs.rebalanceAnnually) {
      const rebalanced = rebalanceToTarget(
        equityValue,
        bondValue,
        cashValue,
        inputs.equityAllocation / 100,
        inputs.bondAllocation / 100,
        inputs.cashAllocation / 100
      );

      equityValue = rebalanced.equityValue;
      bondValue = rebalanced.bondValue;
      cashValue = rebalanced.cashValue;
    }

    const endPortfolio = Math.max(0, equityValue + bondValue + cashValue);
    const portfolioReturn =
      startPortfolio > 0
        ? (endPortfolio + actualPortfolioWithdrawal - startPortfolio) / startPortfolio
        : -1;

    yearly.push({
      year,
      endPortfolio,
      endPortfolioReal: endPortfolio / cumulativeInflationIndex,
      spendingNominal,
      spendingReal: spendingNominal / cumulativeInflationIndex,
      statePensionNominal,
      statePensionReal: statePensionNominal / cumulativeInflationIndex,
      portfolioWithdrawalNominal: actualPortfolioWithdrawal,
      portfolioWithdrawalReal: actualPortfolioWithdrawal / cumulativeInflationIndex,
      portfolioReturn
    });
  }

  return {
    name,
    depleted,
    yearly,
    endingPortfolio: yearly[yearly.length - 1]?.endPortfolio ?? 0,
    endingPortfolioReal: yearly[yearly.length - 1]?.endPortfolioReal ?? 0
  };
}

function computeHouseholdPension(inputs, year, inflationRateForThisYear) {
  let pension = 0;

  if (inputs.person1Age + year - 1 >= inputs.person1PensionAge) {
    pension += growIndexedIncome(inputs.person1PensionAmount, inputs, year, inflationRateForThisYear, inputs.person1Age, inputs.person1PensionAge);
  }

  if (inputs.person2Age + year - 1 >= inputs.person2PensionAge) {
    pension += growIndexedIncome(inputs.person2PensionAmount, inputs, year, inflationRateForThisYear, inputs.person2Age, inputs.person2PensionAge);
  }

  return pension;
}

function growIndexedIncome(todayAmount, inputs, year, inflationRateForThisYear, currentAge, pensionAge) {
  const yearsUntilStart = Math.max(0, pensionAge - currentAge);
  if (year <= yearsUntilStart) return 0;

  let amount = todayAmount;

  for (let i = 0; i < year - 1; i += 1) {
    amount *= 1 + inflationRateForThisYear;
  }

  return amount;
}

function withdrawFromBuckets(bucketValues, amountNeeded) {
  let remaining = amountNeeded;

  let cashValue = bucketValues.cashValue;
  let bondValue = bucketValues.bondValue;
  let equityValue = bucketValues.equityValue;

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

function rebalanceToTarget(equityValue, bondValue, cashValue, eqWeight, bondWeight, cashWeight) {
  const total = equityValue + bondValue + cashValue;
  if (total <= 0) {
    return { equityValue: 0, bondValue: 0, cashValue: 0 };
  }

  return {
    equityValue: total * eqWeight,
    bondValue: total * bondWeight,
    cashValue: total * cashWeight
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
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
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
    if (i < 10) scenario.push({ equity: 0.00, bond: 0.025, cash: 0.035, inflation: 0.025 });
    else scenario.push({ equity: 0.08, bond: 0.03, cash: 0.04, inflation: 0.025 });
  }
  return scenario;
}

function buildInflationSpikeScenario(years) {
  const scenario = [];
  for (let i = 0; i < years; i += 1) {
    if (i < 3) scenario.push({ equity: -0.05, bond: -0.07, cash: 0.045, inflation: 0.08 });
    else if (i < 6) scenario.push({ equity: 0.04, bond: 0.00, cash: 0.04, inflation: 0.05 });
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
    if (i === years - 3) scenario.push({ equity: -0.10, bond: 0.00, cash: 0.04, inflation: 0.03 });
    else if (i === years - 2) scenario.push({ equity: -0.22, bond: 0.01, cash: 0.04, inflation: 0.03 });
    else if (i === years - 1) scenario.push({ equity: -0.12, bond: 0.02, cash: 0.04, inflation: 0.03 });
    else scenario.push({ equity: 0.07, bond: 0.03, cash: 0.04, inflation: 0.025 });
  }
  return scenario;
}

function buildReverseSequenceScenario(years) {
  const good = [];
  for (let i = 0; i < years; i += 1) {
    if (i < 5) good.push({ equity: 0.14, bond: 0.05, cash: 0.04, inflation: 0.025 });
    else if (i < 10) good.push({ equity: 0.10, bond: 0.04, cash: 0.04, inflation: 0.025 });
    else if (i < 15) good.push({ equity: 0.06, bond: 0.03, cash: 0.04, inflation: 0.025 });
    else good.push({ equity: -0.08, bond: 0.01, cash: 0.04, inflation: 0.03 });
  }
  return good;
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