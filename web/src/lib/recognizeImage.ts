import { boxFromLandmarks, canvasToTensor, drawCrop, drawLetterboxed, type Box } from './crop';
import { loadEngine } from './engine';
import { pickHand, shouldMirror } from './handTracker';
import { rank, type Ranked } from './smoother';

export interface ImageResult {
  name: string;
  url: string;
  width: number;
  height: number;
  /** Null when no hand was found and the whole image was classified instead. */
  box: Box | null;
  mirrored: boolean;
  input: string;
  ranked: Ranked[];
  ms: number;
}

/** Single-image recognition. Without a detectable hand, the whole image is letterboxed as in training. */
export async function recognizeImage(file: File): Promise<ImageResult> {
  const { landmarker, classifier } = await loadEngine('IMAGE');
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  await image.decode();
  const width = image.naturalWidth, height = image.naturalHeight;

  const size = classifier.meta.image_size;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  const hand = pickHand(landmarker.detect(image), 'auto');
  let box: Box | null = null;
  let mirrored = false;
  if (hand) {
    box = boxFromLandmarks(hand.landmarks, width, height, classifier.meta.hand_crop_margin);
    mirrored = shouldMirror(hand, 'auto');
    drawCrop(ctx, image, width, height, box, mirrored);
  } else {
    drawLetterboxed(ctx, image, width, height);
  }
  const { scores, ms } = await classifier.classify(canvasToTensor(ctx));
  return {
    name: file.name,
    url,
    width,
    height,
    box,
    mirrored,
    input: canvas.toDataURL('image/png'),
    ranked: rank(classifier.meta.classes, scores),
    ms,
  };
}
