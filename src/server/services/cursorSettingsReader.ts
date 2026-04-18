/**
 * Read API keys from Cursor IDE settings
 * This allows using Cursor's configured API keys without needing separate keys
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { logger } from './logger.js';

interface CursorSettings {
  // Anthropic (Claude)
  'superdesign.anthropicApiKey'?: string;
  'cursor.anthropicApiKey'?: string;
  
  // OpenAI
  'cursor.openaiApiKey'?: string;
  'superdesign.openaiApiKey'?: string;
  
  // Gemini
  'cursor.googleApiKey'?: string;
  
  // Models
  'cursor.aiModel'?: string;
  'superdesign.aiModel'?: string;
}

export interface APIKeys {
  anthropic?: string;
  openai?: string;
  google?: string;
  defaultModel?: string;
}

/**
 * Get Cursor settings file path
 */
function getCursorSettingsPath(): string {
  const homeDir = os.homedir();
  const platform = os.platform();
  
  if (platform === 'win32') {
    return path.join(homeDir, 'AppData', 'Roaming', 'Cursor', 'User', 'settings.json');
  } else if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'Cursor', 'User', 'settings.json');
  } else {
    return path.join(homeDir, '.config', 'Cursor', 'User', 'settings.json');
  }
}

/**
 * Read API keys from Cursor settings
 */
export async function readCursorAPIKeys(): Promise<APIKeys> {
  try {
    const settingsPath = getCursorSettingsPath();
    
    logger.info({ settingsPath }, 'Reading Cursor settings for API keys');
    
    const content = await fs.readFile(settingsPath, 'utf-8');
    const settings: CursorSettings = JSON.parse(content);
    
    const keys: APIKeys = {
      anthropic: settings['superdesign.anthropicApiKey'] || settings['cursor.anthropicApiKey'],
      openai: settings['cursor.openaiApiKey'] || settings['superdesign.openaiApiKey'],
      google: settings['cursor.googleApiKey'],
      defaultModel: settings['superdesign.aiModel'] || settings['cursor.aiModel'],
    };
    
    // Log what we found (without exposing full keys)
    logger.info({
      hasAnthropic: !!keys.anthropic,
      hasOpenAI: !!keys.openai,
      hasGoogle: !!keys.google,
      defaultModel: keys.defaultModel,
    }, 'Cursor API keys loaded');
    
    return keys;
  } catch (error) {
    logger.warn({ error }, 'Could not read Cursor settings - using fallback');
    return {};
  }
}

/**
 * Get the best available API key
 */
export async function getBestAPIKey(): Promise<{ provider: 'anthropic' | 'openai' | 'google' | null; key: string | null }> {
  const keys = await readCursorAPIKeys();
  
  // Priority: Anthropic > OpenAI > Google
  if (keys.anthropic) {
    return { provider: 'anthropic', key: keys.anthropic };
  }
  if (keys.openai) {
    return { provider: 'openai', key: keys.openai };
  }
  if (keys.google) {
    return { provider: 'google', key: keys.google };
  }
  
  return { provider: null, key: null };
}

