// Minimal headless-browser test driver: a static file server plus the Chrome DevTools Protocol
// over Node 24's global WebSocket. Uses a locally installed Edge or Chrome; no npm dependencies.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '../..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png' };
const BROWSERS = [process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'];

export function serveStatic(root = ROOT, port = 5199) {
  const server = createServer(async (req, res) => {
    const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
      const file = (await stat(path)).isDirectory() ? join(path, 'index.html') : path;
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}

export async function openPage(url, { port = 9230 } = {}) {
  const exe = BROWSERS.find((p) => p && existsSync(p));
  if (!exe) throw new Error('no Edge or Chrome found; set BROWSER to the browser executable');
  const profile = mkdtempSync(join(tmpdir(), 'rat-cdp-'));
  const proc = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,800', 'about:blank'],
  { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 100 && !targets; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(100); }
  }
  if (!targets) throw new Error('browser did not open its DevTools port');
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      logs.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      logs.push(`exception: ${d.exception?.description ?? d.text}`);
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      logs.push(`log: ${msg.params.entry.text} ${msg.params.entry.url ?? ''}`);
    }
  };
  const send = (method, params = {}) => new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const ev = async (expression) => {
    const r = (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result;
    if (r.exceptionDetails) throw new Error(`${expression}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  };
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });
  return {
    ev, logs,
    errors: () => logs.filter((l) => !l.includes('favicon.ico')),
    async waitFor(expression, ms = 20000) {
      for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(100)) if (await ev(expression)) return;
      throw new Error(`timed out waiting for ${expression}`);
    },
    async screenshot(path) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path, Buffer.from(r.result.data, 'base64'));
    },
    close() {
      ws.close();
      proc.kill();
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* browser may still hold it */ }
    },
  };
}

export function checker() {
  const failures = [];
  const check = (ok, msg) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
    if (!ok) failures.push(msg);
  };
  const near = (v, want, tol, msg) => check(Math.abs(v - want) <= tol, `${msg}: ${v.toFixed(3)} (want ${want} ± ${tol})`);
  const done = () => {
    if (failures.length) { console.error(`${failures.length} check(s) failed`); process.exitCode = 1; }
    else console.log('all checks passed');
  };
  return { check, near, done };
}
