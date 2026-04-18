/**
 * One-click launcher for Cursor Remote.
 *
 * 1. Ensures a secure password exists
 * 2. Resolves network addresses (LAN, Tailscale)
 * 3. Kills stale Cursor if needed, launches with CDP
 * 4. Waits until CDP is reachable and workbench is found
 * 5. Starts the relay server
 * 6. Prints access URLs and auth info
 *
 * Run:  npx tsx v2/start.ts
 */

import { execSync, spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env from project root if present
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
try {
  const dotenv = await import('dotenv');
  dotenv.config({ path: path.join(projectRoot, '.env') });
} catch {
  // dotenv not critical
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CDP_PORT = parseInt(process.env.V2_CDP_PORT ?? '9222', 10);
const RELAY_PORT = parseInt(process.env.V2_PORT ?? '9800', 10);
const CDP_BASE = `http://127.0.0.1:${CDP_PORT}`;
const MAX_CDP_WAIT_MS = 60_000;
const CURSOR_EXE = process.env.V2_CURSOR_EXE
  ?? `${process.env.LOCALAPPDATA}\\Programs\\cursor\\Cursor.exe`;

// ---------------------------------------------------------------------------
// Terminal output helpers
// ---------------------------------------------------------------------------

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', magenta: '\x1b[35m', white: '\x1b[37m',
};

function banner(): void {
  console.log('');
  console.log(`${C.bold}${C.cyan}  ╔══════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}  ║         Cursor Remote  ·  v2            ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}  ║         Private PWA Launcher            ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}  ╚══════════════════════════════════════════╝${C.reset}`);
  console.log('');
}

function section(title: string): void {
  console.log(`\n  ${C.bold}${C.white}${title}${C.reset}`);
  console.log(`  ${C.dim}${'─'.repeat(40)}${C.reset}`);
}

function ok(msg: string): void { console.log(`  ${C.green}✓${C.reset}  ${msg}`); }
function warn(msg: string): void { console.log(`  ${C.yellow}!${C.reset}  ${C.yellow}${msg}${C.reset}`); }
function fail(msg: string): void { console.log(`  ${C.red}✗${C.reset}  ${C.red}${msg}${C.reset}`); }
function info(msg: string): void { console.log(`  ${C.dim}·  ${msg}${C.reset}`); }

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Network resolution
// ---------------------------------------------------------------------------

interface NetworkInfo {
  lanIps: string[];
  tailscaleIp: string | null;
  tailscaleName: string | null;
}

function getNetworkInfo(): NetworkInfo {
  const result: NetworkInfo = { lanIps: [], tailscaleIp: null, tailscaleName: null };

  const ifaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (name.toLowerCase().includes('tailscale') || a.address.startsWith('100.')) {
        result.tailscaleIp = a.address;
      } else {
        result.lanIps.push(a.address);
      }
    }
  }

  if (result.tailscaleIp) {
    try {
      const out = execSync('tailscale status --self --json', {
        encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
      });
      const parsed = JSON.parse(out);
      if (parsed.Self?.DNSName) {
        result.tailscaleName = parsed.Self.DNSName.replace(/\.$/, '');
      }
    } catch {
      // Tailscale CLI unavailable
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

function ensurePassword(): string {
  let pw = process.env.V2_PASSWORD;
  if (pw && pw.length > 0 && pw !== 'cursor') return pw;
  pw = crypto.randomBytes(4).toString('hex');
  process.env.V2_PASSWORD = pw;
  return pw;
}

// ---------------------------------------------------------------------------
// Bind address
// ---------------------------------------------------------------------------

function resolveBindAddress(): { addr: string; mode: 'localhost' | 'lan' | 'explicit' } {
  const explicit = process.env.V2_BIND;
  if (explicit) return { addr: explicit, mode: 'explicit' };

  if (process.env.V2_LAN === '1') return { addr: '0.0.0.0', mode: 'lan' };

  return { addr: '127.0.0.1', mode: 'localhost' };
}

// ---------------------------------------------------------------------------
// Cursor + CDP
// ---------------------------------------------------------------------------

async function isCdpReachable(): Promise<boolean> {
  try {
    const r = await fetch(`${CDP_BASE}/json`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function ensureCursorWithCdp(): Promise<void> {
  if (await isCdpReachable()) {
    ok(`CDP already reachable on port ${CDP_PORT}`);
    return;
  }

  // Check if Cursor is running without CDP
  try {
    const ps = execSync('tasklist /FI "IMAGENAME eq Cursor.exe" /FO CSV /NH', {
      encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (ps.includes('Cursor.exe')) {
      warn('Cursor is running but CDP is not active — restarting with CDP...');
      try {
        execSync('taskkill /IM Cursor.exe /F', { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch { /* might already be closing */ }
      info('Waiting for Cursor processes to exit...');
      await sleep(4000);
    }
  } catch {
    // tasklist failed, probably no Cursor running
  }

  info(`Starting Cursor with --remote-debugging-port=${CDP_PORT}`);

  const child: ChildProcess = spawn(`"${CURSOR_EXE}"`, [`--remote-debugging-port=${CDP_PORT}`], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    shell: true,
  });
  child.on('error', (err) => {
    fail(`Failed to start Cursor: ${err.message}`);
    console.log(`\n  ${C.dim}Check that Cursor is installed at:${C.reset}`);
    console.log(`  ${C.dim}  ${CURSOR_EXE}${C.reset}`);
    console.log(`  ${C.dim}Or set V2_CURSOR_EXE to the correct path.${C.reset}\n`);
    process.exit(1);
  });
  child.unref();

  const deadline = Date.now() + MAX_CDP_WAIT_MS;
  let reached = false;
  let processConfirmed = false;
  while (Date.now() < deadline) {
    await sleep(2000);

    // Verify Cursor process exists (first few iterations)
    if (!processConfirmed) {
      try {
        const check = execSync('tasklist /FI "IMAGENAME eq Cursor.exe" /FO CSV /NH', {
          encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
        });
        if (check.includes('Cursor.exe')) processConfirmed = true;
      } catch {}
    }

    if (await isCdpReachable()) {
      reached = true;
      break;
    }
    const left = Math.round((deadline - Date.now()) / 1000);
    const status = processConfirmed ? 'Cursor running, waiting for CDP...' : 'Waiting for Cursor to start...';
    process.stdout.write(`\r  ${C.dim}·  ${status} (${left}s remaining)${C.reset}    `);
  }
  process.stdout.write('\r' + ' '.repeat(80) + '\r');

  if (!reached) {
    fail(`Cursor did not expose CDP on port ${CDP_PORT} within ${MAX_CDP_WAIT_MS / 1000}s`);
    if (!processConfirmed) {
      console.log(`\n  ${C.red}Cursor process not found — it may have failed to start.${C.reset}`);
      console.log(`  ${C.dim}Check that Cursor is installed at:${C.reset}`);
      console.log(`  ${C.dim}  ${CURSOR_EXE}${C.reset}\n`);
    } else {
      console.log(`\n  ${C.yellow}Cursor is running but CDP port ${CDP_PORT} is not reachable.${C.reset}`);
      console.log(`  ${C.dim}This can happen after a force-kill if Cursor is restoring state.${C.reset}`);
      console.log(`  ${C.dim}Try running again, or launch manually:${C.reset}`);
      console.log(`  ${C.dim}  "${CURSOR_EXE}" --remote-debugging-port=${CDP_PORT}${C.reset}\n`);
    }
    process.exit(1);
  }

  ok(`Cursor started with CDP on port ${CDP_PORT}`);
}

async function verifyWorkbench(): Promise<string | null> {
  try {
    const r = await fetch(`${CDP_BASE}/json`, { signal: AbortSignal.timeout(3000) });
    const targets = (await r.json()) as { type: string; title: string; url: string }[];
    const wb = targets.find((t) => t.type === 'page' && t.url.includes('workbench'));
    if (wb) {
      ok(`Workbench found: "${wb.title}"`);
      return wb.title;
    }
    warn('No workbench target yet — Cursor may still be loading');
    return null;
  } catch {
    warn('Could not verify workbench target');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  banner();

  // ── Password ──
  const password = ensurePassword();

  // ── Network ──
  const net = getNetworkInfo();
  const bind = resolveBindAddress();

  // ── Cursor ──
  section('Cursor IDE');
  await ensureCursorWithCdp();
  await verifyWorkbench();

  // ── Composer check ──
  try {
    const { CdpClient } = await import('./cdp-client.js');
    const targets = await CdpClient.fetchTargets(CDP_BASE);
    const wb = CdpClient.findWorkbench(targets);
    const tmpClient = new CdpClient(wb.webSocketDebuggerUrl!);
    await tmpClient.connect();
    const hasComposer = await tmpClient.evaluate(`
      (function() {
        var el = document.querySelector('.aislash-editor-input[contenteditable="true"]');
        return !!el;
      })()
    `) as boolean;
    if (hasComposer) {
      ok('Chat composer detected — ready for prompts');
    } else {
      warn('Composer not found — open a chat panel in Cursor first');
    }
    tmpClient.disconnect();
  } catch {
    warn('Could not check composer — will retry on first request');
  }

  // ── Relay ──
  section('Relay Server');
  info(`Bind: ${bind.addr}:${RELAY_PORT}`);
  if (bind.mode === 'localhost') {
    info('Mode: localhost only');
  } else if (bind.mode === 'lan') {
    ok('Mode: LAN-exposed (V2_LAN=1)');
  } else {
    ok(`Mode: explicit bind (V2_BIND=${bind.addr})`);
  }

  // Pass config to relay-server via env
  process.env.V2_CDP_BASE = CDP_BASE;
  process.env._V2_BIND_ADDR = bind.addr;
  process.env._V2_LAUNCHED = '1';

  // Import the relay (it self-starts via top-level start() call)
  await import('./relay-server.js');

  // Give the server a moment to bind
  await sleep(800);

  // ── Access URLs ──
  section('Access URLs');

  console.log(`  ${C.green}${C.bold}Local${C.reset}       http://localhost:${RELAY_PORT}`);

  if (bind.mode === 'localhost') {
    info('Localhost only — set V2_LAN=1 to expose on LAN/Tailscale');
    if (net.tailscaleIp || net.lanIps.length > 0) {
      console.log('');
      info('Available if you enable V2_LAN=1:');
      for (const ip of net.lanIps) {
        info(`  LAN        http://${ip}:${RELAY_PORT}`);
      }
      if (net.tailscaleIp) {
        info(`  Tailscale  http://${net.tailscaleIp}:${RELAY_PORT}`);
      }
      if (net.tailscaleName) {
        info(`  Tailscale  http://${net.tailscaleName}:${RELAY_PORT}`);
      }
    }
  } else {
    for (const ip of net.lanIps) {
      console.log(`  ${C.cyan}${C.bold}LAN${C.reset}         http://${ip}:${RELAY_PORT}`);
    }
    if (net.tailscaleIp) {
      console.log(`  ${C.magenta}${C.bold}Tailscale${C.reset}   http://${net.tailscaleIp}:${RELAY_PORT}`);
    }
    if (net.tailscaleName) {
      console.log(`  ${C.magenta}${C.bold}Tailscale${C.reset}   http://${net.tailscaleName}:${RELAY_PORT}`);
    }
  }

  // ── Auth ──
  section('Authentication');
  console.log(`  ${C.bold}Password:${C.reset}   ${C.yellow}${C.bold}${password}${C.reset}`);
  if (!process.env.V2_PASSWORD_FROM_ENV) {
    info('Random password — set V2_PASSWORD env var to use a fixed one');
  }

  // ── Ready ──
  console.log('');
  console.log(`  ${C.green}${C.bold}${'━'.repeat(40)}${C.reset}`);
  console.log(`  ${C.green}${C.bold}  READY — open the URL on your phone${C.reset}`);
  console.log(`  ${C.green}${C.bold}${'━'.repeat(40)}${C.reset}`);
  console.log(`  ${C.dim}Press Ctrl+C to stop${C.reset}`);
  console.log('');
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
