import React from 'react';
import { Loader2, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SectionHead, Readout, NumberField, SliderField, Pills, Note, Empty, PanelBlock } from './Bits';
import { Assumptions, LocationResult, ProjectionResult, Price, effectiveExpenseRatio, pct } from '../services/RiskModel';
import { Currency, CURRENCIES, money, moneyShort, count } from '../services/Currency';
import { POPULATION_YEAR, BASELINE, FUTURE } from '../services/ClimateData';

export type Peril = 'heat' | 'cold' | 'both';

const HEAT = '#e05a3c';
const COLD = '#4d9de0';

export const perilLabel: Record<Peril, string> = {
  heat: 'Heat only',
  cold: 'Cold only',
  both: 'Heat and cold',
};

export const pickPrice = (r: LocationResult, p: Peril): Price =>
  p === 'heat' ? r.heat.price : p === 'cold' ? r.cold.price : r.combined;

const axis = { fontSize: 10, fill: 'rgba(238,241,242,0.5)' };
const tooltipStyle = {
  fontSize: 12,
  borderRadius: 3,
  background: '#22282c',
  borderColor: '#444c53',
  color: '#eef1f2',
};

// ---------------------------------------------------------------------------
// 01 Product
// ---------------------------------------------------------------------------

export const ProductSection: React.FC<{
  a: Assumptions;
  onChange: (a: Assumptions) => void;
  onReset: () => void;
  isDefault: boolean;
  peril: Peril;
  onPerilChange: (p: Peril) => void;
  currency: Currency;
  onCurrencyChange: (code: string) => void;
  book: number;
}> = ({ a, onChange, onReset, isDefault, peril, onPerilChange, currency, onCurrencyChange, book }) => {
  const set = (patch: Partial<Assumptions>) => onChange({ ...a, ...patch });
  const invalid = a.targetCombinedRatio - a.expenseRatio <= 0;

  return (
    <>
      <SectionHead
        index="01 / Product"
        title="Contract terms"
        standfirst="Triggers default to the Met Office heatwave definition and the Cold Weather Payment rule. Every control recalculates from the stored record with no new data request."
        aside={
          !isDefault && (
            <button onClick={onReset} className="btn-ghost">Reset</button>
          )
        }
      />

      <div className="section-body grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">

        <PanelBlock
          head="Cover"
          aside={<Pills value={peril} onChange={onPerilChange} options={[['heat', 'Heat'], ['cold', 'Cold'], ['both', 'Both']]} />}
        >
          <div className="space-y-4">
            {peril !== 'cold' && (
              <SliderField
                label="Heat trigger, daily max at or above"
                value={a.heatThreshold}
                onChange={v => set({ heatThreshold: v })}
                min={20}
                max={45}
                step={0.5}
                format={v => `${v}°C`}
              />
            )}
            {peril !== 'cold' && (
              <SliderField
                label="Consecutive days to qualify"
                value={a.heatDuration}
                onChange={v => set({ heatDuration: Math.round(v) })}
                min={1}
                max={10}
                format={v => `${v} d`}
              />
            )}
            {peril !== 'heat' && (
              <SliderField
                label="Cold trigger, daily mean at or below"
                value={a.coldThreshold}
                onChange={v => set({ coldThreshold: v })}
                min={-15}
                max={10}
                step={0.5}
                format={v => `${v}°C`}
              />
            )}
            {peril !== 'heat' && (
              <SliderField
                label="Days per paying run"
                value={a.coldDuration}
                onChange={v => set({ coldDuration: Math.round(v) })}
                min={1}
                max={21}
                format={v => `${v} d`}
              />
            )}
          </div>
        </PanelBlock>

        <PanelBlock head="Limits and uptake">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Payout per event" value={a.payoutPerEvent} onChange={v => set({ payoutPerEvent: Math.max(1, v) })} prefix={currency.symbol} min={1} step={25} />
              <label className="block">
                <span className="field-label">Currency</span>
                <select value={currency.code} onChange={e => onCurrencyChange(e.target.value)}>
                  {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}
                </select>
              </label>
            </div>
            <SliderField
              label="Annual limit, events paid"
              value={a.annualLimit}
              onChange={v => set({ annualLimit: Math.round(v) })}
              min={1}
              max={12}
              format={v => `${v}`}
            />
            <SliderField
              label="Adoption rate"
              value={+(a.adoption * 100).toFixed(2)}
              onChange={v => set({ adoption: v / 100 })}
              min={0.05}
              max={10}
              step={0.05}
              format={v => `${v}%`}
              hint={`${count(book, currency)} policies`}
            />
          </div>
        </PanelBlock>

        <PanelBlock head="Pricing basis">
          <div className="space-y-4">
            <SliderField
              label="Target combined ratio"
              value={Math.round(a.targetCombinedRatio * 100)}
              onChange={v => set({ targetCombinedRatio: v / 100 })}
              min={50}
              max={110}
              format={v => `${v}%`}
            />
            <SliderField
              label="Expense ratio"
              value={Math.round(a.expenseRatio * 100)}
              onChange={v => set({ expenseRatio: v / 100 })}
              min={5}
              max={60}
              format={v => `${v}%`}
              hint={invalid ? 'Exceeds combined ratio' : `Loss ratio ${pct(a.targetCombinedRatio - a.expenseRatio)}`}
            />
            <div className="hairline pt-3.5">
              <SliderField
                label="Volume discount per doubling"
                value={+(a.volumeDiscountPerDoubling * 100).toFixed(1)}
                onChange={v => set({ volumeDiscountPerDoubling: v / 100 })}
                min={0}
                max={6}
                step={0.5}
                format={v => `${v} pp`}
                hint={a.volumeDiscountPerDoubling > 0 ? `Applied: ${pct(effectiveExpenseRatio(a, book), 1)}` : 'Off'}
              />
              <div className="mt-3">
                <NumberField
                  label="Reference book size"
                  value={a.referencePolicies}
                  onChange={v => set({ referencePolicies: Math.max(1, Math.round(v)) })}
                  step={1000}
                  min={1}
                />
              </div>
            </div>
            {invalid && (
              <p className="text-xs" style={{ color: HEAT }}>
                The combined ratio must exceed the expense ratio, or nothing is left for claims.
              </p>
            )}
          </div>
        </PanelBlock>

      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// 02 Hazard
// ---------------------------------------------------------------------------

export const RiskSection: React.FC<{
  result: LocationResult | null;
  loading: boolean;
  error: string | null;
  peril: Peril;
  startYear: number;
  endYear: number;
}> = ({ result, loading, error, peril, startYear, endYear }) => {
  const showHeat = peril !== 'cold';
  const showCold = peril !== 'heat';

  const data = result
    ? Array.from(result.heat.observed.keys()).map(y => ({
        year: y,
        Heat: result.heat.observed.get(y) ?? 0,
        Cold: result.cold.observed.get(y) ?? 0,
      }))
    : [];

  const worst = data.reduce(
    (best, d) => {
      const v = (showHeat ? d.Heat : 0) + (showCold ? d.Cold : 0);
      return v > best.v ? { y: d.year, v } : best;
    },
    { y: 0, v: -1 }
  );

  return (
    <>
      <SectionHead
        index="02 / Hazard"
        title={`Event frequency, ${startYear} to ${endYear}`}
        standfirst="Counted from ECMWF reanalysis at the index point. Pricing uses the trend-adjusted column, which restates every past year at today's climate."
      />

      <div className="section-body">
        {loading && (
          <div className="panel panel-pad flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
            <Loader2 className="size-3.5 animate-spin" />
            Reading {endYear - startYear + 1} years of daily temperature
          </div>
        )}
        {error && !loading && (
          <div className="panel panel-pad"><p className="text-xs" style={{ color: HEAT }}>{error}</p></div>
        )}

        {result && !loading && (
          <div className="grid gap-3 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <PanelBlock head="Frequency and trend">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Peril</th>
                    <th>As recorded</th>
                    <th>Adjusted</th>
                    <th>Trend / decade</th>
                  </tr>
                </thead>
                <tbody>
                  {showHeat && (
                    <tr>
                      <td style={{ color: HEAT }}>Heat</td>
                      <td>{result.heat.observedMean.toFixed(2)}</td>
                      <td style={{ fontWeight: 600 }}>{result.heat.frequency.mean.toFixed(2)}</td>
                      <td>{result.heat.slopePerDecade >= 0 ? '+' : '−'}{Math.abs(result.heat.slopePerDecade).toFixed(2)}°C</td>
                    </tr>
                  )}
                  {showCold && (
                    <tr>
                      <td style={{ color: COLD }}>Cold</td>
                      <td>{result.cold.observedMean.toFixed(2)}</td>
                      <td style={{ fontWeight: 600 }}>{result.cold.frequency.mean.toFixed(2)}</td>
                      <td>{result.cold.slopePerDecade >= 0 ? '+' : '−'}{Math.abs(result.cold.slopePerDecade).toFixed(2)}°C</td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ color: 'var(--muted)' }}>Worst year</td>
                    <td colSpan={3}>
                      {worst.v > 0 ? `${worst.y}, ${worst.v} event${worst.v === 1 ? '' : 's'}` : 'none on record'}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--muted)' }}>Frequency model</td>
                    <td colSpan={3}>{result.heat.frequency.model}</td>
                  </tr>
                </tbody>
              </table>
            </PanelBlock>

            <PanelBlock head="Events per year, as recorded">
              <div className="h-44 -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <XAxis dataKey="year" tick={axis} tickLine={false} axisLine={{ stroke: '#333940' }} interval={3} />
                    <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} width={22} />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#eef1f2' }} labelStyle={{ color: 'rgba(238,241,242,0.6)' }} cursor={{ fill: 'rgba(238,241,242,0.05)' }} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    {showHeat && <Bar dataKey="Heat" fill={HEAT} />}
                    {showCold && <Bar dataKey="Cold" fill={COLD} />}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </PanelBlock>
          </div>
        )}
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// 03 Price
// ---------------------------------------------------------------------------

export const PriceSection: React.FC<{
  result: LocationResult | null;
  peril: Peril;
  a: Assumptions;
  currency: Currency;
}> = ({ result, peril, a, currency }) => {
  if (!result) {
    return (
      <>
        <SectionHead index="03 / Price" title="Rate per policy" />
        <div className="section-body"><Empty>Waiting for the temperature record.</Empty></div>
      </>
    );
  }

  const showHeat = peril !== 'cold';
  const showCold = peril !== 'heat';
  const showBoth = peril === 'both';
  const sel = pickPrice(result, peril);
  const separateTail = result.heat.price.tailPayout + result.cold.price.tailPayout;

  const rows: Array<{ label: string; pick: (p: Price) => string; strong?: boolean }> = [
    { label: 'Expected payout', pick: p => money(p.expectedPayout, currency) },
    { label: 'Expenses', pick: p => money(p.expenses, currency) },
    { label: 'Margin', pick: p => money(p.margin, currency) },
    { label: 'Annual premium', pick: p => money(p.premium, currency), strong: true },
    { label: 'Loss ratio', pick: p => pct(p.lossRatio) },
    { label: 'Expense ratio', pick: p => pct(p.expenseRatio) },
    { label: '1-in-200 payout', pick: p => money(p.tailPayout, currency, 0) },
    { label: 'Capital needed', pick: p => money(p.capital, currency, 0) },
    { label: 'Return on capital', pick: p => pct(p.returnOnCapital) },
  ];

  const cell = (p: Price, f: (p: Price) => string) => (p.priceable ? f(p) : '—');

  return (
    <>
      <SectionHead
        index="03 / Price"
        title="Rate per policy"
        standfirst={`Premium solved so claims and expenses take ${pct(a.targetCombinedRatio)} of it. Capital is the 1-in-200 payout less expected claims, the Solvency UK basis.`}
      />

      <div className="section-body space-y-3">
        <Readout
          items={[
            { label: 'Annual premium', value: sel.priceable ? money(sel.premium, currency) : '—', note: perilLabel[peril] },
            { label: 'Loss ratio', value: sel.priceable ? pct(sel.lossRatio) : '—', note: 'FCA: motor 54%, home 46%' },
            { label: '1-in-200 payout', value: sel.priceable ? money(sel.tailPayout, currency, 0) : '—' },
            { label: 'Capital needed', value: sel.priceable ? money(sel.capital, currency, 0) : '—' },
            { label: 'Return on capital', value: sel.priceable ? pct(sel.returnOnCapital) : '—' },
          ]}
        />

        <div className="panel overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Per policy, per year</th>
                {showHeat && <th style={{ color: HEAT }}>Heat</th>}
                {showCold && <th style={{ color: COLD }}>Cold</th>}
                {showBoth && <th>Both</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.label} data-strong={r.strong}>
                  <td style={{ color: r.strong ? 'var(--ink)' : 'var(--muted)' }}>{r.label}</td>
                  {showHeat && <td>{cell(result.heat.price, r.pick)}</td>}
                  {showCold && <td>{cell(result.cold.price, r.pick)}</td>}
                  {showBoth && <td>{cell(result.combined, r.pick)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {((showHeat && !result.heat.price.priceable) || (showCold && !result.cold.price.priceable)) && (
          <Note>A dash means no qualifying event in the record. Not zero risk: the history cannot support a price at this trigger.</Note>
        )}
        {showBoth && result.heat.price.priceable && result.cold.price.priceable && (
          <Note>
            Bundling does not change the premium, since expected claims add. It changes the tail: 1-in-200 falls from{' '}
            {money(separateTail, currency, 0)} to {money(result.combined.tailPayout, currency, 0)}. Same premium, less capital.
          </Note>
        )}
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// 04 Outlook
// ---------------------------------------------------------------------------

export const OutlookSection: React.FC<{
  result: LocationResult | null;
  projection: ProjectionResult | null;
  loading: boolean;
  error: string | null;
  peril: Peril;
  currency: Currency;
  onRun: () => void;
  hasRun: boolean;
}> = ({ result, projection, loading, error, peril, currency, onRun, hasRun }) => {
  const showHeat = peril !== 'cold';
  const showCold = peril !== 'heat';
  const now = result ? pickPrice(result, peril) : null;
  const future =
    projection === null ? null : peril === 'heat' ? projection.heatPremium : peril === 'cold' ? projection.coldPremium : projection.combinedPremium;
  const change = now && now.premium > 0 && future != null ? future / now.premium - 1 : null;

  return (
    <>
      <SectionHead
        index="04 / Outlook"
        title={`Reprice on ${FUTURE.start}–${FUTURE.end} climate`}
        standfirst={`Each CMIP6 model measured against its own ${BASELINE.start}–${BASELINE.end} baseline, so model bias cancels. Not needed to price a one-year contract; needed to decide whether to write the line at all.`}
        aside={
          !hasRun && !loading ? (
            <button onClick={onRun} className="btn-solid inline-flex items-center gap-1.5">
              Run projection <ArrowRight className="size-3" />
            </button>
          ) : undefined
        }
      />

      <div className="section-body space-y-3">
        {!hasRun && !loading && !error && (
          <Empty>Fifty years of daily output across two models is the heaviest request here, so it runs only on request and cannot delay the pricing above.</Empty>
        )}
        {loading && (
          <div className="panel panel-pad flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
            <Loader2 className="size-3.5 animate-spin" /> Running projection
          </div>
        )}
        {error && !loading && (
          <div className="panel panel-pad flex items-center justify-between gap-3">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{error}</p>
            <button onClick={onRun} className="btn-ghost shrink-0">Retry</button>
          </div>
        )}

        {projection && result && !loading && (
          <>
            <Readout
              items={[
                { label: 'Premium today', value: now?.priceable ? money(now.premium, currency) : '—' },
                { label: `Premium ${FUTURE.start}–${FUTURE.end}`, value: future != null ? money(future, currency) : '—', accent: change != null && change > 0 ? HEAT : undefined },
                { label: 'Change', value: change != null ? `${change >= 0 ? '+' : ''}${(change * 100).toFixed(0)}%` : '—', accent: change != null && change > 0 ? HEAT : COLD },
              ]}
            />
            <div className="panel overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Peril</th>
                    <th>Frequency change</th>
                    <th>Premium today</th>
                    <th>Premium then</th>
                  </tr>
                </thead>
                <tbody>
                  {showHeat && (
                    <tr>
                      <td style={{ color: HEAT }}>Heat</td>
                      <td>{projection.heatScale != null ? `${projection.heatScale >= 1 ? '+' : ''}${((projection.heatScale - 1) * 100).toFixed(0)}%` : 'n/a'}</td>
                      <td>{result.heat.price.priceable ? money(result.heat.price.premium, currency) : '—'}</td>
                      <td>{projection.heatPremium != null ? money(projection.heatPremium, currency) : '—'}</td>
                    </tr>
                  )}
                  {showCold && (
                    <tr>
                      <td style={{ color: COLD }}>Cold</td>
                      <td>{projection.coldScale != null ? `${projection.coldScale >= 1 ? '+' : ''}${((projection.coldScale - 1) * 100).toFixed(0)}%` : 'n/a'}</td>
                      <td>{result.cold.price.priceable ? money(result.cold.price.premium, currency) : '—'}</td>
                      <td>{projection.coldPremium != null ? money(projection.coldPremium, currency) : '—'}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Note>Heat and cold move in opposite directions. A heat-only book carries a rising claims cost it cannot reprice mid-term; holding both is a natural hedge. High emissions pathway, so read as an upper case.</Note>
          </>
        )}
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// 05 Portfolio
// ---------------------------------------------------------------------------

export const PortfolioSection: React.FC<{
  result: LocationResult | null;
  peril: Peril;
  a: Assumptions;
  currency: Currency;
  population: number | null;
  policies: number | null;
  loading: boolean;
  error: string | null;
  onManualPopulation: (n: number) => void;
}> = ({ result, peril, a, currency, population, policies, loading, error, onManualPopulation }) => {
  const [manual, setManual] = React.useState('');
  const sel = result ? pickPrice(result, peril) : null;
  const n = policies ?? 0;

  return (
    <>
      <SectionHead
        index="05 / Portfolio"
        title="Accumulation"
        standfirst="Every policy pays on the same index reading, so the whole book triggers together. The 1-in-200 line is a straight multiplication, and it is what capital is held against."
      />

      <div className="section-body space-y-3">
        {loading && (
          <div className="panel panel-pad flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
            <Loader2 className="size-3.5 animate-spin" /> Estimating population
          </div>
        )}

        {!loading && population === null && (
          <div className="panel panel-pad max-w-sm">
            <p className="text-xs mb-2.5" style={{ color: 'var(--muted)' }}>
              {error ? 'Population service unavailable. Enter a figure for this area.' : 'Enter a population for this area.'}
            </p>
            <div className="flex gap-2">
              <input type="number" min={0} placeholder="9000000" value={manual} onChange={e => setManual(e.target.value)} />
              <button
                onClick={() => {
                  const v = parseFloat(manual);
                  if (isFinite(v) && v > 0) onManualPopulation(Math.round(v));
                }}
                className="btn-solid shrink-0"
              >
                Use
              </button>
            </div>
          </div>
        )}

        {!loading && population !== null && sel && (
          <>
            <Readout
              items={[
                { label: `Population, ${POPULATION_YEAR}`, value: count(population, currency) },
                { label: 'Policies in force', value: count(n, currency), note: `${pct(a.adoption, a.adoption < 0.01 ? 2 : 1)} adoption` },
                { label: 'Premium income', value: sel.priceable ? moneyShort(n * sel.premium, currency) : '—' },
                { label: 'Expected payout', value: moneyShort(n * sel.expectedPayout, currency) },
                { label: '1-in-200 payout', value: moneyShort(n * sel.tailPayout, currency), accent: HEAT },
                { label: 'Capital needed', value: moneyShort(n * sel.capital, currency) },
              ]}
            />
            <Note>Reanalysis resolves at 9 to 25 km, so this is one index for the whole area. Diversification comes only from writing in places whose weather does not move together.</Note>
          </>
        )}
      </div>
    </>
  );
};
