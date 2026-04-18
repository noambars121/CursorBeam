/**
 * V2 Prompt Injection POC
 *
 * Proves bidirectional Cursor control via CDP:
 *   1. Focuses the chat composer (.aislash-editor-input)
 *   2. Injects text via Input.insertText (works with ProseMirror/TipTap)
 *   3. Submits via rawKeyDown Enter (clears composer = submitted)
 *   4. Polls DOM for the injected human message + any AI response
 *
 * Proven so far:
 *   - Input.insertText places text in the composer ✓
 *   - rawKeyDown Enter clears the composer (= submits) ✓
 *   - Detection needs to search by content, not by flatIndex ✓
 */

import { CdpClient } from './cdp-client.js';
import { extractCursorState, type ExtractedState, type ChatElement } from './dom-extractor.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TEST_PROMPT = 'Reply with exactly: CDP injection works';
const MARKER = 'CDP injection works';
const POLL_INTERVAL_MS = 1_000;
const MAX_WAIT_MS = 25_000;

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', cyan: '\x1b[36m', yellow: '\x1b[33m',
  red: '\x1b[31m', magenta: '\x1b[35m',
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`\n${C.bold}=== V2 Prompt Injection POC ===${C.reset}\n`);

  // --- Connect ---
  const targets = await CdpClient.fetchTargets();
  const wb = CdpClient.findWorkbench(targets);
  const client = new CdpClient(wb.webSocketDebuggerUrl!);
  await client.connect();
  console.log(`${C.green}[+]${C.reset} Connected: ${wb.title}`);

  // --- Pre-injection snapshot ---
  const before: ExtractedState = await client.callFunction(extractCursorState);
  const beforeHumanTexts = new Set(
    before.messages
      .filter((m): m is ChatElement & { text: string } => m.type === 'human' && 'text' in m)
      .map((m) => m.text),
  );
  const beforeMsgCount = before.messageCount;
  console.log(`${C.dim}[.]${C.reset} Snapshot: ${beforeMsgCount} elements\n`);

  // Check if our marker already exists (from a previous run)
  const alreadyPresent = [...beforeHumanTexts].some((t) => t.includes(MARKER));
  if (alreadyPresent) {
    console.log(`${C.yellow}[!]${C.reset} Marker "${MARKER}" already in chat from a previous run.`);
    console.log(`${C.yellow}[!]${C.reset} Will still inject and check for a NEW response.\n`);
  }

  // ===== STEP 1: Focus composer =====
  console.log(`${C.dim}[1/5]${C.reset} Focusing composer...`);
  const focused = await client.evaluate(`
    (function() {
      var el = document.querySelector('.aislash-editor-input[contenteditable="true"]');
      if (!el) {
        var all = document.querySelectorAll('[contenteditable="true"]');
        for (var i = 0; i < all.length; i++) {
          var r = all[i].getBoundingClientRect();
          if (r.width > 100 && r.height > 5) { el = all[i]; break; }
        }
      }
      if (!el) return { ok: false, error: 'No composer element found. Is the chat panel open?' };
      el.focus();
      return { ok: document.activeElement === el, class: String(el.className).substring(0, 60) };
    })()
  `) as { ok: boolean; error?: string; class?: string };

  if (!focused.ok) {
    console.log(`${C.red}[X] FAILED: ${focused.error || 'Could not focus composer.'}${C.reset}`);
    console.log(`${C.yellow}    Make sure the chat panel is open (Ctrl+L).${C.reset}`);
    client.disconnect();
    process.exit(1);
  }
  console.log(`${C.green}[+]${C.reset} Composer focused: ${focused.class}`);

  // ===== STEP 2: Clear + type =====
  console.log(`${C.dim}[2/5]${C.reset} Injecting prompt: "${TEST_PROMPT}"`);
  await client.pressKey('a', 'KeyA', 65, 2); // Ctrl+A select all
  await sleep(50);
  await client.pressKey('Backspace', 'Backspace', 8);
  await sleep(100);
  await client.typeText(TEST_PROMPT);
  await sleep(300);

  // Verify text landed
  const composerText = await client.evaluate(`
    (function() {
      var el = document.querySelector('.aislash-editor-input[contenteditable="true"]');
      return el ? (el.textContent || '') : '';
    })()
  `) as string;

  if (!composerText.includes(MARKER)) {
    console.log(`${C.red}[X] FAILED: Text not found in composer after insertText.${C.reset}`);
    console.log(`${C.dim}    Composer content: "${composerText.substring(0, 60)}"${C.reset}`);
    client.disconnect();
    process.exit(1);
  }
  console.log(`${C.green}[+]${C.reset} Text confirmed in composer ✓`);

  // ===== STEP 3: Submit =====
  console.log(`${C.dim}[3/5]${C.reset} Pressing Enter to submit...`);
  await client.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
    unmodifiedText: '\r',
    text: '\r',
  });
  await client.send('Input.dispatchKeyEvent', {
    type: 'char',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
    unmodifiedText: '\r',
    text: '\r',
  });
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });

  await sleep(500);

  // Check if composer cleared
  const afterEnter = await client.evaluate(`
    (function() {
      var el = document.querySelector('.aislash-editor-input[contenteditable="true"]');
      return el ? (el.textContent || '') : 'N/A';
    })()
  `) as string;

  const composerCleared = !afterEnter.includes(MARKER);
  if (composerCleared) {
    console.log(`${C.green}[+]${C.reset} Composer cleared — message submitted ✓`);
  } else {
    console.log(`${C.red}[X]${C.reset} Composer still has text — Enter did not submit.`);
    console.log(`${C.yellow}    Content: "${afterEnter.substring(0, 50)}"${C.reset}`);
    client.disconnect();
    process.exit(1);
  }

  // ===== STEP 4+5: Poll for human message + response =====
  console.log(`${C.dim}[4/5]${C.reset} Polling for results (${MAX_WAIT_MS / 1000}s)...\n`);

  let humanFound = false;
  let responseFound = false;
  let responseType = '';
  let assistantText = '';
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    const state: ExtractedState = await client.callFunction(extractCursorState);

    // Search entire state for our marker in any human message
    if (!humanFound) {
      for (const m of state.messages) {
        if (m.type === 'human') {
          const text = (m as { text: string }).text;
          if (text.includes(MARKER)) {
            humanFound = true;
            console.log(`${C.green}[+] HUMAN MESSAGE: "${text.substring(0, 70)}" (idx=${m.flatIndex})${C.reset}`);
            break;
          }
        }
      }
    }

    // Look for any response-type element that appeared AFTER our human message
    if (humanFound && !responseFound) {
      const ourIdx = state.messages.findIndex(
        (m) => m.type === 'human' && (m as { text: string }).text.includes(MARKER),
      );
      const afterOurs = ourIdx >= 0 ? state.messages.slice(ourIdx + 1) : [];

      for (const m of afterOurs) {
        if (m.type === 'assistant' || m.type === 'tool' || m.type === 'thought' || m.type === 'loading') {
          responseFound = true;
          responseType = m.type;
          if (m.type === 'assistant') {
            assistantText = (m as { text: string }).text;
          }
          const label = m.type === 'assistant'
            ? `"${assistantText.substring(0, 80)}"`
            : m.type === 'tool'
              ? `action: ${(m as { action: string }).action.substring(0, 50)}`
              : m.type;
          console.log(`${C.cyan}[+] RESPONSE (${m.type}): ${label}${C.reset}`);
          break;
        }
      }
    }

    // If both found, give assistant a moment to finish
    if (humanFound && responseFound) {
      console.log(`${C.dim}    Waiting 3s for response to complete...${C.reset}`);
      await sleep(3000);
      const finalState = await client.callFunction(extractCursorState);
      const ourFinalIdx = finalState.messages.findIndex(
        (m) => m.type === 'human' && (m as { text: string }).text.includes(MARKER),
      );
      if (ourFinalIdx >= 0) {
        const afterFinal = finalState.messages.slice(ourFinalIdx + 1);
        const lastAssistant = [...afterFinal].reverse().find((m) => m.type === 'assistant');
        if (lastAssistant) {
          assistantText = (lastAssistant as { text: string }).text;
        }
      }
      break;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(`\r  ${C.dim}[${elapsed}s] msgs=${state.messageCount} human=${humanFound ? 'YES' : 'no'} response=${responseFound ? 'YES' : 'no'}${C.reset}       `);
    await sleep(POLL_INTERVAL_MS);
  }

  // ===== Results =====
  console.log(`\n\n${C.bold}========================================${C.reset}`);
  console.log(`${C.bold}  INJECTION RESULTS${C.reset}`);
  console.log(`${C.bold}========================================${C.reset}\n`);

  console.log(`  Composer focus:  ${C.green}✓${C.reset}`);
  console.log(`  Text injection:  ${C.green}✓${C.reset}`);
  console.log(`  Enter submit:    ${composerCleared ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`}`);
  console.log(`  Human detected:  ${humanFound ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`}`);
  console.log(`  AI response:     ${responseFound ? `${C.green}✓ (${responseType})${C.reset}` : `${C.yellow}✗ (not yet)${C.reset}`}`);

  if (assistantText) {
    console.log(`\n  ${C.cyan}${C.bold}Cursor says:${C.reset}`);
    console.log(`  ${C.cyan}"${assistantText.substring(0, 300)}"${C.reset}`);
  }

  console.log('');
  if (humanFound && responseFound) {
    console.log(`  ${C.green}${C.bold}✓✓✓ POC SUCCESS ✓✓✓${C.reset}`);
    console.log(`  ${C.green}${C.bold}Bidirectional Cursor control via CDP is proven.${C.reset}`);
    console.log(`  ${C.green}We can SEND prompts AND READ responses.${C.reset}`);
  } else if (composerCleared && !humanFound) {
    console.log(`  ${C.yellow}${C.bold}LIKELY SUCCESS (detection gap)${C.reset}`);
    console.log(`  ${C.yellow}Composer cleared = message submitted.${C.reset}`);
    console.log(`  ${C.yellow}Human message not found in DOM — may have scrolled off or chat tab changed.${C.reset}`);
    // Dump last few messages for debugging
    const dbg = await client.callFunction(extractCursorState);
    console.log(`\n  ${C.dim}Current DOM has ${dbg.messageCount} elements. Last 5:${C.reset}`);
    for (const m of dbg.messages.slice(-5)) {
      const t = 'text' in m ? (m as { text: string }).text.substring(0, 70) : ('action' in m ? (m as { action: string }).action.substring(0, 70) : m.type);
      console.log(`  ${C.dim}  [${m.flatIndex}] ${m.type}: ${t}${C.reset}`);
    }
  } else if (humanFound && !responseFound) {
    console.log(`  ${C.yellow}PARTIAL: Send proven, waiting for response.${C.reset}`);
  } else {
    console.log(`  ${C.red}FAILED: Injection could not be confirmed.${C.reset}`);
  }

  console.log('');
  client.disconnect();
}

main().catch((err) => {
  console.error(`\n${C.red}[X] ${err instanceof Error ? err.message : String(err)}${C.reset}\n`);
  process.exit(1);
});
