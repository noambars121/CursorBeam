/**
 * Remote Chat (UIA) Service
 * Handles transcript storage and message routing
 */

import { config } from '../env.js';
import { logger } from './logger.js';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: number;
  author?: string;
}

// In-memory transcript storage
const transcript: ChatMessage[] = [];

/**
 * Add message to transcript
 */
export function addToTranscript(message: ChatMessage): void {
  transcript.push(message);
  
  // Trim to max size
  const maxSize = config.TRANSCRIPT_MAX_ITEMS;
  if (transcript.length > maxSize) {
    transcript.splice(0, transcript.length - maxSize);
  }
  
  logger.debug('[RCHAT] Message added to transcript', {
    role: message.role,
    length: message.text.length,
    totalItems: transcript.length
  });
}

/**
 * Add user message
 */
export function pushUser(text: string): void {
  addToTranscript({
    role: 'user',
    text,
    timestamp: Date.now()
  });
}

/**
 * Add assistant message
 */
export function pushAssistant(text: string, author?: string): void {
  addToTranscript({
    role: 'assistant',
    text,
    timestamp: Date.now(),
    author: author || 'AI'
  });
}

/**
 * Get full transcript
 */
export function getTranscript(): ChatMessage[] {
  return [...transcript]; // Return copy
}

/**
 * Clear transcript
 */
export function clearTranscript(): void {
  transcript.length = 0;
  logger.info('[RCHAT] Transcript cleared');
}

/**
 * Get transcript size
 */
export function getTranscriptSize(): number {
  return transcript.length;
}

