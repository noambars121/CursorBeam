const fs = require('fs');
const path = require('path');

const clientFile = path.join(__dirname, 'client.html');
let content = fs.readFileSync(clientFile, 'utf8');

// 1. Fix iOS scrolling/dragging issue on fixed bottom elements
// Add standard PWA touch behavior preventions to body and specific containers

// We need to prevent overscroll/rubber-banding.
const newCss = `
  /* Stop overscroll on the entire document */
  html, body {
    overscroll-behavior: none;
  }
`;

content = content.replace(
  'body {',
  `${newCss}\nbody {`
);

// Modify the #composer-area to be properly fixed inside the flex column
// Currently it is flex-shrink: 0, which is good, but dragging it scrolls the view because it sits at the bottom of the flex container.
// Or the user is dragging the background of #composer-area.

content = content.replace(
  /#composer-area \{\s*flex-shrink: 0;\s*background: transparent;\s*padding: 10px 16px max\(calc\(var\(--safe-bottom\) \+ 8px\), 16px\);\s*z-index: 20;\s*padding-bottom: max\(calc\(var\(--safe-bottom\) \+ 100px\), 100px\);\s*\}/,
  `#composer-area {
  flex-shrink: 0;
  background: transparent;
  padding: 10px 16px max(calc(var(--safe-bottom) + 8px), 16px);
  z-index: 20;
  padding-bottom: max(calc(var(--safe-bottom) + 100px), 100px);
  /* Prevent dragging the composer area from scrolling the background */
  touch-action: none;
}`
);

content = content.replace(
  /<nav id="bottom-nav"[^>]*>/,
  `<nav id="bottom-nav" style="position:fixed; bottom:0; left:0; width:100%; display:flex; justify-content:space-around; align-items:center; padding:16px 32px max(env(safe-area-inset-bottom, 32px), 32px) 32px; background:rgba(28,27,27,0.8); backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px); z-index:50; box-shadow:0 -10px 30px rgba(0,0,0,0.5); border-top:1px solid rgba(255,255,255,0.05); touch-action:none;">`
);

// We also need to add a touchmove preventDefault script for these specific areas so iOS doesn't drag them.
const touchScript = `
// ── iOS Drag Prevention ──
document.addEventListener('DOMContentLoaded', function() {
  var noDragElements = [
    document.getElementById('bottom-nav'),
    document.getElementById('composer-area'),
    document.getElementById('term-composer')
  ];
  
  noDragElements.forEach(function(el) {
    if (el) {
      el.addEventListener('touchmove', function(e) {
        // Prevent scrolling when dragging the background of the composer or nav bar
        // But allow dragging if they are dragging inside a scrollable child (like textarea)
        if (e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
          e.preventDefault();
        }
      }, { passive: false });
    }
  });
});
`;

if (!content.includes('iOS Drag Prevention')) {
  content = content.replace('// ── Textarea ──', touchScript + '\n// ── Textarea ──');
}

fs.writeFileSync(clientFile, content);
console.log('Fixed iOS drag/scroll on bottom nav and composer');
