export interface Point {
  x: number;
  y: number;
}

/** Square crop in source pixels. */
export interface Box {
  cx: number;
  cy: number;
  side: number;
}

/**
 * Square box around the landmarks with a margin on each side, matching
 * hand_crop() in webcam.py. Landmarks are normalised to [0, 1].
 */
export function boxFromLandmarks(landmarks: Point[], width: number, height: number, margin: number): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of landmarks) {
    const x = p.x * width, y = p.y * height;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const side = Math.max(2, Math.floor(Math.max(x1 - x0, y1 - y0) * (1 + 2 * margin)));
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, side };
}

export type Drawable = CanvasImageSource & { width?: number; height?: number };

/**
 * Draws the box from `source` into the square `ctx` canvas. Areas outside the
 * frame stay black, as in training's resize_with_pad. With `mirror`, the crop is
 * flipped so a left hand looks like the right hand the model was trained on.
 */
export function drawCrop(
  ctx: CanvasRenderingContext2D,
  source: Drawable,
  sourceWidth: number,
  sourceHeight: number,
  box: Box,
  mirror: boolean,
) {
  const size = ctx.canvas.width;
  const left = Math.trunc(box.cx - box.side / 2);
  const top = Math.trunc(box.cy - box.side / 2);
  const sx0 = Math.max(0, left), sy0 = Math.max(0, top);
  const sx1 = Math.min(sourceWidth, left + box.side), sy1 = Math.min(sourceHeight, top + box.side);
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  if (sx1 > sx0 && sy1 > sy0) {
    const scale = size / box.side;
    if (mirror) {
      ctx.translate(size, 0);
      ctx.scale(-1, 1);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      source,
      sx0, sy0, sx1 - sx0, sy1 - sy0,
      (sx0 - left) * scale, (sy0 - top) * scale, (sx1 - sx0) * scale, (sy1 - sy0) * scale,
    );
  }
  ctx.restore();
}

/** Aspect-preserving resize with black padding: the training preprocessing for whole images. */
export function drawLetterboxed(ctx: CanvasRenderingContext2D, source: Drawable, width: number, height: number) {
  const size = ctx.canvas.width;
  const scale = size / Math.max(width, height);
  const w = width * scale, h = height * scale;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, (size - w) / 2, (size - h) / 2, w, h);
}

/** RGBA canvas pixels -> NHWC float32 RGB in [0, 255]. The model rescales internally. */
export function canvasToTensor(ctx: CanvasRenderingContext2D, out?: Float32Array, offset = 0) {
  const size = ctx.canvas.width;
  const { data } = ctx.getImageData(0, 0, size, size);
  const tensor = out ?? new Float32Array(size * size * 3);
  for (let i = 0, j = offset; i < data.length; i += 4, j += 3) {
    tensor[j] = data[i];
    tensor[j + 1] = data[i + 1];
    tensor[j + 2] = data[i + 2];
  }
  return tensor;
}

/**
 * One Euro filter (Casiez et al. 2012) applied to the crop box. It removes
 * landmark jitter when the hand is still but follows quick movements, so the
 * classifier sees a steadier crop without lagging behind.
 */
export class BoxFilter {
  private filters = [new OneEuro(), new OneEuro(), new OneEuro()];

  reset() {
    this.filters.forEach((f) => f.reset());
  }

  apply(box: Box, scale: number, timeMs: number): Box {
    const [cx, cy, side] = [box.cx, box.cy, box.side].map((v, i) => this.filters[i].apply(v / scale, timeMs) * scale);
    return { cx, cy, side: Math.max(2, Math.round(side)) };
  }
}

class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t = 0;

  constructor(private minCutoff = 1.2, private beta = 6, private dCutoff = 1) {}

  reset() {
    this.x = null;
  }

  apply(value: number, timeMs: number) {
    if (this.x === null) {
      this.x = value;
      this.t = timeMs;
      return value;
    }
    const dt = Math.max(1e-3, (timeMs - this.t) / 1000);
    this.t = timeMs;
    const dxRaw = (value - this.x) / dt;
    this.dx += alpha(this.dCutoff, dt) * (dxRaw - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}

function alpha(cutoff: number, dt: number) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}
