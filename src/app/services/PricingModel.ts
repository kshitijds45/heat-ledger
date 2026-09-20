/**
 * Parametric heat cover pricing
 *
 * Standard actuarial build-up for a simple daily-indemnity parametric product:
 *
 *   Pure premium   expected annual payout, straight from the backtest
 *   Risk load      a margin for volatility, since a mean says nothing about
 *                  how bad a single bad year gets
 *   Expense load   acquisition, administration and capital cost
 *   Gross premium  what the policyholder actually pays
 *
 * Everything here is derived from the historical exceedance counts, so every
 * number on screen traces back to a public API call rather than an assumption.
 * The loadings themselves are judgement, and are exposed as inputs rather than
 * buried, because that is the honest way to present them.
 */

import { BacktestResult } from './OpenMeteoService';

export interface PolicyTerms {
  thresholdC: number;        // trigger: daily max temperature at or above this
  payoutPerDay: number;      // indemnity per triggered day
  capDaysPerYear: number;    // maximum triggered days paid in one year
  expenseRatio: number;      // proportion of gross premium consumed by expenses
  riskLoadMultiple: number;  // multiples of standard deviation added as margin
}

export const DEFAULT_TERMS: PolicyTerms = {
  thresholdC: 32,
  payoutPerDay: 75,
  capDaysPerYear: 20,
  expenseRatio: 0.25,
  riskLoadMultiple: 0.5,
};

export interface Pricing {
  purePremium: number;
  riskLoad: number;
  riskAdjusted: number;
  expenseAmount: number;
  grossPremium: number;
  maxLiability: number;
  worstObservedPayout: number;
  probabilityOfClaim: number;   // share of backtest years with at least one payout
  lossRatioAtMean: number;      // pure premium over gross, the target loss ratio
  ratePerMille: number;         // gross premium per 1000 of max liability
}

export const price = (backtest: BacktestResult, terms: PolicyTerms): Pricing => {
  const purePremium = backtest.meanPaidDays * terms.payoutPerDay;
  const riskLoad = backtest.sdPaidDays * terms.riskLoadMultiple * terms.payoutPerDay;
  const riskAdjusted = purePremium + riskLoad;

  // Expenses are expressed as a share of gross, so gross is grossed up rather
  // than simply marked up. This is the convention actual rate filings use.
  const grossPremium =
    terms.expenseRatio >= 1 ? riskAdjusted : riskAdjusted / (1 - terms.expenseRatio);

  const expenseAmount = grossPremium - riskAdjusted;
  const maxLiability = terms.capDaysPerYear * terms.payoutPerDay;

  return {
    purePremium,
    riskLoad,
    riskAdjusted,
    expenseAmount,
    grossPremium,
    maxLiability,
    worstObservedPayout: backtest.maxPaidDays * terms.payoutPerDay,
    probabilityOfClaim: backtest.yearsWithAnyPayout / backtest.years.length,
    lossRatioAtMean: grossPremium > 0 ? purePremium / grossPremium : 0,
    ratePerMille: maxLiability > 0 ? (grossPremium / maxLiability) * 1000 : 0,
  };
};

/**
 * Reprice under projected climate conditions.
 *
 * The projection gives trigger frequency per year under CMIP6 rather than a
 * payout count, so the ratio between projected and baseline frequency is
 * applied to the observed mean. Using the ratio rather than the absolute
 * projected count keeps the bias-correction issue contained: model drift
 * cancels, and only the change signal carries through.
 */
export const repriceForProjection = (
  backtest: BacktestResult,
  terms: PolicyTerms,
  baselineDaysPerYear: number,
  futureDaysPerYear: number
): { scaleFactor: number; projected: Pricing } => {
  const scaleFactor =
    baselineDaysPerYear > 0.01 ? futureDaysPerYear / baselineDaysPerYear : 1;

  const scaled: BacktestResult = {
    ...backtest,
    meanPaidDays: Math.min(backtest.meanPaidDays * scaleFactor, terms.capDaysPerYear),
    sdPaidDays: backtest.sdPaidDays * Math.sqrt(Math.max(scaleFactor, 0)),
    maxPaidDays: Math.min(
      Math.round(backtest.maxPaidDays * scaleFactor),
      terms.capDaysPerYear
    ),
  };

  return { scaleFactor, projected: price(scaled, terms) };
};

export const CURRENCIES = [
  { code: 'GBP', symbol: '£' },
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'INR', symbol: '₹' },
];

export const formatMoney = (value: number, symbol: string): string => {
  if (!isFinite(value)) return '-';
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : 2;
  return `${symbol}${value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};
