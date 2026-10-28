"""Run locally after downloading the trained model from Kaggle. Q quits; R resets."""
import argparse
import csv
import json
import time
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
import tensorflow as tf

from temporal_vote import TemporalVote


def hand_crop(rgb, landmarks, margin=0.2):
    h, w = rgb.shape[:2]
    xs = np.array([p.x*w for p in landmarks.landmark])
    ys = np.array([p.y*h for p in landmarks.landmark])
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    side = max(2, int(max(x1-x0, y1-y0)*(1+2*margin)))
    cx, cy = (x0+x1)/2, (y0+y1)/2
    left, top = int(cx-side/2), int(cy-side/2)
    right, bottom = left+side, top+side
    crop = np.zeros((side, side, 3), dtype=np.uint8)
    sx0, sy0, sx1, sy1 = max(0,left), max(0,top), min(w,right), min(h,bottom)
    if sx1 <= sx0 or sy1 <= sy0:
        return None, None
    crop[sy0-top:sy1-top, sx0-left:sx1-left] = rgb[sy0:sy1, sx0:sx1]
    return crop, (sx0,sy0,sx1,sy1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--results', type=Path, required=True,
                        help='Directory containing best_model.keras and inference_config.json')
    parser.add_argument('--camera', type=int, default=0)
    parser.add_argument('--log', type=Path, default=Path('webcam_frame_log.csv'))
    parser.add_argument('--capture-label', help='Optional correct label for saved volunteer crops')
    parser.add_argument('--capture-dir', type=Path, default=Path('volunteer_test'))
    args = parser.parse_args()
    config = json.loads((args.results/'inference_config.json').read_text())
    names = config['classes']
    if args.capture_label and args.capture_label not in names:
        raise ValueError('Choose a capture label from: '+', '.join(names))
    size = config['image_size']
    threshold = config['score_threshold']
    voter = TemporalVote(config['vote_window'], config['required_votes'])
    model = tf.keras.models.load_model(args.results/'best_model.keras', compile=False)
    if tuple(model.input_shape[1:3]) != (size, size):
        raise ValueError('Model input size does not match inference_config.json')
    if model.output_shape[-1] != len(names):
        raise ValueError('Model output count does not match inference_config.json')

    @tf.function
    def predict(batch):
        return model(batch, training=False)

    predict(tf.zeros([1,size,size,3], dtype=tf.float32)).numpy()
    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise RuntimeError('Cannot open camera. Check OS permissions or try --camera 1.')
    args.log.parent.mkdir(parents=True, exist_ok=True)
    frame_no = 0
    previous = time.perf_counter()
    print('Q: quit | R: reset | S: save labeled crop if --capture-label is supplied')
    print('Raw probabilities are not calibrated confidence. Save crops only with volunteer consent.')
    try:
        with args.log.open('w', newline='') as log_file, mp.solutions.hands.Hands(
                static_image_mode=False, max_num_hands=1,
                min_detection_confidence=0.6, min_tracking_confidence=0.6) as hands:
            writer = csv.writer(log_file)
            writer.writerow(['frame','timestamp_s','hand_found','raw_label','score',
                             'stable_label','processing_ms','loop_interval_ms'])
            while True:
                started = time.perf_counter()
                ok, frame = cap.read()
                if not ok:
                    print('Camera frame unavailable; stopping.'); break
                # Infer on the unmirrored frame. Mirror only the displayed preview.
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                detection = hands.process(rgb)
                raw_label, score, stable = '', 0., None
                crop, box = None, None
                if detection.multi_hand_landmarks:
                    crop, box = hand_crop(rgb, detection.multi_hand_landmarks[0],
                                          config['hand_crop_margin'])
                    if crop is not None:
                        image = tf.image.resize_with_pad(crop, size, size)
                        image = tf.cast(tf.clip_by_value(image,0,255),tf.uint8)
                        scores = predict(tf.cast(image[None], tf.float32)).numpy()[0]
                        idx = int(scores.argmax())
                        raw_label, score = names[idx], float(scores[idx])
                        stable = voter.update(raw_label if score >= threshold else None)
                if crop is None:
                    voter.clear()
                processing_ms = (time.perf_counter()-started)*1000
                display = cv2.flip(frame,1)
                if box:
                    x0,y0,x1,y1 = box
                    cv2.rectangle(display,(display.shape[1]-x1,y0),
                                  (display.shape[1]-x0,y1),(40,220,90),2)
                    # This preview is the exact RGB crop classified by the CNN.
                    cv2.imshow('CNN input crop (unmirrored)',cv2.cvtColor(crop,cv2.COLOR_RGB2BGR))
                message = stable or ('Hold a supported sign' if crop is not None else 'No hand detected')
                cv2.putText(display,f'Stable: {message}',(15,32),cv2.FONT_HERSHEY_SIMPLEX,.7,(40,240,80),2)
                cv2.putText(display,f'Raw: {raw_label or "--"} | score {score:.2f}',(15,62),
                            cv2.FONT_HERSHEY_SIMPLEX,.6,(255,255,255),1)
                cv2.putText(display,f'Processing {processing_ms:.0f} ms | Q quit | R reset',(15,90),
                            cv2.FONT_HERSHEY_SIMPLEX,.55,(255,255,255),1)
                cv2.imshow('Static ASL Alphabet Recognition - RBU',display)
                key = cv2.waitKey(1) & 0xff
                finished = time.perf_counter()
                writer.writerow([frame_no,time.time(),crop is not None,raw_label,score,
                                 stable or '',processing_ms,(finished-previous)*1000])
                previous = finished
                frame_no += 1
                if frame_no % 30 == 0: log_file.flush()
                if key == ord('r'): voter.clear()
                if key == ord('s') and crop is not None and args.capture_label:
                    folder = args.capture_dir/args.capture_label
                    folder.mkdir(parents=True, exist_ok=True)
                    image_path = folder/f'{time.time_ns()}.png'
                    cv2.imwrite(str(image_path),cv2.cvtColor(crop,cv2.COLOR_RGB2BGR))
                    print('Saved labeled crop:',image_path)
                if key == ord('q'): break
    finally:
        cap.release()
        cv2.destroyAllWindows()
    print('Saved:',args.log)
    print('Processing time excludes display and vote accumulation; use loop intervals for achieved FPS.')


if __name__ == '__main__':
    main()
