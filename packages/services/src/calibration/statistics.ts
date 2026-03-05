/**
 * Statistical utility functions for calibration regression.
 *
 * Provides multivariate OLS regression, partial correlation,
 * normality tests (Shapiro-Wilk, Kolmogorov-Smirnov), and
 * confidence interval computation.
 *
 * All implementations are hand-rolled in TypeScript to keep the
 * dependency footprint zero. The matrices involved are small
 * (max ~10 features) so numerical edge cases are manageable.
 */

// ---------------------------------------------------------------------------
// Matrix operations (small matrices only)
// ---------------------------------------------------------------------------

/** Create an n×m matrix filled with zeros. */
export function zeros(n: number, m: number): number[][] {
  return Array.from({ length: n }, () => Array(m).fill(0) as number[]);
}

/** Transpose a matrix. */
export function transpose(A: number[][]): number[][] {
  const rows = A.length;
  const cols = A[0].length;
  const T = zeros(cols, rows);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      T[j][i] = A[i][j];
    }
  }
  return T;
}

/** Multiply two matrices. */
export function matMul(A: number[][], B: number[][]): number[][] {
  const m = A.length;
  const n = B[0].length;
  const p = B.length;
  const C = zeros(m, n);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < p; k++) {
        sum += A[i][k] * B[k][j];
      }
      C[i][j] = sum;
    }
  }
  return C;
}

/**
 * Invert a square matrix using Gauss-Jordan elimination.
 * Returns null if the matrix is singular.
 */
export function invert(A: number[][]): number[][] | null {
  const n = A.length;
  // Augment with identity
  const aug = zeros(n, 2 * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      aug[i][j] = A[i][j];
    }
    aug[i][n + i] = 1;
  }

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
    }
    if (maxVal < 1e-12) return null; // Singular

    if (maxRow !== col) {
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    }

    const pivot = aug[col][col];
    for (let j = 0; j < 2 * n; j++) {
      aug[col][j] /= pivot;
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // Extract inverse
  const inv = zeros(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      inv[i][j] = aug[i][n + j];
    }
  }
  return inv;
}

// ---------------------------------------------------------------------------
// OLS regression
// ---------------------------------------------------------------------------

export interface OlsResult {
  coefficients: number[]; // β̂ (including intercept as first element)
  rSquared: number;
  adjustedRSquared: number;
  residuals: number[];
  residualStdDev: number;
  standardErrors: number[]; // standard error per coefficient
  tStatistics: number[];
  pValues: number[];
  predicted: number[];
}

/**
 * Ordinary Least Squares multivariate regression.
 *
 * @param X - Feature matrix (n × p), WITHOUT intercept column
 * @param y - Response vector (n × 1)
 * @returns OLS results or null if the system is singular
 */
export function olsRegression(X: number[][], y: number[]): OlsResult | null {
  const n = X.length;
  const p = X[0].length;

  // Add intercept column
  const Xa = X.map((row) => [1, ...row]);
  const k = p + 1; // number of coefficients including intercept

  const Xt = transpose(Xa);
  const XtX = matMul(Xt, Xa);
  const XtXinv = invert(XtX);
  if (!XtXinv) return null;

  const yCol = y.map((v) => [v]);
  const Xty = matMul(Xt, yCol);
  const betaMatrix = matMul(XtXinv, Xty);
  const coefficients = betaMatrix.map((row) => row[0]);

  // Predictions and residuals
  const predicted = Xa.map((row) =>
    row.reduce((sum, x, j) => sum + x * coefficients[j], 0),
  );
  const residuals = y.map((yi, i) => yi - predicted[i]);

  // R² and adjusted R²
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    ssRes += residuals[i] ** 2;
    ssTot += (y[i] - meanY) ** 2;
  }
  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  const adjustedRSquared =
    n - k > 0 ? 1 - ((1 - rSquared) * (n - 1)) / (n - k) : 0;

  // Residual standard deviation
  const dof = Math.max(n - k, 1);
  const mse = ssRes / dof;
  const residualStdDev = Math.sqrt(mse);

  // Standard errors of coefficients
  const standardErrors = coefficients.map((_, j) =>
    Math.sqrt(Math.max(mse * XtXinv[j][j], 0)),
  );

  // t-statistics and p-values
  const tStatistics = coefficients.map((b, j) =>
    standardErrors[j] > 0 ? b / standardErrors[j] : 0,
  );
  const pValues = tStatistics.map((t) =>
    2 * (1 - tDistributionCdf(Math.abs(t), dof)),
  );

  return {
    coefficients,
    rSquared: Math.max(0, Math.min(1, rSquared)),
    adjustedRSquared: Math.min(1, adjustedRSquared),
    residuals,
    residualStdDev,
    standardErrors,
    tStatistics,
    pValues,
  predicted,
  };
}

// ---------------------------------------------------------------------------
// Partial correlation
// ---------------------------------------------------------------------------

/**
 * Compute partial correlation between feature j and y,
 * controlling for all other features.
 *
 * Uses the residual method: regress y on all features except j,
 * regress feature j on all other features, then correlate the residuals.
 */
export function partialCorrelation(
  X: number[][],
  y: number[],
  featureIndex: number,
): number {
  const n = X.length;
  const p = X[0].length;

  if (n < 3 || p < 2) {
    // Not enough data/features for partial correlation, use simple correlation
    const xj = X.map((row) => row[featureIndex]);
    return pearsonCorrelation(xj, y);
  }

  // Build X_other: all columns except featureIndex
  const Xother = X.map((row) =>
    row.filter((_, j) => j !== featureIndex),
  );

  // Extract feature j
  const xj = X.map((row) => row[featureIndex]);

  // Regress y on X_other
  const olsY = olsRegression(Xother, y);
  if (!olsY) return 0;

  // Regress xj on X_other
  const olsXj = olsRegression(Xother, xj);
  if (!olsXj) return 0;

  // Correlate residuals
  return pearsonCorrelation(olsY.residuals, olsXj.residuals);
}

/**
 * Pearson correlation coefficient between two arrays.
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let sumXY = 0;
  let sumXX = 0;
  let sumYY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    sumXY += dx * dy;
    sumXX += dx * dx;
    sumYY += dy * dy;
  }

  const denom = Math.sqrt(sumXX * sumYY);
  return denom === 0 ? 0 : sumXY / denom;
}

// ---------------------------------------------------------------------------
// t-distribution CDF (for p-values)
// ---------------------------------------------------------------------------

/**
 * Regularized incomplete beta function using continued fraction expansion.
 * Used internally for the t-distribution CDF.
 */
function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use Lentz's continued fraction method
  const maxIter = 200;
  const eps = 1e-12;

  const lnBeta =
    lgamma(a) + lgamma(b) - lgamma(a + b);
  const prefix = Math.exp(
    a * Math.log(x) + b * Math.log(1 - x) - lnBeta,
  );

  // Continued fraction
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIter; m++) {
    // Even step
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;

    // Odd step
    aa = -((a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c;
    h *= delta;

    if (Math.abs(delta - 1) < eps) break;
  }

  return (prefix * h) / a;
}

/** Log-gamma function using Stirling's approximation (Lanczos). */
function lgamma(x: number): number {
  const coefs = [
    76.18009172947146, -86.50532032941678, 24.01409824083091,
    -1.231739572450155, 0.001208650973866179, -0.000005395239384953,
  ];

  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const c of coefs) {
    y += 1;
    ser += c / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/**
 * CDF of Student's t-distribution.
 */
export function tDistributionCdf(t: number, df: number): number {
  if (df <= 0) return 0;
  const x = df / (df + t * t);
  const ibeta = incompleteBeta(df / 2, 0.5, x);
  return t >= 0 ? 1 - 0.5 * ibeta : 0.5 * ibeta;
}

// ---------------------------------------------------------------------------
// Normality tests
// ---------------------------------------------------------------------------

/**
 * Sample skewness (Fisher's definition).
 */
export function skewness(data: number[]): number {
  const n = data.length;
  if (n < 3) return 0;
  const mean = data.reduce((a, b) => a + b, 0) / n;
  let m2 = 0;
  let m3 = 0;
  for (const x of data) {
    const d = x - mean;
    m2 += d * d;
    m3 += d * d * d;
  }
  m2 /= n;
  m3 /= n;
  const s = Math.sqrt(m2);
  return s === 0 ? 0 : m3 / (s * s * s);
}

/**
 * Sample excess kurtosis (Fisher's definition).
 */
export function kurtosis(data: number[]): number {
  const n = data.length;
  if (n < 4) return 0;
  const mean = data.reduce((a, b) => a + b, 0) / n;
  let m2 = 0;
  let m4 = 0;
  for (const x of data) {
    const d = x - mean;
    m2 += d * d;
    m4 += d * d * d * d;
  }
  m2 /= n;
  m4 /= n;
  return m2 === 0 ? 0 : m4 / (m2 * m2) - 3;
}

/**
 * Shapiro-Wilk test statistic for normality (n < 50).
 *
 * Returns { W, pValue }. The p-value is approximated.
 * Uses a simplified implementation with pre-computed coefficients.
 */
export function shapiroWilk(data: number[]): { W: number; pValue: number } {
  const n = data.length;
  if (n < 3) return { W: 1, pValue: 1 };

  const sorted = [...data].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / n;

  // Compute expected normal order statistics (approximation via Blom's formula)
  const m: number[] = [];
  for (let i = 1; i <= n; i++) {
    const p = (i - 0.375) / (n + 0.25);
    m.push(normalQuantile(p));
  }

  // Compute sum of m^2
  const mSumSq = m.reduce((a, b) => a + b * b, 0);

  // Compute a_i coefficients: a = m / ||m||
  const mNorm = Math.sqrt(mSumSq);
  const a = m.map((mi) => mi / mNorm);

  // W statistic
  let numerator = 0;
  for (let i = 0; i < n; i++) {
    numerator += a[i] * sorted[i];
  }
  numerator = numerator * numerator;

  let denominator = 0;
  for (let i = 0; i < n; i++) {
    denominator += (sorted[i] - mean) ** 2;
  }

  const W = denominator === 0 ? 1 : numerator / denominator;

  // Approximate p-value using normal approximation of ln(1-W)
  const lnW = Math.log(Math.max(1 - W, 1e-15));
  // Empirical approximation parameters
  const mu = -1.2725 + 1.0521 * Math.log(n);
  const sigma = 1.0308 - 0.26758 * Math.log(n);
  const z = (lnW - mu) / sigma;
  const pValue = Math.max(0, Math.min(1, 1 - normalCdf(z)));

  return { W: Math.max(0, Math.min(1, W)), pValue };
}

/**
 * Kolmogorov-Smirnov test for normality (n ≥ 50).
 *
 * Tests if the sample comes from a normal distribution with the sample
 * mean and standard deviation.
 */
export function kolmogorovSmirnov(data: number[]): {
  D: number;
  pValue: number;
} {
  const n = data.length;
  if (n < 2) return { D: 0, pValue: 1 };

  const mean = data.reduce((a, b) => a + b, 0) / n;
  const variance =
    data.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return { D: 0, pValue: 1 };

  const sorted = [...data].sort((a, b) => a - b);

  let D = 0;
  for (let i = 0; i < n; i++) {
    const z = (sorted[i] - mean) / stdDev;
    const cdf = normalCdf(z);
    const d1 = Math.abs((i + 1) / n - cdf);
    const d2 = Math.abs(cdf - i / n);
    D = Math.max(D, d1, d2);
  }

  // Approximate p-value using asymptotic formula
  const sqrtN = Math.sqrt(n);
  const lambda = (sqrtN + 0.12 + 0.11 / sqrtN) * D;
  let pValue = 0;
  for (let k = 1; k <= 100; k++) {
    pValue += (-1) ** (k - 1) * Math.exp(-2 * k * k * lambda * lambda);
  }
  pValue = Math.max(0, Math.min(1, 2 * pValue));

  return { D, pValue };
}

/**
 * Standard normal CDF using rational approximation (Abramowitz and Stegun).
 */
export function normalCdf(z: number): number {
  if (z < -8) return 0;
  if (z > 8) return 1;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
      t *
      Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Inverse normal CDF (quantile function) using rational approximation.
 * Beasley-Springer-Moro algorithm.
 */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  // Rational approximation for central region
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
    -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
    3.754408661907416e0,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;
  let r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
}

// ---------------------------------------------------------------------------
// Confidence interval
// ---------------------------------------------------------------------------

/**
 * Compute 95% confidence interval for the Ship Rate.
 *
 * Uses t-distribution critical value for the given degrees of freedom.
 */
export function confidenceInterval95(
  mean: number,
  standardError: number,
  n: number,
): { lower: number; upper: number } {
  const df = Math.max(n - 1, 1);
  // Find t critical value for 95% CI (two-tailed)
  const tCrit = tCriticalValue(0.025, df);
  const margin = tCrit * standardError;
  return {
    lower: mean - margin,
    upper: mean + margin,
  };
}

/**
 * Approximate t critical value using normal approximation for large df,
 * and lookup/interpolation for small df.
 */
function tCriticalValue(alpha: number, df: number): number {
  // Use Wilson-Hilferty approximation
  const z = -normalQuantile(alpha);
  if (df >= 30) {
    // Normal approximation is good enough
    return z;
  }
  // Cornish-Fisher approximation
  const g1 = (z * z * z + z) / (4 * df);
  const g2 =
    (5 * z * z * z * z * z + 16 * z * z * z + 3 * z) / (96 * df * df);
  return z + g1 + g2;
}

// ---------------------------------------------------------------------------
// Simple linear regression (for scalar Ship Rate)
// ---------------------------------------------------------------------------

/**
 * Simple linear regression: y = slope * x + intercept.
 */
export function linearRegression(
  points: Array<{ x: number; y: number }>,
): { slope: number; intercept: number; rSquared: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 };

  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: 0, rSquared: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  let ssRes = 0,
    ssTot = 0;
  for (const p of points) {
    const predicted = slope * p.x + intercept;
    ssRes += (p.y - predicted) ** 2;
    ssTot += (p.y - meanY) ** 2;
  }
  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, rSquared };
}

// ---------------------------------------------------------------------------
// Shannon entropy
// ---------------------------------------------------------------------------

/**
 * Shannon entropy of a distribution of positive values.
 * Values are normalized to sum to 1 before computing entropy.
 * Returns 0 for empty input.
 */
export function shannonEntropy(values: number[]): number {
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;

  let entropy = 0;
  for (const v of values) {
    if (v > 0) {
      const p = v / total;
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
}

/**
 * Compute the change intensity score (0-1) from normalized signals.
 *
 * @param locTotal - Total lines changed (added + deleted)
 * @param entropy - Distribution entropy
 * @param complexityDelta - Cyclomatic complexity delta (absolute value)
 * @param maxLoc - Maximum expected LOC for normalization (default 10000)
 * @param maxComplexity - Maximum expected complexity delta (default 50)
 */
export function changeIntensityScore(
  locTotal: number,
  entropy: number,
  complexityDelta: number,
  maxLoc: number = 10000,
  maxComplexity: number = 50,
): number {
  const locNorm = Math.min(locTotal / maxLoc, 1);
  const entropyNorm = Math.min(entropy / 5, 1); // log2 of 32 files max
  const complexityNorm = Math.min(
    Math.abs(complexityDelta) / maxComplexity,
    1,
  );

  // Weighted composite
  const score = 0.4 * locNorm + 0.3 * entropyNorm + 0.3 * complexityNorm;
  return Math.max(0, Math.min(1, score));
}
