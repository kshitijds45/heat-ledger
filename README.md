# Heat Ledger

Heatwave and cold wave insurance, priced from open climate data.

**Live site:** https://kshitijds45.github.io/heat-ledger/

Pick any area and Heat Ledger prices parametric cover against both perils: how often each
trigger fires in today's climate, the premium that hits a target combined ratio, the 1-in-200
year payout and what a book of policies across the area would earn and lose. No API keys, no
backend. Every figure comes from a public source, and every request is logged to the browser
console so it can be checked.

---

## The product

Parametric cover pays a fixed sum when a temperature index crosses a defined line. There is no
claim and no loss adjuster. Because the payout is fixed by contract, there is no damage to model:
the only uncertainty is how often the trigger fires, which can be answered from weather data alone.

Both default triggers are official UK definitions:

| Peril | Trigger | Source |
| --- | --- | --- |
| Heatwave | 3+ consecutive days with maximum at or above 28°C | Met Office heatwave definition, Greater London |
| Cold wave | Each 7 consecutive days with mean at or below 0°C | Cold Weather Payment trigger |

## The pricing chain

1. **Event history.** Daily temperature at the area's centre, 1991 to the last complete year.
2. **Trend adjustment.** A linear trend in summer (for heat) and winter (for cold) temperature is
   removed, so every past year is priced as if it happened in today's climate. A plain average
   underprices heat and overprices cold.
3. **Fitted frequency.** A Poisson or, where hot summers bring clusters of heatwaves, a negative
   binomial distribution is fitted to events per year. 35 years cannot show a 1-in-200 year
   directly, so the tail is read from the distribution.
4. **Price.** The premium is set so the combined ratio hits the target:

   ```
   combined ratio = loss ratio + expense ratio   (85% = 55% + 30% by default)
   premium        = expected payout ÷ loss ratio
   ```

5. **Capital check.** The 1-in-200 year payout (the Solvency II and Solvency UK 99.5% standard)
   and the return the margin earns on the capital that tail requires. Pricing to a fixed combined
   ratio gives every location the same margin however lumpy its risk. Return on capital shows
   where that margin is not enough.
6. **Portfolio.** Population (WorldPop) × adoption rate = policies in force. Every policy pays on
   the same reading, so the book's 1-in-200 payout is a straight multiplication. There is no
   diversification inside an area.
7. **2031 to 2050.** Each CMIP6 model's future event rate is compared with its own baseline, and
   that ratio is applied to the adjusted history, so model bias cancels.

All assumptions (triggers, payout, annual limit, combined ratio, expense ratio, adoption) can be
changed in the app, and every figure recalculates instantly.

## Data

| Source | Used for |
| --- | --- |
| [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) | Daily temperature from 1991, ECMWF reanalysis |
| [Open-Meteo Climate API](https://open-meteo.com/en/docs/climate-api) | CMIP6 HighResMIP projections to 2050 |
| [WorldPop](https://www.worldpop.org/) | Population inside the chosen area, 2020 |
| [OpenStreetMap](https://www.openstreetmap.org/) | Map tiles and place search |

## Limitations

- **Basis risk.** The index is one grid point. A policyholder can suffer on a day it misses.
- **No settlement source.** A real contract names a binding weather station. This uses reanalysis.
- **Reanalysis is modelled**, and runs smoother than a single thermometer.
- **Thin history for rare perils.** Cold cover in a mild city rests on very few events.
- **Population is from 2020**, the latest WorldPop year. Adoption is an assumption.
- **Not a quotation.** Nobody has underwritten anything here.

## Running and deploying

Pushing to `main` builds and publishes the site automatically through
`.github/workflows/deploy.yml`. To run locally: `npm install`, then `npm run dev`.

React, TypeScript, Vite, Tailwind, Leaflet and Recharts.

## Attribution

Weather and climate data from Open-Meteo under its non-commercial terms. Historical data generated
using Copernicus Climate Change Service information via ECMWF. Projections from CMIP6 HighResMIP,
CC BY 4.0. Population from WorldPop, University of Southampton. Maps from OpenStreetMap
contributors, ODbL.

Built by **Kshitij Divansh Saxena**. The concept began as a business school submission on urban
heat resilience and was extended into a working pricing model.
