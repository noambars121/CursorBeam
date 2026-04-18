/**
 * V2 Relay Server
 *
 * Minimal local HTTP + WebSocket server that exposes CDP-based Cursor control.
 *
 * Endpoints:
 *   GET  /health  — CDP/Cursor connection status
 *   POST /admin/restart-relay — Auth: respawn relay (when supervisor :9799 not used)
 *   GET  /state   — Latest extracted chat state
 *   POST /send    — Inject prompt into Cursor composer
 *   POST /chat/load-older — Scroll Cursor composer up to load virtualized older messages (mobile scroll-back)
 *   WS   /ws      — Real-time state change stream
 *
 * Run:  npx tsx v2/relay-server.ts
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { CdpStateManager, type StateChangeEvent, type TerminalChangeEvent, type StateSnapshot } from './state-manager.js';
import { checkPassword, createToken, verifyToken, extractToken } from './auth.js';
import { VALID_PUBLIC_MODES } from './mode-utils.js';
import { loadProjects, findProject, detectActiveProject } from './project-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from repo root so config like PROJECTS_ROOT applies whether the
// server is started via start.ts or run standalone (`npx tsx v2/relay-server.ts`).
// Project-manager reads env inside its functions (not at import time), so loading
// here — after the static imports have resolved — is correct.
try {
  const dotenv = await import('dotenv');
  dotenv.config({ path: path.resolve(__dirname, '..', '.env'), override: true });
} catch {
  // dotenv is optional — not critical if missing.
}
const CLIENT_HTML = fs.readFileSync(path.join(__dirname, 'client.html'), 'utf-8');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');

const MANIFEST_JSON = JSON.stringify({
  id: '/cursor-remote',
  name: 'CursorBeam',
  short_name: 'CursorBeam',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#0d1117',
  theme_color: '#0d1117',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
});

// Lazy-loaded, small static assets served from ./assets
const ICON_ROUTES: Record<string, { file: string; type: string }> = {
  '/favicon.ico':   { file: 'favicon.ico',    type: 'image/x-icon' },
  '/icon-192.png':  { file: 'icon-192.png',   type: 'image/png' },
  '/icon-512.png':  { file: 'icon-512.png',   type: 'image/png' },
  '/icon-384.png':  { file: 'icon-384.png',   type: 'image/png' },
  '/icon-256.png':  { file: 'icon-256.png',   type: 'image/png' },
  '/icon-128.png':  { file: 'icon-128.png',   type: 'image/png' },
  '/icon-96.png':   { file: 'icon-96.png',    type: 'image/png' },
  '/icon-64.png':   { file: 'icon-64.png',    type: 'image/png' },
  '/icon-48.png':   { file: 'icon-48.png',    type: 'image/png' },
  '/icon-32.png':   { file: 'icon-32.png',    type: 'image/png' },
  '/icon-16.png':   { file: 'icon-16.png',    type: 'image/png' },
  '/logo.png':      { file: 'logo.png',       type: 'image/png' },
};
const ICON_CACHE = new Map<string, Buffer>();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT ?? '9800', 10);
const CDP_BASE = process.env.V2_CDP_BASE ?? 'http://127.0.0.1:9222';
const POLL_MS = parseInt(process.env.POLL_MS ?? '1500', 10);
const BIND_ADDR = process.env.BIND_ADDR ?? '127.0.0.1';
const LAUNCHED_BY_START = process.env._V2_LAUNCHED === '1';

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(msg: string): void {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[${ts}] [Relay] ${msg}`);
}

// ---------------------------------------------------------------------------
// JSON response helpers
// ---------------------------------------------------------------------------

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(json);
}

function readBody(req: http.IncomingMessage, maxBytes = 15 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (c: Buffer) => {
      total += c.length;
      if (total > maxBytes) { req.destroy(); reject(new Error('Request body too large')); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// State manager
// ---------------------------------------------------------------------------

const manager = new CdpStateManager({ cdpBase: CDP_BASE, pollIntervalMs: POLL_MS });

// ---------------------------------------------------------------------------
// WebSocket clients
// ---------------------------------------------------------------------------

const wsClients = new Set<WebSocket>();

function broadcastToClients(event: StateChangeEvent): void {
  const activeProjectId = detectActiveProject(event.snapshot.state.windowTitle);
  const payload = JSON.stringify({
    type: event.type,
    snapshot: {
      messageCount: event.snapshot.state.messageCount,
      messages: event.snapshot.state.messages,
      pendingActions: event.snapshot.state.pendingActions,
      currentMode: event.snapshot.state.currentMode,
      currentModel: event.snapshot.state.currentModel,
      activeChatTitle: event.snapshot.state.activeChatTitle,
      windowTitle: event.snapshot.state.windowTitle,
      activityState: event.snapshot.activityState,
      activeProjectId,
      isResponding: event.snapshot.isResponding,
      extractedAt: event.snapshot.extractedAt,
    },
    newMessages: event.newMessages,
    removedCount: event.removedCount,
  });

  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

manager.on('change', (event: StateChangeEvent) => {
  if (wsClients.size > 0) {
    broadcastToClients(event);
    log(`State change → ${wsClients.size} client(s), ${event.newMessages.length} new msg(s)`);
  }
});

manager.on('terminal_change', (event: TerminalChangeEvent) => {
  if (wsClients.size === 0) return;
  const payload = JSON.stringify(event);
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
});

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

function requireAuth(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const token = extractToken(req as Parameters<typeof extractToken>[0]);
  if (!token || !verifyToken(token)) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return false;
  }
  return true;
}

/** Kill relay port and respawn — used when supervisor (9799) is not running. */
function scheduleRelaySelfRestart(): void {
  const helper = path.join(__dirname, 'restart-relay-helper.ts');
  const projRoot = path.resolve(__dirname, '..');
  if (process.platform === 'win32') {
    spawn('cmd.exe', ['/c', 'npx', 'tsx', helper, String(PORT)], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      cwd: projRoot,
      env: { ...process.env },
    }).unref();
  } else {
    spawn('npx', ['tsx', helper, String(PORT)], {
      detached: true,
      stdio: 'ignore',
      cwd: projRoot,
      env: { ...process.env },
      shell: true,
    }).unref();
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const method = req.method ?? 'GET';

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  try {
    // ----- GET / (web UI) -----
    if (method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      // Read dynamically to avoid requiring server restart on HTML changes
      const html = fs.readFileSync(path.join(__dirname, 'client.html'), 'utf-8');
      res.end(html);
      return;
    }

    // ----- GET /manifest.json -----
    if (method === 'GET' && url.pathname === '/manifest.json') {
      res.writeHead(200, { 'Content-Type': 'application/manifest+json' });
      res.end(MANIFEST_JSON);
      return;
    }

    // ----- GET static icon assets (png / ico) -----
    if (method === 'GET' && ICON_ROUTES[url.pathname]) {
      const entry = ICON_ROUTES[url.pathname];
      try {
        let buf = ICON_CACHE.get(url.pathname);
        if (!buf) {
          buf = fs.readFileSync(path.join(ASSETS_DIR, entry.file));
          ICON_CACHE.set(url.pathname, buf);
        }
        res.writeHead(200, { 'Content-Type': entry.type, 'Cache-Control': 'public, max-age=86400' });
        res.end(buf);
      } catch {
        res.writeHead(404);
        res.end();
      }
      return;
    }

    // ----- POST /login -----
    if (method === 'POST' && url.pathname === '/login') {
      const raw = await readBody(req);
      let body: { password?: string };
      try {
        body = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      if (!body.password || !checkPassword(body.password)) {
        log('Login failed');
        sendJson(res, 401, { error: 'Wrong password' });
        return;
      }
      const token = createToken();
      log('Login successful');
      sendJson(res, 200, { token });
      return;
    }

    // ----- GET /health (public) -----
    if (method === 'GET' && url.pathname === '/health') {
      const health = await manager.getHealth();
      log(`GET /health → cdp=${health.cdpReachable} ws=${health.wsConnected} composer=${health.composerDetected}`);
      sendJson(res, 200, health);
      return;
    }

    // ----- POST /admin/restart-relay (auth) — same as supervisor /restart-relay when 9799 is off -----
    if (method === 'POST' && url.pathname === '/admin/restart-relay') {
      if (!requireAuth(req, res)) return;
      scheduleRelaySelfRestart();
      log('POST /admin/restart-relay → helper spawned');
      sendJson(res, 200, { ok: true, message: 'Relay restarting...' });
      return;
    }

    // --- Auth required below ---

    // ----- GET /state -----
    if (method === 'GET' && url.pathname === '/state') {
      if (!requireAuth(req, res)) return;

      let snapshot: StateSnapshot | null = manager.getLatestSnapshot();
      if (!snapshot) {
        try {
          snapshot = await manager.extractNow();
        } catch (err) {
          sendJson(res, 503, {
            error: 'Cannot extract state',
            detail: err instanceof Error ? err.message : String(err),
          });
          return;
        }
      }

      const activeProjectId = detectActiveProject(snapshot.state.windowTitle);
      const body = {
        messageCount: snapshot.state.messageCount,
        messages: snapshot.state.messages,
        pendingActions: snapshot.state.pendingActions,
        currentMode: snapshot.state.currentMode,
        currentModel: snapshot.state.currentModel,
        activeChatTitle: snapshot.state.activeChatTitle,
        windowTitle: snapshot.state.windowTitle,
        activityState: snapshot.activityState,
        activeProjectId,
        isResponding: snapshot.isResponding,
        lastHumanIndex: snapshot.lastHumanIndex,
        lastAssistantIndex: snapshot.lastAssistantIndex,
        extractedAt: snapshot.extractedAt,
      };
      log(`GET /state → ${body.messageCount} msgs, responding=${body.isResponding}, project=${activeProjectId}`);
      sendJson(res, 200, body);
      return;
    }

    // ----- GET /terminal -----
    if (method === 'GET' && url.pathname === '/terminal') {
      if (!requireAuth(req, res)) return;

      const terminal = await manager.getTerminalContentWithEnsure();
      log(`GET /terminal → ${terminal.lineCount} lines, available=${terminal.available}`);
      sendJson(res, 200, terminal);
      return;
    }

    // ----- POST /terminal/input -----
    if (method === 'POST' && url.pathname === '/terminal/input') {
      if (!requireAuth(req, res)) return;

      const raw = await readBody(req);
      let body: { text?: string; enter?: boolean };
      try { body = JSON.parse(raw); } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      if (typeof body.text !== 'string') {
        sendJson(res, 400, { error: 'Missing "text" field' });
        return;
      }
      const enter = body.enter === true;
      log(`POST /terminal/input → ${body.text.length} chars, enter=${enter}`);
      const result = await manager.sendTerminalInput(body.text, enter);
      sendJson(res, result.ok ? 200 : 422, result);
      return;
    }

    // ----- POST /terminal/kill -----
    if (method === 'POST' && url.pathname === '/terminal/kill') {
      if (!requireAuth(req, res)) return;

      log('POST /terminal/kill');
      const killResult = await manager.killActiveTerminal();
      sendJson(res, killResult.ok ? 200 : 422, killResult);
      return;
    }

    // ----- POST /terminal/new -----
    if (method === 'POST' && url.pathname === '/terminal/new') {
      if (!requireAuth(req, res)) return;

      log('POST /terminal/new');
      const newResult = await manager.openNewTerminal();
      sendJson(res, newResult.ok ? 200 : 422, newResult);
      return;
    }

    // ----- POST /terminal/select -----
    if (method === 'POST' && url.pathname === '/terminal/select') {
      if (!requireAuth(req, res)) return;

      const raw = await readBody(req);
      let body: { index?: number };
      try { body = JSON.parse(raw); } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      if (typeof body.index !== 'number' || !Number.isFinite(body.index)) {
        sendJson(res, 400, { error: 'Missing numeric "index"' });
        return;
      }
      log(`POST /terminal/select → index=${body.index}`);
      const selResult = await manager.selectTerminalTab(body.index);
      sendJson(res, selResult.ok ? 200 : 422, selResult);
      return;
    }

    // ----- GET /terminal/presets -----
    if (method === 'GET' && url.pathname === '/terminal/presets') {
      if (!requireAuth(req, res)) return;

      try {
        const presetsPath = path.join(__dirname, 'terminal-presets.json');
        const presets = JSON.parse(fs.readFileSync(presetsPath, 'utf-8'));
        sendJson(res, 200, { presets });
      } catch (err) {
        sendJson(res, 200, { presets: [] });
      }
      return;
    }

    // ----- GET /chats -----
    if (method === 'GET' && url.pathname === '/chats') {
      if (!requireAuth(req, res)) return;

      const result = await manager.listChats();
      log(`GET /chats → ${result.chats.length} chat(s), active="${result.activeChatTitle ?? 'unknown'}"`);
      sendJson(res, 200, result);
      return;
    }

    // ----- POST /chat/select -----
    if (method === 'POST' && url.pathname === '/chat/select') {
      if (!requireAuth(req, res)) return;

      const raw = await readBody(req);
      let body: { chatIndex?: number };
      try { body = JSON.parse(raw); } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
      if (typeof body.chatIndex !== 'number') {
        sendJson(res, 400, { error: 'Missing "chatIndex" (number)' });
        return;
      }
      log(`POST /chat/select → index ${body.chatIndex}`);
      const result = await manager.selectChat(body.chatIndex);
      sendJson(res, result.ok ? 200 : 422, result);
      return;
    }

    // ----- POST /chat/new -----
    if (method === 'POST' && url.pathname === '/chat/new') {
      if (!requireAuth(req, res)) return;

      log('POST /chat/new');
      const result = await manager.createNewChat();
      sendJson(res, result.ok ? 200 : 422, result);
      return;
    }

    // ----- POST /chat/load-older — mirror mobile "scroll up" into Cursor's list (virtualization) -----
    if (method === 'POST' && url.pathname === '/chat/load-older') {
      if (!requireAuth(req, res)) return;

      const result = await manager.surfaceOlderChatInComposer();
      log(
        `POST /chat/load-older → ok=${result.ok} ${result.reason ?? ''} atTop=${String(result.atTop)} scrolledBy=${result.scrolledBy ?? '-'} msgs=${result.messageCount ?? '?'}`,
      );
      sendJson(res, 200, result);
      return;
    }

    // ----- POST /send -----
    if (method === 'POST' && url.pathname === '/send') {
      if (!requireAuth(req, res)) return;

      const raw = await readBody(req);
      let body: { prompt?: string; images?: string[] };
      try {
        body = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      if ((!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length === 0) && (!body.images || body.images.length === 0)) {
        sendJson(res, 400, { error: 'Missing or empty "prompt" and "images" field' });
        return;
      }
      const prompt = body.prompt ? body.prompt.trim() : '';
      log(`POST /send → "${prompt.substring(0, 60)}${prompt.length > 60 ? '...' : ''}"`);

      // Inject images if provided
      const imagePaths: string[] = [];
      if (body.images && Array.isArray(body.images) && body.images.length > 0) {
        for (const dataUrl of body.images) {
          let base64 = dataUrl;
          let ext = 'png';
          const match = base64.match(/^data:image\/(\w+);base64,(.+)$/);
          if (match) {
            ext = match[1] === 'jpeg' ? 'jpg' : match[1];
            base64 = match[2];
          }
          let buf: Buffer;
          try {
            buf = Buffer.from(base64, 'base64');
          } catch {
            log('Skipping invalid image base64');
            continue;
          }
          const tmpName = `cursor-remote-${crypto.randomBytes(6).toString('hex')}.${ext}`;
          const tmpPath = path.join(os.tmpdir(), tmpName);
          fs.writeFileSync(tmpPath, buf);
          log(`POST /send → image saved to ${tmpPath}`);
          imagePaths.push(tmpPath);
        }
      }

      const result = await manager.sendPrompt(prompt, imagePaths);
      
      // Cleanup temp images
      for (const tmpPath of imagePaths) {
        setTimeout(() => {
          try { fs.unlinkSync(tmpPath); } catch {}
        }, 30000);
      }
      
      sendJson(res, result.ok ? 200 : 422, result);
      return;
    }

    // ----- POST /stop -----
    if (method === 'POST' && url.pathname === '/stop') {
      if (!requireAuth(req, res)) return;
      log('POST /stop');
      const result = await manager.stopGeneration();
      sendJson(res, result.ok ? 200 : 422, result);
      return;
    }

    // ----- POST /mode -----
    if (method === 'POST' && url.pathname === '/mode') {
      if (!requireAuth(req, res)) return;

      const raw = await readBody(req);
      let body: { mode?: string };
      try {
        body = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      if (!body.mode || !VALID_PUBLIC_MODES.includes(body.mode as typeof VALID_PUBLIC_MODES[number])) {
        sendJson(res, 400, { error: `Invalid mode. Must be one of: ${VALID_PUBLIC_MODES.join(', ')}` });
        return;
      }

      log(`POST /mode → ${body.mode}`);
      const result = await manager.switchMode(body.mode);
      sendJson(res, result.ok ? 200 : 422, result);
      return;
    }

    // ----- GET /models -----
    if (method === 'GET' && url.pathname === '/models') {
      if (!requireAuth(req, res)) return;

      log('GET /models → opening picker to list');
      const result = await manager.listModels();
      sendJson(res, 200, result);
      return;
    }

    // ----- POST /model -----
    if (method === 'POST' && url.pathname === '/model') {
      if (!requireAuth(req, res)) return;

      const raw = await readBody(req);
      let body: { model?: string };
      try {
        body = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      if (!body.model || typeof body.model !== 'string' || body.model.trim().length === 0) {
        sendJson(res, 400, { error: 'Missing or empty "model" field' });
        return;
      }

      log(`POST /model → ${body.model}`);
      const result = await manager.switchModel(body.model.trim());
      sendJson(res, result.ok ? 200 : 422, result);
      return;
    }

    // ----- GET /projects -----
    if (method === 'GET' && url.pathname === '/projects') {
      if (!requireAuth(req, res)) return;

      const projects = loadProjects();
      const snapshot = manager.getLatestSnapshot();
      const title = snapshot?.state?.windowTitle ?? '';
      const activeId = detectActiveProject(title);

      log(`GET /projects → ${projects.length} project(s), active=${activeId ?? 'unknown'}`);
      sendJson(res, 200, { projects, activeId });
      return;
    }

    // ----- POST /project/select -----
    if (method === 'POST' && url.pathname === '/project/select') {
      if (!requireAuth(req, res)) return;

      if (manager.switchingProject) {
        sendJson(res, 409, { ok: false, error: 'Project switch already in progress' });
        return;
      }

      const raw = await readBody(req);
      let body: { projectId?: string };
      try {
        body = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      if (!body.projectId) {
        sendJson(res, 400, { error: 'Missing "projectId" field' });
        return;
      }

      const project = findProject(body.projectId);
      if (!project) {
        sendJson(res, 400, {
          error: `Unknown projectId "${body.projectId}". Use GET /projects for the list.`,
        });
        return;
      }

      log(`POST /project/select → "${project.name}" (${project.path})`);
      const result = await manager.switchProject(project.path, project.id);
      if (result.ok) {
        sendJson(res, 200, { ok: true, projectId: project.id, projectName: project.name });
      } else {
        sendJson(res, 422, { ok: false, error: result.error });
      }
      return;
    }

    // ----- POST /action -----
    if (method === 'POST' && url.pathname === '/action') {
      if (!requireAuth(req, res)) return;

      const raw = await readBody(req);
      let body: { action?: string; targetId?: number; buttonIndex?: number };
      try {
        body = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      const validActions = ['approve', 'reject', 'run', 'skip'];
      if (!body.action || !validActions.includes(body.action)) {
        sendJson(res, 400, { error: `Invalid action. Must be one of: ${validActions.join(', ')}` });
        return;
      }

      log(`POST /action → ${body.action}${body.targetId !== undefined ? ` (fi=${body.targetId}, bi=${body.buttonIndex})` : ''}`);
      const result = await manager.performAction(body.action, body.targetId, body.buttonIndex);
      sendJson(res, result.ok ? 200 : 422, result);
      return;
    }

    // ----- POST /revert -----
    // Initiates a Cursor "Restore Checkpoint" action for a specific human
    // message. This does NOT auto-confirm destructive dialogs. If Cursor prompts
    // for confirmation, the response is status="needs_confirmation" with the
    // dialog text + button labels; the client must issue a second POST
    // /revert/confirm to actually destroy state.
    if (method === 'POST' && url.pathname === '/revert') {
      if (!requireAuth(req, res)) return;

      const raw = await readBody(req);
      let body: { targetId?: number; confirm?: boolean; locatorKind?: string };
      try {
        body = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { ok: false, status: 'failed', error: 'Invalid JSON body' });
        return;
      }

      if (typeof body.targetId !== 'number' || body.targetId < 0) {
        sendJson(res, 400, { ok: false, status: 'failed', error: 'Missing or invalid "targetId" (flatIndex of the human message)' });
        return;
      }

      // The `confirm: true` field is required as a spec gate. It signals the
      // user explicitly asked the PWA to start the revert (i.e. passed through
      // the warning sheet). It does NOT auto-confirm destructive dialogs.
      if (body.confirm !== true) {
        sendJson(res, 400, { ok: false, status: 'failed', error: 'Request must include "confirm: true" to start the revert flow' });
        return;
      }

      const validKinds = ['descendant', 'prev-sibling', 'next-sibling'] as const;
      let locatorKind: 'descendant' | 'prev-sibling' | 'next-sibling' | undefined;
      if (typeof body.locatorKind === 'string' && (validKinds as readonly string[]).includes(body.locatorKind)) {
        locatorKind = body.locatorKind as typeof locatorKind;
      }

      log(`POST /revert → targetId=${body.targetId}${locatorKind ? ` locator=${locatorKind}` : ''}`);
      const result = await manager.revertMessage(body.targetId, locatorKind);

      let code: number;
      if (result.status === 'reverted') code = 200;
      else if (result.status === 'needs_confirmation') code = 202; // Accepted — awaits confirm
      else code = 422;

      sendJson(res, code, result);
      return;
    }

    // ----- POST /revert/confirm -----
    // Destructive: clicks exactly one button inside the currently-open Cursor
    // revert/discard dialog. Must be preceded by a POST /revert that returned
    // status="needs_confirmation". `buttonText` is REQUIRED and must match the
    // button's visible text exactly — no heuristic fallback. If the exact
    // button isn't found, this endpoint fails rather than guessing.
    if (method === 'POST' && url.pathname === '/revert/confirm') {
      if (!requireAuth(req, res)) return;

      const raw = await readBody(req);
      let body: { confirm?: boolean; buttonText?: string };
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        sendJson(res, 400, { ok: false, error: 'Invalid JSON body' });
        return;
      }

      if (body.confirm !== true) {
        sendJson(res, 400, { ok: false, error: 'Request must include "confirm: true" to click the destructive button' });
        return;
      }

      if (typeof body.buttonText !== 'string' || body.buttonText.length === 0 || body.buttonText.length > 120) {
        sendJson(res, 400, {
          ok: false,
          error: '"buttonText" is required (1-120 chars) and must match a button in the open dialog (labels may include shortcuts; server normalizes)',
        });
        return;
      }

      log(`POST /revert/confirm → "${body.buttonText}"`);
      const result = await manager.confirmRevertDialog(body.buttonText);
      sendJson(res, result.ok ? 200 : 422, result);
      return;
    }

    // ----- POST /message/edit -----
    // Opens Cursor's native edit flow on a human composer bubble (may show a
    // branch/continue dialog — then use POST /message/edit/confirm).
    if (method === 'POST' && url.pathname === '/message/edit') {
      if (!requireAuth(req, res)) return;

      const raw = await readBody(req);
      let body: { targetId?: number; confirm?: boolean };
      try {
        body = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { ok: false, status: 'failed', error: 'Invalid JSON body' });
        return;
      }

      if (typeof body.targetId !== 'number' || body.targetId < 0) {
        sendJson(res, 400, { ok: false, status: 'failed', error: 'Missing or invalid "targetId" (flatIndex of the human message)' });
        return;
      }
      if (body.confirm !== true) {
        sendJson(res, 400, { ok: false, status: 'failed', error: 'Request must include "confirm: true"' });
        return;
      }

      log(`POST /message/edit → targetId=${body.targetId}`);
      const result = await manager.editHumanMessage(body.targetId);

      let code: number;
      if (result.status === 'opened') code = 200;
      else if (result.status === 'needs_confirmation') code = 202;
      else code = 422;

      sendJson(res, code, result);
      return;
    }

    // ----- POST /message/edit/confirm -----
    if (method === 'POST' && url.pathname === '/message/edit/confirm') {
      if (!requireAuth(req, res)) return;

      const raw = await readBody(req);
      let body: { confirm?: boolean; buttonText?: string };
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        sendJson(res, 400, { ok: false, error: 'Invalid JSON body' });
        return;
      }

      if (body.confirm !== true) {
        sendJson(res, 400, { ok: false, error: 'Request must include "confirm: true"' });
        return;
      }
      if (typeof body.buttonText !== 'string' || body.buttonText.length === 0 || body.buttonText.length > 120) {
        sendJson(res, 400, {
          ok: false,
          error: '"buttonText" is required (1-120 chars) and must match a visible button in the open dialog',
        });
        return;
      }

      log(`POST /message/edit/confirm → "${body.buttonText}"`);
      const result = await manager.confirmAnyDialogButton(body.buttonText);
      sendJson(res, result.ok ? 200 : 422, result);
      return;
    }

    // ----- POST /message/edit/apply-text -----
    // After Cursor's edit composer is open: push phone textarea content into the
    // same contenteditable and press Enter (unless submit: false).
    if (method === 'POST' && url.pathname === '/message/edit/apply-text') {
      if (!requireAuth(req, res)) return;

      const raw = await readBody(req);
      let body: { text?: string; submit?: boolean; confirm?: boolean; targetId?: number };
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        sendJson(res, 400, { ok: false, error: 'Invalid JSON body' });
        return;
      }

      if (body.confirm !== true) {
        sendJson(res, 400, { ok: false, error: 'Request must include "confirm": true' });
        return;
      }

      const text = typeof body.text === 'string' ? body.text : '';
      if (text.length > 120_000) {
        sendJson(res, 400, { ok: false, error: '"text" exceeds maximum length' });
        return;
      }

      const submit = body.submit !== false;
      const targetFlatIndex =
        typeof body.targetId === 'number' && body.targetId >= 0 ? body.targetId : undefined;
      log(
        `POST /message/edit/apply-text → ${text.length} chars, submit=${submit}, targetId=${targetFlatIndex ?? 'none'}`,
      );
      const result = await manager.applyEditComposerText(text, { submit, targetFlatIndex });
      sendJson(res, result.ok ? 200 : 422, result);
      return;
    }

    // ----- POST /message/edit/poll-dialog -----
    // Backup: Cursor may show the branch/continue modal slightly after apply-text returns.
    if (method === 'POST' && url.pathname === '/message/edit/poll-dialog') {
      if (!requireAuth(req, res)) return;

      const raw = await readBody(req);
      let body: { confirm?: boolean; maxMs?: number };
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        sendJson(res, 400, { ok: false, error: 'Invalid JSON body' });
        return;
      }
      if (body.confirm !== true) {
        sendJson(res, 400, { ok: false, error: 'Request must include "confirm": true' });
        return;
      }
      const maxMs = typeof body.maxMs === 'number' ? body.maxMs : 9000;
      log(`POST /message/edit/poll-dialog maxMs=${maxMs}`);
      const dialog = await manager.pollEditSubmitChoiceDialog(maxMs);
      sendJson(res, 200, { ok: dialog != null, dialog: dialog ?? undefined });
      return;
    }

    // ----- POST /image -----
    if (method === 'POST' && url.pathname === '/image') {
      if (!requireAuth(req, res)) return;

      const raw = await readBody(req);
      let body: { data?: string; filename?: string };
      try {
        body = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      if (!body.data || typeof body.data !== 'string') {
        sendJson(res, 400, { error: 'Missing "data" field (base64 or data URL)' });
        return;
      }

      // Parse data URL or raw base64
      let base64 = body.data;
      let ext = 'png';
      const dataUrlMatch = base64.match(/^data:image\/(\w+);base64,(.+)$/);
      if (dataUrlMatch) {
        ext = dataUrlMatch[1] === 'jpeg' ? 'jpg' : dataUrlMatch[1];
        base64 = dataUrlMatch[2];
      }

      let buf: Buffer;
      try {
        buf = Buffer.from(base64, 'base64');
      } catch {
        sendJson(res, 400, { error: 'Invalid base64 data' });
        return;
      }

      if (buf.length === 0) {
        sendJson(res, 400, { error: 'Empty image data' });
        return;
      }

      const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
      if (buf.length > MAX_SIZE) {
        sendJson(res, 400, { error: `Image too large (${(buf.length / 1024 / 1024).toFixed(1)} MB, max 10 MB)` });
        return;
      }

      // Write to temp file
      const tmpName = `cursor-remote-${crypto.randomBytes(6).toString('hex')}.${ext}`;
      const tmpPath = path.join(os.tmpdir(), tmpName);
      try {
        fs.writeFileSync(tmpPath, buf);
        log(`POST /image → ${tmpName} (${(buf.length / 1024).toFixed(1)} KB)`);

        const result = await manager.injectImage(tmpPath);
        sendJson(res, result.ok ? 200 : 422, result);
      } finally {
        try { fs.unlinkSync(tmpPath); } catch {}
      }
      return;
    }

    // ----- 404 -----
    sendJson(res, 404, {
      error: 'Not found',
      endpoints: ['GET /', 'POST /login', 'GET /health', 'GET /state', 'GET /terminal', 'POST /terminal/input', 'POST /terminal/kill', 'POST /terminal/new', 'POST /terminal/select', 'GET /terminal/presets', 'GET /chats', 'POST /chat/select', 'POST /chat/new', 'POST /send', 'POST /stop', 'POST /mode', 'GET /models', 'POST /model', 'POST /action', 'POST /revert', 'POST /revert/confirm', 'POST /message/edit', 'POST /message/edit/confirm', 'POST /message/edit/apply-text', 'POST /message/edit/poll-dialog', 'POST /image', 'GET /projects', 'POST /project/select', 'WS /ws'],
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Error handling ${method} ${url.pathname}: ${msg}`);
    sendJson(res, 500, { error: msg });
  }
});

// ---------------------------------------------------------------------------
// WebSocket upgrade
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }

  // Auth check for WebSocket
  const token = extractToken(req as Parameters<typeof extractToken>[0]);
  if (!token || !verifyToken(token)) {
    log('WS auth rejected');
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wsClients.add(ws);
    log(`WS client connected (total: ${wsClients.size})`);

    // Send current state immediately on connect
    const snapshot = manager.getLatestSnapshot();
    if (snapshot) {
      const wsActiveProject = detectActiveProject(snapshot.state.windowTitle);
      ws.send(JSON.stringify({
        type: 'initial_state',
        snapshot: {
          messageCount: snapshot.state.messageCount,
          messages: snapshot.state.messages,
          pendingActions: snapshot.state.pendingActions,
          currentMode: snapshot.state.currentMode,
          currentModel: snapshot.state.currentModel,
          activeChatTitle: snapshot.state.activeChatTitle,
          windowTitle: snapshot.state.windowTitle,
          activityState: snapshot.activityState,
          activeProjectId: wsActiveProject,
          isResponding: snapshot.isResponding,
          extractedAt: snapshot.extractedAt,
        },
      }));
    }

    // Send latest terminal state if available
    const termSnap = manager.getLastTerminalSnapshot();
    if (termSnap) {
      ws.send(JSON.stringify({ type: 'terminal_change', terminal: termSnap }));
    }

    ws.on('close', () => {
      wsClients.delete(ws);
      log(`WS client disconnected (total: ${wsClients.size})`);
    });

    ws.on('error', () => {
      wsClients.delete(ws);
    });
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function start(): Promise<void> {
  if (!LAUNCHED_BY_START) {
    console.log('');
    console.log('\x1b[1m=== V2 Cursor Relay Server ===\x1b[0m');
    console.log('');
    const pw = process.env.PASSWORD ?? '(generated at runtime)';
    log(`CDP base: ${CDP_BASE}`);
    log(`Poll interval: ${POLL_MS}ms`);
    log(`Bind: ${BIND_ADDR}:${PORT}`);
    log(`Auth password: \x1b[33m${pw}\x1b[0m`);
    console.log('');
  }

  try {
    await manager.start();
    log('State manager connected to Cursor');
  } catch (err) {
    log(`\x1b[33mWARNING: ${err instanceof Error ? err.message : String(err)}\x1b[0m`);
    log('Server will start anyway — state manager will retry connection on each poll');
  }

  server.listen(PORT, BIND_ADDR, () => {
    log(`\x1b[32mRelay listening on ${BIND_ADDR}:${PORT}\x1b[0m`);
    if (!LAUNCHED_BY_START) {
      console.log('');
      console.log(`  Web UI:  http://localhost:${PORT}`);
      console.log('');
      log('Waiting for requests...');
    }
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  log('Shutting down...');
  manager.stop();
  for (const ws of wsClients) ws.close();
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  manager.stop();
  for (const ws of wsClients) ws.close();
  server.close(() => process.exit(0));
});

start().catch((err) => {
  console.error(`\x1b[31m[X] Fatal: ${err instanceof Error ? err.message : String(err)}\x1b[0m`);
  process.exit(1);
});
