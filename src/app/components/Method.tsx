import React from 'react';
import { TOOL_NAME, CREATOR } from '../branding';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="pt-6 mt-6" style={{ borderTop: '1px solid var(--rule)' }}>
    <h3 className="text-sm mb-3">{title}</h3>
    {children}
  </section>
);

const P: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--ink-soft)', maxWidth: '68ch' }}>
    {children}
  </p>
);

const Formula: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="text-xs tnum px-3 py-2 rounded-md my-2"
    style={{ background: 'var(--wash)', border: '1px solid var(--rule)', maxWidth: '68ch' }}
  >
    {children}
  </div>
);

export const Method: React.FC = () => (
  <div className="scroll-rail h-full p-4 md:p-8">
    <div className="max-w-3xl mx-auto pb-16">
      <h2 className="text-lg">Method and fine print</h2>
      <p className="text-xs mt-1 mb-2" style={{ color: 'var(--muted)' }}>
        Every figure in {TOOL_NAME}, where it comes from and how it is calculated.
      </p>

      <Section title="What this is, and what it is not">
        <P>
          This is a working demonstration built on public data. The climate figures are real and
          fetched live. The insurance figures are arithmetic applied to those real figures, using
          loadings that are set in the interface rather than derived from a book of business.
        </P>
        <P>
          It is not a quotation, an underwriting decision or financial advice. Nobody has
          underwritten anything here. A real product would need licensed basis risk analysis, an
          agreed settlement data source, regulatory approval and capital behind it.
        </P>
      </Section>

      <Section title="Data sources">
        <div className="overflow-x-auto">
          <table className="w-full text-xs tnum" style={{ minWidth: 520 }}>
            <thead>
              <tr style={{ color: 'var(--muted)' }}>
                <th className="text-left font-medium pb-2">API</th>
                <th className="text-left font-medium pb-2">Dataset</th>
                <th className="text-left font-medium pb-2">Resolution</th>
                <th className="text-left font-medium pb-2">Used for</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Forecast', 'Best available national model', '1 to 11 km, hourly', 'Live conditions, planner view'],
                ['Historical Weather', 'ECMWF IFS, ERA5, ERA5-Land', '9 to 25 km, hourly, from 1940', 'Trigger backtest, portfolio exposure'],
                ['Climate', 'CMIP6 HighResMIP, bias corrected', 'Downscaled to 10 km, daily, to 2050', 'Repricing the trigger forward'],
                ['Geocoding', 'Nominatim, OpenStreetMap', 'n/a', 'Place search'],
                ['Basemap', 'OpenStreetMap tiles', 'n/a', 'Map rendering'],
              ].map(row => (
                <tr key={row[0]} className="border-t" style={{ borderColor: 'var(--rule)' }}>
                  {row.map((cell, i) => (
                    <td key={i} className="py-2 pr-3" style={{ color: i === 0 ? 'var(--ink)' : 'var(--ink-soft)' }}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>
          Open-Meteo requires no API key and permits anonymous browser requests, which is what
          allows this to run as a static site with no server. Every request URL is written to the
          browser console, so any number here can be checked against the raw source.
        </p>
      </Section>

      <Section title="Variables, and why each one is here">
        <P>
          A temperature-only map can tell you where it is hot but not what to do about it. Each
          variable below was added because it changes a recommendation rather than decorating it.
        </P>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 520 }}>
            <tbody>
              {[
                ['soil_temperature_0cm', 'Ground surface temperature. Sets severity. Note that Open-Meteo documents this as water surface temperature over water, so it changes meaning across a coastline.'],
                ['apparent_temperature', 'Perceived temperature combining humidity, wind and solar radiation. This is what heat does to people, as opposed to what it does to surfaces.'],
                ['soil_moisture_0_to_1cm', 'Whether planting can establish without permanent irrigation. Also acts as the land mask, since it is a land-only field.'],
                ['shortwave_radiation', 'Incoming solar load. Determines whether reflective surfaces and shading will repay their cost.'],
                ['wind_speed_10m', 'Ventilation. Stagnant air is what turns a hot street into a heat trap.'],
                ['temperature_2m_max', 'The contractual trigger. Air temperature, not surface or apparent, because a parametric contract needs an objective measure both parties can verify.'],
              ].map(([name, why]) => (
                <tr key={name} className="border-t" style={{ borderColor: 'var(--rule)' }}>
                  <td className="py-2 pr-4 align-top whitespace-nowrap tnum" style={{ color: 'var(--ink)' }}>
                    {name}
                  </td>
                  <td className="py-2 align-top" style={{ color: 'var(--ink-soft)' }}>
                    {why}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="How a recommendation is chosen">
        <P>
          Severity and response are decided separately. Severity comes from surface temperature
          and sets the colour. The response comes from the feasibility variables and sets the
          icon, so two equally hot cells can need different work. Rules are evaluated in order and
          the first match wins.
        </P>
        <ol className="text-sm space-y-2 mb-3" style={{ color: 'var(--ink-soft)', maxWidth: '68ch' }}>
          <li>
            <strong>Feels like 38°C or above</strong> gives health and alerts. Perceived heat
            stress this high needs a response today, whatever the long-run fix is.
          </li>
          <li>
            <strong>Solar load above 250 W/m² with soil moisture under 0.15 m³/m³</strong> gives
            built environment. Strong sun on dry ground, where planting would need permanent
            irrigation, so reflect the heat instead.
          </li>
          <li>
            <strong>Solar load above 250 W/m² with soil moisture at or above 0.15</strong> gives
            nature-based. Same sun, but ground that can actually support canopy.
          </li>
          <li>
            <strong>Wind under 8 km/h</strong> gives social and mobility. Heat is not arriving
            from above, it is failing to leave, so the answer is moving air and moving people.
          </li>
          <li>
            <strong>Otherwise</strong> health and alerts, as monitoring. Ventilated and not under
            strong sun means no structural intervention is indicated right now.
          </li>
        </ol>
        <p className="text-xs" style={{ color: 'var(--muted)', maxWidth: '68ch' }}>
          The thresholds are defensible starting points rather than published standards. The
          0.15 m³/m³ soil moisture figure marks roughly where the top layer is too dry for new
          planting to establish unaided. Open-Meteo separately documents vapour pressure deficit
          above 1.6 kPa as the point where plant transpiration rises sharply, which is a useful
          cross-check on the same judgement.
        </p>
      </Section>

      <Section title="The parametric contract">
        <P>
          The trigger is a daily maximum air temperature at or above a chosen threshold. Each
          triggered day pays a fixed amount, up to a cap per year. There is no claim, no
          inspection and no loss adjustment, because there is nothing to assess. The index either
          crossed the line or it did not.
        </P>
        <Formula>
          triggered days in year Y = count of days where temperature_2m_max ≥ threshold
          <br />
          paid days in year Y = min(triggered days, annual cap)
        </Formula>
        <P>
          The backtest runs over the last 20 complete calendar years of reanalysis, ending at the last full year, because the archive lags real time by several
          days.
        </P>
      </Section>

      <Section title="The pricing build-up">
        <P>
          A standard actuarial build-up. The pure premium is what the contract is expected to pay.
          The risk load exists because a mean says nothing about how bad a single year gets. The
          expense load covers acquisition, administration and capital.
        </P>
        <Formula>
          pure premium = mean(paid days) × payout per day
          <br />
          risk load = standard deviation(paid days) × multiple × payout per day
          <br />
          gross premium = (pure premium + risk load) ÷ (1 − expense ratio)
        </Formula>
        <P>
          Expenses divide rather than multiply because they are expressed as a share of gross
          premium, which is the convention rate filings use. Marking up instead would understate
          them.
        </P>
        <Formula>
          maximum liability = annual cap × payout per day
          <br />
          rate on line = gross premium ÷ maximum liability × 1,000
          <br />
          target loss ratio = pure premium ÷ gross premium
        </Formula>
        <P>
          The loadings are exposed as inputs rather than buried in the code, because they are
          judgement and should be visible as such. Change them and every figure moves.
        </P>
      </Section>

      <Section title="Repricing to 2050">
        <P>
          Climate models carry bias against observed weather, so projected day counts are not used
          directly. Instead the ratio between projected and baseline trigger frequency is applied
          to the observed historical mean. Systematic model bias largely cancels in that ratio and
          only the change signal carries through.
        </P>
        <Formula>
          scale = projected trigger days (2031-2050) ÷ modelled baseline days (2000-2019)
          <br />
          repriced mean = min(observed mean × scale, annual cap)
        </Formula>
        <P>
          Two CMIP6 HighResMIP models are averaged. These high resolution runs sit close to RCP8.5,
          a high emissions pathway, so the projection should be read as an upper case rather than a
          central estimate. Scenario differences are in any case modest before 2050.
        </P>
      </Section>

      <Section title="Known limitations">
        <ul className="text-sm space-y-2" style={{ color: 'var(--ink-soft)', maxWidth: '68ch' }}>
          <li>
            <strong>Basis risk.</strong> A grid cell is not a person. Someone can suffer badly on a
            day the index misses, and be paid on a day they were indoors. This is the central
            weakness of every parametric product and it is not solved here.
          </li>
          <li>
            <strong>Resolution mismatch.</strong> Live conditions resolve to a few kilometres,
            reanalysis to 9 to 25 km. Portfolio exposure is therefore regional. A finer grid would
            look more precise while returning the same cell repeatedly.
          </li>
          <li>
            <strong>Reanalysis is modelled, not measured.</strong> It assimilates observations but
            fills gaps by model. It is the standard basis for climate risk work and it is still not
            a thermometer at the site.
          </li>
          <li>
            <strong>No settlement source.</strong> A real contract would name a specific station or
            dataset as the binding index, with agreed fallbacks. This demo uses whichever model
            Open-Meteo judges best for the location, which is fine for analysis and unacceptable in
            a contract.
          </li>
          <li>
            <strong>No exposure data.</strong> The portfolio view assumes an even spread of
            policies across cells. Real books are not evenly spread, and concentration is the whole
            question.
          </li>
          <li>
            <strong>Urban heat island effect is under-resolved.</strong> The sharpest heat contrasts
            in a city happen over tens of metres, below what any of these models see.
          </li>
        </ul>
      </Section>

      <Section title="Attribution and licence">
        <P>
          Weather and climate data from Open-Meteo, used under its non-commercial terms. Historical
          data generated using Copernicus Climate Change Service information, ERA5 and ERA5-Land,
          via ECMWF. Climate projections from the CMIP6 HighResMIP programme, licensed CC BY 4.0.
          Basemap and place search from OpenStreetMap contributors, licensed under the Open
          Database License.
        </P>
        <p className="text-xs mt-4 pt-4" style={{ color: 'var(--muted)', borderTop: '1px solid var(--rule)' }}>
          {TOOL_NAME} was designed and built by {CREATOR}. The concept began as a business school
          submission on urban heat resilience and was extended into a working risk pricing tool.
        </p>
      </Section>
    </div>
  </div>
);
