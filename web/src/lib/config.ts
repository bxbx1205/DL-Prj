const base = import.meta.env.BASE_URL;

export const ASSETS = {
  model: `${base}model/model.onnx`,
  labels: `${base}model/labels.json`,
  metrics: `${base}model/metrics.json`,
  report: `${base}model/report.json`,
  handTask: `${base}mediapipe/hand_landmarker.task`,
  mediapipeWasm: `${base}mediapipe/wasm`,
};

export interface ModelMeta {
  classes: string[];
  image_size: number;
  input_name: string;
  output_name: string;
  hand_crop_margin: number;
}

export type HandSetting = 'auto' | 'right' | 'left';

export interface Settings {
  /** Minimum mean softmax score over the window before a letter is shown. */
  threshold: number;
  /** Number of recent classifications that are averaged. */
  window: number;
  /** How many of those frames must individually agree with the winner. */
  required: number;
  /** How long a stable letter must be held before it is typed. */
  holdMs: number;
  /** Which hand signs. Crops are flipped when needed to match the training images' orientation. */
  hand: HandSetting;
  autoSpace: boolean;
  spaceAfterMs: number;
  showLandmarks: boolean;
}

// Threshold, window, and votes match model_results/inference_config.json.
export const DEFAULT_SETTINGS: Settings = {
  threshold: 0.75,
  window: 7,
  required: 5,
  holdMs: 650,
  hand: 'auto',
  autoSpace: true,
  spaceAfterMs: 1400,
  showLandmarks: true,
};

/** Hand crops smaller than this (in source pixels) are upscaled too much to classify reliably. */
export const MIN_CROP_PX = 72;

const SETTINGS_KEY = 'fingerspell.settings.v1';

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    const merged = { ...DEFAULT_SETTINGS, ...saved };
    merged.required = Math.min(merged.required, merged.window);
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
