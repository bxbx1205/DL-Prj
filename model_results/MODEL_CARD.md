# Static ASL MobileNetV3Small

Dataset: Akash Nagaraj / grassknoted/asl-alphabet.
24 static letters plus nothing. Same baseline data splits.
ImageNet pretrained backbone, classifier warm-up, then convolution fine-tuning.
Selected by validation accuracy. Test reused for baseline comparison.
Filename-block test is not unseen-signer evaluation. Volunteer testing remains pending.
Inputs: RGB 0-255; rescaling inside model. Scores are uncalibrated.
Cloud model-only latency excludes capture, MediaPipe, rendering, and voting.
