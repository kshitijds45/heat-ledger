import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Square, HelpCircle, RotateCcw, ArrowDown } from 'lucide-react';
import { Toaster } from './components/ui/sonner';
import { AreaMap } from './components/AreaMap';
import { LocationSearch, SearchBounds } from './components/LocationSearch';
import {
  ProductSection,
  RiskSection,
  PriceSection,
  OutlookSection,
  PortfolioSection,
  Peril,
} from './components/Sections';
import { SimulatorSection } from './components/Simulator';
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
import { findCurrency } from './services/Currency';

const LONDON: { name: string; area: Bounds } = {
  name: 'Greater London',
  area: { north: 51.69, south: 51.29, east: 0.33, west: -0.51 },
};

const SECTIONS = [
  { id: 'area', index: '01', label: 'Area' },
  { id: 'product', index: '02', label: 'Product' },
  { id: 'hazard', index: '03', label: 'Hazard' },
  { id: 'price', index: '04', label: 'Price' },
  { id: 'outlook', index: '05', label: 'Outlook' },
  { id: 'portfolio', index: '06', label: 'Portfolio' },
  { id: 'sensitivity', index: '07', label: 'Sensitivity' },
];

const sameAssumptions = (a: Assumptions, b: Assumptions) =>
  (Object.keys(a) as Array<keyof Assumptions>).every(k => Math.abs(a[k] - b[k]) < 1e-9);

export default function App() {
  const [showMethod, setShowMethod] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  const [area, setArea] = useState<Bounds>(LONDON.area);
  const [locationName, setLocationName] = useState(LONDON.name);
  const [isCustomArea, setIsCustomArea] = useState(false);
  const [fitToken, setFitToken] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [draw, setDraw] = useState<{ start: () => void; drawing: boolean } | null>(null);

  const [assumptions, setAssumptions] = useState<Assumptions>(DEFAULTS);
  const [peril, setPeril] = useState<Peril>('both');
  const [currencyCode, setCurrencyCode] = useState('GBP');
  const currency = findCurrency(currencyCode);

  const [history, setHistory] = useState<DailySeries | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [models, setModels] = useState<ModelSeries | null>(null);
  const [projLoading, setProjLoading] = useState(false);
  const [projError, setProjError] = useState<string | null>(null);

  const [population, setPopulation] = useState<number | null>(null);
  const [popLoading, setPopLoading] = useState(false);
  const [popError, setPopError] = useState<string | null>(null);

  const [active, setActive] = useState('area');
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const index = centreOf(area);
  const startYear = HISTORY_START;
  const endYear = historyEnd();

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

  const policies =
    population !== null ? Math.max(1, Math.round(population * assumptions.adoption)) : null;
  const book = policies ?? assumptions.referencePolicies;

  const result = useMemo(
    () => (history ? analyse(history, assumptions, startYear, endYear, book) : null),
    [history, assumptions, startYear, endYear, book]
  );

  const projection = useMemo(
    () => (result && models ? project(result, models, assumptions, book) : null),
    [result, models, assumptions, book]
  );

  // Track which panel is in view, so the index reflects position
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || showMethod) return;
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((x, y) => y.intersectionRatio - x.intersectionRatio)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { root, threshold: [0.25, 0.5, 0.75] }
    );
    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [showMethod]);

  const goTo = useCallback((id: string) => {
    setShowMethod(false);
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const afterAreaChange = (b: Bounds, name: string, custom: boolean) => {
    setArea(b);
    setLocationName(name);
    setIsCustomArea(custom);
    setFitToken(t => t + 1);
    loadArea(b);
    // The map has done its job, so move the journey on to the analysis.
    setTimeout(() => goTo('product'), 350);
  };

  const handleSearch = (lat: number, lon: number, name: string, b: SearchBounds) =>
    afterAreaChange(b, name.split(',').slice(0, 2).join(','), false);

  const handleDrawn = (b: Bounds) => {
    const c = centreOf(b);
    afterAreaChange(b, `Custom area · ${c.lat.toFixed(2)}, ${c.lon.toFixed(2)}`, true);
    toast.success('Pricing the new area');
  };

  const clearArea = () => {
    afterAreaChange(LONDON.area, LONDON.name, false);
    toast.success('Area reset to Greater London');
  };

  return (
    <div className="app-shell">
      <Toaster position="top-center" theme="dark" />
      <Tour open={tourOpen} onClose={() => { setTourOpen(false); markTourSeen(); }} />

      <header className="topbar">
        <div className="topbar-row">
          <button onClick={() => goTo('area')} className="wordmark">
            <span
              aria-hidden
              style={{
                width: 16,
                height: 16,
                borderRadius: 1,
                background: 'linear-gradient(140deg, var(--heat-cool) 0%, var(--heat-mild) 50%, var(--heat-hot) 100%)',
              }}
            />
            <span className="wordmark-text">{TOOL_NAME}</span>
          </button>

          <div className="flex items-center gap-3 min-w-0">
            <span className="utility truncate hidden md:inline">{locationName}</span>
            <div className="seg">
              <button data-active={!showMethod} onClick={() => goTo('area')}>Analysis</button>
              <button data-active={showMethod} onClick={() => setShowMethod(true)}>Method</button>
            </div>
            <button onClick={() => setTourOpen(true)} aria-label="Open walkthrough" className="icon-btn">
              <HelpCircle className="size-3.5" />
            </button>
          </div>
        </div>
      </header>

      {!showMethod && (
        <nav className="rail-dots" aria-label="Sections">
          {SECTIONS.map(sec => (
            <button
              key={sec.id}
              className="rail-dot"
              data-active={active === sec.id}
              onClick={() => goTo(sec.id)}
              aria-label={`${sec.index} ${sec.label}`}
            >
              <span className="rail-label">{sec.index} {sec.label}</span>
              <span className="rail-mark" />
            </button>
          ))}
        </nav>
      )}

      {showMethod ? (
        <main className="flex-1 min-h-0">
          <Method />
        </main>
      ) : (
        <div ref={scrollRef} className="snap-scroll flex-1 min-h-0">
          {/* 01 Area */}
          <section id="area" className="snap-section">
            <div className="map-panel">
              <div className="absolute top-3 left-3 right-3 z-[1000] flex gap-2 items-start">
                <div className="flex-1 max-w-md">
                  <LocationSearch onLocationSelect={handleSearch} />
                </div>
                {draw && (
                  <>
                    <button
                      onClick={draw.start}
                      disabled={draw.drawing}
                      className="btn-solid px-3.5 h-9 inline-flex items-center gap-2 shrink-0"
                      
                    >
                      <Square className="size-3.5" />
                      <span className="hidden sm:inline">{draw.drawing ? 'Drawing' : 'Draw area'}</span>
                    </button>
                    {isCustomArea && (
                      <button
                        onClick={clearArea}
                        className="btn-ghost px-3.5 h-9 inline-flex items-center gap-2 shrink-0"
                        
                      >
                        <RotateCcw className="size-3.5" />
                        <span className="hidden sm:inline">Clear</span>
                      </button>
                    )}
                  </>
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
                <div className="absolute inset-0 flex items-center justify-center z-[700]" style={{ background: 'var(--void)' }}>
                  <div className="size-6 rounded-full animate-spin" style={{ border: '1px solid var(--rule)', borderTopColor: 'var(--heat-warm)' }} />
                </div>
              )}

              <div className="map-veil" />

              <div className="title-card">
                <p className="utility mb-3">01 / Area · {startYear} to {endYear} record</p>
                <h2 className="lede">Heat and cold, priced.</h2>
                <div className="flex items-end justify-between gap-6 mt-7 flex-wrap" style={{ pointerEvents: 'auto' }}>
                  <p className="text-sm max-w-md" style={{ color: 'var(--ink-soft)', lineHeight: 1.65 }}>
                    Parametric cover for heatwaves and cold waves, built from thirty five years of
                    public climate data. Search a city or draw an area to price it.
                  </p>
                  <button onClick={() => goTo('product')} className="btn-solid px-5 py-3 inline-flex items-center gap-2">
                    Price this area
                    <ArrowDown className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 02 Product */}
          <section id="product" className="snap-section">
            <ProductSection
              a={assumptions}
              onChange={setAssumptions}
              onReset={() => setAssumptions(DEFAULTS)}
              isDefault={sameAssumptions(assumptions, DEFAULTS)}
              peril={peril}
              onPerilChange={setPeril}
              currency={currency}
              onCurrencyChange={setCurrencyCode}
              book={book}
            />
          </section>

          {/* 03 Hazard */}
          <section id="hazard" className="snap-section">
            <RiskSection
              result={result}
              loading={historyLoading}
              error={historyError}
              peril={peril}
              startYear={startYear}
              endYear={endYear}
            />
          </section>

          {/* 04 Price */}
          <section id="price" className="snap-section">
            <PriceSection result={result} peril={peril} a={assumptions} currency={currency} />
          </section>

          {/* 05 Outlook */}
          <section id="outlook" className="snap-section">
            <OutlookSection
              result={result}
              projection={projection}
              loading={projLoading}
              error={projError}
              peril={peril}
              currency={currency}
            />
          </section>

          {/* 06 Portfolio */}
          <section id="portfolio" className="snap-section">
            <PortfolioSection
              result={result}
              peril={peril}
              a={assumptions}
              currency={currency}
              population={population}
              policies={policies}
              loading={popLoading}
              error={popError}
              onManualPopulation={n => { setPopulation(n); setPopError(null); }}
            />
          </section>

          {/* 07 Sensitivity */}
          <section id="sensitivity" className="snap-section">
            <SimulatorSection
              history={history}
              a={assumptions}
              peril={peril}
              currency={currency}
              population={population}
              startYear={startYear}
              endYear={endYear}
            />
            <footer className="mt-10 pt-5" style={{ borderTop: '1px solid var(--rule)' }}>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {TOOL_NAME} · Built by {CREATOR} · Index point {index.lat.toFixed(3)}, {index.lon.toFixed(3)}
              </p>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
