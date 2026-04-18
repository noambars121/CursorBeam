const fs = require('fs');
const path = require('path');

const clientFile = path.join(__dirname, 'client.html');
let content = fs.readFileSync(clientFile, 'utf8');

// Add Google Fonts
if (!content.includes('fonts.googleapis.com')) {
  content = content.replace(
    '<title>Cursor Remote</title>',
    `<title>Cursor Remote</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet">`
  );
}

// Update color palette
content = content.replace(
  /:root \{[\s\S]*?--safe-bottom:[^;]+;/m,
  `:root {
  --bg: #131313;
  --surface: #1c1b1b;
  --surface-elevated: #2a2a2a;
  --surface-highest: #353534;
  --border: rgba(255,255,255,0.15);
  --text: #e5e2e1;
  --text-secondary: #bec7d4;
  --text-tertiary: #88919d;
  --accent: #98cbff;
  --accent-pressed: #00a3ff;
  --human: #2a2a2a;
  --assistant: #1c1b1b;
  --red: #ffb4ab;
  --yellow: #ffd60a;
  --green: #61de8a;
  --safe-top: env(safe-area-inset-top, 47px);
  --safe-bottom: env(safe-area-inset-bottom, 34px);`
);

// Update font-family
content = content.replace(
  /font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;/g,
  `font-family: 'Inter', -apple-system, sans-serif;`
);

// Update Header
content = content.replace(
  /padding-top: max\(var\(--safe-top\), 12px\);\s*background: rgba\(28, 28, 30, 0\.85\);\s*backdrop-filter: blur\(20px\);\s*-webkit-backdrop-filter: blur\(20px\);\s*border-bottom: 0\.5px solid rgba\(255,255,255,0\.1\);/m,
  `padding-top: max(var(--safe-top), 12px);
  background: rgba(19, 19, 19, 0.6);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-bottom: 1px solid var(--surface);
  box-shadow: 0 20px 40px rgba(0,0,0,0.4);`
);

// Update Messages
content = content.replace(
  /\.msg\.human \{[\s\S]*?\}/m,
  `.msg.human {
  align-self: flex-end;
  background: var(--human);
  color: var(--text);
  padding: 12px 16px;
  border-radius: 12px;
  border-top-right-radius: 2px;
  border: 1px solid var(--border);
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}`
);

content = content.replace(
  /\.msg\.assistant \{[\s\S]*?\}/m,
  `.msg.assistant {
  align-self: flex-start;
  background: var(--surface);
  color: var(--text);
  padding: 12px 16px;
  border-radius: 12px;
  border-top-left-radius: 2px;
  border: 1px solid var(--border);
}`
);

// Composer area
content = content.replace(
  /#composer-area \{[\s\S]*?\}/m,
  `#composer-area {
  flex-shrink: 0;
  background: transparent;
  padding: 10px 16px max(calc(var(--safe-bottom) + 8px), 16px);
  z-index: 20;
}`
);

content = content.replace(
  /\.composer-inner \{[\s\S]*?\}/m,
  `.composer-inner {
  display: flex;
  align-items: flex-end;
  background: rgba(53, 53, 52, 0.8);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 6px;
  gap: 4px;
  transition: border-color 0.2s;
  box-shadow: 0 -10px 30px rgba(0,0,0,0.5);
}`
);

content = content.replace(
  /#send-btn \{[\s\S]*?\}/m,
  `#send-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(to bottom, var(--accent), var(--accent-pressed));
  color: #00375a;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 3px;
  margin-right: 3px;
  font-weight: bold;
  font-size: 18px;
  flex-shrink: 0;
  border-top: 1px solid rgba(255,255,255,0.2);
  box-shadow: 0 4px 6px rgba(0,0,0,0.2);
}`
);

content = content.replace(
  /#stop-btn \{[\s\S]*?\}/m,
  `#stop-btn {
  display: none;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--red);
  color: #690005;
  align-items: center;
  justify-content: center;
  margin-bottom: 3px;
  margin-right: 3px;
  font-size: 14px;
  flex-shrink: 0;
  border-top: 1px solid rgba(255,255,255,0.2);
  box-shadow: 0 4px 6px rgba(0,0,0,0.2);
}`
);

// Menu item active state
content = content.replace(
  /\.panel-list li\.active \{ color: var\(--accent\); \}/,
  `.panel-list li.active { color: var(--accent); background: var(--surface-elevated); }`
);

// Actions bar
content = content.replace(
  /#actions-bar \{[\s\S]*?\}/m,
  `#actions-bar { padding: 12px 16px; background: transparent; display: none; }`
);

fs.writeFileSync(clientFile, content);
console.log('Stitch UI styles applied.');
