import React from 'react';
import { Loader2, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { SectionHead, Figure, NumberField, Pills, Note, Empty } from './Bits';
import {
  Assumptions,
  LocationResult,
  ProjectionResult,
  Price,
  effectiveExpenseRatio,
  pct,
} from '../services/RiskModel';
import { Currency, CURRENCIES, money, moneyShort, count } from '../services/Currency';
import { POPULATION_YEAR, BASELINE, FUTURE } from '../services/ClimateData';

export type Peril = 'heat' | 'cold' | 'both';

const HEAT = '#e4572e';
const COLD = '#2f5fd0';

export const perilLabel: Record<Peril, string> = {
  heat: 'Heat only',
  cold: 'Cold only',
  both: 'Heat and cold',
};

export const pickPrice = (r: LocationResult, p: Peril): Price =>
  p === 'heat' ? r.heat.price : p === 'cold' ? r.cold.price : r.combined;

// ---------------------------------------------------------------------------
// 02. The product
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
  const discountOn = a.volumeDiscountPerDoubling > 0;

  return (
    <>
      <div className="section-inner"><SectionHead
        index="02 / The product"
        title="What is being sold"
        standfirst="A fixed sum paid when a temperature index crosses a line. No claim, no inspection, no loss adjuster. The defaults are official UK definitions, and everything here is yours to change."
        aside={
          !isDefault && (
            <button
              onClick={onReset}
              className="btn-ghost px-3 py-2"
              
            >
              Reset to defaults
            </button>
          )
        }
      /></div>

      <div className="section-body section-inner grid gap-4 xl:grid-cols-2">
        <div className="panel panel-pad space-y-4">
          <Pills
            label="Cover written"
            value={peril}
            onChange={onPerilChange}
            options={[
              ['heat', 'Heat only'],
              ['cold', 'Cold only'],
              ['both', 'Both'],
            ]}
          />

          {peril !== 'cold' && (
            <div className="hairline pt-4">
              <p className="utility mb-3">
                Heatwave trigger
              </p>
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Daily max at or above" value={a.heatThreshold} onChange={v => set({ heatThreshold: v })} suffix="°C" step={0.5} />
                <NumberField label="For at least" value={a.heatDuration} onChange={v => set({ heatDuration: Math.max(1, Math.round(v)) })} min={1} max={14} suffix="days" />
              </div>
              <Note>Met Office definition. 28°C for three days is the Greater London threshold.</Note>
            </div>
          )}

          {peril !== 'heat' && (
            <div className="hairline pt-4">
              <p className="utility mb-3">
                Cold wave trigger
              </p>
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Daily mean at or below" value={a.coldThreshold} onChange={v => set({ coldThreshold: v })} suffix="°C" step={0.5} />
                <NumberField label="Each run of" value={a.coldDuration} onChange={v => set({ coldDuration: Math.max(1, Math.round(v)) })} min={1} max={21} suffix="days" />
              </div>
              <Note>The UK Cold Weather Payment trigger. Each full run pays, so fourteen days pays twice.</Note>
            </div>
          )}
        </div>

        <div className="panel panel-pad space-y-4">
          <div>
            <p className="utility mb-3">
              Cover and uptake
            </p>
            <div className="grid grid-cols-3 gap-3">
              <NumberField label="Payout per event" value={a.payoutPerEvent} onChange={v => set({ payoutPerEvent: Math.max(1, v) })} prefix={currency.symbol} min={1} />
              <NumberField label="Max events a year" value={a.annualLimit} onChange={v => set({ annualLimit: Math.max(1, Math.round(v)) })} min={1} max={20} />
              <label className="block">
                <span className="utility block mb-2" style={{ fontSize: 9, letterSpacing: '0.14em' }}>Currency</span>
                <select
                  value={currency.code}
                  onChange={e => onCurrencyChange(e.target.value)}
                  className="w-full text-sm px-2 py-2"
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
                  ))}
                </select>
              </label>
            </div>
            <Note>
              The payout sets the currency of the contract, so there is no exchange rate anywhere in
              this tool. Changing the payout scales every money figure and leaves every ratio alone.
            </Note>
          </div>

          <div className="hairline pt-4">
            <p className="utility mb-3">
              Pricing target
            </p>
            <div className="grid grid-cols-3 gap-3">
              <NumberField label="Combined ratio" value={Math.round(a.targetCombinedRatio * 100)} onChange={v => set({ targetCombinedRatio: v / 100 })} min={40} max={120} suffix="%" />
              <NumberField label="Expense ratio" value={Math.round(a.expenseRatio * 100)} onChange={v => set({ expenseRatio: v / 100 })} min={0} max={80} suffix="%" />
              <NumberField label="Adoption" value={+(a.adoption * 100).toFixed(2)} onChange={v => set({ adoption: Math.max(0, v) / 100 })} step={0.1} min={0} max={100} suffix="%" />
            </div>
            {invalid ? (
              <p className="text-xs mt-2 text-red-700">
                The combined ratio must be higher than the expense ratio, or there is nothing left to
                pay claims with.
              </p>
            ) : (
              <Note>
                Claims take {pct(a.targetCombinedRatio - a.expenseRatio)} of premium. The FCA reports
                54% for UK motor and 46% for home, against 4% for GAP sold as an add-on.
              </Note>
            )}
          </div>

          <div className="hairline pt-4">
            <p className="utility mb-3">
              Volume discount, optional
            </p>
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Points off per doubling"
                value={+(a.volumeDiscountPerDoubling * 100).toFixed(1)}
                onChange={v => set({ volumeDiscountPerDoubling: Math.max(0, v) / 100 })}
                step={0.5}
                min={0}
                max={10}
                suffix="pp"
              />
              <NumberField
                label="Reference book size"
                value={a.referencePolicies}
                onChange={v => set({ referencePolicies: Math.max(1, Math.round(v)) })}
                step={1000}
                min={1}
              />
            </div>
            <Note>
              {discountOn
                ? `At ${count(book, currency)} policies the expense ratio becomes ${pct(effectiveExpenseRatio(a, book), 1)}, against ${pct(a.expenseRatio)} at the reference size. The curve works both ways, so smaller books are charged more.`
                : 'Zero keeps the expense ratio flat at every book size. Set a figure to apply your own scale curve.'}
            </Note>
          </div>
        </div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// 03. The hazard
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

  const worst = result
    ? data.reduce(
        (best, d) => {
          const v = (showHeat ? d.Heat : 0) + (showCold ? d.Cold : 0);
          return v > best.v ? { y: d.year, v } : best;
        },
        { y: 0, v: -1 }
      )
    : null;

  return (
    <>
      <div className="section-inner"><SectionHead
        index="03 / The hazard"
        title="How often it fires"
        standfirst={`Every qualifying event at this location since ${startYear}, counted from ECMWF reanalysis. The chart is the record as it happened. The pricing uses a version adjusted to today's climate, because the early years were cooler and would otherwise drag the price down.`}
      /></div>

      <div className="section-body section-inner">
        {loading && (
          <div className="panel panel-pad flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
            <Loader2 className="size-4 animate-spin" />
            Reading {endYear - startYear + 1} years of daily temperature
          </div>
        )}
        {error && !loading && (
          <div className="panel panel-pad"><p className="text-sm text-red-700">{error}</p></div>
        )}

        {result && !loading && (
          <>
            <div className="figure-grid cols-3 mb-4">
              {showHeat && (
                <Figure
                  label="Heat events a year, as recorded"
                  value={result.heat.observedMean.toFixed(2)}
                  note={`Adjusted to today's climate: ${result.heat.frequency.mean.toFixed(2)}`}
                  accent={HEAT}
                />
              )}
              {showCold && (
                <Figure
                  label="Cold events a year, as recorded"
                  value={result.cold.observedMean.toFixed(2)}
                  note={`Adjusted to today's climate: ${result.cold.frequency.mean.toFixed(2)}`}
                  accent={COLD}
                />
              )}
              <Figure
                label="Summer trend"
                value={`${result.heat.slopePerDecade >= 0 ? '+' : '−'}${Math.abs(result.heat.slopePerDecade).toFixed(2)}°C`}
                note="Per decade, mean summer maximum"
              />
              <Figure
                label="Winter trend"
                value={`${result.cold.slopePerDecade >= 0 ? '+' : '−'}${Math.abs(result.cold.slopePerDecade).toFixed(2)}°C`}
                note="Per decade, mean winter temperature"
              />
            </div>

            <div className="panel panel-pad">
              <div className="h-56 -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'rgba(21,23,27,0.5)' }} tickLine={false} axisLine={{ stroke: 'rgba(21,23,27,0.18)' }} interval={3} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'rgba(21,23,27,0.5)' }} tickLine={false} axisLine={false} width={26} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 3, background: '#fff', borderColor: 'rgba(21,23,27,0.18)', color: '#15171b' }} itemStyle={{ color: '#15171b' }} labelStyle={{ color: 'rgba(21,23,27,0.6)' }} cursor={{ fill: 'rgba(21,23,27,0.05)' }} />
                    <Legend iconSize={9} wrapperStyle={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }} />
                    {showHeat && <Bar dataKey="Heat" fill={HEAT} radius={[2, 2, 0, 0]} />}
                    {showCold && <Bar dataKey="Cold" fill={COLD} radius={[2, 2, 0, 0]} />}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {worst && worst.v > 0 && (
                <Note>
                  Worst year on record was {worst.y}, with {worst.v} qualifying{' '}
                  {worst.v === 1 ? 'event' : 'events'}. Frequency is modelled with a{' '}
                  {result.heat.frequency.model === 'Negative binomial' ? 'negative binomial' : 'Poisson'}{' '}
                  distribution, because {endYear - startYear + 1} years cannot show a 1-in-200 year directly.
                </Note>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// 04. The price
// ---------------------------------------------------------------------------

export const PriceSection: React.FC<{
  result: LocationResult | null;
  peril: Peril;
  a: Assumptions;
  currency: Currency;
}> = ({ result, peril, a, currency }) => {
  if (!result)
    return (
      <>
        <div className="section-inner">
          <SectionHead index="04 / The price" title="What it costs" />
        </div>
        <div className="section-body section-inner">
          <Empty>Waiting for the temperature record.</Empty>
        </div>
      </>
    );

  const showHeat = peril !== 'cold';
  const showCold = peril !== 'heat';
  const showBoth = peril === 'both';
  const sel = pickPrice(result, peril);
  const separateTail = result.heat.price.tailPayout + result.cold.price.tailPayout;

  const rows: Array<{ label: string; pick: (p: Price) => string; strong?: boolean }> = [
    { label: 'Expected payout', pick: p => money(p.expectedPayout, currency) },
    { label: 'Expenses', pick: p => money(p.expenses, currency) },
    { label: `Margin, ${pct(1 - a.targetCombinedRatio)}`, pick: p => money(p.margin, currency) },
    { label: 'Annual premium', pick: p => money(p.premium, currency), strong: true },
    { label: 'Loss ratio', pick: p => pct(p.lossRatio) },
    { label: 'Expense ratio', pick: p => pct(p.expenseRatio) },
    { label: '1-in-200 year payout', pick: p => money(p.tailPayout, currency, 0) },
    { label: 'Capital needed', pick: p => money(p.capital, currency, 0) },
    { label: 'Return on capital', pick: p => pct(p.returnOnCapital) },
  ];

  const cell = (p: Price, f: (p: Price) => string) => (p.priceable ? f(p) : '-');

  return (
    <>
      <div className="section-inner"><SectionHead
        index="04 / The price"
        title="What it costs"
        standfirst={`Premium solved so claims and expenses together take ${pct(a.targetCombinedRatio)} of it. The rest is margin. The capital line is what must be held to survive a year worse than 199 out of 200.`}
      /></div>

      <div className="section-body section-inner">
        <div className="figure-grid cols-3 mb-4">
          <Figure label="Annual premium per policy" value={sel.priceable ? money(sel.premium, currency) : '-'} note={perilLabel[peril]} />
          <Figure label="Loss ratio" value={sel.priceable ? pct(sel.lossRatio) : '-'} note="FCA: 54% motor, 46% home, 4% GAP add-on" />
          <Figure label="1-in-200 year payout" value={sel.priceable ? money(sel.tailPayout, currency, 0) : '-'} note="Per policy, worst year in two hundred" />
          <Figure label="Return on capital" value={sel.priceable ? pct(sel.returnOnCapital) : '-'} note="Margin against capital tied up" />
        </div>

        <div className="panel panel-pad overflow-x-auto">
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
          <Note>
            A dash means no qualifying event in the record. That is not zero risk. It means the history
            cannot support a price at this trigger, which is itself a finding worth reporting.
          </Note>
        )}

        {showBoth && result.heat.price.priceable && result.cold.price.priceable && (
          <Note>
            Writing both costs exactly what heat and cold cost separately, because expected claims add
            up. What changes is the tail: the 1-in-200 payout falls from{' '}
            {money(separateTail, currency, 0)} to {money(result.combined.tailPayout, currency, 0)}, since
            a severe summer and a severe winter are independent. Same premium, less capital, better
            return on it. Bundling perils is a capital story, not a pricing story.
          </Note>
        )}
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// 05. The outlook
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
    projection === null
      ? null
      : peril === 'heat'
        ? projection.heatPremium
        : peril === 'cold'
          ? projection.coldPremium
          : projection.combinedPremium;

  const change = now && now.premium > 0 && future != null ? future / now.premium - 1 : null;

  return (
    <>
      <div className="section-inner"><SectionHead
        index="05 / The outlook"
        title={`Repriced on ${FUTURE.start} to ${FUTURE.end} climate`}
        standfirst={`Pricing a one-year contract does not need this. Deciding whether to launch the product does. Each climate model is compared against its own ${BASELINE.start} to ${BASELINE.end} baseline, so model bias cancels and only the change carries through.`}
        aside={
          !hasRun && !loading ? (
            <button onClick={onRun} className="btn-solid px-5 py-3 inline-flex items-center gap-2">
              Run projection
              <ArrowRight className="size-3.5" />
            </button>
          ) : undefined
        }
      /></div>

      <div className="section-body section-inner">
        {!hasRun && !loading && !error && (
          <Empty>
            Fifty years of daily output across two climate models is the heaviest request on the page,
            heavy enough to exhaust the provider's per-minute allowance on its own. It therefore runs
            only when asked, so it can never delay or break the pricing above it.
          </Empty>
        )}
        {loading && (
          <div className="panel panel-pad flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
            <Loader2 className="size-4 animate-spin" />
            Running the climate projection. This takes a few seconds.
          </div>
        )}
        {error && !loading && (
          <div className="panel panel-pad">
            <p className="text-sm mb-3" style={{ color: 'var(--muted)' }}>
              The projection did not return. {error}
            </p>
            <button onClick={onRun} className="btn-ghost px-4 py-2">Try again</button>
          </div>
        )}

        {projection && result && !loading && (
          <>
            <div className="figure-grid cols-3 mb-4">
              <Figure
                label="Premium today"
                value={now?.priceable ? money(now.premium, currency) : '-'}
                note={perilLabel[peril]}
              />
              <Figure
                label={`Premium on ${FUTURE.start} to ${FUTURE.end} climate`}
                value={future != null ? money(future, currency) : '-'}
                note="Same contract, same target, warmer world"
                accent={change != null && change > 0 ? HEAT : undefined}
              />
              <Figure
                label="Change"
                value={change != null ? `${change >= 0 ? '+' : ''}${(change * 100).toFixed(0)}%` : '-'}
                note="On the current premium"
                accent={change != null && change > 0 ? HEAT : COLD}
              />
            </div>

            <div className="panel panel-pad overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Trigger frequency</th>
                    <th>Change by {FUTURE.end}</th>
                    <th>Premium today</th>
                    <th>Premium then</th>
                  </tr>
                </thead>
                <tbody>
                  {showHeat && (
                    <tr>
                      <td style={{ color: HEAT }}>Heatwave</td>
                      <td>{projection.heatScale != null ? `${projection.heatScale >= 1 ? '+' : ''}${((projection.heatScale - 1) * 100).toFixed(0)}%` : 'n/a'}</td>
                      <td>{result.heat.price.priceable ? money(result.heat.price.premium, currency) : '-'}</td>
                      <td>{projection.heatPremium != null ? money(projection.heatPremium, currency) : '-'}</td>
                    </tr>
                  )}
                  {showCold && (
                    <tr>
                      <td style={{ color: COLD }}>Cold wave</td>
                      <td>{projection.coldScale != null ? `${projection.coldScale >= 1 ? '+' : ''}${((projection.coldScale - 1) * 100).toFixed(0)}%` : 'n/a'}</td>
                      <td>{result.cold.price.priceable ? money(result.cold.price.premium, currency) : '-'}</td>
                      <td>{projection.coldPremium != null ? money(projection.coldPremium, currency) : '-'}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <Note>
                Heat and cold move in opposite directions, which is the point of showing both. A book
                written on heat alone faces a rising claims cost it cannot reprice out of mid-term. A
                book holding both has a natural hedge. These runs follow a high emissions pathway, so
                read them as an upper case rather than a central estimate.
              </Note>
            </div>
          </>
        )}
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// 06. The portfolio
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
      <div className="section-inner"><SectionHead
        index="06 / The portfolio"
        title="What a book of this looks like"
        standfirst="Every policy in the area pays on the same reading, so they all trigger together. There is no diversification inside an area. A hundred thousand policies are one risk, a hundred thousand times over."
      /></div>

      <div className="section-body section-inner">
        {loading && (
          <div className="panel panel-pad flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
            <Loader2 className="size-4 animate-spin" />
            Estimating population inside the area
          </div>
        )}

        {!loading && population === null && (
          <div className="panel panel-pad max-w-md">
            <p className="text-sm mb-3" style={{ color: 'var(--muted)' }}>
              {error
                ? 'The population service did not respond. Enter a population for this area to size the book.'
                : 'Enter a population for this area to size the book.'}
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                placeholder="e.g. 9000000"
                value={manual}
                onChange={e => setManual(e.target.value)}
                className="flex-1 text-sm px-2.5 py-2"
              />
              <button
                onClick={() => {
                  const v = parseFloat(manual);
                  if (isFinite(v) && v > 0) onManualPopulation(Math.round(v));
                }}
                className="btn-solid px-4 py-2.5"
                
              >
                Use
              </button>
            </div>
          </div>
        )}

        {!loading && population !== null && sel && (
          <>
            <div className="figure-grid cols-3 mb-4">
              <Figure label="Population in the area" value={count(population, currency)} note={`WorldPop ${POPULATION_YEAR} estimate`} />
              <Figure label="Policies in force" value={count(n, currency)} note={`${pct(a.adoption, a.adoption < 0.01 ? 2 : 1)} adoption`} />
              <Figure label="Premium income" value={sel.priceable ? moneyShort(n * sel.premium, currency) : '-'} note="Gross written, one year" />
            </div>
            <div className="figure-grid cols-3">
              <Figure label="Expected annual payout" value={moneyShort(n * sel.expectedPayout, currency)} note="What a typical year costs" />
              <Figure
                label="1-in-200 year payout"
                value={moneyShort(n * sel.tailPayout, currency)}
                note="The whole book paying at once"
                accent={HEAT}
              />
              <Figure label="Capital needed" value={moneyShort(n * sel.capital, currency)} note="Above expected claims" />
            </div>
            <Note>
              The 1-in-200 line is a straight multiplication, and that is the point. Diversification for
              this product only comes from writing in places whose weather does not move together.
            </Note>
          </>
        )}
      </div>
    </>
  );
};
