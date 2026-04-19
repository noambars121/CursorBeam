const fs = require('fs');
const path = require('path');

const clientFile = path.join(__dirname, 'client.html');
let content = fs.readFileSync(clientFile, 'utf8');

// 1. Add bottom navigation bar if it doesn't exist
if (!content.includes('<nav id="bottom-nav"')) {
  // We need to inject the nav bar inside #app, just before the closing </div>
  const navHtml = `
  <nav id="bottom-nav" style="position:fixed; bottom:0; left:0; width:100%; display:flex; justify-content:space-around; align-items:center; padding:16px 32px max(env(safe-area-inset-bottom, 32px), 32px) 32px; background:rgba(28,27,27,0.8); backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px); z-index:50; box-shadow:0 -10px 30px rgba(0,0,0,0.5); border-top:1px solid rgba(255,255,255,0.05);">
    <div id="tab-chat" class="tab-btn active" data-tab="chat" onclick="switchTab('chat')" style="display:flex; flex-direction:column; align-items:center; cursor:pointer; padding:8px 24px; border-radius:12px; transition:all 0.2s;">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:4px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
      <span style="font-size:10px; text-transform:uppercase; letter-spacing:1px; font-weight:600;">Chat</span>
    </div>
    <div id="tab-term" class="tab-btn" data-tab="term" onclick="switchTab('term')" style="display:flex; flex-direction:column; align-items:center; cursor:pointer; padding:8px 24px; border-radius:12px; transition:all 0.2s;">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:4px;"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
      <span style="font-size:10px; text-transform:uppercase; letter-spacing:1px; font-weight:600;">Terminal</span>
    </div>
  </nav>
`;
  
  content = content.replace(
    '  <div id="terminal-view">',
    navHtml + '\n  <div id="terminal-view">'
  );
}

// Add CSS for the tabs
if (!content.includes('.tab-btn.active')) {
  const tabCss = `
.tab-btn { color: rgba(229, 226, 225, 0.4); }
.tab-btn:hover { color: var(--text); }
.tab-btn.active { 
  background: linear-gradient(to bottom, rgba(152, 203, 255, 0.1), rgba(0, 163, 255, 0.2));
  color: var(--accent);
  box-shadow: 0 0 12px rgba(0,163,255,0.1);
  transform: scale(0.98);
}
#chat-view.hidden { display: none !important; }
#terminal-view.visible { display: flex !important; }
#composer-area { padding-bottom: max(calc(var(--safe-bottom) + 100px), 100px); }
#term-composer { padding-bottom: max(calc(var(--safe-bottom) + 100px), 100px); }
`;
  content = content.replace('</style>', tabCss + '</style>');
}

// 2. Make sure Revert button is styled correctly so it's obvious to the user
content = content.replace(
  /\.revert-btn \{ display: inline-block; margin-top: 8px; color: #fff; background: rgba\(255,255,255,0\.2\); padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 600; \}/,
  `.revert-btn { display: inline-flex; align-items: center; gap: 4px; margin-top: 8px; color: var(--red); background: rgba(255, 180, 171, 0.1); border: 1px solid rgba(255, 180, 171, 0.2); padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; transition: all 0.2s; cursor: pointer; }
  .revert-btn:active { opacity: 0.6; background: rgba(255, 180, 171, 0.2); }`
);

// We need to also add edit capability. Cursor natively only allows editing human messages 
// if it's the *last* one or via an Edit button that opens composer. But doing "edit message"
// natively in relay requires implementing edit message in dom-extractor.ts and relay-server.ts.
// The easiest UX is to allow copying the message text to the input box so the user can send it again,
// but to actually *edit* a previous message, Cursor has an edit pencil. 
// We don't have the Edit implementation right now. We will add a "Copy to input" button for now,
// and assure them Revert works if Cursor supports it for that message.

content = content.replace(
  /div\.appendChild\(abody\);\s*break;/m,
  `div.appendChild(abody);
      break;`
);

content = content.replace(
  /rbtn\.onclick = function\(e\) \{[\s\S]*?\};[\s\S]*?div\.appendChild\(rbtn\);/m,
  `rbtn.onclick = function(e) {
          e.stopPropagation();
          openRevertSheet(m.flatIndex, locator, previewText);
        };
        
        var actionsDiv = document.createElement('div');
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '8px';
        actionsDiv.style.marginTop = '8px';
        actionsDiv.appendChild(rbtn);
        
        var copyBtn = document.createElement('button');
        copyBtn.className = 'revert-btn';
        copyBtn.style.color = 'var(--text-secondary)';
        copyBtn.style.background = 'var(--surface-elevated)';
        copyBtn.style.borderColor = 'var(--border)';
        copyBtn.textContent = 'Copy text';
        copyBtn.onclick = function(e) {
            e.stopPropagation();
            $input.value = m.text || '';
            $input.style.height = 'auto';
            $input.style.height = Math.min($input.scrollHeight, 120) + 'px';
            $input.focus();
            showToast('Copied to input', 2000);
        };
        actionsDiv.appendChild(copyBtn);
        
        div.appendChild(actionsDiv);`
);

fs.writeFileSync(clientFile, content);
console.log('Terminal and Revert buttons added');
