/**
 * Risk model
 *
 * The chain, in order:
 *
 *   1. Trend adjustment   shift every past year to today's climate level
 *   2. Event counting     turn daily temperature into trigger events per year
 *   3. Fitted frequency   a count distribution, so the tail can be read off
 *   4. Price              premium set so the combined ratio hits the target
 *   5. Capital check      1-in-200 year loss and the return it earns
 *
 * Because payouts are fixed by contract there is no damage to model. The only
 * uncertainty is how often the trigger fires.
 */

import { DailySeries, ModelSeries, BASELINE, FUTURE } from './ClimateData';

// ---------------------------------------------------------------------------
// Assumptions
// ---------------------------------------------------------------------------

export interface Assumptions {
  targetCombinedRatio: number;  // claims plus expenses as a share of premium
  expenseRatio: number;         // expenses as a share of premium, at the reference book size
  referencePolicies: number;    // the book size the expense ratio above refers to
  volumeDiscountPerDoubling: number; // percentage points off the expense ratio per doubling
  heatThreshold: number;       // daily maximum at or above, degC
  heatDuration: number;        // consecutive days for one heat event
  coldThreshold: number;       // daily mean at or below, degC
  coldDuration: number;        // consecutive days per cold event
  payoutPerEvent: number;      // fixed payout, pounds
  annualLimit: number;         // maximum events paid per peril per year
  adoption: number;            // share of population holding a policy
}

/**
 * Defaults. The triggers come from official UK definitions rather than
 * judgement: the Met Office heatwave definition (three days at or above
 * 28 degC for Greater London) and the Cold Weather Payment trigger (seven
 * consecutive days with mean temperature at or below 0 degC).
 */
export const DEFAULTS: Assumptions = {
  targetCombinedRatio: 0.85,
  expenseRatio: 0.3,
  referencePolicies: 10000,
  volumeDiscountPerDoubling: 0,
  heatThreshold: 28,
  heatDuration: 3,
  coldThreshold: 0,
  coldDuration: 7,
  payoutPerEvent: 100,
  annualLimit: 3,
  adoption: 0.01,
};

// ---------------------------------------------------------------------------
// 1. Trend adjustment
// ---------------------------------------------------------------------------

const yearOf = (d: string) => parseInt(d.slice(0, 4), 10);
const monthOf = (d: string) => parseInt(d.slice(5, 7), 10);

export interface TrendResult {
  adjusted: Array<number | null>;
  slopePerDecade: number;
}

/**
 * Removes the linear trend in the seasonal mean of a variable, shifting each
 * year's daily values so every year reflects the climate of the final year.
 * Uses the season that matters for the peril: summer for heat, winter for
 * cold, since the two seasons do not warm at the same rate.
 */
export function detrend(
  dates: string[],
  values: Array<number | null>,
  months: number[]
): TrendResult {
  const acc = new Map<number, { s: number; n: number }>();
  dates.forEach((d, i) => {
    const v = values[i];
    if (v === null || v === undefined || !isFinite(v)) return;
    if (!months.includes(monthOf(d))) return;
    const y = yearOf(d);
    const a = acc.get(y) ?? { s: 0, n: 0 };
    a.s += v;
    a.n += 1;
    acc.set(y, a);
  });

  const years = Array.from(acc.keys())
    .filter(y => (acc.get(y)?.n ?? 0) >= 20)
    .sort((a, b) => a - b);

  if (years.length < 5) return { adjusted: values.slice(), slopePerDecade: 0 };

  const ys = years.map(y => acc.get(y)!.s / acc.get(y)!.n);
  const xbar = years.reduce((a, b) => a + b, 0) / years.length;
  const ybar = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  years.forEach((x, i) => {
    num += (x - xbar) * (ys[i] - ybar);
    den += (x - xbar) ** 2;
  });
  const slope = den > 0 ? num / den : 0;
  const ref = years[years.length - 1];

  const adjusted = values.map((v, i) => {
    if (v === null || v === undefined || !isFinite(v)) return null;
    return v + slope * (ref - yearOf(dates[i]));
  });

  return { adjusted, slopePerDecade: slope * 10 };
}

// ---------------------------------------------------------------------------
// 2. Event counting
// ---------------------------------------------------------------------------

/**
 * Counts trigger events per calendar year.
 *
 * Heat follows the Met Office rule: a qualifying run is one heatwave however
 * long it lasts, and a new run after a break is a new heatwave.
 *
 * Cold follows the Cold Weather Payment rule: each full block of the required
 * length inside a run pays, so fourteen cold days pay twice.
 *
 * An event is assigned to the year in which it qualifies.
 */
export function countEvents(
  dates: string[],
  values: Array<number | null>,
  meets: (v: number) => boolean,
  duration: number,
  rule: 'perRun' | 'perBlock',
  startYear: number,
  endYear: number
): Map<number, number> {
  const counts = new Map<number, number>();
  for (let y = startYear; y <= endYear; y++) counts.set(y, 0);

  let run = 0;
  dates.forEach((d, i) => {
    const v = values[i];
    const ok = v !== null && v !== undefined && isFinite(v) && meets(v);
    if (!ok) {
      run = 0;
      return;
    }
    run += 1;
    const y = yearOf(d);
    if (!counts.has(y)) return;
    const qualifies = rule === 'perRun' ? run === duration : run % duration === 0;
    if (qualifies) counts.set(y, (counts.get(y) ?? 0) + 1);
  });

  return counts;
}

// ---------------------------------------------------------------------------
// 3. Fitted frequency
// ---------------------------------------------------------------------------

export interface Frequency {
  mean: number;
  variance: number;
  model: 'Poisson' | 'Negative binomial' | 'None';
}

export function fitFrequency(counts: number[]): Frequency {
  const n = counts.length;
  if (n === 0) return { mean: 0, variance: 0, model: 'None' };
  const mean = counts.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? counts.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : mean;
  if (mean <= 0) return { mean: 0, variance: 0, model: 'None' };
  // Hot summers bring several heatwaves at once, which makes counts clump.
  // Where the spread exceeds the mean, a negative binomial captures that
  // clumping and gives a heavier tail than a Poisson would.
  const model = variance > mean * 1.05 ? 'Negative binomial' : 'Poisson';
  return { mean, variance: model === 'Poisson' ? mean : variance, model };
}

/**
 * Probability of paying 0, 1, ... up to the annual limit in a year. Anything
 * above the limit is paid at the limit, so the top bucket collects that tail.
 */
export function paidDistribution(f: Frequency, limit: number): number[] {
  const out = new Array(limit + 1).fill(0);
  if (f.model === 'None' || f.mean <= 0) {
    out[0] = 1;
    return out;
  }

  const pmf: number[] = [];
  if (f.model === 'Poisson') {
    pmf[0] = Math.exp(-f.mean);
    for (let k = 1; k < limit; k++) pmf[k] = (pmf[k - 1] * f.mean) / k;
  } else {
    const r = (f.mean * f.mean) / (f.variance - f.mean);
    const p = r / (r + f.mean);
    pmf[0] = Math.pow(p, r);
    for (let k = 1; k < limit; k++) pmf[k] = (pmf[k - 1] * (k - 1 + r) * (1 - p)) / k;
  }

  let below = 0;
  for (let k = 0; k < limit; k++) {
    out[k] = pmf[k];
    below += pmf[k];
  }
  out[limit] = Math.max(0, 1 - below);
  return out;
}

const expectedValue = (dist: number[]) => dist.reduce((a, p, k) => a + p * k, 0);

/** Smallest count whose cumulative probability reaches the level. */
const percentile = (dist: number[], level: number) => {
  let c = 0;
  for (let k = 0; k < dist.length; k++) {
    c += dist[k];
    if (c >= level - 1e-12) return k;
  }
  return dist.length - 1;
};

/** Distribution of the sum of two independent paid-event distributions. */
export function convolve(a: number[], b: number[]): number[] {
  const out = new Array(a.length + b.length - 1).fill(0);
  a.forEach((pa, i) => b.forEach((pb, j) => (out[i + j] += pa * pb)));
  return out;
}

// ---------------------------------------------------------------------------
// 4 and 5. Price and capital check
// ---------------------------------------------------------------------------

export const TAIL_LEVEL = 0.995; // the Solvency II and Solvency UK 1-in-200 standard

export interface Price {
  eventsPerYear: number;       // fitted mean, uncapped
  expectedPayout: number;      // per policy per year
  expenses: number;
  expenseRatio: number;        // after any volume discount
  lossRatio: number;           // claims as a share of premium, for benchmarking
  margin: number;
  premium: number;
  tailPayout: number;          // 1-in-200 year payout per policy
  capital: number;             // tail payout minus expected payout
  returnOnCapital: number | null;
  priceable: boolean;
}

// An expense ratio cannot fall to nothing, and enough must be left for claims.
const MIN_EXPENSE_RATIO = 0.02;
const MIN_LOSS_RATIO = 0.02;

/**
 * Expense ratio after any volume discount the underwriter has set.
 *
 * Expressed as percentage points removed per doubling of the book above a
 * reference size, which is the shape real scale curves take: each doubling
 * buys roughly the same saving, not each extra policy. Setting the discount
 * to zero, the default, gives a flat expense ratio at every book size.
 *
 * The curve works in both directions. A book smaller than the reference is
 * charged a higher expense ratio by the same rule.
 */
export function effectiveExpenseRatio(a: Assumptions, policies: number): number {
  const book = Math.max(1, policies);
  const reference = Math.max(1, a.referencePolicies);
  const doublings = Math.log2(book / reference);
  const raw = a.expenseRatio - a.volumeDiscountPerDoubling * doublings;
  const ceiling = Math.max(MIN_EXPENSE_RATIO, a.targetCombinedRatio - MIN_LOSS_RATIO);
  return Math.min(ceiling, Math.max(MIN_EXPENSE_RATIO, raw));
}

/**
 * Premium is solved so the combined ratio lands exactly on the target.
 *
 *   claims + expenses = target combined ratio x premium
 *
 * With expenses a share of premium, the loss ratio is simply what the target
 * leaves after expenses, and the premium follows directly.
 */
export function priceFrom(
  dist: number[],
  eventsPerYear: number,
  a: Assumptions,
  policies: number
): Price {
  const expectedPayout = expectedValue(dist) * a.payoutPerEvent;
  const tailPayout = percentile(dist, TAIL_LEVEL) * a.payoutPerEvent;

  const expenseRatio = effectiveExpenseRatio(a, policies);
  const lossRatio = a.targetCombinedRatio - expenseRatio;
  const priceable = lossRatio > 0 && expectedPayout > 0;

  const premium = priceable ? expectedPayout / lossRatio : 0;
  const expenses = premium * expenseRatio;
  const margin = premium * (1 - a.targetCombinedRatio);
  const capital = Math.max(0, tailPayout - expectedPayout);

  return {
    eventsPerYear,
    expectedPayout,
    expenses,
    expenseRatio,
    lossRatio,
    margin,
    premium,
    tailPayout,
    capital,
    returnOnCapital: priceable && capital > 0 ? margin / capital : null,
    priceable,
  };
}

// ---------------------------------------------------------------------------
// Assembling a full result for one location
// ---------------------------------------------------------------------------

export interface PerilResult {
  observed: Map<number, number>;
  adjusted: Map<number, number>;
  frequency: Frequency;
  dist: number[];
  price: Price;
  slopePerDecade: number;
  observedMean: number;
}

const HEAT_MONTHS = [6, 7, 8];
const COLD_MONTHS = [12, 1, 2];

function analysePeril(
  series: DailySeries,
  peril: 'heat' | 'cold',
  a: Assumptions,
  startYear: number,
  endYear: number,
  policies: number
): PerilResult {
  const values = peril === 'heat' ? series.tmax : series.tmean;
  const meets =
    peril === 'heat' ? (v: number) => v >= a.heatThreshold : (v: number) => v <= a.coldThreshold;
  const duration = peril === 'heat' ? a.heatDuration : a.coldDuration;
  const rule = peril === 'heat' ? 'perRun' : 'perBlock';

  const observed = countEvents(series.dates, values, meets, duration, rule, startYear, endYear);

  const trend = detrend(series.dates, values, peril === 'heat' ? HEAT_MONTHS : COLD_MONTHS);
  const adjusted = countEvents(series.dates, trend.adjusted, meets, duration, rule, startYear, endYear);

  const frequency = fitFrequency(Array.from(adjusted.values()));
  const dist = paidDistribution(frequency, a.annualLimit);

  const obs = Array.from(observed.values());
  return {
    observed,
    adjusted,
    frequency,
    dist,
    price: priceFrom(dist, frequency.mean, a, policies),
    slopePerDecade: trend.slopePerDecade,
    observedMean: obs.reduce((x, y) => x + y, 0) / Math.max(1, obs.length),
  };
}

export interface LocationResult {
  heat: PerilResult;
  cold: PerilResult;
  combined: Price;
  combinedDist: number[];
}

export function analyse(
  series: DailySeries,
  a: Assumptions,
  startYear: number,
  endYear: number,
  policies: number
): LocationResult {
  const heat = analysePeril(series, 'heat', a, startYear, endYear, policies);
  const cold = analysePeril(series, 'cold', a, startYear, endYear, policies);

  // Heat and cold fall in different seasons, so they are treated as
  // independent. Combining them in one book diversifies the tail.
  const combinedDist = convolve(heat.dist, cold.dist);
  const combined = priceFrom(
    combinedDist,
    heat.frequency.mean + cold.frequency.mean,
    a,
    policies
  );

  return { heat, cold, combined, combinedDist };
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

export interface ProjectionResult {
  heatScale: number | null;
  coldScale: number | null;
  heatPremium: number | null;
  coldPremium: number | null;
  combinedPremium: number | null;
}

function windowRate(counts: Map<number, number>, start: number, end: number): number {
  let s = 0;
  let n = 0;
  counts.forEach((c, y) => {
    if (y >= start && y <= end) {
      s += c;
      n += 1;
    }
  });
  return n > 0 ? s / n : 0;
}

/**
 * Climate models run warm or cold against observed weather, so projected event
 * counts are not used directly. Each model's own baseline is compared with its
 * own future, and that ratio is applied to the observed, trend-adjusted
 * frequency. Model bias largely cancels in the ratio.
 */
function scaleFor(
  models: ModelSeries,
  peril: 'heat' | 'cold',
  a: Assumptions
): number | null {
  const ratios: number[] = [];
  Object.values(models).forEach(series => {
    const values = peril === 'heat' ? series.tmax : series.tmean;
    const meets =
      peril === 'heat' ? (v: number) => v >= a.heatThreshold : (v: number) => v <= a.coldThreshold;
    const duration = peril === 'heat' ? a.heatDuration : a.coldDuration;
    const rule = peril === 'heat' ? 'perRun' : 'perBlock';
    const counts = countEvents(series.dates, values, meets, duration, rule, BASELINE.start, FUTURE.end);
    const base = windowRate(counts, BASELINE.start, BASELINE.end);
    const fut = windowRate(counts, FUTURE.start, FUTURE.end);
    if (base > 0) ratios.push(fut / base);
  });
  if (ratios.length === 0) return null;
  return ratios.reduce((x, y) => x + y, 0) / ratios.length;
}

function scaledPrice(peril: PerilResult, scale: number, a: Assumptions, policies: number): { price: Price; dist: number[] } {
  const f = peril.frequency;
  if (f.model === 'None') return { price: peril.price, dist: peril.dist };
  const dispersion = f.variance / f.mean;
  const mean = f.mean * scale;
  const scaled: Frequency = {
    mean,
    variance: mean * dispersion,
    model: dispersion > 1.05 ? 'Negative binomial' : 'Poisson',
  };
  const dist = paidDistribution(scaled, a.annualLimit);
  return { price: priceFrom(dist, mean, a, policies), dist };
}

export function project(
  base: LocationResult,
  models: ModelSeries,
  a: Assumptions,
  policies: number
): ProjectionResult {
  const heatScale = scaleFor(models, 'heat', a);
  const coldScale = scaleFor(models, 'cold', a);

  const heat = heatScale !== null ? scaledPrice(base.heat, heatScale, a, policies) : null;
  const cold = coldScale !== null ? scaledPrice(base.cold, coldScale, a, policies) : null;

  let combinedPremium: number | null = null;
  if (heat || cold) {
    const hd = heat ? heat.dist : base.heat.dist;
    const cd = cold ? cold.dist : base.cold.dist;
    combinedPremium = priceFrom(convolve(hd, cd), 0, a, policies).premium;
  }

  return {
    heatScale,
    coldScale,
    heatPremium: heat ? heat.price.premium : null,
    coldPremium: cold ? cold.price.premium : null,
    combinedPremium,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export const gbp = (v: number, dp?: number): string => {
  if (!isFinite(v)) return '-';
  const d = dp ?? (Math.abs(v) >= 100 ? 0 : 2);
  return `£${v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};

export const compact = (v: number): string => {
  if (!isFinite(v)) return '-';
  const abs = Math.abs(v);
  if (abs >= 1e9) return `£${(v / 1e9).toFixed(2)}bn`;
  if (abs >= 1e6) return `£${(v / 1e6).toFixed(1)}m`;
  if (abs >= 1e3) return `£${(v / 1e3).toFixed(0)}k`;
  return gbp(v, 0);
};

export const pct = (v: number | null, dp = 0): string =>
  v === null || !isFinite(v) ? '-' : `${(v * 100).toFixed(dp)}%`;
