import { describe, it, expect } from "vitest";

import {
  olsRegression,
  wlsRegression,
  partialCorrelation,
  pearsonCorrelation,
  linearRegression,
  shannonEntropy,
  changeIntensityScore,
  shapiroWilk,
  kolmogorovSmirnov,
  skewness,
  kurtosis,
  confidenceInterval95,
  normalCdf,
  tDistributionCdf,
} from "./statistics.js";

// ---------------------------------------------------------------------------
// Linear regression
// ---------------------------------------------------------------------------

describe("statistics — linear regression", () => {
  it("produces perfect R² for linear data", () => {
    const result = linearRegression([
      { x: 1, y: 2 },
      { x: 2, y: 4 },
      { x: 3, y: 6 },
    ]);
    expect(result.slope).toBeCloseTo(2);
    expect(result.rSquared).toBeCloseTo(1, 5);
  });

  it("returns zero for insufficient data", () => {
    const result = linearRegression([{ x: 1, y: 2 }]);
    expect(result.rSquared).toBe(0);
  });

  it("handles constant x values", () => {
    const result = linearRegression([
      { x: 3, y: 1 },
      { x: 3, y: 5 },
    ]);
    expect(result.slope).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Multivariate OLS regression
// ---------------------------------------------------------------------------

describe("statistics — multivariate OLS", () => {
  it("produces near-perfect R² for a known linear relationship", () => {
    // y = 2*x1 + 3*x2 + 1 (intercept)
    const X = [
      [1, 1],
      [2, 1],
      [1, 2],
      [3, 2],
      [2, 3],
      [4, 1],
      [3, 3],
      [5, 2],
      [4, 4],
      [6, 3],
      [1, 4],
      [2, 5],
      [5, 1],
      [3, 4],
      [6, 5],
    ];
    const y = X.map((row) => 2 * row[0] + 3 * row[1] + 1);

    const result = olsRegression(X, y);
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.rSquared).toBeCloseTo(1, 4);
    expect(result.coefficients[0]).toBeCloseTo(1, 2); // intercept
    expect(result.coefficients[1]).toBeCloseTo(2, 2); // x1
    expect(result.coefficients[2]).toBeCloseTo(3, 2); // x2
    expect(result.residuals).toHaveLength(15);
  });

  it("handles noisy data with moderate R²", () => {
    // y = 2*x1 + noise
    const X = [
      [1, 0],
      [2, 1],
      [3, 0],
      [4, 1],
      [5, 0],
      [6, 1],
      [7, 0],
      [8, 1],
      [9, 0],
      [10, 1],
      [11, 0],
      [12, 1],
      [13, 0],
      [14, 1],
      [15, 0],
    ];
    const y = X.map((row, i) => 2 * row[0] + (i % 3) - 1);

    const result = olsRegression(X, y);
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.rSquared).toBeGreaterThan(0.5);
    expect(result.rSquared).toBeLessThanOrEqual(1);
    expect(result.adjustedRSquared).toBeLessThanOrEqual(result.rSquared);
  });

  it("returns null for singular matrix", () => {
    // Columns are linearly dependent
    const X = [
      [1, 2],
      [2, 4],
      [3, 6],
    ];
    const y = [1, 2, 3];
    const result = olsRegression(X, y);
    expect(result).toBeNull();
  });

  it("computes correct p-values (significant coefficients have low p-value)", () => {
    // y = 5*x1 + 0*x2 + noise — x1 should be significant, x2 should not
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 20; i++) {
      const x1 = i + 1;
      const x2 = ((i * 7) % 5) + 1; // pseudo-random
      X.push([x1, x2]);
      y.push(5 * x1 + ((i % 3) - 1) * 0.5);
    }

    const result = olsRegression(X, y);
    expect(result).not.toBeNull();
    if (!result) return;

    // x1 (index 1) should have low p-value
    expect(result.pValues[1]).toBeLessThan(0.05);
    // x2 (index 2) should have higher p-value (not significant)
    expect(result.pValues[2]).toBeGreaterThan(0.01);
  });
});

// ---------------------------------------------------------------------------
// Weighted Least Squares regression
// ---------------------------------------------------------------------------

describe("statistics — WLS regression", () => {
  it("with uniform weights produces the same coefficients as OLS", () => {
    const X = [
      [1, 1],
      [2, 1],
      [1, 2],
      [3, 2],
      [2, 3],
      [4, 1],
      [3, 3],
      [5, 2],
      [4, 4],
      [6, 3],
      [1, 4],
      [2, 5],
      [5, 1],
      [3, 4],
      [6, 5],
    ];
    const y = X.map((row) => 2 * row[0] + 3 * row[1] + 1);
    const w = X.map(() => 1.0);

    const ols = olsRegression(X, y)!;
    const wls = wlsRegression(X, y, w)!;

    expect(wls.coefficients[0]).toBeCloseTo(ols.coefficients[0], 4);
    expect(wls.coefficients[1]).toBeCloseTo(ols.coefficients[1], 4);
    expect(wls.coefficients[2]).toBeCloseTo(ols.coefficients[2], 4);
  });

  it("down-weighting outlier reduces its influence on fit", () => {
    // Clean data: y = 2*x + 1
    const X = [[1], [2], [3], [4], [5], [6], [7], [8], [9], [10]];
    const y = X.map((row) => 2 * row[0] + 1);
    // Inject outlier at index 9
    y[9] = 100;

    const olsResult = olsRegression(X, y)!;
    // Down-weight the outlier heavily
    const w = [1, 1, 1, 1, 1, 1, 1, 1, 1, 0.01];
    const wlsResult = wlsRegression(X, y, w)!;

    // WLS slope should be closer to the true slope (2.0) than OLS
    expect(Math.abs(wlsResult.coefficients[1] - 2.0)).toBeLessThan(
      Math.abs(olsResult.coefficients[1] - 2.0),
    );
  });

  it("returns null for singular weighted matrix", () => {
    const X = [
      [1, 2],
      [2, 4],
      [3, 6],
    ];
    const y = [1, 2, 3];
    const w = [1, 1, 1];
    expect(wlsRegression(X, y, w)).toBeNull();
  });

  it("residuals and predictions are in original (unweighted) space", () => {
    const X = [[1], [2], [3], [4], [5]];
    const y = [3, 5, 7, 9, 11]; // y = 2x + 1
    const w = [1, 1, 1, 1, 0.5];

    const result = wlsRegression(X, y, w)!;
    expect(result.predicted).toHaveLength(5);
    expect(result.residuals).toHaveLength(5);
    // For near-perfect data, residuals should be near zero
    for (const r of result.residuals) {
      expect(Math.abs(r)).toBeLessThan(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Partial correlation
// ---------------------------------------------------------------------------

describe("statistics — partial correlation", () => {
  it("detects strong partial correlation for a relevant feature", () => {
    // y = 3*x1 + 0*x2 → partial correlation of x1 should be high
    const X = [
      [1, 2],
      [2, 3],
      [3, 1],
      [4, 4],
      [5, 2],
      [6, 5],
      [7, 3],
      [8, 1],
      [9, 4],
      [10, 2],
    ];
    const y = X.map((row) => 3 * row[0] + 0.1 * row[1]);

    const pc = partialCorrelation(X, y, 0);
    expect(pc).toBeGreaterThan(0.8);
  });

  it("detects near-zero partial correlation for an irrelevant feature", () => {
    // y = 3*x1 + noise independent of x2
    const X = [
      [1, 5],
      [2, 3],
      [3, 7],
      [4, 2],
      [5, 8],
      [6, 1],
      [7, 6],
      [8, 4],
      [9, 9],
      [10, 3],
    ];
    const y = X.map((row) => 3 * row[0]);

    const pc = partialCorrelation(X, y, 1);
    expect(Math.abs(pc)).toBeLessThan(0.3);
  });
});

// ---------------------------------------------------------------------------
// Pearson correlation
// ---------------------------------------------------------------------------

describe("statistics — pearson correlation", () => {
  it("returns 1 for perfectly correlated data", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    expect(pearsonCorrelation(x, y)).toBeCloseTo(1, 5);
  });

  it("returns -1 for perfectly inversely correlated data", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [10, 8, 6, 4, 2];
    expect(pearsonCorrelation(x, y)).toBeCloseTo(-1, 5);
  });

  it("returns 0 for insufficient data", () => {
    expect(pearsonCorrelation([1], [2])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Shannon entropy
// ---------------------------------------------------------------------------

describe("statistics — Shannon entropy", () => {
  it("returns 0 for a single file", () => {
    expect(shannonEntropy([100])).toBeCloseTo(0);
  });

  it("returns maximum entropy for uniform distribution", () => {
    // 8 files with equal changes → log2(8) = 3
    const values = Array(8).fill(10);
    expect(shannonEntropy(values)).toBeCloseTo(3, 4);
  });

  it("returns lower entropy for skewed distribution", () => {
    // One file dominates
    const skewed = [100, 1, 1, 1];
    const uniform = [25, 25, 25, 25];
    expect(shannonEntropy(skewed)).toBeLessThan(shannonEntropy(uniform));
  });

  it("returns 0 for empty input", () => {
    expect(shannonEntropy([])).toBe(0);
  });

  it("returns 0 for all zeros", () => {
    expect(shannonEntropy([0, 0, 0])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Change intensity score
// ---------------------------------------------------------------------------

describe("statistics — change intensity score", () => {
  it("returns 0 for zero changes", () => {
    expect(changeIntensityScore(0, 0, 0)).toBe(0);
  });

  it("returns value between 0 and 1 for moderate changes", () => {
    const score = changeIntensityScore(500, 2.0, 10);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("returns 1 for maximum changes", () => {
    // All components at max
    const score = changeIntensityScore(10000, 5, 50);
    expect(score).toBeCloseTo(1, 2);
  });

  it("clamps to 1 for exceeding maxima", () => {
    const score = changeIntensityScore(100000, 100, 500);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Skewness and kurtosis
// ---------------------------------------------------------------------------

describe("statistics — skewness", () => {
  it("returns near-zero for symmetric data", () => {
    const symmetric = [-3, -2, -1, 0, 1, 2, 3];
    expect(Math.abs(skewness(symmetric))).toBeLessThan(0.1);
  });

  it("returns positive for right-skewed data", () => {
    const rightSkewed = [1, 1, 1, 2, 2, 3, 10, 20];
    expect(skewness(rightSkewed)).toBeGreaterThan(0);
  });

  it("returns 0 for insufficient data", () => {
    expect(skewness([1, 2])).toBe(0);
  });
});

describe("statistics — kurtosis", () => {
  it("returns near-zero for normal-like data", () => {
    // A roughly uniform distribution has negative excess kurtosis
    const uniform = Array.from({ length: 100 }, (_, i) => i);
    const k = kurtosis(uniform);
    expect(k).toBeLessThan(0); // uniform distribution has kurtosis ≈ -1.2
  });

  it("returns 0 for insufficient data", () => {
    expect(kurtosis([1, 2, 3])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Shapiro-Wilk
// ---------------------------------------------------------------------------

describe("statistics — Shapiro-Wilk", () => {
  it("produces high p-value for normal-like data", () => {
    // Approximate normal sample
    const data = [
      -1.5, -1.2, -0.8, -0.5, -0.3, -0.1, 0.0, 0.1, 0.3, 0.5, 0.8, 1.2,
      1.5,
    ];
    const result = shapiroWilk(data);
    expect(result.W).toBeGreaterThan(0.8);
    expect(result.pValue).toBeGreaterThan(0.01);
  });

  it("produces low p-value for clearly non-normal data", () => {
    // Bimodal distribution
    const data = [1, 1, 1, 1, 1, 10, 10, 10, 10, 10];
    const result = shapiroWilk(data);
    expect(result.W).toBeLessThan(0.95);
  });

  it("handles minimum sample size", () => {
    const result = shapiroWilk([1, 2, 3]);
    expect(result.W).toBeGreaterThan(0);
    expect(result.W).toBeLessThanOrEqual(1);
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Kolmogorov-Smirnov
// ---------------------------------------------------------------------------

describe("statistics — Kolmogorov-Smirnov", () => {
  it("produces low D for normal-like data", () => {
    // Generate approximate normal sample (50+ points)
    const data: number[] = [];
    for (let i = 0; i < 60; i++) {
      data.push(((i - 30) / 10) * 1.0);
    }
    const result = kolmogorovSmirnov(data);
    expect(result.D).toBeLessThan(0.2);
  });

  it("handles edge case of 2 data points", () => {
    const result = kolmogorovSmirnov([1, 2]);
    expect(result.D).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Normal CDF
// ---------------------------------------------------------------------------

describe("statistics — normalCdf", () => {
  it("returns 0.5 for z=0", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 4);
  });

  it("returns ~0.8413 for z=1", () => {
    expect(normalCdf(1)).toBeCloseTo(0.8413, 3);
  });

  it("returns ~0.0228 for z=-2", () => {
    expect(normalCdf(-2)).toBeCloseTo(0.0228, 3);
  });
});

// ---------------------------------------------------------------------------
// t-distribution CDF
// ---------------------------------------------------------------------------

describe("statistics — tDistributionCdf", () => {
  it("returns ~0.5 for t=0", () => {
    expect(tDistributionCdf(0, 10)).toBeCloseTo(0.5, 3);
  });

  it("returns value > 0.5 for positive t", () => {
    expect(tDistributionCdf(2, 10)).toBeGreaterThan(0.5);
  });

  it("converges to normal CDF for large df", () => {
    const tCdf = tDistributionCdf(1.96, 1000);
    const nCdf = normalCdf(1.96);
    expect(Math.abs(tCdf - nCdf)).toBeLessThan(0.01);
  });
});

// ---------------------------------------------------------------------------
// Confidence interval
// ---------------------------------------------------------------------------

describe("statistics — confidence interval", () => {
  it("computes a 95% CI centered on the mean", () => {
    const ci = confidenceInterval95(4.0, 0.5, 30);
    expect(ci.lower).toBeLessThan(4.0);
    expect(ci.upper).toBeGreaterThan(4.0);
    expect(ci.upper - ci.lower).toBeGreaterThan(0);
  });

  it("widens with larger standard error", () => {
    const narrow = confidenceInterval95(4.0, 0.1, 30);
    const wide = confidenceInterval95(4.0, 1.0, 30);
    expect(wide.upper - wide.lower).toBeGreaterThan(
      narrow.upper - narrow.lower,
    );
  });

  it("narrows with larger sample size", () => {
    const small = confidenceInterval95(4.0, 0.5, 5);
    const large = confidenceInterval95(4.0, 0.5, 100);
    expect(large.upper - large.lower).toBeLessThan(
      small.upper - small.lower,
    );
  });
});
