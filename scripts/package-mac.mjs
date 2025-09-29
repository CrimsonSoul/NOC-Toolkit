import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const iconSource = join(projectRoot, 'public', 'icon.png');
const iconTarget = join(projectRoot, 'public', 'icon.icns');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: projectRoot,
    shell: process.platform === 'win32',
    ...options
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    const joinedArgs = args.map((arg) => (arg?.includes(' ') ? `"${arg}"` : arg)).join(' ');
    throw new Error(`Command failed: ${command} ${joinedArgs}`);
  }
}

function parseSigningIdentity() {
  const cliArgs = process.argv.slice(2);
  let identityFromArgs;
  let skipRequested = false;

  for (let index = 0; index < cliArgs.length; index += 1) {
    const arg = cliArgs[index];

    if (arg === '--skip-signing') {
      skipRequested = true;
      continue;
    }

    if (arg === '--signing-identity' || arg === '--identity') {
      identityFromArgs = cliArgs[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--signing-identity=')) {
      identityFromArgs = arg.split('=')[1];
      continue;
    }

    if (arg.startsWith('--identity=')) {
      identityFromArgs = arg.split('=')[1];
    }
  }

  if (skipRequested) {
    return { identity: null, source: 'cli', skip: true };
  }

  const envSources = [
    ['MAC_SIGNING_IDENTITY', process.env.MAC_SIGNING_IDENTITY],
    ['SIGNING_IDENTITY', process.env.SIGNING_IDENTITY],
    ['CSC_NAME', process.env.CSC_NAME],
    ['CODESIGN_IDENTITY', process.env.CODESIGN_IDENTITY]
  ];

  let identity = identityFromArgs ?? null;
  let source = identityFromArgs ? 'cli' : null;

  if (!identity) {
    for (const [envName, value] of envSources) {
      if (typeof value === 'string' && value.trim() !== '') {
        identity = value;
        source = `env:${envName}`;
        break;
      }
    }
  }

  if (!identity) {
    return { identity: null, source: null, skip: false };
  }

  const trimmed = identity.trim();

  if (trimmed === '') {
    return { identity: null, source: null, skip: false };
  }

  return { identity: trimmed, source, skip: false };
}

function generateMacIcon() {
  if (existsSync(iconTarget)) {
    return () => {};
  }

  if (!existsSync(iconSource)) {
    throw new Error('Base icon not found at public/icon.png');
  }

  if (process.platform !== 'darwin') {
    throw new Error('Generating a macOS .icns icon requires macOS tooling (sips and iconutil).');
  }

  console.log('Generating public/icon.icns from public/icon.png');

  const uniqueId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const iconSetDir = join(tmpdir(), `noclist-iconset-${uniqueId}.iconset`);
  mkdirSync(iconSetDir, { recursive: true });

  const sizes = [
    { size: 16, name: 'icon_16x16.png' },
    { size: 32, name: 'icon_16x16@2x.png' },
    { size: 32, name: 'icon_32x32.png' },
    { size: 64, name: 'icon_32x32@2x.png' },
    { size: 128, name: 'icon_128x128.png' },
    { size: 256, name: 'icon_128x128@2x.png' },
    { size: 256, name: 'icon_256x256.png' },
    { size: 512, name: 'icon_256x256@2x.png' },
    { size: 512, name: 'icon_512x512.png' },
    { size: 1024, name: 'icon_512x512@2x.png' }
  ];

  try {
    for (const { size, name } of sizes) {
      const destination = join(iconSetDir, name);
      run('sips', ['-z', String(size), String(size), iconSource, '--out', destination]);
    }

    run('iconutil', ['-c', 'icns', iconSetDir, '-o', iconTarget]);
  } catch (error) {
    rmSync(iconSetDir, { recursive: true, force: true });
    if (existsSync(iconTarget)) {
      rmSync(iconTarget, { force: true });
    }
    throw error;
  }

  rmSync(iconSetDir, { recursive: true, force: true });

  return () => {
    if (existsSync(iconTarget)) {
      rmSync(iconTarget, { force: true });
    }
  };
}

function main() {
  let cleanupIcon = () => {};

  try {
    cleanupIcon = generateMacIcon();
    run('npm', ['run', 'build']);
    run('npx', [
      'electron-packager',
      '.',
      'NOCList',
      '--platform=darwin',
      '--arch=arm64',
      '--overwrite',
      '--out=release',
      '--icon=public/icon.icns',
      '--asar',
      '--prune=true'
    ]);

    const { identity: signingIdentity, source: identitySource, skip } = parseSigningIdentity();
    const appPath = join(
      'release',
      'NOCList-darwin-arm64',
      'NOCList.app'
    );

    if (skip) {
      console.log('Skipping macOS code signing (requested via --skip-signing).');
    } else if (!signingIdentity) {
      throw new Error(
        [
          'No macOS signing identity provided.',
          'Pass one with `--signing-identity` or set an environment variable such as',
          'MAC_SIGNING_IDENTITY, SIGNING_IDENTITY, CSC_NAME, or CODESIGN_IDENTITY.',
          'Use --skip-signing to package without signing.'
        ].join(' ')
      );
    } else {
      const identityDetails = identitySource ? ` (${identitySource})` : '';
      console.log(`Signing macOS app using identity${identityDetails}: ${signingIdentity}`);
      run('npx', [
        'electron-osx-sign',
        appPath,
        '--identity',
        signingIdentity
      ]);
      run('codesign', [
        '--verify',
        '--deep',
        '--strict',
        '--verbose=2',
        appPath
      ]);
    }
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  } finally {
    cleanupIcon();
  }
}

main();
