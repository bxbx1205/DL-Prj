export interface Ranked {
  label: string;
  score: number;
}

export interface SmoothedState {
  /** Letter that passed both the score and agreement tests, or null. */
  stable: string | null;
  /** Window-averaged scores, best first. */
  ranked: Ranked[];
  /** Latest single-frame prediction. */
  raw: Ranked | null;
  /** Frames in the window whose own prediction agrees with the leader above threshold. */
  votes: number;
  frames: number;
}

export interface SmootherOptions {
  window: number;
  required: number;
  threshold: number;
}

const EMPTY: SmoothedState = { stable: null, ranked: [], raw: null, votes: 0, frames: 0 };

/**
 * Temporal smoothing for per-frame softmax scores.
 *
 * The desktop app voted on hard labels. This keeps the same vote rule but also
 * averages the full score vectors, so a letter is only shown when it both wins
 * most frames and keeps a high mean score. A brief misread no longer resets the
 * vote, and a close second choice keeps the mean below threshold.
 */
export class ProbabilitySmoother {
  private history: Float32Array[] = [];
  private readonly nothing: number;

  constructor(private readonly classes: string[], public options: SmootherOptions) {
    if (options.required < 1 || options.required > options.window) {
      throw new Error('required must be between 1 and window');
    }
    this.nothing = classes.indexOf('nothing');
  }

  clear() {
    this.history = [];
  }

  update(scores: Float32Array | null): SmoothedState {
    if (!scores) {
      this.clear();
      return EMPTY;
    }
    const { window, required, threshold } = this.options;
    const latest = argmax(scores);
    const raw = { label: this.classes[latest], score: scores[latest] };
    // An explicit "nothing" frame drops stale letters immediately, as before.
    if (latest === this.nothing) {
      this.clear();
      return { ...EMPTY, raw, ranked: rank(this.classes, scores) };
    }
    this.history.push(scores);
    while (this.history.length > window) this.history.shift();

    const mean = new Float32Array(scores.length);
    for (const frame of this.history) {
      for (let i = 0; i < frame.length; i++) mean[i] += frame[i] / this.history.length;
    }
    const ranked = rank(this.classes, mean);
    const leader = this.classes.indexOf(ranked[0].label);
    let votes = 0;
    for (const frame of this.history) {
      if (argmax(frame) === leader && frame[leader] >= threshold) votes++;
    }
    const stable =
      leader !== this.nothing && votes >= required && mean[leader] >= threshold
        ? ranked[0].label
        : null;
    return { stable, ranked, raw, votes, frames: this.history.length };
  }
}

export function argmax(values: ArrayLike<number>) {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  return best;
}

export function rank(classes: string[], scores: ArrayLike<number>): Ranked[] {
  return classes
    .map((label, i) => ({ label, score: scores[i] }))
    .sort((a, b) => b.score - a.score);
}
