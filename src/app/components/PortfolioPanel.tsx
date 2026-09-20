import React from 'react';
import { Loader2 } from 'lucide-react';
import { PortfolioResult } from '../services/OpenMeteoService';
import { PolicyTerms, formatMoney, CURRENCIES } from '../services/PricingModel';

interface PortfolioPanelProps {
  result: PortfolioResult | null;
  terms: PolicyTerms;
  currency: string;
  policiesPerCell: number;
  onPoliciesPerCellChange: (n: number) => void;
  isLoading: boolean;
  error: string | null;
}

const Row: React.FC<{ label: string; value: string; strong?: boolean }> = ({
  label,
  value,
  strong,
}) => (
  <div className="flex items-baseline justify-between gap-3 py-1">
    <span className="text-xs" style={{ color: 'var(--muted)' }}>
      {label}
    </span>
    <span className={`text-xs tnum ${strong ? 'font-semibold' : ''}`}>{value}</span>
  </div>
);

export const PortfolioPanel: React.FC<PortfolioPanelProps> = ({
  result,
  terms,
  currency,
  policiesPerCell,
  onPoliciesPerCellChange,
  isLoading,
  error,
}) => {
  const symbol = CURRENCIES.find(c => c.code === currency)?.symbol ?? '£';
  const money = (v: number) => formatMoney(v, symbol);

  const totalPolicies = result ? result.cells.length * policiesPerCell : 0;
  const expectedAnnualLoss = result
    ? result.cells.reduce(
        (sum, c) => sum + c.meanPaidDays * terms.payoutPerDay * policiesPerCell,
        0
      )
    : 0;
  const worstCellLoss = result?.worstCell
    ? result.worstCell.maxPaidDays * terms.payoutPerDay * policiesPerCell
    : 0;
  const maxAggregate = totalPolicies * terms.capDaysPerYear * terms.payoutPerDay;

  return (
    <div className="space-y-3">
      <div className="panel panel-pad">
        <h3 className="text-sm mb-1">Book assumption</h3>
        <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
          Policies written in each exposure cell. Everything below scales from this.
        </p>
        <input
          type="number"
          min={1}
          max={100000}
          value={policiesPerCell}
          onChange={e => onPoliciesPerCellChange(Math.max(1, Number(e.target.value)))}
          className="w-full text-xs px-2 py-1"
        />
      </div>

      {isLoading && (
        <div className="panel panel-pad">
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
            <Loader2 className="size-4 animate-spin" />
            Backtesting every cell across the region
          </div>
        </div>
      )}

      {error && !isLoading && (
        <div className="panel panel-pad">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {result && !isLoading && (
        <>
          <div className="panel panel-pad">
            <h3 className="text-sm mb-2">
              Accumulation, {result.startYear} to {result.endYear}
            </h3>
            <Row label="Exposure cells" value={String(result.cells.length)} />
            <Row label="Policies in force" value={totalPolicies.toLocaleString()} />
            <div className="hairline mt-1 pt-1">
              <Row
                label="Expected annual loss"
                value={money(expectedAnnualLoss)}
                strong
              />
              <Row label="Worst cell, worst year" value={money(worstCellLoss)} />
              <Row label="Maximum aggregate exposure" value={money(maxAggregate)} />
            </div>
          </div>

          <div className="panel panel-pad">
            <h3 className="text-sm mb-2">Concentration</h3>
            {result.worstCell && (
              <>
                <Row
                  label="Highest frequency cell"
                  value={`${result.worstCell.meanPaidDays.toFixed(1)} days a year`}
                  strong
                />
                <Row
                  label="Regional average"
                  value={`${result.meanPaidDaysPortfolio.toFixed(1)} days a year`}
                />
                <Row
                  label="Spread, worst against average"
                  value={`${(
                    result.meanPaidDaysPortfolio > 0.01
                      ? result.worstCell.meanPaidDays / result.meanPaidDaysPortfolio
                      : 1
                  ).toFixed(1)}×`}
                />
              </>
            )}
            <p className="text-xs mt-2 pt-2 hairline leading-relaxed" style={{ color: 'var(--muted)' }}>
              Reanalysis resolves at 9 to 25 km, so exposure is a regional view rather than a
              street-level one. Cells are spaced to match the data rather than to look detailed.
            </p>
          </div>
        </>
      )}
    </div>
  );
};
