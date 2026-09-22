import React from 'react';
import { TOOL_NAME, CREATOR } from '../branding';
import { DEFAULTS } from '../services/RiskModel';
import { HISTORY_START, historyEnd, BASELINE, FUTURE, CLIMATE_MODELS, POPULATION_YEAR } from '../services/ClimateData';

const Section: React.FC<{ n: number; title: string; children: React.ReactNode }> = ({ n, title, children }) => (
  <section className="pt-6 mt-6" style={{ borderTop: '1px solid var(--rule)' }}>
    <h3 className="text-sm mb-3">
      <span className="tnum mr-2" style={{ color: 'var(--muted)' }}>{n}.</span>
      {title}
    </h3>
    {children}
  </section>
);

const P: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--ink-soft)', maxWidth: '68ch' }}>
    {children}
  </p>
);

const F: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="text-xs tnum px-3 py-2 rounded-md my-3 leading-relaxed"
    style={{ background: 'var(--wash)', border: '1px solid var(--rule)', maxWidth: '68ch' }}
  >
    {children}
  </div>
);

const pc = (v: number) => `${Math.round(v * 100)}%`;
const YEARS = historyEnd() - HISTORY_START + 1;

export const Method: React.FC = () => (
  <div className="scroll-rail h-full p-4 md:p-8">
    <div className="max-w-3xl mx-auto pb-16">
      <h2 className="text-lg">Method and fine print</h2>
      <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
        How {TOOL_NAME} prices heatwave and cold wave cover, where every number comes from and what it
        cannot tell you.
      </p>

      <Section n={1} title="The product">
        <P>
          Parametric cover pays a fixed sum when a temperature index crosses a defined line. There is no
          claim, no inspection and no loss adjuster, because there is nothing to assess. The trigger
          either fired or it did not.
        </P>
        <P>
          This is what makes the product priceable from temperature data alone. A conventional policy
          needs a model of damage: how much a given event costs a given property. Here the payout is
          fixed by contract, so the only uncertainty is how often the trigger fires.
        </P>
      </Section>

      <Section n={2} title="The triggers">
        <P>Both defaults are official UK definitions rather than judgement.</P>
        <P>
          <strong>Heatwave.</strong> The Met Office definition: at least {DEFAULTS.heatDuration}{' '}
          consecutive days with a maximum temperature at or above a threshold, which is{' '}
          {DEFAULTS.heatThreshold}°C for Greater London. A qualifying run counts as one heatwave however
          long it lasts, and a new run after a break is a new heatwave, which is also how the Met Office
          counts them.
        </P>
        <P>
          <strong>Cold wave.</strong> The Cold Weather Payment trigger: a mean temperature at or below{' '}
          {DEFAULTS.coldThreshold}°C for {DEFAULTS.coldDuration} consecutive days. Each full{' '}
          {DEFAULTS.coldDuration}-day block pays, so a fourteen day spell pays twice, matching the
          government scheme. That scheme is itself effectively a parametric product.
        </P>
        <P>
          Both can be changed under Assumptions. Every figure recalculates instantly from the stored
          record, with no new data request.
        </P>
      </Section>

      <Section n={3} title="The data">
        <div className="overflow-x-auto mb-3">
          <table className="w-full text-xs" style={{ minWidth: 520 }}>
            <thead>
              <tr style={{ color: 'var(--muted)' }}>
                <th className="text-left font-medium pb-2">Source</th>
                <th className="text-left font-medium pb-2">What</th>
                <th className="text-left font-medium pb-2">Used for</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Open-Meteo Historical Weather API', `Daily maximum and mean temperature, ${HISTORY_START} to ${historyEnd()}. ECMWF reanalysis, 9 to 25 km.`, 'Event history, trend and pricing'],
                ['Open-Meteo Climate API', `CMIP6 HighResMIP daily temperature to ${FUTURE.end}, ${CLIMATE_MODELS.length} models, 10 km.`, 'The 2031 to 2050 premium'],
                ['WorldPop', `Population inside the chosen area, ${POPULATION_YEAR} estimate, 100 m grid.`, 'Policies in force'],
                ['OpenStreetMap', 'Map tiles and place search.', 'Choosing an area'],
              ].map(r => (
                <tr key={r[0]} className="border-t align-top" style={{ borderColor: 'var(--rule)' }}>
                  <td className="py-2 pr-3" style={{ color: 'var(--ink)' }}>{r[0]}</td>
                  <td className="py-2 pr-3" style={{ color: 'var(--ink-soft)' }}>{r[1]}</td>
                  <td className="py-2" style={{ color: 'var(--ink-soft)' }}>{r[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <P>
          The record starts in {HISTORY_START} to match the 1991 to 2020 climate normal the Met Office now
          uses for its thresholds, and ends at the last complete year because the archive lags real time
          by several days. Temperature is read at one index point, the centre of the chosen area. Every
          request is logged to the browser console, so any number can be checked against its source.
        </P>
      </Section>

      <Section n={4} title="Adjusting for a warming climate">
        <P>
          A plain average over {YEARS} years underprices heat and overprices cold, because the early years
          were cooler than today. Removing a linear trend before pricing is the standard correction for
          weather contracts.
        </P>
        <F>
          For each year, take the mean summer maximum (June to August) for heat, or the mean winter
          temperature (December to February) for cold.
          <br />
          Fit a straight line through those yearly means.
          <br />
          Shift every day in each year by the gap between that year’s point on the line and the final
          year’s.
          <br />
          Count events again on the shifted record.
        </F>
        <P>
          Summer and winter are treated separately because they do not warm at the same rate. The result
          is {YEARS} years of weather, each as it would have played out in today’s climate. The chart
          shows the record as it happened. The table prices off the adjusted version, and the note under
          the chart gives both averages.
        </P>
      </Section>

      <Section n={5} title="From events to a probability">
        <P>
          {YEARS} years cannot show a 1-in-200 year directly. So a count distribution is fitted to the
          adjusted events per year, and the tail is read from the distribution rather than the record.
        </P>
        <P>
          Where the year to year spread roughly equals the average, a Poisson distribution is used. Where
          it is noticeably larger, a negative binomial is used instead. That is common for heat, because
          the conditions that produce one heatwave tend to produce several in the same summer. The
          negative binomial gives that clumping a heavier tail, which is the honest answer for a peril
          that arrives in bunches.
        </P>
        <P>
          Payouts stop at the annual limit, {DEFAULTS.annualLimit} events per peril by default. Any worse
          year pays at the limit, which caps the worst case per policy.
        </P>
      </Section>

      <Section n={6} title="The price">
        <P>
          The premium is set so the combined ratio lands on the target. The combined ratio is claims plus
          expenses as a share of premium, and anything below 100% is underwriting profit.
        </P>
        <F>
          combined ratio = loss ratio + expense ratio
          <br />
          {pc(DEFAULTS.targetCombinedRatio)} = {pc(DEFAULTS.targetCombinedRatio - DEFAULTS.expenseRatio)} + {pc(DEFAULTS.expenseRatio)}
          <br />
          <br />
          premium = expected payout ÷ loss ratio
          <br />
          expenses = premium × expense ratio
          <br />
          margin = premium × (1 − combined ratio)
        </F>
        <P>
          Expected payout is the average number of paid events a year, from the fitted distribution,
          multiplied by the payout per event. Changing the payout scales every money figure and leaves
          every ratio unchanged.
        </P>
      </Section>

      <Section n={7} title="The capital check">
        <P>
          Pricing to a fixed combined ratio gives every location the same{' '}
          {pc(1 - DEFAULTS.targetCombinedRatio)} margin, however lumpy its risk. A peril that pays a
          little most years and one that pays nothing for decades then a lot should not earn the same
          margin. The capital check shows which is which.
        </P>
        <F>
          1-in-200 year payout = payout at the 99.5th percentile of the fitted distribution
          <br />
          capital needed = 1-in-200 year payout − expected payout
          <br />
          return on capital = margin ÷ capital needed
        </F>
        <P>
          The 99.5% level is the Solvency II and Solvency UK standard: enough capital to survive all but
          one year in two hundred. A low return on capital means the margin does not pay for the capital
          the risk ties up, which is the signal to raise the price, lower the limit or decline to write
          the cover.
        </P>
        <P>
          Writing heat and cold in the same book lowers the combined 1-in-200 payout below the sum of the
          two, because a severe summer and a severe winter are treated as independent. That
          diversification shows in the Both column.
        </P>
      </Section>

      <Section n={8} title="The portfolio">
        <F>
          policies in force = population × adoption rate
          <br />
          premium income = policies × annual premium
          <br />
          1-in-200 year payout = policies × 1-in-200 year payout per policy
        </F>
        <P>
          The last line is a straight multiplication, and that is the most important fact about this
          product. Every policy in the area pays on the same reading, so they all trigger together. There
          is no diversification inside an area: a million policies are one risk a million times over.
          Diversification only comes from writing in places whose weather does not move together.
        </P>
      </Section>

      <Section n={9} title="The 2031 to 2050 premium">
        <P>
          Climate models run warm or cold against observed weather, so their event counts are not used
          directly. Each model is compared with itself instead: its event rate over {FUTURE.start} to{' '}
          {FUTURE.end} against its own rate over {BASELINE.start} to {BASELINE.end}. That ratio is averaged
          across the models and applied to the adjusted historical frequency. Most of each model’s bias
          cancels in the ratio, leaving only the change.
        </P>
        <P>
          These runs follow a high emissions pathway, so the figure is nearer an upper case than a central
          estimate. It is not needed to price a one-year contract. It tells an insurer whether the product
          stays viable, which matters before launching anything.
        </P>
      </Section>

      <Section n={10} title="What this cannot tell you">
        <ul className="text-sm space-y-2" style={{ color: 'var(--ink-soft)', maxWidth: '68ch' }}>
          <li>
            <strong>Basis risk.</strong> The index is one grid point. A policyholder can suffer on a day the
            index misses, or be paid on a day they were fine. Every parametric product carries this, and it
            is the main thing a buyer needs to understand.
          </li>
          <li>
            <strong>No settlement source.</strong> A real contract names a specific station or dataset as
            binding, with fallbacks. Reanalysis is right for analysis and wrong for a contract.
          </li>
          <li>
            <strong>Reanalysis is modelled.</strong> It blends observations with a weather model and runs
            smoother than a thermometer, so extremes at a single station can be sharper than it shows.
          </li>
          <li>
            <strong>One point for the whole area.</strong> A large area has real temperature variation that
            a single index point ignores.
          </li>
          <li>
            <strong>Population is from {POPULATION_YEAR}.</strong> It is the latest year WorldPop publishes,
            and adoption is an assumption rather than a forecast.
          </li>
          <li>
            <strong>Thin history for rare perils.</strong> Where a trigger fired only a handful of times,
            the fitted distribution rests on very little and the price is uncertain. Cold cover in a mild
            city is the obvious example.
          </li>
          <li>
            <strong>Not a quotation.</strong> Nobody has underwritten anything here.
          </li>
        </ul>
      </Section>

      <Section n={11} title="Attribution">
        <P>
          Weather and climate data from Open-Meteo, used under its non-commercial terms. Historical data
          generated using Copernicus Climate Change Service information via ECMWF. Climate projections
          from CMIP6 HighResMIP, CC BY 4.0. Population from WorldPop, University of Southampton. Maps and
          place search from OpenStreetMap contributors, ODbL.
        </P>
        <p className="text-xs mt-4 pt-4" style={{ color: 'var(--muted)', borderTop: '1px solid var(--rule)' }}>
          {TOOL_NAME} was designed and built by {CREATOR}. It began as a business school submission on
          urban heat resilience and was extended into a working pricing model.
        </p>
      </Section>
    </div>
  </div>
);
