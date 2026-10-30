export interface ComposerOptions {
  holdMs: number;
  autoSpace: boolean;
  spaceAfterMs: number;
}

export interface ComposerTick {
  /** 0..1 progress of the current letter towards being typed. */
  progress: number;
  /** Letter being held, if any. */
  pending: string | null;
  /** Set on the tick where a letter or space is added. */
  committed: string | null;
}

/**
 * Turns a stream of stable letters into text.
 *
 * A letter is typed once it has been stable for holdMs. Holding it longer does
 * not repeat it: the stable letter must change or disappear first, so double
 * letters need a short release between them. With autoSpace, taking the hand
 * out of view for spaceAfterMs ends the word.
 */
export class Composer {
  text = '';
  private pending: string | null = null;
  private since = 0;
  private typed = false;
  private lastHandAt = -Infinity;

  constructor(public options: ComposerOptions) {}

  update(stable: string | null, handPresent: boolean, now: number): ComposerTick {
    let committed: string | null = null;
    if (handPresent) this.lastHandAt = now;

    if (stable !== this.pending) {
      this.pending = stable;
      this.since = now;
      this.typed = false;
    }
    if (this.pending && !this.typed && now - this.since >= this.options.holdMs) {
      this.text += this.pending;
      this.typed = true;
      committed = this.pending;
    }
    if (
      this.options.autoSpace &&
      !handPresent &&
      this.text.length > 0 &&
      !this.text.endsWith(' ') &&
      now - this.lastHandAt >= this.options.spaceAfterMs
    ) {
      this.text += ' ';
      committed = ' ';
    }
    const progress = !this.pending
      ? 0
      : this.typed
        ? 1
        : Math.min(1, (now - this.since) / this.options.holdMs);
    return { progress, pending: this.pending, committed };
  }

  space() {
    if (this.text && !this.text.endsWith(' ')) this.text += ' ';
  }

  backspace() {
    this.text = this.text.slice(0, -1);
  }

  clear() {
    this.text = '';
    this.pending = null;
    this.typed = false;
  }
}
