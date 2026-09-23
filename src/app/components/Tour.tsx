import React, { useEffect, useState } from 'react';
import { X, ArrowRight, ArrowLeft } from 'lucide-react';
import { TOOL_NAME, TOOL_TAGLINE, CREATOR } from '../branding';

const STORAGE_KEY = 'bellweather-tour-seen-v1';

const STEPS = [
  {
    title: `What ${TOOL_NAME} does`,
    body:
      'It prices insurance that pays a fixed sum when a heatwave or a cold wave hits. No claim, no loss adjuster: the temperature either crossed the line or it did not. Because the payout is fixed by contract, the only real question is how often the trigger fires, and thirty five years of public weather data can answer that.',
  },
  {
    title: 'It runs as a sequence',
    body:
      'Start on the map and choose an area. Everything after that is one panel per stage: the product being sold, how often the trigger has fired, what it costs, how that changes by 2050, and what a whole book looks like. Use the numbered index at the top to jump between them, or return to the map at any point to price somewhere else.',
  },
  {
    title: 'Then defend the numbers',
    body:
      'Every assumption is yours to change, and the last panel sweeps any one of them across a range so you can show why a threshold or a target was chosen rather than simply asserting it. The Method page carries every source, formula and limitation behind the figures.',
  },
];


export const Tour: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setStep(s => Math.min(s + 1, STEPS.length - 1));
      if (e.key === 'ArrowLeft') setStep(s => Math.max(s - 1, 0));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const first = step === 0;
  const last = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center p-4"
      style={{ background: 'rgba(21, 23, 27, 0.55)', backdropFilter: 'blur(6px)' }}
      role="dialog"
      aria-modal="true"
      aria-label={`${TOOL_NAME} walkthrough`}
    >
      <div className="panel w-full max-w-lg relative" style={{ boxShadow: '0 30px 80px rgba(21,23,27,0.28)' }}>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-md"
          style={{ color: 'var(--muted)', background: 'transparent', border: 0, cursor: 'pointer' }}
          aria-label="Close walkthrough"
        >
          <X className="size-4" />
        </button>
        <div className="p-6">
          {first && (
            <div className="mb-5 pb-4" style={{ borderBottom: '1px solid var(--rule)' }}>
              <h1 style={{ fontFamily: 'var(--display)', fontWeight: 500, fontSize: 38, letterSpacing: '-0.02em', lineHeight: 1 }}>{TOOL_NAME}</h1>
              <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>{TOOL_TAGLINE}</p>
            </div>
          )}
          <h2 className="mb-2.5" style={{ fontFamily: 'var(--display)', fontWeight: 500, fontSize: 24, letterSpacing: '-0.015em' }}>{STEPS[step].title}</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{STEPS[step].body}</p>

          <div className="flex items-center justify-between mt-6 pt-4" style={{ borderTop: '1px solid var(--rule)' }}>
            <div className="flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  aria-label={`Step ${i + 1}`}
                  style={{
                    width: i === step ? 18 : 6,
                    height: 6,
                    borderRadius: 999,
                    background: i === step ? 'var(--heat-warm)' : 'var(--rule-strong)',
                    border: 0,
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="utility px-3 py-1.5" style={{ color: 'var(--muted)', background: 'transparent', border: 0, cursor: 'pointer' }}>
                Skip
              </button>
              {!first && (
                <button
                  onClick={() => setStep(s => s - 1)}
                  className="btn-ghost px-3 py-2 inline-flex items-center gap-1"
                  
                >
                  <ArrowLeft className="size-3" /> Back
                </button>
              )}
              <button
                onClick={() => (last ? onClose() : setStep(s => s + 1))}
                className="btn-solid px-4 py-2.5 inline-flex items-center gap-1.5"
                
              >
                {last ? 'Start' : 'Next'}
                {!last && <ArrowRight className="size-3" />}
              </button>
            </div>
          </div>
          {first && <p className="text-xs mt-4" style={{ color: 'var(--muted)' }}>Built by {CREATOR}</p>}
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
    /* private browsing: the tour shows again next visit */
  }
};
