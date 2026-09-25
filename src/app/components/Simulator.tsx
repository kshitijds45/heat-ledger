import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { SectionHead, NumberField, Note, Empty, PanelBlock } from './Bits';
import { Peril, pickPrice } from './Sections';
import { Assumptions, analyse, pct } from '../services/RiskModel';
import { DailySeries } from '../services/ClimateData';
import { Currency, money, moneyShort, count } from '../services/Currency';

/**
 * Sensitivity analysis
 *
 * One parameter is swept across a range while everything else is held fixed,
 * which is how an underwriter evidences a choice rather than merely asserting
 * it. Every row is a full recalculation from the stored daily record, not an
 * interpolation, so changing a trigger genuinely re-counts events across the
 * whole history.
 */

type Param =
  | 'heatThreshold'
  | 'coldThreshold'
  | 'payoutPerEvent'
  | 'annualLimit'
  | 'targetCombinedRatio'
  | 'expenseRatio'
  | 'adoption'
  | 'volumeDiscountPerDoubling';

interface ParamSpec {
  key: Param;
  label: string;
  unit: string;
  from: number;
  to: number;
  step: number;
  /** Factor between what the user types and what the model stores. */
  scale: number;
  decimals: number;
}

const SPECS: ParamSpec[] = [
  { key: 'heatThreshold', label: 'Heat trigger temperature', unit: '°C', from: 24, to: 36, step: 1, scale: 1, decimals: 1 },
  { key: 'coldThreshold', label: 'Cold trigger temperature', unit: '°C', from: -6, to: 4, step: 1, scale: 1, decimals: 1 },
  { key: 'payoutPerEvent', label: 'Payout per event', unit: '', from: 50, to: 500, step: 50, scale: 1, decimals: 0 },
  { key: 'annualLimit', label: 'Maximum events a year', unit: '', from: 1, to: 8, step: 1, scale: 1, decimals: 0 },
  { key: 'targetCombinedRatio', label: 'Target combined ratio', unit: '%', from: 70, to: 100, step: 5, scale: 0.01, decimals: 0 },
  { key: 'expenseRatio', label: 'Expense ratio', unit: '%', from: 10, to: 50, step: 5, scale: 0.01, decimals: 0 },
  { key: 'adoption', label: 'Adoption rate', unit: '%', from: 0.25, to: 5, step: 0.25, scale: 0.01, decimals: 2 },
  { key: 'volumeDiscountPerDoubling', label: 'Volume discount per doubling', unit: 'pp', from: 0, to: 5, step: 0.5, scale: 0.01, decimals: 1 },
];

const MAX_ROWS = 30;

export const SimulatorSection: React.FC<{
  history: DailySeries | null;
  a: Assumptions;
  peril: Peril;
  currency: Currency;
  population: number | null;
  startYear: number;
  endYear: number;
}> = ({ history, a, peril, currency, population, startYear, endYear }) => {
  const [paramKey, setParamKey] = useState<Param>('heatThreshold');
  const spec = SPECS.find(s => s.key === paramKey)!;
  const [from, setFrom] = useState(spec.from);
  const [to, setTo] = useState(spec.to);
  const [step, setStep] = useState(spec.step);

  const choose = (k: Param) => {
    const s = SPECS.find(x => x.key === k)!;
    setParamKey(k);
    setFrom(s.from);
    setTo(s.to);
    setStep(s.step);
  };

  const rows = useMemo(() => {
    if (!history) return [];
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    const stride = Math.abs(step) || 1;
    const values: number[] = [];
    for (let v = lo; v <= hi + 1e-9 && values.length < MAX_ROWS; v += stride) values.push(+v.toFixed(6));

    return values.map(display => {
      const stored = display * spec.scale;
      const variant: Assumptions = { ...a, [spec.key]: stored } as Assumptions;
      const book =
        population !== null
          ? Math.max(1, Math.round(population * variant.adoption))
          : variant.referencePolicies;
      const res = analyse(history, variant, startYear, endYear, book);
      const p = pickPrice(res, peril);
      return { display, price: p, book, current: Math.abs(stored - (a[spec.key] as number)) < 1e-9 };
    });
  }, [history, a, peril, spec, from, to, step, population, startYear, endYear]);

  const fmtParam = (v: number) =>
    `${v.toFixed(spec.decimals)}${spec.unit ? (spec.unit === '%' || spec.unit === 'pp' ? spec.unit : ` ${spec.unit}`) : ''}`;

  const downloadCsv = () => {
    const head = [
      spec.label,
      'Events a year',
      'Expected payout',
      'Annual premium',
      'Loss ratio',
      '1-in-200 payout',
      'Return on capital',
      'Policies',
      'Premium income',
      'Expected annual payout',
    ];
    const body = rows.map(r => [
      spec.key === 'payoutPerEvent' ? `${currency.symbol}${r.display}` : fmtParam(r.display),
      r.price.eventsPerYear.toFixed(3),
      r.price.expectedPayout.toFixed(2),
      r.price.premium.toFixed(2),
      (r.price.lossRatio * 100).toFixed(1),
      r.price.tailPayout.toFixed(0),
      r.price.returnOnCapital != null ? (r.price.returnOnCapital * 100).toFixed(1) : '',
      r.book,
      (r.book * r.price.premium).toFixed(0),
      (r.book * r.price.expectedPayout).toFixed(0),
    ]);
    const csv = [head, ...body].map(line => line.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `sensitivity-${spec.key}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <SectionHead
        index="06 / Sensitivity"
        title="Parameter sweep"
        standfirst="One parameter swept across a range, everything else held. Each row is a full recalculation across the whole record, so moving a trigger re-counts every event rather than interpolating."
        aside={
          rows.length > 0 && (
            <button
              onClick={downloadCsv}
              className="btn-ghost px-3 py-2 inline-flex items-center gap-1.5"
              
            >
              <Download className="size-3" />
              CSV
            </button>
          )
        }
      />

      <div className="section-body">
        <div className="panel panel-pad mb-3">
          <p className="field-label">Parameter to sweep</p>
          <div className="pill-select mb-4 flex-wrap">
            {SPECS.filter(s => {
              if (s.key === 'heatThreshold' && peril === 'cold') return false;
              if (s.key === 'coldThreshold' && peril === 'heat') return false;
              return true;
            }).map(s => (
              <button
                key={s.key}
                className="pill"
                data-active={paramKey === s.key}
                onClick={() => choose(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 max-w-sm">
            <NumberField label="From" value={from} onChange={setFrom} step={spec.step} />
            <NumberField label="To" value={to} onChange={setTo} step={spec.step} />
            <NumberField label="Step" value={step} onChange={v => setStep(Math.abs(v) || spec.step)} step={spec.step} min={0.01} />
          </div>
        </div>

        {!history ? (
          <Empty>Waiting for the temperature record.</Empty>
        ) : rows.length === 0 ? (
          <Empty>That range produces no rows. Check the from, to and step values.</Empty>
        ) : (
          <div className="panel panel-pad overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{spec.label}</th>
                  <th>Events a year</th>
                  <th>Expected payout</th>
                  <th>Premium</th>
                  <th>Loss ratio</th>
                  <th>1-in-200</th>
                  <th>Return on capital</th>
                  <th>Policies</th>
                  <th>Premium income</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.display} data-current={r.current}>
                    <td style={{ fontWeight: r.current ? 600 : 400 }}>
                      {spec.key === 'payoutPerEvent'
                        ? money(r.display, currency, 0)
                        : fmtParam(r.display)}
                      {r.current && (
                        <span className="chip ml-2">current</span>
                      )}
                    </td>
                    <td>{r.price.eventsPerYear.toFixed(2)}</td>
                    <td>{r.price.priceable ? money(r.price.expectedPayout, currency) : '-'}</td>
                    <td style={{ fontWeight: 600 }}>{r.price.priceable ? money(r.price.premium, currency) : '-'}</td>
                    <td>{r.price.priceable ? pct(r.price.lossRatio) : '-'}</td>
                    <td>{r.price.priceable ? money(r.price.tailPayout, currency, 0) : '-'}</td>
                    <td>{r.price.priceable ? pct(r.price.returnOnCapital) : '-'}</td>
                    <td>{count(r.book, currency)}</td>
                    <td>{r.price.priceable ? moneyShort(r.book * r.price.premium, currency) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Note>
              One at a time is the method and the limitation: real decisions move several parameters
              together and this cannot show the interactions. A dash marks where the trigger stops
              being insurable from this record.
            </Note>
          </div>
        )}
      </div>
    </>
  );
};
