import { useEffect, useState } from 'react';
import type { Settings } from '../lib/config';
import { useRecognizer } from '../lib/useRecognizer';
import { CameraBar, Stage } from '../components/Stage';
import { Meter, TopScores } from '../components/Readout';
import { SettingsPanel } from '../components/SettingsPanel';

export function Translate({ settings, onSettings }: { settings: Settings; onSettings: (s: Settings) => void }) {
  const rec = useRecognizer(settings);
  const { frame } = rec;
  const { smoothed, tick } = frame;
  const [copied, setCopied] = useState(false);
  const live = rec.status === 'running';
  const letter = tick.pending ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, select, textarea, button, summary')) return;
      if (e.key === ' ') {
        e.preventDefault();
        rec.edit('space');
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        rec.edit('backspace');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rec.edit]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    await navigator.clipboard.writeText(frame.text.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  const speak = () => {
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(frame.text.toLowerCase()));
  };

  return (
    <div className="workspace">
      <div className="workspace-main">
        <Stage rec={rec} />
        <CameraBar rec={rec} />
        <section className="transcript" aria-label="Transcript">
          <div className="transcript-head">
            <h2 className="label">Transcript</h2>
            <div className="toolbar">
              <button className="button" onClick={() => rec.edit('space')} title="Space bar">Space</button>
              <button className="button" onClick={() => rec.edit('backspace')} title="Backspace">Delete</button>
              <button className="button" onClick={() => rec.edit('clear')} disabled={!frame.text}>Clear</button>
              <button className="button" onClick={copy} disabled={!frame.text.trim()}>{copied ? 'Copied' : 'Copy'}</button>
              {'speechSynthesis' in window && (
                <button className="button" onClick={speak} disabled={!frame.text.trim()}>Speak</button>
              )}
            </div>
          </div>
          <p className="transcript-text" aria-live="polite">
            {frame.text}
            <span className="caret" aria-hidden />
            {!frame.text && <span className="transcript-placeholder">Hold a letter until the bar fills. Lower your hand between words.</span>}
          </p>
        </section>
      </div>

      <aside className="readout" aria-label="Recognition">
        <div className="readout-letter">
          <h2 className="label">Letter</h2>
          <output className="big-letter" data-empty={!letter ? '' : undefined}>{letter ?? ''}</output>
          <Meter value={tick.progress} label="Hold progress" />
          <p className="readout-sub mono">
            {smoothed.ranked.length && smoothed.ranked[0].label !== 'nothing'
              ? `mean ${smoothed.ranked[0].score.toFixed(2)} · ${smoothed.votes}/${smoothed.frames} agree`
              : live ? 'waiting for a steady sign' : 'camera off'}
          </p>
        </div>

        <div className="readout-block">
          <h2 className="label">Window average</h2>
          <TopScores ranked={smoothed.ranked} highlight={smoothed.stable} />
        </div>

        <div className="readout-block readout-input">
          <canvas ref={rec.cropRef} width={160} height={160} className="model-input" />
          <p>
            <span className="label">Model input</span>
            <br />
            160 × 160 crop from the hand landmarks{frame.mirrored ? ', flipped to match the training images' : ''}.
            {frame.smoothed.raw && (
              <>
                <br />
                <span className="mono">
                  this frame: {frame.smoothed.raw.label} {frame.smoothed.raw.score.toFixed(2)}
                </span>
              </>
            )}
          </p>
        </div>

        <SettingsPanel settings={settings} onChange={onSettings} />
      </aside>
    </div>
  );
}
