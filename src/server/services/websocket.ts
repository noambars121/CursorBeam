/**
 * WebSocket Service for Real-time Chat Streaming
 * Provides real-time updates for chat messages from Cursor
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { logger } from './logger.js';
import { config } from '../env.js';
import { getTranscript, ChatMessage } from './rchat.js';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

// Track last known transcript state for change detection
let lastTranscriptLength = 0;
let lastTranscriptHash = '';

/**
 * Initialize WebSocket server
 */
export function initWebSocket(server: Server): void {
  wss = new WebSocketServer({ 
    server,
    path: '/ws/chat'
  });

  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    logger.info({ clientIp }, '[WS] Client connected');
    
    clients.add(ws);

    // Send initial state
    const transcript = getTranscript();
    ws.send(JSON.stringify({
      type: 'init',
      items: transcript,
      timestamp: Date.now()
    }));

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        handleClientMessage(ws, data);
      } catch (error) {
        logger.error({ error }, '[WS] Error parsing client message');
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      logger.info({ clientIp }, '[WS] Client disconnected');
    });

    ws.on('error', (error) => {
      logger.error({ error }, '[WS] WebSocket error');
      clients.delete(ws);
    });
  });

  // Start polling for changes
  startTranscriptPolling();

  logger.info('[WS] WebSocket server initialized on /ws/chat');
}

/**
 * Handle incoming client messages
 */
function handleClientMessage(ws: WebSocket, data: any): void {
  switch (data.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
    
    case 'subscribe':
      // Client wants to subscribe to updates
      logger.debug('[WS] Client subscribed to updates');
      break;
    
    case 'requestTranscript':
      // Send current transcript
      const transcript = getTranscript();
      ws.send(JSON.stringify({
        type: 'transcript',
        items: transcript,
        timestamp: Date.now()
      }));
      break;
    
    default:
      logger.debug({ type: data.type }, '[WS] Unknown message type');
  }
}

/**
 * Broadcast message to all connected clients
 */
export function broadcast(message: any): void {
  const payload = JSON.stringify(message);
  
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

/**
 * Broadcast new chat message
 */
export function broadcastNewMessage(message: ChatMessage): void {
  broadcast({
    type: 'newMessage',
    message,
    timestamp: Date.now()
  });
}

/**
 * Broadcast transcript update
 */
export function broadcastTranscriptUpdate(items: ChatMessage[]): void {
  broadcast({
    type: 'transcriptUpdate',
    items,
    timestamp: Date.now()
  });
}

/**
 * Poll for transcript changes and broadcast updates
 */
let pollingInterval: ReturnType<typeof setInterval> | null = null;

function startTranscriptPolling(): void {
  // Poll every 500ms for changes
  pollingInterval = setInterval(async () => {
    try {
      const transcript = getTranscript();
      const newLength = transcript.length;
      const newHash = hashTranscript(transcript);
      
      // Check if transcript changed
      if (newLength !== lastTranscriptLength || newHash !== lastTranscriptHash) {
        logger.debug('[WS] Transcript changed, broadcasting update');
        
        // Find new items (items added since last check)
        if (newLength > lastTranscriptLength) {
          const newItems = transcript.slice(lastTranscriptLength);
          newItems.forEach(item => {
            broadcastNewMessage(item);
          });
        }
        
        // Update tracking
        lastTranscriptLength = newLength;
        lastTranscriptHash = newHash;
      }
    } catch (error) {
      logger.error({ error }, '[WS] Error in transcript polling');
    }
  }, 500);
}

/**
 * Simple hash function for change detection
 */
function hashTranscript(items: ChatMessage[]): string {
  if (items.length === 0) return '';
  
  const lastItem = items[items.length - 1];
  return `${items.length}:${lastItem.timestamp}:${lastItem.text.substring(0, 50)}`;
}

/**
 * Check if UIA host has new content
 */
export async function pollUIAForUpdates(): Promise<ChatMessage[]> {
  try {
    const response = await fetch(`${config.UIA_HOST}/dump`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      const result = await response.json() as any;
      if (result.ok && result.items && result.items.length > 0) {
        return result.items.map((item: any) => ({
          role: item.role || item.Role || 'assistant',
          text: item.text || item.Text || '',
          timestamp: item.timestamp || item.Timestamp || Date.now(),
          author: item.author || item.Author
        }));
      }
    }
  } catch (error) {
    // Silently fail - UIA might not be available
  }
  
  return [];
}

/**
 * Get number of connected clients
 */
export function getConnectedClientsCount(): number {
  return clients.size;
}

/**
 * Cleanup WebSocket server
 */
export function closeWebSocket(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
  
  if (wss) {
    wss.close();
    wss = null;
  }
  
  clients.clear();
  logger.info('[WS] WebSocket server closed');
}

