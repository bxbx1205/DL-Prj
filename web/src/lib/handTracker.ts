import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { ASSETS, type HandSetting } from './config';
import type { Point } from './crop';

export type RunningMode = 'VIDEO' | 'IMAGE';

export interface DetectedHand {
  landmarks: Point[];
  /** The signer's actual hand, corrected for MediaPipe's mirrored-input convention. */
  side: 'left' | 'right';
  score: number;
}

export async function createHandLandmarker(mode: RunningMode): Promise<{ landmarker: HandLandmarker; delegate: 'GPU' | 'CPU' }> {
  const fileset = await FilesetResolver.forVisionTasks(ASSETS.mediapipeWasm);
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: ASSETS.handTask, delegate },
    runningMode: mode,
    // Track two so a resting second hand does not steal the slot from the signing hand.
    numHands: 2,
    minHandDetectionConfidence: 0.55,
    minHandPresenceConfidence: 0.55,
    minTrackingConfidence: 0.5,
  });
  try {
    return { landmarker: await HandLandmarker.createFromOptions(fileset, options('GPU')), delegate: 'GPU' };
  } catch {
    return { landmarker: await HandLandmarker.createFromOptions(fileset, options('CPU')), delegate: 'CPU' };
  }
}

/**
 * Picks the hand to classify. MediaPipe labels handedness as if the image were
 * mirrored; camera frames here are not, so its labels are swapped back.
 * With a preferred side, that hand wins; otherwise the larger hand does.
 */
export function pickHand(result: HandLandmarkerResult, preferred: HandSetting): DetectedHand | null {
  const hands: DetectedHand[] = result.landmarks.map((landmarks, i) => {
    const category = result.handedness[i]?.[0];
    return {
      landmarks,
      side: category?.categoryName === 'Left' ? 'right' : 'left',
      score: category?.score ?? 0,
    };
  });
  if (!hands.length) return null;
  if (preferred !== 'auto') {
    const match = hands.find((h) => h.side === preferred);
    if (match) return match;
  }
  return hands.reduce((a, b) => (extent(b.landmarks) > extent(a.landmarks) ? b : a));
}

function extent(points: Point[]) {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

/**
 * Whether the crop should be flipped to match the training images. MediaPipe
 * labels every hand in the ASL Alphabet dataset as "Right" under its selfie
 * convention, i.e. the photos show a right hand as seen in a mirror. A right
 * hand in an unmirrored camera frame therefore has to be flipped; a left hand
 * already has that orientation.
 */
export function shouldMirror(hand: DetectedHand, setting: HandSetting) {
  return setting === 'auto' ? hand.side === 'right' : setting === 'right';
}

export const HAND_CONNECTIONS: [number, number][] = HandLandmarker.HAND_CONNECTIONS.map((c) => [c.start, c.end]);
