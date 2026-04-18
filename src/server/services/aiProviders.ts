/**
 * AI Provider implementations
 * Supports: Anthropic (Claude), OpenAI (GPT), Google (Gemini)
 */

import { logger } from './logger.js';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  model?: string;
  onChunk?: (text: string) => void;
}

/**
 * Anthropic (Claude) API
 */
export async function chatWithClaude(
  apiKey: string,
  options: ChatOptions
): Promise<string> {
  const { messages, model = 'claude-3-5-sonnet-20241022', onChunk } = options;
  
  logger.info({ model, messageCount: messages.length }, 'Calling Claude API');
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: messages.filter(m => m.role !== 'system'),
      system: messages.find(m => m.role === 'system')?.content,
      stream: !!onChunk,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, error }, 'Claude API error');
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }
  
  if (onChunk && response.body) {
    // Stream response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const json = JSON.parse(data);
              if (json.type === 'content_block_delta' && json.delta?.text) {
                const text = json.delta.text;
                fullText += text;
                onChunk(text);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    
    return fullText;
  } else {
    // Non-streaming
    const data = await response.json();
    return data.content[0]?.text || '';
  }
}

/**
 * OpenAI (GPT) API
 */
export async function chatWithGPT(
  apiKey: string,
  options: ChatOptions
): Promise<string> {
  const { messages, model = 'gpt-4', onChunk } = options;
  
  logger.info({ model, messageCount: messages.length }, 'Calling OpenAI API');
  
  const response = await fetch('https://api.openAI.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: !!onChunk,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, error }, 'OpenAI API error');
    throw new Error(`OpenAI API error: ${response.status}`);
  }
  
  if (onChunk && response.body) {
    // Stream response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const json = JSON.parse(data);
              const text = json.choices[0]?.delta?.content;
              if (text) {
                fullText += text;
                onChunk(text);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    
    return fullText;
  } else {
    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }
}

/**
 * Google (Gemini) API
 */
export async function chatWithGemini(
  apiKey: string,
  options: ChatOptions
): Promise<string> {
  const { messages, model = 'gemini-pro', onChunk } = options;
  
  logger.info({ model, messageCount: messages.length }, 'Calling Gemini API');
  
  // Convert messages format
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  
  const systemInstruction = messages.find(m => m.role === 'system')?.content;
  
  const endpoint = onChunk
    ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, error }, 'Gemini API error');
    throw new Error(`Gemini API error: ${response.status}`);
  }
  
  if (onChunk && response.body) {
    // Stream response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.trim());
        
        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              fullText += text;
              onChunk(text);
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    
    return fullText;
  } else {
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
}

