// Copies MediaPipe's WASM runtime into public/ so the app serves every asset
// from its own origin (required for cross-origin isolation on Vercel).
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const target = join(root, 'public', 'mediapipe', 'wasm');

if (!existsSync(source)) {
  console.error('copy-runtime-assets: @mediapipe/tasks-vision is not installed');
  process.exit(1);
}
mkdirSync(target, { recursive: true });
for (const file of readdirSync(source)) {
  if (file.startsWith('vision_wasm_internal') || file.startsWith('vision_wasm_nosimd_internal')) {
    copyFileSync(join(source, file), join(target, file));
  }
}
console.log('copy-runtime-assets: MediaPipe WASM ->', target);
