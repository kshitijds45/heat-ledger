import React from 'react';

export const SectionHead: React.FC<{
  index: string;
  title: string;
  standfirst?: React.ReactNode;
  aside?: React.ReactNode;
}> = ({ index, title, standfirst, aside }) => (
  <header className="flex items-start justify-between gap-4 flex-wrap">
    <div className="min-w-0">
      <p className="section-index">{index}</p>
      <h2 className="section-title">{title}</h2>
      {standfirst && <p className="section-standfirst">{standfirst}</p>}
    </div>
    {aside && <div className="shrink-0">{aside}</div>}
  </header>
);

/** A compact readout. Values are sized to be scanned, not admired. */
export const Readout: React.FC<{
  items: Array<{ label: string; value: string; note?: string; accent?: string }>;
}> = ({ items }) => (
  <div className="readout">
    {items.map(i => (
      <div key={i.label}>
        <p className="readout-label" title={i.label}>{i.label}</p>
        <p className="readout-value" style={i.accent ? { color: i.accent } : undefined}>
          {i.value}
        </p>
        {i.note && <p className="readout-note">{i.note}</p>}
      </div>
    ))}
  </div>
);

export const NumberField: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  prefix?: string;
}> = ({ label, value, onChange, step = 1, min, max, suffix, prefix }) => (
  <label className="block">
    <span className="field-label">{label}</span>
    <div className="flex items-center gap-1.5">
      {prefix && <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>{prefix}</span>}
      <input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        step={step}
        min={min}
        max={max}
        onChange={e => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
      {suffix && <span className="text-xs shrink-0 whitespace-nowrap" style={{ color: 'var(--muted)' }}>{suffix}</span>}
    </div>
  </label>
);

/**
 * A slider with its value shown as a readout, which is the control an
 * underwriter reaches for when feeling out a threshold rather than
 * committing to one.
 */
export const SliderField: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  hint?: string;
}> = ({ label, value, onChange, min, max, step = 1, format, hint }) => (
  <div>
    <div className="flex items-baseline justify-between gap-3 mb-1.5">
      <span className="field-label" style={{ marginBottom: 0 }}>{label}</span>
      <span className="text-sm font-semibold shrink-0">{format ? format(value) : value}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
      aria-label={label}
    />
    <div className="flex justify-between mt-1">
      <span style={{ fontSize: 9.5, color: 'var(--muted)' }}>{format ? format(min) : min}</span>
      {hint && <span style={{ fontSize: 9.5, color: 'var(--muted)' }}>{hint}</span>}
      <span style={{ fontSize: 9.5, color: 'var(--muted)' }}>{format ? format(max) : max}</span>
    </div>
  </div>
);

export function Pills<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<[T, string]>;
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div>
      {label && <span className="field-label">{label}</span>}
      <div className="pill-select">
        {options.map(([key, text]) => (
          <button
            key={key}
            className="pill"
            data-active={value === key}
            aria-pressed={value === key}
            onClick={() => onChange(key)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-xs leading-relaxed mt-3" style={{ color: 'var(--muted)' }}>
    {children}
  </p>
);

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="panel panel-pad">
    <p className="text-xs" style={{ color: 'var(--muted)' }}>{children}</p>
  </div>
);

export const PanelBlock: React.FC<{ head: string; children: React.ReactNode; aside?: React.ReactNode }> = ({
  head,
  children,
  aside,
}) => (
  <div className="panel">
    <div className="panel-head flex items-center justify-between gap-3">
      <span>{head}</span>
      {aside}
    </div>
    <div className="p-3.5">{children}</div>
  </div>
);
