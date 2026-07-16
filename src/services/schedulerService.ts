/**
 * Scheduled Message Service
 * 
 * Processes scheduled messages using node-cron
 */

import cron, { ScheduledTask } from 'node-cron';
import { Op } from 'sequelize';
import { ScheduledMessage, ScheduledMessageStatus } from '../models/ScheduledMessage';
import { getSession } from './whatsappService';
import { prepareMediaBuffer, buildMediaContent } from '../lib/mediaUtils';

// Flag to prevent multiple instances
let isRunning = false;
let cronTask: ScheduledTask | null = null;

/**
 * Process pending scheduled messages
 */
async function processScheduledMessages(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    // Find messages that are due
    const messages = await ScheduledMessage.findAll({
      where: {
        status: ScheduledMessageStatus.PENDING,
        scheduled_at: {
          [Op.lte]: new Date(),
        },
      },
      limit: 10, // Process in batches
    });

    for (const msg of messages) {
      try {
        // Mark as processing
        msg.status = ScheduledMessageStatus.PROCESSING;
        await msg.save();

        // Get session
        const socket = getSession(msg.session_id);
        if (!socket || !socket.user) {
          msg.status = ScheduledMessageStatus.FAILED;
          msg.error = 'Session not connected';
          await msg.save();
          continue;
        }

        // Format JID
        const jid = msg.recipient_type === 'group'
          ? (msg.recipient.includes('@') ? msg.recipient : `${msg.recipient}@g.us`)
          : (msg.recipient.includes('@') ? msg.recipient : `${msg.recipient.replace(/[^0-9]/g, '')}@s.whatsapp.net`);

        let messageId: string | undefined;

        // Send text message
        if (msg.message) {
          const result = await socket.sendMessage(jid, { text: msg.message });
          messageId = result?.key?.id ?? undefined;
        }

        // Send media
        const mediaItems = msg.getMediaItems();
        for (const item of mediaItems) {
          const { buffer, mimetype } = await prepareMediaBuffer(item.data);
          const content = buildMediaContent(item.type, buffer, item.mimetype || mimetype, item.caption, item.filename, item.isAnimated, item.viewOnce, item.ptt, item.quality);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await socket.sendMessage(jid, content as any);
          if (!messageId) messageId = result?.key?.id ?? undefined;
        }

        // Mark as sent
        msg.status = ScheduledMessageStatus.SENT;
        msg.sent_at = new Date();
        msg.wa_message_id = messageId || '';
        await msg.save();

        console.log(`[Scheduler] Sent scheduled message ${msg.id} to ${jid}`);
      } catch (error) {
        msg.status = ScheduledMessageStatus.FAILED;
        msg.error = error instanceof Error ? error.message : 'Unknown error';
        await msg.save();
        console.error(`[Scheduler] Failed to send message ${msg.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error processing messages:', error);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the scheduler (runs every minute)
 */
export function startScheduler(): void {
  console.log('[Scheduler] Starting scheduled message processor...');
  
  // Run every minute
  cronTask = cron.schedule('* * * * *', async () => {
    await processScheduledMessages();
  });

  console.log('[Scheduler] Scheduler started. Checking for messages every minute.');
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }
  console.log('[Scheduler] Scheduler stopped.');
}

export default {
  startScheduler,
  stopScheduler,
  processScheduledMessages,
};
