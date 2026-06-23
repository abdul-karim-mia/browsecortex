import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootNodeModules = path.resolve(__dirname, '../../../node_modules');
const destDir = path.resolve(__dirname, '../public/tesseract');

const filesToCopy = [
  { src: path.join(rootNodeModules, 'tesseract.js/dist/worker.min.js'), destName: 'worker.min.js' },
  { src: path.join(rootNodeModules, 'tesseract.js-core/tesseract-core.wasm.js'), destName: 'tesseract-core.wasm.js' },
  { src: path.join(rootNodeModules, 'tesseract.js-core/tesseract-core.wasm'), destName: 'tesseract-core.wasm' },
  { src: path.join(rootNodeModules, 'tesseract.js-core/tesseract-core-simd.wasm.js'), destName: 'tesseract-core-simd.wasm.js' },
  { src: path.join(rootNodeModules, 'tesseract.js-core/tesseract-core-simd.wasm'), destName: 'tesseract-core-simd.wasm' },
];

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

let copiedCount = 0;
for (const item of filesToCopy) {
  if (fs.existsSync(item.src)) {
    fs.copyFileSync(item.src, path.join(destDir, item.destName));
    console.log(`[tesseract] Copied ${item.destName} to public/tesseract/`);
    copiedCount++;
  } else {
    console.warn(`[tesseract] Source file not found: ${item.src}`);
  }
}

console.log(`[tesseract] Copied ${copiedCount} files to public/tesseract/`);
