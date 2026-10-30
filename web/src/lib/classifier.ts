import { ASSETS, type ModelMeta } from './config';

interface Pending {
  resolve: (value: { scores: Float32Array; ms: number }) => void;
  reject: (reason: Error) => void;
}

/** Runs the ONNX letter classifier in a Web Worker so the camera loop never blocks on it. */
export class Classifier {
  readonly meta: ModelMeta;
  threads = 1;
  private worker: Worker;
  private pending = new Map<number, Pending>();
  private nextId = 0;

  private constructor(meta: ModelMeta, worker: Worker) {
    this.meta = meta;
    this.worker = worker;
  }

  static async load(): Promise<Classifier> {
    const response = await fetch(ASSETS.labels);
    if (!response.ok) throw new Error(`Could not load model labels (${response.status})`);
    const meta = (await response.json()) as ModelMeta;
    const worker = new Worker(new URL('./classifier.worker.ts', import.meta.url), { type: 'module' });
    const classifier = new Classifier(meta, worker);
    await new Promise<void>((resolve, reject) => {
      worker.onmessage = (event) => {
        const msg = event.data;
        if (msg.type === 'ready') {
          classifier.threads = msg.threads;
          worker.onmessage = (e) => classifier.handle(e.data);
          resolve();
        } else if (msg.type === 'error') {
          reject(new Error(msg.message));
        }
      };
      worker.onerror = (event) => reject(new Error(event.message || 'Classifier worker failed to start'));
      worker.postMessage({
        type: 'init',
        modelUrl: new URL(ASSETS.model, location.href).href,
        inputName: meta.input_name,
        outputName: meta.output_name,
        size: meta.image_size,
      });
    });
    return classifier;
  }

  get busy() {
    return this.pending.size > 0;
  }

  /** `data` is NHWC float32 RGB in [0, 255] for `batch` images. Returns concatenated scores. */
  classify(data: Float32Array, batch = 1) {
    const id = this.nextId++;
    return new Promise<{ scores: Float32Array; ms: number }>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: 'run', id, data, batch }, [data.buffer]);
    });
  }

  private handle(msg: { type: string; id: number; scores?: Float32Array; ms?: number; error?: string }) {
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    if (msg.error || !msg.scores) pending.reject(new Error(msg.error ?? 'No scores returned'));
    else pending.resolve({ scores: msg.scores, ms: msg.ms ?? 0 });
  }
}
