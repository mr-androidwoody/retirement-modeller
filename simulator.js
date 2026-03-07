function createSeededRng(seed) {
  let state = seed >>> 0;

  return function rng() {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomNormal(rng) {
  let u = 0;
  let v = 0;

  while (u === 0) u = rng();
  while (v === 0) v = rng();

  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function getAnnualReturn(scenario, rng) {
  const {
    stockAllocation,
    bondAllocation,
    assumptions: { stockReturn, stockVol, bondReturn, bondVol }
  } = scenario;

  const stockRnd = randomNormal(rng);
  const bondRnd = randomNormal(rng);

  const stockAnnual = stockReturn + stockVol * stockRnd;
  const bondAnnual = bondReturn + bondVol * bondRnd;

  return stockAllocation * stockAnnual + bondAllocation * bondAnnual;
}

function getInflationAdjustedSpending(previousSpending, inflation) {
  return previousSpending * (1 + inflation);
}

function getInitialWithdrawalRate(scenario) {
  return scenario.annualSpending / scenario.startPortfolio;
}

function applyGuardrails({
  currentSpending,
  currentPortfolio,
  initialWithdrawalRate,
  rules
}) {
  if (currentPortfolio <= 0) {
    return {
      spending: currentSpending,
      events: ["PORTFOLIO_DEPLETED"]
    };
  }

  const currentWithdrawalRate = currentSpending / currentPortfolio;
  const upperLimit = initialWithdrawalRate * rules.upperGuardrail;
  const lowerLimit = initialWithdrawalRate * rules.lowerGuardrail;

  const events = [];
  let spending = currentSpending;

  if (currentWithdrawalRate > upperLimit) {
    spending = currentSpending * (1 - rules.cutPct);
    events.push("GK_CUT");
  } else if (currentWithdrawalRate < lowerLimit) {
    spending = currentSpending * (1 + rules.raisePct);
    events.push("GK_RAISE");
  }

  return { spending, events };
}

function getStatePensionForYear({
  currentAge,
  statePensionAge,
  statePensionToday,
  inflation,
  yearIndex
}) {
  if (currentAge + yearIndex < statePensionAge) {
    return 0;
  }

  return statePensionToday * Math.pow(1 + inflation, yearIndex);
}

function validateScenario(scenario) {
  const allocationTotal = scenario.stockAllocation + scenario.bondAllocation;

  if (Math.abs(allocationTotal - 1) > 0.000001) {
    throw new Error("Stock and bond allocations must sum to 1");
  }

  if (scenario.startPortfolio <= 0) {
    throw new Error("Start portfolio must be greater than 0");
  }

  if (scenario.years <= 0) {
    throw new Error("Years must be greater than 0");
  }

  if (scenario.monteCarloRuns <= 0) {
    throw new Error("Monte Carlo runs must be greater than 0");
  }

  if (scenario.person1StatePensionAge < scenario.person1Age) {
    throw new Error("Person 1 state pension age cannot be below current age");
  }

  if (scenario.person2StatePensionAge < scenario.person2Age) {
    throw new Error("Person 2 state pension age cannot be below current age");
  }
}

function getPercentile(sortedValues, percentile) {
  if (sortedValues.length === 0) return 0;

  const index = Math.floor(percentile * (sortedValues.length - 1));
  return sortedValues[index];
}

export function runSingleSimulation(scenario) {
  validateScenario(scenario);

  const rng = createSeededRng(scenario.seed);
  const initialWithdrawalRate = getInitialWithdrawalRate(scenario);

  const records = [];

  let portfolio = scenario.startPortfolio;
  let spendingTarget = scenario.annualSpending;
  let previousReturn = null;
  let depleted = false;
  let depletionYear = null;

  for (let year = 0; year < scenario.years; year += 1) {
    const age1 = scenario.person1Age + year;
    const age2 = scenario.person2Age + year;

    const startPortfolio = portfolio;
    const events = [];

    if (year > 0) {
      const shouldSkipInflation =
        scenario.rules.skipInflationAfterNegativeReturn &&
        previousReturn !== null &&
        previousReturn < 0;

      if (shouldSkipInflation) {
        events.push("INFLATION_SKIPPED");
      } else {
        spendingTarget = getInflationAdjustedSpending(
          spendingTarget,
          scenario.inflation
        );
      }
    }

    const guardrailResult = applyGuardrails({
      currentSpending: spendingTarget,
      currentPortfolio: startPortfolio,
      initialWithdrawalRate,
      rules: scenario.rules
    });

    spendingTarget = guardrailResult.spending;
    events.push(...guardrailResult.events);

    const statePension1 = getStatePensionForYear({
      currentAge: scenario.person1Age,
      statePensionAge: scenario.person1StatePensionAge,
      statePensionToday: scenario.statePensionToday,
      inflation: scenario.inflation,
      yearIndex: year
    });

    const statePension2 = getStatePensionForYear({
      currentAge: scenario.person2Age,
      statePensionAge: scenario.person2StatePensionAge,
      statePensionToday: scenario.statePensionToday,
      inflation: scenario.inflation,
      yearIndex: year
    });

    const statePensionIncome = statePension1 + statePension2;
    const requiredWithdrawal = Math.max(0, spendingTarget - statePensionIncome);

    if (statePension1 > 0) {
      events.push("STATE_PENSION_1_ACTIVE");
    }

    if (statePension2 > 0) {
      events.push("STATE_PENSION_2_ACTIVE");
    }

    const actualWithdrawal = Math.min(requiredWithdrawal, portfolio);
    portfolio -= actualWithdrawal;

    let fullSpendingMet = true;

    if (requiredWithdrawal > actualWithdrawal) {
      fullSpendingMet = false;
      events.push("PARTIAL_SPENDING_ONLY");
    }

    const annualReturn = portfolio > 0 ? getAnnualReturn(scenario, rng) : 0;
    portfolio *= 1 + annualReturn;

    if (portfolio <= 0) {
      portfolio = 0;

      if (depletionYear === null) {
        depletionYear = year + 1;
        events.push("PORTFOLIO_DEPLETED");
      }

      depleted = true;
    }

    records.push({
      year: year + 1,
      age1,
      age2,
      startPortfolio,
      spendingTarget,
      statePensionIncome,
      withdrawal: actualWithdrawal,
      totalIncome: actualWithdrawal + statePensionIncome,
      fullSpendingMet,
      returnPct: annualReturn,
      endPortfolio: portfolio,
      events
    });

    previousReturn = annualReturn;
  }

  return {
    records,
    summary: {
      depleted,
      depletionYear
    }
  };
}

export function runMonteCarlo(scenario) {
  validateScenario(scenario);

  const endingValues = [];
  const yearlyEndingValues = Array.from({ length: scenario.years }, () => []);
  const depletionCountsByYear = Array.from({ length: scenario.years }, () => 0);

  let successes = 0;

  for (let i = 0; i < scenario.monteCarloRuns; i += 1) {
    const scenarioForRun = {
      ...scenario,
      seed: scenario.seed + i
    };

    const result = runSingleSimulation(scenarioForRun);
    const { records, summary } = result;
    const finalYear = records[records.length - 1];

    const succeeded = !summary.depleted;

    if (succeeded) {
      successes += 1;
    }

    endingValues.push(finalYear.endPortfolio);

    for (let year = 0; year < records.length; year += 1) {
      yearlyEndingValues[year].push(records[year].endPortfolio);
    }

    if (summary.depletionYear !== null) {
      for (let year = summary.depletionYear - 1; year < scenario.years; year += 1) {
        depletionCountsByYear[year] += 1;
      }
    }
  }

  const sortedEndingValues = [...endingValues].sort((a, b) => a - b);

  const yearlyPercentiles = yearlyEndingValues.map((values, index) => {
    const sorted = [...values].sort((a, b) => a - b);

    return {
      year: index + 1,
      p10: getPercentile(sorted, 0.1),
      median: getPercentile(sorted, 0.5),
      p90: getPercentile(sorted, 0.9)
    };
  });

  const depletionProbabilityByYear = depletionCountsByYear.map((count, index) => ({
    year: index + 1,
    probability: count / scenario.monteCarloRuns
  }));

  return {
    runs: scenario.monteCarloRuns,
    successRate: successes / scenario.monteCarloRuns,
    medianEndingValue: getPercentile(sortedEndingValues, 0.5),
    p10EndingValue: getPercentile(sortedEndingValues, 0.1),
    p90EndingValue: getPercentile(sortedEndingValues, 0.9),
    yearlyPercentiles,
    depletionProbabilityByYear
  };
}