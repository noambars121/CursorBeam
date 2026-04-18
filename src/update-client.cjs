const fs = require('fs');
const path = require('path');

const clientFile = path.join(__dirname, 'client.html');
let clientContent = fs.readFileSync(clientFile, 'utf8');

// --- 1. Fix Send/Stop Buttons Text ---
clientContent = clientContent.replace(
  /\$send\.textContent = 'Send';/g,
  "$send.textContent = '↑';"
);
clientContent = clientContent.replace(
  /\$stop\.textContent = 'Stop';/g,
  "$stop.textContent = '■';"
);

// --- 2. Change image upload logic to keep images locally until send ---
// Replace uploadImage with a local only version
clientContent = clientContent.replace(
  /function uploadImage\(dataUrl, filename\) \{[\s\S]*?\}\s*\}/,
  `var pendingImages = [];
function uploadImage(dataUrl, filename) {
  pendingImages.push(dataUrl);
  renderPreviewArea();
  imageUploading = false;
  $imgBtn.disabled = false;
  $imgBtn.classList.remove('uploading');
}

function removePendingImage(index) {
  pendingImages.splice(index, 1);
  renderPreviewArea();
}

function renderPreviewArea() {
  var previewArea = $('preview-area');
  previewArea.innerHTML = '';
  if (pendingImages.length === 0) {
    previewArea.style.display = 'none';
    return;
  }
  
  previewArea.style.display = 'flex';
  for (var i = 0; i < pendingImages.length; i++) {
    var wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block';
    
    var img = document.createElement('img');
    img.src = pendingImages[i];
    img.style.height = '60px';
    img.style.borderRadius = '8px';
    img.style.border = '1px solid var(--border)';
    img.style.objectFit = 'cover';
    
    var rmBtn = document.createElement('button');
    rmBtn.innerHTML = '&times;';
    rmBtn.style.position = 'absolute';
    rmBtn.style.top = '-6px';
    rmBtn.style.right = '-6px';
    rmBtn.style.background = 'var(--red)';
    rmBtn.style.color = '#fff';
    rmBtn.style.border = 'none';
    rmBtn.style.borderRadius = '12px';
    rmBtn.style.width = '20px';
    rmBtn.style.height = '20px';
    rmBtn.style.fontSize = '14px';
    rmBtn.style.lineHeight = '14px';
    rmBtn.style.cursor = 'pointer';
    rmBtn.style.display = 'flex';
    rmBtn.style.alignItems = 'center';
    rmBtn.style.justifyContent = 'center';
    
    (function(idx) {
      rmBtn.onclick = function() { removePendingImage(idx); };
    })(i);
    
    wrapper.appendChild(img);
    wrapper.appendChild(rmBtn);
    previewArea.appendChild(wrapper);
  }
}`
);

// Update doSend to pass images
clientContent = clientContent.replace(
  /body: JSON\.stringify\(\{ prompt: text \}\),/,
  `body: JSON.stringify({ prompt: text, images: pendingImages }),`
);

// Clear images after send
clientContent = clientContent.replace(
  /optimisticText = text;\s*\$\('preview-area'\)\.innerHTML = '';\s*\$\('preview-area'\)\.style\.display = 'none';/,
  `optimisticText = text;
  var imgsForOpt = pendingImages.slice();
  pendingImages = [];
  renderPreviewArea();`
);

// Pass images to optimistic message
clientContent = clientContent.replace(
  /buildMsg\(\{ type: 'human', text: text, flatIndex: -1, id: 'opt', mentions: \[\] \}\);/,
  `buildMsg({ type: 'human', text: text, flatIndex: -1, id: 'opt', mentions: [], images: imgsForOpt });`
);

fs.writeFileSync(clientFile, clientContent);
console.log('client.html updated successfully.');
