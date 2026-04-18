/**
 * CdpStateManager — Polls Cursor's DOM via CDP, diffs state, emits change events.
 *
 * Single responsibility: maintain a live snapshot of the chat and expose it.
 * No HTTP, no WebSocket server — that's the relay's job.
 */

import { EventEmitter } from 'node:events';
import { CdpClient } from './cdp-client.js';
import { extractCursorState, type ExtractedState, type ChatElement } from './dom-extractor.js';
import { internalToPublic, publicToInternal, type PublicMode } from './mode-utils.js';
import { launchCursorWithFolder, detectActiveProject } from './project-manager.js';
import {
  DIALOG_LABEL_HELPERS,
  PHONE_EDIT_COMPOSER_PICKER_JS,
  makeProbeAnyChoiceDialogEval,
} from './edit-dom-probe.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthStatus {
  cdpReachable: boolean;
  workbenchFound: boolean;
  wsConnected: boolean;
  composerDetected: boolean;
  lastExtraction: number | null;
  cursorTitle: string;
  error: string | null;
}

export type ActivityState = 'idle' | 'responding' | 'waiting_for_approval' | 'switching_project' | 'switching_chat' | 'creating_chat';

export interface ChatInfo {
  index: number;
  title: string;
  subtitle: string;
  timeLabel: string;
  active: boolean;
}

export interface ChatListResult {
  chats: ChatInfo[];
  activeChatIndex: number | null;
  activeChatTitle: string | null;
}

export interface StateSnapshot {
  state: ExtractedState;
  activityState: ActivityState;
  isResponding: boolean;
  lastHumanIndex: number;
  lastAssistantIndex: number;
  extractedAt: number;
}

export interface SendResult {
  ok: boolean;
  composerFocused: boolean;
  textInserted: boolean;
  submitted: boolean;
  sentAt?: number;
  messageCountAtSend?: number;
  error?: string;
}

/** Result of scrolling Cursor's composer history up so virtualized older rows mount. */
export interface LoadOlderChatResult {
  ok: boolean;
  reason?: string;
  atTop?: boolean;
  scrolledBy?: number;
  messageCount?: number;
}

export interface StateChangeEvent {
  type: 'state_change';
  snapshot: StateSnapshot;
  newMessages: ChatElement[];
  removedCount: number;
}

export interface TerminalTabInfo {
  index: number;
  title: string;
  active: boolean;
}

export interface TerminalSnapshot {
  available: boolean;
  content: string;
  lineCount: number;
  cols: number;
  rows: number;
  cursorX: number;
  cursorY: number;
  tabName: string;
  /** Open integrated-terminal tabs (when detectable in the workbench DOM). */
  tabs?: TerminalTabInfo[];
  extractedAt: number;
  error?: string;
}

export interface TerminalChangeEvent {
  type: 'terminal_change';
  terminal: TerminalSnapshot;
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

export class CdpStateManager extends EventEmitter {
  private client: CdpClient | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastState: ExtractedState | null = null;
  private lastExtraction: number | null = null;
  private reconnecting = false;
  private _switchingProject = false;
  private _switchingChat = false;
  private _creatingChat = false;
  private _uiOperationInProgress = false;
  private terminalPollTimer: ReturnType<typeof setInterval> | null = null;
  private lastTerminalContent: string = '';
  private lastTerminalTabsSig: string = '';
  private _lastTerminalSnapshot: TerminalSnapshot | null = null;
  private lastLoadOlderChatAt = 0;

  readonly cdpBase: string;
  readonly pollIntervalMs: number;

  constructor(opts: { cdpBase?: string; pollIntervalMs?: number } = {}) {
    super();
    this.cdpBase = opts.cdpBase ?? 'http://127.0.0.1:9222';
    this.pollIntervalMs = opts.pollIntervalMs ?? 1_500;
  }

  get switchingProject(): boolean { return this._switchingProject; }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async start(): Promise<void> {
    await this.connectToCursor();
    this.startPolling();
    this.startTerminalPolling();
    this.log('State manager started');
  }

  stop(): void {
    this.stopPolling();
    this.stopTerminalPolling();
    this.client?.disconnect();
    this.client = null;
    this.log('State manager stopped');
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  async getHealth(): Promise<HealthStatus> {
    const base: HealthStatus = {
      cdpReachable: false,
      workbenchFound: false,
      wsConnected: false,
      composerDetected: false,
      lastExtraction: this.lastExtraction,
      cursorTitle: '',
      error: null,
    };

    try {
      const targets = await CdpClient.fetchTargets(this.cdpBase);
      base.cdpReachable = true;

      const wb = CdpClient.findWorkbench(targets);
      base.workbenchFound = true;
      base.cursorTitle = wb.title;

      if (this.client?.connected) {
        base.wsConnected = true;

        const hasComposer = await this.client.evaluate(`
          (function() {
            var el = document.querySelector('.aislash-editor-input[contenteditable="true"]');
            return !!el;
          })()
        `) as boolean;
        base.composerDetected = hasComposer;
      }
    } catch (err) {
      base.error = err instanceof Error ? err.message : String(err);
    }

    return base;
  }

  getLatestSnapshot(): StateSnapshot | null {
    if (!this.lastState) return null;
    return this.buildSnapshot(this.lastState);
  }

  async extractNow(): Promise<StateSnapshot> {
    this.ensureConnected();
    const state = await this.client!.callFunction(extractCursorState);
    this.lastState = state;
    this.lastExtraction = Date.now();
    return this.buildSnapshot(state);
  }

  /**
   * Scroll the Cursor composer message list upward so virtualization loads older [data-flat-index] rows.
   * Called from the mobile PWA when the user scrolls near the top of the mirrored transcript.
   */
  async surfaceOlderChatInComposer(): Promise<LoadOlderChatResult> {
    this.ensureConnected();
    const now = Date.now();
    if (now - this.lastLoadOlderChatAt < 320) {
      return { ok: false, reason: 'throttled' };
    }
    this.lastLoadOlderChatAt = now;

    const JS = `(async function () {
      var first = document.querySelector('[data-flat-index]');
      if (!first) return { ok: false, reason: 'no-messages' };
      var candidates = [];
      var el = first.parentElement;
      for (var hops = 0; el && hops < 35; hops++, el = el.parentElement) {
        var sh = el.scrollHeight;
        var ch = el.clientHeight;
        if (sh > ch + 80) candidates.push(el);
      }
      var chosen = null;
      for (var i = 0; i < candidates.length; i++) {
        if (!chosen || candidates[i].scrollHeight > chosen.scrollHeight) chosen = candidates[i];
      }
      if (!chosen) return { ok: false, reason: 'no-scroll-parent' };
      if (chosen.scrollTop <= 2) {
        return {
          ok: true,
          atTop: true,
          scrolledBy: 0,
          messageCount: document.querySelectorAll('[data-flat-index]').length,
        };
      }
      var totalScrolled = 0;
      var jumps = 0;
      var maxJumps = 5;
      while (jumps < maxJumps && chosen.scrollTop > 2) {
        var amount = Math.max(600, Math.floor(chosen.clientHeight * 2.8));
        var before = chosen.scrollTop;
        chosen.scrollTop = Math.max(0, before - amount);
        var delta = before - chosen.scrollTop;
        totalScrolled += delta;
        jumps++;
        if (delta < 20) break;
        await new Promise(function (r) { requestAnimationFrame(r); });
      }
      await new Promise(function (r) {
        requestAnimationFrame(function () {
          requestAnimationFrame(r);
        });
      });
      return {
        ok: true,
        atTop: chosen.scrollTop <= 2,
        scrolledBy: totalScrolled,
        messageCount: document.querySelectorAll('[data-flat-index]').length,
      };
    })()`;

    try {
      const raw = (await this.client!.evaluate(JS, { awaitPromise: true })) as LoadOlderChatResult;
      if (raw && raw.ok) {
        await this.sleep(45);
        await this.pollOnce();
      }
      return raw;
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  async sendPrompt(prompt: string, imagePaths?: string[]): Promise<SendResult> {
    this.ensureConnected();
    const result: SendResult = {
      ok: false,
      composerFocused: false,
      textInserted: false,
      submitted: false,
    };

    try {
      // Focus composer
      const focused = await this.client!.evaluate(`
        (function() {
          var el = document.querySelector('.aislash-editor-input[contenteditable="true"]');
          if (!el) {
            var all = document.querySelectorAll('[contenteditable="true"]');
            for (var i = 0; i < all.length; i++) {
              var r = all[i].getBoundingClientRect();
              if (r.width > 100 && r.height > 5) { el = all[i]; break; }
            }
          }
          if (!el) return false;
          el.focus();
          return document.activeElement === el;
        })()
      `) as boolean;

      if (!focused) {
        result.error = 'Could not focus composer. Is the chat panel open?';
        return result;
      }
      result.composerFocused = true;

      // Clear existing
      await this.client!.pressKey('a', 'KeyA', 65, 2); // Ctrl+A
      await this.sleep(50);
      await this.client!.pressKey('Backspace', 'Backspace', 8);
      await this.sleep(80);

      // Inject images FIRST
      if (imagePaths && imagePaths.length > 0) {
        for (const imgPath of imagePaths) {
          const res = await this.injectImage(imgPath);
          if (!res.ok) {
            this.log('Image inject failed: ' + res.error);
          }
        }
        await this.sleep(200);
      }

      // Re-focus composer just in case image injection stole focus
      await this.client!.evaluate(`
        (function() {
          var el = document.querySelector('.aislash-editor-input[contenteditable="true"]');
          if (el) el.focus();
        })()
      `);
      await this.sleep(50);

      // Type text
      if (prompt.length > 0) {
        await this.client!.typeText(prompt);
        await this.sleep(200);
      }

      // Verify
      const inComposer = await this.client!.evaluate(`
        (function() {
          var el = document.querySelector('.aislash-editor-input[contenteditable="true"]');
          return el ? (el.textContent || '') : '';
        })()
      `) as string;

      if (!inComposer.includes(prompt.substring(0, 20))) {
        result.error = 'Text not confirmed in composer after insertText.';
        return result;
      }
      result.textInserted = true;

      // Submit via rawKeyDown Enter
      await this.client!.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown', key: 'Enter', code: 'Enter',
        windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
        unmodifiedText: '\r', text: '\r',
      });
      await this.client!.send('Input.dispatchKeyEvent', {
        type: 'char', key: 'Enter', code: 'Enter',
        windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
        unmodifiedText: '\r', text: '\r',
      });
      await this.client!.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key: 'Enter', code: 'Enter',
        windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
      });

      await this.sleep(300);

      // Check if composer cleared
      const afterText = await this.client!.evaluate(`
        (function() {
          var el = document.querySelector('.aislash-editor-input[contenteditable="true"]');
          return el ? (el.textContent || '') : '';
        })()
      `) as string;

      if (prompt.length > 0 && afterText.includes(prompt.substring(0, 20))) {
        result.error = 'Composer not cleared — Enter did not submit.';
        return result;
      }

      result.submitted = true;
      result.ok = true;
      result.sentAt = Date.now();
      result.messageCountAtSend = this.lastState?.messageCount ?? 0;
      this.log(`Prompt sent: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`);

    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
    }

    return result;
  }

  /**
   * Same gesture users use on desktop: click the human bubble's prompt (readonly
   * or input) so Cursor swaps to an editable surface.
   */
  private async ensureHumanMessageEditSurfaceClicked(targetFlatIndex: number): Promise<void> {
    const fi = targetFlatIndex;
    await this.client!.evaluate(`
      (function() {
        var targetFI = ${fi};
        var all = document.querySelectorAll('[data-flat-index]');
        var anchor = null;
        for (var i = 0; i < all.length; i++) {
          if (parseInt(all[i].getAttribute('data-flat-index') || '-1', 10) === targetFI) {
            anchor = all[i];
            break;
          }
        }
        if (!anchor) return;
        var ed = anchor.querySelector('.aislash-editor-input[contenteditable="true"]');
        if (ed) {
          var r = ed.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) return;
        }
        var ro = anchor.querySelector('.aislash-editor-input-readonly');
        if (!ro) ro = anchor.querySelector('.aislash-editor-input');
        if (!ro) return;
        var rr = ro.getBoundingClientRect();
        var cx = rr.left + rr.width / 2;
        var cy = rr.top + Math.min(Math.max(rr.height / 2, 6), 56);
        try {
          ro.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window, button: 0, buttons: 1,
          }));
          ro.dispatchEvent(new MouseEvent('mouseup', {
            bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window, button: 0, buttons: 0,
          }));
          ro.dispatchEvent(new MouseEvent('click', {
            bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window, button: 0, detail: 1,
          }));
        } catch (e) {}
      })()
    `);
    await this.sleep(380);
  }

  /** Enter in the focused field — optional Ctrl (modifier bitmask 2) for Ctrl+Enter. */
  private async dispatchComposerEnter(modifiers = 0): Promise<void> {
    const ident = {
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    };
    await this.client!.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      ...ident,
      modifiers,
      unmodifiedText: '\r',
      text: '\r',
    });
    await this.client!.send('Input.dispatchKeyEvent', {
      type: 'char',
      ...ident,
      modifiers,
      unmodifiedText: '\r',
      text: '\r',
    });
    await this.client!.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      ...ident,
      modifiers,
    });
  }

  /**
   * Replace text in Cursor's chat composer (including native "edit human message"
   * contenteditable) and optionally press Enter to apply. Same CDP path as
   * {@link sendPrompt} — enables full edit flow from the phone relay UI.
   */
  async applyEditComposerText(
    text: string,
    options?: { submit?: boolean; targetFlatIndex?: number },
  ): Promise<{
    ok: boolean;
    composerFocused?: boolean;
    textInserted?: boolean;
    submitted?: boolean;
    needs_confirmation?: boolean;
    dialog?: {
      title: string;
      body: string;
      buttons: { text: string; kind: 'destructive' | 'cancel' | 'other' }[];
    };
    error?: string;
  }> {
    this.ensureConnected();
    const submit = options?.submit !== false;
    const targetFI =
      options?.targetFlatIndex != null && options.targetFlatIndex >= 0 ? options.targetFlatIndex : -1;
    const tfLiteral = String(targetFI);
    const result: {
      ok: boolean;
      composerFocused?: boolean;
      textInserted?: boolean;
      submitted?: boolean;
      needs_confirmation?: boolean;
      dialog?: {
        title: string;
        body: string;
        buttons: { text: string; kind: 'destructive' | 'cancel' | 'other' }[];
      };
      error?: string;
    } = { ok: false };

    const tryFocus = async (): Promise<{ ok: boolean; error?: string | null }> => {
      return (await this.client!.evaluate(`
        (function() {
          ${PHONE_EDIT_COMPOSER_PICKER_JS}
          var el = __pickPhoneEditComposer(${tfLiteral});
          if (!el) {
            return {
              ok: false,
              error: ${targetFI >= 0}
                ? 'No editable field for that message — tap the message in Cursor to edit, or use עריכה ב-Cursor again.'
                : 'Could not find an edit composer. Open Cursor chat and start editing a message first.',
            };
          }
          el.focus();
          return { ok: document.activeElement === el, error: null };
        })()
      `)) as { ok: boolean; error?: string | null };
    };

    try {
      if (targetFI >= 0) {
        await this.ensureHumanMessageEditSurfaceClicked(targetFI);
      }

      let focusRes = await tryFocus();
      if (!focusRes.ok && targetFI >= 0) {
        await this.ensureHumanMessageEditSurfaceClicked(targetFI);
        await this.sleep(280);
        focusRes = await tryFocus();
      }

      if (!focusRes.ok) {
        result.error =
          (focusRes.error && String(focusRes.error)) ||
          'Could not focus the in-message edit field. Confirm the edit dialog in Cursor, then try again.';
        return result;
      }
      result.composerFocused = true;

      await this.client!.pressKey('a', 'KeyA', 65, 2);
      await this.sleep(50);
      await this.client!.pressKey('Backspace', 'Backspace', 8);
      await this.sleep(80);

      await this.client!.evaluate(`
        (function() {
          ${PHONE_EDIT_COMPOSER_PICKER_JS}
          var el = __pickPhoneEditComposer(${tfLiteral});
          if (el) el.focus();
        })()
      `);
      await this.sleep(50);

      if (text.length > 0) {
        await this.client!.typeText(text);
        await this.sleep(200);
      }

      const inComposer = await this.client!.evaluate(`
        (function() {
          ${PHONE_EDIT_COMPOSER_PICKER_JS}
          var el = __pickPhoneEditComposer(${tfLiteral});
          return el ? (el.textContent || '') : '';
        })()
      `) as string;

      if (text.length > 0) {
        const prefix = text.length >= 20 ? text.substring(0, 20) : text;
        if (!inComposer.includes(prefix)) {
          result.error = 'Text not confirmed in composer after insertText.';
          return result;
        }
      } else {
        if (inComposer.replace(/\s+/g, '').length > 0) {
          result.error = 'Composer was not cleared.';
          return result;
        }
      }
      result.textInserted = true;

      if (!submit) {
        result.ok = true;
        result.submitted = false;
        this.log(`Edit composer: text set (${text.length} chars), not submitted`);
        return result;
      }

      await this.dispatchComposerEnter(0);

      // Cursor often opens branch/continue/cancel only *after* submit — poll long enough
      // (dialog mount + our probes missing uncommon copy).
      for (let pi = 0; pi < 52; pi++) {
        await this.sleep(280);
        const dlgEarly =
          (await this.probeAnyChoiceDialog()) ??
          (await this.probeRevertDialog()) ??
          (await this.probeLooseChoiceDialog());
        if (dlgEarly && dlgEarly.buttons.length > 0) {
          result.submitted = true;
          result.ok = true;
          result.needs_confirmation = true;
          result.dialog = dlgEarly;
          this.log(`Edit composer: submit opened choice dialog — "${dlgEarly.title}"`);
          return result;
        }
      }

      const afterText = await this.client!.evaluate(`
        (function() {
          ${PHONE_EDIT_COMPOSER_PICKER_JS}
          var el = __pickPhoneEditComposer(${tfLiteral});
          return el ? (el.textContent || '') : '';
        })()
      `) as string;

      if (text.length > 0) {
        const prefix = text.length >= 20 ? text.substring(0, 20) : text;
        if (afterText.includes(prefix)) {
          let rescue = await this.pollEditSubmitChoiceDialog(14_000);
          if (rescue && rescue.buttons.length > 0) {
            result.submitted = true;
            result.ok = true;
            result.needs_confirmation = true;
            result.dialog = rescue;
            this.log(`Edit composer: dialog appeared after delayed poll — "${rescue.title}"`);
            return result;
          }
          await this.dispatchComposerEnter(0);
          await this.sleep(400);
          rescue = await this.pollEditSubmitChoiceDialog(10_000);
          if (rescue && rescue.buttons.length > 0) {
            result.submitted = true;
            result.ok = true;
            result.needs_confirmation = true;
            result.dialog = rescue;
            this.log(`Edit composer: dialog after second Enter — "${rescue.title}"`);
            return result;
          }
          await this.dispatchComposerEnter(2);
          await this.sleep(350);
          rescue = await this.pollEditSubmitChoiceDialog(8000);
          if (rescue && rescue.buttons.length > 0) {
            result.submitted = true;
            result.ok = true;
            result.needs_confirmation = true;
            result.dialog = rescue;
            this.log(`Edit composer: dialog after Ctrl+Enter — "${rescue.title}"`);
            return result;
          }
          result.error =
            'Composer still shows the edited text — Enter did not submit, or the edit field is wrong (try clicking the message in Cursor once).';
          return result;
        }
      }

      result.submitted = true;
      result.ok = true;
      this.log(`Edit composer: applied (${text.length} chars, flatIndex=${targetFI})`);
      return result;
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      return result;
    }
  }

  /**
   * Click a specific button by its exact DOM coordinates (flatIndex + buttonIndex).
   * Falls back to category-based text matching only if buttonIndex is unavailable.
   */
  async performAction(
    action: string,
    targetFlatIndex?: number,
    targetButtonIndex?: number,
  ): Promise<{ ok: boolean; clicked?: string; error?: string }> {
    this.ensureConnected();

    if (action === 'reject') {
      try {
        await this.client!.pressKey('Escape', 'Escape', 27);
        this.log('Rejected action (Escape)');
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }

    try {
      const hasPreciseTarget = targetFlatIndex !== undefined && targetButtonIndex !== undefined;
      const fi = targetFlatIndex ?? -1;
      const bi = targetButtonIndex ?? -1;

      const result = await this.client!.evaluate(`
        (function() {
          var targetFI = ${fi};
          var targetBI = ${bi};
          var precise = ${hasPreciseTarget};
          var category = '${action}';
          var approveWords = ['accept', 'approve', 'allow', 'yes', 'apply', 'run command'];
          var elements = document.querySelectorAll('[data-flat-index]');

          // Strategy 1: precise click by flatIndex + buttonIndex
          if (precise && targetFI >= 0 && targetBI >= 0) {
            for (var i = 0; i < elements.length; i++) {
              var fi = parseInt(elements[i].getAttribute('data-flat-index') || '-1', 10);
              if (fi !== targetFI) continue;
              var btns = elements[i].querySelectorAll('button');
              if (targetBI < btns.length) {
                var b = btns[targetBI];
                var r = b.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) {
                  var t = (b.textContent || '').trim();
                  b.click();
                  return { ok: true, clicked: t, method: 'precise' };
                }
              }
              return { ok: false, error: 'Button at index ' + targetBI + ' not visible in element ' + targetFI };
            }
            return { ok: false, error: 'Element with flatIndex ' + targetFI + ' not found' };
          }

          // Strategy 2: scoped text match within targeted flatIndex
          if (targetFI >= 0) {
            for (var i2 = 0; i2 < elements.length; i2++) {
              var fi2 = parseInt(elements[i2].getAttribute('data-flat-index') || '-1', 10);
              if (fi2 !== targetFI) continue;
              var btns2 = elements[i2].querySelectorAll('button');
              for (var j2 = 0; j2 < btns2.length; j2++) {
                var b2 = btns2[j2];
                var r2 = b2.getBoundingClientRect();
                if (r2.width <= 0 || r2.height <= 0) continue;
                var t2 = (b2.textContent || '').trim();
                var lower2 = t2.toLowerCase();
                var match2 = false;
                if (category === 'approve') {
                  for (var k = 0; k < approveWords.length; k++) {
                    if (lower2.indexOf(approveWords[k]) !== -1) { match2 = true; break; }
                  }
                  if (!match2 && lower2 === 'run') match2 = true;
                } else if (category === 'run') {
                  match2 = (lower2 === 'run' || lower2 === 'run command');
                } else if (category === 'skip') {
                  match2 = (lower2.indexOf('skip') !== -1 || lower2.indexOf('ignore') !== -1);
                }
                if (match2) {
                  b2.click();
                  return { ok: true, clicked: t2, method: 'scoped' };
                }
              }
              return { ok: false, error: 'No ' + category + ' button in element ' + targetFI };
            }
            return { ok: false, error: 'Element with flatIndex ' + targetFI + ' not found' };
          }

          // Strategy 3: global fallback — last element first (most recent action)
          for (var i3 = elements.length - 1; i3 >= 0; i3--) {
            var btns3 = elements[i3].querySelectorAll('button');
            for (var j3 = 0; j3 < btns3.length; j3++) {
              var b3 = btns3[j3];
              var r3 = b3.getBoundingClientRect();
              if (r3.width <= 0 || r3.height <= 0) continue;
              var t3 = (b3.textContent || '').trim();
              var lower3 = t3.toLowerCase();
              var match3 = false;
              if (category === 'approve') {
                for (var k3 = 0; k3 < approveWords.length; k3++) {
                  if (lower3.indexOf(approveWords[k3]) !== -1) { match3 = true; break; }
                }
                if (!match3 && lower3 === 'run') match3 = true;
              } else if (category === 'run') {
                match3 = (lower3 === 'run' || lower3 === 'run command');
              } else if (category === 'skip') {
                match3 = (lower3.indexOf('skip') !== -1 || lower3.indexOf('ignore') !== -1);
              }
              if (match3) {
                b3.click();
                return { ok: true, clicked: t3, method: 'global' };
              }
            }
          }
          return { ok: false, error: 'No ' + category + ' button found anywhere in chat' };
        })()
      `) as { ok: boolean; clicked?: string; method?: string; error?: string };

      if (result.ok) {
        this.log(`Action '${action}': clicked "${result.clicked}" [${result.method}]`);
      }
      return result;
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // -----------------------------------------------------------------------
  // Revert to checkpoint (real Cursor Restore Checkpoint UI)
  // -----------------------------------------------------------------------
  //
  // Flow:
  //   1. Locate the [data-flat-index] element for the target human message.
  //   2. Use `locatorKind` to find the associated checkpoint element
  //      (descendant / prev-sibling / next-sibling).
  //   3. Hover the anchor (mouseover + mouseenter) to unhide hover-gated controls.
  //   4. Click the checkpoint element.
  //   5. Poll for a Cursor destructive dialog ([role="dialog"] with
  //      revert/discard/checkpoint text). If present, DO NOT click anything —
  //      return needs_confirmation so the caller can surface the exact dialog
  //      text + button labels to the user for a second explicit gesture.
  //   6. If no dialog appears and the checkpoint control disappears, treat it
  //      as an immediate/no-confirmation revert (some edit flows don't prompt).

  private static REVERT_CHECKPOINT_SELECTORS = [
    '.checkpoint-restore-text',
    '.arrow-revert-change',
    '.checkpoint-container',
    '.checkpoint-divider .text-link',
    '.revert-layer',
  ];

  async revertMessage(
    targetFlatIndex: number,
    locatorKind?: 'descendant' | 'prev-sibling' | 'next-sibling',
  ): Promise<{
    ok: boolean;
    status: 'reverted' | 'needs_confirmation' | 'failed';
    clicked?: string;
    dialog?: { title: string; body: string; buttons: { text: string; kind: 'destructive' | 'cancel' | 'other' }[] };
    error?: string;
  }> {
    this.ensureConnected();

    const fi = targetFlatIndex;
    const kind = locatorKind ?? '';
    const selectorsJson = JSON.stringify(CdpStateManager.REVERT_CHECKPOINT_SELECTORS);

    try {
      // Step 1: locate + hover + click
      const clickRes = await this.client!.evaluate(`
        (function() {
          var targetFI = ${fi};
          var locatorKind = '${kind}';
          var selectors = ${selectorsJson};

          var all = document.querySelectorAll('[data-flat-index]');
          var anchor = null;
          for (var i = 0; i < all.length; i++) {
            var f = parseInt(all[i].getAttribute('data-flat-index') || '-1', 10);
            if (f === targetFI) { anchor = all[i]; break; }
          }
          if (!anchor) return { ok: false, error: 'Anchor message (flatIndex ' + targetFI + ') not found' };

          // Fire hover so hover-gated checkpoint controls attach to DOM.
          try {
            var rect = anchor.getBoundingClientRect();
            var cx = rect.left + rect.width / 2;
            var cy = rect.top + rect.height / 2;
            anchor.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window }));
            anchor.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window }));
            anchor.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window }));
          } catch (e) { /* non-fatal */ }

          // Search strategy list based on locatorKind hint, with fallbacks.
          var searchRoots = [];
          if (locatorKind === 'descendant' || !locatorKind) searchRoots.push({ root: anchor, kind: 'descendant' });
          if (locatorKind === 'prev-sibling' || !locatorKind) {
            if (anchor.previousElementSibling) searchRoots.push({ root: anchor.previousElementSibling, kind: 'prev-sibling' });
          }
          if (locatorKind === 'next-sibling' || !locatorKind) {
            if (anchor.nextElementSibling) searchRoots.push({ root: anchor.nextElementSibling, kind: 'next-sibling' });
          }
          // Always try descendant as a last-resort fallback.
          if (locatorKind && locatorKind !== 'descendant') searchRoots.push({ root: anchor, kind: 'descendant' });

          var target = null;
          var winningSelector = '';
          var winningKind = '';
          for (var ri = 0; ri < searchRoots.length && !target; ri++) {
            var sr = searchRoots[ri];
            for (var si = 0; si < selectors.length; si++) {
              var sel = selectors[si];
              var hit = null;
              if (sr.kind === 'descendant') {
                hit = sr.root.querySelector(sel);
              } else {
                if (sr.root.matches && sr.root.matches(sel)) hit = sr.root;
                else hit = sr.root.querySelector(sel);
              }
              if (hit) {
                var hr = hit.getBoundingClientRect();
                if (hr.width > 0 && hr.height > 0) {
                  target = hit;
                  winningSelector = sel;
                  winningKind = sr.kind;
                  break;
                }
              }
            }
          }

          if (!target) return { ok: false, error: 'Checkpoint control not found in live DOM for flatIndex ' + targetFI };

          // Prefer a real clickable ancestor (button, [role=button], anchor-like).
          var clickEl = target;
          var cursor = target;
          for (var up = 0; up < 4 && cursor; up++) {
            var tag = (cursor.tagName || '').toLowerCase();
            if (tag === 'button' || tag === 'a') { clickEl = cursor; break; }
            var role = cursor.getAttribute && cursor.getAttribute('role');
            if (role === 'button') { clickEl = cursor; break; }
            cursor = cursor.parentElement;
          }

          var clickedText = (clickEl.textContent || '').trim().substring(0, 80);
          try {
            clickEl.click();
          } catch (e) {
            return { ok: false, error: 'click() threw: ' + (e && e.message ? e.message : String(e)) };
          }
          return { ok: true, clicked: clickedText, selector: winningSelector, kind: winningKind };
        })()
      `) as { ok: boolean; clicked?: string; selector?: string; kind?: string; error?: string };

      if (!clickRes.ok) {
        return { ok: false, status: 'failed', error: clickRes.error };
      }
      this.log(`Revert: clicked "${clickRes.clicked}" via ${clickRes.selector} [${clickRes.kind}]`);

      // Step 2: poll for a destructive confirmation dialog (~1.5s total)
      for (let i = 0; i < 6; i++) {
        await this.sleep(250);
        const dlg = await this.probeRevertDialog();
        if (dlg) {
          this.log(`Revert: confirmation dialog detected — "${dlg.title}"`);
          return { ok: false, status: 'needs_confirmation', dialog: dlg };
        }
      }

      // Step 3: no dialog — verify the checkpoint control is gone / revert ran
      const stillPresent = await this.client!.evaluate(`
        (function() {
          var all = document.querySelectorAll('[data-flat-index]');
          for (var i = 0; i < all.length; i++) {
            if (parseInt(all[i].getAttribute('data-flat-index') || '-1', 10) === ${fi}) {
              var anchor = all[i];
              var selectors = ${selectorsJson};
              for (var si = 0; si < selectors.length; si++) {
                if (anchor.querySelector(selectors[si])) return true;
                var p = anchor.previousElementSibling;
                if (p && (p.querySelector(selectors[si]) || (p.matches && p.matches(selectors[si])))) return true;
                var n = anchor.nextElementSibling;
                if (n && (n.querySelector(selectors[si]) || (n.matches && n.matches(selectors[si])))) return true;
              }
              return false;
            }
          }
          return false;
        })()
      `) as boolean;

      if (stillPresent) {
        // The click didn't take effect and no dialog appeared. Surface as failure
        // so the PWA does not lie about success.
        return { ok: false, status: 'failed', error: 'Click registered but no dialog appeared and checkpoint control still visible' };
      }

      return { ok: true, status: 'reverted', clicked: clickRes.clicked };
    } catch (err) {
      return { ok: false, status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Open Cursor's native "edit human message" flow for a composer bubble (the
   * one that may prompt whether to branch / continue from the edited prompt).
   * Tries hover-revealed edit controls, then double-clicks the readonly prompt.
   */
  async editHumanMessage(targetFlatIndex: number): Promise<{
    ok: boolean;
    status: 'opened' | 'needs_confirmation' | 'failed';
    dialog?: { title: string; body: string; buttons: { text: string; kind: 'destructive' | 'cancel' | 'other' }[] };
    error?: string;
    method?: string;
  }> {
    this.ensureConnected();
    const fi = targetFlatIndex;

    try {
      const clickRes = await this.client!.evaluate(`
        (function() {
          var targetFI = ${fi};
          var all = document.querySelectorAll('[data-flat-index]');
          var anchor = null;
          for (var i = 0; i < all.length; i++) {
            var f = parseInt(all[i].getAttribute('data-flat-index') || '-1', 10);
            if (f === targetFI) { anchor = all[i]; break; }
          }
          if (!anchor) return { ok: false, error: 'Message flatIndex ' + targetFI + ' not found in Cursor DOM' };

          try {
            var rect = anchor.getBoundingClientRect();
            var cx = rect.left + rect.width / 2;
            var cy = rect.top + rect.height / 2;
            anchor.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window }));
            anchor.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window }));
            anchor.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window }));
          } catch (e) { /* non-fatal */ }

          function findEditControl(root) {
            var candidates = root.querySelectorAll('button, [role="button"], a');
            for (var i = 0; i < candidates.length; i++) {
              var b = candidates[i];
              var label = ((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '')).toLowerCase();
              if (label.indexOf('edit') !== -1) {
                var br = b.getBoundingClientRect();
                if (br.width > 0 && br.height > 0) return b;
              }
            }
            var icons = root.querySelectorAll('.codicon-edit, .codicon-pencil, [class*="codicon-edit"]');
            for (var j = 0; j < icons.length; j++) {
              var p = icons[j];
              for (var up = 0; up < 6 && p; up++) {
                var tag = (p.tagName || '').toLowerCase();
                if (tag === 'button' || p.getAttribute('role') === 'button' || tag === 'a') {
                  var br = p.getBoundingClientRect();
                  if (br.width > 0 && br.height > 0) return p;
                  break;
                }
                p = p.parentElement;
              }
            }
            return null;
          }

          function clickReadonlyPrompt(ro) {
            var rr = ro.getBoundingClientRect();
            var rcx = rr.left + rr.width / 2;
            var rcy = rr.top + Math.min(Math.max(rr.height / 2, 6), 56);
            ro.dispatchEvent(new MouseEvent('mousedown', {
              bubbles: true, cancelable: true, clientX: rcx, clientY: rcy, view: window, button: 0, buttons: 1,
            }));
            ro.dispatchEvent(new MouseEvent('mouseup', {
              bubbles: true, cancelable: true, clientX: rcx, clientY: rcy, view: window, button: 0, buttons: 0,
            }));
            ro.dispatchEvent(new MouseEvent('click', {
              bubbles: true, cancelable: true, clientX: rcx, clientY: rcy, view: window, button: 0, detail: 1,
            }));
          }

          var ro = anchor.querySelector('.aislash-editor-input-readonly');
          if (!ro) ro = anchor.querySelector('.aislash-editor-input');
          if (ro) {
            try {
              clickReadonlyPrompt(ro);
              return { ok: true, method: 'click-readonly' };
            } catch (e0) {
              return { ok: false, error: 'click readonly failed: ' + (e0 && e0.message ? e0.message : String(e0)) };
            }
          }

          var editBtn = findEditControl(anchor);
          if (editBtn) {
            try {
              editBtn.click();
              return { ok: true, method: 'edit-control' };
            } catch (e) {
              return { ok: false, error: 'edit click failed: ' + (e && e.message ? e.message : String(e)) };
            }
          }

          return { ok: false, error: 'No prompt field or edit control found on this message' };
        })()
      `) as { ok: boolean; method?: string; error?: string };

      if (!clickRes.ok) {
        return { ok: false, status: 'failed', error: clickRes.error };
      }
      this.log(`Edit message: triggered via ${clickRes.method}`);

      for (let i = 0; i < 14; i++) {
        await this.sleep(280);
        const dlg = (await this.probeAnyChoiceDialog()) ?? (await this.probeRevertDialog());
        if (dlg && dlg.buttons.length > 0) {
          this.log(`Edit message: choice dialog — "${dlg.title}"`);
          return { ok: false, status: 'needs_confirmation', dialog: dlg, method: clickRes.method };
        }
      }

      const editable = await this.client!.evaluate(`
        (function() {
          var targetFI = ${fi};
          ${PHONE_EDIT_COMPOSER_PICKER_JS}
          var el = __pickPhoneEditComposer(targetFI);
          if (!el) return false;
          var r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })()
      `) as boolean;

      if (editable) {
        // Choice dialog often mounts *after* the composer becomes editable — keep polling so the PWA can offer buttons.
        for (let j = 0; j < 12; j++) {
          await this.sleep(260);
          const lateDlg = (await this.probeAnyChoiceDialog()) ?? (await this.probeRevertDialog());
          if (lateDlg && lateDlg.buttons.length > 0) {
            this.log(`Edit message: late choice dialog — "${lateDlg.title}"`);
            return { ok: false, status: 'needs_confirmation', dialog: lateDlg, method: clickRes.method };
          }
        }
        return { ok: true, status: 'opened', method: clickRes.method };
      }

      return {
        ok: false,
        status: 'failed',
        error: 'Edit gesture ran but no dialog appeared and composer did not become editable — try on desktop Cursor',
        method: clickRes.method,
      };
    } catch (err) {
      return { ok: false, status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Inspect currently-open Cursor dialogs and return one that looks like a
   * revert / discard / restore checkpoint confirmation. Returns null otherwise.
   *
   * Buttons are categorized so the PWA can label them correctly. This method
   * NEVER clicks anything — read-only.
   */
  private async probeRevertDialog(): Promise<
    | { title: string; body: string; buttons: { text: string; kind: 'destructive' | 'cancel' | 'other' }[] }
    | null
  > {
    const raw = await this.client!.evaluate(`
      (function() {
        ${DIALOG_LABEL_HELPERS}
        var dialogs = __collectDialogRoots();
        for (var di = 0; di < dialogs.length; di++) {
          var d = dialogs[di];
          var r = d.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          var allText = (d.textContent || '').toLowerCase();
          var looksLikeRevert =
            allText.indexOf('revert') !== -1 ||
            allText.indexOf('discard') !== -1 ||
            allText.indexOf('checkpoint') !== -1 ||
            allText.indexOf('restore') !== -1 ||
            (allText.indexOf('submit') !== -1 && allText.indexOf('previous') !== -1 && allText.indexOf('message') !== -1);
          if (!looksLikeRevert) continue;

          var titleEl = d.querySelector('h1, h2, .dialog-message-title, [class*="title"]');
          var title = titleEl ? (titleEl.textContent || '').trim() : '';
          if (!title) title = (d.textContent || '').trim().split('\\n')[0].substring(0, 140);

          var bodyEl = d.querySelector('.dialog-message-detail, [class*="detail"], [class*="description"], p');
          var body = bodyEl ? (bodyEl.textContent || '').trim() : '';
          if (!body) body = (d.textContent || '').trim().substring(0, 400);

          var btns = __dialogClickables(d);
          var out = [];
          for (var bi = 0; bi < btns.length; bi++) {
            var br = btns[bi].getBoundingClientRect();
            if (br.width <= 0 || br.height <= 0) continue;
            var label = __actionableLabel(btns[bi]);
            if (!label || label.length > 100) continue;
            var kind = __classifyKind(label.toLowerCase());
            out.push({ text: label, kind: kind });
          }

          if (out.length > 0) {
            return { title: title.substring(0, 200), body: body.substring(0, 800), buttons: out };
          }
        }
        return null;
      })()
    `) as { title: string; body: string; buttons: { text: string; kind: string }[] } | null;

    if (!raw) return null;
    return {
      title: raw.title,
      body: raw.body,
      buttons: raw.buttons.map((b) => ({
        text: b.text,
        kind: (b.kind === 'destructive' || b.kind === 'cancel') ? b.kind : 'other',
      })),
    };
  }

  /**
   * Any sizable modal with visible buttons (edit-message / branch / generic confirm).
   * Read-only — used after {@link editHumanMessage}.
   */
  private async probeAnyChoiceDialog(): Promise<
    | { title: string; body: string; buttons: { text: string; kind: 'destructive' | 'cancel' | 'other' }[] }
    | null
  > {
    const raw = (await this.client!.evaluate(
      makeProbeAnyChoiceDialogEval(),
    )) as { title: string; body: string; buttons: { text: string; kind: string }[] } | null;

    if (!raw) return null;
    return {
      title: raw.title,
      body: raw.body,
      buttons: raw.buttons.map((b) => ({
        text: b.text,
        kind: (b.kind === 'destructive' || b.kind === 'cancel') ? b.kind : 'other',
      })),
    };
  }

  /**
   * Last-resort: any modal with 2+ visible action buttons (edit-submit / branch / continue
   * flows sometimes use copy that does not match {@link probeAnyChoiceDialog} keywords).
   */
  private async probeLooseChoiceDialog(): Promise<
    | { title: string; body: string; buttons: { text: string; kind: 'destructive' | 'cancel' | 'other' }[] }
    | null
  > {
    const raw = await this.client!.evaluate(`
      (function() {
        ${DIALOG_LABEL_HELPERS}
        var vw = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1200;
        var vh = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 800;
        var dialogs = __collectDialogRoots();
        for (var di = 0; di < dialogs.length; di++) {
          var d = dialogs[di];
          var r = d.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          if (r.width > vw * 0.94 && r.height > vh * 0.9) continue;
          var btns = __dialogClickables(d);
          var visibleBtnCount = 0;
          for (var bi = 0; bi < btns.length; bi++) {
            var br = btns[bi].getBoundingClientRect();
            if (br.width > 0 && br.height > 0) visibleBtnCount++;
          }
          if (visibleBtnCount < 2) continue;
          if (r.width < 200 || r.height < 44) continue;

          var titleEl = d.querySelector('h1, h2, .dialog-message-title, [class*="title"]');
          var title = titleEl ? (titleEl.textContent || '').trim() : '';
          if (!title) title = (d.textContent || '').trim().split('\\n')[0].substring(0, 140);

          var bodyEl = d.querySelector('.dialog-message-detail, [class*="detail"], [class*="description"], p');
          var body = bodyEl ? (bodyEl.textContent || '').trim() : '';
          if (!body) body = (d.textContent || '').trim().substring(0, 400);

          var out = [];
          for (var bj = 0; bj < btns.length; bj++) {
            var brr = btns[bj].getBoundingClientRect();
            if (brr.width <= 0 || brr.height <= 0) continue;
            var label = __actionableLabel(btns[bj]);
            if (!label || label.length > 100) continue;
            var kind = __classifyKind(label.toLowerCase());
            out.push({ text: label, kind: kind });
          }

          if (out.length >= 2) {
            return { title: title.substring(0, 200), body: body.substring(0, 800), buttons: out };
          }
        }
        return null;
      })()
    `) as { title: string; body: string; buttons: { text: string; kind: string }[] } | null;

    if (!raw) return null;
    return {
      title: raw.title,
      body: raw.body,
      buttons: raw.buttons.map((b) => ({
        text: b.text,
        kind: (b.kind === 'destructive' || b.kind === 'cancel') ? b.kind : 'other',
      })),
    };
  }

  /**
   * Poll after edit submit — dialog may mount a few hundred ms after Enter.
   */
  async pollEditSubmitChoiceDialog(maxMs = 9000): Promise<
    | { title: string; body: string; buttons: { text: string; kind: 'destructive' | 'cancel' | 'other' }[] }
    | null
  > {
    this.ensureConnected();
    const deadline = Date.now() + Math.min(15_000, Math.max(500, maxMs));
    while (Date.now() < deadline) {
      const d =
        (await this.probeAnyChoiceDialog()) ??
        (await this.probeRevertDialog()) ??
        (await this.probeLooseChoiceDialog());
      if (d && d.buttons.length > 0) return d;
      await this.sleep(280);
    }
    return null;
  }

  /**
   * Click a button inside a modal by exact visible label.
   * @param predicate `revert` — only revert/checkpoint-themed dialogs; `any` — first qualifying modal.
   */
  private async confirmDialogByExactButton(
    buttonText: string,
    predicate: 'revert' | 'any',
  ): Promise<{ ok: boolean; clicked?: string; error?: string }> {
    this.ensureConnected();

    if (typeof buttonText !== 'string' || buttonText.length === 0) {
      return { ok: false, error: 'buttonText is required — no heuristic fallback' };
    }

    const prefJson = JSON.stringify(buttonText);
    const predJson = JSON.stringify(predicate);

    try {
      const res = await this.client!.evaluate(`
        (function() {
          ${DIALOG_LABEL_HELPERS}
          var pref = ${prefJson};
          var predicate = ${predJson};
          var dialogs = __collectDialogRoots();
          for (var di = 0; di < dialogs.length; di++) {
            var d = dialogs[di];
            var r = d.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) continue;
            var allText = (d.textContent || '').toLowerCase();
            if (predicate === 'revert') {
              var looksRevert =
                allText.indexOf('revert') !== -1 ||
                allText.indexOf('discard') !== -1 ||
                allText.indexOf('checkpoint') !== -1 ||
                allText.indexOf('restore') !== -1 ||
                (allText.indexOf('submit') !== -1 && allText.indexOf('previous') !== -1 && allText.indexOf('message') !== -1);
              if (!looksRevert) continue;
            } else {
              if (r.width < 160 || r.height < 56) continue;
            }

            var btns = __dialogClickables(d);
            for (var p1 = 0; p1 < btns.length; p1++) {
              var rp = btns[p1].getBoundingClientRect();
              if (rp.width <= 0 || rp.height <= 0) continue;
              if (__labelsMatch(btns[p1], pref)) {
                btns[p1].click();
                return { ok: true, clicked: __actionableLabel(btns[p1]) };
              }
            }
          }
          return { ok: false, error: predicate === 'revert' ? 'No matching dialog or button label' : 'No eligible dialog or button label' };
        })()
      `) as { ok: boolean; clicked?: string; error?: string };

      if (res.ok) this.log(`Dialog confirm (${predicate}): clicked "${res.clicked}"`);
      return res;
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Confirm an open revert/discard dialog by clicking the button whose visible
   * text matches `buttonText` EXACTLY.
   */
  async confirmRevertDialog(buttonText: string): Promise<{
    ok: boolean;
    clicked?: string;
    error?: string;
  }> {
    return this.confirmDialogByExactButton(buttonText, 'revert');
  }

  /** Confirm any open Cursor modal (e.g. edit-message branch / continue). */
  async confirmAnyDialogButton(buttonText: string): Promise<{
    ok: boolean;
    clicked?: string;
    error?: string;
  }> {
    return this.confirmDialogByExactButton(buttonText, 'any');
  }

  async switchMode(publicMode: string): Promise<{ ok: boolean; previousMode?: string; newMode?: string; error?: string }> {
    this.ensureConnected();

    const internalTarget = publicToInternal(publicMode);
    if (!internalTarget) {
      return { ok: false, error: `Unknown mode: "${publicMode}"` };
    }

    try {
      // Step 1: Read current internal mode
      const currentInternal = await this.client!.evaluate(`
        (function() {
          var dd = document.querySelector('.composer-unified-dropdown[data-mode]');
          return dd ? dd.getAttribute('data-mode') : null;
        })()
      `) as string | null;

      const currentPublic = internalToPublic(currentInternal) ?? currentInternal;

      if (currentInternal === internalTarget) {
        return { ok: true, previousMode: currentPublic ?? undefined, newMode: publicMode };
      }

      // Step 2: Click the dropdown to open it
      await this.client!.evaluate(`
        (function() {
          var dd = document.querySelector('.composer-unified-dropdown[data-mode]');
          if (dd) dd.click();
        })()
      `);
      await this.sleep(300);

      // Step 3: Click the menu item matching the public label (dropdown shows "Ask", "Agent", etc.)
      const menuLabel = publicMode.charAt(0).toUpperCase() + publicMode.slice(1);
      const clickResult = await this.client!.evaluate(`
        (function() {
          var target = '${menuLabel.toLowerCase()}';
          var items = document.querySelectorAll('.composer-unified-context-menu-item');
          for (var i = 0; i < items.length; i++) {
            var text = (items[i].textContent || '').trim().toLowerCase().replace(/ctrl.*$/i, '').trim();
            if (text === target) {
              items[i].click();
              return { clicked: true, text: text };
            }
          }
          return { clicked: false };
        })()
      `) as { clicked: boolean; text?: string };

      if (!clickResult.clicked) {
        await this.client!.pressKey('Escape', 'Escape', 27);
        return { ok: false, error: `Mode "${publicMode}" not found in dropdown` };
      }

      await this.sleep(200);

      // Step 4: Verify — read internal value and normalize to public
      const afterInternal = await this.client!.evaluate(`
        (function() {
          var dd = document.querySelector('.composer-unified-dropdown[data-mode]');
          return dd ? dd.getAttribute('data-mode') : null;
        })()
      `) as string | null;

      const afterPublic = internalToPublic(afterInternal) ?? afterInternal;
      this.log(`Mode switch: ${currentPublic} → ${afterPublic}`);
      return { ok: true, previousMode: currentPublic ?? undefined, newMode: afterPublic ?? undefined };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // -----------------------------------------------------------------------
  // Stop generation
  // -----------------------------------------------------------------------

  private static STOP_CHECK_JS = `
    (function() {
      var stopBtn = document.querySelector('[data-stop-button="true"]');
      var els = document.querySelectorAll('[data-flat-index]');
      var last = els.length > 0 ? els[els.length - 1] : null;
      var lastType = null;
      if (last) {
        if (last.querySelector('.anysphere-loading-v3')) lastType = 'loading';
        else if (last.getAttribute('data-kind') === 'assistant') lastType = 'assistant';
        else if (last.getAttribute('data-kind') === 'tool') lastType = 'tool';
        else if (last.querySelector('.ui-collapsible-header')) lastType = 'thought';
        else lastType = last.getAttribute('data-kind') || 'unknown';
      }
      return { stopBtnVisible: !!stopBtn, lastType: lastType };
    })()`;

  async stopGeneration(): Promise<{ ok: boolean; error?: string }> {
    this.ensureConnected();

    try {
      // Attempt stop: native button first, Escape as fallback
      const clicked = await this.client!.evaluate(`
        (function() {
          var stopBtn = document.querySelector('[data-stop-button="true"]');
          if (stopBtn) {
            stopBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            return 'stop-button';
          }
          return null;
        })()
      `) as string | null;

      if (!clicked) {
        await this.client!.pressKey('Escape', 'Escape', 27);
        this.log('Stop: Escape key fallback (no stop button found)');
      } else {
        this.log('Stop: clicked stop button');
      }

      // Verify: poll up to ~1.5s for the stop to take effect
      for (let i = 0; i < 3; i++) {
        await this.sleep(500);
        const check = await this.client!.evaluate(CdpStateManager.STOP_CHECK_JS) as {
          stopBtnVisible: boolean;
          lastType: string | null;
        };

        if (!check.stopBtnVisible) {
          this.log('Stop verified: stop button disappeared');
          return { ok: true };
        }
      }

      this.log('Stop: button still visible after 1.5s — stop did not take effect');
      return { ok: false, error: 'Stop did not take effect' };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // -----------------------------------------------------------------------
  // Model switching
  // -----------------------------------------------------------------------

  /**
   * Read current model name from the picker trigger text.
   * The trigger shows "Auto" or a specific model name, possibly with a speed badge.
   */
  private static MODEL_READ_JS = `
    (function() {
      var el = document.querySelector('.ui-model-picker__trigger-text');
      if (!el) return null;
      var t = (el.textContent || '').trim();
      return t.replace(/\\s+(Fast|Medium|High|Low|Edit)$/i, '').trim() || null;
    })()`;

  /**
   * JS snippet that ensures Auto mode is OFF so the model list is visible.
   * Returns the previous Auto state so it can be restored.
   */
  private static ENSURE_AUTO_OFF_JS = `
    (function() {
      var row = document.querySelector('[data-testid="auto-mode-toggle"]');
      if (!row) return { error: 'auto toggle not found', wasOn: false };
      var wasOn = row.getAttribute('aria-checked') === 'true';
      if (wasOn) row.click();
      return { wasOn: wasOn };
    })()`;

  private static RESTORE_AUTO_ON_JS = `
    (function() {
      var row = document.querySelector('[data-testid="auto-mode-toggle"]');
      if (!row) return;
      if (row.getAttribute('aria-checked') === 'false') row.click();
    })()`;

  /**
   * JS snippet that reads all model names from an open picker (Auto must be OFF).
   * Names are in `<p>` tags within `.ui-menu__title`, with speed badges stripped.
   */
  private static READ_MODEL_LIST_JS = `
    (function() {
      var menu = document.querySelector('.ui-model-picker__menu');
      if (!menu) return [];
      var rows = menu.querySelectorAll('li[data-testid^="model-item-"]');
      var names = [];
      for (var i = 0; i < rows.length; i++) {
        var p = rows[i].querySelector('p');
        if (!p) continue;
        var name = (p.textContent || '').trim();
        name = name.replace(/\\s+(Fast|Medium|High|Low|Edit)$/i, '').trim();
        if (name && name !== 'Add Models') names.push(name);
      }
      return names;
    })()`;

  async switchModel(targetModel: string): Promise<{
    ok: boolean;
    previousModel?: string;
    newModel?: string;
    availableModels?: string[];
    error?: string;
  }> {
    this.ensureConnected();
    this._uiOperationInProgress = true;

    try {
      const currentModel = await this.client!.evaluate(CdpStateManager.MODEL_READ_JS) as string | null;

      if (currentModel && currentModel.toLowerCase() === targetModel.toLowerCase()) {
        return { ok: true, previousModel: currentModel, newModel: currentModel };
      }

      // Open picker
      const opened = await this.client!.evaluate(`
        (function() {
          var btn = document.querySelector('button.ui-model-picker__trigger');
          if (!btn) return false;
          btn.click();
          return true;
        })()
      `) as boolean;
      if (!opened) return { ok: false, error: 'Model picker trigger button not found' };
      await this.sleep(500);

      // Special case: switching to "Auto"
      if (targetModel.toLowerCase() === 'auto') {
        await this.client!.evaluate(CdpStateManager.RESTORE_AUTO_ON_JS);
        await this.sleep(400);
        await this.client!.pressKey('Escape', 'Escape', 27);
        await this.sleep(100);
        const afterModel = await this.client!.evaluate(CdpStateManager.MODEL_READ_JS) as string | null;
        this.log(`Model switch: ${currentModel} → ${afterModel}`);
        return { ok: true, previousModel: currentModel ?? undefined, newModel: afterModel ?? undefined };
      }

      // Ensure Auto is OFF so model list is visible
      const autoInfo = await this.client!.evaluate(CdpStateManager.ENSURE_AUTO_OFF_JS) as { wasOn: boolean; error?: string };
      if (autoInfo.wasOn) await this.sleep(800);

      // Wait for model rows to appear
      for (let wait = 0; wait < 3; wait++) {
        const count = await this.client!.evaluate(`
          (function() {
            var menu = document.querySelector('.ui-model-picker__menu');
            return menu ? menu.querySelectorAll('li[data-testid^="model-item-"]').length : 0;
          })()
        `) as number;
        if (count > 0) break;
        await this.sleep(500);
      }

      // Find and click the target model
      const pickResult = await this.client!.evaluate(`
        (function() {
          var target = '${targetModel.replace(/'/g, "\\'")}';
          var targetLower = target.toLowerCase();
          var menu = document.querySelector('.ui-model-picker__menu');
          if (!menu) return { found: false, error: 'Model picker menu not found', models: [] };

          var rows = menu.querySelectorAll('li[data-testid^="model-item-"]');
          var models = [];
          var matchRow = null;

          for (var i = 0; i < rows.length; i++) {
            var p = rows[i].querySelector('p');
            if (!p) continue;
            var name = (p.textContent || '').trim();
            name = name.replace(/\\s+(Fast|Medium|High|Low|Edit)$/i, '').trim();
            if (!name || name === 'Add Models') continue;
            models.push(name);
            if (name.toLowerCase() === targetLower) matchRow = rows[i];
          }

          if (!matchRow) return { found: false, models: models, error: 'not_found' };
          matchRow.click();
          return { found: true, models: models, clicked: true };
        })()
      `) as { found: boolean; models: string[]; error?: string };

      if (!pickResult.found) {
        if (autoInfo.wasOn) {
          await this.client!.evaluate(CdpStateManager.RESTORE_AUTO_ON_JS);
          await this.sleep(200);
        }
        await this.client!.pressKey('Escape', 'Escape', 27);
        await this.sleep(100);
        return {
          ok: false,
          previousModel: currentModel ?? undefined,
          availableModels: pickResult.models,
          error: `Model "${targetModel}" not found. Available: ${pickResult.models.join(', ')}`,
        };
      }

      await this.sleep(300);
      const afterModel = await this.client!.evaluate(CdpStateManager.MODEL_READ_JS) as string | null;
      this.log(`Model switch: ${currentModel} → ${afterModel}`);
      return {
        ok: true,
        previousModel: currentModel ?? undefined,
        newModel: afterModel ?? undefined,
        availableModels: pickResult.models,
      };
    } catch (err) {
      try { await this.client!.pressKey('Escape', 'Escape', 27); } catch {}
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      this._uiOperationInProgress = false;
    }
  }

  /**
   * Open the model picker, read available model names, close it.
   * Temporarily disables Auto if needed to reveal the model list.
   */
  async listModels(): Promise<{ models: string[]; currentModel: string | null; error?: string }> {
    this.ensureConnected();
    this._uiOperationInProgress = true;

    try {
      const currentModel = await this.client!.evaluate(CdpStateManager.MODEL_READ_JS) as string | null;

      // Open picker
      const opened = await this.client!.evaluate(`
        (function() {
          var btn = document.querySelector('button.ui-model-picker__trigger');
          if (!btn) return false;
          btn.click();
          return true;
        })()
      `) as boolean;
      if (!opened) return { models: [], currentModel, error: 'Model picker trigger not found' };
      await this.sleep(600);

      // Ensure Auto is OFF so model list is visible
      const autoInfo = await this.client!.evaluate(CdpStateManager.ENSURE_AUTO_OFF_JS) as { wasOn: boolean; error?: string };
      if (autoInfo.wasOn) await this.sleep(800);

      // Poll for model rows to appear (they may render asynchronously)
      let models: string[] = [];
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) await this.sleep(500);
        models = await this.client!.evaluate(CdpStateManager.READ_MODEL_LIST_JS) as string[];
        if (models.length > 0) break;
      }

      // Restore Auto if it was ON
      if (autoInfo.wasOn) {
        await this.client!.evaluate(CdpStateManager.RESTORE_AUTO_ON_JS);
        await this.sleep(200);
      }

      // Close picker
      await this.client!.pressKey('Escape', 'Escape', 27);
      await this.sleep(100);

      // Include "Auto" as first option
      if (!models.includes('Auto')) models.unshift('Auto');

      return { models, currentModel };
    } catch (err) {
      try { await this.client!.pressKey('Escape', 'Escape', 27); } catch {}
      return { models: [], currentModel: null, error: err instanceof Error ? err.message : String(err) };
    } finally {
      this._uiOperationInProgress = false;
    }
  }

  /**
   * Inject an image into Cursor's composer via the hidden file input and CDP DOM.setFileInputFiles.
   * The image must already be written to a temp file on disk.
   */
  async injectImage(filePath: string): Promise<{ ok: boolean; pillCount?: number; error?: string }> {
    this.ensureConnected();

    try {
      // Step 1: Enable DOM domain (needed for setFileInputFiles)
      await this.client!.send('DOM.enable');

      // Step 2: Count existing image pills before injection
      const beforeCount = await this.client!.evaluate(`
        (function() {
          var pills = document.querySelectorAll('.context-pill-image');
          return pills.length;
        })()
      `) as number;

      // Step 3: Find the file input
      const doc = await this.client!.send('DOM.getDocument', { depth: 0 }) as { root: { nodeId: number } };
      const fileNode = await this.client!.send('DOM.querySelector', {
        nodeId: doc.root.nodeId,
        selector: 'input[type="file"]',
      }) as { nodeId: number };

      if (!fileNode.nodeId || fileNode.nodeId === 0) {
        return { ok: false, error: 'Image file input not found in Cursor UI' };
      }

      // Step 4: Set the file
      await this.client!.send('DOM.setFileInputFiles', {
        nodeId: fileNode.nodeId,
        files: [filePath],
      });

      // Step 4.5: Dispatch change event so Cursor registers the file
      const { object } = await this.client!.send('DOM.resolveNode', { nodeId: fileNode.nodeId }) as any;
      if (object && object.objectId) {
        await this.client!.send('Runtime.callFunctionOn', {
          objectId: object.objectId,
          functionDeclaration: `function() {
            this.dispatchEvent(new Event('change', { bubbles: true }));
          }`
        });
      }

      // Step 5: Poll for the new image pill (Cursor may take a moment to process)
      for (let attempt = 0; attempt < 4; attempt++) {
        await this.sleep(attempt === 0 ? 800 : 500);

        const afterCount = await this.client!.evaluate(`
          (function() {
            var pills = document.querySelectorAll('.context-pill-image');
            return pills.length;
          })()
        `) as number;

        const newPills = afterCount - beforeCount;
        if (newPills > 0) {
          this.log(`Image injected: ${newPills} new pill(s) (total ${afterCount})`);
          return { ok: true, pillCount: afterCount };
        }
      }

      this.log('Image injection: file set but no new pill appeared after retries');
      return { ok: false, error: 'File was set but Cursor did not show an image attachment' };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // -----------------------------------------------------------------------
  // Terminal extraction
  // -----------------------------------------------------------------------

  /** True if at least one xterm has a readable buffer (DOM may exist before buffer is ready). */
  private static TERMINAL_HAS_XTERM_JS = `
    (function() {
      var wrappers = document.querySelectorAll('.xterm-wrapper');
      for (var i = 0; i < wrappers.length; i++) {
        var x = wrappers[i].xterm;
        if (x && x.buffer && x.buffer.active) return true;
      }
      return false;
    })()`;

  /** Focus the first visible terminal instance (helps when the wrong tab is active). */
  private static TERMINAL_FOCUS_CLICK_JS = `
    (function() {
      var wrappers = document.querySelectorAll('.xterm-wrapper');
      for (var i = 0; i < wrappers.length; i++) {
        var w = wrappers[i];
        if (!w.xterm) continue;
        var r = w.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        var cx = r.left + Math.min(r.width / 2, 40);
        var cy = r.top + Math.min(r.height / 2, 20);
        try {
          w.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window }));
          w.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window }));
          w.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window }));
        } catch (e) {}
        return true;
      }
      return false;
    })()`;

  /**
   * Pick the best terminal among all .xterm-wrapper instances (fixes "no active tab"
   * when .active is missing or multiple tabs exist).
   */
  private static TERMINAL_EXTRACT_JS = `
    (function() {
      function getTerminalTabs() {
        var panel = document.querySelector('.part.panel.bottom') || document.querySelector('.part.panel');
        var tabs = [];
        var nodes = null;
        if (panel) {
          nodes = panel.querySelectorAll('.tabs-container .tab');
          if (!nodes.length) nodes = panel.querySelectorAll('.terminal-tab');
          if (!nodes.length) nodes = panel.querySelectorAll('.terminal-tabs-entry');
        }
        if (nodes && nodes.length) {
          for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            var labelEl = el.querySelector('.monaco-icon-label') || el.querySelector('.label-name') || el.querySelector('.tab-label');
            var title = labelEl ? (labelEl.textContent || '') : (el.textContent || '');
            title = String(title).replace(/\\s+/g, ' ').trim();
            if (!title) title = 'Terminal ' + (i + 1);
            tabs.push({ index: i, title: title, active: el.classList.contains('active') });
          }
        }
        if (!tabs.length) {
          var st = document.querySelector('.single-terminal-tab');
          if (st) {
            var t = String(st.textContent || '').trim() || 'Terminal';
            tabs.push({ index: 0, title: t, active: true });
          }
        }
        return tabs;
      }

      function activeTitleFromTabs(tabs) {
        for (var ti = 0; ti < tabs.length; ti++) {
          if (tabs[ti].active) return tabs[ti].title;
        }
        return tabs.length ? tabs[0].title : '';
      }

      function readOne(xterm) {
        var buf = xterm.buffer && xterm.buffer.active;
        if (!buf) return null;
        var lines = [];
        for (var i = 0; i < buf.length; i++) {
          var line = buf.getLine(i);
          if (line) lines.push(line.translateToString(true));
        }
        while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
        return { lines: lines, buf: buf, cols: xterm.cols, rows: xterm.rows };
      }

      var tabs = getTerminalTabs();
      var tabName = activeTitleFromTabs(tabs);
      if (!tabName) {
        var leg = document.querySelector('.single-terminal-tab');
        if (leg) tabName = (leg.textContent || '').trim();
      }

      var wrappers = document.querySelectorAll('.xterm-wrapper');
      var best = null;
      var bestScore = -999;

      for (var w = 0; w < wrappers.length; w++) {
        var wrapper = wrappers[w];
        var xterm = wrapper.xterm;
        if (!xterm) continue;
        var data = readOne(xterm);
        if (!data) continue;

        var termW = wrapper.closest('.terminal-wrapper');
        var isActive = termW ? termW.classList.contains('active') : false;
        var inPanel = !!wrapper.closest('.part.panel');
        var r = wrapper.getBoundingClientRect();
        var visible = r.width > 2 && r.height > 2;

        var score = 0;
        if (isActive) score += 20;
        if (visible) score += 15;
        if (inPanel) score += 8;
        if (data.lines.length > 0) score += 4;

        if (score > bestScore) {
          bestScore = score;
          best = { data: data, xterm: xterm };
        }
      }

      if (best) {
        var d = best.data;
        return {
          available: true,
          content: d.lines.join('\\n'),
          lineCount: d.lines.length,
          cols: d.cols,
          rows: d.rows,
          cursorX: d.buf.cursorX,
          cursorY: d.buf.cursorY,
          tabName: tabName || activeTitleFromTabs(tabs),
          tabs: tabs,
        };
      }
      return {
        available: false,
        content: '',
        lineCount: 0,
        cols: 0,
        rows: 0,
        cursorX: 0,
        cursorY: 0,
        tabName: tabName,
        tabs: tabs,
      };
    })()`;

  async getTerminalContent(): Promise<TerminalSnapshot> {
    if (!this.client?.connected) {
      return {
        available: false, content: '', lineCount: 0,
        cols: 0, rows: 0, cursorX: 0, cursorY: 0,
        tabName: '', tabs: [], extractedAt: Date.now(),
        error: 'Not connected to Cursor',
      };
    }

    try {
      const raw = await this.client.evaluate(CdpStateManager.TERMINAL_EXTRACT_JS) as {
        available: boolean; content: string; lineCount: number;
        cols: number; rows: number; cursorX: number; cursorY: number; tabName: string;
        tabs?: TerminalTabInfo[];
      };
      const snapshot: TerminalSnapshot = {
        ...raw,
        tabs: raw.tabs ?? [],
        extractedAt: Date.now(),
      };
      this._lastTerminalSnapshot = snapshot;
      return snapshot;
    } catch (err) {
      return {
        available: false, content: '', lineCount: 0,
        cols: 0, rows: 0, cursorX: 0, cursorY: 0,
        tabName: '', tabs: [], extractedAt: Date.now(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Open Command Palette, type a command label, press Enter (no result check). */
  private async runCommandPaletteCommand(commandPhrase: string): Promise<void> {
    if (!this.client?.connected) return;
    await this.client.pressKey('Escape', 'Escape', 27);
    await this.sleep(120);
    await this.client.pressKeyRawChord('p', 'KeyP', 80, 10);
    await this.sleep(550);
    await this.client.pressKey('a', 'KeyA', 65, 2);
    await this.sleep(40);
    await this.client.pressKey('Backspace', 'Backspace', 8);
    await this.sleep(50);
    await this.client.typeText(commandPhrase);
    await this.sleep(450);
    await this.client.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
      unmodifiedText: '\r',
      text: '\r',
    });
    await this.client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
    await this.sleep(750);
  }

  /** Run Command Palette (Ctrl+Shift+P) and execute first matching command by typed label. */
  private async tryTerminalCommandPalette(commandPhrase: string): Promise<boolean> {
    if (!this.client?.connected) return false;
    try {
      await this.runCommandPaletteCommand(commandPhrase);
      return (await this.client.evaluate(CdpStateManager.TERMINAL_HAS_XTERM_JS)) as boolean;
    } catch {
      return false;
    }
  }

  /** Count integrated terminal sessions (xterm instances). */
  private static TERMINAL_XTERM_COUNT_JS = `
    (function() {
      var n = 0;
      var w = document.querySelectorAll('.xterm-wrapper');
      for (var i = 0; i < w.length; i++) {
        if (w[i].xterm) n++;
      }
      return n;
    })()`;

  /**
   * Xterm count + tab strip count (single-tab UIs count as 1 when `.single-terminal-tab` exists).
   * Used to detect kill success when xterm DOM lags behind tab removal or vice versa.
   */
  private static TERMINAL_SESSION_METRICS_JS = `
    (function() {
      var xN = 0;
      var w = document.querySelectorAll('.xterm-wrapper');
      for (var i = 0; i < w.length; i++) {
        if (w[i].xterm) xN++;
      }
      var panel = document.querySelector('.part.panel.bottom') || document.querySelector('.part.panel');
      var tabN = 0;
      if (panel) {
        var nodes = panel.querySelectorAll('.tabs-container .tab');
        if (!nodes.length) nodes = panel.querySelectorAll('.terminal-tab');
        if (!nodes.length) nodes = panel.querySelectorAll('.terminal-tabs-entry');
        tabN = nodes.length;
        if (!tabN && panel.querySelector('.single-terminal-tab')) tabN = 1;
      }
      if (!tabN && xN > 0) tabN = xN;
      return { xterm: xN, tabs: tabN };
    })()`;

  /** Click "New Terminal" (+) in the panel / workbench (shared with ensureTerminalPanelOpen). */
  private static NEW_TERMINAL_CLICK_JS = `
    (function() {
      var selectors = [
        '[aria-label="New Terminal"]',
        '[aria-label="Create New Terminal"]',
        '[aria-label*="New Terminal"]',
        '.terminal-actions .codicon-add',
        '.panel .title-actions .codicon-add',
        '.monaco-workbench .part.panel .title-actions .codicon-add',
        'li.action-item[aria-label*="New Terminal"] a',
        '.panel .title-actions a.codicon-add',
        '[aria-label="Toggle Terminal"]'
      ];
      for (var i = 0; i < selectors.length; i++) {
        var el = document.querySelector(selectors[i]);
        if (!el) continue;
        var r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          try { el.click(); } catch (e) {}
          return { ok: true, sel: selectors[i] };
        }
      }
      return { ok: false };
    })()`;

  /**
   * Find kill/trash targets (same control as the terminal toolbar trash icon), try DOM clicks,
   * return best viewport coords for CDP mouse fallback.
   */
  private static TERMINAL_KILL_INTERACTION_JS = `
    (function() {
      function vis(el) {
        if (!el) return false;
        var r = el.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
      }
      function center(el) {
        var r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      function resolveClickable(iconOrEl) {
        if (!iconOrEl) return null;
        var a = iconOrEl.closest && iconOrEl.closest('a.action-item');
        if (a && vis(a)) return a;
        var li = iconOrEl.closest && iconOrEl.closest('li.action-item');
        if (li && vis(li)) return li;
        var ai = iconOrEl.closest && iconOrEl.closest('.action-item');
        if (ai && vis(ai)) return ai;
        return vis(iconOrEl) ? iconOrEl : null;
      }
      function deepClick(el) {
        if (!vis(el)) return false;
        var c = center(el);
        try { el.focus(); } catch (e) {}
        ['mousedown', 'mouseup', 'click'].forEach(function(type) {
          try {
            el.dispatchEvent(new MouseEvent(type, {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: c.x,
              clientY: c.y,
              button: 0,
              buttons: type === 'mousedown' ? 1 : 0
            }));
          } catch (e) {}
        });
        try { el.click(); } catch (e) {}
        return true;
      }

      var candidates = [];
      var seen = new Set();
      function push(el, score, tag) {
        var clickEl = resolveClickable(el) || (el && vis(el) ? el : null);
        if (!clickEl || seen.has(clickEl)) return;
        seen.add(clickEl);
        var c = center(clickEl);
        candidates.push({ el: clickEl, x: c.x, y: c.y, score: score, tag: tag });
      }

      var panel = document.querySelector('.part.panel.bottom') || document.querySelector('.part.panel');
      var termActions =
        document.querySelector('.monaco-workbench .terminal-actions') ||
        (panel ? panel.querySelector('.terminal-actions') : null);

      if (termActions) {
        var icons = termActions.querySelectorAll('.codicon-trash, .codicon-terminal-kill');
        for (var i = 0; i < icons.length; i++) {
          push(icons[i], 600, 'toolbar-trash-icon');
        }
        var ais = termActions.querySelectorAll('.action-item, li.action-item');
        for (var j = 0; j < ais.length; j++) {
          var it = ais[j];
          var lab = (it.getAttribute('aria-label') || it.getAttribute('title') || '').toLowerCase();
          if (lab.indexOf('kill') !== -1 || lab.indexOf('trash') !== -1) {
            push(it, 580, 'toolbar-aria-kill');
          }
        }
      }

      var taAll = document.querySelectorAll('.monaco-workbench .terminal-actions');
      for (var ta = 0; ta < taAll.length; ta++) {
        if (termActions && taAll[ta] === termActions) continue;
        var ic2 = taAll[ta].querySelectorAll('.codicon-trash');
        for (var u = 0; u < ic2.length; u++) {
          push(ic2[u], 550, 'toolbar-trash-alt');
        }
      }

      if (panel) {
        var trashPanel = panel.querySelectorAll('.codicon-trash');
        for (var k = 0; k < trashPanel.length; k++) {
          var tr = trashPanel[k];
          if (termActions && termActions.contains(tr)) continue;
          var inTabs = tr.closest && tr.closest('.tabs-container');
          var inTitle = tr.closest && tr.closest('.title');
          if (inTabs || inTitle) {
            push(tr, inTabs ? 420 : 380, 'panel-tab-title-trash');
          }
        }
      }

      var ariaKill = document.querySelectorAll('[aria-label="Kill Terminal"], [aria-label*="Kill Terminal"], [title="Kill Terminal"]');
      for (var m = 0; m < ariaKill.length; m++) {
        var ak = ariaKill[m];
        if (panel && ak.closest && !ak.closest('.part.panel') && !ak.closest('.terminal-actions')) continue;
        push(ak, 500, 'aria-kill');
      }

      candidates.sort(function(a, b) { return b.score - a.score; });

      var tried = [];
      for (var t = 0; t < Math.min(4, candidates.length); t++) {
        if (deepClick(candidates[t].el)) tried.push(candidates[t].tag);
      }

      var best = candidates.length ? { x: candidates[0].x, y: candidates[0].y } : null;
      return { tried: tried, coords: best, candidateCount: candidates.length };
    })()`;

  private async getTerminalXtermCount(): Promise<number> {
    if (!this.client?.connected) return 0;
    try {
      const n = await this.client.evaluate(CdpStateManager.TERMINAL_XTERM_COUNT_JS);
      return typeof n === 'number' && !Number.isNaN(n) ? n : 0;
    } catch {
      return 0;
    }
  }

  private async getTerminalSessionMetrics(): Promise<{ xterm: number; tabs: number }> {
    if (!this.client?.connected) return { xterm: 0, tabs: 0 };
    try {
      const m = await this.client.evaluate(CdpStateManager.TERMINAL_SESSION_METRICS_JS) as {
        xterm?: unknown;
        tabs?: unknown;
      };
      const xterm = typeof m?.xterm === 'number' && !Number.isNaN(m.xterm) ? m.xterm : 0;
      const tabs = typeof m?.tabs === 'number' && !Number.isNaN(m.tabs) ? m.tabs : 0;
      return { xterm, tabs };
    } catch {
      return { xterm: 0, tabs: 0 };
    }
  }

  /** True if an integrated terminal tab/session was removed vs baseline. */
  private killSucceeded(
    before: { xterm: number; tabs: number },
    after: { xterm: number; tabs: number },
  ): boolean {
    if (after.xterm < before.xterm) return true;
    if (before.tabs > 0 && after.tabs < before.tabs) return true;
    return false;
  }

  private async waitForTerminalKill(
    before: { xterm: number; tabs: number },
    maxMs: number,
  ): Promise<boolean> {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      const after = await this.getTerminalSessionMetrics();
      if (this.killSucceeded(before, after)) return true;
      await this.sleep(160);
    }
    const final = await this.getTerminalSessionMetrics();
    return this.killSucceeded(before, final);
  }

  /**
   * Kill the active integrated terminal tab in Cursor (shell session ends).
   * Verifies session count decreased; tries clicks then several Command Palette labels.
   */
  async killActiveTerminal(): Promise<{ ok: boolean; error?: string }> {
    this.ensureConnected();
    this._uiOperationInProgress = true;
    try {
      const before = await this.getTerminalSessionMetrics();
      if (before.xterm < 1) {
        return { ok: false, error: 'אין טרמינל פתוח לסגירה במחשב' };
      }

      await this.client!.evaluate(CdpStateManager.TERMINAL_FOCUS_CLICK_JS);
      await this.sleep(200);

      const killInteraction = await this.client!.evaluate(CdpStateManager.TERMINAL_KILL_INTERACTION_JS) as {
        tried: string[];
        coords: { x: number; y: number } | null;
        candidateCount: number;
      };
      this.log(
        `Terminal: kill DOM tried [${killInteraction.tried.join(', ')}], ` +
          `candidates=${killInteraction.candidateCount}`,
      );

      await this.sleep(550);
      if (await this.waitForTerminalKill(before, 400)) {
        return { ok: true };
      }

      if (killInteraction.coords) {
        const { x, y } = killInteraction.coords;
        await this.client!.clickAtViewport(x, y);
        if (await this.waitForTerminalKill(before, 1200)) {
          this.log('Terminal: kill via CDP click (trash coords)');
          return { ok: true };
        }
        await this.client!.clickAtViewport(x, y);
        if (await this.waitForTerminalKill(before, 1200)) {
          this.log('Terminal: kill via CDP click (2nd)');
          return { ok: true };
        }
      }

      const phrases = [
        'Kill Terminal',
        'Terminal: Kill the Active Terminal Instance',
        'Kill the Active Terminal Instance',
        'Kill Active Terminal',
        'workbench.action.terminal.kill',
      ];

      for (let pi = 0; pi < phrases.length; pi++) {
        await this.runCommandPaletteCommand(phrases[pi]);
        if (await this.waitForTerminalKill(before, 2200)) {
          this.log(`Terminal: kill via palette (${phrases[pi]})`);
          return { ok: true };
        }
        // Confirm-on-kill dialog
        await this.client!.pressKey('Enter', 'Enter', 13);
        await this.sleep(350);
        if (await this.waitForTerminalKill(before, 1200)) {
          this.log(`Terminal: kill via palette+Enter (${phrases[pi]})`);
          return { ok: true };
        }
      }

      const focusTabsPhrases = [
        'workbench.action.terminal.focus.tabsView',
        'Focus Terminal Tabs View',
      ];
      for (let fi = 0; fi < focusTabsPhrases.length; fi++) {
        await this.runCommandPaletteCommand(focusTabsPhrases[fi]);
        await this.sleep(420);
        await this.client!.pressKey('Delete', 'Delete', 46);
        await this.sleep(280);
        await this.client!.pressKey('Delete', 'Delete', 46);
        if (await this.waitForTerminalKill(before, 2200)) {
          this.log(`Terminal: kill via focus tabs + Delete (${focusTabsPhrases[fi]})`);
          return { ok: true };
        }
        await this.client!.pressKey('Enter', 'Enter', 13);
        await this.sleep(350);
        if (await this.waitForTerminalKill(before, 1200)) {
          this.log(`Terminal: kill via tabs Delete+Enter (${focusTabsPhrases[fi]})`);
          return { ok: true };
        }
      }

      if (await this.waitForTerminalKill(before, 500)) {
        return { ok: true };
      }

      return {
        ok: false,
        error:
          'לא הצלחנו לסגור את הטרמינל.\n\n' +
          'ב-Cursor: Ctrl+Shift+P\n' +
          'חפשו: Kill Active Terminal\n\n' +
          'או לחצו על סל המחיקה ליד הטאב של הטרמינל הפעיל.\n\n' +
          'אם מופיע אישור מחיקה — כבו ב-Settings: terminal.integrated.confirmOnKill',
      };
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'לא ניתן לסגור טרמינל — נסו ידנית ב-Cursor',
      };
    } finally {
      this._uiOperationInProgress = false;
    }
  }

  /**
   * Create a new integrated terminal tab (panel is opened if needed).
   */
  async openNewTerminal(): Promise<{ ok: boolean; error?: string; method?: string }> {
    this.ensureConnected();
    this._uiOperationInProgress = true;
    try {
      const panel = await this.ensureTerminalPanelOpen();
      if (!panel.ok) {
        return {
          ok: false,
          error: panel.error ?? 'לא ניתן לפתוח את פאנל הטרמינל ב-Cursor',
        };
      }

      await this.sleep(220);
      const before = await this.getTerminalXtermCount();

      const clickRes = await this.client!.evaluate(CdpStateManager.NEW_TERMINAL_CLICK_JS) as {
        ok: boolean;
        sel?: string;
      };
      if (clickRes.ok) {
        this.log(`Terminal: new via click (${clickRes.sel ?? 'unknown'})`);
      }
      await this.sleep(700);
      let after = await this.getTerminalXtermCount();
      if (after > before) {
        return { ok: true, method: clickRes.ok ? `click:${clickRes.sel}` : 'click' };
      }

      await this.runCommandPaletteCommand('Terminal: Create New Terminal');
      await this.sleep(900);
      after = await this.getTerminalXtermCount();
      if (after > before) {
        return { ok: true, method: 'palette:Terminal: Create New Terminal' };
      }

      await this.runCommandPaletteCommand('Create New Terminal');
      await this.sleep(900);
      after = await this.getTerminalXtermCount();
      if (after > before) {
        return { ok: true, method: 'palette:Create New Terminal' };
      }

      return {
        ok: false,
        error:
          'לא ניתן ליצור טרמינל חדש. ב-Cursor: Terminal -> New Terminal או כפתור + בפאנל.',
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'שגיאה בפתיחת טרמינל',
      };
    } finally {
      this._uiOperationInProgress = false;
    }
  }

  /**
   * Focus/open the integrated terminal when nothing is running yet.
   * Uses DOM clicks, Electron-friendly raw key chords, then Command Palette.
   */
  async ensureTerminalPanelOpen(): Promise<{ ok: boolean; method?: string; error?: string }> {
    this.ensureConnected();
    this._uiOperationInProgress = true;
    try {
      let after = await this.client!.evaluate(CdpStateManager.TERMINAL_HAS_XTERM_JS) as boolean;
      if (after) {
        return { ok: true, method: 'already-present' };
      }

      await this.client!.evaluate(CdpStateManager.TERMINAL_FOCUS_CLICK_JS);
      await this.sleep(200);
      after = await this.client!.evaluate(CdpStateManager.TERMINAL_HAS_XTERM_JS) as boolean;
      if (after) {
        return { ok: true, method: 'focus-click' };
      }

      const clickRes = await this.client!.evaluate(CdpStateManager.NEW_TERMINAL_CLICK_JS) as {
        ok: boolean;
        sel?: string;
      };

      await this.sleep(clickRes.ok ? 550 : 80);
      after = await this.client!.evaluate(CdpStateManager.TERMINAL_HAS_XTERM_JS) as boolean;
      if (after) {
        return { ok: true, method: clickRes.ok ? `click:${clickRes.sel}` : 'click-skip' };
      }

      const tryChord = async (mod: number): Promise<boolean> => {
        await this.client!.pressKeyRawChord('`', 'Backquote', 192, mod);
        await this.sleep(750);
        return (await this.client!.evaluate(CdpStateManager.TERMINAL_HAS_XTERM_JS)) as boolean;
      };

      if (await tryChord(10)) {
        this.log('Terminal: opened via Ctrl+Shift+` (raw)');
        return { ok: true, method: 'ctrl-shift-backquote' };
      }
      if (await tryChord(2)) {
        this.log('Terminal: opened via Ctrl+` (raw)');
        return { ok: true, method: 'ctrl-backquote' };
      }
      if (await tryChord(2)) {
        this.log('Terminal: opened via second Ctrl+` (raw)');
        return { ok: true, method: 'ctrl-backquote-2' };
      }
      if (await tryChord(10)) {
        this.log('Terminal: opened via second Ctrl+Shift+` (raw)');
        return { ok: true, method: 'ctrl-shift-backquote-2' };
      }

      if (await this.tryTerminalCommandPalette('View: Toggle Terminal')) {
        this.log('Terminal: opened via Command Palette (toggle)');
        return { ok: true, method: 'palette-toggle' };
      }
      if (await this.tryTerminalCommandPalette('Terminal: Create New Terminal')) {
        this.log('Terminal: opened via Command Palette (new)');
        return { ok: true, method: 'palette-new' };
      }

      return {
        ok: false,
        error:
          'לא נמצא טרמינל ב-Cursor. במחשב: פתח טרמינל (Terminal → New Terminal או Ctrl+Shift+`) וודא שחלון Cursor פעיל, ואז נסה שוב מהטלפון.',
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      this._uiOperationInProgress = false;
    }
  }

  /** Like getTerminalContent, then focus / open panel until a session appears or retries exhaust. */
  async getTerminalContentWithEnsure(): Promise<TerminalSnapshot> {
    let snap = await this.getTerminalContent();
    if (snap.available) return snap;

    try {
      await this.client!.evaluate(CdpStateManager.TERMINAL_FOCUS_CLICK_JS);
    } catch {
      /* ignore */
    }
    await this.sleep(200);
    snap = await this.getTerminalContent();
    if (snap.available) return snap;

    const opened = await this.ensureTerminalPanelOpen();
    if (!opened.ok && opened.error) {
      return {
        ...snap,
        extractedAt: Date.now(),
        error: opened.error,
      };
    }

    for (let i = 0; i < 10; i++) {
      await this.sleep(320);
      snap = await this.getTerminalContent();
      if (snap.available) return snap;
    }

    if (!snap.available && !snap.error) {
      return {
        ...snap,
        extractedAt: Date.now(),
        error:
          'הטרמינל עדיין לא מוכן. ודא שבמחשב יש חלון טרמינל פתוח בתוך Cursor (לא רק בעריכה).',
      };
    }
    return snap;
  }

  getLastTerminalSnapshot(): TerminalSnapshot | null {
    return this._lastTerminalSnapshot;
  }

  /**
   * Focus an integrated terminal tab by index (0-based), as shown in the panel tab strip.
   */
  async selectTerminalTab(index: number): Promise<{ ok: boolean; error?: string }> {
    this.ensureConnected();
    if (!Number.isFinite(index) || index < 0 || index !== Math.floor(index)) {
      return { ok: false, error: 'Invalid tab index' };
    }
    const idx = Math.floor(index);
    try {
      const result = await this.client!.evaluate(
        `(function() {
          var idx = ${idx};
          var panel = document.querySelector('.part.panel.bottom') || document.querySelector('.part.panel');
          var nodes = [];
          if (panel) {
            nodes = Array.prototype.slice.call(panel.querySelectorAll('.tabs-container .tab'));
            if (!nodes.length) nodes = Array.prototype.slice.call(panel.querySelectorAll('.terminal-tab'));
            if (!nodes.length) nodes = Array.prototype.slice.call(panel.querySelectorAll('.terminal-tabs-entry'));
          }
          if (idx >= 0 && idx < nodes.length) {
            try {
              nodes[idx].click();
              return { ok: true };
            } catch (e) {
              return { ok: false, error: String(e) };
            }
          }
          if (idx === 0) {
            var st = document.querySelector('.single-terminal-tab');
            if (st) {
              try {
                st.click();
                return { ok: true };
              } catch (e2) {}
            }
          }
          return { ok: false, error: 'Tab not found' };
        })()`,
      ) as { ok: boolean; error?: string };
      if (result.ok) {
        await this.sleep(220);
      }
      return result;
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Send text input to the active Cursor terminal via xterm's input API.
   * Optionally appends Enter (\r) when enter=true.
   */
  async sendTerminalInput(text: string, enter = false): Promise<{ ok: boolean; error?: string }> {
    this.ensureConnected();

    const tryOnce = async (): Promise<{ ok: boolean; method?: string; error?: string }> => {
      const payload = enter ? text + '\r' : text;
      const escaped = JSON.stringify(payload);

      return await this.client!.evaluate(`
        (function() {
          var wrappers = document.querySelectorAll('.xterm-wrapper');
          var best = null;
          var bestScore = -999;
          for (var w = 0; w < wrappers.length; w++) {
            var wrapper = wrappers[w];
            var xterm = wrapper.xterm;
            if (!xterm) continue;
            var termW = wrapper.closest('.terminal-wrapper');
            var isActive = termW ? termW.classList.contains('active') : false;
            var r = wrapper.getBoundingClientRect();
            var visible = r.width > 2 && r.height > 2;
            var score = (isActive ? 20 : 0) + (visible ? 10 : 0);
            if (score > bestScore) {
              bestScore = score;
              best = xterm;
            }
          }
          if (!best) return { ok: false, error: 'No active terminal found' };
          if (typeof best.input === 'function') {
            best.input(${escaped});
            return { ok: true, method: 'xterm.input' };
          }
          if (best._core && best._core._coreService && typeof best._core._coreService.triggerDataEvent === 'function') {
            best._core._coreService.triggerDataEvent(${escaped});
            return { ok: true, method: 'triggerDataEvent' };
          }
          return { ok: false, error: 'xterm found but no input method available' };
        })()
      `) as { ok: boolean; method?: string; error?: string };
    };

    try {
      let result = await tryOnce();
      if (!result.ok && result.error === 'No active terminal found') {
        await this.ensureTerminalPanelOpen();
        await this.sleep(500);
        result = await tryOnce();
      }
      if (result.ok) {
        this.log(`Terminal input sent via ${result.method} (${text.length} chars, enter=${enter})`);
      }
      return result;
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // -----------------------------------------------------------------------
  // Multi-chat: list, select, new
  // -----------------------------------------------------------------------

  private static CHAT_LIST_JS = `
    (function() {
      var cells = document.querySelectorAll('.agent-sidebar-cell[data-selected]');
      var chats = [];
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        var titleEl = c.querySelector('.agent-sidebar-cell-text');
        var subtitleEl = c.querySelector('.agent-sidebar-cell-subtitle');
        var captionEl = c.querySelector('.agent-sidebar-cell-caption');
        chats.push({
          index: i,
          title: titleEl ? titleEl.textContent.trim() : 'Chat ' + (i + 1),
          subtitle: subtitleEl ? subtitleEl.textContent.trim() : '',
          timeLabel: captionEl ? captionEl.textContent.trim() : '',
          active: c.getAttribute('data-selected') === 'true'
        });
      }
      var activeTab = document.querySelector('[role="tab"].active .composer-tab-label');
      return {
        chats: chats,
        activeChatTitle: activeTab ? activeTab.textContent.trim() : null
      };
    })()`;

  async listChats(): Promise<ChatListResult> {
    this.ensureConnected();

    try {
      const raw = await this.client!.evaluate(CdpStateManager.CHAT_LIST_JS) as {
        chats: ChatInfo[];
        activeChatTitle: string | null;
      };

      let activeChatIndex: number | null = null;
      for (const c of raw.chats) {
        if (c.active) { activeChatIndex = c.index; break; }
      }

      return {
        chats: raw.chats,
        activeChatIndex,
        activeChatTitle: raw.activeChatTitle,
      };
    } catch (err) {
      return { chats: [], activeChatIndex: null, activeChatTitle: null };
    }
  }

  async selectChat(index: number): Promise<{ ok: boolean; error?: string }> {
    this.ensureConnected();
    this._uiOperationInProgress = true;
    this._switchingChat = true;

    try {
      // Open sidebar to make cells clickable
      await this.client!.evaluate(`
        (function() {
          var sidebar = document.querySelector('.agent-sidebar');
          if (!sidebar) return;
          var sv = sidebar.closest('.split-view-view');
          if (sv && window.getComputedStyle(sv).display === 'none') {
            var btn = document.querySelector('[aria-label="Show Agents Side Bar"]');
            if (btn) btn.click();
          }
        })()
      `);
      await this.sleep(400);

      // Click the target chat cell
      const clickResult = await this.client!.evaluate(`
        (function() {
          var cells = document.querySelectorAll('.agent-sidebar-cell[data-selected]');
          var idx = ${index};
          if (idx < 0 || idx >= cells.length) return { ok: false, error: 'Index ' + idx + ' out of range (have ' + cells.length + ' chats)' };
          var target = cells[idx];
          target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          var titleEl = target.querySelector('.agent-sidebar-cell-text');
          return { ok: true, title: titleEl ? titleEl.textContent.trim() : '' };
        })()
      `) as { ok: boolean; error?: string; title?: string };

      if (!clickResult.ok) return clickResult;

      await this.sleep(600);

      // Verify the switch took effect
      const verify = await this.client!.evaluate(`
        (function() {
          var cells = document.querySelectorAll('.agent-sidebar-cell[data-selected]');
          var idx = ${index};
          if (idx >= cells.length) return { ok: false, error: 'Cell gone after click' };
          return { ok: cells[idx].getAttribute('data-selected') === 'true' };
        })()
      `) as { ok: boolean; error?: string };

      // Close sidebar
      await this.client!.evaluate(`
        (function() {
          var btn = document.querySelector('[aria-label="Hide Agents Side Bar"]');
          if (btn) btn.click();
        })()
      `);

      if (verify.ok) {
        this.log(`Chat switched to index ${index}: "${clickResult.title}"`);
        await this.pollOnce();
      }
      return verify;
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      this._switchingChat = false;
      this._uiOperationInProgress = false;
    }
  }

  async createNewChat(): Promise<{ ok: boolean; error?: string }> {
    this.ensureConnected();
    this._uiOperationInProgress = true;
    this._creatingChat = true;

    try {
      // Click the "New Agent" button (codicon-add-two) in the tab action bar
      const clickResult = await this.client!.evaluate(`
        (function() {
          var btn = document.querySelector('a.codicon-add-two');
          if (btn) { btn.click(); return { ok: true, method: 'codicon-add-two' }; }
          var btn2 = document.querySelector('.agent-sidebar-new-agent-button');
          if (btn2) { btn2.click(); return { ok: true, method: 'sidebar-new-agent' }; }
          return { ok: false, error: 'No new-chat button found' };
        })()
      `) as { ok: boolean; method?: string; error?: string };

      if (!clickResult.ok) return clickResult;

      await this.sleep(800);

      // Verify: message count should be 0 for a new chat
      const verify = await this.client!.evaluate(`
        (function() {
          var msgs = document.querySelectorAll('[data-flat-index]').length;
          var activeTab = document.querySelector('[role="tab"].active .composer-tab-label');
          return { ok: true, msgCount: msgs, title: activeTab ? activeTab.textContent.trim() : null };
        })()
      `) as { ok: boolean; msgCount: number; title: string | null };

      this.log(`New chat created: "${verify.title}" (${verify.msgCount} msgs)`);
      await this.pollOnce();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      this._creatingChat = false;
      this._uiOperationInProgress = false;
    }
  }

  private startTerminalPolling(): void {
    this.terminalPollTimer = setInterval(() => void this.pollTerminal(), 2000);
  }

  private stopTerminalPolling(): void {
    if (this.terminalPollTimer) {
      clearInterval(this.terminalPollTimer);
      this.terminalPollTimer = null;
    }
  }

  private async pollTerminal(): Promise<void> {
    if (!this.client?.connected || this._uiOperationInProgress) return;

    try {
      const snapshot = await this.getTerminalContent();
      if (!snapshot.available) return;

      const tabsSig = JSON.stringify(snapshot.tabs ?? []);
      if (
        snapshot.content !== this.lastTerminalContent ||
        tabsSig !== this.lastTerminalTabsSig
      ) {
        this.lastTerminalContent = snapshot.content;
        this.lastTerminalTabsSig = tabsSig;
        this.emit('terminal_change', {
          type: 'terminal_change',
          terminal: snapshot,
        } as TerminalChangeEvent);
      }
    } catch {
      // Silently skip failed terminal polls
    }
  }

  async switchProject(projectPath: string, expectedId: string): Promise<{ ok: boolean; error?: string }> {
    if (this._switchingProject) {
      return { ok: false, error: 'Project switch already in progress' };
    }
    this._switchingProject = true;
    this.log(`Switching project to: ${projectPath}`);

    // Broadcast the switching state immediately
    if (this.lastState) {
      const snapshot = this.buildSnapshot(this.lastState);
      this.emit('change', {
        type: 'state_change',
        snapshot,
        newMessages: [],
        removedCount: 0,
      } as StateChangeEvent);
    }

    try {
      // Step 1: Launch Cursor with the new folder (opens new window or reuses existing)
      launchCursorWithFolder(projectPath);
      this.log('Cursor CLI invoked — scanning for matching CDP target');

      // Step 2: Wait for a CDP target whose title includes the project folder name
      const deadline = Date.now() + 30_000;
      let connected = false;

      while (Date.now() < deadline) {
        await this.sleep(2000);
        try {
          const targets = await CdpClient.fetchTargets(this.cdpBase);
          const pages = targets.filter((t: { type: string }) => t.type === 'page');

          // Find a target matching the expected project
          const match = pages.find((t: { title: string }) => detectActiveProject(t.title) === expectedId);
          if (!match) {
            this.log(`No CDP target matches project "${expectedId}" yet (${pages.length} page targets)`);
            continue;
          }

          // Disconnect from old target, connect to the matching one
          this.client?.disconnect();
          this.client = new CdpClient(match.webSocketDebuggerUrl!);
          await this.client.connect();
          this.log(`Connected to: ${match.title}`);

          // Step 3: Wait for composer to appear in the new workspace
          for (let ci = 0; ci < 10; ci++) {
            await this.sleep(500);
            try {
              const hasComposer = await this.client.evaluate(`
                (function() {
                  var el = document.querySelector('.aislash-editor-input[contenteditable="true"]');
                  return !!el;
                })()
              `) as boolean;
              if (hasComposer) {
                this.log('Composer detected in new workspace');
                connected = true;
                break;
              }
            } catch {
              // DOM not ready yet
            }
          }
          if (connected) break;
          this.log('Composer not found in matched target, retrying...');
        } catch {
          // CDP not yet available
        }
      }

      if (!connected) {
        this.log('Project switch timed out waiting for matching target');
        return { ok: false, error: 'Timed out waiting for Cursor window with the new project' };
      }

      // Step 4: Extract fresh state
      this.lastState = null;
      try {
        const state = await this.client!.callFunction(extractCursorState);
        this.lastState = state;
        this.lastExtraction = Date.now();
        this.emit('change', {
          type: 'state_change',
          snapshot: this.buildSnapshot(state),
          newMessages: state.messages,
          removedCount: 0,
        } as StateChangeEvent);
      } catch (err) {
        this.log(`Post-switch extraction failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      this._switchingProject = false;
    }
  }

  // -----------------------------------------------------------------------
  // Connection management
  // -----------------------------------------------------------------------

  private async connectToCursor(): Promise<void> {
    try {
      const targets = await CdpClient.fetchTargets(this.cdpBase);
      const wb = CdpClient.findWorkbench(targets);
      this.client = new CdpClient(wb.webSocketDebuggerUrl!);
      await this.client.connect();
      this.log(`Connected to: ${wb.title}`);
    } catch (err) {
      this.log(`Connection failed: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  private async tryReconnect(): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;
    this.log('Attempting reconnect...');

    try {
      this.client?.disconnect();
      this.client = null;
      await this.connectToCursor();
      this.log('Reconnected successfully');
    } catch {
      this.log('Reconnect failed — will retry on next poll');
    } finally {
      this.reconnecting = false;
    }
  }

  private ensureConnected(): void {
    if (!this.client?.connected) {
      throw new Error('Not connected to Cursor. Check /health for details.');
    }
  }

  // -----------------------------------------------------------------------
  // Polling + Diffing
  // -----------------------------------------------------------------------

  private startPolling(): void {
    this.pollTimer = setInterval(() => void this.pollOnce(), this.pollIntervalMs);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollOnce(): Promise<void> {
    if (this._uiOperationInProgress) return;

    if (!this.client?.connected) {
      await this.tryReconnect();
      return;
    }

    try {
      const state = await this.client.callFunction(extractCursorState);
      const changed = this.hasChanged(this.lastState, state);

      if (changed) {
        const newMessages = this.findNewMessages(this.lastState, state);
        const removedCount = this.lastState
          ? Math.max(0, this.lastState.messageCount - state.messageCount + newMessages.length)
          : 0;

        this.lastState = state;
        this.lastExtraction = Date.now();

        const event: StateChangeEvent = {
          type: 'state_change',
          snapshot: this.buildSnapshot(state),
          newMessages,
          removedCount,
        };
        this.emit('change', event);
      } else if (!this.lastState) {
        this.lastState = state;
        this.lastExtraction = Date.now();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Not connected') || msg.includes('WebSocket closed')) {
        await this.tryReconnect();
      } else {
        this.log(`Poll error: ${msg}`);
      }
    }
  }

  private hasChanged(prev: ExtractedState | null, curr: ExtractedState): boolean {
    if (!prev) return true;
    if (prev.messageCount !== curr.messageCount) return true;
    if (prev.isGenerating !== curr.isGenerating) return true;
    if (prev.currentMode !== curr.currentMode) return true;
    if (prev.currentModel !== curr.currentModel) return true;
    if (prev.pendingActions.length !== curr.pendingActions.length) return true;

    // Compare pending action identity (category + flatIndex + buttonIndex)
    for (let ai = 0; ai < curr.pendingActions.length; ai++) {
      const pa = prev.pendingActions[ai];
      const ca = curr.pendingActions[ai];
      if (!pa || pa.flatIndex !== ca.flatIndex || pa.category !== ca.category || pa.buttonIndex !== ca.buttonIndex) {
        return true;
      }
    }

    for (let i = 0; i < curr.messages.length; i++) {
      const p = prev.messages[i];
      const c = curr.messages[i];
      if (!p || !c) return true;
      if (p.type !== c.type) return true;
      if (p.flatIndex !== c.flatIndex) return true;

      if ('text' in p && 'text' in c) {
        if ((p as { text: string }).text !== (c as { text: string }).text) return true;
      }
      if ('action' in p && 'action' in c) {
        if ((p as { action: string }).action !== (c as { action: string }).action) return true;
      }
      if (p.type === 'tool' && c.type === 'tool') {
        if ((p as { hasPendingApproval: boolean }).hasPendingApproval !==
            (c as { hasPendingApproval: boolean }).hasPendingApproval) return true;
      }
    }

    return false;
  }

  private findNewMessages(prev: ExtractedState | null, curr: ExtractedState): ChatElement[] {
    if (!prev) return curr.messages;

    const prevTexts = new Set<string>();
    for (const m of prev.messages) {
      const key = this.messageKey(m);
      prevTexts.add(key);
    }

    return curr.messages.filter((m) => !prevTexts.has(this.messageKey(m)));
  }

  private messageKey(m: ChatElement): string {
    if ('text' in m) return `${m.type}:${(m as { text: string }).text.substring(0, 80)}`;
    if ('action' in m) return `${m.type}:${(m as { action: string }).action.substring(0, 80)}`;
    return `${m.type}:${m.flatIndex}`;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private buildSnapshot(state: ExtractedState): StateSnapshot {
    let lastHumanIndex = -1;
    let lastAssistantIndex = -1;
    let isResponding = false;

    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (m.type === 'human' && lastHumanIndex === -1) lastHumanIndex = i;
      if (m.type === 'assistant' && lastAssistantIndex === -1) lastAssistantIndex = i;
    }

    isResponding = !!state.isGenerating;

    const hasPending = state.pendingActions.length > 0;
    let activityState: ActivityState = 'idle';
    if (this._switchingProject) {
      activityState = 'switching_project';
    } else if (this._switchingChat) {
      activityState = 'switching_chat';
    } else if (this._creatingChat) {
      activityState = 'creating_chat';
    } else if (hasPending) {
      activityState = 'waiting_for_approval';
    } else if (isResponding) {
      activityState = 'responding';
    }

    return {
      state,
      activityState,
      isResponding,
      lastHumanIndex,
      lastAssistantIndex,
      extractedAt: this.lastExtraction ?? Date.now(),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private log(msg: string): void {
    const ts = new Date().toISOString().substring(11, 23);
    console.log(`[${ts}] [StateManager] ${msg}`);
  }
}
