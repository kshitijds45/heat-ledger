import React, { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { LiveReading, PortfolioCell, Bounds } from '../services/OpenMeteoService';
import { recommend } from '../services/RecommendationEngine';

export type MapMode = 'planner' | 'parametric' | 'portfolio';

interface HeatMapProps {
  center: [number, number];
  zoom: number;
  mode: MapMode;
  liveReadings: LiveReading[];
  portfolioCells: PortfolioCell[];
  pickedPoint: { lat: number; lon: number } | null;
  isLoading: boolean;
  loadingLabel: string;
  onMapReady?: () => void;
  onAreaSelected: (bounds: Bounds, leafletBounds: any) => void;
  onPointPicked: (lat: number, lon: number) => void;
  onControlsReady?: (controls: {
    startSelection: () => void;
    clearAll: () => void;
    isSelecting: boolean;
    hasSelection: boolean;
  }) => void;
}

// Smallest selection worth querying, in degrees, so a stray click does not
// send a zero-area box to the API.
const MIN_SPAN_DEG = 0.002;

/** Blue through red ramp for portfolio exposure. */
function exposureColor(meanDays: number, maxDays: number): string {
  if (maxDays <= 0) return '#4169E1';
  const t = Math.max(0, Math.min(1, meanDays / maxDays));
  const stops = [
    { t: 0, c: [65, 105, 225] },
    { t: 0.5, c: [255, 165, 0] },
    { t: 1, c: [139, 0, 0] },
  ];
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const span = hi.t - lo.t || 1;
  const k = (t - lo.t) / span;
  const rgb = lo.c.map((v, i) => Math.round(v + (hi.c[i] - v) * k));
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

export const HeatMap: React.FC<HeatMapProps> = ({
  center,
  zoom,
  mode,
  liveReadings,
  portfolioCells,
  pickedPoint,
  isLoading,
  loadingLabel,
  onMapReady,
  onAreaSelected,
  onPointPicked,
  onControlsReady,
}) => {
  const mapRef = useRef<any>(null);
  const mapInstanceRef = useRef<any>(null);
  const [map, setMap] = useState<any>(null);
  const [L, setLeaflet] = useState<any>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);

  const markersRef = useRef<any[]>([]);
  const heatLayerRef = useRef<any>(null);
  const rectangleRef = useRef<any>(null);
  const cellLayersRef = useRef<any[]>([]);
  const pointMarkerRef = useRef<any>(null);

  const onAreaSelectedRef = useRef(onAreaSelected);
  const onPointPickedRef = useRef(onPointPicked);
  useEffect(() => {
    onAreaSelectedRef.current = onAreaSelected;
  }, [onAreaSelected]);
  useEffect(() => {
    onPointPickedRef.current = onPointPicked;
  }, [onPointPicked]);

  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // ---- Init ----
  useEffect(() => {
    const loadMap = async () => {
      const leaflet = (await import('leaflet')).default;
      setLeaflet(leaflet);

      delete (leaflet.Icon.Default.prototype as any)._getIconUrl;
      leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (mapRef.current && !mapInstanceRef.current) {
        const instance = leaflet.map(mapRef.current).setView(center, zoom);
        leaflet
          .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19,
          })
          .addTo(instance);

        instance.on('click', (e: any) => {
          if (modeRef.current !== 'parametric') return;
          onPointPickedRef.current?.(e.latlng.lat, e.latlng.lng);
        });

        mapInstanceRef.current = instance;
        setMap(instance);
        onMapReady?.();
      }
    };

    loadMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (map) map.setView(center, zoom);
  }, [center, zoom, map]);

  // Cursor hint when the map is click-to-pick
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.style.cursor = mode === 'parametric' ? 'crosshair' : '';
  }, [mode]);

  // ---- Planner rendering ----
  useEffect(() => {
    if (!map || !L) return;

    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    if (mode !== 'planner' || liveReadings.length === 0) return;

    const lats = liveReadings.map(r => r.lat);
    const lons = liveReadings.map(r => r.lon);
    const b = {
      north: Math.max(...lats),
      south: Math.min(...lats),
      east: Math.max(...lons),
      west: Math.min(...lons),
    };

    // Heat canvas shaded by severity
    if (b.north > b.south && b.east > b.west) {
      const canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 750;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        const radius =
          (Math.max(canvas.width, canvas.height) / Math.sqrt(liveReadings.length)) * 1.2;

        liveReadings.forEach(r => {
          const { severity } = recommend(r);
          const cx = ((r.lon - b.west) / (b.east - b.west)) * canvas.width;
          const cy = ((b.north - r.lat) / (b.north - b.south)) * canvas.height;
          if (!isFinite(cx) || !isFinite(cy)) return;

          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
          grad.addColorStop(0, severity.color + 'CC');
          grad.addColorStop(0.5, severity.color + '77');
          grad.addColorStop(1, severity.color + '00');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();
        });

        heatLayerRef.current = L.imageOverlay(
          canvas.toDataURL(),
          [
            [b.south, b.west],
            [b.north, b.east],
          ],
          { opacity: 0.55, interactive: false }
        ).addTo(map);
      }
    }

    // Markers: colour carries severity, icon carries the recommended response
    const size = liveReadings.length > 200 ? 20 : liveReadings.length > 90 ? 24 : 28;
    const fontSize = Math.round(size * 0.6);

    liveReadings.forEach(r => {
      const rec = recommend(r);

      const icon = L.divIcon({
        html: `<div style="
          font-size:${fontSize}px;width:${size}px;height:${size}px;
          display:flex;align-items:center;justify-content:center;
          background:${rec.severity.color}55;border-radius:50%;
          border:2px solid ${rec.severity.color};
          box-shadow:0 2px 4px rgba(0,0,0,0.35);">${rec.intervention.emoji}</div>`,
        className: 'custom-temperature-marker',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([r.lat, r.lon], { icon })
        .bindPopup(
          `<div style="min-width:230px;font-size:12px;line-height:1.45">
            <div style="font-size:13px;margin-bottom:6px">
              <strong>${rec.severity.priority} ${rec.severity.label}</strong>
              &nbsp;·&nbsp; ${rec.intervention.emoji} ${rec.intervention.label}
            </div>
            <div style="color:#444;margin-bottom:6px">${rec.reason}</div>
            ${
              rec.constraint
                ? `<div style="color:#8a6d00;background:#fff8e1;padding:4px 6px;border-radius:4px;margin-bottom:6px">${rec.constraint}</div>`
                : ''
            }
            <div style="color:#333;margin-bottom:6px">${rec.intervention.examples}</div>
            <table style="width:100%;border-collapse:collapse;color:#555">
              <tr><td>Surface temp</td><td style="text-align:right">${r.surfaceTemp}°C</td></tr>
              <tr><td>Feels like</td><td style="text-align:right">${r.apparentTemp}°C</td></tr>
              <tr><td>Wind</td><td style="text-align:right">${r.windSpeed} km/h</td></tr>
              <tr><td>Solar load</td><td style="text-align:right">${r.radiation} W/m²</td></tr>
              <tr><td>Soil moisture</td><td style="text-align:right">${r.soilMoisture} m³/m³</td></tr>
            </table>
            <div style="color:#888;margin-top:6px">Live, Open-Meteo</div>
          </div>`,
          { maxWidth: 300 }
        )
        .addTo(map);

      markersRef.current.push(marker);
    });
  }, [map, L, mode, liveReadings]);

  // ---- Portfolio rendering ----
  useEffect(() => {
    if (!map || !L) return;

    cellLayersRef.current.forEach(l => map.removeLayer(l));
    cellLayersRef.current = [];

    if (mode !== 'portfolio' || portfolioCells.length === 0) return;

    const maxDays = Math.max(...portfolioCells.map(c => c.meanPaidDays), 0.0001);

    portfolioCells.forEach(c => {
      const color = exposureColor(c.meanPaidDays, maxDays);
      const layer = L.rectangle(
        [
          [c.cell.south, c.cell.west],
          [c.cell.north, c.cell.east],
        ],
        { color: '#333', weight: 1, fillColor: color, fillOpacity: 0.6 }
      )
        .bindPopup(
          `<div style="min-width:200px;font-size:12px;line-height:1.5">
            <strong>Exposure cell</strong><br/>
            Mean payout days a year: <strong>${c.meanPaidDays.toFixed(1)}</strong><br/>
            Worst year: ${c.maxPaidDays} days<br/>
            Years with a payout: ${c.yearsWithPayout}<br/>
            <span style="color:#888">${c.lat.toFixed(3)}, ${c.lon.toFixed(3)}</span>
          </div>`
        )
        .addTo(map);
      cellLayersRef.current.push(layer);
    });
  }, [map, L, mode, portfolioCells]);

  // ---- Picked point marker ----
  useEffect(() => {
    if (!map || !L) return;

    if (pointMarkerRef.current) {
      map.removeLayer(pointMarkerRef.current);
      pointMarkerRef.current = null;
    }
    if (mode !== 'parametric' || !pickedPoint) return;

    pointMarkerRef.current = L.circleMarker([pickedPoint.lat, pickedPoint.lon], {
      radius: 9,
      color: '#111',
      weight: 2,
      fillColor: '#FF4500',
      fillOpacity: 0.9,
    })
      .bindPopup(
        `<div style="font-size:12px">Risk location<br/>${pickedPoint.lat.toFixed(4)}, ${pickedPoint.lon.toFixed(4)}</div>`
      )
      .addTo(map);
  }, [map, L, mode, pickedPoint]);

  // ---- Selection tool ----
  const startSelection = useCallback(() => {
    if (!map || !L) return;
    setIsSelecting(true);
    toast.info('Click and drag to draw an area. Press Esc to cancel.');

    let startPoint: any = null;
    let rect: any = null;

    const teardown = () => {
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyDown);
      map.dragging.enable();
      setIsSelecting(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (rect) map.removeLayer(rect);
      teardown();
      toast.info('Selection cancelled');
    };

    const onMouseDown = (e: any) => {
      startPoint = e.latlng;
      rect = L.rectangle([startPoint, startPoint], {
        color: '#3388ff',
        weight: 2,
        fillOpacity: 0.08,
      }).addTo(map);
    };

    const onMouseMove = (e: any) => {
      if (startPoint && rect) rect.setBounds([startPoint, e.latlng]);
    };

    const onMouseUp = () => {
      if (!rect) return;
      const lb = rect.getBounds();

      if (
        lb.getNorth() - lb.getSouth() < MIN_SPAN_DEG ||
        lb.getEast() - lb.getWest() < MIN_SPAN_DEG
      ) {
        map.removeLayer(rect);
        teardown();
        toast.warning('That area was too small. Drag a larger rectangle.');
        return;
      }

      if (rectangleRef.current) map.removeLayer(rectangleRef.current);
      rectangleRef.current = rect;
      setHasSelection(true);

      onAreaSelectedRef.current?.(
        {
          north: lb.getNorth(),
          south: lb.getSouth(),
          east: lb.getEast(),
          west: lb.getWest(),
        },
        lb
      );

      teardown();
    };

    map.dragging.disable();
    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
  }, [map, L]);

  const clearAll = useCallback(() => {
    if (!map) return;
    if (rectangleRef.current) {
      map.removeLayer(rectangleRef.current);
      rectangleRef.current = null;
    }
    setHasSelection(false);
  }, [map]);

  useEffect(() => {
    if (onControlsReady && map) {
      onControlsReady({ startSelection, clearAll, isSelecting, hasSelection });
    }
  }, [map, isSelecting, hasSelection, startSelection, clearAll]);

  return (
    <div className="relative size-full">
      <div ref={mapRef} className="size-full" />

      {mode === 'parametric' && !pickedPoint && !isLoading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1002] pointer-events-none">
          <div className="bg-white/95 px-4 py-2 rounded-lg shadow-lg border-2 border-gray-200 text-sm">
            Click anywhere on the map to price a location
          </div>
        </div>
      )}

      {isLoading && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1002]">
          <div className="bg-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 border-2 border-gray-200 text-sm">
            <Loader2 className="size-4 animate-spin text-primary" />
            {loadingLabel}
          </div>
        </div>
      )}

      <style>{`
        .leaflet-container { width: 100%; height: 100%; z-index: 0; }
        .custom-temperature-marker { background: none !important; border: none !important; }
        .leaflet-control-container { z-index: 400 !important; }
        .leaflet-pane { z-index: 400 !important; }
        .leaflet-top, .leaflet-bottom { z-index: 400 !important; }
      `}</style>
    </div>
  );
};
