/**
 * V2 Relay Server
 *
 * Minimal local HTTP + WebSocket server that exposes CDP-based Cursor control.
 *
 * Endpoints:
 *   GET  /health  — CDP/Cursor connection status
 *   POST /admin/restart-relay — Auth: respawn relay (when supervisor :9799 not used)
 *   GET  /commands — Available slash commands
 *   GET  /state   — Latest extracted chat state
 *   POST /send    — Inject prompt into Cursor composer
 *   POST /chat/load-older — Scroll Cursor composer up to load virtualized older messages (mobile scroll-back)
 *   WS   /ws      — Real-time state change stream
 *
 * Run:  npx tsx v2/relay-server.ts
 */

import http from 'node:http';
import https from 'node:https';
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
import { buildMcpServerList, type DirInfo, type McpSettings } from './mcp-merge.js';
import webpush from 'web-push';

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
  description: 'Mobile interface for Cursor IDE',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#0d1117',
  theme_color: '#0d1117',
  icons: [
    { src: '/icon-16.png', sizes: '16x16', type: 'image/png' },
    { src: '/icon-32.png', sizes: '32x32', type: 'image/png' },
    { src: '/icon-48.png', sizes: '48x48', type: 'image/png' },
    { src: '/icon-64.png', sizes: '64x64', type: 'image/png' },
    { src: '/icon-96.png', sizes: '96x96', type: 'image/png' },
    { src: '/icon-128.png', sizes: '128x128', type: 'image/png' },
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: '/icon-256.png', sizes: '256x256', type: 'image/png' },
    { src: '/icon-384.png', sizes: '384x384', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
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
const BIND_ADDR = process.env.BIND_ADDR ?? '0.0.0.0'; // Changed to allow external access for PWA
const USE_HTTPS = process.env.USE_HTTPS === 'true';
const LAUNCHED_BY_START = process.env._V2_LAUNCHED === '1';

// ---------------------------------------------------------------------------
// Web Push Configuration
// ---------------------------------------------------------------------------

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:cursorbeam@example.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  log('Web Push configured with VAPID keys');
} else {
  log('Warning: VAPID keys not configured - push notifications disabled');
}

// Store push subscriptions (in production, use database)
const pushSubscriptions = new Map<string, any>();

// Track previous activity state for push notifications
let previousActivityState = 'idle';
let respondingStartTime = 0;

async function sendPushNotification(title: string, body: string): Promise<void> {
  if (pushSubscriptions.size === 0) {
    log('[Push] No subscriptions to send to');
    return;
  }
  
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    log('[Push] VAPID not configured');
    return;
  }
  
  const payload = JSON.stringify({ title, body });
  log(`[Push] Sending to ${pushSubscriptions.size} subscription(s): "${title}"`);
  
  const promises: Promise<any>[] = [];
  const toDelete: string[] = [];
  
  for (const [endpoint, subscription] of pushSubscriptions.entries()) {
    const promise = webpush.sendNotification(subscription, payload)
      .catch((err: any) => {
        log(`[Push] Failed to send to ${endpoint.substring(0, 50)}...: ${err.message}`);
        // If subscription is no longer valid (410 Gone or 404), remove it
        if (err.statusCode === 410 || err.statusCode === 404) {
          toDelete.push(endpoint);
        }
      });
    promises.push(promise);
  }
  
  await Promise.all(promises);
  
  // Clean up invalid subscriptions
  for (const endpoint of toDelete) {
    pushSubscriptions.delete(endpoint);
    log(`[Push] Removed invalid subscription: ${endpoint.substring(0, 50)}...`);
  }
  
  log(`[Push] Sent successfully. Remaining subscriptions: ${pushSubscriptions.size}`);
}

// ---------------------------------------------------------------------------
// HTTPS Self-Signed Certificate
// ---------------------------------------------------------------------------

function getOrCreateSelfSignedCert(): { key: string; cert: string } {
  const certDir = path.join(os.homedir(), '.cursor-mobile-certs');
  const keyPath = path.join(certDir, 'server.key');
  const certPath = path.join(certDir, 'server.cert');
  
  // Return existing cert if found
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath, 'utf-8'),
      cert: fs.readFileSync(certPath, 'utf-8')
    };
  }
  
  // Certificate not found - provide clear instructions
  console.error('\n\x1b[31m❌ HTTPS Certificate Not Found\x1b[0m');
  console.error('\nFor microphone support in PWA, HTTPS is required.');
  console.error('A self-signed certificate must be generated.\n');
  console.error('\x1b[33mOption 1 - PowerShell (Recommended):\x1b[0m');
  console.error(`  powershell -ExecutionPolicy Bypass -File scripts\\generate-cert.ps1\n`);
  console.error('\x1b[33mOption 2 - OpenSSL:\x1b[0m');
  console.error(`  openssl req -x509 -newkey rsa:2048 -nodes -days 365 \\`);
  console.error(`    -keyout "${keyPath}" \\`);
  console.error(`    -out "${certPath}" \\`);
  console.error(`    -subj "/CN=localhost"\n`);
  console.error('\x1b[33mOption 3 - Use mkcert (trusted cert):\x1b[0m');
  console.error(`  mkcert -install`);
  console.error(`  mkcert -key-file "${keyPath}" -cert-file "${certPath}" localhost 127.0.0.1 ::1\n`);
  console.error('After generating certificate, restart the server.\n');
  
  throw new Error('HTTPS certificate required but not found');
}

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
  const currentActivityState = event.snapshot.activityState;
  
  // Check if Cursor finished responding (for push notifications)
  if (previousActivityState === 'responding' && currentActivityState !== 'responding') {
    const duration = Date.now() - respondingStartTime;
    log(`[Push] 🔔 Cursor finished responding (duration: ${duration}ms)`);
    log(`[Push] 🔔 Subscriptions: ${pushSubscriptions.size}`);
    
    // Only send notification if was responding for at least 2 seconds
    if (duration >= 2000) {
      log('[Push] 🔔 Duration >= 2s, sending push notification...');
      sendPushNotification('Cursor Finished', 'Response complete').catch((err) => {
        log(`[Push] ❌ Error: ${err.message}`);
      });
    } else {
      log(`[Push] ⏸️ Duration < 2s, skipping notification`);
    }
  }
  
  // Track state changes
  if (currentActivityState === 'responding' && previousActivityState !== 'responding') {
    respondingStartTime = Date.now();
    log('[Push] 🚀 Cursor started responding');
  }
  previousActivityState = currentActivityState;
  
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

// Create HTTP or HTTPS server based on config
const requestHandler = async (req: http.IncomingMessage, res: http.ServerResponse) => {
  const protocol = USE_HTTPS ? 'https' : 'http';
  const url = new URL(req.url ?? '/', `${protocol}://localhost:${PORT}`);
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
      res.writeHead(200, { 
        'Content-Type': 'text/html; charset=utf-8',
        'Permissions-Policy': 'microphone=(self)',
        'Feature-Policy': 'microphone \'self\''
      });
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

    // ----- GET /sw.js (Service Worker) -----
    if (method === 'GET' && url.pathname === '/sw.js') {
      res.writeHead(200, { 
        'Content-Type': 'application/javascript',
        'Service-Worker-Allowed': '/'
      });
      const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf-8');
      res.end(sw);
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

    // ----- GET /commands -----
    if (method === 'GET' && url.pathname === '/commands') {
      if (!requireAuth(req, res)) return;

      const commands: Array<{ name: string; description: string }> = [];
      
      // Add built-in Cursor commands (not from skills)
      const builtInCommands = [
        { name: 'clear', description: 'Clear the current chat conversation' },
        { name: 'fix', description: 'Fix the selected code or error' },
        { name: 'explain', description: 'Explain the selected code' },
        { name: 'optimize', description: 'Optimize the selected code' },
        { name: 'test', description: 'Generate tests for the selected code' },
        { name: 'docs', description: 'Generate documentation for the selected code' },
        { name: 'refactor', description: 'Refactor the selected code' },
        { name: 'debug', description: 'Help debug the selected code' },
        { name: 'review', description: 'Review the selected code' },
        { name: 'commit', description: 'Generate a commit message' },
      ];
      commands.push(...builtInCommands);
      
      // Read skills from Claude, Cursor, and plugins
      const userHome = os.homedir();
      const skillsDirs = [
        path.join(userHome, '.claude', 'skills'),         // Claude skills
        path.join(userHome, '.cursor', 'skills'),         // User Cursor skills
        path.join(userHome, '.cursor', 'skills-cursor'),  // Built-in Cursor skills
      ];
      
      // Add plugin skills (scan recursively)
      const pluginsCache = path.join(userHome, '.cursor', 'plugins', 'cache', 'cursor-public');
      if (fs.existsSync(pluginsCache)) {
        try {
          const scanPlugins = (dir: string) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                if (entry.name === 'skills') {
                  skillsDirs.push(fullPath);
                } else {
                  scanPlugins(fullPath);
                }
              }
            }
          };
          scanPlugins(pluginsCache);
        } catch (err) {
          log(`Failed to scan plugins: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      for (const skillsDir of skillsDirs) {
        if (!fs.existsSync(skillsDir)) {
          log(`Skills dir not found: ${skillsDir}`);
          continue;
        }
        
        try {
          const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
          log(`Reading skills from ${skillsDir}: ${entries.length} entries`);
          
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            
            const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
            if (!fs.existsSync(skillFile)) {
              log(`  Skipping ${entry.name} (no SKILL.md)`);
              continue;
            }
            
            try {
              const content = fs.readFileSync(skillFile, 'utf-8');
              
              // Parse YAML front matter (more flexible regex)
              const frontMatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
              if (frontMatterMatch) {
                const frontMatter = frontMatterMatch[1];
                
                // Extract name
                const nameMatch = frontMatter.match(/^name:\s*(.+?)$/m);
                
                // Extract description (support multi-line with >- or >)
                let description = '';
                
                // Check if description uses multi-line YAML (> or >-)
                const multiLineMatch = frontMatter.match(/^description:\s*>-?\s*\r?\n([\s\S]*?)(?=\r?\n[a-z_]+:\s|$)/mi);
                if (multiLineMatch) {
                  description = multiLineMatch[1]
                    .split(/\r?\n/)
                    .map(line => line.trim())
                    .filter(line => line.length > 0 && !line.startsWith('---'))
                    .join(' ')
                    .substring(0, 200);
                } else {
                  // Try single-line description
                  const singleLineMatch = frontMatter.match(/^description:\s*(.+?)$/m);
                  if (singleLineMatch) {
                    description = singleLineMatch[1].trim().substring(0, 200);
                  }
                }
                
                if (nameMatch) {
                  const name = nameMatch[1].trim();
                  commands.push({ name, description });
                  log(`  ✓ ${name}`);
                } else {
                  log(`  ✗ ${entry.name} (no name field)`);
                }
              } else {
                log(`  ✗ ${entry.name} (no front matter)`);
              }
            } catch (err) {
              log(`  ✗ ${entry.name} (read error: ${err instanceof Error ? err.message : String(err)})`);
            }
          }
        } catch (err) {
          log(`Failed to read skills dir ${skillsDir}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Remove duplicates (in case same skill appears in multiple dirs)
      const uniqueCommands: Array<{ name: string; description: string }> = [];
      const seen = new Set<string>();
      for (const cmd of commands) {
        if (!seen.has(cmd.name)) {
          seen.add(cmd.name);
          uniqueCommands.push(cmd);
        }
      }

      // Sort alphabetically
      uniqueCommands.sort((a, b) => a.name.localeCompare(b.name));

      log(`GET /commands → ${uniqueCommands.length} unique commands (from ${commands.length} total)`);
      log(`Command names: ${uniqueCommands.map(c => c.name).join(', ')}`);
      sendJson(res, 200, { commands: uniqueCommands });
      return;
    }

    // ----- GET /vapid-public-key -----
    if (method === 'GET' && url.pathname === '/vapid-public-key') {
      if (!requireAuth(req, res)) return;
      
      if (!VAPID_PUBLIC_KEY) {
        sendJson(res, 500, { error: 'VAPID not configured' });
        return;
      }
      
      log('GET /vapid-public-key');
      sendJson(res, 200, { publicKey: VAPID_PUBLIC_KEY });
      return;
    }

    // ----- POST /push-subscribe -----
    if (method === 'POST' && url.pathname === '/push-subscribe') {
      if (!requireAuth(req, res)) return;
      
      const body = await readBody(req);
      let subscription: any;
      try {
        subscription = JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON' });
        return;
      }
      
      // Store subscription (use endpoint as unique key)
      const endpoint = subscription.endpoint;
      if (endpoint) {
        pushSubscriptions.set(endpoint, subscription);
        log(`POST /push-subscribe → Saved subscription (total: ${pushSubscriptions.size})`);
        log(`[Push] 🔔 Endpoint: ${endpoint.substring(0, 60)}...`);
        sendJson(res, 200, { ok: true, message: 'Subscription saved', total: pushSubscriptions.size });
      } else {
        sendJson(res, 400, { error: 'Invalid subscription' });
      }
      return;
    }

    // ----- GET /push-status -----
    if (method === 'GET' && url.pathname === '/push-status') {
      if (!requireAuth(req, res)) return;

      log(`GET /push-status → ${pushSubscriptions.size} subscription(s)`);
      sendJson(res, 200, {
        subscriptions: pushSubscriptions.size,
        vapidConfigured: !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)
      });
      return;
    }

    // ----- POST /push-test -----
    if (method === 'POST' && url.pathname === '/push-test') {
      if (!requireAuth(req, res)) return;

      log('[Push] 🧪 Manual test requested');
      
      if (pushSubscriptions.size === 0) {
        sendJson(res, 400, { error: 'No subscriptions available' });
        return;
      }

      sendPushNotification('🧪 Test Notification', 'This is a manual test from the server!')
        .then(() => {
          sendJson(res, 200, { ok: true, message: `Sent to ${pushSubscriptions.size} subscription(s)` });
        })
        .catch((err) => {
          sendJson(res, 500, { error: err.message });
        });
      return;
    }

    // ----- GET /mcp-servers -----
    if (method === 'GET' && url.pathname === '/mcp-servers') {
      if (!requireAuth(req, res)) return;

      // Read MCP servers config from Cursor settings.
      const cursorSettingsPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Cursor', 'User', 'settings.json');
      let mcpSettings: McpSettings = {};
      if (fs.existsSync(cursorSettingsPath)) {
        try {
          const settingsContent = fs.readFileSync(cursorSettingsPath, 'utf-8');
          const cleanContent = settingsContent.replace(/,(\s*[}\]])/g, '$1');
          const settings = JSON.parse(cleanContent);
          mcpSettings = (settings['mcpServers'] || settings['mcp.servers'] || {}) as McpSettings;
          log(`Found ${Object.keys(mcpSettings).length} MCP server settings: ${Object.keys(mcpSettings).join(', ')}`);
        } catch (err) {
          log(`Failed to read Cursor settings: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Scan the per-workspace mcps folder into DirInfo records (no merging here
      // — that's done by buildMcpServerList so the rules stay unit-testable).
      const workspaceName = 'c-Users-Noam-Music-cursor-mobile';
      const mcpsPath = path.join(os.homedir(), '.cursor', 'projects', workspaceName, 'mcps');
      const dirs: DirInfo[] = [];

      if (fs.existsSync(mcpsPath)) {
        try {
          const entries = fs.readdirSync(mcpsPath, { withFileTypes: true });
          const dirNames = entries.filter(e => e.isDirectory()).map(e => e.name);
          log(`Found ${dirNames.length} MCP directories: ${dirNames.join(', ')}`);

          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            try {
              const serverPath = path.join(mcpsPath, entry.name);
              const toolsDir = path.join(serverPath, 'tools');
              const resourcesDir = path.join(serverPath, 'resources');
              const promptsDir = path.join(serverPath, 'prompts');
              const errorFile = path.join(serverPath, 'error.txt');
              const serverInfoFile = path.join(serverPath, 'server-info.json');

              let toolsCount = 0, resourcesCount = 0, promptsCount = 0;
              let needsAuth = false, hasError = false, errorMessage = '';

              if (fs.existsSync(errorFile)) {
                hasError = true;
                try { errorMessage = fs.readFileSync(errorFile, 'utf-8').trim(); }
                catch { errorMessage = 'Unknown error'; }
              } else if (fs.existsSync(serverInfoFile)) {
                try {
                  const serverInfo = JSON.parse(fs.readFileSync(serverInfoFile, 'utf-8'));
                  if (serverInfo.error || serverInfo.status === 'error') {
                    hasError = true;
                    errorMessage = serverInfo.error || serverInfo.errorMessage || 'Show Output';
                  }
                } catch { /* ignore parse errors */ }
              }

              if (fs.existsSync(toolsDir)) {
                try {
                  const toolFiles = fs.readdirSync(toolsDir, { withFileTypes: true });
                  toolsCount = toolFiles.filter(f => f.isFile() && f.name.endsWith('.json')).length;
                  if (toolFiles.some(f => f.name === 'mcp_auth.json')) needsAuth = true;
                } catch { /* ignore */ }
              }
              if (fs.existsSync(resourcesDir)) {
                try {
                  const resourceFiles = fs.readdirSync(resourcesDir, { withFileTypes: true });
                  resourcesCount = resourceFiles.filter(f => f.isFile() && f.name.endsWith('.json')).length;
                } catch { /* ignore */ }
              }
              if (fs.existsSync(promptsDir)) {
                try {
                  const promptFiles = fs.readdirSync(promptsDir, { withFileTypes: true });
                  promptsCount = promptFiles.filter(f => f.isFile() && f.name.endsWith('.json')).length;
                } catch { /* ignore */ }
              }

              dirs.push({ name: entry.name, toolsCount, resourcesCount, promptsCount, needsAuth, hasError, errorMessage });
              log(`  ${entry.name}: tools=${toolsCount}, resources=${resourcesCount}, prompts=${promptsCount}, hasError=${hasError}`);
            } catch (entryErr) {
              log(`  ⚠ ${entry.name}: failed to scan - ${entryErr instanceof Error ? entryErr.message : String(entryErr)}`);
              dirs.push({ name: entry.name, toolsCount: 0, resourcesCount: 0, promptsCount: 0, needsAuth: false, hasError: true, errorMessage: 'Failed to read server info' });
            }
          }
        } catch (err) {
          log(`Failed to read MCP servers: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Optionally fetch Cursor's UI state — that's the source of truth for
      // the on/off flag (settings.json lags or is missing for plugin-*).
      let uiServers: Array<{ name: string; enabled: boolean }> | undefined;
      const skipUiQuery = url.searchParams.get('skipUi') === '1';
      if (!skipUiQuery) {
        try {
          const uiState = await manager.getMcpServersStateFromUI();
          uiServers = uiState.servers;
          log(`UI state: ${uiServers.length} servers — ${uiServers.map(s => `${s.name}=${s.enabled}`).join(', ')}`);
        } catch (uiErr) {
          log(`Could not read UI state: ${uiErr instanceof Error ? uiErr.message : String(uiErr)}`);
        }
      }

      const mcpServers = buildMcpServerList(dirs, mcpSettings, uiServers);
      log(`GET /mcp-servers → ${mcpServers.length} servers`);
      sendJson(res, 200, { servers: mcpServers });
      return;
    }

    // ----- GET /mcp-servers/ui-state -----
    if (method === 'GET' && url.pathname === '/mcp-servers/ui-state') {
      if (!requireAuth(req, res)) return;

      try {
        log('Reading MCP servers state from Cursor UI...');
        const uiState = await manager.getMcpServersStateFromUI();
        log(`Got ${uiState.servers.length} servers from UI: ${uiState.servers.map(s => `${s.name}=${s.enabled}`).join(', ')}`);
        sendJson(res, 200, uiState);
        return;
      } catch (err) {
        log(`Failed to read UI state: ${err instanceof Error ? err.message : String(err)}`);
        sendJson(res, 500, { error: 'Failed to read UI state', servers: [] });
        return;
      }
    }

    // ----- POST /mcp-servers/toggle -----
    if (method === 'POST' && url.pathname === '/mcp-servers/toggle') {
      if (!requireAuth(req, res)) return;

      const body = await readBody(req);
      const { serverName, enabled } = JSON.parse(body);

      // Extract base name (remove prefix)
      const baseName = serverName.replace(/^(user-|plugin-|cursor-ide-)/, '');
      
      // Try to toggle via Cursor UI (like we send messages)
      try {
        log(`Toggling ${baseName} → ${enabled} via Cursor UI`);
        const toggleResult = await manager.toggleMcpServer(baseName, enabled);
        
        if (toggleResult.ok) {
          log(`✓ Successfully toggled ${baseName} in Cursor UI (${(toggleResult as any).alreadySet ? 'already set' : 'clicked'})`);
          sendJson(res, 200, { 
            success: true, 
            serverName: baseName, 
            enabled,
            method: 'cursor-ui'
          });
          return;
        } else {
          const totalContainers = (toggleResult as any).totalContainers || 0;
          log(`✗ Failed to toggle in UI: ${toggleResult.error} (found ${totalContainers} containers)`);
          log(`   Will save to settings.json instead - requires Cursor reload`);
        }
      } catch (e) {
        log(`UI toggle error: ${e instanceof Error ? e.message : String(e)}, falling back to settings file`);
      }
      
      log(`Saving ${baseName} → ${enabled} to settings.json (fallback)`);

      // Read current Cursor settings
      const cursorSettingsPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Cursor', 'User', 'settings.json');
      
      try {
        // Read Cursor workspace settings (where MCP config is stored per-workspace)
        const workspaceName = 'c-Users-Noam-Music-cursor-mobile';
        const workspaceSettingsPath = path.join(os.homedir(), '.cursor', 'projects', workspaceName, 'settings.json');
        
        let workspaceSettings: any = {};
        if (fs.existsSync(workspaceSettingsPath)) {
          try {
            const content = fs.readFileSync(workspaceSettingsPath, 'utf-8');
            const cleanContent = content.replace(/,(\s*[}\]])/g, '$1');
            workspaceSettings = JSON.parse(cleanContent);
          } catch (e) {
            log(`Failed to parse workspace settings: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        // Also update global settings.json for consistency
        let globalSettings: any = {};
        if (fs.existsSync(cursorSettingsPath)) {
          const settingsContent = fs.readFileSync(cursorSettingsPath, 'utf-8');
          const cleanContent = settingsContent.replace(/,(\s*[}\]])/g, '$1');
          globalSettings = JSON.parse(cleanContent);
        }

        // Update both locations with the MCP server enabled status
        if (!globalSettings.mcpServers) {
          globalSettings.mcpServers = {};
        }
        if (!globalSettings.mcpServers[baseName]) {
          globalSettings.mcpServers[baseName] = {};
        }
        globalSettings.mcpServers[baseName].enabled = enabled;
        
        if (!workspaceSettings.mcpServers) {
          workspaceSettings.mcpServers = {};
        }
        if (!workspaceSettings.mcpServers[baseName]) {
          workspaceSettings.mcpServers[baseName] = {};
        }
        workspaceSettings.mcpServers[baseName].enabled = enabled;

        // Write both files
        fs.writeFileSync(cursorSettingsPath, JSON.stringify(globalSettings, null, 2), 'utf-8');
        
        // Create workspace settings dir if needed
        const workspaceSettingsDir = path.dirname(workspaceSettingsPath);
        if (!fs.existsSync(workspaceSettingsDir)) {
          fs.mkdirSync(workspaceSettingsDir, { recursive: true });
        }
        fs.writeFileSync(workspaceSettingsPath, JSON.stringify(workspaceSettings, null, 2), 'utf-8');

        log(`POST /mcp-servers/toggle → ${baseName} = ${enabled} (saved to settings)`);
        sendJson(res, 200, { 
          success: true, 
          serverName: baseName, 
          enabled,
          method: 'settings-file',
          note: 'Settings saved. Toggle may not work in real-time - Cursor controls this internally.'
        });
      } catch (err) {
        log(`Failed to update MCP server settings: ${err instanceof Error ? err.message : String(err)}`);
        sendJson(res, 500, { error: 'Failed to update settings', detail: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

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
      let body: { action?: string; targetId?: number; buttonIndex?: number; searchTerm?: string };
      try {
        body = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      // Handle openSettings action
      if (body.action === 'openSettings') {
        try {
          const searchTerm = body.searchTerm || '';
          const result = await manager.openSettings(searchTerm);
          sendJson(res, result.ok ? 200 : 422, result);
          return;
        } catch (err) {
          sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
          return;
        }
      }

      const validActions = ['approve', 'reject', 'run', 'skip'];
      if (!body.action || !validActions.includes(body.action)) {
        sendJson(res, 400, { error: `Invalid action. Must be one of: ${validActions.join(', ')}, openSettings` });
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
      endpoints: ['GET /', 'POST /login', 'GET /health', 'GET /commands', 'GET /vapid-public-key', 'POST /push-subscribe', 'GET /mcp-servers', 'GET /mcp-servers/ui-state', 'POST /mcp-servers/toggle', 'GET /state', 'GET /terminal', 'POST /terminal/input', 'POST /terminal/kill', 'POST /terminal/new', 'POST /terminal/select', 'GET /terminal/presets', 'GET /chats', 'POST /chat/select', 'POST /chat/new', 'POST /send', 'POST /stop', 'POST /mode', 'GET /models', 'POST /model', 'POST /action', 'POST /revert', 'POST /revert/confirm', 'POST /message/edit', 'POST /message/edit/confirm', 'POST /message/edit/apply-text', 'POST /message/edit/poll-dialog', 'POST /image', 'GET /projects', 'POST /project/select', 'WS /ws'],
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Error handling ${method} ${url.pathname}: ${msg}`);
    sendJson(res, 500, { error: msg });
  }
};

// Create HTTP or HTTPS server
let server: http.Server | https.Server;
if (USE_HTTPS) {
  try {
    const { key, cert } = getOrCreateSelfSignedCert();
    server = https.createServer({ key, cert }, requestHandler);
    log('HTTPS mode enabled');
  } catch (err) {
    console.error('\n\x1b[31mHTTPS setup failed. Falling back to HTTP.\x1b[0m');
    console.error('\x1b[33m⚠️  WARNING: Microphone will NOT work without HTTPS in PWA!\x1b[0m\n');
    server = http.createServer(requestHandler);
  }
} else {
  server = http.createServer(requestHandler);
}

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
    const protocol = USE_HTTPS ? 'https' : 'http';
    log(`\x1b[32mRelay listening on ${BIND_ADDR}:${PORT} (${protocol.toUpperCase()})\x1b[0m`);
    if (!LAUNCHED_BY_START) {
      console.log('');
      console.log(`  Web UI:  ${protocol}://localhost:${PORT}`);
      if (USE_HTTPS) {
        console.log('');
        console.log('\x1b[33m  ⚠️  Using self-signed certificate - accept security warning in browser\x1b[0m');
        
        // Show local network IPs for mobile access
        const interfaces = os.networkInterfaces();
        const localIPs: string[] = [];
        for (const name of Object.keys(interfaces)) {
          const netInterface = interfaces[name];
          if (netInterface) {
            for (const iface of netInterface) {
              if (iface.family === 'IPv4' && !iface.internal) {
                localIPs.push(iface.address);
              }
            }
          }
        }
        
        if (localIPs.length > 0) {
          console.log('\x1b[36m  📱 Mobile PWA access:\x1b[0m');
          localIPs.forEach((ip) => {
            console.log(`     ${protocol}://${ip}:${PORT}`);
          });
        }
      } else {
        console.log('');
        console.log('\x1b[33m  ⚠️  WARNING: Microphone requires HTTPS for PWA\x1b[0m');
        console.log('\x1b[33m     Set USE_HTTPS=true in .env to enable voice input\x1b[0m');
      }
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
