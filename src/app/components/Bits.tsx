import React from 'react';

export const SectionHead: React.FC<{
  index: string;
  title: string;
  standfirst?: React.ReactNode;
  aside?: React.ReactNode;
}> = ({ index, title, standfirst, aside }) => (
  <header>
    <div className="flex items-start justify-between gap-6 flex-wrap">
      <div className="min-w-0">
        <p className="section-index"><span>{index}</span></p>
        <h2 className="section-title">{title}</h2>
      </div>
      {aside && <div className="shrink-0 pt-1">{aside}</div>}
    </div>
    {standfirst && <p className="section-standfirst">{standfirst}</p>}
  </header>
);

export const Figure: React.FC<{
  label: string;
  value: string;
  note?: string;
  accent?: string;
}> = ({ label, value, note, accent }) => (
  <div className="figure">
    <p className="figure-label">{label}</p>
    <p className="figure-value" style={accent ? { color: accent } : undefined}>
      {value}
    </p>
    {note && <p className="figure-note">{note}</p>}
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
  hint?: string;
}> = ({ label, value, onChange, step = 1, min, max, suffix, prefix, hint }) => (
  <label className="block">
    <span className="utility block mb-2" style={{ fontSize: 9, letterSpacing: '0.14em' }}>
      {label}
    </span>
    <div className="flex items-center gap-1">
      {prefix && (
        <span className="text-sm shrink-0" style={{ color: 'var(--muted)' }}>
          {prefix}
        </span>
      )}
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
        className="w-full text-sm px-2.5 py-2"
      />
      {suffix && (
        <span className="text-xs whitespace-nowrap shrink-0" style={{ color: 'var(--muted)' }}>
          {suffix}
        </span>
      )}
    </div>
    {hint && (
      <span className="text-xs block mt-1" style={{ color: 'var(--muted)' }}>
        {hint}
      </span>
    )}
  </label>
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
      {label && <p className="utility mb-3">{label}</p>}
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
  <p className="text-xs leading-relaxed mt-4" style={{ color: 'var(--muted)', maxWidth: '76ch' }}>
    {children}
  </p>
);

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="panel panel-pad">
    <p className="text-sm" style={{ color: 'var(--muted)' }}>
      {children}
    </p>
  </div>
);
