const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'client.html');
let content = fs.readFileSync(file, 'utf8');

// 1. Fix the revert overlays HTML to include class="overlay"
content = content.replace(
  /<div id="revert-overlay" onclick="closeRevertSheet\(event\)">/g,
  '<div id="revert-overlay" class="overlay" onclick="closeRevertSheet(event)">'
);
content = content.replace(
  /<div id="revert-confirm-overlay" onclick="closeRevertConfirm\(event\)">/g,
  '<div id="revert-confirm-overlay" class="overlay" onclick="closeRevertConfirm(event)">'
);

// 2. Refine the CSS
const refinedCSS = `
/* 
 * Refined Native iOS PWA Design
 */
:root {
  --bg: #000000;
  --surface: #1c1c1e;
  --surface-elevated: #2c2c2e;
  --border: #38383a;
  --text: #ffffff;
  --text-secondary: #ebebf5;
  --text-tertiary: #8e8e93;
  --accent: #0a84ff;
  --accent-pressed: #0066d6;
  --human: #0a84ff;
  --assistant: #1c1c1e;
  --red: #ff453a;
  --yellow: #ffd60a;
  --green: #32d74b;
  --safe-top: env(safe-area-inset-top, 47px);
  --safe-bottom: env(safe-area-inset-bottom, 34px);
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

body {
  background-color: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
  font-size: 16px;
  line-height: 1.4;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  height: 100dvh;
  width: 100vw;
  display: flex;
  flex-direction: column;
}

button {
  font-family: inherit;
  background: none;
  border: none;
  cursor: pointer;
}
button:active:not(:disabled) {
  opacity: 0.6;
}

/* =========================================
   LOGIN / OFFLINE SCREENS
========================================= */
#login-screen, #offline-screen {
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100dvh;
  padding: 24px;
}
.login-box, #offline-screen > div { width: 100%; max-width: 320px; text-align: center; }
.login-box h1, #offline-screen h1 { font-size: 28px; font-weight: 700; letter-spacing: 0.3px; margin-bottom: 8px; }
.login-box p, #offline-screen p { color: var(--text-tertiary); font-size: 15px; margin-bottom: 32px; }
.login-box input { width: 100%; background: var(--surface); border: 1px solid var(--border); padding: 16px; border-radius: 14px; color: var(--text); font-size: 17px; margin-bottom: 16px; outline: none; }
.login-box input:focus { border-color: var(--accent); }
.login-box button, #start-sys-btn { width: 100%; background: var(--accent); color: #fff; padding: 16px; border-radius: 14px; font-size: 17px; font-weight: 600; }
.login-err { color: var(--red); margin-top: 16px; font-size: 14px; }

/* =========================================
   APP SHELL & HEADER
========================================= */
#app {
  display: none;
  flex-direction: column;
  height: 100dvh;
  width: 100vw;
}

#header {
  padding-top: max(var(--safe-top), 16px);
  background: rgba(28, 28, 30, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 0.5px solid rgba(255,255,255,0.15);
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding-left: 16px;
  padding-right: 16px;
  padding-bottom: 12px;
  flex-shrink: 0;
  z-index: 100;
  min-height: calc(max(var(--safe-top), 16px) + 44px);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-start;
  min-width: 0;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: flex-end;
  min-width: 0;
}

#status-dot {
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background: var(--text-tertiary);
  flex-shrink: 0;
}
#status-dot.connected { background: var(--green); }
#status-dot.reconnecting, #status-dot.switching_project { background: var(--yellow); }
#status-dot.disconnected { background: var(--red); }

#header-title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.4px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 8px;
}

.pill-btn {
  color: var(--accent);
  font-size: 16px;
  font-weight: 400;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pill-btn:disabled { opacity: 0.4; }

#logout-btn, #msg-count { display: none; }

/* =========================================
   MODE SELECTOR
========================================= */
#mode-bar {
  padding: 8px 16px;
  background: var(--bg);
  flex-shrink: 0;
  display: flex;
  justify-content: center;
}
.mode-label { display: none; }
.mode-segmented {
  display: flex;
  background: #1c1c1e;
  border-radius: 8px;
  padding: 2px;
  width: 100%;
  max-width: 400px;
}
.mode-btn {
  flex: 1;
  padding: 6px 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  border-radius: 6px;
  text-align: center;
}
.mode-btn.active {
  background: #636366;
  box-shadow: 0 3px 8px rgba(0,0,0,0.12), 0 3px 1px rgba(0,0,0,0.04);
}

/* =========================================
   MESSAGES AREA
========================================= */
#chat-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

#messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  -webkit-overflow-scrolling: touch;
}

.msg {
  max-width: 88%;
  font-size: 16px;
  line-height: 1.4;
  letter-spacing: -0.2px;
  word-wrap: break-word;
}

.msg.human {
  align-self: flex-end;
  background: var(--human);
  color: #fff;
  padding: 8px 14px;
  border-radius: 18px 18px 4px 18px;
}
.msg.human .msg-label { display: none; }

.msg.assistant {
  align-self: flex-start;
  background: var(--surface);
  color: var(--text);
  padding: 12px 16px;
  border-radius: 18px 18px 18px 4px;
}
.msg.assistant .msg-label { display: none; }

.msg.tool {
  align-self: flex-start;
  background: transparent;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 14px;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  max-width: 95%;
}
.msg.tool .msg-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  margin-bottom: 2px;
}

.msg.thought {
  align-self: flex-start;
  color: var(--text-tertiary);
  font-size: 14px;
  padding: 0 14px;
}

.msg.loading {
  align-self: flex-start;
  color: var(--text-tertiary);
  padding: 10px 14px;
  font-size: 15px;
}

.msg.unknown { align-self: center; font-size: 12px; color: var(--text-tertiary); }
.msg.optimistic { opacity: 0.6; }

.msg code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px;
  background: rgba(255,255,255,0.1);
  padding: 2px 4px;
  border-radius: 4px;
  color: #ff7b72;
}
.msg pre.code-block {
  margin: 12px -16px;
  padding: 14px 16px;
  background: #000;
  overflow-x: auto;
  font-size: 13px;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.msg pre.code-block code { background: none; padding: 0; color: #c9d1d9;}
.msg p { margin-bottom: 12px; }
.msg p:last-child { margin-bottom: 0; }
.msg ul, .msg ol { margin-left: 20px; margin-bottom: 12px; }

.revert-btn { display: inline-block; margin-top: 8px; color: #fff; background: rgba(255,255,255,0.2); padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 600; }
.approval-bar { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.approval-bar button { padding: 8px 16px; border-radius: 8px; font-size: 14px; font-weight: 600; }
.btn-approve { background: var(--green); color: #000; }
.btn-reject { background: var(--surface-elevated); color: var(--text); }

#actions-bar { padding: 12px 16px; background: var(--surface); border-top: 1px solid var(--border); display: none; }
#actions-bar.visible { display: block; }
.actions-header { font-size: 12px; font-weight: 600; color: var(--accent); margin-bottom: 8px; text-transform: uppercase; }
.action-item { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; background: var(--bg); padding: 10px; border-radius: 12px; border: 1px solid var(--border); }
.action-item:last-child { margin-bottom: 0; }
.action-context { flex: 1; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.action-btns { display: flex; gap: 6px; }
.action-btns button { padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 600; }
.action-btn-approve { background: var(--green); color: #000; }
.action-btn-run { background: var(--accent); color: #fff; }
.action-btn-reject, .action-btn-skip { background: var(--surface-elevated); color: var(--text); }

/* =========================================
   COMPOSER (Bottom Input Area)
========================================= */
#composer-area {
  flex-shrink: 0;
  background: rgba(28, 28, 30, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 0.5px solid rgba(255,255,255,0.15);
  padding: 10px 16px max(calc(var(--safe-bottom) + 8px), 16px);
  z-index: 20;
}

.composer-inner {
  display: flex;
  align-items: flex-end;
  background: #000;
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 4px;
  gap: 4px;
  transition: border-color 0.2s;
}
.composer-inner:focus-within { border-color: var(--accent); }

#img-btn {
  width: 32px;
  height: 32px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 300;
  color: var(--text-tertiary);
  margin-bottom: 3px;
  margin-left: 4px;
  flex-shrink: 0;
}

#prompt-input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text);
  font-size: 16px;
  line-height: 1.4;
  padding: 8px 4px;
  max-height: 120px;
  resize: none;
  outline: none;
  font-family: inherit;
}
#prompt-input::placeholder { color: var(--text-tertiary); }

#send-btn {
  width: 32px;
  height: 32px;
  border-radius: 16px;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 3px;
  margin-right: 3px;
  font-weight: bold;
  font-size: 18px;
  flex-shrink: 0;
}
#send-btn:disabled { background: var(--surface-elevated); color: var(--text-tertiary); }

#stop-btn {
  display: none;
  width: 32px;
  height: 32px;
  border-radius: 16px;
  background: var(--red);
  color: #fff;
  align-items: center;
  justify-content: center;
  margin-bottom: 3px;
  margin-right: 3px;
  font-size: 14px;
  flex-shrink: 0;
}

/* =========================================
   OVERLAYS (Bottom Sheets)
========================================= */
.overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 200;
  align-items: flex-end;
  justify-content: center;
}
.overlay.visible { display: flex; }

.panel, .revert-panel {
  width: 100%;
  background: var(--surface);
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  padding-bottom: var(--safe-bottom);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.panel-header, .revert-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 0.5px solid rgba(255,255,255,0.1);
}
.panel-header h3, .revert-panel-header h3 { font-size: 17px; font-weight: 600; }
.panel-close { color: var(--accent); font-size: 17px; font-weight: 400; }

#chat-panel-actions { display: flex; align-items: center; gap: 12px; }
#new-chat-btn { color: var(--accent); font-size: 16px; font-weight: 400; }

.panel-list { list-style: none; overflow-y: auto; padding: 0; margin: 0; }
.panel-list li {
  padding: 16px;
  border-bottom: 0.5px solid rgba(255,255,255,0.08);
  font-size: 17px;
  color: var(--text);
  display: flex;
  flex-direction: column;
}
.panel-list li:active { background: var(--surface-elevated); }
.panel-list li.active { color: var(--accent); }

.chat-sub, .proj-path { font-size: 13px; color: var(--text-tertiary); margin-top: 4px; }
.chat-title { font-weight: 500; }
.chat-time { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }

/* REVERT PANELS overrides */
.revert-panel-header { justify-content: center; }
.revert-panel-body { padding: 16px; overflow-y: auto; font-size: 15px; }
.revert-panel-body .warn { color: var(--red); margin: 12px 0; font-size: 14px; line-height: 1.4; }
.revert-panel-body .preview { background: #000; padding: 12px; border-radius: 12px; font-size: 14px; color: var(--text-secondary); margin-bottom: 12px; }
.revert-panel-footer { padding: 16px; display: flex; gap: 12px; }
.revert-panel-footer button { flex: 1; padding: 14px; border-radius: 14px; font-size: 16px; font-weight: 600; }
.revert-cancel { background: var(--surface-elevated); color: var(--text); }
.revert-destroy { background: var(--red); color: #fff; }
.revert-dialog-btns { display: flex; flex-direction: column; gap: 10px; }
.revert-dialog-btns button { padding: 14px; border-radius: 12px; font-size: 16px; font-weight: 600; background: var(--surface-elevated); color: var(--text); }
.revert-dialog-btns button.destructive { background: var(--red); color: #fff; }
.revert-dialog-btns button.primary { background: var(--accent); color: #fff; }

/* SPINNERS AND TOAST */
.project-switching-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 300; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 16px; font-weight: 500; flex-direction: column; gap: 16px; }
.switching-spinner { display: inline-block; width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.1); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

#toast {
  position: fixed;
  top: max(var(--safe-top), 20px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--text);
  color: var(--bg);
  padding: 12px 24px;
  border-radius: 24px;
  font-size: 15px;
  font-weight: 500;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}
#toast.show { opacity: 1; }

/* TERMINAL */
#terminal-view { display: none; flex: 1; flex-direction: column; overflow: hidden; background: #000; }
#terminal-output { flex: 1; overflow-y: auto; padding: 16px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; color: #c9d1d9; white-space: pre-wrap; word-break: break-all; }
#terminal-status { padding: 8px 16px; font-size: 12px; color: var(--text-tertiary); background: var(--surface); border-top: 0.5px solid var(--border); }
#term-composer { display: flex; gap: 10px; padding: 10px 16px max(calc(var(--safe-bottom) + 10px), 16px); background: var(--bg); }
#term-input { flex: 1; padding: 12px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; color: var(--text); font-family: inherit; }
#term-send { padding: 0 16px; background: var(--accent); color: #fff; border-radius: 12px; font-weight: 600; }
`;

content = content.replace(/<style>[\s\S]*?<\/style>/, '<style>\n' + refinedCSS + '\n</style>');

fs.writeFileSync(file, content);
console.log('Fixed overlay bugs and improved native header/layout.');
