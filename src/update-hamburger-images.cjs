const fs = require('fs');
const path = require('path');

// 1. Update dom-extractor.ts
const domFile = path.join(__dirname, 'dom-extractor.ts');
let domContent = fs.readFileSync(domFile, 'utf8');

// Add images field to HumanMessage interface
if (!domContent.includes('images?: string[];')) {
  domContent = domContent.replace(
    /mentions: \{ name: string; type: string \}\[\];/,
    `mentions: { name: string; type: string }[];
  images?: string[];`
  );
}

// Extract images in extractCursorState
if (!domContent.includes('var images: string[] = [];')) {
  domContent = domContent.replace(
    /var mentions: \{ name: string; type: string \}\[\] = \[\];/,
    `var mentions: { name: string; type: string }[] = [];
      var imgEls = htmlEl.querySelectorAll('img');
      var images: string[] = [];
      for (var ii = 0; ii < imgEls.length; ii++) {
        var src = (imgEls[ii] as HTMLImageElement).src;
        if (src) images.push(src);
      }`
  );
}

if (!domContent.includes('images: images,')) {
  domContent = domContent.replace(
    /mentions: mentions,/,
    `mentions: mentions,
        images: images,`
  );
}

fs.writeFileSync(domFile, domContent);


// 2. Update client.html
const clientFile = path.join(__dirname, 'client.html');
let clientContent = fs.readFileSync(clientFile, 'utf8');

// --- Replace Header HTML ---
const newHeader = `<div id="header">
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
  </div>
  
  <div id="menu-overlay" class="overlay" onclick="closeMenuPicker(event)">
    <div id="menu-panel" class="panel">
      <div class="panel-header">
        <h3>Menu</h3>
        <button class="panel-close" onclick="closeMenuPicker()">&times;</button>
      </div>
      <ul class="panel-list">
        <li onclick="closeMenuPicker(); openProjectPicker();">
          <div style="display:flex; justify-content:space-between; width:100%;">
            <span>Project</span>
            <span id="menu-project-val" style="color:var(--text-tertiary); font-size:15px;">—</span>
          </div>
        </li>
        <li onclick="closeMenuPicker(); openModelPicker();">
          <div style="display:flex; justify-content:space-between; width:100%;">
            <span>Model</span>
            <span id="menu-model-val" style="color:var(--text-tertiary); font-size:15px;">—</span>
          </div>
        </li>
        <li onclick="closeMenuPicker(); openChatPicker();">
          <div style="display:flex; justify-content:space-between; width:100%;">
            <span>Conversations</span>
            <span style="color:var(--text-tertiary);">></span>
          </div>
        </li>
      </ul>
    </div>
  </div>`;

clientContent = clientContent.replace(/<div id="header">[\s\S]*?<\/div>\s*<div id="project-overlay"/, newHeader + '\n  <div id="project-overlay"');

// --- Replace Composer HTML for Preview ---
const newComposer = `<div id="composer-area">
      <div class="composer-inner" style="flex-direction: column; align-items: stretch;">
        <div id="preview-area" style="display:none; padding: 8px 8px 0 8px; gap: 8px; overflow-x: auto; white-space: nowrap;"></div>
        <div style="display: flex; align-items: flex-end; width: 100%;">
          <button id="img-btn" onclick="triggerImagePick()" title="Attach image">+</button>
          <input type="file" id="img-file-input" accept="image/*" onchange="handleImagePick(this)" style="display:none">
          <textarea id="prompt-input" rows="1" placeholder="Message..."></textarea>
          <button id="send-btn">↑</button>
          <button id="stop-btn" onclick="doStop()">■</button>
        </div>
      </div>
    </div>`;

clientContent = clientContent.replace(/<div id="composer-area">[\s\S]*?<\/div>\s*<\/div>\s*<div id="terminal-view"/, newComposer + '\n  </div>\n  <div id="terminal-view"');

// --- Add Menu JS ---
const menuJs = `
// ── Menu ──
var $menuOverlay = $('menu-overlay');
function openMenuPicker() {
  $menuOverlay.classList.add('visible');
  $('menu-project-val').textContent = $projectBtn ? $projectBtn.textContent : '—';
  $('menu-model-val').textContent = currentModel || '—';
}
function closeMenuPicker(e) {
  if (e && e.target !== $menuOverlay && !e.target.classList.contains('panel-close')) return;
  $menuOverlay.classList.remove('visible');
}
`;

clientContent = clientContent.replace(/\/\/ ── Mode selector ──/, menuJs + '\n// ── Mode selector ──');

// --- Fix JS variables for the removed buttons from header ---
// $modelBtn and $projectBtn and $chatBtn are no longer in DOM directly where they used to be, but let's keep them as dummy objects if missing so code doesn't crash, OR we can just let them be null and fix the references.
// Let's create dummy elements for them if they don't exist so existing logic works without rewriting it all.
clientContent = clientContent.replace(
  /var \$projectBtn = \$\('project-btn'\);/,
  "var $projectBtn = document.createElement('button'); // Dummy since it moved to menu"
);
clientContent = clientContent.replace(
  /var \$modelBtn = \$\('model-btn'\);/,
  "var $modelBtn = document.createElement('button');"
);
clientContent = clientContent.replace(
  /var \$chatBtn = \$\('chat-btn'\);/,
  "var $chatBtn = document.createElement('button');"
);


// --- Update Image Upload Logic to show Preview ---
clientContent = clientContent.replace(
  /function uploadImage\(dataUrl, filename\) \{[\s\S]*?\}\);\s*\}/,
  `function uploadImage(dataUrl, filename) {
  var previewArea = $('preview-area');
  previewArea.style.display = 'flex';
  var imgWrapper = document.createElement('div');
  imgWrapper.style.position = 'relative';
  imgWrapper.style.display = 'inline-block';
  
  var img = document.createElement('img');
  img.src = dataUrl;
  img.style.height = '60px';
  img.style.borderRadius = '8px';
  img.style.border = '1px solid var(--border)';
  img.style.objectFit = 'cover';
  
  imgWrapper.appendChild(img);
  previewArea.appendChild(imgWrapper);
  
  fetch(BASE + '/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
    body: JSON.stringify({ data: dataUrl, filename: filename }),
  }).then(function(r) {
    if (r.status === 401) { logout(); return null; }
    return r.json();
  }).then(function(j) {
    if (!j) return;
    if (j.ok) {
      // Toast removed for less noise, visual feedback is enough
    } else {
      showToast('Image failed: ' + (j.error || 'unknown'), 4000);
      imgWrapper.remove();
      if(previewArea.children.length === 0) previewArea.style.display = 'none';
    }
  }).catch(function(e) {
    showToast('Upload error: ' + e.message, 3000);
    imgWrapper.remove();
    if(previewArea.children.length === 0) previewArea.style.display = 'none';
  }).finally(function() {
    imageUploading = false;
    $imgBtn.disabled = false;
    $imgBtn.classList.remove('uploading');
  });
}`
);

// Clear preview on send
clientContent = clientContent.replace(
  /optimisticText = text;/,
  `optimisticText = text;
  $('preview-area').innerHTML = '';
  $('preview-area').style.display = 'none';`
);


// --- Update buildMsg to show images ---
clientContent = clientContent.replace(
  /var body = document\.createElement\('div'\);\s*body\.className = 'msg-body';\s*body\.textContent = m\.text \|\| '';\s*div\.appendChild\(body\);/,
  `var body = document.createElement('div');
      body.className = 'msg-body';
      body.textContent = m.text || '';
      div.appendChild(body);
      
      if (m.images && m.images.length > 0) {
        var imgsDiv = document.createElement('div');
        imgsDiv.style.display = 'flex';
        imgsDiv.style.flexWrap = 'wrap';
        imgsDiv.style.gap = '8px';
        imgsDiv.style.marginTop = '8px';
        for(var i=0; i<m.images.length; i++) {
          var img = document.createElement('img');
          img.src = m.images[i];
          img.style.maxHeight = '150px';
          img.style.maxWidth = '100%';
          img.style.borderRadius = '8px';
          imgsDiv.appendChild(img);
        }
        div.appendChild(imgsDiv);
      }`
);

fs.writeFileSync(clientFile, clientContent);
console.log('Hamburger menu and image preview added.');
