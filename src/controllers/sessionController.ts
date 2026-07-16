/**
 * Session Controller
 * 
 * Handles all WhatsApp session-related API endpoints
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import {
  createSession,
  deleteSession,
  getSessionStatus,
  getSession,
  markMessageRead,
  sendPresence,
  sessions,
  qrCodes,
  sessionEvents,
} from '../services/whatsappService';
import { Session } from '../models/Session';
import { prepareMediaBuffer, buildMediaContent, type MediaItem } from '../lib/mediaUtils';

// Request body types
interface CreateSessionBody {
  webhook_url?: string;
}

interface SessionParams {
  sessionId: string;
}

interface SendMessageBody {
  to: string;
  message?: string;
  replyTo?: string;
  media?: MediaItem[];
}

interface MarkReadBody {
  remoteJid: string;
  messageId: string;
}

interface PresenceBody {
  remoteJid: string;
  presence: 'composing' | 'paused';
}


/**
 * Create a new WhatsApp session
 * POST /session/create
 */
export async function createSessionHandler(
  request: FastifyRequest<{ Body: CreateSessionBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const user = request.user!;
    const { webhook_url } = request.body || {};

    // Always auto-generate session ID
    const sessionId = `session_${uuidv4()}`;

    // Create session
    const result = await createSession(sessionId, user.id, webhook_url);

    if (!result.success) {
      reply.status(500).send({
        success: false,
        error: result.message,
      });
      return;
    }

    // Wait a bit for QR code to be generated
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get QR code if available
    const qr = qrCodes.get(sessionId);
    const status = await getSessionStatus(sessionId);

    reply.send({
      success: true,
      data: {
        session_id: sessionId,
        status: status.status,
        connected: status.connected,
        qr: qr || status.qr,
        message: result.message,
      },
    });
  } catch (error) {
    console.error('[Controller] Create session error:', error);
    reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get session status
 * GET /session/:sessionId/status
 */
export async function getSessionStatusHandler(
  request: FastifyRequest<{ Params: SessionParams }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const user = request.user!;

    // Verify session belongs to user
    const session = await Session.findOne({
      where: { session_id: sessionId, user_id: user.id },
    });

    if (!session) {
      reply.status(404).send({
        success: false,
        error: 'Session not found',
      });
      return;
    }

    const status = await getSessionStatus(sessionId);

    reply.send({
      success: true,
      data: {
        session_id: sessionId,
        ...status,
      },
    });
  } catch (error) {
    console.error('[Controller] Get status error:', error);
    reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get QR code
 * GET /session/:sessionId/qr
 */
export async function getQrCodeHandler(
  request: FastifyRequest<{ Params: SessionParams }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const user = request.user!;

    // Verify session belongs to user
    const session = await Session.findOne({
      where: { session_id: sessionId, user_id: user.id },
    });

    if (!session) {
      reply.status(404).send({
        success: false,
        error: 'Session not found',
      });
      return;
    }

    const qr = qrCodes.get(sessionId);
    const status = await getSessionStatus(sessionId);

    if (status.status === 'connected') {
      reply.send({
        success: true,
        data: {
          session_id: sessionId,
          status: 'connected',
          qr: null,
          message: 'Already connected',
        },
      });
      return;
    }

    if (!qr) {
      reply.send({
        success: true,
        data: {
          session_id: sessionId,
          status: status.status,
          qr: null,
          message: 'QR code not ready. Please wait...',
        },
      });
      return;
    }

    reply.send({
      success: true,
      data: {
        session_id: sessionId,
        status: status.status,
        qr: qr,
      },
    });
  } catch (error) {
    console.error('[Controller] Get QR error:', error);
    reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Delete a session
 * DELETE /session/:sessionId
 */
export async function deleteSessionHandler(
  request: FastifyRequest<{ Params: SessionParams }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const user = request.user!;

    // Verify session belongs to user
    const session = await Session.findOne({
      where: { session_id: sessionId, user_id: user.id },
    });

    if (!session) {
      reply.status(404).send({
        success: false,
        error: 'Session not found',
      });
      return;
    }

    await deleteSession(sessionId);

    reply.send({
      success: true,
      message: 'Session deleted successfully',
    });
  } catch (error) {
    console.error('[Controller] Delete session error:', error);
    reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * List all sessions for user
 * GET /sessions
 */
export async function listSessionsHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const user = request.user!;

    const userSessions = await Session.findAll({
      where: { user_id: user.id },
      attributes: ['session_id', 'status', 'phone_number', 'name', 'last_connected', 'created_at'],
    });

    // Add connection status
    const sessionsWithStatus = userSessions.map((s) => ({
      ...s.toJSON(),
      connected: sessions.has(s.session_id) && getSession(s.session_id)?.user !== undefined,
      hasQr: qrCodes.has(s.session_id),
    }));

    reply.send({
      success: true,
      data: sessionsWithStatus,
    });
  } catch (error) {
    console.error('[Controller] List sessions error:', error);
    reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Send message with optional media
 * POST /session/:sessionId/send
 * 
 * Supports:
 * - Text only: { to: "...", message: "Hello" }
 * - Media only: { to: "...", media: [{ type: "image", data: "..." }] }
 * - Text + Media: { to: "...", message: "Hello", media: [...] }
 */
export async function sendMessageHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: SendMessageBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { to, message, media, replyTo } = request.body;
    const user = request.user!;

    // Validate input - need at least message or media
    if (!to) {
      reply.status(400).send({
        success: false,
        error: 'Missing "to" in request body',
      });
      return;
    }

    if (!message && (!media || media.length === 0)) {
      reply.status(400).send({
        success: false,
        error: 'Must provide either "message" or "media" array',
      });
      return;
    }

    // Verify session belongs to user
    const session = await Session.findOne({
      where: { session_id: sessionId, user_id: user.id },
    });

    if (!session) {
      reply.status(404).send({
        success: false,
        error: 'Session not found',
      });
      return;
    }

    // Get socket
    const socket = getSession(sessionId);

    if (!socket || !socket.user) {
      reply.status(400).send({
        success: false,
        error: 'Session not connected',
      });
      return;
    }

    // Format phone number
    const jid = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`;

    const results: Array<{ type: string; messageId?: string }> = [];

    // Build quoted message if replyTo is provided
    const quoted = replyTo ? {
      key: { remoteJid: jid, id: replyTo, fromMe: false },
      message: { conversation: '' },
    } : undefined;

    // Send text message if provided
    if (message) {
      const textContent: Record<string, unknown> = { text: message };
      if (quoted) textContent.quoted = quoted;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const textResult = await socket.sendMessage(jid, textContent as any);
      results.push({ type: 'text', messageId: textResult?.key?.id ?? undefined });
    }

    // Send media if provided
    if (media && media.length > 0) {
      for (const item of media) {
        const { buffer, mimetype: detectedMimetype } = await prepareMediaBuffer(item.data);
        const content = buildMediaContent(
          item.type,
          buffer,
          item.mimetype || detectedMimetype,
          item.caption,
          item.filename,
          item.isAnimated,
          item.viewOnce,
          item.ptt,
          item.quality
        );
        if (quoted) (content as Record<string, unknown>).quoted = quoted;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mediaResult = await socket.sendMessage(jid, content as any);
        results.push({ type: item.type, messageId: mediaResult?.key?.id ?? undefined });
      }
    }

    reply.send({
      success: true,
      data: {
        to: jid,
        sent: results,
      },
    });
  } catch (error) {
    console.error('[Controller] Send message error:', error);
    reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function markReadHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: MarkReadBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { remoteJid, messageId } = request.body;
    const user = request.user!;

    if (!remoteJid || !messageId) {
      reply.status(400).send({ success: false, error: 'Missing remoteJid or messageId' });
      return;
    }

    const session = await Session.findOne({ where: { session_id: sessionId, user_id: user.id } });
    if (!session) {
      reply.status(404).send({ success: false, error: 'Session not found' });
      return;
    }

    await markMessageRead(sessionId, remoteJid, messageId);
    reply.send({ success: true, message: 'Message marked as read' });
  } catch (error) {
    console.error('[Controller] Mark read error:', error);
    reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function sendPresenceHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: PresenceBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { remoteJid, presence } = request.body;
    const user = request.user!;

    if (!remoteJid || !presence) {
      reply.status(400).send({ success: false, error: 'Missing remoteJid or presence' });
      return;
    }

    if (presence !== 'composing' && presence !== 'paused') {
      reply.status(400).send({ success: false, error: 'Invalid presence' });
      return;
    }

    const session = await Session.findOne({ where: { session_id: sessionId, user_id: user.id } });
    if (!session) {
      reply.status(404).send({ success: false, error: 'Session not found' });
      return;
    }

    await sendPresence(sessionId, remoteJid, presence);
    reply.send({ success: true, message: 'Presence updated' });
  } catch (error) {
    console.error('[Controller] Presence error:', error);
    reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Session events stream (SSE)
 * GET /session/:sessionId/events
 */
export async function sessionEventsHandler(
  request: FastifyRequest<{ Params: SessionParams }>,
  reply: FastifyReply
): Promise<void> {
  const { sessionId } = request.params;
  const user = request.user!;

  const session = await Session.findOne({
    where: { session_id: sessionId, user_id: user.id },
  });

  if (!session) {
    reply.status(404).send({
      success: false,
      error: 'Session not found',
    });
    return;
  }

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (event: string, data: unknown) => {
    reply.raw.write(`event: ${event}\n`);
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const onQrReady = (sid: string, qr: string) => {
    if (sid === sessionId) {
      sendEvent('qr', { session_id: sessionId, qr, status: 'qr_ready' });
    }
  };

  const onQrCleared = (sid: string) => {
    if (sid === sessionId) {
      sendEvent('qr_cleared', { session_id: sessionId });
    }
  };

  const onConnected = (sid: string, info: { phone_number?: string; name?: string }) => {
    if (sid === sessionId) {
      sendEvent('connected', { session_id: sessionId, ...info });
    }
  };

  const onDisconnected = (sid: string, info: { reason: unknown; reconnecting: boolean }) => {
    if (sid === sessionId) {
      sendEvent('disconnected', { session_id: sessionId, ...info });
    }
  };

  sessionEvents.on('qr:ready', onQrReady);
  sessionEvents.on('qr:cleared', onQrCleared);
  sessionEvents.on('connected', onConnected);
  sessionEvents.on('disconnected', onDisconnected);

  const status = await getSessionStatus(sessionId);
  sendEvent('ready', {
    session_id: sessionId,
    status: status.status,
    connected: status.connected,
  });

  const existingQr = qrCodes.get(sessionId);
  if (existingQr) {
    sendEvent('qr', { session_id: sessionId, qr: existingQr, status: 'qr_ready' });
  }

  const heartbeat = setInterval(() => {
    reply.raw.write(': ping\n\n');
  }, 15000);

  request.raw.on('close', () => {
    clearInterval(heartbeat);
    sessionEvents.off('qr:ready', onQrReady);
    sessionEvents.off('qr:cleared', onQrCleared);
    sessionEvents.off('connected', onConnected);
    sessionEvents.off('disconnected', onDisconnected);
  });
}

export default {
  createSessionHandler,
  getSessionStatusHandler,
  getQrCodeHandler,
  deleteSessionHandler,
  listSessionsHandler,
  sendMessageHandler,
  markReadHandler,
  sendPresenceHandler,
  sessionEventsHandler,
};
