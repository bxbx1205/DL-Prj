import { useEffect, useState } from 'react';
import { ASSETS } from '../lib/config';

interface Metrics {
  test_accuracy: number;
  test_macro_f1: number;
  parameters: number;
  test_images: number;
  epochs_completed: number;
  selected_validation_accuracy: number;
}

interface Report {
  per_class: { label: string; baseline_f1: number; f1: number; precision: number; recall: number; support: number }[];
  baseline: { test_accuracy: number; test_macro_f1: number; parameters: number };
}

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

export function ModelInfo() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    fetch(ASSETS.metrics).then((r) => r.json()).then(setMetrics).catch(() => {});
    fetch(ASSETS.report).then((r) => r.json()).then(setReport).catch(() => {});
  }, []);

  return (
    <div className="page">
      <header className="page-head">
        <h1>How it works</h1>
        <p>
          A MobileNetV3Small classifier, fine-tuned from ImageNet weights on the ASL Alphabet dataset by Akash
          Nagaraj, reads a cropped image of one hand and scores 24 letters plus “nothing”. Everything below runs in
          your browser.
        </p>
      </header>

      <section className="figures">
        <Figure value={metrics ? pct(metrics.test_accuracy) : '…'} label="Test accuracy" note={report ? `baseline CNN ${pct(report.baseline.test_accuracy)}` : ''} />
        <Figure value={metrics ? metrics.test_macro_f1.toFixed(3) : '…'} label="Macro F1" note={report ? `baseline ${report.baseline.test_macro_f1.toFixed(3)}` : ''} />
        <Figure value={metrics ? metrics.test_images.toLocaleString() : '…'} label="Test images" note="held-out capture blocks" />
        <Figure value={metrics ? `${(metrics.parameters / 1e6).toFixed(2)} M` : '…'} label="Parameters" note="4.1 MB ONNX, float32" />
      </section>

      <section className="two-col">
        <div>
          <h2 className="section-title">Pipeline</h2>
          <ol className="pipeline">
            <li><b>Camera frame</b> Unmirrored video. The preview is mirrored only for display.</li>
            <li><b>Hand landmarks</b> MediaPipe Hand Landmarker finds 21 points per hand on the GPU, falling back to CPU.</li>
            <li><b>Square crop</b> Landmark box plus 20% margin, smoothed over time so it does not jitter. The training photos show a right hand as seen in a mirror, so the crop is flipped whenever needed to match.</li>
            <li><b>Classifier</b> 160 × 160 RGB in, 25 scores out. ONNX Runtime runs it in a Web Worker, so the camera loop never waits on it.</li>
            <li><b>Smoothing</b> Scores are averaged over the last 7 classifications. A letter is accepted when the average is at least 0.75 and 5 of 7 frames agree.</li>
            <li><b>Typing</b> Hold an accepted letter for 0.65 s to type it. Remove your hand to end a word.</li>
          </ol>
        </div>
        <div>
          <h2 className="section-title">Limits</h2>
          <ul className="plain-list">
            <li>The test split separates capture blocks, not people. Accuracy on new signers, lighting and backgrounds is likely to be lower than the figure above.</li>
            <li>Scores are softmax outputs, not calibrated probabilities. An unfamiliar gesture can still produce a confident letter.</li>
            <li>J and Z are signed with motion and are outside a single-image model’s scope.</li>
            <li>This is fingerspelling only. It does not translate ASL signs or sentences.</li>
          </ul>
          <h2 className="section-title">Privacy</h2>
          <p className="body-text">
            Frames are processed in memory on this device. Nothing is recorded or sent to a server; the site is
            static files.
          </p>
        </div>
      </section>

      {report && (
        <section>
          <h2 className="section-title">Per-letter F1 on the test set</h2>
          <p className="body-text legend">
            <span className="swatch swatch-base" /> Original CNN (96 × 96, trained from scratch)
            <span className="swatch swatch-new" /> MobileNetV3Small (this model)
          </p>
          <table className="class-table">
            <thead>
              <tr>
                <th scope="col">Class</th>
                <th scope="col" className="col-bar">F1</th>
                <th scope="col" className="num">Baseline</th>
                <th scope="col" className="num">Now</th>
                <th scope="col" className="num">Precision</th>
                <th scope="col" className="num">Recall</th>
                <th scope="col" className="num">Images</th>
              </tr>
            </thead>
            <tbody>
              {report.per_class.map((c) => (
                <tr key={c.label}>
                  <th scope="row">{c.label === 'nothing' ? 'nothing' : c.label}</th>
                  <td className="col-bar">
                    <span className="pair">
                      <span className="pair-base" style={{ width: `${c.baseline_f1 * 100}%` }} />
                      <span className="pair-new" style={{ width: `${c.f1 * 100}%` }} />
                    </span>
                  </td>
                  <td className="num mono">{c.baseline_f1.toFixed(3)}</td>
                  <td className="num mono">{c.f1.toFixed(3)}</td>
                  <td className="num mono">{c.precision.toFixed(3)}</td>
                  <td className="num mono">{c.recall.toFixed(3)}</td>
                  <td className="num mono">{c.support}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Figure({ value, label, note }: { value: string; label: string; note: string }) {
  return (
    <div className="figure">
      <span className="figure-value">{value}</span>
      <span className="figure-label">{label}</span>
      <span className="figure-note mono">{note}</span>
    </div>
  );
}
