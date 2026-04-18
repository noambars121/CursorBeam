import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from './logger.js';
import { config } from '../env.js';

export interface AgentResult {
  exitCode: number;
  duration: number;
  output: string;
}

export interface RunAgentOptions {
  mode: 'chat' | 'plan';
  prompt: string;
  cwd: string;
  system?: string;
  timeoutSec?: number;
  onChunk?: (chunk: { type: 'stdout' | 'stderr'; data: string }) => void;
  conversationHistory?: Array<{ role: string; content: string }>;
}

let cachedCursorCmd: string | null = null;
let cacheChecked = false;

/**
 * Ensure Cursor CLI is available, cache the working command
 */
export async function ensureCursorCmd(cursorCmd: string = config.CURSOR_CMD): Promise<string> {
  if (cacheChecked && cachedCursorCmd) {
    return cachedCursorCmd;
  }
  
  const commandsToTry = [cursorCmd, 'cursor', 'cursor-cli'];
  
  for (const cmd of commandsToTry) {
    try {
      await execCommand(cmd, ['--version'], process.cwd(), 5000);
      logger.info({ command: cmd }, 'Cursor CLI found');
      cachedCursorCmd = cmd;
      cacheChecked = true;
      return cmd;
    } catch (error) {
      logger.debug({ command: cmd }, 'Cursor CLI not found with this command');
    }
  }
  
  cacheChecked = true;
  throw new Error(
    'Cursor CLI not found. Please install Cursor CLI and ensure it\'s in PATH. ' +
    'Tried commands: ' + commandsToTry.join(', ') + '. ' +
    'Update CURSOR_CMD in .env if using a different command name.'
  );
}

/**
 * Execute a command and return output
 */
async function execCommand(
  command: string,
  args: string[],
  cwd: string,
  timeout: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { cwd, shell: true });
    let output = '';
    
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      output += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
    
    proc.on('error', reject);
    
    setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Command timeout'));
    }, timeout);
  });
}

/**
 * Check if MCP config exists in project
 */
async function checkMCPConfig(cwd: string): Promise<string | null> {
  const mcpPath = path.join(cwd, 'mcp.json');
  try {
    await fs.access(mcpPath);
    logger.info({ mcpPath }, 'MCP config found');
    return mcpPath;
  } catch {
    return null;
  }
}

import { getBestAPIKey } from './cursorSettingsReader.js';
import { chatWithClaude, chatWithGPT, chatWithGemini, ChatMessage } from './aiProviders.js';
import { gatherProjectContext, buildEnhancedSystemPrompt } from './projectContext.js';

/**
 * Send chat request to Cursor extension (Direct Bridge)
 */
async function chatWithCursorExtension(
  prompt: string,
  onChunk?: (chunk: { type: 'stdout' | 'stderr'; data: string }) => void
): Promise<string> {
  const { DIRECT_CURSOR_HOST, DIRECT_CURSOR_PORT, DIRECT_CURSOR_API_KEY } = config;
  const url = `http://${DIRECT_CURSOR_HOST}:${DIRECT_CURSOR_PORT}/chat`;
  
  logger.info({ url, host: DIRECT_CURSOR_HOST, port: DIRECT_CURSOR_PORT }, 'Connecting to Cursor extension bridge');
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': DIRECT_CURSOR_API_KEY,
      },
      body: JSON.stringify({ prompt }),
    });
    
    if (!response.ok) {
      throw new Error(`Extension bridge returned ${response.status}: ${response.statusText}`);
    }
    
    if (!response.body) {
      throw new Error('No response body from extension bridge');
    }
    
    let fullOutput = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === 'stdout' || data.type === 'stderr') {
              fullOutput += data.data;
              if (onChunk) {
                onChunk({ type: data.type, data: data.data });
              }
            } else if (data.type === 'error') {
              throw new Error(data.message || 'Extension error');
            }
          } catch (parseError) {
            // Ignore parse errors for non-JSON lines
          }
        }
      }
    }
    
    return fullOutput || '✅ Request sent to Cursor extension';
  } catch (error: any) {
    const errorCode = error.code || error.cause?.code || 'UNKNOWN';
    logger.error({ 
      error: error.message, 
      code: errorCode,
      host: DIRECT_CURSOR_HOST,
      port: DIRECT_CURSOR_PORT 
    }, 'Failed to connect to Cursor extension');
    
    // Specific error messages based on error type
    let detailedMessage = '';
    if (errorCode === 'ECONNREFUSED') {
      detailedMessage = `\n🔴 **החיבור נדחה** - שום דבר לא מאזין בפורט ${DIRECT_CURSOR_PORT}\n\n`;
      detailedMessage += `זה אומר שההרחבה **לא רצה**!\n\n`;
      detailedMessage += `📍 **מה לעשות:**\n`;
      detailedMessage += `1. פתח Cursor IDE\n`;
      detailedMessage += `2. Ctrl+Shift+P → הקלד: "Cursor Mobile: Start Bridge Server"\n`;
      detailedMessage += `3. וודא שאתה רואה: "✅ Cursor Mobile Bridge listening on port 8766"\n`;
      detailedMessage += `4. נסה שוב מהמובייל\n`;
    } else if (errorCode === 'ETIMEDOUT' || errorCode === 'ECONNABORTED') {
      detailedMessage = `\n⏱️ **החיבור פג** - ההרחבה לא עונה\n\n`;
      detailedMessage += `אולי ההרחבה תקועה או Cursor לא רץ.\n\n`;
    } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      detailedMessage = `\n🔑 **שגיאת אימות** - API key לא תואם\n\n`;
      detailedMessage += `**בהרחבה (Cursor):** Settings → "Cursor Mobile" → "Api Key"\n`;
      detailedMessage += `**בשרת (.env):** DIRECT_CURSOR_API_KEY\n`;
      detailedMessage += `\nוודא ששניהם זהים! (ברירת מחדל: "changeme")\n`;
    }
    
    throw new Error(
      `❌ לא ניתן להתחבר להרחבת Cursor (${DIRECT_CURSOR_HOST}:${DIRECT_CURSOR_PORT})\n\n` +
      `שגיאה: ${error.message}\n` +
      `קוד: ${errorCode}\n` +
      detailedMessage +
      `\n📋 **בדיקות נוספות:**\n` +
      `1. ההרחבה מותקנת? Ctrl+Shift+P → "Extensions: Show Installed"\n` +
      `2. ההרחבה רצה? View → Output → בחר "Cursor Mobile Bridge"\n` +
      `3. הפורט ${DIRECT_CURSOR_PORT} נכון? בדוק בהגדרות ההרחבה\n` +
      `4. בדוק מהטרמינל: curl -X POST http://127.0.0.1:${DIRECT_CURSOR_PORT}/status -H "x-api-key: ${DIRECT_CURSOR_API_KEY}"\n`
    );
  }
}

/**
 * Get AI response using Cursor's API keys with project context
 */
async function getAIResponse(
  prompt: string,
  cwd: string,
  systemPrompt?: string,
  conversationHistory?: Array<{ role: string; content: string }>,
  onChunk?: (text: string) => void
): Promise<string> {
  try {
    // Try to get API key from Cursor settings
    const { provider, key } = await getBestAPIKey();
    
    if (!provider || !key) {
      logger.warn('No API keys found in Cursor settings, using demo mode');
      return getDemoResponse(prompt);
    }
    
    // Gather project context (like Cursor IDE does)
    const context = await gatherProjectContext(cwd);
    
    // Build enhanced system prompt with project awareness
    const enhancedSystemPrompt = buildEnhancedSystemPrompt(context, systemPrompt);
    
    // Build messages array
    const messages: ChatMessage[] = [];
    
    messages.push({ role: 'system', content: enhancedSystemPrompt });
    
    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistory.forEach(msg => {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      });
    }
    
    // Add current prompt
    messages.push({ role: 'user', content: prompt });
    
    logger.info({ 
      provider, 
      messageCount: messages.length, 
      projectName: context.projectName,
      hasContext: true 
    }, 'Using Cursor AI provider with project context');
    
    // Call appropriate API
    if (provider === 'anthropic') {
      return await chatWithClaude(key, { messages, onChunk });
    } else if (provider === 'openai') {
      return await chatWithGPT(key, { messages, onChunk });
    } else if (provider === 'google') {
      return await chatWithGemini(key, { messages, onChunk });
    }
    
    return getDemoResponse(prompt);
  } catch (error) {
    logger.error({ error }, 'AI API error, falling back to demo');
    return getDemoResponse(prompt);
  }
}

/**
 * Demo response when no API available
 */
function getDemoResponse(prompt: string): string {
  return `🤖 **מתחבר לCursor AI...**\n\n📝 קיבלתי: "${prompt}"\n\n⚠️ **לא נמצא API key ב-Cursor!**\n\nכדי להשתמש ב-AI אמיתי:\n\n1. **פתח Cursor IDE**\n2. **הגדרות** → חפש "API Key"\n3. **הוסף API key** (Anthropic/OpenAI/Google)\n4. **רענן** את האפליקציה\n\n💡 **או השתמש ב:**\n✅ טאב **קבצים** - עריכה ישירה\n✅ טאב **פרויקטים** - הפעלת servers\n✅ טאב **הגדרות** - בדיקת מצב\n\n🎯 המערכת תזהה אוטומטית את ה-API keys של Cursor!`;
}

/**
 * Run Cursor Agent with a prompt
 * Supports both real Cursor CLI and mock responses
 */
export async function runAgent(options: RunAgentOptions): Promise<AgentResult> {
  const {
    mode,
    prompt,
    cwd,
    system,
    timeoutSec = config.MAX_RUN_SECONDS,
    onChunk,
  } = options;
  
  const startTime = Date.now();
  let output = '';
  
  logger.info({ 
    mode, 
    cwd, 
    promptPreview: prompt.substring(0, 50),
    directCursor: config.DIRECT_CURSOR,
  }, 'Running AI Agent');
  
  // Use Direct Cursor connection if enabled
  if (config.DIRECT_CURSOR) {
    try {
      logger.info('Using Direct Cursor connection via extension');
      
      // Build enhanced prompt with system message if provided
      let fullPrompt = prompt;
      if (system) {
        fullPrompt = `${system}\n\n---\n\n${prompt}`;
      }
      
      const aiOutput = await chatWithCursorExtension(fullPrompt, onChunk);
      const duration = Math.floor((Date.now() - startTime) / 1000);
      
      return {
        exitCode: 0,
        duration,
        output: aiOutput,
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Direct Cursor connection failed, falling back to CLI');
      
      // If Direct Cursor fails, fall through to CLI mode
      if (onChunk) {
        onChunk({ 
          type: 'stderr', 
          data: `⚠️ חיבור ישיר נכשל, עובר למצב CLI...\n\n${error.message}\n\n` 
        });
      }
    }
  }
  
  try {
    // Try to use real Cursor CLI first
    const cursorCmd = await ensureCursorCmd();
    
    // Check for MCP config
    const mcpPath = await checkMCPConfig(cwd);
    
    // Prepare environment
    const env = { ...process.env };
    if (mcpPath) {
      env.MCP_CONFIG = mcpPath;
    }
    
    // Build command arguments
    const args: string[] = [];
    
    if (mode === 'plan') {
      args.push('plan', '--goal', prompt);
    } else {
      args.push('chat', '--prompt', prompt);
    }
    
    if (system) {
      args.push('--system', system);
    }
    
    logger.info({ command: cursorCmd, args }, 'Attempting Cursor CLI');
    
    return new Promise((resolve, reject) => {
      // Use shell: false and proper encoding to handle Hebrew text
      const proc: ChildProcess = spawn(cursorCmd, args, {
        cwd,
        env: { ...env, PYTHONIOENCODING: 'utf-8', LANG: 'en_US.UTF-8' },
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      
      let killed = false;
      
      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        logger.warn({ timeoutSec }, 'Agent timeout, killing process');
        killed = true;
        proc.kill('SIGTERM');
        
        setTimeout(() => {
          if (proc.exitCode === null) {
            proc.kill('SIGKILL');
          }
        }, 5000);
      }, timeoutSec * 1000);
      
      // Handle stdout
      proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        output += text;
        
        if (onChunk) {
          onChunk({ type: 'stdout', data: text });
        }
      });
      
      // Handle stderr
      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        output += text;
        
        if (onChunk) {
          onChunk({ type: 'stderr', data: text });
        }
      });
      
      // Handle errors
      proc.on('error', (error: any) => {
        clearTimeout(timeoutHandle);
        logger.error({ error }, 'Agent process error');
        
        // If command not found, reject so we can fall back to API
        if (error.code === 'ENOENT') {
          reject(new Error(`Cursor CLI command not found: ${cursorCmd}`));
        } else {
          reject(new Error(`Agent process error: ${error.message}`));
        }
      });
      
      // Handle completion
      proc.on('close', (code) => {
        clearTimeout(timeoutHandle);
        const duration = Math.floor((Date.now() - startTime) / 1000);
        
        logger.info({ code, duration, killed, outputLength: output.length }, 'Agent process completed');
        
        // Add helpful message if no output
        let finalOutput = output;
        if (code === 0 && output.trim().length === 0) {
          finalOutput = '⚠️ Cursor CLI לא החזיר output.\n\nאפשרויות:\n1. Cursor CLI לא מותקן - התקן את Cursor IDE\n2. הפקודה cursor לא זמינה ב-PATH\n3. Cursor CLI לא תומך בפקודת chat\n\nהשתמש בטאב הקבצים לעדכן קוד ידנית, או התקן את Cursor CLI מחדש.';
        }
        
        resolve({
          exitCode: code || (killed ? -1 : 0),
          duration,
          output: finalOutput,
        });
      });
    });
  } catch (error) {
    // If Cursor CLI fails, fall back to external API (if enabled)
    logger.warn({ error }, 'Cursor CLI not available');
    
    // Check if external API is disabled
    if (config.DISABLE_EXTERNAL_API) {
      const duration = Math.floor((Date.now() - startTime) / 1000);
      const errorMessage = `❌ **Cursor CLI לא זמין ו-API חיצוני מושבת**\n\n` +
        `כדי להשתמש בצ'אט, וודא שאחד מהבאים פועל:\n\n` +
        `1. **Direct Cursor** - הפעל את ההרחבה: Ctrl+Shift+P → "Cursor Mobile: Start Bridge Server"\n` +
        `2. **Remote Chat (UIA)** - הפעל את CursorChatHost.exe\n` +
        `3. **Cursor CLI** - התקן את Cursor CLI והוסף ל-PATH\n\n` +
        `💡 הגדרת DISABLE_EXTERNAL_API=false ב-.env תאפשר fallback ל-Claude/GPT.`;
      
      if (onChunk) {
        onChunk({ type: 'stderr', data: errorMessage });
      }
      
      return {
        exitCode: 1,
        duration,
        output: errorMessage,
      };
    }
    
    // External API fallback (when enabled)
    logger.info('Using external API fallback (Claude/GPT/Gemini)');
    
    const duration = Math.floor((Date.now() - startTime) / 1000);
    
    // Stream callback for AI response
    const streamCallback = onChunk ? (text: string) => {
      onChunk({ type: 'stdout', data: text });
    } : undefined;
    
    // Get AI response using Cursor's API keys + project context
    const aiOutput = await getAIResponse(
      prompt,
      cwd,
      system,
      options.conversationHistory,
      streamCallback
    );
    
    return {
      exitCode: 0,
      duration,
      output: aiOutput,
    };
  }
}

