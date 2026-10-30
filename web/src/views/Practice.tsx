import { useCallback, useMemo, useState } from 'react';
import type { Settings } from '../lib/config';
import { LETTERS, LETTER_HINTS } from '../lib/letters';
import { useRecognizer } from '../lib/useRecognizer';
import { CameraBar, Stage } from '../components/Stage';
import { Meter } from '../components/Readout';

function shuffle<T>(items: T[]) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function Practice({ settings }: { settings: Settings }) {
  const [order, setOrder] = useState(() => shuffle(LETTERS));
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<Record<string, 'hit' | 'skip'>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const target = order[index] ?? null;

  const advance = useCallback(
    (result: 'hit' | 'skip') => {
      if (!target) return;
      setDone((d) => ({ ...d, [target]: result }));
      setIndex((i) => i + 1);
      if (result === 'hit') {
        setFlash(target);
        setTimeout(() => setFlash(null), 700);
      }
    },
    [target],
  );

  const onCommit = useCallback(
    (value: string) => {
      if (value === target) advance('hit');
    },
    [target, advance],
  );
  // Practice ignores word spacing; it only listens for the target letter.
  const practiceSettings = useMemo(() => ({ ...settings, autoSpace: false }), [settings]);
  const rec = useRecognizer(practiceSettings, onCommit);
  const { tick } = rec.frame;
  const hits = Object.values(done).filter((v) => v === 'hit').length;
  const holdingTarget = tick.pending === target;

  const restart = () => {
    setOrder(shuffle(LETTERS));
    setIndex(0);
    setDone({});
  };

  return (
    <div className="workspace workspace-practice">
      <div className="workspace-main">
        <Stage rec={rec} />
        <CameraBar rec={rec} />
        <canvas ref={rec.cropRef} width={160} height={160} hidden />
      </div>

      <aside className="readout" aria-label="Practice">
        {target ? (
          <div className="readout-letter">
            <h2 className="label">Sign this letter · {index + 1} of {order.length}</h2>
            <output className="big-letter" data-hit={flash ? '' : undefined}>{target}</output>
            <Meter value={holdingTarget ? tick.progress : 0} label="Hold progress" />
            <p className="hint">{LETTER_HINTS[target]}</p>
            <p className="readout-sub mono">
              {rec.status !== 'running'
                ? 'start the camera to begin'
                : tick.pending
                  ? holdingTarget
                    ? 'hold it…'
                    : `seeing ${tick.pending}`
                  : 'waiting for a steady sign'}
            </p>
            <div className="toolbar">
              <button className="button" onClick={() => advance('skip')}>Skip</button>
            </div>
          </div>
        ) : (
          <div className="readout-letter">
            <h2 className="label">Round complete</h2>
            <output className="big-letter">{hits}</output>
            <p className="readout-sub mono">of {order.length} letters signed</p>
            <div className="toolbar">
              <button className="button button-primary" onClick={restart}>Practise again</button>
            </div>
          </div>
        )}

        <div className="readout-block">
          <h2 className="label">Progress · {hits} signed</h2>
          <ul className="letter-grid">
            {LETTERS.map((l) => (
              <li key={l} data-state={done[l] ?? (l === target ? 'current' : undefined)}>{l}</li>
            ))}
          </ul>
          {index > 0 && target && (
            <button className="button button-quiet" onClick={restart}>Restart round</button>
          )}
        </div>
      </aside>
    </div>
  );
}
