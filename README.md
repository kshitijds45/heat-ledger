# Heat Ledger

Urban heat, priced. A browser-based tool that turns free, live climate data into cooling
interventions that are actually feasible at a given site, and into a parametric heat insurance
contract backtested against twenty years of reanalysis.

**Live site:** https://kshitijds45.github.io/heat-ledger/

No API keys. No backend. No database. Every figure on screen is fetched live from a public API,
and every request URL is written to the browser console so it can be checked against the source.

---

## Why it exists

Cities run several degrees hotter than the countryside around them, and the gap is widening. The
usual response is a heat map. A heat map tells you where it is hot, which is the easy half of the
problem and the half that does not change any decision.

Heat Ledger does two things a heat map does not.

**It checks whether a recommendation is deliverable.** Recommending urban tree planting on ground
too dry to support it is worse than recommending nothing, because it consumes a budget and fails
in year three. So severity and response are decided separately: surface temperature sets urgency,
while soil moisture, solar load and wind decide what can actually be built there. Two equally hot
cells can need different work, and the tool says which and why.

**It turns the heat into a price.** Heat costs money long before it damages a building. Outdoor and
informal workers lose a day's earnings every time it becomes unsafe to work, and no conventional
policy covers that. A parametric contract pays a fixed sum when a defined temperature threshold is
crossed, with no claim, no inspection and no loss adjustment. The tool counts how often that
trigger would have fired at a location over the past two decades, builds a premium from the
observed frequency and volatility, then reprices it against CMIP6 projections to 2050.

---

## What it does

| View | What it answers |
| --- | --- |
| **Planner** | Which cooling intervention is feasible at each point, and what constrains it |
| **Parametric** | What a heat trigger costs to insure at this location, and what it will cost in 2050 |
| **Portfolio** | Where exceedance concentrates across a region, and what a book of policies would lose |
| **Data** | The same results as headline metrics and tables, without touching the map |
| **Method** | Every source, threshold, formula and limitation, written out |

---

## Data sources

| API | Dataset | Resolution | Used for |
| --- | --- | --- | --- |
| [Open-Meteo Forecast](https://open-meteo.com/en/docs) | Best available national model | 1–11 km, hourly | Live conditions |
| [Open-Meteo Historical](https://open-meteo.com/en/docs/historical-weather-api) | ECMWF IFS, ERA5, ERA5-Land | 9–25 km, from 1940 | Trigger backtest, portfolio exposure |
| [Open-Meteo Climate](https://open-meteo.com/en/docs/climate-api) | CMIP6 HighResMIP, bias corrected | 10 km, daily, to 2050 | Repricing forward |
| [Nominatim](https://nominatim.org/) | OpenStreetMap | — | Place search |

---

## Pricing model

A standard actuarial build-up, with every loading exposed as an input rather than buried in code.

```
pure premium  = mean(paid days per year) × payout per day
risk load     = stdev(paid days per year) × multiple × payout per day
gross premium = (pure premium + risk load) ÷ (1 − expense ratio)

rate on line      = gross premium ÷ maximum liability × 1,000
target loss ratio = pure premium ÷ gross premium
```

Expenses divide rather than multiply because they are a share of gross premium, which is the
convention rate filings use. Marking up instead would understate them.

For the 2050 reprice, projected day counts are not used directly. The **ratio** between projected
and modelled-baseline frequency is applied to the observed historical mean, so systematic model
bias largely cancels and only the change signal carries through.

---

## Limitations

Stated plainly, because a tool that hides these is not worth trusting.

- **Basis risk.** A grid cell is not a person. Someone can suffer on a day the index misses. This
  is the central weakness of every parametric product and it is not solved here.
- **No settlement source.** A real contract names a binding station or dataset with agreed
  fallbacks. This uses whichever model Open-Meteo judges best, which is fine for analysis and
  unacceptable in a contract.
- **Reanalysis is modelled, not measured.** It assimilates observations but fills gaps by model.
- **Resolution.** The sharpest heat contrasts in a city happen over tens of metres, below what any
  of these models resolve. Portfolio exposure is regional, not street-level.
- **Not a quotation.** Nobody has underwritten anything here. This is a demonstration.

---

## Running locally

```bash
npm install
npm run dev
```

Then open the URL it prints. `npm run build` produces the static site in `dist/`.

Deployment is automatic: pushing to `main` triggers the workflow in
`.github/workflows/deploy.yml`, which builds and publishes to GitHub Pages.

---

## Stack

React 18, TypeScript, Vite, Tailwind, Leaflet, Recharts. Built as a static bundle so it runs
anywhere that serves files.

---

## Attribution

Weather and climate data from [Open-Meteo](https://open-meteo.com/) under its non-commercial terms.
Historical data generated using Copernicus Climate Change Service information (ERA5, ERA5-Land) via
ECMWF. Climate projections from the CMIP6 HighResMIP programme, CC BY 4.0. Basemap and geocoding
from OpenStreetMap contributors, ODbL.

The concept began as a business school submission on urban heat resilience and was extended into a
working risk pricing tool.

Built by **Kshitij Divansh Saxena**.
