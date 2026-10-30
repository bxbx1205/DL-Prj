import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { Classifier } from './classifier';
import { createHandLandmarker, type RunningMode } from './handTracker';

export interface Engine {
  classifier: Classifier;
  landmarker: HandLandmarker;
  delegate: 'GPU' | 'CPU';
}

const cache = new Map<RunningMode, Promise<Engine>>();
let classifier: Promise<Classifier> | null = null;

/**
 * Loads the classifier once and one hand landmarker per running mode. Video
 * and still-image detection need separate MediaPipe instances.
 */
export function loadEngine(mode: RunningMode): Promise<Engine> {
  let engine = cache.get(mode);
  if (!engine) {
    classifier ??= Classifier.load();
    engine = Promise.all([classifier, createHandLandmarker(mode)]).then(([c, hand]) => ({
      classifier: c,
      landmarker: hand.landmarker,
      delegate: hand.delegate,
    }));
    engine.catch(() => {
      cache.delete(mode);
      classifier = null;
    });
    cache.set(mode, engine);
  }
  return engine;
}
