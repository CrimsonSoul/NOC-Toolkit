import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import png2icons from 'png2icons';

const { createICNS, BICUBIC } = png2icons;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const iconSource = join(projectRoot, 'public', 'icon.png');
const iconTarget = join(projectRoot, 'public', 'icon.icns');

function generateIcon() {
  if (existsSync(iconTarget)) {
    return;
  }

  if (!existsSync(iconSource)) {
    throw new Error('Unable to locate public/icon.png to generate a macOS icon.');
  }

  const pngBuffer = readFileSync(iconSource);
  const icnsBuffer = createICNS(pngBuffer, BICUBIC, 0);

  if (!icnsBuffer) {
    throw new Error('Failed to convert icon.png into icon.icns.');
  }

  writeFileSync(iconTarget, icnsBuffer);
}

function cleanupIcon() {
  if (existsSync(iconTarget)) {
    rmSync(iconTarget);
  }
}

try {
  const action = process.argv[2] ?? 'generate';

  if (action === 'cleanup') {
    cleanupIcon();
  } else if (action === 'generate') {
    generateIcon();
  } else {
    throw new Error(`Unknown action "${action}". Expected "generate" or "cleanup".`);
  }
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
