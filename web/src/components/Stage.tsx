import type { CSSProperties, ReactNode } from 'react';
import type { useRecognizer } from '../lib/useRecognizer';
import { Meter } from './Readout';

type Recognizer = ReturnType<typeof useRecognizer>;

/** Mirrored camera preview with the landmark overlay and start / error states. */
export function Stage({ rec, children }: { rec: Recognizer; children?: ReactNode }) {
  const { status, error, frame } = rec;
  const message =
    status !== 'running'
      ? null
      : frame.hand === 'none'
        ? 'Show one hand to the camera'
        : frame.hand === 'far'
          ? 'Move your hand closer'
          : frame.smoothed.stable
            ? null
            : 'Hold the handshape steady';

  return (
    <section className="stage" data-status={status}>
      <div className="stage-frame" style={{ '--ar': rec.aspect } as CSSProperties}>
        <video ref={rec.videoRef} playsInline muted className="stage-video" />
        <canvas ref={rec.overlayRef} className="stage-overlay" />
        {status === 'running' && (
          <div className="stage-tags">
            <span>{frame.side ? `${frame.side} hand` : 'no hand'}</span>
            {frame.mirrored && <span>flipped for model</span>}
          </div>
        )}
        {status === 'running' && frame.tick.pending && (
          // Small screens stack the readout below the video, so repeat the letter here.
          <div className="stage-letter" aria-hidden>
            <span>{frame.tick.pending}</span>
            <Meter value={frame.tick.progress} label="Hold progress" />
          </div>
        )}
        {message && <p className="stage-message">{message}</p>}
        {status !== 'running' && (
          <div className="stage-idle">
            {status === 'loading' ? (
              <p className="stage-loading">
                <span className="spinner" aria-hidden /> Loading hand tracker and classifier…
              </p>
            ) : (
              <>
                {error && <p className="stage-error">{error}</p>}
                <button className="button button-primary" onClick={() => rec.start()}>
                  {error ? 'Try again' : 'Start camera'}
                </button>
                <p className="stage-fineprint">
                  About 20 MB downloads once, then everything runs locally. Plain background, even light, one hand.
                </p>
              </>
            )}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

export function CameraBar({ rec }: { rec: Recognizer }) {
  if (rec.status !== 'running') return null;
  return (
    <div className="camera-bar">
      {rec.cameras.length > 1 && (
        <label className="field-inline">
          <span>Camera</span>
          <select value={rec.cameraId} onChange={(e) => rec.start(e.target.value)}>
            {rec.cameras.map((c, i) => (
              <option key={c.deviceId} value={c.deviceId}>
                {c.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
      )}
      <span className="camera-stats mono">
        {rec.frame.fps.toFixed(0)} fps · hand {rec.frame.handMs.toFixed(0)} ms · model {rec.frame.modelMs.toFixed(0)} ms
        {rec.info && ` · ${rec.info.delegate === 'GPU' ? 'GPU tracker' : 'CPU tracker'} · ${rec.info.threads} thread${rec.info.threads > 1 ? 's' : ''}`}
      </span>
      <button className="button button-quiet" onClick={rec.stop}>
        Stop camera
      </button>
    </div>
  );
}
