import React, { useState } from 'react';
import { Button } from './ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { LiveReading } from '../services/OpenMeteoService';
import {
  SEVERITY_BANDS,
  INTERVENTIONS,
  summarise,
} from '../services/RecommendationEngine';

interface PlannerPanelProps {
  readings: LiveReading[];
}

export const PlannerPanel: React.FC<PlannerPanelProps> = ({ readings }) => {
  const [open, setOpen] = useState(true);
  const summary = readings.length > 0 ? summarise(readings) : null;

  return (
    <div className="panel panel-pad space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="m-0 text-sm">Heat priority and response</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(!open)}
          className="h-6 w-6 p-0"
        >
          {open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </Button>
      </div>

      {open && (
        <>
          <div>
            <p className="text-xs text-muted-foreground leading-tight mb-1">
              Colour is severity
            </p>
            <div className="space-y-1">
              {SEVERITY_BANDS.map(band => (
                <div key={band.key} className="flex items-center gap-2">
                  <span
                    className="size-4 rounded-full shrink-0 border-2"
                    style={{ backgroundColor: `${band.color}55`, borderColor: band.color }}
                  />
                  <p className="text-xs leading-tight flex-1">
                    <strong>{band.priority} {band.label}</strong>
                    <span className="text-muted-foreground"> {band.min}-{band.max}°C</span>
                  </p>
                  {summary && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {summary.severityCounts[band.key] ?? 0}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground leading-tight mb-1">
              Icon is the recommended response, chosen on feasibility
            </p>
            <div className="space-y-1">
              {Object.values(INTERVENTIONS).map(iv => (
                <div key={iv.key} className="flex items-start gap-2">
                  <span className="text-sm shrink-0 w-5 text-center">{iv.emoji}</span>
                  <p className="text-xs leading-tight flex-1">
                    <strong>{iv.label}</strong>
                    <span className="text-muted-foreground block">{iv.examples}</span>
                  </p>
                  {summary && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {summary.counts[iv.key] ?? 0}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground leading-tight">
              {summary
                ? `${summary.total} live readings. Severity comes from surface temperature. The response is picked from soil moisture, solar load, wind and feels-like temperature, so two equally hot cells can need different work.`
                : 'Draw an area to load live conditions. Severity comes from surface temperature, the recommended response from soil moisture, solar load and wind.'}
            </p>
          </div>
        </>
      )}
    </div>
  );
};
