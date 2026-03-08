function range(years, valueOrFn) {
  return Array.from({ length: years }, (_, index) =>
    typeof valueOrFn === "function" ? valueOrFn(index) : valueOrFn
  );
}

function blend(initialYears, earlyFn, laterFn, years) {
  return Array.from({ length: years }, (_, index) =>
    index < initialYears ? earlyFn(index) : laterFn(index)
  );
}

export function buildStressScenarios(years, assumptions) {
  const {
    equityReturn,
    bondReturn,
    cashlikeReturn,
    inflation
  } = assumptions;

  const eq = equityReturn;
  const bd = bondReturn;
  const cs = cashlikeReturn;
  const inf = inflation;

  return [
    {
      name: "Early crash",
      equityReturns: blend(
        3,
        (i) => [-0.28, -0.18, 0.04][i],
        () => eq,
        years
      ),
      bondReturns: blend(
        3,
        (i) => [0.06, 0.03, 0.02][i],
        () => bd,
        years
      ),
      cashlikeReturns: range(years, () => cs),
      inflationRates: blend(
        2,
        (i) => [0.05, 0.04][i],
        () => inf,
        years
      )
    },
    {
      name: "Lost decade",
      equityReturns: blend(
        10,
        (i) => [0.01, -0.09, 0.03, -0.04, 0.05, 0.00, 0.02, -0.03, 0.04, 0.01][i],
        () => eq,
        years
      ),
      bondReturns: range(years, () => bd + 0.005),
      cashlikeReturns: range(years, () => cs),
      inflationRates: range(years, () => inf)
    },
    {
      name: "Inflation shock",
      equityReturns: blend(
        4,
        (i) => [-0.12, -0.08, 0.02, 0.05][i],
        () => eq,
        years
      ),
      bondReturns: blend(
        4,
        (i) => [-0.10, -0.06, -0.02, 0.01][i],
        () => bd,
        years
      ),
      cashlikeReturns: blend(
        4,
        (i) => [0.03, 0.04, 0.05, 0.05][i],
        () => cs,
        years
      ),
      inflationRates: blend(
        5,
        (i) => [0.09, 0.07, 0.05, 0.04, 0.035][i],
        () => inf,
        years
      )
    },
    {
      name: "Bond crash",
      equityReturns: blend(
        3,
        (i) => [-0.06, 0.02, 0.05][i],
        () => eq,
        years
      ),
      bondReturns: blend(
        4,
        (i) => [-0.18, -0.09, -0.03, 0.00][i],
        () => bd,
        years
      ),
      cashlikeReturns: range(years, () => cs),
      inflationRates: blend(
        3,
        (i) => [0.055, 0.04, 0.03][i],
        () => inf,
        years
      )
    },
    {
      name: "Late crash",
      equityReturns: Array.from({ length: years }, (_, i) => {
        if (i === Math.max(0, years - 4)) return -0.22;
        if (i === Math.max(0, years - 3)) return -0.12;
        if (i === Math.max(0, years - 2)) return 0.01;
        return eq;
      }),
      bondReturns: Array.from({ length: years }, (_, i) => {
        if (i === Math.max(0, years - 4)) return 0.04;
        if (i === Math.max(0, years - 3)) return 0.03;
        return bd;
      }),
      cashlikeReturns: range(years, () => cs),
      inflationRates: range(years, () => inf)
    },
    {
      name: "Reverse returns",
      equityReturns: Array.from({ length: years }, (_, i) => {
        if (i < Math.min(8, years)) return Math.max(-0.14, eq - 0.13);
        return eq + 0.02;
      }),
      bondReturns: Array.from({ length: years }, (_, i) => {
        if (i < Math.min(4, years)) return bd - 0.02;
        return bd;
      }),
      cashlikeReturns: range(years, () => cs),
      inflationRates: range(years, () => inf)
    },
    {
      name: "High inflation grind",
      equityReturns: Array.from({ length: years }, (_, i) => {
        if (i < Math.min(6, years)) return eq - 0.05;
        return eq;
      }),
      bondReturns: Array.from({ length: years }, (_, i) => {
        if (i < Math.min(6, years)) return bd - 0.03;
        return bd;
      }),
      cashlikeReturns: Array.from({ length: years }, (_, i) => {
        if (i < Math.min(6, years)) return cs + 0.01;
        return cs;
      }),
      inflationRates: Array.from({ length: years }, (_, i) => {
        if (i < Math.min(6, years)) return inf + 0.03;
        return inf;
      })
    },
    {
      name: "Great decade",
      equityReturns: blend(
        10,
        () => eq + 0.04,
        () => eq,
        years
      ),
      bondReturns: range(years, () => bd + 0.003),
      cashlikeReturns: range(years, () => cs),
      inflationRates: range(years, () => inf)
    }
  ];
}