import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, RotateCcw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import {
  Assumptions,
  effectiveExpenseRatio,
  LocationResult,
  ProjectionResult,
  Price,
  gbp,
  compact,
  pct,
} from '../services/RiskModel';
import { POPULATION_YEAR } from '../services/ClimateData';

export type Peril = 'heat' | 'cold' | 'both';

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
  policies: number | null;
  peril: Peril;
  onPerilChange: (p: Peril) => void;
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
    <span className="text-xs block mb-1" style={{ color: 'var(--muted)' }}>{label}</span>
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
    policies,
    peril,
    onPerilChange,
    population,
    populationLoading,
    populationError,
    onManualPopulation,
  } = props;

  // Open by default: the assumptions are the product, not a hidden setting.
  const [open, setOpen] = useState(true);
  const [manualPop, setManualPop] = useState('');
  const set = (patch: Partial<Assumptions>) => onAssumptionsChange({ ...a, ...patch });

  const invalid = a.targetCombinedRatio - a.expenseRatio <= 0;
  const book = policies ?? a.referencePolicies;
  const discountOn = a.volumeDiscountPerDoubling > 0;

  const showHeat = peril !== 'cold';
  const showCold = peril !== 'heat';
  const showBoth = peril === 'both';

  const selected: Price | null = result
    ? peril === 'heat'
      ? result.heat.price
      : peril === 'cold'
        ? result.cold.price
        : result.combined
    : null;

  const projectedSelected =
    projection === null
      ? null
      : peril === 'heat'
        ? projection.heatPremium
        : peril === 'cold'
          ? projection.coldPremium
          : projection.combinedPremium;

  const rows: Array<{ label: string; pick: (p: Price) => string; strong?: boolean }> = [
    { label: 'Events a year, today’s climate', pick: p => p.eventsPerYear.toFixed(2) },
    { label: 'Expected payout', pick: p => gbp(p.expectedPayout) },
    { label: 'Expenses', pick: p => gbp(p.expenses) },
    { label: `Margin, ${pct(1 - a.targetCombinedRatio)}`, pick: p => gbp(p.margin) },
    { label: 'Annual premium', pick: p => gbp(p.premium), strong: true },
    { label: 'Loss ratio', pick: p => pct(p.lossRatio) },
    { label: 'Expense ratio', pick: p => pct(p.expenseRatio) },
    { label: '1-in-200 year payout', pick: p => gbp(p.tailPayout, 0) },
    { label: 'Return on capital', pick: p => pct(p.returnOnCapital) },
  ];

  const cell = (p: Price, pick: (p: Price) => string) => (p.priceable ? pick(p) : '-');


  const chartData = result
    ? Array.from(result.heat.observed.keys()).map(y => ({
        year: y,
        Heat: result.heat.observed.get(y) ?? 0,
        Cold: result.cold.observed.get(y) ?? 0,
      }))
    : [];

  const separateTail = result ? result.heat.price.tailPayout + result.cold.price.tailPayout : 0;
  const capitalSaved = result ? separateTail - result.combined.tailPayout : 0;

  return (
    <div className="space-y-3">
      {/* Location */}
      <div className="px-1">
        <h2 className="text-base leading-tight">{locationName}</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
          Index point {indexPoint.lat.toFixed(3)}, {indexPoint.lon.toFixed(3)} · {startYear} to {endYear} record
        </p>
      </div>

      {/* Cover selector */}
      <div className="panel panel-pad">
        <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>Cover written</p>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            ['heat', 'Heat only'],
            ['cold', 'Cold only'],
            ['both', 'Both'],
          ] as Array<[Peril, string]>).map(([key, label]) => (
            <button
              key={key}
              onClick={() => onPerilChange(key)}
              aria-pressed={peril === key}
              className="text-xs font-medium py-1.5 rounded-md"
              style={{
                background: peril === key ? 'var(--ink)' : 'var(--paper)',
                color: peril === key ? '#fff' : 'var(--ink)',
                border: `1px solid ${peril === key ? 'var(--ink)' : 'var(--rule)'}`,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Assumptions */}
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

        {open && (
          <div className="px-3.5 pb-3.5 space-y-3">
            <div>
              <p className="text-xs font-medium mb-2">Pricing target</p>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Combined ratio" value={Math.round(a.targetCombinedRatio * 100)} onChange={v => set({ targetCombinedRatio: v / 100 })} min={40} max={120} suffix="%" />
                <Field label="Expense ratio" value={Math.round(a.expenseRatio * 100)} onChange={v => set({ expenseRatio: v / 100 })} min={0} max={80} suffix="%" />
              </div>
              {invalid && (
                <p className="text-xs mt-2 text-red-700">
                  The combined ratio must be higher than the expense ratio, or there is nothing left to
                  pay claims with.
                </p>
              )}
              <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
                At {pct(a.targetCombinedRatio)} combined and {pct(a.expenseRatio)} expenses, claims take{' '}
                {pct(a.targetCombinedRatio - a.expenseRatio)} of premium. The FCA reports UK motor at 54%
                and home at 46%, against 4% for GAP add-ons.
              </p>

              <div className="hairline pt-3 mt-3">
                <p className="text-xs font-medium mb-2">Volume discount, optional</p>
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Points off per doubling"
                    value={+(a.volumeDiscountPerDoubling * 100).toFixed(1)}
                    onChange={v => set({ volumeDiscountPerDoubling: Math.max(0, v) / 100 })}
                    step={0.5}
                    min={0}
                    max={10}
                    suffix="pp"
                  />
                  <Field
                    label="Reference book size"
                    value={a.referencePolicies}
                    onChange={v => set({ referencePolicies: Math.max(1, Math.round(v)) })}
                    step={1000}
                    min={1}
                  />
                </div>
                <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
                  {discountOn ? (
                    <>
                      The expense ratio is {pct(a.expenseRatio)} at{' '}
                      {a.referencePolicies.toLocaleString('en-GB')} policies and moves by{' '}
                      {(a.volumeDiscountPerDoubling * 100).toFixed(1)} points with each doubling or
                      halving of the book. At {book.toLocaleString('en-GB')} policies it is{' '}
                      {pct(effectiveExpenseRatio(a, book), 1)}.
                    </>
                  ) : (
                    'Zero means a flat expense ratio at every book size. Set a figure to apply your own scale curve, which raises the price for small books as well as lowering it for large ones.'
                  )}
                </p>
              </div>
            </div>

            {showHeat && (
              <div className="hairline pt-3">
                <p className="text-xs font-medium mb-2">Heatwave trigger</p>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Daily max at or above" value={a.heatThreshold} onChange={v => set({ heatThreshold: v })} suffix="°C" step={0.5} />
                  <Field label="For at least" value={a.heatDuration} onChange={v => set({ heatDuration: Math.max(1, Math.round(v)) })} min={1} max={14} suffix="days" />
                </div>
              </div>
            )}

            {showCold && (
              <div className="hairline pt-3">
                <p className="text-xs font-medium mb-2">Cold wave trigger</p>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Daily mean at or below" value={a.coldThreshold} onChange={v => set({ coldThreshold: v })} suffix="°C" step={0.5} />
                  <Field label="Each run of" value={a.coldDuration} onChange={v => set({ coldDuration: Math.max(1, Math.round(v)) })} min={1} max={21} suffix="days" />
                </div>
              </div>
            )}

            <div className="hairline pt-3">
              <p className="text-xs font-medium mb-2">Cover and uptake</p>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Payout per event" value={a.payoutPerEvent} onChange={v => set({ payoutPerEvent: Math.max(1, v) })} prefix="£" min={1} />
                <Field label="Max events a year" value={a.annualLimit} onChange={v => set({ annualLimit: Math.max(1, Math.round(v)) })} min={1} max={20} />
                <Field label="Adoption" value={+(a.adoption * 100).toFixed(2)} onChange={v => set({ adoption: Math.max(0, v) / 100 })} step={0.1} min={0} max={100} suffix="%" />
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
                Payout scales every money figure and leaves every ratio unchanged. Adoption changes the
                portfolio only, never the price of a single policy.
              </p>
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

      {result && selected && !loading && !invalid && (
        <>
          {/* Price per policy */}
          <Section title="Price per policy">
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs tnum" style={{ minWidth: 240 }}>
                <thead>
                  <tr style={{ color: 'var(--muted)' }}>
                    <th className="text-left font-medium pb-1.5 pl-1" />
                    {showHeat && (
                      <th className="text-right font-medium pb-1.5">
                        <span className="inline-flex items-center gap-1">
                          <span className="size-2 rounded-full" style={{ background: 'var(--heat-warm)' }} />
                          Heat
                        </span>
                      </th>
                    )}
                    {showCold && (
                      <th className="text-right font-medium pb-1.5">
                        <span className="inline-flex items-center gap-1">
                          <span className="size-2 rounded-full" style={{ background: 'var(--heat-cool)' }} />
                          Cold
                        </span>
                      </th>
                    )}
                    {showBoth && <th className="text-right font-medium pb-1.5 pr-1">Both</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.label} className="border-t" style={{ borderColor: 'var(--rule)', fontWeight: r.strong ? 600 : 400 }}>
                      <td className="py-1.5 pl-1 pr-2" style={{ color: r.strong ? 'var(--ink)' : 'var(--muted)' }}>
                        {r.label}
                      </td>
                      {showHeat && <td className="py-1.5 text-right">{cell(result.heat.price, r.pick)}</td>}
                      {showCold && <td className="py-1.5 text-right">{cell(result.cold.price, r.pick)}</td>}
                      {showBoth && <td className="py-1.5 text-right pr-1">{cell(result.combined, r.pick)}</td>}
                    </tr>
                  ))}
                  <tr className="border-t" style={{ borderColor: 'var(--rule)' }}>
                    <td className="py-1.5 pl-1 pr-2" style={{ color: 'var(--muted)' }}>
                      Premium on 2031 to 2050 climate
                    </td>
                    {projectionLoading || projectionError ? (
                      <td colSpan={3} className="py-1.5 text-right pr-1" style={{ color: 'var(--muted)' }}>
                        {projectionLoading ? (
                          <>
                            <Loader2 className="size-3 animate-spin inline" /> projecting
                          </>
                        ) : (
                          'unavailable'
                        )}
                      </td>
                    ) : (
                      <>
                        {showHeat && (
                          <td className="py-1.5 text-right">
                            {result.heat.price.priceable && projection?.heatPremium != null ? gbp(projection.heatPremium) : '-'}
                          </td>
                        )}
                        {showCold && (
                          <td className="py-1.5 text-right">
                            {result.cold.price.priceable && projection?.coldPremium != null ? gbp(projection.coldPremium) : '-'}
                          </td>
                        )}
                        {showBoth && (
                          <td className="py-1.5 text-right pr-1">
                            {result.combined.priceable && projection?.combinedPremium != null ? gbp(projection.combinedPremium) : '-'}
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="text-xs mt-3 pt-2 hairline leading-relaxed space-y-1.5" style={{ color: 'var(--muted)' }}>
              <p>
                Priced to a {pct(a.targetCombinedRatio)} combined ratio, so claims and expenses together
                take {pct(a.targetCombinedRatio)} of premium and {pct(1 - a.targetCombinedRatio)} is margin.
                The loss ratio is what that leaves for claims. The FCA publishes the same measure for
                every UK retail product: 54% for motor, 46% for home and 4% for GAP add-ons.
              </p>
              {((showHeat && !result.heat.price.priceable) || (showCold && !result.cold.price.priceable)) && (
                <p>
                  A dash means no qualifying event in {endYear - startYear + 1} years. That is not zero
                  risk. It means this record cannot support a price at this trigger.
                </p>
              )}
              {showBoth && result.heat.price.priceable && result.cold.price.priceable && (
                <p>
                  Both costs exactly what heat and cold cost separately, because expected claims simply
                  add up. What bundling changes is the tail: the 1-in-200 payout falls from{' '}
                  {gbp(separateTail, 0)} to {gbp(result.combined.tailPayout, 0)}, since a severe summer and
                  a severe winter are independent. Same premium, {capitalSaved > 0 ? 'less' : 'the same'}{' '}
                  capital, so a better return on it.
                </p>
              )}
            </div>
          </Section>
        </>
      )}

      {result && !loading && !invalid && (
        <>
          {/* Portfolio */}
          <Section
            title="Portfolio"
            aside={
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                {peril === 'both' ? 'heat and cold' : peril === 'heat' ? 'heat only' : 'cold only'}
              </span>
            }
          >
            {populationLoading ? (
              <div className="flex items-center gap-2 text-xs py-1" style={{ color: 'var(--muted)' }}>
                <Loader2 className="size-3.5 animate-spin" />
                Estimating population
              </div>
            ) : population === null ? (
              <div className="space-y-2">
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  {populationError
                    ? 'The population service did not respond. Enter a population for this area to size the book.'
                    : 'Enter a population for this area to size the book.'}
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
                  <Line label="Premium income" value={selected.priceable ? compact((policies ?? 0) * selected.premium) : '-'} strong />
                  <Line label="Expected annual payout" value={compact((policies ?? 0) * selected.expectedPayout)} />
                  <Line label="1-in-200 year payout" value={compact((policies ?? 0) * selected.tailPayout)} />
                </div>
                <p className="text-xs mt-2 pt-2 hairline leading-relaxed" style={{ color: 'var(--muted)' }}>
                  Every policy here pays on the same reading, so they all trigger together and the
                  1-in-200 year payout is the whole book paying at once. That is the figure an insurer
                  holds capital against.{discountOn ? ' Book size also feeds the price through the volume discount.' : ' Book size does not affect the price unless a volume discount is set.'}
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
                  {showHeat && <Bar dataKey="Heat" fill="#ff4500" radius={[2, 2, 0, 0]} />}
                  {showCold && <Bar dataKey="Cold" fill="#4169e1" radius={[2, 2, 0, 0]} />}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--muted)' }}>
              As recorded. The summer trend here is {signed(result.heat.slopePerDecade)}°C a decade and the
              winter trend {signed(result.cold.slopePerDecade)}°C a decade. Before pricing, each year is
              adjusted to today’s climate, which gives {result.heat.frequency.mean.toFixed(2)} heat events a
              year against {result.heat.observedMean.toFixed(2)} as recorded, and{' '}
              {result.cold.frequency.mean.toFixed(2)} cold against {result.cold.observedMean.toFixed(2)}.
            </p>
          </Section>
        </>
      )}
    </div>
  );
};
