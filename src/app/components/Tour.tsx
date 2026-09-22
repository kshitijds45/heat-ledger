import React, { useEffect, useState } from 'react';
import { X, ArrowRight, ArrowLeft } from 'lucide-react';
import { TOOL_NAME, TOOL_TAGLINE, CREATOR } from '../branding';

const STORAGE_KEY = 'bellweather-tour-seen-v1';

const STEPS = [
  {
    title: `What ${TOOL_NAME} does`,
    body:
      'It prices insurance that pays a fixed sum when a heatwave or a cold wave hits. No claim and no loss adjuster: the temperature either crossed the line or it did not. Because the payout is fixed, the only question is how often the trigger fires, and that can be answered from thirty five years of public weather data.',
  },
  {
    title: 'Pick an area, get a price',
    body:
      'London is loaded already. Search another city or draw your own area and everything recalculates: how often each trigger fires in today’s climate, the premium that hits an 85% combined ratio, the 1-in-200 year payout and whether the margin pays for the capital the risk ties up.',
  },
  {
    title: 'Change the product',
    body:
      'Open Assumptions to change the triggers, the payout, the pricing target or the share of the population that buys cover. Every figure updates instantly. The Method page shows every source, formula and limitation behind the numbers.',
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
      style={{ background: 'rgba(22, 32, 44, 0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-label={`${TOOL_NAME} walkthrough`}
    >
      <div className="panel w-full max-w-lg relative" style={{ boxShadow: '0 24px 60px rgba(22,32,44,0.3)' }}>
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
              <h1 style={{ fontSize: 26, letterSpacing: '-0.02em' }}>{TOOL_NAME}</h1>
              <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>{TOOL_TAGLINE}</p>
            </div>
          )}
          <h2 className="text-base mb-2">{STEPS[step].title}</h2>
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
                    background: i === step ? 'var(--ink)' : 'var(--wash-deep)',
                    border: 0,
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="text-xs px-3 py-1.5" style={{ color: 'var(--muted)', background: 'transparent', border: 0, cursor: 'pointer' }}>
                Skip
              </button>
              {!first && (
                <button
                  onClick={() => setStep(s => s - 1)}
                  className="text-xs px-3 py-1.5 rounded-md inline-flex items-center gap-1"
                  style={{ border: '1px solid var(--rule)', background: 'var(--paper)', cursor: 'pointer' }}
                >
                  <ArrowLeft className="size-3" /> Back
                </button>
              )}
              <button
                onClick={() => (last ? onClose() : setStep(s => s + 1))}
                className="text-xs px-3.5 py-1.5 rounded-md inline-flex items-center gap-1.5 font-medium"
                style={{ background: 'var(--ink)', color: '#fff', border: 0, cursor: 'pointer' }}
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
