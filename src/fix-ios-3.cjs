const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'client.html');
let content = fs.readFileSync(file, 'utf8');

// --- 1. REMOVE JS VIEWPORT HACK ---
// This hack causes the black void when the keyboard opens because iOS 
// already shrinks the viewport, and the hack translates it up additionally.
content = content.replace(/\/\/ ── iOS keyboard viewport fix ──[\s\S]*?\/\/\ ── Status model ──/, '// ── Status model ──');


// --- 2. UPDATE HEADER HTML ---
// We replace the header with a clean, native iOS layout
const newHeader = `<div id="header">
    <div class="header-left">
      <button id="project-btn" class="nav-btn" onclick="openProjectPicker()">Project</button>
    </div>
    <div class="header-center">
      <div id="header-title">Connecting...</div>
      <div class="status-indicator">
        <div id="status-dot"></div>
        <span id="status-text" style="font-size:11px; color:var(--text-tertiary); margin-top:2px;">Offline</span>
      </div>
    </div>
    <div class="header-right">
      <button id="model-btn" class="nav-btn" onclick="openModelPicker()" style="margin-right: 12px; max-width: 60px;">Model</button>
      <button id="chat-btn" class="nav-btn" onclick="openChatPicker()" style="font-weight:600;">Chats</button>
    </div>
  </div>`;

content = content.replace(/<div id="header">[\s\S]*?<\/div>\s*<div id="project-overlay"/, newHeader + '\n  <div id="project-overlay"');


// --- 3. UPDATE JS TO HANDLE NEW HEADER ---
// We need to update the `updateStatus` function to update `#status-text` instead of shoving everything into the title.
content = content.replace(
  /var titleText;[\s\S]*?\$title\.textContent = titleText;/,
  `var titleText = windowTitle || lastWindowTitle || 'Cursor';
  $title.textContent = titleText.length > 25 ? titleText.substring(0,25)+'...' : titleText;
  
  var statusText = conn === 'connected' ? resolveActivityLabel() : CONNECTION_LABELS[conn];
  if(conn === 'connected' && !isSending && serverActivityState !== 'responding' && serverActivityState !== 'waiting_for_approval' && serverActivityState !== 'creating_chat' && serverActivityState !== 'switching_chat') {
     statusText = 'Online';
  }
  var $statusText = document.getElementById('status-text');
  if($statusText) $statusText.textContent = statusText;`
);

// Fix resolveActivityLabel since we removed windowTitle arg logic from it implicitly
content = content.replace(
  /function resolveActivityLabel\(windowTitle\) \{[\s\S]*?return windowTitle \|\| CONNECTION_LABELS\.connected;\n\}/,
  `function resolveActivityLabel() {
  if (isSending) return ACTIVITY_LABELS.sending;
  if (chatSwitching || serverActivityState === 'switching_chat') return ACTIVITY_LABELS.switching_chat;
  if (serverActivityState === 'creating_chat') return ACTIVITY_LABELS.creating_chat;
  if (serverActivityState === 'waiting_for_approval') return ACTIVITY_LABELS.waiting_for_approval;
  if (serverActivityState === 'responding') return ACTIVITY_LABELS.responding;
  return CONNECTION_LABELS.connected;
}`
);


// --- 4. UPDATE CSS ---
const cssMatch = content.match(/<style>([\s\S]*?)<\/style>/);
if (cssMatch) {
  let css = cssMatch[1];

  // Fix body
  css = css.replace(/body\s*\{[\s\S]*?\}/, `body {
  background-color: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
  font-size: 16px;
  line-height: 1.4;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
}`);

  // Fix #app
  css = css.replace(/#app\s*\{[\s\S]*?\}/, `#app {
  display: none;
  flex-direction: column;
  height: 100%;
  width: 100vw;
}`);

  // Replace Header styles
  css = css.replace(/#header\s*\{[\s\S]*?#msg-count\s*\{\s*display:\s*none;\s*\}/, `#header {
  padding-top: max(var(--safe-top), 12px);
  background: rgba(28, 28, 30, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 0.5px solid rgba(255,255,255,0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 16px;
  padding-right: 16px;
  padding-bottom: 10px;
  flex-shrink: 0;
  z-index: 100;
}
.header-left, .header-right {
  display: flex;
  align-items: center;
  flex: 1;
}
.header-right {
  justify-content: flex-end;
}
.header-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 2;
  overflow: hidden;
}
#header-title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  text-align: center;
}
.status-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
}
#status-dot {
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background: var(--text-tertiary);
  flex-shrink: 0;
  margin-top: 2px;
}
#status-dot.connected { background: var(--green); }
#status-dot.reconnecting, #status-dot.switching_project { background: var(--yellow); }
#status-dot.disconnected { background: var(--red); }

.nav-btn {
  color: var(--accent);
  font-size: 17px;
  font-weight: 400;
  max-width: 90px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nav-btn:disabled { opacity: 0.4; }
#logout-btn, #msg-count { display: none; }`);

  // Ensure prompt-input has font-size 16px to prevent iOS zoom
  css = css.replace(/#prompt-input\s*\{[\s\S]*?\}/, `#prompt-input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text);
  font-size: 16px; /* CRITICAL: prevents iOS zoom */
  line-height: 1.4;
  padding: 8px 4px;
  max-height: 120px;
  resize: none;
  outline: none;
  font-family: inherit;
}`);

  content = content.replace(/<style>[\s\S]*?<\/style>/, '<style>\n' + css + '\n</style>');
}

fs.writeFileSync(file, content);
console.log('Fixed keyboard viewport and simplified header.');
