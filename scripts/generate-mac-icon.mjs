import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import png2icons from 'png2icons';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const iconPngPath = join(projectRoot, 'public', 'icon.png');
const iconIcnsPath = join(projectRoot, 'public', 'icon.icns');

async function createIcon() {
  const source = await fs.readFile(iconPngPath);
  const icnsBuffer = png2icons.createICNS(source, png2icons.BILINEAR, false);

  if (!icnsBuffer) {
    throw new Error('Unable to generate macOS icon from public/icon.png');
  }

  await fs.writeFile(iconIcnsPath, icnsBuffer);
}

async function removeIcon() {
  try {
    await fs.unlink(iconIcnsPath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function main() {
  const shouldCleanup = process.argv[2] === 'cleanup';

  if (shouldCleanup) {
    await removeIcon();
    return;
  }

  await createIcon();
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
