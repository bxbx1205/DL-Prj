"""Export the trained Keras model to ONNX for in-browser inference.

The .keras file is backend-independent, so this loads it with Keras 3 on the
PyTorch backend (TensorFlow is not required). Run from the repository root:

    pip install "keras>=3.10" torch onnx onnxscript onnxruntime h5py
    python tools/export_web_model.py --results model_results --out web/public/model

Writes model.onnx and labels.json, then checks that ONNX Runtime reproduces the
Keras scores.
"""
import argparse
import json
import os
import shutil
import tempfile
from pathlib import Path

os.environ.setdefault('KERAS_BACKEND', 'torch')

import keras  # noqa: E402
import numpy as np  # noqa: E402


def write_report(results, path):
    """Per-class test scores for the web app's model page."""
    import csv
    report = {r['']: r for r in csv.DictReader((results/'classification_report.csv').open())}
    per_class = []
    for row in csv.DictReader((results/'class_comparison.csv').open()):
        r = report[row['']]
        per_class.append({
            'label': row[''],
            'baseline_f1': round(float(row['original_f1']), 4),
            'f1': round(float(row['improved_f1']), 4),
            'precision': round(float(r['precision']), 4),
            'recall': round(float(r['recall']), 4),
            'support': int(float(r['support'])),
        })
    baseline = json.loads((results.parent/'baseline'/'metrics.json').read_text())
    path.write_text(json.dumps({'per_class': per_class, 'baseline': baseline}, indent=1))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--results', type=Path, default=Path('model_results'))
    parser.add_argument('--out', type=Path, default=Path('web/public/model'))
    args = parser.parse_args()

    import onnx
    import onnxruntime as ort

    config = json.loads((args.results/'inference_config.json').read_text())
    size = config['image_size']
    model = keras.models.load_model(args.results/'best_model.keras', compile=False)
    if tuple(model.input_shape[1:3]) != (size, size):
        raise SystemExit('Model input size does not match inference_config.json')
    if model.output_shape[-1] != len(config['classes']):
        raise SystemExit('Model output count does not match inference_config.json')

    rng = np.random.default_rng(0)
    probe = np.concatenate([
        rng.uniform(0, 255, (6, size, size, 3)),
        np.zeros((1, size, size, 3)),
        np.full((1, size, size, 3), 128.0),
    ]).astype(np.float32)
    # Calling the model once also builds it, which export() requires.
    expected = np.asarray(keras.ops.convert_to_numpy(model(probe, training=False)))

    # The random augmentation layers are identity at inference but still trace
    # random-generator ops, so export a graph that reuses the trained layers
    # without them (and without dropout).
    inputs = keras.Input((size, size, 3), name='rgb_0_to_255')
    x = model.get_layer('MobileNetV3Small')(inputs)
    x = model.get_layer('global_average_pooling2d')(x)
    x = model.get_layer('dense')(x)
    outputs = model.get_layer('dense_1')(x)
    inference_model = keras.Model(inputs, outputs, name='static_asl_inference')
    rebuilt = np.asarray(keras.ops.convert_to_numpy(inference_model(probe, training=False)))
    if np.abs(rebuilt-expected).max() > 1e-5:
        raise SystemExit('Inference-only graph does not match the trained model')

    args.out.mkdir(parents=True, exist_ok=True)
    onnx_path = args.out/'model.onnx'
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)/'model.onnx'
        inference_model.export(str(tmp_path), format='onnx', verbose=False)
        # Fold external weight files (if any) into one self-contained file.
        proto = onnx.load(str(tmp_path), load_external_data=True)
        onnx.save(proto, str(onnx_path), save_as_external_data=False)

    session = ort.InferenceSession(str(onnx_path), providers=['CPUExecutionProvider'])
    got = session.run(None, {session.get_inputs()[0].name: probe})[0]
    max_diff = float(np.abs(expected-got).max())
    same_argmax = bool((expected.argmax(1) == got.argmax(1)).all())
    print(f'max |keras - onnx| = {max_diff:.2e}; argmax identical: {same_argmax}')
    if max_diff > 1e-3 or not same_argmax:
        raise SystemExit('ONNX export does not match the Keras model')

    meta = {
        'classes': config['classes'],
        'image_size': size,
        'input_name': session.get_inputs()[0].name,
        'output_name': session.get_outputs()[0].name,
        'input_shape': [d if isinstance(d, int) else -1 for d in session.get_inputs()[0].shape],
        'pixel_range': config['pixel_range'],
        'hand_crop_margin': config['hand_crop_margin'],
        'export_max_abs_diff': max_diff,
    }
    (args.out/'labels.json').write_text(json.dumps(meta, indent=2)+'\n')
    shutil.copy(args.results/'metrics.json', args.out/'metrics.json')
    write_report(args.results, args.out/'report.json')
    print('Wrote', onnx_path, f'({onnx_path.stat().st_size/1e6:.2f} MB)')
    print('Input', session.get_inputs()[0].name, session.get_inputs()[0].shape,
          '-> output', session.get_outputs()[0].name, session.get_outputs()[0].shape)


if __name__ == '__main__':
    main()
