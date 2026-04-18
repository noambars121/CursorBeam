/**
 * V2 DOM Extraction POC
 *
 * Connects to Cursor via CDP, extracts the full chat state as structured data,
 * and prints it to the terminal.
 *
 * Run:  npx tsx v2/poc-extract.ts
 */

import { CdpClient } from './cdp-client.js';
import { extractCursorState, type ExtractedState, type ChatElement } from './dom-extractor.js';

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

function c(color: keyof typeof COLORS, text: string): string {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\n/g, ' ').replace(/\s+/g, ' ');
  if (oneLine.length <= max) return oneLine;
  return oneLine.substring(0, max - 3) + '...';
}

function renderElement(el: ChatElement): void {
  const idx = c('dim', `[${String(el.flatIndex).padStart(2)}]`);

  switch (el.type) {
    case 'human': {
      const mentionStr = el.mentions.length > 0
        ? c('cyan', ` @${el.mentions.map(m => m.name).join(' @')}`)
        : '';
      console.log(`${idx} ${c('green', '👤 Human')}${mentionStr}`);
      console.log(`     ${truncate(el.text, 100)}`);
      break;
    }
    case 'assistant': {
      console.log(`${idx} ${c('cyan', '🤖 Assistant')} ${c('dim', `(${el.htmlLength} chars HTML)`)}`);
      console.log(`     ${truncate(el.text, 100)}`);
      break;
    }
    case 'tool': {
      const statusIcon = el.status === 'completed' ? '✅' : el.status === 'loading' ? '⏳' : '❓';
      const action = el.action || '(no action text)';
      const details = el.details ? c('dim', ` → ${el.details}`) : '';
      console.log(`${idx} ${c('yellow', `🔧 Tool`)} ${statusIcon} ${action}${details}`);
      break;
    }
    case 'thought': {
      console.log(`${idx} ${c('magenta', `💭 Thought`)} ${c('dim', el.duration || '(no duration)')}`);
      break;
    }
    case 'loading': {
      console.log(`${idx} ${c('blue', '⏳ Loading...')}`);
      break;
    }
    case 'unknown': {
      console.log(`${idx} ${c('red', '❓ Unknown')} ${c('dim', `role=${el.role} kind=${el.kind}`)}`);
      console.log(`     ${c('dim', truncate(el.preview, 80))}`);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('');
  console.log(c('bold', '=== V2 DOM Extraction POC ==='));
  console.log('');

  // Step 1: Discover and connect
  console.log(c('dim', '[.] Fetching CDP targets...'));
  const targets = await CdpClient.fetchTargets();
  const workbench = CdpClient.findWorkbench(targets);
  console.log(`${c('green', '[+]')} Target: ${workbench.title}`);

  const client = new CdpClient(workbench.webSocketDebuggerUrl!);
  await client.connect();
  console.log(`${c('green', '[+]')} WebSocket connected`);

  // Step 2: Extract state
  console.log(c('dim', '[.] Extracting chat state from DOM...'));
  const state: ExtractedState = await client.callFunction(extractCursorState);

  // Step 3: Display results
  console.log('');
  console.log(c('bold', `=== Chat State: ${state.messageCount} element(s) ===`));
  console.log(c('dim', `Window: ${state.windowTitle}`));
  console.log(c('dim', `Extracted at: ${new Date(state.timestamp).toLocaleTimeString()}`));
  console.log('');

  if (state.messages.length === 0) {
    console.log(c('yellow', '[!] No messages found. Open a chat conversation in Cursor and retry.'));
  } else {
    // Summary counts
    const counts: Record<string, number> = {};
    for (const m of state.messages) {
      counts[m.type] = (counts[m.type] || 0) + 1;
    }
    const summary = Object.entries(counts)
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ');
    console.log(c('dim', `Types: ${summary}`));
    console.log('');

    // Render each element
    for (const el of state.messages) {
      renderElement(el);
      console.log('');
    }
  }

  // Step 4: Raw JSON dump
  console.log(c('bold', '=== Raw JSON ==='));
  console.log('');
  console.log(JSON.stringify(state, null, 2));

  // Cleanup
  client.disconnect();

  console.log('');
  console.log(c('green', '[+] POC SUCCESS: Full chat state extracted from Cursor DOM.'));
  console.log('');
}

main().catch((err) => {
  console.error('');
  console.error(`${c('red', '[X] FAILED:')} ${err instanceof Error ? err.message : String(err)}`);
  console.error('');
  process.exit(1);
});
