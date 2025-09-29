import { mkdtempSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const iconSource = join(projectRoot, 'public', 'icon.png');
const iconTarget = join(projectRoot, 'public', 'icon.icns');

const iconSetName = 'icon.iconset';

const iconSizes = [
  { size: 16, retina: false },
  { size: 16, retina: true },
  { size: 32, retina: false },
  { size: 32, retina: true },
  { size: 64, retina: false },
  { size: 64, retina: true },
  { size: 128, retina: false },
  { size: 128, retina: true },
  { size: 256, retina: false },
  { size: 256, retina: true },
  { size: 512, retina: false },
  { size: 512, retina: true }
];

function ensureMacOS() {
  if (process.platform !== 'darwin') {
    throw new Error('Generating a macOS icon requires running on macOS.');
  }
}

function generateIcon() {
  if (existsSync(iconTarget)) {
    return;
  }

  ensureMacOS();

  if (!existsSync(iconSource)) {
    throw new Error('Unable to locate public/icon.png to generate a macOS icon.');
  }

  const tempRoot = mkdtempSync(join(tmpdir(), 'noclist-icon-'));
  const iconsetDir = join(tempRoot, iconSetName);
  mkdirSync(iconsetDir);

  try {
    for (const { size, retina } of iconSizes) {
      const dimension = retina ? size * 2 : size;
      const suffix = retina ? '@2x' : '';
      const target = join(iconsetDir, `icon_${size}x${size}${suffix}.png`);

      execFileSync('sips', ['-z', `${dimension}`, `${dimension}`, iconSource, '--out', target]);
    }

    execFileSync('iconutil', ['--convert', 'icns', '--output', iconTarget, iconsetDir]);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
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
