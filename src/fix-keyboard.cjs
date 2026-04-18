const fs = require('fs');
const path = require('path');

const clientFile = path.join(__dirname, 'client.html');
let content = fs.readFileSync(clientFile, 'utf8');

const keyboardScript = `
// ── iOS Keyboard / Bottom Nav UX Fix ──
document.addEventListener('DOMContentLoaded', function() {
  var inputs = [document.getElementById('prompt-input'), document.getElementById('term-input'), document.getElementById('pw-input')];
  var bottomNav = document.getElementById('bottom-nav');
  var composerArea = document.getElementById('composer-area');
  var termComposer = document.getElementById('term-composer');
  
  function onFocus() {
    if (bottomNav) bottomNav.style.display = 'none';
    if (composerArea) composerArea.style.paddingBottom = 'max(calc(var(--safe-bottom) + 8px), 16px)';
    if (termComposer) termComposer.style.paddingBottom = 'max(calc(var(--safe-bottom) + 10px), 16px)';
  }
  
  function onBlur() {
    if (bottomNav) bottomNav.style.display = 'flex';
    if (composerArea) composerArea.style.paddingBottom = 'max(calc(var(--safe-bottom) + 100px), 100px)';
    if (termComposer) termComposer.style.paddingBottom = 'max(calc(var(--safe-bottom) + 100px), 100px)';
    // iOS Safari scroll fix after blur
    window.scrollTo(0, 0);
  }
  
  inputs.forEach(function(input) {
    if (input) {
      input.addEventListener('focus', onFocus);
      input.addEventListener('blur', onBlur);
    }
  });
});
`;

if (!content.includes('iOS Keyboard / Bottom Nav UX Fix')) {
  content = content.replace('// ── Textarea ──', keyboardScript + '\n// ── Textarea ──');
  fs.writeFileSync(clientFile, content);
  console.log('Keyboard UX fix applied');
} else {
  console.log('Already applied');
}
