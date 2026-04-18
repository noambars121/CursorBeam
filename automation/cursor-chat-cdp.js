/**
 * Cursor Chat Automation via Chrome DevTools Protocol (CDP)
 * 
 * This script connects to Cursor's Electron process and automates
 * the chat interface directly - NO API needed!
 */

const CDP = require('chrome-remote-interface');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Configuration
const CURSOR_DEBUG_PORT = 9222; // Default Chrome/Electron debug port

/**
 * Find Cursor process and get debug port
 */
async function findCursorDebugPort() {
  try {
    // Check if Cursor is running with remote debugging
    const { stdout } = await execAsync('netstat -ano | findstr :9222');
    if (stdout.includes('LISTENING')) {
      console.log('✅ Found Cursor on debug port 9222');
      return 9222;
    }
  } catch (e) {
    // Port not found
  }

  // Try other common ports
  for (let port = 9222; port <= 9230; port++) {
    try {
      await CDP.Version({ port });
      console.log(`✅ Found Cursor on debug port ${port}`);
      return port;
    } catch (e) {
      // Continue searching
    }
  }

  throw new Error('❌ Cursor not found with remote debugging enabled!\n\n' +
    'To enable debugging:\n' +
    '1. Close Cursor\n' +
    '2. Start with: cursor.exe --remote-debugging-port=9222\n' +
    '3. Or add to shortcut target: "...\\Cursor.exe" --remote-debugging-port=9222');
}

/**
 * Send message to Cursor Chat
 */
async function sendToCursorChat(message) {
  console.log(`\n🔍 Connecting to Cursor...`);
  
  const port = await findCursorDebugPort();
  
  // List all tabs/targets
  const targets = await CDP.List({ port });
  console.log(`📋 Found ${targets.length} targets`);

  // Find the main Cursor window
  const mainTarget = targets.find(t => 
    t.type === 'page' && 
    (t.title.includes('Cursor') || t.url.includes('vscode-file'))
  );

  if (!mainTarget) {
    throw new Error('❌ Could not find Cursor main window');
  }

  console.log(`✅ Found Cursor window: "${mainTarget.title}"`);

  // Connect to the target
  const client = await CDP({ port, target: mainTarget.id });
  const { Runtime, DOM, Input } = client;

  try {
    await Runtime.enable();
    await DOM.enable();

    console.log(`\n💬 Sending message to chat...`);

    // Strategy 1: Use executeCommand if available
    const tryCommand = await Runtime.evaluate({
      expression: `
        (async () => {
          try {
            // Try VS Code command API
            if (typeof acquireVsCodeApi !== 'undefined') {
              const vscode = acquireVsCodeApi();
              vscode.postMessage({ command: 'chat', text: ${JSON.stringify(message)} });
              return { success: true, method: 'vscode-api' };
            }
            return { success: false };
          } catch (e) {
            return { success: false, error: e.message };
          }
        })()
      `,
      awaitPromise: true
    });

    const result = tryCommand.result.value;
    if (result?.success) {
      console.log(`✅ Message sent via ${result.method}!`);
      await client.close();
      return { success: true, method: result.method };
    }

    // Strategy 2: Find chat input and type directly
    console.log(`🔍 Looking for chat input element...`);
    
    const findInput = await Runtime.evaluate({
      expression: `
        (function() {
          // Try multiple selectors for chat input
          const selectors = [
            'textarea[placeholder*="message"]',
            'textarea[placeholder*="Message"]',
            'textarea[placeholder*="chat"]',
            'textarea[placeholder*="Chat"]',
            'textarea[aria-label*="chat"]',
            'textarea[aria-label*="Chat"]',
            '.chat-input textarea',
            '[class*="chatInput"] textarea',
            '[class*="ChatInput"] textarea'
          ];

          for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
              return {
                found: true,
                selector: selector,
                placeholder: el.placeholder || '',
                tagName: el.tagName
              };
            }
          }

          return { found: false };
        })()
      `
    });

    const inputInfo = findInput.result.value;

    if (inputInfo.found) {
      console.log(`✅ Found input: ${inputInfo.selector}`);
      
      // Focus and type into the element
      await Runtime.evaluate({
        expression: `
          (function() {
            const input = document.querySelector('${inputInfo.selector}');
            if (input) {
              input.focus();
              input.value = ${JSON.stringify(message)};
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              
              // Try to trigger submission
              setTimeout(() => {
                const form = input.closest('form');
                if (form) {
                  form.requestSubmit();
                } else {
                  // Simulate Enter key
                  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13 }));
                }
              }, 100);
              
              return true;
            }
            return false;
          })()
        `
      });

      console.log(`✅ Message sent via DOM manipulation!`);
      await client.close();
      return { success: true, method: 'dom-injection' };
    }

    // Strategy 3: Keyboard automation (Ctrl+L, type, Enter)
    console.log(`\n⌨️  Using keyboard automation...`);
    
    // Open chat with Ctrl+L
    await Input.dispatchKeyEvent({ type: 'keyDown', modifiers: 2, key: 'l', code: 'KeyL', windowsVirtualKeyCode: 76 });
    await Input.dispatchKeyEvent({ type: 'keyUp', modifiers: 2, key: 'l', code: 'KeyL', windowsVirtualKeyCode: 76 });
    
    await new Promise(resolve => setTimeout(resolve, 300));

    // Type the message
    for (const char of message) {
      await Input.dispatchKeyEvent({ type: 'char', text: char });
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    // Press Enter
    await Input.dispatchKeyEvent({ type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await Input.dispatchKeyEvent({ type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });

    console.log(`✅ Message sent via keyboard automation!`);
    await client.close();
    return { success: true, method: 'keyboard' };

  } catch (error) {
    await client.close();
    throw error;
  }
}

/**
 * Read chat transcript
 */
async function readCursorChat() {
  console.log(`\n🔍 Reading chat transcript...`);
  
  const port = await findCursorDebugPort();
  const targets = await CDP.List({ port });
  const mainTarget = targets.find(t => t.type === 'page' && t.title.includes('Cursor'));

  if (!mainTarget) {
    throw new Error('❌ Could not find Cursor main window');
  }

  const client = await CDP({ port, target: mainTarget.id });
  const { Runtime } = client;

  try {
    await Runtime.enable();

    const result = await Runtime.evaluate({
      expression: `
        (function() {
          const messages = [];
          
          // Try to find chat messages
          const selectors = [
            '.chat-message',
            '[class*="chatMessage"]',
            '[class*="ChatMessage"]',
            '[role="article"]',
            '[data-message]'
          ];

          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              elements.forEach(el => {
                messages.push({
                  text: el.textContent.trim(),
                  html: el.innerHTML
                });
              });
              break;
            }
          }

          return messages;
        })()
      `
    });

    await client.close();
    return result.result.value || [];

  } catch (error) {
    await client.close();
    throw error;
  }
}

module.exports = {
  sendToCursorChat,
  readCursorChat,
  findCursorDebugPort
};

// CLI usage
if (require.main === module) {
  const message = process.argv[2] || 'Hello from automation!';
  
  sendToCursorChat(message)
    .then(result => {
      console.log(`\n🎉 Success!`, result);
      process.exit(0);
    })
    .catch(error => {
      console.error(`\n❌ Error:`, error.message);
      process.exit(1);
    });
}

