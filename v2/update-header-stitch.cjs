const fs = require('fs');
const path = require('path');

const clientFile = path.join(__dirname, 'client.html');
let content = fs.readFileSync(clientFile, 'utf8');

// Update header HTML
const oldHeader = `<div id="header">
    <div class="header-left">
      <button id="new-chat-btn-header" class="nav-btn" onclick="doNewChat()" style="font-size:24px; padding:0 4px; display:flex; align-items:center;" title="New Chat">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>
    </div>
    <div class="header-center">
      <div id="header-title">Connecting...</div>
      <div class="status-indicator">
        <div id="status-dot"></div>
        <span id="status-text" style="font-size:11px; color:var(--text-tertiary); margin-top:2px;">Offline</span>
      </div>
    </div>
    <div class="header-right">
      <button id="menu-btn" class="nav-btn" onclick="openMenuPicker()" style="font-size:24px; padding:0 4px; display:flex; align-items:center;" title="Menu">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
      </button>
    </div>
  </div>`;

const newHeader = `<div id="header">
    <div class="header-left">
      <button id="menu-btn" class="nav-btn" onclick="openMenuPicker()" style="font-size:24px; padding:0 4px; display:flex; align-items:center;" title="Menu">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
      </button>
    </div>
    <div class="header-center">
      <div id="header-title" style="font-size: 17px;">Connecting...</div>
      <div class="status-indicator">
        <div id="status-dot"></div>
        <span id="status-text" style="font-size:11px; color:var(--accent); margin-top:2px; font-weight: 500;">Offline</span>
      </div>
    </div>
    <div class="header-right">
      <button id="new-chat-btn-header" class="nav-btn" onclick="doNewChat()" style="font-size:24px; padding:0 4px; display:flex; align-items:center;" title="New Chat">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
      </button>
    </div>
  </div>`;

content = content.replace(oldHeader, newHeader);

// Redesign menu-panel to look better
content = content.replace(
  /\.panel, \.revert-panel \{[\s\S]*?\}/m,
  `.panel, .revert-panel {
  width: 100%;
  background: var(--surface);
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  padding-bottom: max(var(--safe-bottom), 20px);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 -10px 40px rgba(0,0,0,0.6);
}`
);

// Style adjustments for panel list
content = content.replace(
  /\.panel-list li \{[\s\S]*?\}/m,
  `.panel-list li {
  padding: 18px 20px;
  border-bottom: 1px solid var(--bg);
  font-size: 17px;
  color: var(--text);
  display: flex;
  flex-direction: column;
  transition: background 0.2s;
}`
);

fs.writeFileSync(clientFile, content);
console.log('Header and menu styled.');
