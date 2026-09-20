import React from 'react';
import { Loader2, TrendingUp } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { BacktestResult, ProjectionResult } from '../services/OpenMeteoService';
import {
  PolicyTerms,
  Pricing,
  formatMoney,
  CURRENCIES,
} from '../services/PricingModel';

interface ParametricPanelProps {
  terms: PolicyTerms;
  onTermsChange: (t: PolicyTerms) => void;
  currency: string;
  onCurrencyChange: (c: string) => void;
  backtest: BacktestResult | null;
  pricing: Pricing | null;
  projection: ProjectionResult | null;
  projectedPricing: { scaleFactor: number; projected: Pricing } | null;
  isLoading: boolean;
  error: string | null;
}

const Row: React.FC<{ label: string; value: string; strong?: boolean; muted?: boolean }> = ({
  label,
  value,
  strong,
  muted,
}) => (
  <div className="flex items-baseline justify-between gap-3 py-0.5">
    <span className={`text-xs ${muted ? 'text-muted-foreground' : ''}`}>{label}</span>
    <span className={`text-xs tabular-nums ${strong ? 'font-semibold' : ''}`}>{value}</span>
  </div>
);

export const ParametricPanel: React.FC<ParametricPanelProps> = ({
  terms,
  onTermsChange,
  currency,
  onCurrencyChange,
  backtest,
  pricing,
  projection,
  projectedPricing,
  isLoading,
  error,
}) => {
  const symbol = CURRENCIES.find(c => c.code === currency)?.symbol ?? '£';
  const money = (v: number) => formatMoney(v, symbol);

  const set = (patch: Partial<PolicyTerms>) => onTermsChange({ ...terms, ...patch });

  return (
    <div className="space-y-3">
      {/* Policy terms */}
      <div className="panel panel-pad space-y-2">
        <h3 className="m-0 text-sm">Policy terms</h3>

        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Trigger: daily max temperature at or above
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={20}
                max={48}
                step={1}
                value={terms.thresholdC}
                onChange={e => set({ thresholdC: Number(e.target.value) })}
                className="flex-1"
              />
              <span className="text-xs tabular-nums w-12 text-right">{terms.thresholdC}°C</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Payout per day</label>
              <input
                type="number"
                min={1}
                value={terms.payoutPerDay}
                onChange={e => set({ payoutPerDay: Number(e.target.value) })}
                className="w-full text-xs border rounded px-2 py-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Currency</label>
              <select
                value={currency}
                onChange={e => onCurrencyChange(e.target.value)}
                className="w-full text-xs border rounded px-2 py-1 bg-white"
              >
                {CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.symbol} {c.code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Cap, days</label>
              <input
                type="number"
                min={1}
                max={120}
                value={terms.capDaysPerYear}
                onChange={e => set({ capDaysPerYear: Number(e.target.value) })}
                className="w-full text-xs border rounded px-2 py-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Expense</label>
              <input
                type="number"
                min={0}
                max={0.9}
                step={0.05}
                value={terms.expenseRatio}
                onChange={e => set({ expenseRatio: Number(e.target.value) })}
                className="w-full text-xs border rounded px-2 py-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Risk × SD</label>
              <input
                type="number"
                min={0}
                max={3}
                step={0.25}
                value={terms.riskLoadMultiple}
                onChange={e => set({ riskLoadMultiple: Number(e.target.value) })}
                className="w-full text-xs border rounded px-2 py-1"
              />
            </div>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="panel panel-pad">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Backtesting against the reanalysis archive
          </div>
        </div>
      )}

      {error && !isLoading && (
        <div className="panel panel-pad">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Backtest */}
      {backtest && !isLoading && (
        <div className="panel panel-pad space-y-2">
          <h3 className="m-0 text-sm">
            Backtest {backtest.startYear} to {backtest.endYear}
          </h3>

          <div className="h-32 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={backtest.years} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 9 }}
                  interval={Math.max(0, Math.floor(backtest.years.length / 6) - 1)}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={28} />
                <Tooltip
                  contentStyle={{ fontSize: 11 }}
                  formatter={(v: any) => [`${v} days`, 'Paid']}
                />
                <ReferenceLine
                  y={backtest.meanPaidDays}
                  stroke="#8B0000"
                  strokeDasharray="3 3"
                />
                <Bar dataKey="paidDays" fill="#FF4500" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="pt-1 border-t border-border">
            <Row
              label="Mean payout days a year"
              value={backtest.meanPaidDays.toFixed(1)}
              strong
            />
            <Row label="Standard deviation" value={backtest.sdPaidDays.toFixed(1)} muted />
            <Row label="Worst year" value={`${backtest.maxPaidDays} days`} muted />
            <Row
              label="Years with any payout"
              value={`${backtest.yearsWithAnyPayout} of ${backtest.years.length}`}
              muted
            />
            <Row
              label="Hottest day on record"
              value={`${backtest.hottestOnRecord}°C`}
              muted
            />
          </div>
        </div>
      )}

      {/* Pricing */}
      {pricing && backtest && !isLoading && (
        <div className="panel panel-pad space-y-2">
          <h3 className="m-0 text-sm">Indicative rate</h3>

          <div>
            <Row label="Pure premium" value={money(pricing.purePremium)} />
            <Row
              label={`Risk load, ${terms.riskLoadMultiple} × SD`}
              value={money(pricing.riskLoad)}
              muted
            />
            <Row label="Expense load" value={money(pricing.expenseAmount)} muted />
            <div className="border-t border-border mt-1 pt-1">
              <Row label="Gross annual premium" value={money(pricing.grossPremium)} strong />
            </div>
          </div>

          <div className="pt-1 border-t border-border">
            <Row label="Maximum liability" value={money(pricing.maxLiability)} muted />
            <Row
              label="Worst observed year"
              value={money(pricing.worstObservedPayout)}
              muted
            />
            <Row
              label="Probability of a claim"
              value={`${(pricing.probabilityOfClaim * 100).toFixed(0)}%`}
              muted
            />
            <Row
              label="Target loss ratio"
              value={`${(pricing.lossRatioAtMean * 100).toFixed(0)}%`}
              muted
            />
            <Row
              label="Rate on line"
              value={`${pricing.ratePerMille.toFixed(1)} per 1,000`}
              muted
            />
          </div>
        </div>
      )}

      {/* Projection */}
      {projection && projectedPricing && !isLoading && (
        <div className="panel panel-pad space-y-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-primary shrink-0" />
            <h3 className="m-0 text-sm">Repriced to {projection.futureWindow}</h3>
          </div>

          <div>
            <Row
              label={`Trigger days, ${projection.baselineWindow}`}
              value={projection.baselineDaysPerYear.toFixed(1)}
              muted
            />
            <Row
              label={`Trigger days, ${projection.futureWindow}`}
              value={projection.futureDaysPerYear.toFixed(1)}
              muted
            />
            <Row
              label="Frequency change"
              value={`${projectedPricing.scaleFactor >= 1 ? '+' : ''}${(
                (projectedPricing.scaleFactor - 1) *
                100
              ).toFixed(0)}%`}
              strong
            />
            <div className="border-t border-border mt-1 pt-1">
              <Row
                label="Gross premium, repriced"
                value={money(projectedPricing.projected.grossPremium)}
                strong
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-tight pt-1 border-t border-border">
            CMIP6 HighResMIP downscaled to 10 km, {projection.models.length} models averaged,
            close to RCP8.5. The change signal is applied as a ratio to the observed mean, so
            model bias largely cancels and only the trend carries through.
          </p>
        </div>
      )}
    </div>
  );
};
