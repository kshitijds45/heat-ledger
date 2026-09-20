import React, { useEffect, useState } from 'react';
import { X, ArrowRight, ArrowLeft } from 'lucide-react';
import { TOOL_NAME, TOOL_TAGLINE, CREATOR } from '../branding';

const STORAGE_KEY = 'heat-ledger-tour-seen-v1';

interface Step {
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: `What ${TOOL_NAME} does`,
    body:
      'Cities are heating faster than the countryside around them. This tool takes free, live climate data and does two things with it: works out which cooling interventions are actually feasible at a given spot, and prices an insurance contract against the heat itself. Everything on screen comes from a public API you can check yourself.',
  },
  {
    title: 'Planner: interventions that survive contact with the ground',
    body:
      'Most heat maps map temperature and stop. This one also reads soil moisture, solar load and wind, so it will not recommend planting trees on ground too dry to support them. Colour shows how urgent a cell is. The icon shows what can actually be built there, and the popup gives the reason and the constraint.',
  },
  {
    title: 'Parametric: turn the heat into a price',
    body:
      'Pick a location and set a trigger, for example any day above 32°C. The tool counts how often that trigger would have fired over the last two decades of reanalysis data, then builds a premium from it: expected payout, a margin for volatility, expenses. No claims process, no loss adjuster. The temperature either crossed the line or it did not.',
  },
  {
    title: 'Portfolio: where the risk piles up',
    body:
      'One policy is a product question. A thousand policies in the same heat basin is a solvency question. Draw a region and each cell is backtested separately, so you can see where exceedance concentrates and what the whole book would have cost in a bad year.',
  },
];

interface TourProps {
  open: boolean;
  onClose: () => void;
}

export const Tour: React.FC<TourProps> = ({ open, onClose }) => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && step < STEPS.length - 1) setStep(s => s + 1);
      if (e.key === 'ArrowLeft' && step > 0) setStep(s => s - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, step, onClose]);

  if (!open) return null;

  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center p-4"
      style={{ background: 'rgba(22, 32, 44, 0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-label={`${TOOL_NAME} walkthrough`}
    >
      <div
        className="panel w-full max-w-lg relative"
        style={{ boxShadow: '0 24px 60px rgba(22,32,44,0.3)' }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-md"
          style={{ color: 'var(--muted)' }}
          aria-label="Close walkthrough"
        >
          <X className="size-4" />
        </button>

        <div className="p-6">
          {isFirst && (
            <div className="mb-5 pb-4 hairline" style={{ borderTop: 0, borderBottom: '1px solid var(--rule)' }}>
              <h1 style={{ fontSize: 26, letterSpacing: '-0.02em' }}>{TOOL_NAME}</h1>
              <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--muted)' }}>
                {TOOL_TAGLINE}
              </p>
            </div>
          )}

          <h2 className="text-base mb-2">{current.title}</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
            {current.body}
          </p>

          <div className="flex items-center justify-between mt-6 pt-4" style={{ borderTop: '1px solid var(--rule)' }}>
            <div className="flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  aria-label={`Step ${i + 1}`}
                  className="rounded-full transition-all"
                  style={{
                    width: i === step ? 18 : 6,
                    height: 6,
                    background: i === step ? 'var(--ink)' : 'var(--wash-deep)',
                    border: 0,
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="text-xs px-3 py-1.5 rounded-md"
                style={{ color: 'var(--muted)', background: 'transparent', border: 0, cursor: 'pointer' }}
              >
                Skip
              </button>
              {!isFirst && (
                <button
                  onClick={() => setStep(s => s - 1)}
                  className="text-xs px-3 py-1.5 rounded-md inline-flex items-center gap-1"
                  style={{ border: '1px solid var(--rule)', background: 'var(--paper)', cursor: 'pointer' }}
                >
                  <ArrowLeft className="size-3" />
                  Back
                </button>
              )}
              <button
                onClick={() => (isLast ? onClose() : setStep(s => s + 1))}
                className="text-xs px-3.5 py-1.5 rounded-md inline-flex items-center gap-1.5 font-medium"
                style={{ background: 'var(--ink)', color: '#fff', border: 0, cursor: 'pointer' }}
              >
                {isLast ? 'Start exploring' : 'Next'}
                {!isLast && <ArrowRight className="size-3" />}
              </button>
            </div>
          </div>

          {isFirst && (
            <p className="text-xs mt-4" style={{ color: 'var(--muted)' }}>
              Built by {CREATOR}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export const hasSeenTour = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

export const markTourSeen = (): void => {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* private browsing, the tour simply shows again next time */
  }
};
