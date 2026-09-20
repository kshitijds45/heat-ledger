/**
 * Recommendation engine
 *
 * The original version mapped a temperature band directly to an intervention,
 * which meant the recommendation could never be wrong about feasibility
 * because it never checked. Planting trees was recommended on ground too dry
 * to support them, and ventilation corridors on sites that were already windy.
 *
 * This version separates two questions that were previously conflated:
 *
 *   Severity   how urgent is this cell        -> from surface temperature
 *   Response   what is actually deliverable   -> from the feasibility variables
 *
 * So severity sets the priority colour and the intervention sets the icon.
 * A hot cell with moist ground gets a different answer from a hot cell with
 * dry ground, which is the entire point.
 */

import { LiveReading } from './OpenMeteoService';

// ---------------------------------------------------------------------------
// Severity bands (unchanged absolute ranges)
// ---------------------------------------------------------------------------

export interface SeverityBand {
  key: string;
  label: string;
  priority: string;
  color: string;
  min: number;
  max: number;
}

export const SEVERITY_BANDS: SeverityBand[] = [
  { key: 'hot',  label: 'Hot',  priority: 'P1', color: '#8B0000', min: 42, max: 50 },
  { key: 'warm', label: 'Warm', priority: 'P2', color: '#FF4500', min: 35, max: 42 },
  { key: 'mild', label: 'Mild', priority: 'P3', color: '#FFA500', min: 28, max: 35 },
  { key: 'cool', label: 'Cool', priority: 'P4', color: '#4169E1', min: 15, max: 28 },
];

export const getSeverity = (surfaceTemp: number): SeverityBand => {
  if (surfaceTemp >= 42) return SEVERITY_BANDS[0];
  if (surfaceTemp >= 35) return SEVERITY_BANDS[1];
  if (surfaceTemp >= 28) return SEVERITY_BANDS[2];
  return SEVERITY_BANDS[3];
};

// ---------------------------------------------------------------------------
// Intervention types
// ---------------------------------------------------------------------------

export interface Intervention {
  key: string;
  emoji: string;
  label: string;
  examples: string;
}

export const INTERVENTIONS: Record<string, Intervention> = {
  nature: {
    key: 'nature',
    emoji: '🌳',
    label: 'Nature-based',
    examples: 'Street trees, green roofs, pocket parks',
  },
  built: {
    key: 'built',
    emoji: '🏗️',
    label: 'Built environment',
    examples: 'Cool roofs, reflective paving, built shade',
  },
  mobility: {
    key: 'mobility',
    emoji: '🚶',
    label: 'Social / mobility',
    examples: 'Shaded corridors, cooled stops, ventilation routes',
  },
  health: {
    key: 'health',
    emoji: '🧑‍⚕️',
    label: 'Health & alerts',
    examples: 'Heat alerts, cooling centres, outreach to at-risk residents',
  },
};

// ---------------------------------------------------------------------------
// Feasibility thresholds
// ---------------------------------------------------------------------------

/**
 * Volumetric soil water content, m3/m3. Below roughly 0.15 the top layer is
 * dry enough that new planting needs sustained irrigation to establish, so a
 * nature-based recommendation carries a permanent water cost rather than
 * being a one-off capital item.
 */
const SOIL_MOISTURE_VIABLE = 0.15;

/**
 * Shortwave radiation, W/m2. Above roughly 250 the surface is taking a
 * meaningful direct solar load, which is the condition under which albedo and
 * shading interventions actually repay their cost.
 */
const RADIATION_HIGH = 250;

/**
 * Wind speed at 10 m, km/h. Below roughly 8 the air is stagnant enough that
 * heat accumulates in street canyons rather than being flushed out, which is
 * what makes ventilation and corridor design worth doing.
 */
const WIND_STAGNANT = 8;

/**
 * Apparent temperature, degC. Above this, perceived heat stress is high
 * enough that the response is a public health one regardless of what the
 * physical site would otherwise support.
 */
const APPARENT_HEALTH_CRITICAL = 38;

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

export interface Recommendation {
  severity: SeverityBand;
  intervention: Intervention;
  reason: string;
  constraint: string | null;
}

/**
 * Ordered rules. The first match wins, and each carries the reason it fired
 * plus the constraint a planner would need to budget for. Ordering runs from
 * the most binding condition to the least.
 */
export const recommend = (r: LiveReading): Recommendation => {
  const severity = getSeverity(r.surfaceTemp);

  // 1. Perceived heat stress overrides site physics. If it already feels this
  //    hot, people need protecting now, whatever the long-run fix is.
  if (r.apparentTemp >= APPARENT_HEALTH_CRITICAL) {
    return {
      severity,
      intervention: INTERVENTIONS.health,
      reason: `Feels like ${r.apparentTemp}°C, above the ${APPARENT_HEALTH_CRITICAL}°C stress threshold`,
      constraint: 'Immediate response. Physical works will not help on the day.',
    };
  }

  // 2. Strong solar load with ground too dry to support planting. Reflect the
  //    heat instead, because vegetation here would need permanent irrigation.
  if (r.radiation >= RADIATION_HIGH && r.soilMoisture < SOIL_MOISTURE_VIABLE) {
    return {
      severity,
      intervention: INTERVENTIONS.built,
      reason: `High solar load at ${r.radiation} W/m² on dry ground (${r.soilMoisture} m³/m³)`,
      constraint: 'Planting here would need sustained irrigation to establish.',
    };
  }

  // 3. Strong solar load with ground that can actually support planting.
  if (r.radiation >= RADIATION_HIGH && r.soilMoisture >= SOIL_MOISTURE_VIABLE) {
    return {
      severity,
      intervention: INTERVENTIONS.nature,
      reason: `High solar load at ${r.radiation} W/m² with viable soil moisture (${r.soilMoisture} m³/m³)`,
      constraint: 'Shading benefit builds over years as canopy establishes.',
    };
  }

  // 4. Low solar load but stagnant air. The heat is not arriving from above,
  //    it is failing to leave, so the answer is moving air and moving people.
  if (r.windSpeed < WIND_STAGNANT) {
    return {
      severity,
      intervention: INTERVENTIONS.mobility,
      reason: `Stagnant air at ${r.windSpeed} km/h traps heat at street level`,
      constraint: 'Depends on street geometry, which this data cannot see.',
    };
  }

  // 5. Ventilated and not under strong solar load. Monitor rather than build.
  return {
    severity,
    intervention: INTERVENTIONS.health,
    reason: `Ventilated at ${r.windSpeed} km/h with moderate solar load (${r.radiation} W/m²)`,
    constraint: 'No structural intervention indicated at current conditions.',
  };
};

/** Count how many cells landed on each intervention, for the summary panel. */
export const summarise = (readings: LiveReading[]) => {
  const counts: Record<string, number> = {};
  const severityCounts: Record<string, number> = {};

  readings.forEach(r => {
    const rec = recommend(r);
    counts[rec.intervention.key] = (counts[rec.intervention.key] ?? 0) + 1;
    severityCounts[rec.severity.key] = (severityCounts[rec.severity.key] ?? 0) + 1;
  });

  return { counts, severityCounts, total: readings.length };
};
