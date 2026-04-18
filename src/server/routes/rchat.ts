/**
 * Remote Chat (UIA) Routes
 * Type to Cursor Chat from mobile device
 */

import { Router } from 'express';
import fetch from 'node-fetch';
import { config } from '../env.js';
import { logger } from '../services/logger.js';
import { pushUser, pushAssistant, getTranscript } from '../services/rchat.js';

const router = Router();

// Rate limiting state (simple in-memory)
const rateLimits = new Map<string, { count: number; resetTime: number }>();

/**
 * Sanitize input text
 */
function sanitizeText(text: string, maxLength: number): string {
  if (!text) return '';
  
  // Remove control characters (except newlines and tabs)
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Normalize newlines
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Trim to max length
  if (text.length > maxLength) {
    text = text.substring(0, maxLength);
  }
  
  return text.trim();
}

/**
 * Check rate limit
 */
function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const limit = config.RCHAT_RATE_LIMIT_PER_MIN;
  const windowMs = 60 * 1000; // 1 minute
  
  let record = rateLimits.get(ip);
  
  // Reset if window expired
  if (!record || record.resetTime < now) {
    record = {
      count: 0,
      resetTime: now + windowMs
    };
    rateLimits.set(ip, record);
  }
  
  record.count++;
  const remaining = Math.max(0, limit - record.count);
  const allowed = record.count <= limit;
  
  return { allowed, remaining };
}

/**
 * POST /api/rchat/type
 * Type text to Cursor Chat (via UIA Host or fallback to CLI)
 */
router.post('/type', async (req, res) => {
  const ip = req.ip || 'unknown';
  
  try {
    // Rate limit check
    const rateLimit = checkRateLimit(ip);
    if (!rateLimit.allowed) {
      logger.warn('[RCHAT] Rate limit exceeded', { ip });
      return res.status(429).json({
        ok: false,
        error: 'Rate limit exceeded',
        retryAfter: 60
      });
    }
    
    // Validate input
    const { text, image } = req.body;
    
    // Note: Images are logged but not yet supported by UIA Host
    // They would need to be saved to disk and referenced in the prompt
    if (image) {
      logger.info('[RCHAT] Image received (not yet supported by UIA)', {
        imageName: image.name,
        imageType: image.type
      });
    }
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Missing or invalid "text" field'
      });
    }
    
    // Sanitize
    const sanitized = sanitizeText(text, config.RCHAT_MAX_TEXT_LEN);
    if (!sanitized) {
      return res.status(400).json({
        ok: false,
        error: 'Text is empty after sanitization'
      });
    }
    
    logger.info('[RCHAT] Type request received', { 
      ip, 
      length: sanitized.length,
      mode: config.CHAT_TYPING_MODE
    });
    
    // Mode: pophide (UIA Host)
    // #region agent log
    const fs = await import('fs');
    fs.appendFileSync('c:\\Users\\Noam\\Music\\cursor mobile\\.cursor\\debug.log', JSON.stringify({location:'rchat.ts:type:modeCheck',message:'Checking mode',data:{mode:config.CHAT_TYPING_MODE,uiaHost:config.UIA_HOST},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})+'\n');
    // #endregion
    if (config.CHAT_TYPING_MODE === 'pophide') {
      try {
        // #region agent log
        fs.appendFileSync('c:\\Users\\Noam\\Music\\cursor mobile\\.cursor\\debug.log', JSON.stringify({location:'rchat.ts:type:beforeUIA',message:'About to call UIA Host',data:{url:`${config.UIA_HOST}/type`,text:sanitized.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})+'\n');
        // #endregion
        const uiaResponse = await fetch(`${config.UIA_HOST}/type`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ text: sanitized })
        });
        // #region agent log
        fs.appendFileSync('c:\\Users\\Noam\\Music\\cursor mobile\\.cursor\\debug.log', JSON.stringify({location:'rchat.ts:type:afterUIA',message:'UIA response received',data:{ok:uiaResponse.ok,status:uiaResponse.status},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})+'\n');
        // #endregion
        
        if (uiaResponse.ok) {
          const result = await uiaResponse.json() as any;
          
          // Add to transcript
          pushUser(sanitized);
          
          logger.info('[RCHAT] Message sent via UIA', { method: result.method });
          
          return res.json({
            ok: true,
            method: result.method,
            transcriptSize: getTranscript().length
          });
        } else {
          // UIA failed, fallback to CLI
          logger.warn('[RCHAT] UIA failed, falling back to CLI', {
            status: uiaResponse.status
          });
          // Fall through to CLI fallback below
        }
      } catch (error: any) {
        // #region agent log
        fs.appendFileSync('c:\\Users\\Noam\\Music\\cursor mobile\\.cursor\\debug.log', JSON.stringify({location:'rchat.ts:type:uiaError',message:'UIA call failed',data:{error:error.message},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})+'\n');
        // #endregion
        logger.error('[RCHAT] UIA error, falling back to CLI', {
          error: error.message
        });
        // Fall through to CLI fallback
      }
    }
    
    // Mode: cli OR fallback from pophide
    // In this case, we just add to transcript and return success
    // The existing /api/chat endpoint handles actual execution
    pushUser(sanitized);
    
    logger.info('[RCHAT] Message stored (CLI mode)', {
      transcriptSize: getTranscript().length
    });
    
    return res.json({
      ok: true,
      method: 'cli-fallback',
      transcriptSize: getTranscript().length,
      hint: 'Message stored. Use /api/chat to execute with agent.'
    });
    
  } catch (error: any) {
    logger.error('[RCHAT] Error in /type', {
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      ok: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/rchat/dump
 * Get chat transcript (from UIA or server memory)
 * Supports hybrid mode: combines UIA responses with server-tracked user messages
 */
router.get('/dump', async (_req, res) => {
  try {
    logger.debug('[RCHAT] Dump request received');
    
    let uiaItems: any[] = [];
    let uiaAvailable = false;
    
    // Try UIA read if enabled
    if (
      config.TRANSCRIPT_MODE !== 'server' &&
      config.UIA_READ_ENABLED
    ) {
      try {
        const uiaResponse = await fetch(`${config.UIA_HOST}/dump`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (uiaResponse.ok) {
          const result = await uiaResponse.json() as any;
          
          if (result.ok && result.items && result.items.length > 0) {
            uiaItems = result.items;
            uiaAvailable = result.uia || false;
            logger.info('[RCHAT] Got UIA transcript', {
              count: uiaItems.length,
              uiaActive: uiaAvailable
            });
          }
        }
      } catch (error: any) {
        logger.debug('[RCHAT] UIA dump failed', {
          error: error.message
        });
      }
    }
    
    // Get server transcript
    const serverItems = getTranscript();
    
    // Hybrid mode: merge UIA and server items
    if (config.TRANSCRIPT_MODE === 'hybrid' && uiaItems.length > 0) {
      // Combine and deduplicate
      const allItems = [...serverItems];
      
      // Add UIA items that aren't duplicates
      for (const uiaItem of uiaItems) {
        const isDuplicate = allItems.some(
          item => item.text.trim() === uiaItem.text?.trim() ||
                  item.text.trim() === uiaItem.Text?.trim()
        );
        
        if (!isDuplicate) {
          allItems.push({
            role: uiaItem.role || uiaItem.Role || 'assistant',
            text: uiaItem.text || uiaItem.Text || '',
            timestamp: uiaItem.timestamp || uiaItem.Timestamp || Date.now(),
            author: uiaItem.author || uiaItem.Author || 'Cursor AI'
          });
        }
      }
      
      // Sort by timestamp
      allItems.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      
      logger.info('[RCHAT] Returning hybrid transcript', {
        serverCount: serverItems.length,
        uiaCount: uiaItems.length,
        mergedCount: allItems.length
      });
      
      return res.json({
        ok: true,
        source: 'hybrid',
        uiaAvailable,
        items: allItems
      });
    }
    
    // UIA-only mode
    if (config.TRANSCRIPT_MODE === 'uia' && uiaItems.length > 0) {
      return res.json({
        ok: true,
        source: 'uia',
        uiaAvailable,
        items: uiaItems.map(item => ({
          role: item.role || item.Role || 'assistant',
          text: item.text || item.Text || '',
          timestamp: item.timestamp || item.Timestamp || Date.now(),
          author: item.author || item.Author
        }))
      });
    }
    
    // Server-only mode or fallback
    logger.info('[RCHAT] Returning server transcript', {
      count: serverItems.length
    });
    
    return res.json({
      ok: true,
      source: 'server',
      uiaAvailable,
      items: serverItems
    });
    
  } catch (error: any) {
    logger.error('[RCHAT] Error in /dump', {
      error: error.message
    });
    
    return res.status(500).json({
      ok: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/rchat/status
 * Check UIA host status
 */
router.get('/status', async (_req, res) => {
  try {
    let uiaAvailable = false;
    
    if (config.CHAT_TYPING_MODE === 'pophide') {
      try {
        const uiaResponse = await fetch(`${config.UIA_HOST}/status`, {
          method: 'GET'
        });
        uiaAvailable = uiaResponse.ok;
      } catch (error) {
        // UIA not available
      }
    }
    
    return res.json({
      ok: true,
      mode: config.CHAT_TYPING_MODE,
      uiaAvailable,
      uiaReadEnabled: config.UIA_READ_ENABLED,
      transcriptMode: config.TRANSCRIPT_MODE,
      transcriptSize: getTranscript().length,
      maxTextLen: config.RCHAT_MAX_TEXT_LEN,
      rateLimit: config.RCHAT_RATE_LIMIT_PER_MIN
    });
  } catch (error: any) {
    logger.error('[RCHAT] Error in /status', {
      error: error.message
    });
    
    return res.status(500).json({
      ok: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Helper for chat.ts to add assistant messages
 */
export function addAssistantMessage(text: string): void {
  pushAssistant(text, 'Cursor AI');
}

export { router as rchatRouter };
