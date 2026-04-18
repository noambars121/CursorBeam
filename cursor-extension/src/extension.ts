import * as vscode from 'vscode';
import * as http from 'http';
import * as url from 'url';

let server: http.Server | null = null;
let outputChannel: vscode.OutputChannel;

/**
 * Activate extension
 */
export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Cursor Mobile Bridge');
  outputChannel.appendLine('🚀 Cursor Mobile Bridge activated');

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('cursor-mobile.start', () => startServer())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursor-mobile.stop', () => stopServer())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursor-mobile.status', () => showStatus())
  );

  // Auto-start if configured
  const config = vscode.workspace.getConfiguration('cursorMobile');
  if (config.get('autoStart', true)) {
    startServer();
  }
}

/**
 * Deactivate extension
 */
export function deactivate() {
  stopServer();
}

/**
 * Start HTTP server
 */
function startServer() {
  if (server) {
    vscode.window.showInformationMessage('Bridge server is already running');
    return;
  }

  const config = vscode.workspace.getConfiguration('cursorMobile');
  const port = config.get('port', 8766);
  const apiKey = config.get('apiKey', 'changeme');

  server = http.createServer(async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Check API key
    const reqApiKey = req.headers['x-api-key'];
    if (reqApiKey !== apiKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const parsedUrl = url.parse(req.url || '', true);

    try {
      // Status endpoint
      if (parsedUrl.pathname === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          bridge: 'cursor-extension',
          version: '1.0.0',
          workspace: vscode.workspace.name || 'No workspace',
          workspaceFolders: vscode.workspace.workspaceFolders?.length || 0,
        }));
        return;
      }

      // Chat endpoint (SSE)
      if (parsedUrl.pathname === '/chat' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            const prompt = data.prompt;

            if (!prompt) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing prompt' }));
              return;
            }

            // Set up SSE
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            });

            // Send start event
            sendSSE(res, 'start', {
              type: 'start',
              workspace: vscode.workspace.name,
              startedAt: new Date().toISOString(),
            });

            // Execute AI command
            await executeAICommand(prompt, res);

            // Send end event
            sendSSE(res, 'end', {
              type: 'end',
              endedAt: new Date().toISOString(),
            });

            res.end();
          } catch (error: any) {
            outputChannel.appendLine(`❌ Error: ${error.message}`);
            sendSSE(res, 'error', {
              type: 'error',
              message: error.message,
            });
            res.end();
          }
        });
        return;
      }

      // Workspace info endpoint
      if (parsedUrl.pathname === '/workspace') {
        const workspaceInfo = await getWorkspaceInfo();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(workspaceInfo));
        return;
      }

      // Open folder endpoint - switch project in Cursor
      if (parsedUrl.pathname === '/open-folder' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            const folderPath = data.path;

            if (!folderPath) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing path' }));
              return;
            }

            outputChannel.appendLine(`📂 Opening folder: ${folderPath}`);

            // Open the folder in current window
            const folderUri = vscode.Uri.file(folderPath);
            await vscode.commands.executeCommand('vscode.openFolder', folderUri, { forceNewWindow: false });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              ok: true, 
              message: `Opened: ${folderPath}`,
              path: folderPath
            }));
          } catch (error: any) {
            outputChannel.appendLine(`❌ Open folder error: ${error.message}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
          }
        });
        return;
      }

      // 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (error: any) {
      outputChannel.appendLine(`❌ Server error: ${error.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });

  server.listen(port, '0.0.0.0', () => {
    const message = `✅ Cursor Mobile Bridge listening on port ${port}`;
    outputChannel.appendLine(message);
    vscode.window.showInformationMessage(message);
  });

  server.on('error', (error: any) => {
    outputChannel.appendLine(`❌ Server error: ${error.message}`);
    vscode.window.showErrorMessage(`Bridge server error: ${error.message}`);
    server = null;
  });
}

/**
 * Stop HTTP server
 */
function stopServer() {
  if (server) {
    server.close();
    server = null;
    outputChannel.appendLine('🛑 Bridge server stopped');
    vscode.window.showInformationMessage('Bridge server stopped');
  } else {
    vscode.window.showInformationMessage('Bridge server is not running');
  }
}

/**
 * Show server status
 */
function showStatus() {
  const config = vscode.workspace.getConfiguration('cursorMobile');
  const port = config.get('port', 8766);
  const running = server !== null;

  const status = `
Cursor Mobile Bridge Status:
- Running: ${running ? '✅ Yes' : '❌ No'}
- Port: ${port}
- Workspace: ${vscode.workspace.name || 'No workspace'}
- Folders: ${vscode.workspace.workspaceFolders?.length || 0}

${running ? `Connect from mobile: http://<your-pc-ip>:${port}` : 'Use "Start Bridge Server" command to start'}
  `.trim();

  vscode.window.showInformationMessage(status, { modal: true });
}

/**
 * Send SSE event
 */
function sendSSE(res: http.ServerResponse, event: string, data: any) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Execute AI command using Cursor's chat
 */
async function executeAICommand(prompt: string, res: http.ServerResponse) {
  try {
    // Copy to clipboard first
    await vscode.env.clipboard.writeText(prompt);
    
    // Try different Cursor commands
    const commands = [
      'workbench.action.chat.open',
      'workbench.action.chat.openEditSession', 
      'aichat.newchat',
      'aichat.new',
      'cursor.aiChat',
      'cursor.chat',
      'cursor.openChat',
    ];

    let executed = false;
    let executedCommand = '';

    const allCommands = await vscode.commands.getCommands();
    outputChannel.appendLine(`📋 Available commands count: ${allCommands.length}`);
    
    const cursorCommands = allCommands.filter(cmd => 
      cmd.includes('cursor') || cmd.includes('chat') || cmd.includes('ai')
    );
    outputChannel.appendLine(`🔍 Cursor/AI commands found: ${cursorCommands.slice(0, 10).join(', ')}`);

    for (const cmd of commands) {
      try {
        if (allCommands.includes(cmd)) {
          outputChannel.appendLine(`🎯 Trying command: ${cmd}`);
          await vscode.commands.executeCommand(cmd);
          executed = true;
          executedCommand = cmd;
          await new Promise(resolve => setTimeout(resolve, 500));
          break;
        }
      } catch (error) {
        outputChannel.appendLine(`❌ Command ${cmd} failed: ${error}`);
      }
    }

    const promptPreview = prompt.substring(0, 100) + (prompt.length > 100 ? '...' : '');

    if (!executed) {
      outputChannel.appendLine('⚠️ No direct chat command found, using clipboard fallback');
      
      sendSSE(res, 'chunk', {
        type: 'stdout',
        data: '🔌 **Direct Cursor Bridge**\n\n',
      });

      sendSSE(res, 'chunk', {
        type: 'stdout',
        data: '📋 **Prompt copied to Clipboard!**\n\n',
      });

      sendSSE(res, 'chunk', {
        type: 'stdout',
        data: 'Your prompt:\n"' + promptPreview + '"\n\n',
      });

      sendSSE(res, 'chunk', {
        type: 'stdout',
        data: '📍 **Next Steps (Manual):**\n\n',
      });

      sendSSE(res, 'chunk', {
        type: 'stdout',
        data: '1️⃣ Go to Cursor on your PC\n',
      });

      sendSSE(res, 'chunk', {
        type: 'stdout',
        data: '2️⃣ Open Chat: **Ctrl+L** (or Cmd+L on Mac)\n',
      });

      sendSSE(res, 'chunk', {
        type: 'stdout',
        data: '3️⃣ Paste: **Ctrl+V**\n',
      });

      sendSSE(res, 'chunk', {
        type: 'stdout',
        data: '4️⃣ Press **Enter**\n\n',
      });

      sendSSE(res, 'chunk', {
        type: 'stdout',
        data: '⚠️ **Why manual?** Cursor does not expose an API for automatic chat execution.\n\n',
      });

      sendSSE(res, 'chunk', {
        type: 'stdout',
        data: '💡 **Want automatic?** Set DIRECT_CURSOR=false in .env to use Claude API directly!\n',
      });
    } else {
      sendSSE(res, 'chunk', {
        type: 'stdout',
        data: '🔌 **Direct Cursor Bridge**\n\n',
      });
      
      sendSSE(res, 'chunk', {
        type: 'stdout',
        data: '✅ **Chat command executed!**\n\n',
      });

      sendSSE(res, 'chunk', {
        type: 'stdout',
        data: '🎯 Executed: ' + executedCommand + '\n\n',
      });
      
      sendSSE(res, 'chunk', {
        type: 'stdout',
        data: '📋 **Prompt copied to Clipboard**\n\n',
      });

      sendSSE(res, 'chunk', {
        type: 'stdout',
        data: 'Your prompt:\n"' + promptPreview + '"\n\n',
      });

      sendSSE(res, 'chunk', {
        type: 'stdout',
        data: '💡 **Go to Cursor** and paste the prompt in chat (Ctrl+L, Ctrl+V, Enter)\n',
      });
    }
  } catch (error: any) {
    outputChannel.appendLine(`❌ AI command error: ${error.message}`);
    sendSSE(res, 'chunk', {
      type: 'stderr',
      data: `Error: ${error.message}\n`,
    });
  }
}

/**
 * Get workspace information
 */
async function getWorkspaceInfo() {
  const workspaceFolders = vscode.workspace.workspaceFolders || [];
  
  return {
    name: vscode.workspace.name,
    folders: workspaceFolders.map(folder => ({
      name: folder.name,
      path: folder.uri.fsPath,
    })),
    activeEditor: vscode.window.activeTextEditor ? {
      fileName: vscode.window.activeTextEditor.document.fileName,
      languageId: vscode.window.activeTextEditor.document.languageId,
    } : null,
  };
}
