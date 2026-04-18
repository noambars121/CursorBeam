/**
 * CDP-injected scripts for phone edit + choice dialog probing.
 * Single source of truth for Runtime.evaluate and node/jsdom tests.
 */

export const PHONE_EDIT_COMPOSER_PICKER_JS = `
  function __pickPhoneEditComposer(targetFI) {
    function vis(el) {
      if (!el) return false;
      var r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }
    function rowHasFlatIndex(el, want) {
      var p = el;
      for (var d = 0; d < 16 && p; d++) {
        if (p.getAttribute && p.getAttribute('data-flat-index') != null) {
          var f = parseInt(p.getAttribute('data-flat-index') || '-1', 10);
          return f === want;
        }
        p = p.parentElement;
      }
      return false;
    }
    var want = typeof targetFI === 'number' && targetFI >= 0 ? targetFI : -1;
    if (want >= 0) {
      var roots = document.querySelectorAll('[data-flat-index]');
      for (var i = 0; i < roots.length; i++) {
        var f = parseInt(roots[i].getAttribute('data-flat-index') || '-1', 10);
        if (f !== want) continue;
        var scoped = roots[i].querySelector('.aislash-editor-input[contenteditable="true"]');
        if (vis(scoped)) return scoped;
      }
      var allEd = document.querySelectorAll('.aislash-editor-input[contenteditable="true"]');
      for (var a = allEd.length - 1; a >= 0; a--) {
        if (!vis(allEd[a])) continue;
        if (rowHasFlatIndex(allEd[a], want)) return allEd[a];
      }
      return null;
    }
    var inRows = document.querySelectorAll('[data-flat-index] .aislash-editor-input[contenteditable="true"]');
    for (var j = inRows.length - 1; j >= 0; j--) {
      if (vis(inRows[j])) return inRows[j];
    }
    var el = document.querySelector('.aislash-editor-input[contenteditable="true"]');
    if (vis(el)) return el;
    var all = document.querySelectorAll('[contenteditable="true"]');
    for (var k = 0; k < all.length; k++) {
      var r2 = all[k].getBoundingClientRect();
      if (r2.width > 100 && r2.height > 5) return all[k];
    }
    return null;
  }
`;

export const DIALOG_LABEL_HELPERS = `
    function __lineFromText(s) {
      s = String(s || '');
      var buf = '';
      for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        if (c === 10 || c === 13) break;
        buf += c === 0xa0 ? ' ' : s.charAt(i);
      }
      s = buf.trim();
      var lp = s.lastIndexOf('(');
      var rp = s.lastIndexOf(')');
      if (lp > 0 && rp === s.length - 1 && rp - lp - 1 <= 40 && rp - lp - 1 >= 1) {
        s = s.substring(0, lp).trim();
      }
      buf = '';
      for (var j = 0; j < s.length; j++) {
        c = s.charCodeAt(j);
        if (c === 0x2318 || c === 0x238b || c === 0x2325) continue;
        buf += s.charAt(j);
      }
      s = buf.replace(/\s+/g, ' ').trim();
      return s;
    }
    function __actionableLabel(el) {
      var ar = (el.getAttribute && el.getAttribute('aria-label')) || '';
      ar = __lineFromText(ar);
      var tx = __lineFromText(el.textContent || '');
      if (ar && tx && ar.length <= 96) {
        var aw = ar.toLowerCase();
        var tw = tx.toLowerCase();
        if (tw.indexOf(aw) !== -1 || aw.indexOf((tw.split(' ')[0] || '')) !== -1) return tx.length < ar.length ? tx : ar;
      }
      if (ar && (!tx || ar.length <= 80)) return ar;
      return tx;
    }
    function __normAct(el) {
      return __actionableLabel(el).toLowerCase();
    }
    function __labelsMatch(el, wantedRaw) {
      var w = __lineFromText(wantedRaw).toLowerCase();
      if (!w) return false;
      var n = __normAct(el);
      if (n === w) return true;
      if (n.indexOf(w) === 0 && w.length >= 4) return true;
      if (w.indexOf(n) === 0 && n.length >= 4) return true;
      return false;
    }
    function __dialogClickables(d) {
      var sels = [
        'button',
        '[role="button"]',
        'a.monaco-button',
        'a.monaco-text-button',
        '.monaco-button',
        '.monaco-text-button',
        '.monaco-button.monaco-text-button',
        '.monaco-dialog-button',
        '.dialog-buttons a',
        '.dialog-buttons button',
        '.dialog-actions a',
        '.dialog-actions button',
        '.quick-input-list .monaco-list-row',
        '.quick-input-list .quick-input-list-entry',
      ];
      var out = [];
      var done = [];
      function add(el) {
        if (!el) return;
        for (var di = 0; di < done.length; di++) if (done[di] === el) return;
        done.push(el);
        out.push(el);
      }
      for (var si = 0; si < sels.length; si++) {
        try {
          var q = d.querySelectorAll(sels[si]);
          for (var qi = 0; qi < q.length; qi++) add(q[qi]);
        } catch (e) {}
      }
      return out;
    }
    function __ariaModalLooksLikeDialog(el) {
      var r = el.getBoundingClientRect();
      var vw = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1200;
      var vh = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 800;
      if (r.width <= 0 || r.height <= 0) return false;
      if (r.width > vw * 0.96 && r.height > vh * 0.96) return false;
      return r.width >= 160 && r.width <= Math.min(960, vw) && r.height >= 56 && r.height <= Math.min(720, vh * 0.92);
    }
    function __collectDialogRoots() {
      var roots = [];
      var seen = [];
      function uniq(el) {
        if (!el) return;
        for (var i = 0; i < seen.length; i++) if (seen[i] === el) return;
        seen.push(el);
        roots.push(el);
      }
      var selectors = [
        '[role="dialog"]',
        '[role="alertdialog"]',
        '.monaco-dialog-box',
        '.codicon-modal-dialog',
        '.monaco-dialog',
        '.monaco-modal-dialog',
        '.confirm-dialog',
        '.quick-input-widget',
        '.monaco-quick-open-widget',
      ];
      function collectIn(root) {
        if (!root || !root.querySelectorAll) return;
        for (var si = 0; si < selectors.length; si++) {
          try {
            var nodes = root.querySelectorAll(selectors[si]);
            for (var ni = 0; ni < nodes.length; ni++) uniq(nodes[ni]);
          } catch (e) {}
        }
        try {
          var aria = root.querySelectorAll('[aria-modal="true"]');
          for (var ai = 0; ai < aria.length; ai++) {
            if (__ariaModalLooksLikeDialog(aria[ai])) uniq(aria[ai]);
          }
        } catch (e) {}
      }
      collectIn(document);
      var budget = 4000;
      function walkShadow(node) {
        if (!node || budget <= 0) return;
        try {
          var tree = node.querySelectorAll ? node.querySelectorAll('*') : [];
          for (var ti = 0; ti < tree.length && budget > 0; ti++) {
            budget--;
            var sh = tree[ti].shadowRoot;
            if (sh) {
              collectIn(sh);
              walkShadow(sh);
            }
          }
        } catch (e) {}
      }
      if (document.body) walkShadow(document.body);
      return roots;
    }
    function __classifyKind(labelLower) {
      if (labelLower.indexOf("don't revert") !== -1 || labelLower.indexOf('dont revert') !== -1) return 'other';
      if (labelLower.indexOf('cancel') !== -1 || labelLower === 'no' || labelLower === 'close') return 'cancel';
      if (labelLower.indexOf('revert') !== -1 || labelLower.indexOf('discard') !== -1 ||
          labelLower.indexOf('restore') !== -1 || labelLower.indexOf('delete') !== -1 ||
          labelLower === 'ok' || labelLower === 'yes') return 'destructive';
      return 'other';
    }
  `;

const PROBE_ANY_CHOICE_INNER = `var dialogs = __collectDialogRoots();
for (var di = 0; di < dialogs.length; di++) {
  var d = dialogs[di];
  var r = d.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) continue;
  var btns = __dialogClickables(d);
  var visibleBtnCount = 0;
  for (var bi = 0; bi < btns.length; bi++) {
    var br = btns[bi].getBoundingClientRect();
    if (br.width > 0 && br.height > 0) visibleBtnCount++;
  }
  if (visibleBtnCount < 1) continue;
  var allText = (d.textContent || '').toLowerCase();
  if (allText.length < 8) continue;
  var looksEditOrBranch =
    (allText.indexOf('submit') !== -1 &&
      (allText.indexOf('previous') !== -1 || allText.indexOf('prompt') !== -1 || allText.indexOf('message') !== -1)) ||
    allText.indexOf('branch') !== -1 ||
    (allText.indexOf('edit') !== -1 && allText.indexOf('message') !== -1) ||
    allText.indexOf('checkpoint') !== -1 ||
    allText.indexOf('continue') !== -1 ||
    allText.indexOf('conversation') !== -1 ||
    (allText.indexOf('from') !== -1 && allText.indexOf('point') !== -1);
  var sizable = r.width >= 180 && r.height >= 64;
  var twoChoices = visibleBtnCount >= 2 && r.width >= 140 && r.height >= 56;
  var compactChoice = looksEditOrBranch && visibleBtnCount >= 1 && r.width >= 100 && r.height >= 48;
  if (!sizable && !twoChoices && !compactChoice) continue;

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

  if (out.length > 0) {
    return { title: title.substring(0, 200), body: body.substring(0, 800), buttons: out };
  }
}
var qiw = document.querySelector('.quick-input-widget');
if (qiw) {
  var qr = qiw.getBoundingClientRect();
  if (qr.width > 80 && qr.height > 40) {
    var qRows = qiw.querySelectorAll('.quick-input-list .monaco-list-row, .quick-input-list [role="option"]');
    var qOut = [];
    for (var qi = 0; qi < qRows.length && qi < 12; qi++) {
      var row = qRows[qi];
      var qrr = row.getBoundingClientRect();
      if (qrr.width <= 0 || qrr.height <= 0) continue;
      var qlab = __actionableLabel(row);
      if (!qlab) qlab = (row.textContent || '').replace(/\\s+/g, ' ').trim().substring(0, 96);
      if (qlab && qlab.length > 0) {
        qOut.push({ text: qlab, kind: __classifyKind(qlab.toLowerCase()) });
      }
    }
    if (qOut.length >= 2) {
      var qt = qiw.querySelector('.quick-input-title, .quick-input-count');
      var qtitle = qt ? (qt.textContent || '').trim() : 'Choose an option';
      return { title: qtitle.substring(0, 200), body: '', buttons: qOut };
    }
  }
}
return null;
`;

export function makeProbeAnyChoiceDialogEval(): string {
  return '(function() {\n' + DIALOG_LABEL_HELPERS + '\n' + PROBE_ANY_CHOICE_INNER + '\n})()';
}
