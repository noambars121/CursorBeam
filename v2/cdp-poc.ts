/**
 * V2 CDP Proof-of-Concept
 *
 * Proves we can connect to a running Cursor IDE via Chrome DevTools Protocol,
 * find the workbench renderer page, and read real data from Cursor's DOM.
 *
 * Prerequisites:
 *   Launch Cursor with:  Cursor.exe --remote-debugging-port=9222
 *   Then run:            npx tsx v2/cdp-poc.ts
 */

import WebSocket from 'ws';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CDP_HOST = 'http://127.0.0.1';
const CDP_PORT = 9222;
const CDP_BASE = `${CDP_HOST}:${CDP_PORT}`;
const CONNECT_TIMEOUT_MS = 5_000;
const EVAL_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CdpTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

interface CdpResponse {
  id: number;
  result?: {
    result?: {
      type: string;
      value?: unknown;
      description?: string;
    };
    exceptionDetails?: {
      text: string;
      exception?: { description?: string };
    };
  };
  error?: { code: number; message: string };
}

// ---------------------------------------------------------------------------
// Step 1: Fetch CDP target list
// ---------------------------------------------------------------------------

async function fetchTargets(): Promise<CdpTarget[]> {
  const url = `${CDP_BASE}/json`;
  log('info', `Fetching CDP targets from ${url} ...`);

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
      fail(
        'Cannot reach Cursor CDP endpoint.',
        [
          `Nothing is listening on port ${CDP_PORT}.`,
          '',
          'Fix: Launch Cursor with the remote-debugging flag:',
          '',
          '  Windows (PowerShell):',
          `    & "$env:LOCALAPPDATA\\Programs\\cursor\\Cursor.exe" --remote-debugging-port=${CDP_PORT}`,
          '',
          '  macOS:',
          `    open -a Cursor --args --remote-debugging-port=${CDP_PORT}`,
          '',
          'Then re-run this script.',
        ],
      );
    }
    fail(`CDP fetch error: ${msg}`);
  }

  if (!response.ok) {
    fail(`CDP /json returned HTTP ${response.status}`);
  }

  const targets = (await response.json()) as CdpTarget[];
  log('info', `Got ${targets.length} CDP target(s)`);
  return targets;
}

// ---------------------------------------------------------------------------
// Step 2: Find Cursor workbench target
// ---------------------------------------------------------------------------

function findWorkbenchTarget(targets: CdpTarget[]): CdpTarget {
  log('info', 'Searching for Cursor workbench target ...');

  for (const t of targets) {
    log('debug', `  [${t.type}] ${t.title}  →  ${t.url.substring(0, 80)}`);
  }

  const workbench = targets.find(
    (t) => t.type === 'page' && t.url.includes('workbench'),
  );

  if (!workbench) {
    fail(
      'No Cursor workbench page target found.',
      [
        `Found ${targets.length} target(s), but none have "workbench" in the URL.`,
        '',
        'Possible causes:',
        '  - Cursor started without --remote-debugging-port=9222',
        '  - Cursor has not fully loaded yet (try again in a few seconds)',
        '  - A different app is using port 9222',
        '',
        'Targets found:',
        ...targets.map((t) => `  [${t.type}] ${t.title}`),
      ],
    );
  }

  if (!workbench.webSocketDebuggerUrl) {
    fail('Workbench target has no webSocketDebuggerUrl. Is another debugger already attached?');
  }

  log('ok', `Found workbench target: "${workbench.title}"`);
  log('info', `  WS URL: ${workbench.webSocketDebuggerUrl}`);
  return workbench;
}

// ---------------------------------------------------------------------------
// Step 3: Connect via WebSocket and call Runtime.evaluate
// ---------------------------------------------------------------------------

function cdpEvaluate(wsUrl: string, expression: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const msgId = 1;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.close();
        reject(new Error(`Runtime.evaluate timed out after ${EVAL_TIMEOUT_MS}ms`));
      }
    }, EVAL_TIMEOUT_MS);

    ws.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`WebSocket error: ${err.message}`));
      }
    });

    ws.on('open', () => {
      log('ok', 'WebSocket connected to Cursor renderer');
      log('info', `Evaluating: ${expression}`);

      const request = {
        id: msgId,
        method: 'Runtime.evaluate',
        params: {
          expression,
          returnByValue: true,
        },
      };
      ws.send(JSON.stringify(request));
    });

    ws.on('message', (raw) => {
      if (settled) return;

      let msg: CdpResponse;
      try {
        msg = JSON.parse(raw.toString()) as CdpResponse;
      } catch {
        return; // ignore non-JSON CDP events
      }

      if (msg.id !== msgId) return;

      settled = true;
      clearTimeout(timer);
      ws.close();

      if (msg.error) {
        reject(new Error(`CDP error: ${msg.error.message} (code ${msg.error.code})`));
        return;
      }

      const ex = msg.result?.exceptionDetails;
      if (ex) {
        const detail = ex.exception?.description || ex.text;
        reject(new Error(`Runtime exception: ${detail}`));
        return;
      }

      resolve(msg.result?.result?.value);
    });

    ws.on('close', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error('WebSocket closed before receiving a response'));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function log(level: 'info' | 'ok' | 'debug' | 'warn' | 'error', msg: string): void {
  const prefix: Record<string, string> = {
    info:  '[.]',
    ok:    '[+]',
    debug: '[ ]',
    warn:  '[!]',
    error: '[X]',
  };
  console.log(`${prefix[level]} ${msg}`);
}

function fail(headline: string, details?: string[]): never {
  console.error('');
  console.error(`[X] FAILED: ${headline}`);
  if (details) {
    for (const line of details) {
      console.error(`    ${line}`);
    }
  }
  console.error('');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('');
  console.log('=== V2 CDP Proof-of-Concept ===');
  console.log('');

  // Step 1
  const targets = await fetchTargets();

  // Step 2
  const workbench = findWorkbenchTarget(targets);

  // Step 3
  const expression = `document.querySelectorAll('[data-flat-index]').length`;
  const value = await cdpEvaluate(workbench.webSocketDebuggerUrl!, expression);

  // Result
  console.log('');
  console.log('=== RESULT ===');
  console.log('');
  log('ok', `Expression:  ${expression}`);
  log('ok', `Value:       ${JSON.stringify(value)}`);
  console.log('');

  if (typeof value === 'number') {
    if (value > 0) {
      log('ok', `Cursor chat has ${value} message element(s) in the DOM.`);
    } else {
      log('warn', 'Value is 0. Chat panel may be empty or closed. Open a chat in Cursor and retry.');
    }
  }

  console.log('');
  log('ok', 'POC SUCCESS: CDP connection to Cursor works. Architecture is proven.');
  console.log('');
}

main().catch((err) => {
  fail(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
});
