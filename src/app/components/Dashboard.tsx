import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { LiveReading, BacktestResult, PortfolioResult } from '../services/OpenMeteoService';
import { summarise, INTERVENTIONS, SEVERITY_BANDS, recommend } from '../services/RecommendationEngine';
import { Pricing, PolicyTerms, formatMoney, CURRENCIES } from '../services/PricingModel';

interface DashboardProps {
  locationName: string;
  readings: LiveReading[];
  backtest: BacktestResult | null;
  pricing: Pricing | null;
  portfolio: PortfolioResult | null;
  terms: PolicyTerms;
  currency: string;
  policiesPerCell: number;
}

const Metric: React.FC<{
  label: string;
  value: string;
  unit?: string;
  note?: string;
  accent?: string;
}> = ({ label, value, unit, note, accent }) => (
  <div className="panel panel-pad">
    <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
      {label}
    </p>
    <p className="metric-value" style={{ fontSize: 30, color: accent ?? 'var(--ink)' }}>
      {value}
      {unit && (
        <span style={{ fontSize: 14, fontWeight: 500, marginLeft: 4, color: 'var(--muted)' }}>
          {unit}
        </span>
      )}
    </p>
    {note && (
      <p className="text-xs mt-2 leading-snug" style={{ color: 'var(--muted)' }}>
        {note}
      </p>
    )}
  </div>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="panel panel-pad">
    <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
      {children}
    </p>
  </div>
);

export const Dashboard: React.FC<DashboardProps> = ({
  locationName,
  readings,
  backtest,
  pricing,
  portfolio,
  terms,
  currency,
  policiesPerCell,
}) => {
  const symbol = CURRENCIES.find(c => c.code === currency)?.symbol ?? '£';
  const money = (v: number) => formatMoney(v, symbol);

  const summary = readings.length > 0 ? summarise(readings) : null;
  const hottest =
    readings.length > 0
      ? readings.reduce((a, b) => (b.surfaceTemp > a.surfaceTemp ? b : a))
      : null;
  const peakApparent =
    readings.length > 0 ? Math.max(...readings.map(r => r.apparentTemp)) : null;

  const expectedAnnualLoss = portfolio
    ? portfolio.cells.reduce(
        (s, c) => s + c.meanPaidDays * terms.payoutPerDay * policiesPerCell,
        0
      )
    : 0;

  return (
    <div className="scroll-rail h-full p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h2 className="text-lg">{locationName}</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            Live conditions, historical exceedance and indicative pricing, all from open data.
          </p>
        </div>

        {/* Live conditions */}
        <section>
          <h3 className="text-sm mb-2">Conditions right now</h3>
          {readings.length === 0 ? (
            <Empty>
              No area loaded. Switch to the map and draw an area, or search a city, to pull live
              readings.
            </Empty>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Metric
                  label="Hottest surface reading"
                  value={hottest ? hottest.surfaceTemp.toFixed(1) : '-'}
                  unit="°C"
                  accent={hottest ? recommend(hottest).severity.color : undefined}
                  note={`Across ${readings.length} sampled points`}
                />
                <Metric
                  label="Peak feels-like"
                  value={peakApparent !== null ? peakApparent.toFixed(1) : '-'}
                  unit="°C"
                  note="Combines humidity, wind and solar radiation"
                />
                <Metric
                  label="Cells needing action"
                  value={String(
                    (summary?.severityCounts.hot ?? 0) + (summary?.severityCounts.warm ?? 0)
                  )}
                  unit={`of ${readings.length}`}
                  note="Priority P1 and P2"
                />
                <Metric
                  label="Most common response"
                  value={
                    summary
                      ? (Object.entries(summary.counts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
                          '-')
                      : '-'
                  }
                  note="Chosen on feasibility, not temperature alone"
                />
              </div>

              <div className="panel panel-pad mt-3">
                <table className="w-full text-xs tnum">
                  <thead>
                    <tr style={{ color: 'var(--muted)' }}>
                      <th className="text-left font-medium pb-2">Recommended response</th>
                      <th className="text-right font-medium pb-2">Cells</th>
                      <th className="text-right font-medium pb-2">Share</th>
                      <th className="text-left font-medium pb-2 pl-4 hidden sm:table-cell">
                        Typical works
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(INTERVENTIONS).map(iv => {
                      const n = summary?.counts[iv.key] ?? 0;
                      const share = summary && summary.total > 0 ? (n / summary.total) * 100 : 0;
                      return (
                        <tr key={iv.key} className="border-t" style={{ borderColor: 'var(--rule)' }}>
                          <td className="py-2">
                            <span className="mr-2">{iv.emoji}</span>
                            {iv.label}
                          </td>
                          <td className="py-2 text-right">{n}</td>
                          <td className="py-2 text-right">{share.toFixed(0)}%</td>
                          <td
                            className="py-2 pl-4 hidden sm:table-cell"
                            style={{ color: 'var(--muted)' }}
                          >
                            {iv.examples}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="panel panel-pad mt-3">
                <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
                  Severity split
                </p>
                <div className="flex h-6 rounded overflow-hidden" style={{ background: 'var(--wash-deep)' }}>
                  {SEVERITY_BANDS.map(band => {
                    const n = summary?.severityCounts[band.key] ?? 0;
                    const share = summary && summary.total > 0 ? (n / summary.total) * 100 : 0;
                    if (share === 0) return null;
                    return (
                      <div
                        key={band.key}
                        style={{ width: `${share}%`, background: band.color }}
                        title={`${band.priority} ${band.label}: ${n} cells`}
                      />
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-3 mt-2">
                  {SEVERITY_BANDS.map(band => (
                    <span key={band.key} className="flex items-center gap-1.5 text-xs">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: band.color }}
                      />
                      <span style={{ color: 'var(--muted)' }}>
                        {band.priority} {band.label}
                      </span>
                      <span className="tnum">{summary?.severityCounts[band.key] ?? 0}</span>
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        {/* Parametric */}
        <section>
          <h3 className="text-sm mb-2">
            Parametric heat cover, trigger at {terms.thresholdC}°C
          </h3>
          {!backtest || !pricing ? (
            <Empty>
              No risk location priced yet. Open the Parametric tab and click a point on the map.
            </Empty>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Metric
                  label="Mean payout days a year"
                  value={backtest.meanPaidDays.toFixed(1)}
                  note={`${backtest.startYear} to ${backtest.endYear} reanalysis`}
                />
                <Metric
                  label="Gross annual premium"
                  value={money(pricing.grossPremium)}
                  note={`${money(terms.payoutPerDay)} a day, capped at ${terms.capDaysPerYear}`}
                />
                <Metric
                  label="Probability of a claim"
                  value={`${(pricing.probabilityOfClaim * 100).toFixed(0)}`}
                  unit="%"
                  note={`${backtest.yearsWithAnyPayout} of ${backtest.years.length} years paid`}
                />
                <Metric
                  label="Rate on line"
                  value={pricing.ratePerMille.toFixed(1)}
                  unit="per 1,000"
                  note={`Max liability ${money(pricing.maxLiability)}`}
                />
              </div>

              <div className="panel panel-pad mt-3">
                <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
                  Payout days each year, capped at {terms.capDaysPerYear}. Dashed line is the mean
                  the premium is built on.
                </p>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={backtest.years}
                      margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
                    >
                      <XAxis
                        dataKey="year"
                        tick={{ fontSize: 10, fill: '#5a6876' }}
                        tickLine={false}
                        axisLine={{ stroke: '#d3dae2' }}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#5a6876' }}
                        tickLine={false}
                        axisLine={false}
                        width={30}
                      />
                      <Tooltip
                        contentStyle={{ fontSize: 11, borderRadius: 8, borderColor: '#d3dae2' }}
                        formatter={(v: any) => [`${v} days`, 'Paid']}
                      />
                      <ReferenceLine y={backtest.meanPaidDays} stroke="#16202c" strokeDasharray="4 3" />
                      <Bar dataKey="paidDays" radius={[2, 2, 0, 0]}>
                        {backtest.years.map(y => (
                          <Cell
                            key={y.year}
                            fill={
                              y.paidDays >= terms.capDaysPerYear
                                ? '#8b0000'
                                : y.paidDays > backtest.meanPaidDays
                                  ? '#ff4500'
                                  : '#ffa500'
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="panel panel-pad mt-3">
                <table className="w-full text-xs tnum">
                  <tbody>
                    {[
                      ['Pure premium, expected payout', money(pricing.purePremium)],
                      [
                        `Risk load, ${terms.riskLoadMultiple} × standard deviation`,
                        money(pricing.riskLoad),
                      ],
                      [
                        `Expense load at ${(terms.expenseRatio * 100).toFixed(0)}% of gross`,
                        money(pricing.expenseAmount),
                      ],
                      ['Gross annual premium', money(pricing.grossPremium)],
                      ['Target loss ratio', `${(pricing.lossRatioAtMean * 100).toFixed(0)}%`],
                      ['Worst year observed', money(pricing.worstObservedPayout)],
                    ].map(([label, value], i, arr) => (
                      <tr
                        key={label}
                        className={i === arr.length - 3 ? 'border-t' : ''}
                        style={{ borderColor: 'var(--rule)' }}
                      >
                        <td className="py-1.5" style={{ color: 'var(--muted)' }}>
                          {label}
                        </td>
                        <td className="py-1.5 text-right font-medium">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {/* Portfolio */}
        <section>
          <h3 className="text-sm mb-2">Portfolio accumulation</h3>
          {!portfolio ? (
            <Empty>
              No region analysed yet. Open the Portfolio tab and draw a region to see where
              exposure concentrates.
            </Empty>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Metric
                label="Expected annual loss"
                value={money(expectedAnnualLoss)}
                note={`${(portfolio.cells.length * policiesPerCell).toLocaleString()} policies across ${portfolio.cells.length} cells`}
              />
              <Metric
                label="Regional average"
                value={portfolio.meanPaidDaysPortfolio.toFixed(1)}
                unit="days"
                note={`${portfolio.startYear} to ${portfolio.endYear}`}
              />
              <Metric
                label="Worst cell"
                value={portfolio.worstCell ? portfolio.worstCell.meanPaidDays.toFixed(1) : '-'}
                unit="days"
                note="Highest frequency cell in the region"
              />
              <Metric
                label="Concentration"
                value={
                  portfolio.worstCell && portfolio.meanPaidDaysPortfolio > 0.01
                    ? `${(portfolio.worstCell.meanPaidDays / portfolio.meanPaidDaysPortfolio).toFixed(1)}`
                    : '-'
                }
                unit="×"
                note="Worst cell against regional average"
              />
            </div>
          )}
        </section>

        <div className="hairline pt-4">
          <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
            Live conditions from the Open-Meteo Forecast API. Exceedance history from the
            Open-Meteo Historical Weather API, ECMWF reanalysis from 1940. Projections from the
            Open-Meteo Climate API, CMIP6 HighResMIP downscaled to 10 km. Every request URL is
            logged to the browser console so any figure here can be checked against the source.
          </p>
        </div>
      </div>
    </div>
  );
};
