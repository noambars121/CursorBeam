/**
 * Detached one-shot: wait for parent HTTP response, kill listener on V2_PORT, spawn relay-server.
 * Invoked by relay-server POST /admin/restart-relay (no supervisor required).
 */
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.argv[2] ?? process.env.V2_PORT ?? '9800', 10);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function killListenersOnPortWin(p: number): void {
  try {
    const out = execSync(`netstat -ano | findstr LISTENING | findstr :${p}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    for (const line of out.split('\n')) {
      if (!line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0') {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* no listener */
  }
}

function killListenersOnPortUnix(p: number): void {
  try {
    execSync(`lsof -ti :${p} | xargs kill -9`, { stdio: 'ignore' });
  } catch {
    try {
      execSync(`fuser -k ${p}/tcp`, { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
  }
}

function spawnFreshRelay(): void {
  const relayScript = path.join(__dirname, 'relay-server.ts');
  const projRoot = path.resolve(__dirname, '..');
  const env = {
    ...process.env,
    V2_PORT: String(PORT),
    V2_CDP_BASE: process.env.V2_CDP_BASE ?? 'http://127.0.0.1:9222',
    _V2_BIND_ADDR: process.env._V2_BIND_ADDR ?? '0.0.0.0',
    _V2_LAUNCHED: '1',
    V2_LAN: process.env.V2_LAN ?? '1',
  };
  if (process.platform === 'win32') {
    spawn('cmd.exe', ['/c', 'npx', 'tsx', relayScript], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      cwd: projRoot,
      env,
    }).unref();
  } else {
    spawn('npx', ['tsx', relayScript], {
      detached: true,
      stdio: 'ignore',
      cwd: projRoot,
      env,
      shell: true,
    }).unref();
  }
}

await sleep(500);
if (process.platform === 'win32') {
  killListenersOnPortWin(PORT);
} else {
  killListenersOnPortUnix(PORT);
}
spawnFreshRelay();
process.exit(0);
