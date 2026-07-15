/**
 * Group & Broadcast Controller
 * 
 * Handles group management, send to group, and broadcast endpoints
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { getSession } from '../services/whatsappService';
import { Session } from '../models/Session';
import { sessionStore } from '../services/sessionStore';
import { safeFetch } from '../lib/ssrfGuard';
import { env } from '../config/env';

// Types
interface SessionParams {
  sessionId: string;
}

interface SendToGroupBody {
  groupId: string;
  message?: string;
  media?: Array<{
    type: 'image' | 'video' | 'document' | 'audio' | 'sticker';
    data: string;
    caption?: string;
    filename?: string;
    mimetype?: string;
  }>;
}

interface BroadcastBody {
  recipients: string[];
  message?: string;
  media?: Array<{
    type: 'image' | 'video' | 'document' | 'audio' | 'sticker';
    data: string;
    caption?: string;
    filename?: string;
    mimetype?: string;
  }>;
  delay?: number; // ms between messages (default: 1000)
}

interface CreateGroupBody {
  name: string;
  participants: string[];
}

interface GroupParams {
  sessionId: string;
  groupId: string;
}

interface GroupMembersBody {
  participants: string[];
}

interface UpdateWebhookBody {
  webhook_url?: string | null;
}

/**
 * Helper: Prepare media buffer (with SSRF protection)
 */
async function prepareMediaBuffer(mediaData: string): Promise<{ buffer: Buffer; mimetype?: string }> {
  if (mediaData.startsWith('http://') || mediaData.startsWith('https://')) {
    const response = await safeFetch(mediaData);
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type');
    return { buffer: Buffer.from(arrayBuffer), mimetype: contentType || undefined };
  }
  
  if (mediaData.startsWith('file://') || mediaData.match(/^[a-zA-Z]:[/\\]/) || mediaData.startsWith('/')) {
    if (env.isProd) {
      throw new Error('Local file paths are not allowed in production. Use base64 or URL instead.');
    }
    const { readFile } = await import('fs/promises');
    const { fileURLToPath } = await import('url');
    let filePath = mediaData;
    if (mediaData.startsWith('file://')) filePath = fileURLToPath(mediaData);
    const buffer = await readFile(filePath);
    const ext = filePath.split('.').pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp',
      'mp4': 'video/mp4', 'pdf': 'application/pdf', 'mp3': 'audio/mpeg',
    };
    return { buffer, mimetype: ext ? mimeMap[ext] : undefined };
  }
  
  const base64Data = mediaData.includes(',') ? mediaData.split(',')[1] : mediaData;
  return { buffer: Buffer.from(base64Data, 'base64') };
}

/**
 * Helper: Build media content
 */
function buildMediaContent(type: string, buffer: Buffer, mimetype?: string, caption?: string, filename?: string): Record<string, unknown> {
  switch (type) {
    case 'image': return { image: buffer, caption, mimetype: mimetype || 'image/jpeg' };
    case 'video': return { video: buffer, caption, mimetype: mimetype || 'video/mp4' };
    case 'document': return { document: buffer, fileName: filename || 'document', caption, mimetype: mimetype || 'application/octet-stream' };
    case 'audio': return { audio: buffer, mimetype: mimetype || 'audio/mpeg', ptt: false };
    case 'sticker': return { sticker: buffer, mimetype: mimetype || 'image/webp' };
    default: throw new Error(`Invalid media type: ${type}`);
  }
}

/**
 * Helper: Verify session
 */
async function verifySession(sessionId: string, userId: string) {
  const session = await Session.findOne({
    where: { session_id: sessionId, user_id: userId },
  });
  if (!session) return { error: 'Session not found' };
  
  const socket = getSession(sessionId);
  if (!socket || !socket.user) return { error: 'Session not connected' };
  
  return { session, socket };
}

// ========================================
// SEND TO GROUP
// ========================================

/**
 * Send message to a WhatsApp group
 * POST /session/:sessionId/send-group
 */
export async function sendToGroupHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: SendToGroupBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { groupId, message, media } = request.body;
    const user = request.user!;

    if (!groupId) {
      reply.status(400).send({ success: false, error: 'Missing groupId' });
      return;
    }

    if (!message && (!media || media.length === 0)) {
      reply.status(400).send({ success: false, error: 'Must provide message or media' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
    const results: Array<{ type: string; messageId?: string }> = [];

    if (message) {
      const textResult = await socket.sendMessage(jid, { text: message });
      results.push({ type: 'text', messageId: textResult?.key?.id ?? undefined });
    }

    if (media && media.length > 0) {
      for (const item of media) {
        const { buffer, mimetype } = await prepareMediaBuffer(item.data);
        const content = buildMediaContent(item.type, buffer, item.mimetype || mimetype, item.caption, item.filename);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mediaResult = await socket.sendMessage(jid, content as any);
        results.push({ type: item.type, messageId: mediaResult?.key?.id ?? undefined });
      }
    }

    reply.send({ success: true, data: { groupId: jid, sent: results } });
  } catch (error) {
    console.error('[Controller] Send to group error:', error);
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// BROADCAST
// ========================================

/**
 * Broadcast message to multiple recipients
 * POST /session/:sessionId/broadcast
 */
export async function broadcastHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: BroadcastBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { recipients, message, media, delay = 1000 } = request.body;
    const user = request.user!;

    if (!recipients || recipients.length === 0) {
      reply.status(400).send({ success: false, error: 'Missing recipients array' });
      return;
    }

    if (!message && (!media || media.length === 0)) {
      reply.status(400).send({ success: false, error: 'Must provide message or media' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const results: Array<{ to: string; success: boolean; messageId?: string; error?: string }> = [];

    // Prepare media buffers upfront
    const preparedMedia: Array<{ type: string; content: Record<string, unknown> }> = [];
    if (media && media.length > 0) {
      for (const item of media) {
        const { buffer, mimetype } = await prepareMediaBuffer(item.data);
        const content = buildMediaContent(item.type, buffer, item.mimetype || mimetype, item.caption, item.filename);
        preparedMedia.push({ type: item.type, content });
      }
    }

    // Send to each recipient with delay
    for (let i = 0; i < recipients.length; i++) {
      const to = recipients[i];
      const jid = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`;

      try {
        // Send text
        if (message) {
          const textResult = await socket.sendMessage(jid, { text: message });
          results.push({ to, success: true, messageId: textResult?.key?.id ?? undefined });
        }

        // Send media
        for (const prepared of preparedMedia) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mediaResult = await socket.sendMessage(jid, prepared.content as any);
          results.push({ to, success: true, messageId: mediaResult?.key?.id ?? undefined });
        }
      } catch (err) {
        results.push({ to, success: false, error: err instanceof Error ? err.message : 'Failed' });
      }

      // Delay between recipients (except last)
      if (i < recipients.length - 1 && delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    reply.send({
      success: true,
      data: {
        total: recipients.length,
        success: successCount,
        failed: failCount,
        results,
      },
    });
  } catch (error) {
    console.error('[Controller] Broadcast error:', error);
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// GROUP MANAGEMENT
// ========================================

/**
 * Get all groups
 * GET /session/:sessionId/groups
 */
export async function listGroupsHandler(
  request: FastifyRequest<{ Params: SessionParams }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const user = request.user!;

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const groups = await socket.groupFetchAllParticipating();

    const groupList = Object.values(groups).map((group) => ({
      id: group.id,
      name: group.subject,
      owner: group.owner,
      creation: group.creation,
      participantsCount: group.participants?.length || 0,
      desc: group.desc || null,
    }));

    reply.send({ success: true, data: groupList });
  } catch (error) {
    console.error('[Controller] List groups error:', error);
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Create a new group
 * POST /session/:sessionId/groups
 */
export async function createGroupHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: CreateGroupBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { name, participants } = request.body;
    const user = request.user!;

    if (!name || !participants || participants.length === 0) {
      reply.status(400).send({ success: false, error: 'Name and participants required' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const jids = participants.map((p) => p.includes('@') ? p : `${p.replace(/[^0-9]/g, '')}@s.whatsapp.net`);
    const group = await socket.groupCreate(name, jids);

    reply.status(201).send({
      success: true,
      data: {
        id: group.id,
        name: group.subject,
      },
    });
  } catch (error) {
    console.error('[Controller] Create group error:', error);
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Get group info
 * GET /session/:sessionId/groups/:groupId
 */
export async function getGroupInfoHandler(
  request: FastifyRequest<{ Params: GroupParams }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId, groupId } = request.params;
    const user = request.user!;

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
    const metadata = await socket.groupMetadata(jid);

    reply.send({
      success: true,
      data: {
        id: metadata.id,
        name: metadata.subject,
        owner: metadata.owner,
        creation: metadata.creation,
        desc: metadata.desc || null,
        participants: metadata.participants.map((p) => ({
          id: p.id,
          admin: p.admin || null,
        })),
      },
    });
  } catch (error) {
    console.error('[Controller] Get group info error:', error);
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Add participants to group
 * POST /session/:sessionId/groups/:groupId/add
 */
export async function addGroupParticipantsHandler(
  request: FastifyRequest<{ Params: GroupParams; Body: GroupMembersBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId, groupId } = request.params;
    const { participants } = request.body;
    const user = request.user!;

    if (!participants || participants.length === 0) {
      reply.status(400).send({ success: false, error: 'Participants required' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
    const jids = participants.map((p) => p.includes('@') ? p : `${p.replace(/[^0-9]/g, '')}@s.whatsapp.net`);
    
    const addResult = await socket.groupParticipantsUpdate(jid, jids, 'add');

    reply.send({ success: true, data: addResult });
  } catch (error) {
    console.error('[Controller] Add participants error:', error);
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Remove participants from group
 * POST /session/:sessionId/groups/:groupId/remove
 */
export async function removeGroupParticipantsHandler(
  request: FastifyRequest<{ Params: GroupParams; Body: GroupMembersBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId, groupId } = request.params;
    const { participants } = request.body;
    const user = request.user!;

    if (!participants || participants.length === 0) {
      reply.status(400).send({ success: false, error: 'Participants required' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
    const jids = participants.map((p) => p.includes('@') ? p : `${p.replace(/[^0-9]/g, '')}@s.whatsapp.net`);
    
    const removeResult = await socket.groupParticipantsUpdate(jid, jids, 'remove');

    reply.send({ success: true, data: removeResult });
  } catch (error) {
    console.error('[Controller] Remove participants error:', error);
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Leave a group
 * DELETE /session/:sessionId/groups/:groupId
 */
export async function leaveGroupHandler(
  request: FastifyRequest<{ Params: GroupParams }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId, groupId } = request.params;
    const user = request.user!;

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
    await socket.groupLeave(jid);

    reply.send({ success: true, message: 'Left group successfully' });
  } catch (error) {
    console.error('[Controller] Leave group error:', error);
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// UPDATE WEBHOOK
// ========================================

/**
 * Update session webhook URL
 * PUT /session/:sessionId/webhook
 */
export async function updateWebhookHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: UpdateWebhookBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { webhook_url } = request.body;
    const user = request.user!;

    const session = await Session.findOne({
      where: { session_id: sessionId, user_id: user.id },
    });

    if (!session) {
      reply.status(404).send({ success: false, error: 'Session not found' });
      return;
    }

    session.webhook_url = webhook_url || '';
    await session.save();

    const runtime = sessionStore.get(sessionId);
    
    if (runtime) {
      runtime.webhookUrl = session.webhook_url // 🔥 live update
    }

    reply.send({
      success: true,
      data: {
        session_id: sessionId,
        webhook_url: session.webhook_url,
      },
    });
  } catch (error) {
    console.error('[Controller] Update webhook error:', error);
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

export default {
  sendToGroupHandler,
  broadcastHandler,
  listGroupsHandler,
  createGroupHandler,
  getGroupInfoHandler,
  addGroupParticipantsHandler,
  removeGroupParticipantsHandler,
  leaveGroupHandler,
  updateWebhookHandler,
};
