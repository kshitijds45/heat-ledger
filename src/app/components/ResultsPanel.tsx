import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, RotateCcw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import {
  Assumptions,
  LocationResult,
  ProjectionResult,
  Price,
  gbp,
  compact,
  pct,
} from '../services/RiskModel';
import { POPULATION_YEAR } from '../services/ClimateData';

interface ResultsPanelProps {
  locationName: string;
  indexPoint: { lat: number; lon: number };
  startYear: number;
  endYear: number;
  loading: boolean;
  error: string | null;
  result: LocationResult | null;
  projection: ProjectionResult | null;
  projectionLoading: boolean;
  projectionError: string | null;
  assumptions: Assumptions;
  onAssumptionsChange: (a: Assumptions) => void;
  onReset: () => void;
  isDefault: boolean;
  population: number | null;
  populationLoading: boolean;
  populationError: string | null;
  onManualPopulation: (n: number) => void;
}

const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`;

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

const Field: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  prefix?: string;
}> = ({ label, value, onChange, step = 1, min, max, suffix, prefix }) => (
  <label className="block">
    <span className="text-xs block mb-1" style={{ color: 'var(--muted)' }}>
      {label}
    </span>
    <div className="flex items-center gap-1">
      {prefix && <span className="text-xs" style={{ color: 'var(--muted)' }}>{prefix}</span>}
      <input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        step={step}
        min={min}
        max={max}
        onChange={e => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="w-full text-xs px-2 py-1.5"
      />
      {suffix && <span className="text-xs whitespace-nowrap" style={{ color: 'var(--muted)' }}>{suffix}</span>}
    </div>
  </label>
);

const Section: React.FC<{ title: string; children: React.ReactNode; aside?: React.ReactNode }> = ({
  title,
  children,
  aside,
}) => (
  <div className="panel panel-pad">
    <div className="flex items-baseline justify-between gap-2 mb-2">
      <h3 className="text-sm">{title}</h3>
      {aside}
    </div>
    {children}
  </div>
);

const Line: React.FC<{ label: string; value: string; strong?: boolean; note?: string }> = ({
  label,
  value,
  strong,
  note,
}) => (
  <div className="flex items-baseline justify-between gap-3 py-1">
    <span className="text-xs" style={{ color: strong ? 'var(--ink)' : 'var(--muted)' }}>
      {label}
      {note && <span className="block" style={{ color: 'var(--muted)', fontSize: 11 }}>{note}</span>}
    </span>
    <span className={`text-xs tnum text-right ${strong ? 'font-semibold' : ''}`}>{value}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export const ResultsPanel: React.FC<ResultsPanelProps> = props => {
  const {
    locationName,
    indexPoint,
    startYear,
    endYear,
    loading,
    error,
    result,
    projection,
    projectionLoading,
    projectionError,
    assumptions: a,
    onAssumptionsChange,
    onReset,
    isDefault,
    population,
    populationLoading,
    populationError,
    onManualPopulation,
  } = props;

  const [open, setOpen] = useState(false);
  const [manualPop, setManualPop] = useState('');
  const set = (patch: Partial<Assumptions>) => onAssumptionsChange({ ...a, ...patch });

  const lossRatio = a.targetCombinedRatio - a.expenseRatio;
  const invalid = lossRatio <= 0;

  const cell = (p: Price, pick: (p: Price) => string) =>
    !p.priceable ? '-' : pick(p);

  const rows: Array<{ label: string; pick: (p: Price) => string; strong?: boolean }> = [
    { label: 'Events a year, today’s climate', pick: p => p.eventsPerYear.toFixed(2) },
    { label: 'Expected payout', pick: p => gbp(p.expectedPayout) },
    { label: `Expenses, ${pct(a.expenseRatio)}`, pick: p => gbp(p.expenses) },
    { label: `Margin, ${pct(1 - a.targetCombinedRatio)}`, pick: p => gbp(p.margin) },
    { label: 'Annual premium', pick: p => gbp(p.premium), strong: true },
    { label: '1-in-200 year payout', pick: p => gbp(p.tailPayout, 0) },
    { label: 'Return on capital', pick: p => pct(p.returnOnCapital) },
  ];

  const policies = population !== null ? Math.round(population * a.adoption) : null;

  const chartData = result
    ? Array.from(result.heat.observed.keys()).map(y => ({
        year: y,
        Heat: result.heat.observed.get(y) ?? 0,
        Cold: result.cold.observed.get(y) ?? 0,
      }))
    : [];

  const separateTail = result ? result.heat.price.tailPayout + result.cold.price.tailPayout : 0;

  return (
    <div className="space-y-3">
      {/* Location */}
      <div className="px-1">
        <h2 className="text-base leading-tight">{locationName}</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
          Index point {indexPoint.lat.toFixed(3)}, {indexPoint.lon.toFixed(3)} · {startYear} to{' '}
          {endYear} record
        </p>
      </div>

      {/* Assumptions drawer */}
      <div className="panel">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between px-3.5 py-2.5 text-left"
          style={{ background: 'transparent', border: 0, cursor: 'pointer' }}
          aria-expanded={open}
        >
          <span className="text-sm" style={{ fontFamily: 'Archivo, sans-serif', fontWeight: 600 }}>
            Assumptions
            {!isDefault && (
              <span className="chip ml-2" style={{ color: 'var(--heat-warm)', borderColor: 'var(--heat-warm)' }}>
                edited
              </span>
            )}
          </span>
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>

        {!open && (
          <p className="text-xs px-3.5 pb-3 -mt-1" style={{ color: 'var(--muted)' }}>
            Heat: {a.heatDuration}+ days at {a.heatThreshold}°C or above. Cold: each{' '}
            {a.coldDuration} days at a mean of {a.coldThreshold}°C or below. {gbp(a.payoutPerEvent, 0)}{' '}
            per event, priced to a {pct(a.targetCombinedRatio)} combined ratio.
          </p>
        )}

        {open && (
          <div className="px-3.5 pb-3.5 space-y-3">
            <div>
              <p className="text-xs font-medium mb-2">Pricing target</p>
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Combined ratio"
                  value={Math.round(a.targetCombinedRatio * 100)}
                  onChange={v => set({ targetCombinedRatio: v / 100 })}
                  min={40}
                  max={120}
                  suffix="%"
                />
                <Field
                  label="Expense ratio"
                  value={Math.round(a.expenseRatio * 100)}
                  onChange={v => set({ expenseRatio: v / 100 })}
                  min={0}
                  max={80}
                  suffix="%"
                />
              </div>
              {invalid && (
                <p className="text-xs mt-2 text-red-700">
                  The combined ratio must be higher than the expense ratio, or there is nothing left
                  to pay claims with.
                </p>
              )}
            </div>

            <div className="hairline pt-3">
              <p className="text-xs font-medium mb-2">Heatwave trigger</p>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Daily max at or above" value={a.heatThreshold} onChange={v => set({ heatThreshold: v })} suffix="°C" step={0.5} />
                <Field label="For at least" value={a.heatDuration} onChange={v => set({ heatDuration: Math.max(1, Math.round(v)) })} min={1} max={14} suffix="days" />
              </div>
            </div>

            <div className="hairline pt-3">
              <p className="text-xs font-medium mb-2">Cold wave trigger</p>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Daily mean at or below" value={a.coldThreshold} onChange={v => set({ coldThreshold: v })} suffix="°C" step={0.5} />
                <Field label="Each run of" value={a.coldDuration} onChange={v => set({ coldDuration: Math.max(1, Math.round(v)) })} min={1} max={21} suffix="days" />
              </div>
            </div>

            <div className="hairline pt-3">
              <p className="text-xs font-medium mb-2">Cover and uptake</p>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Payout per event" value={a.payoutPerEvent} onChange={v => set({ payoutPerEvent: Math.max(1, v) })} prefix="£" min={1} />
                <Field label="Max events a year" value={a.annualLimit} onChange={v => set({ annualLimit: Math.max(1, Math.round(v)) })} min={1} max={20} />
                <Field label="Adoption" value={+(a.adoption * 100).toFixed(2)} onChange={v => set({ adoption: Math.max(0, v) / 100 })} step={0.1} min={0} max={100} suffix="%" />
              </div>
            </div>

            {!isDefault && (
              <button
                onClick={onReset}
                className="text-xs inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md"
                style={{ border: '1px solid var(--rule)', background: 'var(--paper)', cursor: 'pointer' }}
              >
                <RotateCcw className="size-3" />
                Reset to defaults
              </button>
            )}
          </div>
        )}
      </div>

      {loading && (
        <div className="panel panel-pad flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
          <Loader2 className="size-4 animate-spin" />
          Reading {endYear - startYear + 1} years of daily temperature
        </div>
      )}

      {error && !loading && (
        <div className="panel panel-pad">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {result && !loading && !invalid && (
        <>
          {/* Price per policy */}
          <Section title="Price per policy">
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs tnum" style={{ minWidth: 280 }}>
                <thead>
                  <tr style={{ color: 'var(--muted)' }}>
                    <th className="text-left font-medium pb-1.5 pl-1" />
                    <th className="text-right font-medium pb-1.5">
                      <span className="inline-flex items-center gap-1">
                        <span className="size-2 rounded-full" style={{ background: 'var(--heat-warm)' }} />
                        Heat
                      </span>
                    </th>
                    <th className="text-right font-medium pb-1.5">
                      <span className="inline-flex items-center gap-1">
                        <span className="size-2 rounded-full" style={{ background: 'var(--heat-cool)' }} />
                        Cold
                      </span>
                    </th>
                    <th className="text-right font-medium pb-1.5 pr-1">Both</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr
                      key={r.label}
                      className="border-t"
                      style={{ borderColor: 'var(--rule)', fontWeight: r.strong ? 600 : 400 }}
                    >
                      <td className="py-1.5 pl-1 pr-2" style={{ color: r.strong ? 'var(--ink)' : 'var(--muted)' }}>
                        {r.label}
                      </td>
                      <td className="py-1.5 text-right">{cell(result.heat.price, r.pick)}</td>
                      <td className="py-1.5 text-right">{cell(result.cold.price, r.pick)}</td>
                      <td className="py-1.5 text-right pr-1">{cell(result.combined, r.pick)}</td>
                    </tr>
                  ))}
                  <tr className="border-t" style={{ borderColor: 'var(--rule)' }}>
                    <td className="py-1.5 pl-1 pr-2" style={{ color: 'var(--muted)' }}>
                      Premium on 2031 to 2050 climate
                    </td>
                    {projectionLoading ? (
                      <td colSpan={3} className="py-1.5 text-right pr-1" style={{ color: 'var(--muted)' }}>
                        <Loader2 className="size-3 animate-spin inline" /> projecting
                      </td>
                    ) : projectionError ? (
                      <td colSpan={3} className="py-1.5 text-right pr-1" style={{ color: 'var(--muted)' }}>
                        unavailable
                      </td>
                    ) : (
                      <>
                        <td className="py-1.5 text-right">
                          {result.heat.price.priceable && projection?.heatPremium != null ? gbp(projection.heatPremium) : '-'}
                        </td>
                        <td className="py-1.5 text-right">
                          {result.cold.price.priceable && projection?.coldPremium != null ? gbp(projection.coldPremium) : '-'}
                        </td>
                        <td className="py-1.5 text-right pr-1">
                          {projection?.combinedPremium != null && result.combined.priceable ? gbp(projection.combinedPremium) : '-'}
                        </td>
                      </>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="text-xs mt-3 pt-2 hairline leading-relaxed space-y-1.5" style={{ color: 'var(--muted)' }}>
              <p>
                Priced to a {pct(a.targetCombinedRatio)} combined ratio: {pct(lossRatio)} of premium
                pays claims, {pct(a.expenseRatio)} covers expenses and {pct(1 - a.targetCombinedRatio)} is
                margin. Return on capital is that margin against the capital needed to survive a
                1-in-200 year.
              </p>
              {(!result.heat.price.priceable || !result.cold.price.priceable) && (
                <p>
                  A dash means no qualifying event in {endYear - startYear + 1} years. That is not zero
                  risk. It means this record cannot support a price at this trigger.
                </p>
              )}
              {result.heat.price.priceable &&
                result.cold.price.priceable &&
                result.combined.tailPayout < separateTail && (
                  <p>
                    Writing both in one book cuts the 1-in-200 payout from {gbp(separateTail, 0)} to{' '}
                    {gbp(result.combined.tailPayout, 0)}, because the perils fall in different seasons.
                  </p>
                )}
            </div>
          </Section>

          {/* Portfolio */}
          <Section title="Portfolio" aside={<span className="text-xs" style={{ color: 'var(--muted)' }}>heat and cold together</span>}>
            {populationLoading ? (
              <div className="flex items-center gap-2 text-xs py-1" style={{ color: 'var(--muted)' }}>
                <Loader2 className="size-3.5 animate-spin" />
                Estimating population
              </div>
            ) : population === null ? (
              <div className="space-y-2">
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  {populationError
                    ? 'The population service did not respond. Enter a population for this area to continue.'
                    : 'Enter a population for this area.'}
                </p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0}
                    placeholder="e.g. 9000000"
                    value={manualPop}
                    onChange={e => setManualPop(e.target.value)}
                    className="flex-1 text-xs px-2 py-1.5"
                  />
                  <button
                    onClick={() => {
                      const n = parseFloat(manualPop);
                      if (isFinite(n) && n > 0) onManualPopulation(Math.round(n));
                    }}
                    className="text-xs px-3 py-1.5 rounded-md font-medium"
                    style={{ background: 'var(--ink)', color: '#fff', border: 0, cursor: 'pointer' }}
                  >
                    Use
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Line label="Population" value={Math.round(population).toLocaleString('en-GB')} note={`WorldPop ${POPULATION_YEAR} estimate`} />
                <Line label="Policies in force" value={(policies ?? 0).toLocaleString('en-GB')} note={`${pct(a.adoption, a.adoption < 0.01 ? 2 : 1)} adoption`} />
                <div className="hairline mt-1 pt-1">
                  <Line label="Premium income" value={result.combined.priceable ? compact((policies ?? 0) * result.combined.premium) : '-'} strong />
                  <Line label="Expected annual payout" value={compact((policies ?? 0) * result.combined.expectedPayout)} />
                  <Line label="1-in-200 year payout" value={compact((policies ?? 0) * result.combined.tailPayout)} />
                </div>
                <p className="text-xs mt-2 pt-2 hairline leading-relaxed" style={{ color: 'var(--muted)' }}>
                  Every policy here pays on the same reading, so all of them trigger together. The
                  1-in-200 year payout is the whole book paying at once, and it is the figure an
                  insurer has to hold capital against.
                </p>
              </>
            )}
          </Section>

          {/* History */}
          <Section title="Events each year">
            <div className="h-40 -ml-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <XAxis dataKey="year" tick={{ fontSize: 9, fill: '#5a6876' }} tickLine={false} axisLine={{ stroke: '#d3dae2' }} interval={4} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: '#5a6876' }} tickLine={false} axisLine={false} width={24} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, borderColor: '#d3dae2' }} cursor={{ fill: 'rgba(22,32,44,0.05)' }} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Heat" fill="#ff4500" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Cold" fill="#4169e1" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--muted)' }}>
              As recorded. The summer trend here is {signed(result.heat.slopePerDecade)}°C a decade and the
              winter trend {signed(result.cold.slopePerDecade)}°C a decade. Before pricing, each year is adjusted to today’s climate, which gives{' '}
              {result.heat.frequency.mean.toFixed(2)} heat events a year against{' '}
              {result.heat.observedMean.toFixed(2)} as recorded, and{' '}
              {result.cold.frequency.mean.toFixed(2)} cold against {result.cold.observedMean.toFixed(2)}.
            </p>
          </Section>
        </>
      )}
    </div>
  );
};
