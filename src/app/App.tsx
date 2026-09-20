import React, { useState, useEffect, useCallback, useRef } from 'react';
import { HeatMap, MapMode } from './components/HeatMap';
import { LocationSearch } from './components/LocationSearch';
import { PlannerPanel } from './components/PlannerPanel';
import { ParametricPanel } from './components/ParametricPanel';
import { PortfolioPanel } from './components/PortfolioPanel';
import { Dashboard } from './components/Dashboard';
import { Method } from './components/Method';
import { Tour, hasSeenTour, markTourSeen } from './components/Tour';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { Square, Trash2, HelpCircle, TrendingUp } from 'lucide-react';
import { TOOL_NAME, CREATOR } from './branding';
import {
  Bounds,
  LiveReading,
  BacktestResult,
  ProjectionResult,
  PortfolioResult,
  fetchLiveConditions,
  backtestTrigger,
  projectTrigger,
  backtestPortfolio,
} from './services/OpenMeteoService';
import {
  PolicyTerms,
  Pricing,
  DEFAULT_TERMS,
  price,
  repriceForProjection,
} from './services/PricingModel';

type View = 'map' | 'dashboard' | 'method';

// Seville: reliably hot, well covered by every model used here, so the worked
// example on first load actually shows something worth looking at.
const DEMO = {
  center: [37.3891, -5.9845] as [number, number],
  zoom: 12,
  name: 'Seville, Spain',
  bounds: { north: 37.42, south: 37.35, east: -5.94, west: -6.02 } as Bounds,
};

const BACKTEST_YEARS = 20;

export default function App() {
  const [view, setView] = useState<View>('map');
  const [mode, setMode] = useState<MapMode>('planner');

  const [mapCenter, setMapCenter] = useState<[number, number]>(DEMO.center);
  const [mapZoom, setMapZoom] = useState(DEMO.zoom);
  const [locationName, setLocationName] = useState(DEMO.name);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapControls, setMapControls] = useState<any>(null);

  const [liveReadings, setLiveReadings] = useState<LiveReading[]>([]);
  const [pickedPoint, setPickedPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [projection, setProjection] = useState<ProjectionResult | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioResult | null>(null);

  const [terms, setTerms] = useState<PolicyTerms>(DEFAULT_TERMS);
  const [currency, setCurrency] = useState('EUR');
  const [policiesPerCell, setPoliciesPerCell] = useState(250);

  const [loading, setLoading] = useState<string | null>(null);
  const [parametricError, setParametricError] = useState<string | null>(null);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);

  const [tourOpen, setTourOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const didDemo = useRef(false);

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

  const closeTour = useCallback(() => {
    setTourOpen(false);
    markTourSeen();
  }, []);

  // ---- Data loaders ----

  const loadLive = useCallback(async (bounds: Bounds) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading('Reading live conditions');
    try {
      const data = await fetchLiveConditions(bounds, abortRef.current.signal);
      setLiveReadings(data);
      if (data.length === 0) {
        toast.warning('No land readings in that area. Open water has no ground surface value.');
      } else {
        toast.success(`${data.length} live readings loaded`);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error(err);
      toast.error(err.message ?? 'Could not load live conditions');
    } finally {
      setLoading(null);
    }
  }, []);

  const loadBacktest = useCallback(
    async (lat: number, lon: number, t: PolicyTerms) => {
      setLoading('Backtesting the trigger');
      setParametricError(null);
      setProjection(null);
      try {
        const result = await backtestTrigger(
          lat,
          lon,
          t.thresholdC,
          t.capDaysPerYear,
          BACKTEST_YEARS
        );
        setBacktest(result);
      } catch (err: any) {
        console.error(err);
        setBacktest(null);
        setParametricError(err.message ?? 'Backtest failed for this location');
      } finally {
        setLoading(null);
      }
    },
    []
  );

  const loadProjection = useCallback(async () => {
    if (!pickedPoint) return;
    setLoading('Running climate projection');
    try {
      const result = await projectTrigger(pickedPoint.lat, pickedPoint.lon, terms.thresholdC);
      setProjection(result);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message ?? 'Projection failed for this location');
    } finally {
      setLoading(null);
    }
  }, [pickedPoint, terms.thresholdC]);

  const loadPortfolio = useCallback(
    async (bounds: Bounds, t: PolicyTerms) => {
      setLoading('Backtesting the region');
      setPortfolioError(null);
      try {
        const result = await backtestPortfolio(bounds, t.thresholdC, t.capDaysPerYear);
        setPortfolio(result);
        toast.success(`${result.cells.length} exposure cells analysed`);
      } catch (err: any) {
        console.error(err);
        setPortfolio(null);
        setPortfolioError(err.message ?? 'Regional backtest failed');
      } finally {
        setLoading(null);
      }
    },
    []
  );

  // ---- Worked example on first load ----
  useEffect(() => {
    if (!mapLoaded || didDemo.current) return;
    didDemo.current = true;
    loadLive(DEMO.bounds);
    setPickedPoint({ lat: DEMO.center[0], lon: DEMO.center[1] });
    loadBacktest(DEMO.center[0], DEMO.center[1], DEFAULT_TERMS);
  }, [mapLoaded, loadLive, loadBacktest]);

  // ---- Handlers ----

  const handleLocationSelect = (lat: number, lon: number, displayName: string) => {
    setMapCenter([lat, lon]);
    setMapZoom(12);
    setLocationName(displayName);
  };

  const handleAreaSelected = (bounds: Bounds) => {
    if (mode === 'planner') loadLive(bounds);
    if (mode === 'portfolio') loadPortfolio(bounds, terms);
  };

  const handlePointPicked = (lat: number, lon: number) => {
    setPickedPoint({ lat, lon });
    loadBacktest(lat, lon, terms);
  };

  // Re-run whatever the current tab depends on when the trigger changes
  const handleTermsChange = (next: PolicyTerms) => {
    const triggerChanged =
      next.thresholdC !== terms.thresholdC || next.capDaysPerYear !== terms.capDaysPerYear;
    setTerms(next);
    if (!triggerChanged) return;
    if (mode === 'parametric' && pickedPoint) loadBacktest(pickedPoint.lat, pickedPoint.lon, next);
  };

  const pricing: Pricing | null = backtest ? price(backtest, terms) : null;
  const projectedPricing =
    backtest && projection
      ? repriceForProjection(
          backtest,
          terms,
          projection.baselineDaysPerYear,
          projection.futureDaysPerYear
        )
      : null;

  const modeLabel: Record<MapMode, string> = {
    planner: 'Planner',
    parametric: 'Parametric',
    portfolio: 'Portfolio',
  };

  const selectionLabel =
    mode === 'portfolio' ? 'Draw region' : mode === 'planner' ? 'Draw area' : 'Draw area';

  return (
    <div className="app-shell">
      <Toaster position="top-center" />
      <Tour open={tourOpen} onClose={closeTour} />

      {/* Top bar */}
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
                  'linear-gradient(140deg, var(--heat-cool) 0%, var(--heat-mild) 45%, var(--heat-hot) 100%)',
              }}
            />
            <h1 className="truncate">{TOOL_NAME}</h1>
          </div>

          <div className="flex items-center gap-2">
            {view !== 'method' && (
              <div className="seg hidden sm:inline-flex">
                {(['planner', 'parametric', 'portfolio'] as MapMode[]).map(m => (
                  <button key={m} data-active={mode === m} onClick={() => setMode(m)}>
                    {modeLabel[m]}
                  </button>
                ))}
              </div>
            )}

            <div className="seg">
              {(['map', 'dashboard', 'method'] as View[]).map(v => (
                <button key={v} data-active={view === v} onClick={() => setView(v)}>
                  {v === 'map' ? 'Map' : v === 'dashboard' ? 'Data' : 'Method'}
                </button>
              ))}
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

        {/* Mode tabs drop below the bar on small screens */}
        {view !== 'method' && (
          <div className="sm:hidden px-3 pb-2">
            <div className="seg w-full" style={{ display: 'flex' }}>
              {(['planner', 'parametric', 'portfolio'] as MapMode[]).map(m => (
                <button
                  key={m}
                  data-active={mode === m}
                  onClick={() => setMode(m)}
                  style={{ flex: 1 }}
                >
                  {modeLabel[m]}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <main className="flex-1 min-h-0 relative">
          {view === 'method' ? (
            <Method />
          ) : view === 'dashboard' ? (
            <Dashboard
              locationName={locationName}
              readings={liveReadings}
              backtest={backtest}
              pricing={pricing}
              portfolio={portfolio}
              terms={terms}
              currency={currency}
              policiesPerCell={policiesPerCell}
            />
          ) : (
            <>
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-md px-3">
                <LocationSearch onLocationSelect={handleLocationSelect} />
              </div>

              {mapControls && mode !== 'parametric' && (
                <div className="absolute top-3 right-3 z-[1001] flex flex-col gap-2">
                  <button
                    onClick={mapControls.startSelection}
                    disabled={mapControls.isSelecting || !!loading}
                    className="text-xs font-medium px-3 py-2 rounded-md inline-flex items-center gap-2 shadow-lg disabled:opacity-60"
                    style={{ background: 'var(--ink)', color: '#fff', border: 0, cursor: 'pointer' }}
                  >
                    <Square className="size-3.5" />
                    {mapControls.isSelecting ? 'Drawing' : selectionLabel}
                  </button>

                  {mapControls.hasSelection && (
                    <button
                      onClick={() => {
                        mapControls.clearAll();
                        if (mode === 'planner') setLiveReadings([]);
                        if (mode === 'portfolio') setPortfolio(null);
                      }}
                      className="text-xs font-medium px-3 py-2 rounded-md inline-flex items-center gap-2 shadow-lg"
                      style={{ background: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--rule)', cursor: 'pointer' }}
                    >
                      <Trash2 className="size-3.5" />
                      Clear
                    </button>
                  )}
                </div>
              )}

              <HeatMap
                center={mapCenter}
                zoom={mapZoom}
                mode={mode}
                liveReadings={liveReadings}
                portfolioCells={portfolio?.cells ?? []}
                pickedPoint={pickedPoint}
                isLoading={!!loading}
                loadingLabel={loading ?? ''}
                onMapReady={() => setMapLoaded(true)}
                onAreaSelected={handleAreaSelected}
                onPointPicked={handlePointPicked}
                onControlsReady={setMapControls}
              />

              {!mapLoaded && (
                <div className="absolute inset-0 flex items-center justify-center z-[1001]" style={{ background: 'rgba(255,255,255,0.85)' }}>
                  <div className="text-center">
                    <div
                      className="size-8 rounded-full animate-spin mx-auto mb-3"
                      style={{ border: '3px solid var(--wash-deep)', borderTopColor: 'var(--ink)' }}
                    />
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      Loading map
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        {/* Right rail */}
        {view === 'map' && (
          <aside className="rail w-full lg:w-[340px] shrink-0 scroll-rail max-h-[46vh] lg:max-h-none p-3">
            {mode === 'planner' && <PlannerPanel readings={liveReadings} />}

            {mode === 'parametric' && (
              <>
                <ParametricPanel
                  terms={terms}
                  onTermsChange={handleTermsChange}
                  currency={currency}
                  onCurrencyChange={setCurrency}
                  backtest={backtest}
                  pricing={pricing}
                  projection={projection}
                  projectedPricing={projectedPricing}
                  isLoading={loading === 'Backtesting the trigger'}
                  error={parametricError}
                />
                {backtest && !projection && (
                  <button
                    onClick={loadProjection}
                    disabled={!!loading}
                    className="w-full mt-3 text-xs font-medium px-3 py-2 rounded-md inline-flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ background: 'var(--ink)', color: '#fff', border: 0, cursor: 'pointer' }}
                  >
                    <TrendingUp className="size-3.5" />
                    Reprice to 2050
                  </button>
                )}
              </>
            )}

            {mode === 'portfolio' && (
              <PortfolioPanel
                result={portfolio}
                terms={terms}
                currency={currency}
                policiesPerCell={policiesPerCell}
                onPoliciesPerCellChange={setPoliciesPerCell}
                isLoading={loading === 'Backtesting the region'}
                error={portfolioError}
              />
            )}

            <p className="text-xs mt-4 px-1" style={{ color: 'var(--muted)' }}>
              {TOOL_NAME} · Built by {CREATOR}
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}
