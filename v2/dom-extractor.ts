/**
 * DOM Extraction function.
 *
 * This function is serialized and executed INSIDE Cursor's renderer process
 * via Runtime.evaluate. It has zero Node.js dependencies — only browser DOM APIs.
 *
 * It walks [data-flat-index] elements and extracts typed chat state.
 */

// ---------------------------------------------------------------------------
// Types (shared between extractor and server)
// ---------------------------------------------------------------------------

/**
 * Describes the real Cursor checkpoint control associated with a human message.
 * Only populated when a matching DOM element is actually rendered on this poll —
 * if no checkpoint UI is detected, the message's `canRevert` stays false.
 *
 * `locatorKind` tells the state manager where the control sits relative to the
 * message's [data-flat-index] element, so the click executor can find it again
 * on a later poll even after transient hover state is lost.
 */
export interface RevertTarget {
  /** Where the checkpoint element lives relative to the [data-flat-index] anchor. */
  locatorKind: 'descendant' | 'prev-sibling' | 'next-sibling';
  /** Winning CSS selector (for diagnostics / click-time re-resolution). */
  selector: string;
  /** Visible label of the control (e.g. "Restore Checkpoint"), if any. */
  label: string;
  /** True if the element was rect-visible at poll time. False = likely hover-gated. */
  visible: boolean;
}

export interface HumanMessage {
  type: 'human';
  id: string;
  flatIndex: number;
  text: string;
  mentions: { name: string; type: string }[];
  images?: string[];
  /** True ONLY when the real Cursor restore-checkpoint control is live in the DOM. */
  canRevert: boolean;
  /** Populated iff canRevert=true. Used by state-manager to re-locate the element. */
  revertTarget?: RevertTarget;
}

export interface AssistantMessage {
  type: 'assistant';
  id: string;
  flatIndex: number;
  text: string;
  htmlLength: number;
  /** Serialized `.markdown-root` HTML from Cursor (tables, lists) — sanitized on the client. */
  html?: string;
}

export interface ToolCall {
  type: 'tool';
  id: string;
  flatIndex: number;
  toolCallId: string;
  status: string;
  action: string;
  details: string;
  hasPendingApproval: boolean;
  /** Longer tool body / diff preview text for PWA (Cursor-style card). */
  snippet?: string;
}

export interface ThoughtBlock {
  type: 'thought';
  id: string;
  flatIndex: number;
  duration: string;
  /** Collapsible header line (e.g. "Thought for 3s"). */
  summary?: string;
  /** Expanded thinking body text when visible in DOM. */
  detail?: string;
}

export interface LoadingIndicator {
  type: 'loading';
  id: string;
  flatIndex: number;
}

export interface UnknownElement {
  type: 'unknown';
  id: string;
  flatIndex: number;
  role: string;
  kind: string;
  preview: string;
}

export type ChatElement =
  | HumanMessage
  | AssistantMessage
  | ToolCall
  | ThoughtBlock
  | LoadingIndicator
  | UnknownElement;

export interface PendingAction {
  flatIndex: number;
  buttonText: string;
  buttonIndex: number;
  category: 'approve' | 'reject' | 'run' | 'skip' | 'other';
  context: string;
}

export type ChatMode = 'agent' | 'ask' | 'plan' | 'debug' | null;

export interface ExtractedState {
  messageCount: number;
  messages: ChatElement[];
  pendingActions: PendingAction[];
  currentMode: ChatMode;
  currentModel: string | null;
  activeChatTitle: string | null;
  windowTitle: string;
  isGenerating: boolean;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// The extraction function — runs inside Cursor's Electron renderer
// ---------------------------------------------------------------------------

/**
 * IMPORTANT: This function is stringified and eval'd in the browser.
 * It must be completely self-contained. No closures, no imports, no Node APIs.
 * Async so we can yield after expanding collapsibles and let React mount thinking bodies.
 */
export async function extractCursorState(): Promise<ExtractedState> {
  var elements = document.querySelectorAll('[data-flat-index]');
  var messages: ChatElement[] = [];

  /** Pull thinking body text — Cursor uses varying DOM; body may sit beside header, in shadow, or only when expanded. */
  function extractThoughtDetail(root: HTMLElement, headerEl: Element | null): string {
    var headerH = headerEl as HTMLElement | null;
    var best = '';
    function consider(el: Element | null | undefined) {
      if (!el) return;
      if (headerH && headerH.contains(el)) return;
      var t = ((el as HTMLElement).textContent || '').trim();
      if (t.length > best.length) best = t;
    }
    var detailSelectors = [
      '.ui-collapsible-content',
      '.cursor-thinking-block-content',
      '[class*="think-content"]',
      '[class*="ThinkingContent"]',
      '[class*="thinking-content"]',
      '[class*="thinkingContent"]',
      '[class*="collapsible-content"]',
      '.composer-thinking-body',
      '.thinking-body',
    ];
    for (var ds = 0; ds < detailSelectors.length; ds++) {
      consider(root.querySelector(detailSelectors[ds]));
    }
    var uic = root.querySelector('.ui-collapsible');
    if (uic) {
      for (var ci = 0; ci < uic.children.length; ci++) {
        var ch = uic.children[ci] as HTMLElement;
        if (ch.classList && ch.classList.contains('ui-collapsible-header')) continue;
        consider(ch);
      }
    }
    if (headerH) {
      consider(headerH.nextElementSibling);
    }
    var mds = root.querySelectorAll('.markdown-root');
    for (var mi = 0; mi < mds.length; mi++) {
      consider(mds[mi]);
    }
    var thinkNodes = root.querySelectorAll('[class*="thinking"]');
    for (var qi = 0; qi < thinkNodes.length; qi++) {
      var tn = thinkNodes[qi] as HTMLElement;
      if (tn.classList && tn.classList.contains('ui-collapsible-header')) continue;
      consider(tn);
    }
    var budget = 900;
    function scanShadow(sh: ShadowRoot) {
      if (!sh || budget <= 0) return;
      try {
        var smd = sh.querySelectorAll('.markdown-root, [class*="markdown"]');
        for (var sj = 0; sj < smd.length; sj++) {
          consider(smd[sj]);
        }
        var nodes = sh.querySelectorAll('*');
        for (var sn = 0; sn < nodes.length && budget > 0; sn++) {
          budget--;
          var node = nodes[sn] as HTMLElement;
          if (node.shadowRoot) scanShadow(node.shadowRoot);
        }
      } catch (_e) {
        /* ignore */
      }
    }
    var allUnder = root.querySelectorAll('*');
    for (var ti = 0; ti < allUnder.length && budget > 0; ti++) {
      budget--;
      var elu = allUnder[ti] as HTMLElement;
      if (elu.shadowRoot) scanShadow(elu.shadowRoot);
    }
    if (root.shadowRoot) scanShadow(root.shadowRoot);

    var full = (root.textContent || '').trim();
    var headerText = headerH ? (headerH.textContent || '').trim() : '';
    if (headerText && best.length < 32 && full.length > headerText.length + 6) {
      var idx = full.indexOf(headerText);
      var rest = idx >= 0 ? full.substring(idx + headerText.length).trim() : full.replace(headerText, '').trim();
      if (rest.length > best.length) best = rest;
    }
    if (best === headerText) best = '';
    return best;
  }

  // Expand collapsed thinking rows so body mounts (Cursor often omits content until open).
  (function () {
    try {
      var hdrs = document.querySelectorAll('[data-flat-index] .ui-collapsible-header');
      for (var xh = 0; xh < hdrs.length; xh++) {
        var hdr = hdrs[xh] as HTMLElement;
        if (!hdr.getClientRects || hdr.getClientRects().length === 0) continue;
        var ae = hdr.getAttribute('aria-expanded');
        if (ae === 'false') {
          hdr.click();
          continue;
        }
        var col = hdr.closest('.ui-collapsible');
        if (!col) continue;
        var bodyEl = col.querySelector('.ui-collapsible-content') as HTMLElement | null;
        if (!bodyEl) {
          var nx = hdr.nextElementSibling as HTMLElement | null;
          if (nx && !(nx.classList && nx.classList.contains('ui-collapsible-header'))) {
            bodyEl = nx;
          }
        }
        var bt = bodyEl ? (bodyEl.textContent || '').trim() : '';
        var bh = bodyEl ? bodyEl.offsetHeight : 0;
        if (ae !== 'true' && bt.length < 4 && bh < 8) {
          hdr.click();
        }
      }
    } catch (_expandErr) {
      /* ignore */
    }
  })();

  await new Promise(function (resolve) {
    requestAnimationFrame(function () {
      requestAnimationFrame(resolve);
    });
  });

  for (var i = 0; i < elements.length; i++) {
    var htmlEl = elements[i] as HTMLElement;
    var flatIndex = parseInt(htmlEl.getAttribute('data-flat-index') || '0', 10);
    var msgId = htmlEl.getAttribute('data-message-id') || 'gen-' + flatIndex;

    // Classification uses data-* attrs when available, then falls back to CSS class probing.
    var role = htmlEl.getAttribute('data-message-role') || '';
    var kind = htmlEl.getAttribute('data-message-kind') || '';

    var firstChild = htmlEl.children[0] as HTMLElement | undefined;
    var fcClass = firstChild ? String(firstChild.className) : '';
    var hasStickyHuman = fcClass.indexOf('composer-sticky-human-message') !== -1;
    var hasHumanInput = !!htmlEl.querySelector('.aislash-editor-input-readonly');
    var hasMarkdownRoot = !!htmlEl.querySelector('.markdown-root');
    var hasFeedback = !!htmlEl.querySelector('.composer-pane-controls-feedback');
    var hasToolFormer = !!htmlEl.querySelector('.composer-tool-former-message');
    var hasToolCallLine = !!htmlEl.querySelector('.ui-tool-call-line-action');
    var hasCollapsible = !!htmlEl.querySelector('.ui-collapsible');
    var hasLoadingV3 = !!htmlEl.querySelector('.loading-indicator-v3');
    var hasTerminalBlock = !!htmlEl.querySelector('.composer-terminal-tool-call-block-container');
    var hasPlanContainer = !!htmlEl.querySelector('.composer-create-plan-container');

    // --- Human message ---
    var isHuman = (role === 'human' && kind === 'human') || hasStickyHuman || hasHumanInput;
    if (isHuman && !hasToolFormer && !hasToolCallLine) {
      var inputEl = htmlEl.querySelector('.aislash-editor-input-readonly');
      var text = (inputEl ? inputEl.textContent : htmlEl.textContent) || '';
      text = text.trim();

      var mentionEls = htmlEl.querySelectorAll('.mention[data-mention-name]');
      var mentions: { name: string; type: string }[] = [];
      var imgEls = htmlEl.querySelectorAll('img');
      var images: string[] = [];
      for (var ii = 0; ii < imgEls.length; ii++) {
        var src = (imgEls[ii] as HTMLImageElement).src;
        if (src) images.push(src);
      }
      for (var mi = 0; mi < mentionEls.length; mi++) {
        var m = mentionEls[mi] as HTMLElement;
        mentions.push({
          name: m.getAttribute('data-mention-name') || '',
          type: m.getAttribute('data-mention-type') || 'unknown',
        });
      }

      // --- Live detection of the real Cursor "Restore Checkpoint" control. ---
      // Cursor 3.1.15 renders the control as one of these class signatures, either
      // inside the human message's data-flat-index subtree or as an adjacent
      // sibling (prev for restore-before-message, next for after). We ONLY mark
      // canRevert=true when an actual element is present in the live DOM.
      //
      // Order matters: the more specific selectors come first so the locator
      // label reflects the most faithful match when multiple strategies hit.
      var checkpointSelectors = [
        '.checkpoint-restore-text',
        '.arrow-revert-change',
        '.checkpoint-container',
        '.checkpoint-divider .text-link',
        '.revert-layer',
      ];

      var canRevert = false;
      var revertTarget: RevertTarget | undefined = undefined;

      // Inlined probe logic to avoid ESBuild __name injection for nested functions
      var descHit: Element | null = null;
      var descSel = '';
      for (var si = 0; si < checkpointSelectors.length; si++) {
        descHit = htmlEl.querySelector(checkpointSelectors[si]);
        if (descHit) { descSel = checkpointSelectors[si]; break; }
      }
      if (descHit) {
        var he = descHit as HTMLElement;
        var r = he.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          canRevert = true;
          revertTarget = {
            locatorKind: 'descendant',
            selector: descSel,
            label: (he.textContent || '').trim().substring(0, 60),
            visible: true
          };
        }
      }

      if (!canRevert) {
        var prev = htmlEl.previousElementSibling;
        if (prev) {
          var prHit: Element | null = null;
          var prSel = '';
          for (var si = 0; si < checkpointSelectors.length; si++) {
            if ((prev as HTMLElement).matches && (prev as HTMLElement).matches(checkpointSelectors[si])) {
              prHit = prev;
            } else {
              prHit = prev.querySelector(checkpointSelectors[si]);
            }
            if (prHit) { prSel = checkpointSelectors[si]; break; }
          }
          if (prHit) {
            var he = prHit as HTMLElement;
            var r = he.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              canRevert = true;
              revertTarget = {
                locatorKind: 'prev-sibling',
                selector: prSel,
                label: (he.textContent || '').trim().substring(0, 60),
                visible: true
              };
            }
          }
        }
      }

      if (!canRevert) {
        var next = htmlEl.nextElementSibling;
        if (next) {
          var nxHit: Element | null = null;
          var nxSel = '';
          for (var si = 0; si < checkpointSelectors.length; si++) {
            if ((next as HTMLElement).matches && (next as HTMLElement).matches(checkpointSelectors[si])) {
              nxHit = next;
            } else {
              nxHit = next.querySelector(checkpointSelectors[si]);
            }
            if (nxHit) { nxSel = checkpointSelectors[si]; break; }
          }
          if (nxHit) {
            var he = nxHit as HTMLElement;
            var r = he.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              canRevert = true;
              revertTarget = {
                locatorKind: 'next-sibling',
                selector: nxSel,
                label: (he.textContent || '').trim().substring(0, 60),
                visible: true
              };
            }
          }
        }
      }

      messages.push({
        type: 'human',
        id: msgId,
        flatIndex: flatIndex,
        text: text,
        mentions: mentions,
        images: images,
        canRevert: canRevert,
        revertTarget: revertTarget,
      });
      continue;
    }

    // --- Tool call (check before assistant since tools may contain markdown) ---
    var isTool = (role === 'ai' && kind === 'tool') || hasToolFormer || hasToolCallLine || hasTerminalBlock || hasPlanContainer;
    if (isTool) {
      var toolCallId = htmlEl.getAttribute('data-tool-call-id') || '';
      var status = htmlEl.getAttribute('data-tool-status') || '';

      var actionEl = htmlEl.querySelector('.ui-tool-call-line-action');
      var detailsEl = htmlEl.querySelector('.ui-tool-call-line-details');
      var action = actionEl ? (actionEl.textContent || '').trim() : '';
      var details = detailsEl ? (detailsEl.textContent || '').trim() : '';

      var snippet = '';
      var snSel = [
        '.composer-tool-former-message',
        '.composer-tool-call-block-body',
        '[class*="tool-former"]',
        '[class*="ToolCall"] .markdown-root',
        '.ui-tool-call-line-details',
      ];
      for (var sni = 0; sni < snSel.length; sni++) {
        var snEl = htmlEl.querySelector(snSel[sni]);
        if (snEl) {
          var snTx = (snEl.textContent || '').trim();
          if (snTx.length > snippet.length) snippet = snTx;
        }
      }
      if (!snippet && details) snippet = details;
      if (!snippet && action) snippet = action;
      if (snippet.length > 14000) snippet = snippet.substring(0, 14000);

      var headerEl = htmlEl.querySelector('.composer-tool-call-header-content');
      var compactEl = htmlEl.querySelector('.composer-tool-former-message');
      var fallbackAction = headerEl
        ? (headerEl.textContent || '').trim()
        : compactEl
          ? (compactEl.textContent || '').trim()
          : (htmlEl.textContent || '').trim().substring(0, 100);

      var toolBtns = htmlEl.querySelectorAll('button');
      var hasPendingApproval = false;
      for (var bi = 0; bi < toolBtns.length; bi++) {
        var btnRect = (toolBtns[bi] as HTMLElement).getBoundingClientRect();
        if (btnRect.width > 0 && btnRect.height > 0) {
          var btnText = ((toolBtns[bi] as HTMLElement).textContent || '').trim().toLowerCase();
          if (btnText.indexOf('accept') !== -1 || btnText.indexOf('run') !== -1 ||
              btnText.indexOf('allow') !== -1 || btnText.indexOf('approve') !== -1 ||
              btnText.indexOf('yes') !== -1 || btnText.indexOf('apply') !== -1) {
            hasPendingApproval = true;
            break;
          }
        }
      }

      messages.push({
        type: 'tool',
        id: msgId,
        flatIndex: flatIndex,
        toolCallId: toolCallId,
        status: status,
        action: action || fallbackAction,
        details: details,
        hasPendingApproval: hasPendingApproval,
        snippet: snippet || undefined,
      });
      continue;
    }

    // --- Thought / collapsible reasoning (before assistant: body may contain .markdown-root) ---
    if (hasCollapsible) {
      var spansTh = htmlEl.querySelectorAll('.ui-collapsible-header span');
      var duration = '';
      for (var si = 0; si < spansTh.length; si++) {
        var st = (spansTh[si] as HTMLElement).textContent || '';
        if (/\d+s/.test(st)) {
          duration = st.trim();
          break;
        }
      }
      var headerElTh = htmlEl.querySelector('.ui-collapsible-header');
      var summary = headerElTh ? (headerElTh.textContent || '').trim() : '';
      summary = summary.replace(/\s+/g, ' ').trim();
      if (summary) {
        summary = summary.replace(/([a-zA-Z])(for\s*\d)/i, '$1 $2');
        summary = summary.replace(/([a-zA-Z])(for\d)/i, '$1 $2');
      }
      if (!summary) {
        summary = duration || (htmlEl.textContent || '').trim().substring(0, 48);
      }
      var detail = extractThoughtDetail(htmlEl, headerElTh);
      if (!duration) {
        duration = summary.substring(0, 40);
      }
      messages.push({
        type: 'thought',
        id: msgId,
        flatIndex: flatIndex,
        duration: duration,
        summary: summary,
        detail: detail,
      });
      continue;
    }

    // --- Assistant message ---
    var isAssistant = (role === 'ai' && kind === 'assistant') || (hasMarkdownRoot && !hasToolFormer);
    if (isAssistant) {
      var mdRoot = htmlEl.querySelector('.markdown-root');
      var aText = mdRoot ? (mdRoot.textContent || '').trim() : (htmlEl.textContent || '').trim();
      var htmlRaw = mdRoot ? (mdRoot.innerHTML || '').trim() : '';
      var htmlLen = htmlRaw.length;

      if (htmlLen > 0) {
        messages.push({
          type: 'assistant',
          id: msgId,
          flatIndex: flatIndex,
          text: aText,
          htmlLength: htmlLen,
          html: htmlRaw,
        });
      } else {
        messages.push({
          type: 'assistant',
          id: msgId,
          flatIndex: flatIndex,
          text: aText,
          htmlLength: 0,
        });
      }
      continue;
    }

    // --- Loading indicator ---
    if (hasLoadingV3) {
      messages.push({ type: 'loading', id: msgId, flatIndex: flatIndex });
      continue;
    }

    // --- Unknown / unclassified ---
    var preview = (htmlEl.textContent || '').trim().substring(0, 120);
    messages.push({ type: 'unknown', id: msgId, flatIndex: flatIndex, role: role, kind: kind, preview: preview });
  }

  // Collect all visible actionable buttons across the chat
  var pendingActions: PendingAction[] = [];
  var approveWords = ['accept', 'approve', 'allow', 'yes', 'apply', 'run command', 'run'];
  var rejectWords = ['reject', 'deny', 'cancel', 'dismiss', 'decline'];
  var skipWords = ['skip', 'ignore', 'no'];

  for (var ai = 0; ai < elements.length; ai++) {
    var aEl = elements[ai] as HTMLElement;
    var aFlatIndex = parseInt(aEl.getAttribute('data-flat-index') || '0', 10);
    var btns = aEl.querySelectorAll('button');
    for (var bj = 0; bj < btns.length; bj++) {
      var btn = btns[bj] as HTMLElement;
      var br = btn.getBoundingClientRect();
      if (br.width <= 0 || br.height <= 0) continue;
      var rawText = (btn.textContent || '').trim();
      if (rawText.length === 0 || rawText.length > 40) continue;
      var lower = rawText.toLowerCase();

      var cat: PendingAction['category'] = 'other';
      for (var aw = 0; aw < approveWords.length; aw++) {
        if (lower.indexOf(approveWords[aw]) !== -1) { cat = 'approve'; break; }
      }
      if (cat === 'other') {
        for (var rw = 0; rw < rejectWords.length; rw++) {
          if (lower.indexOf(rejectWords[rw]) !== -1) { cat = 'reject'; break; }
        }
      }
      if (cat === 'other') {
        if (lower === 'run' || lower === 'run command') { cat = 'run'; }
      }
      if (cat === 'other') {
        for (var sw = 0; sw < skipWords.length; sw++) {
          if (lower.indexOf(skipWords[sw]) !== -1) { cat = 'skip'; break; }
        }
      }

      if (cat !== 'other') {
        var actionCtx = (aEl.querySelector('.ui-tool-call-line-action') || aEl.querySelector('.composer-tool-call-header-content'));
        var ctxText = actionCtx ? (actionCtx.textContent || '').trim().substring(0, 80) : '';
        pendingActions.push({
          flatIndex: aFlatIndex,
          buttonText: rawText,
          buttonIndex: bj,
          category: cat,
          context: ctxText,
        });
      }
    }
  }

  // Detect current chat mode from the composer dropdown.
  // Cursor internal values differ from public: "chat" -> "ask".
  // Canonical mapping lives in mode-utils.ts; inlined here because this
  // function is serialized and eval'd in the browser (no imports allowed).
  var currentMode: ExtractedState['currentMode'] = null;
  var modeDropdown = document.querySelector('.composer-unified-dropdown[data-mode]');
  if (modeDropdown) {
    var rawMode = (modeDropdown.getAttribute('data-mode') || '').toLowerCase();
    var modeMap: Record<string, string> = { chat: 'ask', agent: 'agent', plan: 'plan', debug: 'debug' };
    if (modeMap[rawMode]) {
      currentMode = modeMap[rawMode] as ExtractedState['currentMode'];
    }
  }

  // Detect current model from the model picker trigger.
  // The trigger text may include a speed badge suffix like "Fast", "Medium", "High".
  var currentModel: string | null = null;
  var modelTrigger = document.querySelector('.ui-model-picker__trigger-text');
  if (modelTrigger) {
    // Prefer the first child's textContent (model name span) if it exists,
    // otherwise fall back to the full element text and strip badges.
    var nameChild = modelTrigger.querySelector('.ui-model-picker__trigger-model-name');
    var modelText: string;
    if (nameChild) {
      modelText = (nameChild.textContent || '').trim();
    } else {
      modelText = (modelTrigger.textContent || '').trim();
      modelText = modelText.replace(/\s+(Fast|Medium|High|Low|Edit)$/i, '').trim();
    }
    if (modelText.length > 0) {
      currentModel = modelText;
    }
  }

  var activeChatTitle: string | null = null;
  var chatTabLabel = document.querySelector('[role="tab"].active .composer-tab-label');
  if (chatTabLabel) {
    activeChatTitle = (chatTabLabel.textContent || '').trim() || null;
  }

  // Ground truth from Cursor UI: visible stop control, or an in-flight loading row.
  var stopEl = document.querySelector('[data-stop-button="true"]');
  var isGenerating = false;
  if (stopEl) {
    var sr = (stopEl as HTMLElement).getBoundingClientRect();
    if (sr.width > 0 && sr.height > 0) isGenerating = true;
  }
  if (!isGenerating && messages.length > 0) {
    var lastMsg = messages[messages.length - 1];
    if (lastMsg.type === 'loading') isGenerating = true;
  }

  return {
    messageCount: elements.length,
    messages: messages,
    pendingActions: pendingActions,
    currentMode: currentMode,
    currentModel: currentModel,
    activeChatTitle: activeChatTitle,
    windowTitle: document.title,
    isGenerating: isGenerating,
    timestamp: Date.now(),
  };
}
