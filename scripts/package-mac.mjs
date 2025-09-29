import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const manageIconScript = join(__dirname, 'manage-mac-icon.mjs');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: projectRoot,
    ...options,
  });

  if (result.status !== 0) {
    const error = new Error(
      `Command "${command} ${args.join(' ')}" failed with exit code ${result.status ?? 'null'}.`
    );
    error.status = result.status ?? 1;
    throw error;
  }
}

function resolveExecutable(basePath) {
  if (process.platform === 'win32') {
    return `${basePath}.cmd`;
  }

  return basePath;
}

const electronPackagerBin = resolveExecutable(
  join(projectRoot, 'node_modules', '.bin', 'electron-packager')
);

let exitCode = 0;

try {
  run('npm', ['run', 'build']);
  run('node', [manageIconScript]);

  run(electronPackagerBin, [
    '.',
    'NOCList',
    '--platform=darwin',
    '--arch=arm64',
    '--overwrite',
    '--out=release',
    '--icon=public/icon.icns',
    '--asar',
    '--prune=true',
  ]);
} catch (error) {
  exitCode = error.status ?? 1;
  console.error(error.message || error);
} finally {
  try {
    run('node', [manageIconScript, 'cleanup']);
  } catch (cleanupError) {
    exitCode = exitCode || cleanupError.status || 1;
    console.error(cleanupError.message || cleanupError);
  }
}

process.exitCode = exitCode;
