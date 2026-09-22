import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Square, HelpCircle } from 'lucide-react';
import { Toaster } from './components/ui/sonner';
import { AreaMap } from './components/AreaMap';
import { LocationSearch, SearchBounds } from './components/LocationSearch';
import { ResultsPanel } from './components/ResultsPanel';
import { Method } from './components/Method';
import { Tour, hasSeenTour, markTourSeen } from './components/Tour';
import { TOOL_NAME, CREATOR } from './branding';
import {
  Bounds,
  DailySeries,
  ModelSeries,
  centreOf,
  fetchHistory,
  fetchProjection,
  fetchPopulation,
  HISTORY_START,
  historyEnd,
} from './services/ClimateData';
import { Assumptions, DEFAULTS, analyse, project } from './services/RiskModel';

type View = 'price' | 'method';

// Greater London, roughly within the M25
const LONDON: { name: string; area: Bounds } = {
  name: 'Greater London',
  area: { north: 51.69, south: 51.29, east: 0.33, west: -0.51 },
};

const sameAssumptions = (a: Assumptions, b: Assumptions) =>
  (Object.keys(a) as Array<keyof Assumptions>).every(k => Math.abs(a[k] - b[k]) < 1e-9);

export default function App() {
  const [view, setView] = useState<View>('price');
  const [tourOpen, setTourOpen] = useState(false);

  const [area, setArea] = useState<Bounds>(LONDON.area);
  const [locationName, setLocationName] = useState(LONDON.name);
  const [fitToken, setFitToken] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [draw, setDraw] = useState<{ start: () => void; drawing: boolean } | null>(null);

  const [assumptions, setAssumptions] = useState<Assumptions>(DEFAULTS);

  const [history, setHistory] = useState<DailySeries | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [models, setModels] = useState<ModelSeries | null>(null);
  const [projLoading, setProjLoading] = useState(false);
  const [projError, setProjError] = useState<string | null>(null);

  const [population, setPopulation] = useState<number | null>(null);
  const [popLoading, setPopLoading] = useState(false);
  const [popError, setPopError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const index = centreOf(area);
  const startYear = HISTORY_START;
  const endYear = historyEnd();

  // Leaflet stylesheet
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  useEffect(() => {
    if (!hasSeenTour()) setTourOpen(true);
  }, []);

  // One area drives three independent requests. The history comes first
  // because the price depends on it. Projection and population follow and
  // fill in as they arrive, so the page is usable as soon as the price is.
  const loadArea = useCallback(async (b: Bounds) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const c = centreOf(b);

    setHistory(null);
    setModels(null);
    setPopulation(null);
    setHistoryError(null);
    setProjError(null);
    setPopError(null);
    setHistoryLoading(true);
    setProjLoading(true);
    setPopLoading(true);

    fetchHistory(c.lat, c.lon, ctrl.signal)
      .then(h => !ctrl.signal.aborted && setHistory(h))
      .catch(e => {
        if (e?.name === 'AbortError') return;
        console.error(e);
        setHistoryError(`Could not load the temperature record. ${e.message ?? ''}`.trim());
      })
      .finally(() => !ctrl.signal.aborted && setHistoryLoading(false));

    fetchProjection(c.lat, c.lon, ctrl.signal)
      .then(m => !ctrl.signal.aborted && setModels(m))
      .catch(e => {
        if (e?.name === 'AbortError') return;
        console.error(e);
        setProjError(e.message ?? 'Projection unavailable');
      })
      .finally(() => !ctrl.signal.aborted && setProjLoading(false));

    fetchPopulation(b, ctrl.signal)
      .then(p => !ctrl.signal.aborted && setPopulation(p))
      .catch(e => {
        if (e?.name === 'AbortError') return;
        console.error(e);
        setPopError(e.message ?? 'Population unavailable');
      })
      .finally(() => !ctrl.signal.aborted && setPopLoading(false));
  }, []);

  useEffect(() => {
    loadArea(LONDON.area);
    return () => abortRef.current?.abort();
  }, [loadArea]);

  // Everything below recalculates instantly when an assumption changes,
  // from the stored daily record. No new request is made.
  const result = useMemo(
    () => (history ? analyse(history, assumptions, startYear, endYear) : null),
    [history, assumptions, startYear, endYear]
  );

  const projection = useMemo(
    () => (result && models ? project(result, models, assumptions) : null),
    [result, models, assumptions]
  );

  const handleSearch = (lat: number, lon: number, name: string, b: SearchBounds) => {
    setArea(b);
    setLocationName(name.split(',').slice(0, 2).join(','));
    setFitToken(t => t + 1);
    loadArea(b);
  };

  const handleDrawn = (b: Bounds) => {
    setArea(b);
    const c = centreOf(b);
    setLocationName(`Custom area around ${c.lat.toFixed(2)}, ${c.lon.toFixed(2)}`);
    loadArea(b);
    toast.success('Pricing the new area');
  };

  const closeTour = () => {
    setTourOpen(false);
    markTourSeen();
  };

  return (
    <div className="app-shell">
      <Toaster position="top-center" />
      <Tour open={tourOpen} onClose={closeTour} />

      <header className="topbar shrink-0">
        <div className="px-3 md:px-5 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              aria-hidden
              className="shrink-0 rounded-md"
              style={{
                width: 22,
                height: 22,
                background:
                  'linear-gradient(140deg, var(--heat-cool) 0%, var(--heat-mild) 50%, var(--heat-hot) 100%)',
              }}
            />
            <h1 className="truncate">{TOOL_NAME}</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="seg">
              <button data-active={view === 'price'} onClick={() => setView('price')}>Pricing</button>
              <button data-active={view === 'method'} onClick={() => setView('method')}>Method</button>
            </div>
            <button
              onClick={() => setTourOpen(true)}
              aria-label="Open walkthrough"
              className="p-1.5 rounded-md"
              style={{ color: 'rgba(255,255,255,0.7)', background: 'transparent', border: 0, cursor: 'pointer' }}
            >
              <HelpCircle className="size-4" />
            </button>
          </div>
        </div>
      </header>

      {view === 'method' ? (
        <main className="flex-1 min-h-0">
          <Method />
        </main>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <main className="relative h-[42vh] lg:h-auto lg:flex-1 shrink-0 lg:shrink">
            <div className="absolute top-3 left-3 right-3 z-[1000] flex gap-2 items-start">
              <div className="flex-1 max-w-md">
                <LocationSearch onLocationSelect={handleSearch} />
              </div>
              {draw && (
                <button
                  onClick={draw.start}
                  disabled={draw.drawing}
                  className="text-xs font-medium px-3 h-9 rounded-md inline-flex items-center gap-2 shadow-lg disabled:opacity-60 shrink-0"
                  style={{ background: 'var(--ink)', color: '#fff', border: 0, cursor: 'pointer' }}
                >
                  <Square className="size-3.5" />
                  <span className="hidden sm:inline">{draw.drawing ? 'Drawing' : 'Draw area'}</span>
                </button>
              )}
            </div>

            <AreaMap
              area={area}
              fitToken={fitToken}
              onAreaDrawn={handleDrawn}
              onReady={() => setMapReady(true)}
              onDrawControl={(start, drawing) => setDraw({ start, drawing })}
            />

            {!mapReady && (
              <div className="absolute inset-0 flex items-center justify-center z-[1001]" style={{ background: 'rgba(255,255,255,0.85)' }}>
                <div className="size-7 rounded-full animate-spin" style={{ border: '3px solid var(--wash-deep)', borderTopColor: 'var(--ink)' }} />
              </div>
            )}
          </main>

          <aside className="rail flex-1 lg:flex-none lg:w-[400px] min-h-0 scroll-rail p-3">
            <ResultsPanel
              locationName={locationName}
              indexPoint={index}
              startYear={startYear}
              endYear={endYear}
              loading={historyLoading}
              error={historyError}
              result={result}
              projection={projection}
              projectionLoading={projLoading}
              projectionError={projError}
              assumptions={assumptions}
              onAssumptionsChange={setAssumptions}
              onReset={() => setAssumptions(DEFAULTS)}
              isDefault={sameAssumptions(assumptions, DEFAULTS)}
              population={population}
              populationLoading={popLoading}
              populationError={popError}
              onManualPopulation={n => {
                setPopulation(n);
                setPopError(null);
              }}
            />
            <p className="text-xs mt-4 px-1" style={{ color: 'var(--muted)' }}>
              {TOOL_NAME} · Built by {CREATOR}
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
