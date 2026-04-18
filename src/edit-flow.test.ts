/**
 * Regression tests for phone-edit injected DOM logic (same source as CDP evaluate).
 * Run: npx tsx --test v2/edit-flow.test.ts
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import {
  DIALOG_LABEL_HELPERS,
  PHONE_EDIT_COMPOSER_PICKER_JS,
  makeProbeAnyChoiceDialogEval,
} from './edit-dom-probe.js';

function domWithLayout(html: string): { dom: JSDOM; win: Window & typeof globalThis } {
  const dom = new JSDOM(html, { pretendToBeVisual: true, runScripts: 'outside-only' });
  const win = dom.window as Window & typeof globalThis;
  win.innerWidth = 1280;
  win.innerHeight = 800;
  const proto = win.HTMLElement.prototype;
  proto.getBoundingClientRect = function (this: HTMLElement) {
    const w = parseFloat(this.getAttribute('data-bw') || '240');
    const h = parseFloat(this.getAttribute('data-bh') || '72');
    return {
      x: 0,
      y: 0,
      width: w,
      height: h,
      top: 0,
      left: 0,
      right: w,
      bottom: h,
      toJSON() {
        return {};
      },
    } as DOMRect;
  };
  return { dom, win };
}

function runProbe(dom: JSDOM): unknown {
  const src = makeProbeAnyChoiceDialogEval();
  return vm.runInContext(src, dom.getInternalVMContext());
}

function runInDom(dom: JSDOM, source: string): unknown {
  return vm.runInContext(`(function () {\n${source}\n})()`, dom.getInternalVMContext());
}

describe('probeAnyChoiceDialog (injected)', () => {
  it('finds quick-input list rows (branch / continue)', () => {
    const { dom } = domWithLayout(`
      <body>
        <div class="quick-input-widget" data-bw="400" data-bh="320">
          <div class="quick-input-title">Pick next step</div>
          <div class="quick-input-list">
            <div class="monaco-list-row" data-bw="380" data-bh="24">Branch</div>
            <div class="monaco-list-row" data-bw="380" data-bh="24">Continue</div>
          </div>
        </div>
      </body>
    `);
    const r = runProbe(dom) as { title: string; buttons: { text: string }[] } | null;
    assert.ok(r);
    assert.match(r.title, /Pick/);
    assert.equal(r.buttons.length, 2);
    assert.match(r.buttons[0].text, /Branch/i);
    assert.match(r.buttons[1].text, /Continue/i);
  });

  it('finds classic edit-submit copy + two buttons', () => {
    const { dom } = domWithLayout(`
      <body>
        <div role="dialog" class="monaco-dialog-box" data-bw="520" data-bh="220">
          <div class="dialog-message-title">Edit message</div>
          <p>Submit this edit as a new message or update the previous user message.</p>
          <button type="button" data-bw="120" data-bh="36">Create branch</button>
          <button type="button" data-bw="120" data-bh="36">Continue</button>
        </div>
      </body>
    `);
    const r = runProbe(dom) as { buttons: { text: string }[] } | null;
    assert.ok(r);
    assert.ok(r.buttons.length >= 2);
    const joined = r.buttons.map((b) => b.text).join(' ');
    assert.match(joined, /branch|Continue/i);
  });
});

describe('__pickPhoneEditComposer (injected)', () => {
  it('selects contenteditable inside matching data-flat-index', () => {
    const { dom } = domWithLayout(`
      <body>
        <div data-flat-index="0" data-bw="300" data-bh="80">
          <div class="aislash-editor-input" contenteditable="true" data-bw="280" data-bh="36">first</div>
        </div>
        <div data-flat-index="3" data-bw="300" data-bh="80">
          <div class="aislash-editor-input" contenteditable="true" data-bw="280" data-bh="36">third bubble</div>
        </div>
      </body>
    `);
    const el = runInDom(
      dom,
      `${PHONE_EDIT_COMPOSER_PICKER_JS}\nreturn __pickPhoneEditComposer(3);`,
    ) as { textContent: string | null };
    assert.ok(el);
    assert.equal(el.textContent, 'third bubble');
  });

  it('returns null when target flatIndex has no visible editor', () => {
    const { dom } = domWithLayout(`
      <body>
        <div data-flat-index="1" data-bw="300" data-bh="80">
          <div class="aislash-editor-input" contenteditable="true" data-bw="0" data-bh="0">hidden</div>
        </div>
      </body>
    `);
    const el = runInDom(dom, `${PHONE_EDIT_COMPOSER_PICKER_JS}\nreturn __pickPhoneEditComposer(1);`);
    assert.equal(el, null);
  });
});

describe('DIALOG_LABEL_HELPERS', () => {
  it('__lineFromText removes parenthetical shortcut hints', () => {
    const { dom } = domWithLayout('<body></body>');
    const t = runInDom(
      dom,
      `${DIALOG_LABEL_HELPERS}\nreturn __lineFromText('Continue (Ctrl+Enter)');`,
    );
    assert.equal(t, 'Continue');
  });

  it('__labelsMatch matches aria-label after __lineFromText', () => {
    const { dom } = domWithLayout('<body></body>');
    const ok = runInDom(
      dom,
      `${DIALOG_LABEL_HELPERS}
        var b = document.createElement('button');
        b.setAttribute('aria-label', 'Continue (Ctrl+Enter)');
        return __labelsMatch(b, 'Continue');`,
    );
    assert.equal(ok, true);
  });
});
