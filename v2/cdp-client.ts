/**
 * Lightweight Chrome DevTools Protocol client.
 *
 * Connects directly to a page target's WebSocket URL.
 * No Puppeteer — Electron blocks Target.getBrowserContexts which Puppeteer requires.
 */

import WebSocket from 'ws';

export interface CdpTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

export interface CdpEvalResult {
  value: unknown;
  type: string;
  description?: string;
}

export class CdpClient {
  private ws: WebSocket | null = null;
  private msgId = 0;
  private pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (err: Error) => void;
  }>();

  readonly wsUrl: string;

  constructor(wsUrl: string) {
    this.wsUrl = wsUrl;
  }

  // -----------------------------------------------------------------------
  // Static helpers: discover targets, find workbench
  // -----------------------------------------------------------------------

  static async fetchTargets(cdpBase = 'http://127.0.0.1:9222'): Promise<CdpTarget[]> {
    const url = `${cdpBase}/json`;
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Cannot reach CDP at ${url} — ${msg}\n` +
        `Launch Cursor with: --remote-debugging-port=9222`,
      );
    }
    if (!response.ok) {
      throw new Error(`CDP /json returned HTTP ${response.status}`);
    }
    return (await response.json()) as CdpTarget[];
  }

  static findWorkbench(targets: CdpTarget[]): CdpTarget {
    const t = targets.find(
      (t) => t.type === 'page' && t.url.includes('workbench'),
    );
    if (!t) {
      const names = targets.map((x) => `  [${x.type}] ${x.title}`).join('\n');
      throw new Error(
        `No workbench page target found among ${targets.length} target(s):\n${names}`,
      );
    }
    if (!t.webSocketDebuggerUrl) {
      throw new Error('Workbench target missing webSocketDebuggerUrl — is another debugger attached?');
    }
    return t;
  }

  // -----------------------------------------------------------------------
  // Connection
  // -----------------------------------------------------------------------

  connect(timeoutMs = 5_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`WebSocket connect timeout (${timeoutMs}ms)`));
      }, timeoutMs);

      ws.on('open', () => {
        clearTimeout(timer);
        this.ws = ws;
        resolve();
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`WebSocket error: ${err.message}`));
      });

      ws.on('message', (raw) => this.handleMessage(raw));

      ws.on('close', () => {
        this.ws = null;
        for (const [, p] of this.pending) {
          p.reject(new Error('WebSocket closed'));
        }
        this.pending.clear();
      });
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // -----------------------------------------------------------------------
  // CDP methods
  // -----------------------------------------------------------------------

  /** Send a raw CDP method and return the result. */
  send(method: string, params: Record<string, unknown> = {}, timeoutMs = 10_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('Not connected'));
      }
      const id = ++this.msgId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP request ${method} timed out (${timeoutMs}ms)`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (val) => { clearTimeout(timer); resolve(val); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });

      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Evaluate a JS expression in the page context and return the value. */
  async evaluate(expression: string, options?: { awaitPromise?: boolean }): Promise<unknown> {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      ...(options?.awaitPromise ? { awaitPromise: true } : {}),
    }) as { result?: { type: string; value?: unknown }; exceptionDetails?: { text: string; exception?: { description?: string } } };

    if (res.exceptionDetails) {
      const detail = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
      throw new Error(`Runtime exception: ${detail}`);
    }
    return res.result?.value;
  }

  /**
   * Serialize a function + args into a CDP callFunctionOn-style evaluate.
   * The function runs inside the page context with access to the DOM.
   */
  async callFunction<T>(fn: (...args: unknown[]) => T | Promise<T>, ...args: unknown[]): Promise<T> {
    const argsJson = args.map((a) => JSON.stringify(a)).join(', ');
    // tsx/esbuild injects __name() for nested functions (keepNames). fn.toString() keeps those
    // calls, but the page context has no __name — define a no-op inside an IIFE so lookups resolve.
    // awaitPromise unwraps async extractCursorState (expand + rAF before read).
    const expression = `(async function(){function __name(t,_){return t;}return await (${fn.toString()})(${argsJson});})()`;
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }) as { result?: { type: string; value?: unknown }; exceptionDetails?: { text: string; exception?: { description?: string } } };

    if (res.exceptionDetails) {
      const detail = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
      throw new Error(`Runtime exception: ${detail}`);
    }
    return res.result?.value as T;
  }

  /** Type text using Chromium's native input pipeline (works with ProseMirror). */
  async typeText(text: string): Promise<void> {
    await this.send('Input.insertText', { text });
  }

  /** Dispatch a key event (keyDown + keyUp). */
  async pressKey(key: string, code: string, keyCode: number, modifiers = 0): Promise<void> {
    const baseParams = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers };
    await this.send('Input.dispatchKeyEvent', { ...baseParams, type: 'keyDown' });
    await this.send('Input.dispatchKeyEvent', { ...baseParams, type: 'keyUp' });
  }

  /**
   * rawKeyDown + keyUp — works better in Electron/VS Code for modified shortcuts
   * (Ctrl+`, Ctrl+Shift+P, etc.) than plain keyDown.
   */
  async pressKeyRawChord(key: string, code: string, keyCode: number, modifiers = 0): Promise<void> {
    await this.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
      modifiers,
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
      modifiers: 0,
    });
  }

  /**
   * Real mouse click at viewport coordinates (more reliable than element.click() for Monaco actions).
   */
  async clickAtViewport(x: number, y: number): Promise<void> {
    const base = { x, y, button: 'left', clickCount: 1, pointerType: 'mouse' };
    await this.send('Input.dispatchMouseEvent', {
      ...base,
      type: 'mousePressed',
      buttons: 1,
    });
    await this.send('Input.dispatchMouseEvent', {
      ...base,
      type: 'mouseReleased',
      buttons: 0,
    });
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private handleMessage(raw: WebSocket.RawData): void {
    let msg: { id?: number; result?: unknown; error?: { code: number; message: string } };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.id == null) return; // CDP event, not a response

    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);

    if (msg.error) {
      p.reject(new Error(`CDP error: ${msg.error.message} (code ${msg.error.code})`));
    } else {
      p.resolve(msg.result);
    }
  }
}
