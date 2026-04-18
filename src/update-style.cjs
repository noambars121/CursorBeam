const fs = require('fs');
const file = 'v2/client.html';
let content = fs.readFileSync(file, 'utf8');

const newCSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#000000;
  --surface:#151515;
  --surface-raised:#222222;
  --border:#2b2b2b;
  --text:#ffffff;
  --dim:#a1a1a6;
  --accent:#0a7aff;
  --accent-gradient:linear-gradient(135deg, #0a7aff, #3c9cff);
  --human:#0a7aff;
  --assistant:#2c2c2e;
  --tool:#d49010;
  --thought:#9e62ff;
  --red:#ff453a;
  --yellow:#ffd60a;
  --green:#32d74b;
  --safe-bottom:env(safe-area-inset-bottom, 0px);
  --safe-top:env(safe-area-inset-top, 0px);
  --shadow-lg: 0 10px 30px rgba(0,0,0,0.6);
  --radius-lg: 16px;
  --radius-sm: 8px;
}

@supports (font: -apple-system-body) {
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
}
@supports not (font: -apple-system-body) {
  body { font-family: system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
}

html{height:100%;height:100dvh;background:var(--bg)}
body{height:100%;background:var(--bg);color:var(--text);font-size:15px;line-height:1.4;overflow:hidden;-webkit-font-smoothing:antialiased}

/* Common buttons */
button{font-family:inherit;transition:transform 0.15s ease, opacity 0.15s ease;-webkit-tap-highlight-color:transparent}
button:active:not(:disabled){transform:scale(0.96);opacity:0.8}

/* login / offline */
#login-screen, #offline-screen{display:none;align-items:center;justify-content:center;height:100%;padding:20px;text-align:center;flex-direction:column;background:radial-gradient(circle at center, #151515 0%, #000 100%)}
.login-box, #offline-screen > div{width:100%;max-width:340px;background:var(--surface);border:1px solid var(--border);border-radius:24px;padding:32px 24px;box-shadow:var(--shadow-lg);backdrop-filter:blur(20px)}
.login-box h1, #offline-screen h1{font-size:22px;font-weight:700;margin-bottom:8px;letter-spacing:-0.5px}
.login-box p, #offline-screen p{color:var(--dim);font-size:14px;margin-bottom:24px}
.login-box input{width:100%;padding:14px 16px;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:12px;color:var(--text);font-size:16px;outline:none;transition:border-color 0.2s}
.login-box input:focus{border-color:var(--accent);background:rgba(255,255,255,0.08)}
.login-box button, #start-sys-btn{width:100%;margin-top:16px;padding:14px;background:var(--accent-gradient);color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(10,122,255,0.3)}
.login-err{color:var(--red);font-size:14px;margin-top:12px;display:none;font-weight:500}

/* app shell */
#app{display:none;flex-direction:column;height:100%}
#header{flex-shrink:0;display:flex;align-items:center;gap:10px;padding:max(var(--safe-top),12px) 16px 12px;background:rgba(21,21,21,0.85);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid rgba(255,255,255,0.08);z-index:10}

#status-dot{width:8px;height:8px;border-radius:50%;background:var(--dim);flex-shrink:0;transition:background 0.4s ease, box-shadow 0.4s ease}
#status-dot.connected{background:var(--green);box-shadow:0 0 8px rgba(50,215,75,0.6)}
#status-dot.reconnecting{background:var(--yellow);animation:pulse 1.2s infinite;box-shadow:0 0 8px rgba(255,214,10,0.6)}
#status-dot.switching_project{background:var(--yellow);animation:pulse 0.8s infinite}
#status-dot.disconnected{background:var(--red);box-shadow:0 0 8px rgba(255,69,58,0.6)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

#header-title{font-size:15px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;letter-spacing:-0.2px}
#msg-count{font-size:12px;color:var(--dim);flex-shrink:0;background:rgba(255,255,255,0.1);padding:2px 8px;border-radius:12px;font-weight:500}
#logout-btn{background:rgba(255,255,255,0.08);border:none;border-radius:12px;color:var(--text);font-size:12px;font-weight:600;cursor:pointer;padding:6px 12px}

/* Action pills (Projects, Chats, Model) */
.pill-btn{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:6px 12px;color:var(--text);font-size:13px;font-weight:500;cursor:pointer;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0;display:flex;align-items:center;gap:4px}
.pill-btn:disabled{opacity:0.4;cursor:not-allowed}

/* Overlays (Project, Chat, Model) */
.overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:200;align-items:flex-end;justify-content:center;padding:0}
.overlay.visible{display:flex;animation:fade-in 0.2s ease-out}
.panel{width:100%;max-width:500px;background:var(--surface);border-top-left-radius:24px;border-top-right-radius:24px;overflow:hidden;max-height:85vh;display:flex;flex-direction:column;box-shadow:var(--shadow-lg);transform:translateY(100%);animation:slide-up 0.3s cubic-bezier(0.16,1,0.3,1) forwards}
.overlay.visible .panel{transform:translateY(0)}

@keyframes fade-in{from{opacity:0}to{opacity:1}}
@keyframes slide-up{from{transform:translateY(100%)}to{transform:translateY(0)}}

.panel-header{display:flex;align-items:center;justify-content:space-between;padding:20px;border-bottom:1px solid rgba(255,255,255,0.05);background:var(--surface)}
.panel-header h3{font-size:18px;font-weight:700;margin:0;letter-spacing:-0.3px}
.panel-close{background:rgba(255,255,255,0.08);border:none;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:var(--text);font-size:18px;cursor:pointer}
.panel-list{list-style:none;padding:8px;margin:0;overflow-y:auto;flex:1}
.panel-list li{padding:14px 16px;border-radius:12px;margin-bottom:4px;cursor:pointer;font-size:15px;display:flex;align-items:center;gap:12px;transition:background 0.15s}
.panel-list li:active{background:rgba(255,255,255,0.05)}
.panel-list li.active{background:rgba(10,122,255,0.15);color:var(--accent)}

#project-list li .proj-path{display:block;font-size:12px;color:var(--dim);margin-top:2px;opacity:0.8}
#chat-list li{align-items:flex-start}
#chat-list li .chat-meta{flex:1;min-width:0}
#chat-list li .chat-title{display:block;font-weight:500;margin-bottom:2px}
#chat-list li .chat-sub{display:block;font-size:12px;color:var(--dim)}
#chat-list li .chat-time{font-size:11px;color:var(--dim);opacity:0.7}

#new-chat-btn{background:var(--text);color:#000;border:none;border-radius:16px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer}

.project-switching-overlay{position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);z-index:300;display:flex;align-items:center;justify-content:center;color:var(--text);font-size:16px;font-weight:500;flex-direction:column;gap:16px}
.switching-spinner{display:inline-block;width:32px;height:32px;border:3px solid rgba(255,255,255,0.1);border-top-color:var(--accent);border-radius:50%;animation:spin .8s cubic-bezier(0.6,0.1,0.4,0.9) infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* mode bar (segmented control) */
#mode-bar{flex-shrink:0;display:flex;align-items:center;padding:12px 16px;background:var(--bg);border-bottom:1px solid rgba(255,255,255,0.05);overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
#mode-bar::-webkit-scrollbar{display:none}
.mode-segmented{display:flex;background:var(--surface);border-radius:12px;padding:3px;gap:2px}
.mode-btn{padding:6px 16px;border-radius:10px;font-size:13px;font-weight:600;border:none;background:transparent;color:var(--dim);cursor:pointer;white-space:nowrap}
.mode-btn.active{background:rgba(255,255,255,0.1);color:var(--text);box-shadow:0 2px 8px rgba(0,0,0,0.2)}
.mode-label{display:none;} /* hide label for cleaner look */

/* messages */
#messages{flex:1;overflow-y:auto;padding:16px 12px 24px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;display:flex;flex-direction:column;gap:16px;background:var(--bg)}
.msg{max-width:88%;font-size:15px;line-height:1.5;word-break:break-word;position:relative;animation:msg-pop 0.3s cubic-bezier(0.16,1,0.3,1)}
@keyframes msg-pop{from{opacity:0;transform:translateY(10px) scale(0.98)}to{opacity:1;transform:translateY(0) scale(1)}}

.msg.human{align-self:flex-end;background:var(--human);color:#fff;border-radius:20px 20px 4px 20px;padding:12px 16px;box-shadow:0 4px 12px rgba(10,122,255,0.2)}
.msg.human .msg-label{display:none} /* Clean iMessage look */
.msg.human .msg-body{color:#fff}

.msg.assistant{align-self:flex-start;background:var(--surface);color:var(--text);border-radius:20px 20px 20px 4px;padding:14px 18px;border:1px solid var(--border)}
.msg.assistant .msg-label{display:none}

.msg.tool{align-self:flex-start;background:rgba(212,144,16,0.1);color:var(--tool);border-radius:16px;padding:10px 14px;font-size:13px;border:1px solid rgba(212,144,16,0.2);max-width:95%}
.msg.tool .msg-label{font-size:11px;font-weight:700;text-transform:uppercase;margin-bottom:4px;opacity:0.8;letter-spacing:0.5px}

.msg.thought{align-self:flex-start;background:transparent;color:var(--dim);border-left:2px solid var(--thought);padding:6px 12px;font-size:13px;font-style:italic}
.msg.loading{align-self:flex-start;background:transparent;color:var(--dim);font-style:italic;padding:8px;font-size:14px}
.msg.loading::after{content:'';display:inline-block;width:12px;height:12px;border:2px solid var(--dim);border-top-color:transparent;border-radius:50%;margin-left:8px;vertical-align:middle;animation:spin 1s linear infinite}

.msg.unknown{align-self:center;background:var(--surface);border-radius:12px;padding:8px 12px;color:var(--dim);font-size:12px;text-align:center;border:1px solid var(--border)}
.msg.optimistic{opacity:0.6}

/* Markdown styling inside assistant */
.msg.assistant code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:6px;color:#ff7b72}
.msg.assistant pre.code-block{margin:12px -6px;padding:14px;background:#000;border:1px solid var(--border);border-radius:12px;overflow-x:auto;-webkit-overflow-scrolling:touch;white-space:pre;font-size:13px;line-height:1.45;box-shadow:inset 0 0 10px rgba(0,0,0,0.5)}
.msg.assistant pre.code-block code{background:none;padding:0;color:#c9d1d9}
.msg.assistant p{margin-bottom:10px}
.msg.assistant p:last-child{margin-bottom:0}
.msg.assistant ul, .msg.assistant ol{margin-left:20px;margin-bottom:10px}

/* approval buttons inside tools */
.approval-bar{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.approval-bar button{padding:8px 16px;border-radius:12px;font-size:13px;font-weight:600;border:none;cursor:pointer}
.btn-approve{background:var(--green);color:#000}
.btn-reject{background:rgba(255,255,255,0.1);color:var(--text)}

/* Actions bar above composer */
#actions-bar{display:none;flex-shrink:0;padding:12px 16px;background:var(--surface);border-top-left-radius:24px;border-top-right-radius:24px;border-top:1px solid rgba(255,255,255,0.05);box-shadow:0 -10px 20px rgba(0,0,0,0.5)}
#actions-bar.visible{display:block;animation:slide-up 0.2s ease-out}
.actions-header{font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px}
.action-item{display:flex;align-items:center;gap:8px;margin-bottom:8px;background:var(--bg);padding:10px;border-radius:12px;border:1px solid var(--border)}
.action-item:last-child{margin-bottom:0}
.action-context{flex:1;font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.action-btns{display:flex;gap:6px;flex-shrink:0}
.action-btns button{padding:6px 14px;border-radius:10px;font-size:13px;font-weight:600}
.action-btn-approve{background:var(--green);color:#000}
.action-btn-run{background:var(--accent);color:#fff}
.action-btn-reject, .action-btn-skip{background:rgba(255,255,255,0.1);color:var(--text)}

/* composer */
#composer{flex-shrink:0;display:flex;gap:10px;padding:12px 16px calc(12px + var(--safe-bottom));background:var(--bg);position:relative;z-index:20}
.composer-inner{flex:1;display:flex;background:var(--surface);border:1px solid var(--border);border-radius:24px;padding:4px;align-items:flex-end;transition:border-color 0.2s, box-shadow 0.2s}
.composer-inner:focus-within{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}

#img-btn{flex-shrink:0;width:36px;height:36px;background:transparent;border:none;border-radius:18px;color:var(--dim);font-size:18px;display:flex;align-items:center;justify-content:center;margin-bottom:2px}
#img-btn:active{background:rgba(255,255,255,0.05)}
#img-btn.uploading{color:var(--accent);animation:pulse 0.8s infinite}

#prompt-input{flex:1;padding:10px 4px 10px 8px;background:transparent;border:none;color:var(--text);font-size:16px;resize:none;outline:none;max-height:120px;line-height:1.4;font-family:inherit}
#prompt-input::placeholder{color:var(--dim)}

#send-btn{flex-shrink:0;width:36px;height:36px;background:var(--accent);color:#fff;border:none;border-radius:18px;display:flex;align-items:center;justify-content:center;margin-bottom:2px;margin-right:2px}
#send-btn::before{content:'↑';font-size:20px;font-weight:700}
#send-btn:disabled{opacity:0.4;background:var(--dim)}

#stop-btn{display:none;flex-shrink:0;width:36px;height:36px;background:var(--red);color:#fff;border:none;border-radius:18px;align-items:center;justify-content:center;margin-bottom:2px;margin-right:2px}
#stop-btn::before{content:'■';font-size:14px;font-weight:900}

/* tab bar */
#tab-bar{flex-shrink:0;display:flex;background:rgba(21,21,21,0.85);backdrop-filter:blur(16px);border-top:1px solid rgba(255,255,255,0.05);padding-bottom:var(--safe-bottom)}
.tab-btn{flex:1;padding:16px 0;border:none;background:transparent;color:var(--dim);font-size:14px;font-weight:600;display:flex;flex-direction:column;align-items:center;gap:4px}
.tab-btn.active{color:var(--accent)}
.tab-btn::after{content:'';width:4px;height:4px;border-radius:50%;background:transparent;margin-top:2px}
.tab-btn.active::after{background:var(--accent)}

/* terminal view */
#terminal-view{display:none;flex:1;flex-direction:column;overflow:hidden;background:#000}
#terminal-view.visible{display:flex}
#terminal-output{flex:1;overflow-y:auto;padding:16px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.5;color:#c9d1d9;white-space:pre-wrap;word-break:break-all;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
#terminal-output a{color:var(--accent);text-decoration:none}
#terminal-status{flex-shrink:0;padding:8px 16px;font-size:12px;color:var(--dim);background:var(--surface);border-top:1px solid var(--border);display:flex;align-items:center;gap:8px}
#term-presets{flex-shrink:0;display:flex;gap:8px;padding:12px 16px;background:var(--surface);overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
#term-presets::-webkit-scrollbar{display:none}
.preset-btn{flex-shrink:0;padding:8px 16px;border-radius:16px;font-size:12px;font-weight:600;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:var(--text);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
#term-composer{flex-shrink:0;display:flex;gap:10px;padding:12px 16px calc(12px + var(--safe-bottom));background:var(--bg)}
#term-input{flex:1;padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-radius:16px;color:var(--text);font-size:14px;resize:none;outline:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
#term-input:focus{border-color:var(--accent)}
#term-send{flex-shrink:0;padding:0 20px;background:var(--accent);color:#fff;border:none;border-radius:16px;font-size:15px;font-weight:600}

/* chat view wrapper */
#chat-view{display:flex;flex-direction:column;flex:1;overflow:hidden}
#chat-view.hidden{display:none}

/* revert — destructive checkpoint restore */
.msg.human{position:relative}
.msg.human .revert-btn{display:block;margin-top:8px;padding:6px 12px;background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:12px;font-size:12px;font-weight:600;letter-spacing:0.3px}
.revert-panel-body .warn{color:var(--yellow);font-size:13px;margin-top:12px;padding:10px;background:rgba(255,214,10,0.1);border-radius:8px}

#toast{position:fixed;bottom:calc(100px + var(--safe-bottom));left:50%;transform:translateX(-50%) scale(0.9);background:rgba(255,255,255,0.9);color:#000;padding:10px 20px;border-radius:20px;font-size:14px;font-weight:600;opacity:0;transition:opacity 0.3s, transform 0.3s cubic-bezier(0.16,1,0.3,1);pointer-events:none;z-index:1000;box-shadow:var(--shadow-lg)}
#toast.show{opacity:1;transform:translateX(-50%) scale(1)}
`;

const styleRegex = /<style>[\s\S]*?<\/style>/;
if(styleRegex.test(content)){
  content = content.replace(styleRegex, '<style>\n' + newCSS + '\n</style>');
}

// Fix buttons to pill-btn
content = content.replace(/id="project-btn"(.*?)(class="[^"]*")?(.*?)>/, 'id="project-btn"$1 class="pill-btn" $3>');
content = content.replace(/id="chat-btn"(.*?)(class="[^"]*")?(.*?)>/, 'id="chat-btn"$1 class="pill-btn" $3>');
content = content.replace(/id="model-btn"(.*?)(class="[^"]*")?(.*?)>/, 'id="model-btn"$1 class="pill-btn" $3>');

// Fix overlays to panels
content = content.replace(/id="project-overlay"[^>]*>/, 'id="project-overlay" class="overlay" onclick="closeProjectPicker(event)">');
content = content.replace(/id="project-panel"/, 'id="project-panel" class="panel"');
content = content.replace(/id="project-panel-header"/, 'id="project-panel-header" class="panel-header"');
content = content.replace(/id="project-panel-close"/, 'id="project-panel-close" class="panel-close"');
content = content.replace(/id="project-list"/, 'id="project-list" class="panel-list"');

content = content.replace(/id="chat-overlay"[^>]*>/, 'id="chat-overlay" class="overlay" onclick="closeChatPicker(event)">');
content = content.replace(/id="chat-panel"/, 'id="chat-panel" class="panel"');
content = content.replace(/id="chat-panel-header"/, 'id="chat-panel-header" class="panel-header"');
content = content.replace(/id="chat-panel-close"/, 'id="chat-panel-close" class="panel-close"');
content = content.replace(/id="chat-list"/, 'id="chat-list" class="panel-list"');

content = content.replace(/id="model-overlay"[^>]*>/, 'id="model-overlay" class="overlay" onclick="closeModelPicker(event)">');
content = content.replace(/id="model-panel"/, 'id="model-panel" class="panel"');
content = content.replace(/id="model-panel-header"/, 'id="model-panel-header" class="panel-header"');
content = content.replace(/id="model-panel-close"/, 'id="model-panel-close" class="panel-close"');
content = content.replace(/id="model-list"/, 'id="model-list" class="panel-list"');

// Wrap composer in inner div for native look
if(!content.includes('<div class="composer-inner">')) {
  content = content.replace(
    /<button id="img-btn"[\s\S]*?<textarea id="prompt-input"[\s\S]*?<button id="send-btn">Send<\/button>\s*<button id="stop-btn" onclick="doStop\(\)">Stop<\/button>/m,
    `<div class="composer-inner">
      <button id="img-btn" onclick="triggerImagePick()" title="Attach image">&#128247;</button>
      <input type="file" id="img-file-input" accept="image/*" onchange="handleImagePick(this)">
      <textarea id="prompt-input" rows="1" placeholder="Message Cursor..."></textarea>
      <button id="send-btn"></button>
      <button id="stop-btn" onclick="doStop()"></button>
    </div>`
  );
}

// Wrap mode bar
if(!content.includes('<div class="mode-segmented">')) {
  content = content.replace(
    /<button class="mode-btn" data-mode="agent" onclick="doModeSwitch\('agent'\)">Agent<\/button>[\s\S]*?<button class="mode-btn" data-mode="debug" onclick="doModeSwitch\('debug'\)">Debug<\/button>/m,
    `<div class="mode-segmented">
        <button class="mode-btn" data-mode="agent" onclick="doModeSwitch('agent')">Agent</button>
        <button class="mode-btn" data-mode="ask" onclick="doModeSwitch('ask')">Ask</button>
        <button class="mode-btn" data-mode="plan" onclick="doModeSwitch('plan')">Plan</button>
        <button class="mode-btn" data-mode="debug" onclick="doModeSwitch('debug')">Debug</button>
      </div>`
  );
}

fs.writeFileSync(file, content);
console.log('Updated UI successfully!');
