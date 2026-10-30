import { useCallback, useEffect, useRef, useState } from 'react';
import { MIN_CROP_PX, type Settings } from './config';
import { Composer, type ComposerTick } from './composer';
import { BoxFilter, boxFromLandmarks, canvasToTensor, drawCrop, type Box } from './crop';
import { loadEngine, type Engine } from './engine';
import { HAND_CONNECTIONS, pickHand, shouldMirror, type DetectedHand } from './handTracker';
import { ProbabilitySmoother, type SmoothedState } from './smoother';

export type Status = 'idle' | 'loading' | 'running' | 'error';

export interface Frame {
  hand: 'none' | 'far' | 'ok';
  side: DetectedHand['side'] | null;
  mirrored: boolean;
  smoothed: SmoothedState;
  tick: ComposerTick;
  text: string;
  fps: number;
  handMs: number;
  modelMs: number;
}

const EMPTY_FRAME: Frame = {
  hand: 'none',
  side: null,
  mirrored: false,
  smoothed: { stable: null, ranked: [], raw: null, votes: 0, frames: 0 },
  tick: { progress: 0, pending: null, committed: null },
  text: '',
  fps: 0,
  handMs: 0,
  modelMs: 0,
};

/**
 * Camera -> MediaPipe hand landmarks -> square crop -> ONNX classifier ->
 * temporal smoothing -> text. Owns the camera stream and the frame loop.
 */
export function useRecognizer(settings: Settings, onCommit?: (value: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const cropRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<Frame>(EMPTY_FRAME);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string>('');
  const [info, setInfo] = useState<{ delegate: string; threads: number } | null>(null);
  const [aspect, setAspect] = useState(16 / 9);

  const settingsRef = useRef(settings);
  const onCommitRef = useRef(onCommit);
  const composer = useRef(new Composer(settings));
  const smoother = useRef<ProbabilitySmoother | null>(null);
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => {
    settingsRef.current = settings;
    composer.current.options = settings;
    if (smoother.current) {
      smoother.current.options = settings;
      smoother.current.clear();
    }
  }, [settings]);
  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  const stop = useCallback(() => {
    stopRef.current();
    stopRef.current = () => {};
    setStatus('idle');
    setFrame((f) => ({ ...EMPTY_FRAME, text: f.text }));
  }, []);

  const start = useCallback(async (deviceId?: string) => {
    stopRef.current();
    setError(null);
    setStatus('loading');
    let stream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('This browser cannot access a camera here. Use a recent browser over HTTPS.');
      }
      const [engine, media] = await Promise.all([
        loadEngine('VIDEO'),
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        }),
      ]);
      stream = media;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter((d) => d.kind === 'videoinput'));
      setCameraId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? '');
      setInfo({ delegate: engine.delegate, threads: engine.classifier.threads });
      if (video.videoWidth && video.videoHeight) setAspect(video.videoWidth / video.videoHeight);
      stopRef.current = runLoop(engine, stream);
      setStatus('running');
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop());
      setError(describeError(e));
      setStatus('error');
    }
    // runLoop only reads refs, so it is stable for the life of the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runLoop(engine: Engine, stream: MediaStream) {
    const video = videoRef.current!;
    const overlay = overlayRef.current!.getContext('2d')!;
    const crop = cropRef.current!.getContext('2d', { willReadFrequently: true })!;
    const { classifier, landmarker } = engine;
    smoother.current = new ProbabilitySmoother(classifier.meta.classes, settingsRef.current);
    const filter = new BoxFilter();
    let running = true;
    let lastVideoTime = -1;
    let lastTimestamp = 0;
    let handPresent = false;
    let smoothed = EMPTY_FRAME.smoothed;
    let modelMs = 0;
    let fps = 0;
    let lastFrameAt = performance.now();
    let handle = 0;

    const schedule = () => {
      if (!running) return;
      if ('requestVideoFrameCallback' in video) handle = video.requestVideoFrameCallback(step);
      else handle = requestAnimationFrame(step);
    };

    const step = () => {
      if (!running) return;
      const now = performance.now();
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return schedule();
      lastVideoTime = video.currentTime;
      const s = settingsRef.current;
      const width = video.videoWidth, height = video.videoHeight;
      if (overlay.canvas.width !== width) overlay.canvas.width = width;
      if (overlay.canvas.height !== height) overlay.canvas.height = height;

      // MediaPipe requires strictly increasing timestamps.
      const timestamp = Math.max(now, lastTimestamp + 1);
      lastTimestamp = timestamp;
      const handStart = performance.now();
      const result = landmarker.detectForVideo(video, timestamp);
      const handMs = performance.now() - handStart;
      const hand = pickHand(result, s.hand);

      let box: Box | null = null;
      let state: Frame['hand'] = 'none';
      let mirrored = false;
      if (hand) {
        box = filter.apply(boxFromLandmarks(hand.landmarks, width, height, classifier.meta.hand_crop_margin), width, now);
        state = box.side < MIN_CROP_PX ? 'far' : 'ok';
        mirrored = shouldMirror(hand, s.hand);
      } else {
        filter.reset();
      }
      handPresent = state === 'ok';
      if (!handPresent) smoothed = smoother.current!.update(null);

      if (handPresent && box && !classifier.busy) {
        drawCrop(crop, video, width, height, box, mirrored);
        classifier
          .classify(canvasToTensor(crop))
          .then(({ scores, ms }) => {
            modelMs = ms;
            // Drop results that arrive after the hand has left.
            if (running && handPresent) smoothed = smoother.current!.update(scores);
          })
          .catch(() => {});
      }

      drawOverlay(overlay, hand, box, smoothed.stable !== null, s.showLandmarks);
      const tick = composer.current.update(smoothed.stable, handPresent, now);
      if (tick.committed) onCommitRef.current?.(tick.committed);

      const dt = now - lastFrameAt;
      lastFrameAt = now;
      fps = fps ? fps * 0.9 + (1000 / dt) * 0.1 : 1000 / dt;
      setFrame({
        hand: state,
        side: hand?.side ?? null,
        mirrored,
        smoothed,
        tick,
        text: composer.current.text,
        fps,
        handMs,
        modelMs,
      });
      schedule();
    };
    schedule();

    return () => {
      running = false;
      if ('cancelVideoFrameCallback' in video) video.cancelVideoFrameCallback(handle);
      cancelAnimationFrame(handle);
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      overlay.clearRect(0, 0, overlay.canvas.width, overlay.canvas.height);
    };
  }

  useEffect(() => () => stopRef.current(), []);

  const edit = useCallback((action: 'space' | 'backspace' | 'clear') => {
    composer.current[action]();
    setFrame((f) => ({ ...f, text: composer.current.text }));
  }, []);

  const resetSmoothing = useCallback(() => smoother.current?.clear(), []);

  return {
    videoRef,
    overlayRef,
    cropRef,
    status,
    error,
    frame,
    cameras,
    cameraId,
    info,
    aspect,
    start,
    stop,
    edit,
    resetSmoothing,
  };
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  hand: DetectedHand | null,
  box: Box | null,
  stable: boolean,
  showLandmarks: boolean,
) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  if (!hand || !box) return;
  const unit = Math.max(1, width / 640);
  if (showLandmarks) {
    ctx.lineWidth = 1.5 * unit;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      const p = hand.landmarks[a], q = hand.landmarks[b];
      ctx.moveTo(p.x * width, p.y * height);
      ctx.lineTo(q.x * width, q.y * height);
    }
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    for (const p of hand.landmarks) {
      ctx.fillRect(p.x * width - 2 * unit, p.y * height - 2 * unit, 4 * unit, 4 * unit);
    }
  }
  // Corner brackets instead of a full rectangle keep the hand visible.
  const left = box.cx - box.side / 2, top = box.cy - box.side / 2, s = box.side, c = Math.min(28 * unit, s / 4);
  ctx.strokeStyle = stable ? '#ff5a2a' : 'rgba(255,255,255,0.9)';
  ctx.lineWidth = (stable ? 3 : 2) * unit;
  ctx.beginPath();
  for (const [x, y, dx, dy] of [
    [left, top, 1, 1],
    [left + s, top, -1, 1],
    [left, top + s, 1, -1],
    [left + s, top + s, -1, -1],
  ]) {
    ctx.moveTo(x + dx * c, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * c);
  }
  ctx.stroke();
}

function describeError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Camera access was blocked. Allow the camera in your browser’s site settings, then try again.';
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') return 'No camera was found. Connect one, or pick another camera.';
    if (error.name === 'NotReadableError') return 'The camera is in use by another application.';
  }
  return error instanceof Error ? error.message : String(error);
}
