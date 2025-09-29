import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);

const SAMPLE_FILES = ['contacts.xlsx', 'groups.xlsx'];

const TARGET_DIRECTORIES = {
  windows: {
    label: 'Windows release directory',
    path: join(projectRoot, 'release', 'NOCList-win32-x64')
  },
  macos: {
    label: 'macOS bundle directory',
    path: join(
      projectRoot,
      'release',
      'NOCList-darwin-arm64',
      'NOCList.app',
      'Contents',
      'MacOS'
    )
  }
};

function normaliseTarget(target) {
  return target?.toLowerCase();
}

function parseCliTargets() {
  const values = [];

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--target=')) {
      const targetArg = arg.slice('--target='.length);
      values.push(...targetArg.split(',').map((value) => value.trim()).filter(Boolean));
      continue;
    }

    if (!arg.startsWith('--')) {
      values.push(arg);
    }
  }

  return values.map(normaliseTarget).filter(Boolean);
}

export function copySampleData({ targets = ['windows', 'macos'] } = {}) {
  const uniqueTargets = [...new Set(targets.map(normaliseTarget).filter(Boolean))];

  if (uniqueTargets.length === 0) {
    throw new Error('At least one target (windows or macos) must be specified.');
  }

  for (const target of uniqueTargets) {
    const targetDetails = TARGET_DIRECTORIES[target];

    if (!targetDetails) {
      console.warn(`Unknown target "${target}". Valid options are: windows, macos.`);
      continue;
    }

    if (!existsSync(targetDetails.path)) {
      console.warn(
        `Skipping sample data copy: ${targetDetails.label} not found at ${targetDetails.path}.`
      );
      continue;
    }

    for (const file of SAMPLE_FILES) {
      const sourcePath = join(projectRoot, file);
      const destinationPath = join(targetDetails.path, file);
      copyFileSync(sourcePath, destinationPath);
    }
  }
}

function isExecutedDirectly() {
  const invokedPath = process.argv[1];

  if (!invokedPath) {
    return false;
  }

  return pathToFileURL(invokedPath).href === import.meta.url;
}

if (isExecutedDirectly()) {
  const cliTargets = parseCliTargets();
  copySampleData(cliTargets.length > 0 ? { targets: cliTargets } : undefined);
}
