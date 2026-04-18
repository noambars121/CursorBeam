const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'client.html');
let content = fs.readFileSync(file, 'utf8');

const nativeCSS = `
/* 
 * Native iOS PWA Design for iPhone 15 Pro
 * Pure Black OLED Background, Apple System Fonts, Exact iOS Colors 
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
  --assistant: #2c2c2e;
  --red: #ff453a;
  --yellow: #ffd60a;
  --green: #32d74b;
  --safe-top: env(safe-area-inset-top, 47px); /* iPhone 15 Pro default fallback */
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
  opacity: 0.7;
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

.login-box, #offline-screen > div {
  width: 100%;
  max-width: 320px;
  text-align: center;
}

.login-box h1, #offline-screen h1 {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0.3px;
  margin-bottom: 8px;
}

.login-box p, #offline-screen p {
  color: var(--text-tertiary);
  font-size: 15px;
  margin-bottom: 32px;
}

.login-box input {
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 16px;
  border-radius: 14px;
  color: var(--text);
  font-size: 17px;
  margin-bottom: 16px;
  outline: none;
}
.login-box input:focus {
  border-color: var(--accent);
}

.login-box button, #start-sys-btn {
  width: 100%;
  background: var(--accent);
  color: #fff;
  padding: 16px;
  border-radius: 14px;
  font-size: 17px;
  font-weight: 600;
}

.login-err {
  color: var(--red);
  margin-top: 16px;
  font-size: 14px;
}

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
  padding-top: var(--safe-top);
  background: rgba(28, 28, 30, 0.75);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 0.5px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 16px;
  padding-right: 16px;
  padding-bottom: 12px;
  flex-shrink: 0;
  z-index: 100;
}

.header-left, .header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

#status-dot {
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background: var(--text-tertiary);
}
#status-dot.connected { background: var(--green); }
#status-dot.reconnecting, #status-dot.switching_project { background: var(--yellow); }
#status-dot.disconnected { background: var(--red); }

#header-title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.2px;
  flex: 1;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pill-btn {
  color: var(--accent);
  font-size: 15px;
  font-weight: 500;
}

#logout-btn {
  color: var(--red);
  font-size: 15px;
}

/* =========================================
   MODE SELECTOR (Native Segmented Control)
========================================= */
#mode-bar {
  padding: 12px 16px;
  background: var(--bg);
  border-bottom: 0.5px solid var(--border);
  flex-shrink: 0;
  display: flex;
  justify-content: center;
}

.mode-segmented {
  display: flex;
  background: var(--surface);
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
  background: #636366; /* iOS selected segment color */
  box-shadow: 0 3px 8px rgba(0,0,0,0.12), 0 3px 1px rgba(0,0,0,0.04);
}

/* =========================================
   MESSAGES AREA
========================================= */
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
  max-width: 85%;
  font-size: 16px;
  line-height: 1.35;
  letter-spacing: -0.1px;
  word-wrap: break-word;
}

.msg.human {
  align-self: flex-end;
  background: var(--human);
  color: #fff;
  padding: 10px 14px;
  border-radius: 18px 18px 4px 18px;
}
.msg.human .msg-label { display: none; }

.msg.assistant {
  align-self: flex-start;
  background: var(--surface);
  color: var(--text);
  padding: 10px 14px;
  border-radius: 18px 18px 18px 4px;
}
.msg.assistant .msg-label { display: none; }

.msg.tool {
  align-self: flex-start;
  background: var(--surface-elevated);
  padding: 12px 14px;
  border-radius: 14px;
  font-size: 14px;
  color: var(--text-secondary);
  max-width: 90%;
}
.msg.tool .msg-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  margin-bottom: 4px;
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

.msg.unknown {
  align-self: center;
  font-size: 12px;
  color: var(--text-tertiary);
}

.msg.optimistic { opacity: 0.6; }

/* Markdown inside assistant */
.msg code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px;
  background: rgba(255,255,255,0.1);
  padding: 2px 4px;
  border-radius: 4px;
}
.msg pre.code-block {
  margin: 12px -14px;
  padding: 12px 14px;
  background: #000;
  overflow-x: auto;
  font-size: 13px;
}
.msg pre.code-block code { background: none; padding: 0; }
.msg p { margin-bottom: 8px; }
.msg p:last-child { margin-bottom: 0; }

/* Revert / Approval buttons */
.revert-btn {
  display: inline-block;
  margin-top: 8px;
  color: #fff;
  background: rgba(255,255,255,0.2);
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
}

.approval-bar { display: flex; gap: 8px; margin-top: 12px; }
.approval-bar button {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
}
.btn-approve { background: var(--green); color: #000; }
.btn-reject { background: var(--surface-elevated); color: var(--text); }

/* =========================================
   COMPOSER (Bottom Input Area)
========================================= */
#composer-area {
  flex-shrink: 0;
  background: rgba(28, 28, 30, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 0.5px solid var(--border);
  padding: 10px 16px calc(var(--safe-bottom) + 10px);
}

.composer-inner {
  display: flex;
  align-items: flex-end;
  background: #000;
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 4px;
  gap: 4px;
}

#img-btn {
  width: 32px;
  height: 32px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: var(--text-tertiary);
  margin-bottom: 2px;
  margin-left: 2px;
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
  margin-bottom: 2px;
  margin-right: 2px;
  font-weight: bold;
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
  margin-bottom: 2px;
  margin-right: 2px;
}

/* =========================================
   OVERLAYS (Bottom Sheets)
========================================= */
.overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 200;
  align-items: flex-end;
  justify-content: center;
}
.overlay.visible { display: flex; }

.panel {
  width: 100%;
  background: var(--surface);
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  padding-bottom: var(--safe-bottom);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 0.5px solid var(--border);
}
.panel-header h3 { font-size: 17px; font-weight: 600; }
.panel-close { color: var(--accent); font-size: 17px; font-weight: 500; }

.panel-list {
  list-style: none;
  overflow-y: auto;
}
.panel-list li {
  padding: 16px;
  border-bottom: 0.5px solid var(--border);
  font-size: 17px;
  color: var(--text);
  display: flex;
  flex-direction: column;
}
.panel-list li:active { background: var(--surface-elevated); }
.panel-list li.active { color: var(--accent); }

.chat-sub, .proj-path { font-size: 13px; color: var(--text-tertiary); margin-top: 4px; }

/* =========================================
   TOAST
========================================= */
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

`;

// Replace CSS
const styleRegex = /<style>[\s\S]*?<\/style>/;
content = content.replace(styleRegex, '<style>\n' + nativeCSS + '\n</style>');

// Fix Header HTML Structure for iOS look
content = content.replace(
  /<div id="header">[\s\S]*?<\/div>\s*<div id="project-overlay"/,
  `<div id="header">
    <div class="header-left">
      <button id="project-btn" class="pill-btn" onclick="openProjectPicker()">Project</button>
      <div id="status-dot"></div>
    </div>
    <div id="header-title">Connecting...</div>
    <div class="header-right">
      <button id="chat-btn" class="pill-btn" onclick="openChatPicker()">Chats</button>
      <button id="logout-btn" onclick="logout()">Exit</button>
    </div>
  </div>
  <div id="project-overlay"`
);

// Fix Composer HTML structure
content = content.replace(
  /<div id="composer">[\s\S]*?<\/div>\s*<\/div>\s*<div id="terminal-view">/,
  `<div id="composer-area">
      <div class="composer-inner">
        <button id="img-btn" onclick="triggerImagePick()" title="Attach image">+</button>
        <input type="file" id="img-file-input" accept="image/*" onchange="handleImagePick(this)" style="display:none">
        <textarea id="prompt-input" rows="1" placeholder="Message..."></textarea>
        <button id="send-btn">↑</button>
        <button id="stop-btn" onclick="doStop()">■</button>
      </div>
    </div>
  </div>
  <div id="terminal-view">`
);

// Remove the standalone tab bar (Terminal goes away for a cleaner chat-only look for now, or keep it hidden if not requested, but keeping existing structure)
content = content.replace(/<div id="tab-bar">[\s\S]*?<\/div>/, '');

fs.writeFileSync(file, content);
console.log('Rewritten to ultra-clean iOS PWA design.');
