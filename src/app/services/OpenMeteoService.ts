/**
 * Open-Meteo service layer
 *
 * Three separate Open-Meteo APIs are used, all free, keyless and CORS-enabled,
 * which is what lets this run as a static site with no backend:
 *
 *   1. Forecast API    api.open-meteo.com/v1/forecast
 *      Live hourly conditions. 1-11 km depending on region and model.
 *      Used for the planner view.
 *
 *   2. Historical API  archive-api.open-meteo.com/v1/archive
 *      Reanalysis from 1940. ERA5 0.25 deg, ERA5-Land 0.1 deg, ECMWF IFS 9 km
 *      from 2017. Used to backtest the parametric trigger.
 *
 *   3. Climate API     climate-api.open-meteo.com/v1/climate
 *      CMIP6 HighResMIP downscaled to 10 km, daily, to 2050.
 *      Used to project trigger frequency forward.
 *
 * Trigger variable note: the contract trigger is temperature_2m_max, not
 * apparent temperature. The Climate API does not expose an apparent
 * temperature aggregation, so using it would mean backtesting and projecting
 * on two different definitions. A parametric contract also needs an objective
 * measure a counterparty cannot dispute, and air temperature is that measure.
 * Apparent temperature is still used in the planner view, where perceived
 * heat stress is the relevant quantity.
 */

const FORECAST_API = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_API = 'https://archive-api.open-meteo.com/v1/archive';
const CLIMATE_API = 'https://climate-api.open-meteo.com/v1/climate';

const MAX_LOCATIONS_PER_REQUEST = 100;

// ---------------------------------------------------------------------------
// Shared geometry helpers
// ---------------------------------------------------------------------------

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface GridPoint {
  lat: number;
  lon: number;
}

export function kmSpan(bounds: Bounds): { latKm: number; lonKm: number } {
  const midLat = (bounds.north + bounds.south) / 2;
  return {
    latKm: (bounds.north - bounds.south) * 110.574,
    lonKm: Math.abs((bounds.east - bounds.west) * 111.32 * Math.cos((midLat * Math.PI) / 180)),
  };
}

/** Grid sized to the real ground area, at a given target spacing, with a cap. */
export function buildGrid(
  bounds: Bounds,
  targetSpacingKm: number,
  maxDim: number
): GridPoint[] {
  const { latKm, lonKm } = kmSpan(bounds);

  const rows = Math.min(maxDim, Math.max(2, Math.round(latKm / targetSpacingKm)));
  const cols = Math.min(maxDim, Math.max(2, Math.round(lonKm / targetSpacingKm)));

  const latStep = (bounds.north - bounds.south) / rows;
  const lonStep = (bounds.east - bounds.west) / cols;

  const points: GridPoint[] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const lat = bounds.south + (i + 0.5) * latStep;
      const lon = bounds.west + (j + 0.5) * lonStep;
      if (isFinite(lat) && isFinite(lon)) points.push({ lat, lon });
    }
  }
  return points;
}

/** Same as buildGrid but also returns each point's own cell bounds, for drawing. */
export function buildGridCells(
  bounds: Bounds,
  targetSpacingKm: number,
  maxDim: number
): Array<{ lat: number; lon: number; cell: Bounds }> {
  const { latKm, lonKm } = kmSpan(bounds);

  const rows = Math.min(maxDim, Math.max(2, Math.round(latKm / targetSpacingKm)));
  const cols = Math.min(maxDim, Math.max(2, Math.round(lonKm / targetSpacingKm)));

  const latStep = (bounds.north - bounds.south) / rows;
  const lonStep = (bounds.east - bounds.west) / cols;

  const out: Array<{ lat: number; lon: number; cell: Bounds }> = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const south = bounds.south + i * latStep;
      const west = bounds.west + j * lonStep;
      out.push({
        lat: south + latStep / 2,
        lon: west + lonStep / 2,
        cell: { south, west, north: south + latStep, east: west + lonStep },
      });
    }
  }
  return out;
}

function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const midLat = ((aLat + bLat) / 2) * (Math.PI / 180);
  const dLat = (aLat - bLat) * 110.574;
  const dLon = (aLon - bLon) * 111.32 * Math.cos(midLat);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

async function getJson(url: string, signal?: AbortSignal): Promise<any> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.reason ? `: ${body.reason}` : '';
    } catch {
      /* body was not JSON */
    }
    throw new Error(`Open-Meteo HTTP ${response.status}${detail}`);
  }
  const data = await response.json();
  if (!Array.isArray(data) && data?.error) {
    throw new Error(data.reason ?? 'Open-Meteo returned an error');
  }
  return data;
}

// ---------------------------------------------------------------------------
// 1. Live conditions (planner view)
// ---------------------------------------------------------------------------

export interface LiveReading {
  id: number;
  lat: number;
  lon: number;
  surfaceTemp: number;      // soil_temperature_0cm, degC
  apparentTemp: number;     // apparent_temperature, degC
  windSpeed: number;        // wind_speed_10m, km/h
  radiation: number;        // shortwave_radiation, W/m2
  soilMoisture: number;     // soil_moisture_0_to_1cm, m3/m3
}

// Open-Meteo forecast models run at roughly 1-11 km. Sampling much finer than
// 2 km returns the same model cell repeatedly, so this is the useful floor.
const LIVE_SPACING_KM = 2;
const LIVE_MAX_DIM = 18;

// Readings served from a cell further away than this are discarded, which is
// what keeps sea points from being filled in with borrowed land values.
const MAX_SNAP_KM = 12;

async function fetchLiveBatch(
  points: GridPoint[],
  idOffset: number,
  signal?: AbortSignal
): Promise<LiveReading[]> {
  const params = new URLSearchParams({
    latitude: points.map(p => p.lat.toFixed(4)).join(','),
    longitude: points.map(p => p.lon.toFixed(4)).join(','),
    hourly: [
      'soil_temperature_0cm',
      'apparent_temperature',
      'wind_speed_10m',
      'shortwave_radiation',
      'soil_moisture_0_to_1cm',
    ].join(','),
    forecast_days: '1',
    timezone: 'UTC',
    cell_selection: 'nearest',
  });

  const url = `${FORECAST_API}?${params.toString()}`;
  if (idOffset === 0) console.info('Live conditions request:', url);

  const data = await getJson(url, signal);
  const entries: any[] = Array.isArray(data) ? data : [data];

  const hourIndex = Math.min(new Date().getUTCHours(), 23);
  const results: LiveReading[] = [];

  entries.forEach((entry, idx) => {
    const point = points[idx];
    if (!point) return;

    const h = entry?.hourly;
    if (!h) return;

    const pick = (name: string): number | null => {
      const series = h[name];
      if (!Array.isArray(series)) return null;
      const raw = series[hourIndex];
      if (raw === null || raw === undefined || !isFinite(Number(raw))) return null;
      return Number(raw);
    };

    const surfaceTemp = pick('soil_temperature_0cm');
    const soilMoisture = pick('soil_moisture_0_to_1cm');

    // soil_temperature_0cm is documented as the water surface temperature over
    // water, so it alone cannot distinguish land from sea. Soil moisture is a
    // land-only field, so requiring it acts as the land mask.
    if (surfaceTemp === null || soilMoisture === null) return;

    const apparentTemp = pick('apparent_temperature');
    const windSpeed = pick('wind_speed_10m');
    const radiation = pick('shortwave_radiation');
    if (apparentTemp === null || windSpeed === null || radiation === null) return;

    const servedLat = Number(entry.latitude);
    const servedLon = Number(entry.longitude);
    const lat = isFinite(servedLat) ? servedLat : point.lat;
    const lon = isFinite(servedLon) ? servedLon : point.lon;
    if (distanceKm(lat, lon, point.lat, point.lon) > MAX_SNAP_KM) return;

    if (surfaceTemp < -60 || surfaceTemp > 80) return;

    results.push({
      id: idOffset + idx,
      lat,
      lon,
      surfaceTemp: parseFloat(surfaceTemp.toFixed(1)),
      apparentTemp: parseFloat(apparentTemp.toFixed(1)),
      windSpeed: parseFloat(windSpeed.toFixed(1)),
      radiation: Math.round(radiation),
      soilMoisture: parseFloat(soilMoisture.toFixed(3)),
    });
  });

  return results;
}

export const fetchLiveConditions = async (
  bounds: Bounds,
  signal?: AbortSignal
): Promise<LiveReading[]> => {
  const points = buildGrid(bounds, LIVE_SPACING_KM, LIVE_MAX_DIM);

  const results: LiveReading[] = [];
  for (let i = 0; i < points.length; i += MAX_LOCATIONS_PER_REQUEST) {
    const chunk = points.slice(i, i + MAX_LOCATIONS_PER_REQUEST);
    results.push(...(await fetchLiveBatch(chunk, i, signal)));
  }

  console.info(`Live conditions: ${results.length} readings from ${points.length} points`);
  return results;
};

// ---------------------------------------------------------------------------
// 2. Historical backtest (parametric view)
// ---------------------------------------------------------------------------

export interface YearResult {
  year: number;
  triggeredDays: number;   // raw count above threshold
  paidDays: number;        // after the per-season cap
  hottest: number;         // max temperature_2m_max that year
}

export interface BacktestResult {
  lat: number;
  lon: number;
  startYear: number;
  endYear: number;
  years: YearResult[];
  meanPaidDays: number;
  sdPaidDays: number;
  maxPaidDays: number;
  yearsWithAnyPayout: number;
  hottestOnRecord: number;
  requestUrl: string;
}

/** Full calendar years of archive data available, allowing for reporting delay. */
export function archiveYearRange(lookbackYears: number): { start: number; end: number } {
  const now = new Date();
  // Archive lags real time, so the previous calendar year is the last safe one.
  const end = now.getUTCFullYear() - 1;
  return { start: end - lookbackYears + 1, end };
}

export const backtestTrigger = async (
  lat: number,
  lon: number,
  thresholdC: number,
  capDaysPerYear: number,
  lookbackYears: number,
  signal?: AbortSignal
): Promise<BacktestResult> => {
  const { start, end } = archiveYearRange(lookbackYears);

  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start_date: `${start}-01-01`,
    end_date: `${end}-12-31`,
    daily: 'temperature_2m_max',
    timezone: 'UTC',
  });

  const url = `${ARCHIVE_API}?${params.toString()}`;
  console.info('Historical backtest request:', url);

  const data = await getJson(url, signal);
  const times: string[] = data?.daily?.time ?? [];
  const maxima: Array<number | null> = data?.daily?.temperature_2m_max ?? [];

  if (times.length === 0) throw new Error('Historical archive returned no days for this point');

  const byYear = new Map<number, { count: number; hottest: number }>();
  for (let y = start; y <= end; y++) byYear.set(y, { count: 0, hottest: -Infinity });

  times.forEach((t, i) => {
    const value = maxima[i];
    if (value === null || value === undefined || !isFinite(Number(value))) return;
    const year = parseInt(t.slice(0, 4), 10);
    const bucket = byYear.get(year);
    if (!bucket) return;
    const v = Number(value);
    if (v > bucket.hottest) bucket.hottest = v;
    if (v >= thresholdC) bucket.count += 1;
  });

  const years: YearResult[] = [];
  byYear.forEach((bucket, year) => {
    years.push({
      year,
      triggeredDays: bucket.count,
      paidDays: Math.min(bucket.count, capDaysPerYear),
      hottest: isFinite(bucket.hottest) ? parseFloat(bucket.hottest.toFixed(1)) : NaN,
    });
  });
  years.sort((a, b) => a.year - b.year);

  const paid = years.map(y => y.paidDays);
  const mean = paid.reduce((a, b) => a + b, 0) / paid.length;
  const variance = paid.reduce((a, b) => a + (b - mean) ** 2, 0) / paid.length;

  return {
    lat,
    lon,
    startYear: start,
    endYear: end,
    years,
    meanPaidDays: mean,
    sdPaidDays: Math.sqrt(variance),
    maxPaidDays: Math.max(...paid),
    yearsWithAnyPayout: paid.filter(d => d > 0).length,
    hottestOnRecord: Math.max(...years.map(y => y.hottest).filter(isFinite)),
    requestUrl: url,
  };
};

// ---------------------------------------------------------------------------
// 3. Climate projection (parametric view)
// ---------------------------------------------------------------------------

export interface ProjectionResult {
  baselineWindow: string;
  futureWindow: string;
  baselineDaysPerYear: number;
  futureDaysPerYear: number;
  models: string[];
  requestUrl: string;
}

// Two models chosen because both carry the full variable set. The API charges
// by time range, models and variables, so this stays deliberately narrow.
const CLIMATE_MODELS = ['MRI_AGCM3_2_S', 'EC_Earth3P_HR'];

const BASELINE_START = 2000;
const BASELINE_END = 2019;
const FUTURE_START = 2031;
const FUTURE_END = 2050;

export const projectTrigger = async (
  lat: number,
  lon: number,
  thresholdC: number,
  signal?: AbortSignal
): Promise<ProjectionResult> => {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start_date: `${BASELINE_START}-01-01`,
    end_date: `${FUTURE_END}-01-01`,
    models: CLIMATE_MODELS.join(','),
    daily: 'temperature_2m_max',
  });

  const url = `${CLIMATE_API}?${params.toString()}`;
  console.info('Climate projection request:', url);

  const data = await getJson(url, signal);
  const times: string[] = data?.daily?.time ?? [];

  // With several models the response carries one series per model, suffixed.
  const seriesKeys = Object.keys(data?.daily ?? {}).filter(k => k !== 'time');
  if (times.length === 0 || seriesKeys.length === 0) {
    throw new Error('Climate API returned no projection for this point');
  }

  let baselineHits = 0;
  let baselineDays = 0;
  let futureHits = 0;
  let futureDays = 0;

  seriesKeys.forEach(key => {
    const series: Array<number | null> = data.daily[key];
    if (!Array.isArray(series)) return;
    times.forEach((t, i) => {
      const value = series[i];
      if (value === null || value === undefined || !isFinite(Number(value))) return;
      const year = parseInt(t.slice(0, 4), 10);
      const hit = Number(value) >= thresholdC ? 1 : 0;
      if (year >= BASELINE_START && year <= BASELINE_END) {
        baselineDays += 1;
        baselineHits += hit;
      } else if (year >= FUTURE_START && year <= FUTURE_END) {
        futureDays += 1;
        futureHits += hit;
      }
    });
  });

  if (baselineDays === 0 || futureDays === 0) {
    throw new Error('Climate API returned an incomplete projection window');
  }

  return {
    baselineWindow: `${BASELINE_START}-${BASELINE_END}`,
    futureWindow: `${FUTURE_START}-${FUTURE_END}`,
    baselineDaysPerYear: (baselineHits / baselineDays) * 365.25,
    futureDaysPerYear: (futureHits / futureDays) * 365.25,
    models: CLIMATE_MODELS,
    requestUrl: url,
  };
};

// ---------------------------------------------------------------------------
// 4. Portfolio exposure (multi-cell backtest)
// ---------------------------------------------------------------------------

export interface PortfolioCell {
  lat: number;
  lon: number;
  cell: Bounds;
  meanPaidDays: number;
  maxPaidDays: number;
  yearsWithPayout: number;
}

export interface PortfolioResult {
  cells: PortfolioCell[];
  startYear: number;
  endYear: number;
  meanPaidDaysPortfolio: number;
  worstCell: PortfolioCell | null;
  requestUrl: string;
}

// The historical archive resolves at 9-25 km, so a portfolio grid finer than
// this would return the same reanalysis cell several times over. Exposure is
// therefore a regional view, not a street-level one.
const PORTFOLIO_SPACING_KM = 20;
const PORTFOLIO_MAX_DIM = 4;
const PORTFOLIO_LOOKBACK = 10;

export const backtestPortfolio = async (
  bounds: Bounds,
  thresholdC: number,
  capDaysPerYear: number,
  signal?: AbortSignal
): Promise<PortfolioResult> => {
  const cells = buildGridCells(bounds, PORTFOLIO_SPACING_KM, PORTFOLIO_MAX_DIM);
  const { start, end } = archiveYearRange(PORTFOLIO_LOOKBACK);

  const params = new URLSearchParams({
    latitude: cells.map(c => c.lat.toFixed(4)).join(','),
    longitude: cells.map(c => c.lon.toFixed(4)).join(','),
    start_date: `${start}-01-01`,
    end_date: `${end}-12-31`,
    daily: 'temperature_2m_max',
    timezone: 'UTC',
  });

  const url = `${ARCHIVE_API}?${params.toString()}`;
  console.info('Portfolio backtest request:', url);

  const data = await getJson(url, signal);
  const entries: any[] = Array.isArray(data) ? data : [data];

  const out: PortfolioCell[] = [];

  entries.forEach((entry, idx) => {
    const spec = cells[idx];
    if (!spec) return;

    const times: string[] = entry?.daily?.time ?? [];
    const maxima: Array<number | null> = entry?.daily?.temperature_2m_max ?? [];
    if (times.length === 0) return;

    const counts = new Map<number, number>();
    for (let y = start; y <= end; y++) counts.set(y, 0);

    times.forEach((t, i) => {
      const value = maxima[i];
      if (value === null || value === undefined || !isFinite(Number(value))) return;
      if (Number(value) < thresholdC) return;
      const year = parseInt(t.slice(0, 4), 10);
      if (counts.has(year)) counts.set(year, (counts.get(year) ?? 0) + 1);
    });

    const paid = Array.from(counts.values()).map(c => Math.min(c, capDaysPerYear));
    const mean = paid.reduce((a, b) => a + b, 0) / paid.length;

    out.push({
      lat: spec.lat,
      lon: spec.lon,
      cell: spec.cell,
      meanPaidDays: mean,
      maxPaidDays: Math.max(...paid),
      yearsWithPayout: paid.filter(d => d > 0).length,
    });
  });

  if (out.length === 0) throw new Error('Portfolio backtest returned no usable cells');

  const meanPortfolio =
    out.reduce((a, c) => a + c.meanPaidDays, 0) / out.length;
  const worst = out.reduce(
    (best, c) => (best === null || c.meanPaidDays > best.meanPaidDays ? c : best),
    null as PortfolioCell | null
  );

  return {
    cells: out,
    startYear: start,
    endYear: end,
    meanPaidDaysPortfolio: meanPortfolio,
    worstCell: worst,
    requestUrl: url,
  };
};
