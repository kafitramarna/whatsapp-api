/**
 * Group & Broadcast Controller
 * 
 * Handles group management, send to group, and broadcast endpoints
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { getSession } from '../services/whatsappService';
import { Session } from '../models/Session';
import { sessionStore } from '../services/sessionStore';
import { prepareMediaBuffer, buildMediaContent, type MediaItem } from '../lib/mediaUtils';

// Types
interface SessionParams {
  sessionId: string;
}

interface SendToGroupBody {
  groupId: string;
  message?: string;
  replyTo?: string;
  media?: MediaItem[];
}

interface BroadcastBody {
  recipients: string[];
  message?: string;
  media?: MediaItem[];
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

interface MentionBody {
  message: string;
  mentioned: string[]; // array of JIDs to mention
}

interface UpdateWebhookBody {
  webhook_url?: string | null;
  webhook_secret?: string | null;
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
    const { groupId, message, media, replyTo } = request.body;
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

    // Build quoted message if replyTo is provided
    const quoted = replyTo ? {
      key: { remoteJid: jid, id: replyTo, fromMe: false },
      message: { conversation: '' },
    } : undefined;

    if (message) {
      const textContent: Record<string, unknown> = { text: message };
      if (quoted) textContent.quoted = quoted;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const textResult = await socket.sendMessage(jid, textContent as any);
      results.push({ type: 'text', messageId: textResult?.key?.id ?? undefined });
    }

    if (media && media.length > 0) {
      for (const item of media) {
        const { buffer, mimetype } = await prepareMediaBuffer(item.data);
        const content = buildMediaContent(item.type, buffer, item.mimetype || mimetype, item.caption, item.filename, item.isAnimated, item.viewOnce, item.ptt, item.quality);
        if (quoted) (content as Record<string, unknown>).quoted = quoted;
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
        const content = buildMediaContent(item.type, buffer, item.mimetype || mimetype, item.caption, item.filename, item.isAnimated, item.viewOnce, item.ptt, item.quality);
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
    const { webhook_url, webhook_secret } = request.body;
    const user = request.user!;

    const session = await Session.findOne({
      where: { session_id: sessionId, user_id: user.id },
    });

    if (!session) {
      reply.status(404).send({ success: false, error: 'Session not found' });
      return;
    }

    session.webhook_url = webhook_url || '';
    if (webhook_secret !== undefined) {
      session.webhook_secret = webhook_secret || '';
    }
    await session.save();

    const runtime = sessionStore.get(sessionId);
    
    if (runtime) {
      runtime.webhookUrl = session.webhook_url;
      runtime.webhookSecret = session.webhook_secret || undefined;
    }

    reply.send({
      success: true,
      data: {
        session_id: sessionId,
        webhook_url: session.webhook_url,
        webhook_secret: session.webhook_secret ? '****' : null,
      },
    });
  } catch (error) {
    console.error('[Controller] Update webhook error:', error);
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// MENTIONS
// ========================================

/**
 * Send message with mentions to a group
 * POST /session/:sessionId/groups/:groupId/mention
 */
export async function mentionHandler(
  request: FastifyRequest<{ Params: GroupParams; Body: MentionBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId, groupId } = request.params;
    const { message, mentioned } = request.body;
    const user = request.user!;

    if (!message) {
      reply.status(400).send({ success: false, error: 'Missing message' });
      return;
    }

    if (!mentioned || mentioned.length === 0) {
      reply.status(400).send({ success: false, error: 'Missing mentioned array' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`;

    // Build mention text with @ mentions
    const mentionText = mentioned.map((m) => `@${m.split('@')[0]}`).join(' ');
    const fullMessage = `${mentionText} ${message}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgResult = await socket.sendMessage(jid, {
      text: fullMessage,
      mentions: mentioned,
    } as any);

    reply.send({
      success: true,
      data: {
        groupId: jid,
        messageId: msgResult?.key?.id ?? undefined,
        mentioned,
      },
    });
  } catch (error) {
    console.error('[Controller] Mention error:', error);
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// PROMOTE / DEMOTE
// ========================================

/**
 * Promote participants to admin
 * POST /session/:sessionId/groups/:groupId/promote
 */
export async function promoteHandler(
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

    const promoteResult = await socket.groupParticipantsUpdate(jid, jids, 'promote');

    reply.send({ success: true, data: promoteResult });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Demote participants from admin
 * POST /session/:sessionId/groups/:groupId/demote
 */
export async function demoteHandler(
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

    const demoteResult = await socket.groupParticipantsUpdate(jid, jids, 'demote');

    reply.send({ success: true, data: demoteResult });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// GROUP SETTINGS
// ========================================

interface GroupSettingsBody {
  setting: 'announcement' | 'unlocked' | 'locked';
}

/**
 * Update group settings (announcement, locked, unlocked)
 * PUT /session/:sessionId/groups/:groupId/settings
 */
export async function updateGroupSettingsHandler(
  request: FastifyRequest<{ Params: GroupParams; Body: GroupSettingsBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId, groupId } = request.params;
    const { setting } = request.body;
    const user = request.user!;

    if (!setting || !['announcement', 'unlocked', 'locked'].includes(setting)) {
      reply.status(400).send({ success: false, error: 'setting must be "announcement", "unlocked", or "locked"' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`;

    await socket.groupSettingUpdate(jid, setting);

    reply.send({ success: true, data: { groupId: jid, setting } });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// GROUP SUBJECT & DESCRIPTION
// ========================================

interface GroupSubjectBody {
  subject: string;
}

interface GroupDescriptionBody {
  description: string;
}

/**
 * Update group subject (name)
 * PUT /session/:sessionId/groups/:groupId/subject
 */
export async function updateGroupSubjectHandler(
  request: FastifyRequest<{ Params: GroupParams; Body: GroupSubjectBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId, groupId } = request.params;
    const { subject } = request.body;
    const user = request.user!;

    if (!subject) {
      reply.status(400).send({ success: false, error: 'Missing subject' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`;

    await socket.groupUpdateSubject(jid, subject);

    reply.send({ success: true, data: { groupId: jid, subject } });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Update group description
 * PUT /session/:sessionId/groups/:groupId/description
 */
export async function updateGroupDescriptionHandler(
  request: FastifyRequest<{ Params: GroupParams; Body: GroupDescriptionBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId, groupId } = request.params;
    const { description } = request.body;
    const user = request.user!;

    if (description === undefined || description === null) {
      reply.status(400).send({ success: false, error: 'Missing description' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`;

    await socket.groupUpdateDescription(jid, description);

    reply.send({ success: true, data: { groupId: jid, description } });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// INVITE LINK MANAGEMENT
// ========================================

/**
 * Get group invite link/code
 * GET /session/:sessionId/groups/:groupId/invite
 */
export async function getInviteLinkHandler(
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
    const code = await socket.groupInviteCode(jid);

    reply.send({
      success: true,
      data: { groupId: jid, code, inviteLink: `https://chat.whatsapp.com/${code}` },
    });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Revoke group invite link
 * POST /session/:sessionId/groups/:groupId/invite/revoke
 */
export async function revokeInviteLinkHandler(
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
    const newCode = await socket.groupRevokeInvite(jid);

    reply.send({
      success: true,
      data: { groupId: jid, code: newCode, inviteLink: `https://chat.whatsapp.com/${newCode}` },
    });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// GROUP PICTURE
// ========================================

interface GroupPictureBody {
  image: string;
}

/**
 * Update group profile picture
 * PUT /session/:sessionId/groups/:groupId/picture
 */
export async function updateGroupPictureHandler(
  request: FastifyRequest<{ Params: GroupParams; Body: GroupPictureBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId, groupId } = request.params;
    const { image } = request.body;
    const user = request.user!;

    if (!image) {
      reply.status(400).send({ success: false, error: 'Missing image (base64 or URL)' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
    const { buffer } = await prepareMediaBuffer(image);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await socket.updateProfilePicture(jid, { url: buffer } as any);

    reply.send({ success: true, message: 'Group picture updated' });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Remove group profile picture
 * DELETE /session/:sessionId/groups/:groupId/picture
 */
export async function removeGroupPictureHandler(
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
    await socket.removeProfilePicture(jid);

    reply.send({ success: true, message: 'Group picture removed' });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// GROUP EPHEMERAL
// ========================================

interface GroupEphemeralBody {
  duration: number;
}

/**
 * Set group ephemeral/disappearing messages
 * PUT /session/:sessionId/groups/:groupId/ephemeral
 */
export async function updateGroupEphemeralHandler(
  request: FastifyRequest<{ Params: GroupParams; Body: GroupEphemeralBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId, groupId } = request.params;
    const { duration } = request.body;
    const user = request.user!;

    if (duration === undefined || duration < 0) {
      reply.status(400).send({ success: false, error: 'Missing or invalid duration (0=off, 86400=24h, 604800=7d)' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
    await socket.groupToggleEphemeral(jid, duration);

    reply.send({ success: true, data: { groupId: jid, duration } });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// GROUP ADD MODE & JOIN APPROVAL
// ========================================

interface GroupAddModeBody {
  mode: 'admin_add' | 'all_member_add';
}

/**
 * Set group member add mode
 * PUT /session/:sessionId/groups/:groupId/add-mode
 */
export async function updateGroupAddModeHandler(
  request: FastifyRequest<{ Params: GroupParams; Body: GroupAddModeBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId, groupId } = request.params;
    const { mode } = request.body;
    const user = request.user!;

    if (!mode || !['admin_add', 'all_member_add'].includes(mode)) {
      reply.status(400).send({ success: false, error: 'mode must be "admin_add" or "all_member_add"' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
    await socket.groupMemberAddMode(jid, mode);

    reply.send({ success: true, data: { groupId: jid, addMode: mode } });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

interface GroupJoinApprovalBody {
  mode: 'on' | 'off';
}

/**
 * Set group join approval mode
 * PUT /session/:sessionId/groups/:groupId/join-approval
 */
export async function updateGroupJoinApprovalHandler(
  request: FastifyRequest<{ Params: GroupParams; Body: GroupJoinApprovalBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId, groupId } = request.params;
    const { mode } = request.body;
    const user = request.user!;

    if (!mode || !['on', 'off'].includes(mode)) {
      reply.status(400).send({ success: false, error: 'mode must be "on" or "off"' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const jid = groupId.includes('@') ? groupId : `${groupId}@g.us`;
    await socket.groupJoinApprovalMode(jid, mode);

    reply.send({ success: true, data: { groupId: jid, joinApproval: mode } });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// GROUP JOIN REQUESTS
// ========================================

/**
 * List pending group join requests
 * GET /session/:sessionId/groups/:groupId/requests
 */
export async function listGroupRequestsHandler(
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
    const requests = await socket.groupRequestParticipantsList(jid);

    reply.send({ success: true, data: { groupId: jid, requests } });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

interface HandleGroupRequestBody {
  participants: string[];
  action: 'approve' | 'reject';
}

/**
 * Approve or reject group join requests
 * POST /session/:sessionId/groups/:groupId/requests
 */
export async function handleGroupRequestHandler(
  request: FastifyRequest<{ Params: GroupParams; Body: HandleGroupRequestBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId, groupId } = request.params;
    const { participants, action } = request.body;
    const user = request.user!;

    if (!participants || participants.length === 0) {
      reply.status(400).send({ success: false, error: 'Participants required' });
      return;
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      reply.status(400).send({ success: false, error: 'action must be "approve" or "reject"' });
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

    const updateResult = await socket.groupRequestParticipantsUpdate(jid, jids, action);

    reply.send({ success: true, data: { groupId: jid, action, result: updateResult } });
  } catch (error) {
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
  mentionHandler,
  promoteHandler,
  demoteHandler,
  updateGroupSettingsHandler,
  updateGroupSubjectHandler,
  updateGroupDescriptionHandler,
  getInviteLinkHandler,
  revokeInviteLinkHandler,
  updateGroupPictureHandler,
  removeGroupPictureHandler,
  updateGroupEphemeralHandler,
  updateGroupAddModeHandler,
  updateGroupJoinApprovalHandler,
  listGroupRequestsHandler,
  handleGroupRequestHandler,
};
