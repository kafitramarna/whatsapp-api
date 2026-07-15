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
} from '../services/whatsappService';
import { Session } from '../models/Session';
import { safeFetch } from '../lib/ssrfGuard';
import { env } from '../config/env';

// Request body types
interface CreateSessionBody {
  session_id?: string;
  webhook_url?: string;
}

interface SessionParams {
  sessionId: string;
}

interface SendMessageBody {
  to: string;
  message?: string;
  media?: Array<{
    type: 'image' | 'video' | 'document' | 'audio' | 'sticker';
    data: string; // base64 or URL
    caption?: string;
    filename?: string;
    mimetype?: string;
  }>;
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
 * Helper: Prepare media buffer from URL, file path, or base64
 */
async function prepareMediaBuffer(mediaData: string): Promise<{ buffer: Buffer; mimetype?: string }> {
  // HTTP/HTTPS URL — with SSRF protection
  if (mediaData.startsWith('http://') || mediaData.startsWith('https://')) {
    const response = await safeFetch(mediaData);
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type');
    return { buffer: Buffer.from(arrayBuffer), mimetype: contentType || undefined };
  }
  
  // Local file path (file:// protocol or absolute path) — blocked in production
  if (mediaData.startsWith('file://') || mediaData.match(/^[a-zA-Z]:[/\\]/) || mediaData.startsWith('/')) {
    if (env.isProd) {
      throw new Error('Local file paths are not allowed in production. Use base64 or URL instead.');
    }
    const { readFile } = await import('fs/promises');
    const { fileURLToPath } = await import('url');
    
    let filePath = mediaData;
    
    // Convert file:// URL to path
    if (mediaData.startsWith('file://')) {
      filePath = fileURLToPath(mediaData);
    }
    
    const buffer = await readFile(filePath);
    
    // Detect mimetype from extension
    const ext = filePath.split('.').pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp',
      'mp4': 'video/mp4', '3gp': 'video/3gpp', 'mov': 'video/quicktime',
      'pdf': 'application/pdf', 'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel', 'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'mp3': 'audio/mpeg', 'ogg': 'audio/ogg', 'wav': 'audio/wav',
    };
    
    return { buffer, mimetype: ext ? mimeMap[ext] : undefined };
  }
  
  // Assume base64
  const base64Data = mediaData.includes(',') ? mediaData.split(',')[1] : mediaData;
  return { buffer: Buffer.from(base64Data, 'base64') };
}

/**
 * Helper: Build message content for media
 */
function buildMediaContent(
  type: string,
  buffer: Buffer,
  mimetype?: string,
  caption?: string,
  filename?: string
): Record<string, unknown> {
  switch (type) {
    case 'image':
      return { image: buffer, caption, mimetype: mimetype || 'image/jpeg' };
    case 'video':
      return { video: buffer, caption, mimetype: mimetype || 'video/mp4' };
    case 'document':
      return { document: buffer, fileName: filename || 'document', caption, mimetype: mimetype || 'application/octet-stream' };
    case 'audio':
      return { audio: buffer, mimetype: mimetype || 'audio/mpeg', ptt: false };
    case 'sticker':
      return { sticker: buffer, mimetype: mimetype || 'image/webp' };
    default:
      throw new Error(`Invalid media type: ${type}`);
  }
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
    const { session_id, webhook_url } = request.body || {};

    // Generate session ID if not provided
    const sessionId = session_id || `session_${uuidv4().slice(0, 8)}`;

    // Check if session already exists for another user
    const existingSession = await Session.findOne({
      where: { session_id: sessionId },
    });

    if (existingSession && existingSession.user_id !== user.id) {
      reply.status(400).send({
        success: false,
        error: 'Session ID already exists for another user',
      });
      return;
    }

    // Create session (handles creation or update of existing disconnected session)

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
    const { to, message, media } = request.body;
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

    // Send text message if provided
    if (message) {
      const textResult = await socket.sendMessage(jid, { text: message });
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
          item.filename
        );
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

export default {
  createSessionHandler,
  getSessionStatusHandler,
  getQrCodeHandler,
  deleteSessionHandler,
  listSessionsHandler,
  sendMessageHandler,
  markReadHandler,
  sendPresenceHandler,
};
