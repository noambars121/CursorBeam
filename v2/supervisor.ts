/**
 * Always-on supervisor for Cursor Remote.
 * Listens on port 9799.
 * 
 * Endpoints:
 *   GET /status
 *   POST /start
 *   POST /stop
 *   POST /restart
 *   POST /restart-relay — kill relay port only, spawn relay-server (Cursor stays open)
 */

import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 9799;
const RELAY_PORT = parseInt(process.env.V2_PORT ?? '9800', 10);
const CLIENT_HTML = fs.readFileSync(path.join(__dirname, 'client.html'), 'utf-8');

const APP_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
<rect width="192" height="192" rx="40" fill="#0d1117"/>
<text x="96" y="126" font-family="-apple-system,system-ui,sans-serif" font-size="72" font-weight="700" fill="#58a6ff" text-anchor="middle">CR</text>
</svg>`;

const MANIFEST_JSON = JSON.stringify({
  id: '/cursor-remote',
  name: 'Cursor Remote',
  short_name: 'Cursor',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#0d1117',
  theme_color: '#0d1117',
  icons: [
    { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
  ],
});

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

function checkCursorRunning(): boolean {
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq Cursor.exe" /FO CSV /NH', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return out.includes('Cursor.exe');
  } catch {
    return false;
  }
}

async function checkRelayRunning(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${RELAY_PORT}/health`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

function killRelay() {
  try {
    const out = execSync(`netstat -ano | findstr LISTENING | findstr :${RELAY_PORT}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = out.split('\n');
    for (const line of lines) {
      if (line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        }
      }
    }
  } catch (e) {
    // Ignored, might not be running
  }
}

function killCursor() {
  try {
    execSync('taskkill /IM Cursor.exe /F', { stdio: 'ignore' });
  } catch (e) {
    // Ignored
  }
}

function startSystem() {
  const startScript = path.join(__dirname, 'start.ts');
  const child = spawn('cmd.exe', ['/c', 'npx', 'tsx', startScript], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, V2_LAN: '1' }
  });
  child.unref();
}

/** Kill whatever listens on RELAY_PORT and start only relay-server (same stack as start.ts step 5). */
function restartRelayOnly() {
  killRelay();
  const relayScript = path.join(__dirname, 'relay-server.ts');
  const child = spawn('cmd.exe', ['/c', 'npx', 'tsx', relayScript], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      V2_CDP_BASE: process.env.V2_CDP_BASE ?? 'http://127.0.0.1:9222',
      _V2_BIND_ADDR: process.env._V2_BIND_ADDR ?? '0.0.0.0',
      _V2_LAUNCHED: '1',
      V2_LAN: process.env.V2_LAN ?? '1',
    },
  });
  child.unref();
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(path.join(__dirname, 'client.html'), 'utf-8'));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/manifest.json') {
    res.writeHead(200, { 'Content-Type': 'application/manifest+json' });
    res.end(MANIFEST_JSON);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/icon.svg') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
    res.end(APP_ICON_SVG);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/status') {
    const isCursorRunning = checkCursorRunning();
    const isRelayRunning = await checkRelayRunning();
    sendJson(res, 200, {
      isCursorRunning,
      isRelayRunning,
      isReady: isCursorRunning && isRelayRunning
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/start') {
    startSystem();
    sendJson(res, 200, { ok: true, message: 'Starting system...' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/stop') {
    killRelay();
    // Read query parameter or body to optionally kill cursor?
    // Let's just always kill cursor to cleanly stop the whole stack, or wait, start.ts handles killing stale Cursor.
    // Actually, the prompt says: "stops relay and optionally Cursor". We will kill Cursor too.
    killCursor();
    sendJson(res, 200, { ok: true, message: 'Stopped system' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/restart') {
    killRelay();
    killCursor();
    startSystem();
    sendJson(res, 200, { ok: true, message: 'Restarting system...' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/restart-relay') {
    restartRelayOnly();
    sendJson(res, 200, { ok: true, message: 'Relay restarting (Cursor left running)...' });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

// Bind to all interfaces for LAN/Tailscale access
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Supervisor listening on 0.0.0.0:${PORT}`);
});
