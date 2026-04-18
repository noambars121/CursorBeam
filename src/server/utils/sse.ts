import { Response } from 'express';
import { logger } from '../services/logger.js';

export interface SSEWriter {
  send(event: string, data: any): void;
  end(): void;
}

/**
 * Send a Server-Sent Event
 */
export function sendSSE(res: Response, event: string, data: any): void {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  res.write(`event: ${event}\n`);
  res.write(`data: ${payload}\n\n`);
}

/**
 * Create an SSE stream with proper headers
 */
export function createSSEStream(res: Response): SSEWriter {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
  
  // Send initial comment to establish connection
  res.write(': connected\n\n');
  
  return {
    send(event: string, data: any) {
      try {
        sendSSE(res, event, data);
      } catch (error) {
        logger.error({ error, event }, 'Failed to send SSE event');
      }
    },
    end() {
      try {
        res.end();
      } catch (error) {
        logger.error({ error }, 'Failed to end SSE stream');
      }
    },
  };
}

