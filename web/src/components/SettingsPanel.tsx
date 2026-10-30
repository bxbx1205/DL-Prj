import { DEFAULT_SETTINGS, type HandSetting, type Settings } from '../lib/config';

export function SettingsPanel({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    const next = { ...settings, [key]: value };
    next.required = Math.min(next.required, next.window);
    onChange(next);
  };
  return (
    <details className="settings">
      <summary>Recognition settings</summary>
      <div className="settings-grid">
        <Slider label="Score threshold" hint="Mean score needed to accept a letter" min={0.5} max={0.95} step={0.05}
          value={settings.threshold} format={(v) => v.toFixed(2)} onChange={(v) => set('threshold', v)} />
        <Slider label="Window" hint="Recent frames averaged" min={3} max={15} step={1}
          value={settings.window} format={(v) => `${v} frames`} onChange={(v) => set('window', v)} />
        <Slider label="Agreement" hint="Frames that must agree" min={1} max={settings.window} step={1}
          value={settings.required} format={(v) => `${v} of ${settings.window}`} onChange={(v) => set('required', v)} />
        <Slider label="Hold to type" hint="How long to hold a letter" min={200} max={1500} step={50}
          value={settings.holdMs} format={(v) => `${v} ms`} onChange={(v) => set('holdMs', v)} />
        <Slider label="Word gap" hint="Hand out of view this long adds a space" min={600} max={3000} step={100}
          value={settings.spaceAfterMs} format={(v) => `${(v / 1000).toFixed(1)} s`} onChange={(v) => set('spaceAfterMs', v)} />
        <fieldset className="segmented">
          <legend>Signing hand</legend>
          {(['auto', 'right', 'left'] as HandSetting[]).map((h) => (
            <label key={h}>
              <input type="radio" name="hand" checked={settings.hand === h} onChange={() => set('hand', h)} />
              <span>{h === 'auto' ? 'Detect' : h === 'right' ? 'Right' : 'Left'}</span>
            </label>
          ))}
        </fieldset>
        <label className="check">
          <input type="checkbox" checked={settings.autoSpace} onChange={(e) => set('autoSpace', e.target.checked)} />
          <span>Add a space when the hand leaves</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.showLandmarks} onChange={(e) => set('showLandmarks', e.target.checked)} />
          <span>Draw hand landmarks</span>
        </label>
      </div>
      <button className="button button-quiet" onClick={() => onChange({ ...DEFAULT_SETTINGS })}>
        Restore defaults
      </button>
    </details>
  );
}

function Slider(props: {
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="slider">
      <span className="slider-head">
        <span>{props.label}</span>
        <span className="mono">{props.format(props.value)}</span>
      </span>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))} />
      <span className="slider-hint">{props.hint}</span>
    </label>
  );
}
