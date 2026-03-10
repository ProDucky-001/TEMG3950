/**
 * Run build then start Electron. Use when electron-vite dev/build hangs.
 * 1) Tries electron-vite build with 90s timeout; on success or timeout, runs Electron.
 * 2) Ensures process exits after build so the terminal returns.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const OUT_MAIN = path.join(ROOT, 'out', 'main', 'index.js');
const MAX_BUILD_MS = 90000;

function runBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(ROOT, 'node_modules/electron-vite/bin/electron-vite.js'), 'build'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1' } }
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
    child.stderr.on('data', (d) => { err += d; process.stderr.write(d); });
    child.on('close', (code) => resolve({ code, out, err }));
    child.on('error', reject);
    setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ code: null, out, err, timeout: true });
    }, MAX_BUILD_MS);
  });
}

function hasValidBuild() {
  try {
    return fs.statSync(OUT_MAIN).size > 1000;
  } catch {
    return false;
  }
}

async function main() {
  if (!hasValidBuild()) {
    console.log('No existing build; running electron-vite build (max 90s)...');
    const { code, timeout } = await runBuild();
    if (timeout) console.log('Build timed out; using existing out/ if present.');
    else if (code !== 0) console.warn('Build exited with code', code);
  } else {
    console.log('Using existing build in out/');
  }

  if (!hasValidBuild()) {
    console.error('No valid out/main/index.js. Run: npm run build');
    process.exit(1);
  }

  console.log('Starting ScamShield...');
  const electronPath = require('electron');
  const env = { ...process.env, NODE_ENV: 'development' };
  delete env.ELECTRON_RUN_AS_NODE;
  const cmd = process.platform === 'win32'
    ? `"${electronPath.replace(/"/g, '\\"')}" "${ROOT.replace(/"/g, '\\"')}"`
    : `"${electronPath}" "${ROOT}"`;
  const child = spawn(cmd, { cwd: ROOT, stdio: 'inherit', shell: true, env });

  let exitTimeout;
  child.on('close', (code) => {
    if (exitTimeout) clearTimeout(exitTimeout);
    process.exit(code ?? 0);
  });
  child.on('error', (err) => { console.error(err); process.exit(1); });

  function shutdown(signal) {
    if (!child || child.killed) return;
    child.kill(signal);
    exitTimeout = setTimeout(() => {
      if (child && !child.killed) child.kill('SIGKILL');
      process.exit(1);
    }, 8000);
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => { console.error(err); process.exit(1); });
