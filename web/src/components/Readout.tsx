import type { Ranked } from '../lib/smoother';

export function TopScores({ ranked, count = 5, highlight }: { ranked: Ranked[]; count?: number; highlight?: string | null }) {
  const rows = ranked.length ? ranked.slice(0, count) : Array.from({ length: count }, () => null);
  return (
    <ol className="scores">
      {rows.map((r, i) => (
        <li key={r?.label ?? i} data-active={r && r.label === highlight ? '' : undefined}>
          <span className="scores-label">{r ? (r.label === 'nothing' ? '∅' : r.label) : '·'}</span>
          <span className="scores-track">
            <span className="scores-fill" style={{ width: `${(r?.score ?? 0) * 100}%` }} />
          </span>
          <span className="scores-value mono">{r ? r.score.toFixed(2) : '—'}</span>
        </li>
      ))}
    </ol>
  );
}

export function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div className="meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <span style={{ transform: `scaleX(${value})` }} />
    </div>
  );
}
