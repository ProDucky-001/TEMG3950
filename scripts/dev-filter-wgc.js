/**
 * Runs electron-vite dev and filters known-harmless WGC capturer stderr lines.
 * Electron's Windows desktop capture tries WGC first, logs "Failed to start capture: -2147024809",
 * then falls back to legacy capturer. This script hides that noise.
 */
const { spawn } = require('child_process');

const WGC_ERROR = /wgc_capturer_win\.cc.*Failed to start capture: -2147024809/;

const args = [
  'electron-vite',
  'dev',
  '--',
  '--disable-features=AllowWgcWindowCapturer,AllowWgcScreenCapturer',
];
const child = spawn('npx', args, {
  stdio: ['inherit', 'inherit', 'pipe'],
  shell: true,
  cwd: require('path').resolve(__dirname, '..'),
});

child.stderr.on('data', (chunk) => {
  const lines = chunk.toString().split(/\r?\n/);
  for (const line of lines) {
    if (line && !WGC_ERROR.test(line)) {
      process.stderr.write(line + '\n');
    }
  }
});

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal === 'SIGTERM' ? 0 : 1));
});
child.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
