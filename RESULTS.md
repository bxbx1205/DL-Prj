# Model improvement results

Both models were trained on Kaggle and evaluated using the same 11,901 test images.
The classes and exact train/validation/test assignments are unchanged.

| Measure | Original custom CNN | Improved MobileNetV3Small |
|---|---:|---:|
| Test accuracy | 86.05% | 99.02% |
| Test macro-F1 | 0.8594 | 0.9897 |
| Input image | 96 × 96 | 160 × 160 |
| Training epochs completed | 16 | 30 |
| Training time, excluding data preparation | 168.9 s | 1425.3 s |
| Total parameters | 1,206,585 | 1,016,201 |

Test accuracy increased by **12.97 percentage points**.
The improved model's selected validation accuracy was 98.94%.

## Changes

The improved model starts with ImageNet weights, trains a small classifier, and
then fine-tunes its convolution layers. Batch-normalization statistics remain
fixed. It uses larger images and mild augmentation. The selected model was chosen
using validation accuracy; the original CNN used validation loss.

The split checksum is verified in the notebook. The old test set is reused for
this baseline comparison; it is not a new independent evaluation set. No test
images were moved into training, no difficult classes were removed, and the
reported predictions are single-image predictions without temporal voting.

## Verification

The selected model was saved and reloaded on Kaggle, and its predictions matched
on 32 test images. The downloaded archive and Keras model
passed integrity checks. The accuracy and macro-F1 above were independently
recomputed from all saved test predictions.

## Remaining checks

The public dataset's filename-block split does not establish unseen-signer
accuracy. Webcam performance can differ because of lighting, backgrounds, hand
angles, and the MediaPipe crop. The webcam and volunteer tests still need to run
on the laptop. Cloud model-only latency is not end-to-end webcam FPS or response
delay. See README.md for running the application and collecting labeled crops.

The original CNN and its results are kept in `baseline/`. The default webcam
application uses the improved `model_results/best_model.keras` together with
`model_results/inference_config.json`.
