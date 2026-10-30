/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm';

type Request =
  | { type: 'init'; modelUrl: string; inputName: string; outputName: string; size: number }
  | { type: 'run'; id: number; data: Float32Array; batch: number };

let session: ort.InferenceSession | null = null;
let inputName = '';
let outputName = '';
let size = 0;

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<Request>) => {
  const msg = event.data;
  if (msg.type === 'init') {
    try {
      // Threads need cross-origin isolation (set by vite.config.ts and vercel.json).
      const threads = scope.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      ort.env.wasm.numThreads = threads;
      ({ inputName, outputName, size } = msg);
      session = await ort.InferenceSession.create(msg.modelUrl, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      const warm = performance.now();
      await run(new Float32Array(size * size * 3), 1);
      scope.postMessage({ type: 'ready', threads, warmupMs: performance.now() - warm });
    } catch (error) {
      scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  if (msg.type === 'run') {
    try {
      const started = performance.now();
      const scores = await run(msg.data, msg.batch);
      scope.postMessage({ type: 'result', id: msg.id, scores, ms: performance.now() - started }, [scores.buffer]);
    } catch (error) {
      scope.postMessage({ type: 'result', id: msg.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
};

async function run(data: Float32Array, batch: number) {
  if (!session) throw new Error('Model is not loaded');
  const input = new ort.Tensor('float32', data, [batch, size, size, 3]);
  const output = await session.run({ [inputName]: input });
  const scores = output[outputName].data as Float32Array;
  input.dispose();
  return new Float32Array(scores);
}
