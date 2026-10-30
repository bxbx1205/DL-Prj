import { useState, type DragEvent } from 'react';
import { recognizeImage, type ImageResult } from '../lib/recognizeImage';
import { TopScores } from '../components/Readout';

export function Photo() {
  const [results, setResults] = useState<ImageResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const handle = async (files: FileList | null) => {
    const images = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'));
    if (!images.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of images) {
        const result = await recognizeImage(file);
        setResults((r) => [result, ...r]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handle(e.dataTransfer.files);
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Classify a photo</h1>
        <p>
          Test the model without a camera. The hand is located and cropped the same way as in live mode. If no hand is
          found, the whole image is resized as the training images were.
        </p>
      </header>

      <label
        className="dropzone"
        data-dragging={dragging ? '' : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input type="file" accept="image/*" multiple onChange={(e) => handle(e.target.files)} />
        <span className="dropzone-title">{busy ? 'Classifying…' : 'Drop images here or choose files'}</span>
        <span className="dropzone-sub">JPEG, PNG or WebP. Files stay in this browser.</span>
      </label>
      {error && <p className="error-line">{error}</p>}

      {results.length > 0 && (
        <div className="results">
          <div className="results-head">
            <h2 className="label">{results.length} result{results.length > 1 ? 's' : ''}</h2>
            <button className="button button-quiet" onClick={() => setResults([])}>Clear</button>
          </div>
          {results.map((r) => (
            <article className="result" key={r.url}>
              <figure className="result-source">
                <div className="result-image">
                  <img src={r.url} alt={r.name} />
                  {r.box && (
                    <svg viewBox={`0 0 ${r.width} ${r.height}`} preserveAspectRatio="none">
                      <rect x={r.box.cx - r.box.side / 2} y={r.box.cy - r.box.side / 2} width={r.box.side} height={r.box.side} />
                    </svg>
                  )}
                </div>
                <figcaption className="mono">{r.name}</figcaption>
              </figure>
              <figure className="result-input">
                <img src={r.input} alt="Model input" width={160} height={160} />
                <figcaption>
                  {r.box ? `Hand crop${r.mirrored ? ', flipped' : ''}` : 'No hand found: full image'}
                </figcaption>
              </figure>
              <div className="result-scores">
                <p className="result-letter">
                  <span className="big-letter big-letter-sm">{r.ranked[0].label === 'nothing' ? '∅' : r.ranked[0].label}</span>
                  <span className="mono">{r.ranked[0].score.toFixed(3)} · {r.ms.toFixed(0)} ms</span>
                </p>
                <TopScores ranked={r.ranked} count={3} highlight={r.ranked[0].label} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
