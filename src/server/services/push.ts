/**
 * Push Notification Service
 * Sends notifications to subscribed clients when AI responses are ready
 */

// @ts-ignore - web-push types
import webpush from 'web-push';
import { logger } from './logger.js';

// Store subscriptions in memory (in production, use a database)
const subscriptions = new Map<string, webpush.PushSubscription>();

// VAPID keys (should be generated once and stored in env)
let vapidConfigured = false;

/**
 * Initialize push notification service with VAPID keys
 */
export function initPushService(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL || 'mailto:admin@localhost';
  
  if (!publicKey || !privateKey) {
    logger.warn('[PUSH] VAPID keys not configured. Push notifications disabled.');
    logger.info('[PUSH] Generate keys with: npx web-push generate-vapid-keys');
    return false;
  }
  
  try {
    webpush.setVapidDetails(email, publicKey, privateKey);
    vapidConfigured = true;
    logger.info('[PUSH] Push notification service initialized');
    return true;
  } catch (error) {
    logger.error({ error }, '[PUSH] Failed to initialize VAPID');
    return false;
  }
}

/**
 * Get VAPID public key for client subscription
 */
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/**
 * Check if push notifications are available
 */
export function isPushAvailable(): boolean {
  return vapidConfigured;
}

/**
 * Subscribe a client to push notifications
 */
export function subscribe(clientId: string, subscription: webpush.PushSubscription): void {
  subscriptions.set(clientId, subscription);
  logger.info({ clientId }, '[PUSH] Client subscribed');
}

/**
 * Unsubscribe a client
 */
export function unsubscribe(clientId: string): void {
  subscriptions.delete(clientId);
  logger.info({ clientId }, '[PUSH] Client unsubscribed');
}

/**
 * Send notification to a specific client
 */
export async function sendNotification(
  clientId: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<boolean> {
  if (!vapidConfigured) {
    return false;
  }
  
  const subscription = subscriptions.get(clientId);
  if (!subscription) {
    logger.debug({ clientId }, '[PUSH] No subscription found for client');
    return false;
  }
  
  try {
    const payload = JSON.stringify({
      title,
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: {
        ...data,
        timestamp: Date.now()
      }
    });
    
    await webpush.sendNotification(subscription, payload);
    logger.debug({ clientId, title }, '[PUSH] Notification sent');
    return true;
  } catch (error: any) {
    // If subscription is expired or invalid, remove it
    if (error.statusCode === 410 || error.statusCode === 404) {
      subscriptions.delete(clientId);
      logger.info({ clientId }, '[PUSH] Subscription expired, removed');
    } else {
      logger.error({ error, clientId }, '[PUSH] Failed to send notification');
    }
    return false;
  }
}

/**
 * Broadcast notification to all subscribed clients
 */
export async function broadcastNotification(
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<number> {
  if (!vapidConfigured) {
    return 0;
  }
  
  let sent = 0;
  const promises: Promise<void>[] = [];
  
  subscriptions.forEach((_subscription, clientId) => {
    promises.push(
      sendNotification(clientId, title, body, data)
        .then(success => {
          if (success) sent++;
        })
    );
  });
  
  await Promise.allSettled(promises);
  logger.info({ sent, total: subscriptions.size }, '[PUSH] Broadcast complete');
  
  return sent;
}

/**
 * Send notification when AI response is ready
 */
export async function notifyAIResponse(preview: string): Promise<void> {
  await broadcastNotification(
    'תשובה חדשה מ-Cursor',
    preview.substring(0, 200) + (preview.length > 200 ? '...' : ''),
    { type: 'ai_response' }
  );
}

/**
 * Get number of subscribed clients
 */
export function getSubscriberCount(): number {
  return subscriptions.size;
}

