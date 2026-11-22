import { CREDENCE_BANDS, bandFromPercent, type Credence, type CredenceBand } from '../types';

interface CredencePickerProps {
  value: Credence;
  onChange: (next: Credence) => void;
}

export function CredencePicker({ value, onChange }: CredencePickerProps) {
  const isNumeric = value.mode === 'numeric';
  const rationaleLen = (value.numeric_rationale ?? '').trim().length;

  function setBand(band: CredenceBand) {
    onChange({
      mode: 'qualitative',
      band,
      percent: null,
      percent_range: null,
      numeric_rationale: null,
    });
  }

  function toggleNumeric() {
    if (isNumeric) {
      onChange({
        mode: 'qualitative',
        band: value.band,
        percent: null,
        percent_range: null,
        numeric_rationale: null,
      });
    } else {
      const defaultPct = CREDENCE_BANDS.find((b) => b.key === value.band)?.midpoint ?? 50;
      onChange({
        mode: 'numeric',
        band: bandFromPercent(defaultPct),
        percent: defaultPct,
        percent_range: null,
        numeric_rationale: value.numeric_rationale ?? '',
      });
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--ink-primary)]">Your Credence</span>
        <button
          type="button"
          onClick={toggleNumeric}
          className="text-xs font-medium text-[var(--actor-a-border)] hover:underline"
        >
          {isNumeric ? 'Switch to qualitative bands' : 'Use exact % (requires rationale)'}
        </button>
      </div>

      {!isNumeric ? (
        <div className="grid grid-cols-5 gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-1">
          {CREDENCE_BANDS.map((b) => {
            const active = value.band === b.key;
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => setBand(b.key)}
                className={`rounded-lg px-2 py-1.5 text-[11px] font-medium transition ${
                  active
                    ? 'bg-[var(--ink-primary)] text-white shadow-xs'
                    : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--ink-primary)]'
                }`}
              >
                {b.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              value={value.percent ?? 50}
              onChange={(e) => {
                const p = Number(e.target.value);
                onChange({
                  ...value,
                  mode: 'numeric',
                  percent: p,
                  band: bandFromPercent(p),
                });
              }}
              className="h-1.5 flex-1 accent-[var(--ink-primary)]"
            />
            <div className="flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 font-mono-meta text-xs font-semibold">
              <input
                type="number"
                min={0}
                max={100}
                value={value.percent ?? 50}
                onChange={(e) => {
                  const p = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                  onChange({
                    ...value,
                    mode: 'numeric',
                    percent: p,
                    band: bandFromPercent(p),
                  });
                }}
                className="w-10 bg-transparent text-right focus:outline-none"
              />
              <span>%</span>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="font-medium text-[var(--ink-primary)]">
                Required justification for exact %
              </span>
              <span className={`font-mono-meta ${rationaleLen >= 10 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {rationaleLen}/10+ chars
              </span>
            </div>
            <textarea
              rows={2}
              value={value.numeric_rationale ?? ''}
              onChange={(e) =>
                onChange({
                  ...value,
                  numeric_rationale: e.target.value,
                })
              }
              placeholder="e.g. Base rate from sleeper-agent probe generalization gaps; weighted up for faster tooling."
              className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:border-[var(--ink-primary)] focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
