export const defaultScenario = {
  startPortfolio: 1000000,
  years: 40,

  stockAllocation: 0.6,
  bondAllocation: 0.4,

  annualSpending: 40000,
  inflation: 0.025,

  statePensionToday: 12547,
  person1Age: 57,
  person2Age: 58,
  person1StatePensionAge: 67,
  person2StatePensionAge: 67,

  monteCarloRuns: 1000,
  seed: 12345,

  rules: {
    upperGuardrail: 1.2,
    lowerGuardrail: 0.8,
    cutPct: 0.1,
    raisePct: 0.1,
    skipInflationAfterNegativeReturn: true
  },

  assumptions: {
    stockReturn: 0.07,
    stockVol: 0.18,
    bondReturn: 0.02,
    bondVol: 0.06
  }
};