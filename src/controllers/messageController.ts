/**
 * Message Controller
 *
 * Handles special message types: reaction, poll, location, contact card,
 * delete message, and check number endpoints.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { getSession } from '../services/whatsappService';
import { Session } from '../models/Session';
import { getMessage } from '../services/messageStore';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

interface SessionParams {
  sessionId: string;
}

async function verifySession(sessionId: string, userId: string) {
  const session = await Session.findOne({
    where: { session_id: sessionId, user_id: userId },
  });
  if (!session) return { error: 'Session not found' };

  const socket = getSession(sessionId);
  if (!socket || !socket.user) return { error: 'Session not connected' };

  return { session, socket };
}

function formatJid(to: string): string {
  return to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
}

function formatGroupJid(groupId: string): string {
  return groupId.includes('@') ? groupId : `${groupId}@g.us`;
}

// ========================================
// REACTION
// ========================================

interface ReactBody {
  to: string;
  messageId: string;
  emoji: string;
}

/**
 * React to a message with an emoji
 * POST /session/:sessionId/react
 */
export async function reactHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: ReactBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { to, messageId, emoji } = request.body;
    const user = request.user!;

    if (!to || !messageId || !emoji) {
      reply.status(400).send({ success: false, error: 'Missing to, messageId, or emoji' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const jid = formatJid(to);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgResult = await socket.sendMessage(jid, {
      react: {
        text: emoji,
        key: { remoteJid: jid, id: messageId, fromMe: false },
      },
    } as any);

    reply.send({
      success: true,
      data: { to: jid, messageId, emoji, reactionId: msgResult?.key?.id ?? undefined },
    });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// POLL
// ========================================

interface SendPollBody {
  to: string;
  name: string;
  options: string[];
  selectableCount?: number;
}

/**
 * Send a poll message
 * POST /session/:sessionId/send-poll
 */
export async function sendPollHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: SendPollBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { to, name, options, selectableCount } = request.body;
    const user = request.user!;

    if (!to || !name || !options || options.length < 2) {
      reply.status(400).send({ success: false, error: 'Missing to, name, or options (min 2)' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const jid = formatJid(to);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgResult = await socket.sendMessage(jid, {
      poll: {
        name,
        values: options,
        selectableCount: selectableCount ?? 1,
        toJid: jid,
      },
    } as any);

    reply.send({
      success: true,
      data: { to: jid, pollName: name, options, messageId: msgResult?.key?.id ?? undefined },
    });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// LOCATION
// ========================================

interface SendLocationBody {
  to: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

/**
 * Send a location message
 * POST /session/:sessionId/send-location
 */
export async function sendLocationHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: SendLocationBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { to, latitude, longitude, name, address } = request.body;
    const user = request.user!;

    if (!to || latitude === undefined || longitude === undefined) {
      reply.status(400).send({ success: false, error: 'Missing to, latitude, or longitude' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const jid = formatJid(to);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgResult = await socket.sendMessage(jid, {
      location: {
        degreesLatitude: latitude,
        degreesLongitude: longitude,
        name: name || '',
        address: address || '',
      },
    } as any);

    reply.send({
      success: true,
      data: { to: jid, latitude, longitude, name, address, messageId: msgResult?.key?.id ?? undefined },
    });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// CONTACT CARD (vCard)
// ========================================

interface SendContactBody {
  to: string;
  name: string;
  phoneNumber: string;
  organization?: string;
}

function buildVCard(name: string, phoneNumber: string, organization?: string): string {
  let vcard = 'BEGIN:VCARD\nVERSION:3.0\n';
  vcard += `FN:${name}\n`;
  if (organization) {
    vcard += `ORG:${organization}\n`;
  }
  vcard += `TEL;type=CELL;waid=${phoneNumber.replace(/[^0-9]/g, '')}:${phoneNumber}\n`;
  vcard += 'END:VCARD';
  return vcard;
}

/**
 * Send a contact card (vCard)
 * POST /session/:sessionId/send-contact
 */
export async function sendContactHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: SendContactBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { to, name, phoneNumber, organization } = request.body;
    const user = request.user!;

    if (!to || !name || !phoneNumber) {
      reply.status(400).send({ success: false, error: 'Missing to, name, or phoneNumber' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const jid = formatJid(to);
    const vcard = buildVCard(name, phoneNumber, organization);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgResult = await socket.sendMessage(jid, {
      contacts: {
        displayName: name,
        contacts: [{ vcard }],
      },
    } as any);

    reply.send({
      success: true,
      data: { to: jid, contactName: name, phoneNumber, messageId: msgResult?.key?.id ?? undefined },
    });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// DELETE MESSAGE
// ========================================

interface DeleteMessageBody {
  to: string;
  messageId: string;
  deleteFor: 'me' | 'everyone';
}

/**
 * Delete a message (for me or for everyone)
 * DELETE /session/:sessionId/message
 */
export async function deleteMessageHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: DeleteMessageBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { to, messageId, deleteFor } = request.body;
    const user = request.user!;

    if (!to || !messageId) {
      reply.status(400).send({ success: false, error: 'Missing to or messageId' });
      return;
    }

    if (deleteFor !== 'me' && deleteFor !== 'everyone') {
      reply.status(400).send({ success: false, error: 'deleteFor must be "me" or "everyone"' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const jid = formatJid(to);

    if (deleteFor === 'everyone') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await socket.sendMessage(jid, {
        delete: { remoteJid: jid, id: messageId, fromMe: true },
      } as any);
    } else {
      // Delete for me — clear message from chat
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await socket.chatModify({
        clear: { messages: [{ id: messageId, fromMe: true }] },
      } as any, jid);
    }

    reply.send({
      success: true,
      data: { to: jid, messageId, deletedFor: deleteFor },
    });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// CHECK NUMBER
// ========================================

interface CheckNumberBody {
  phoneNumber: string;
}

/**
 * Check if a phone number is registered on WhatsApp
 * POST /session/:sessionId/check-number
 */
export async function checkNumberHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: CheckNumberBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { phoneNumber } = request.body;
    const user = request.user!;

    if (!phoneNumber) {
      reply.status(400).send({ success: false, error: 'Missing phoneNumber' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    const onWhatsApp = await socket.onWhatsApp(cleanPhone);

    const isRegistered = Array.isArray(onWhatsApp) && onWhatsApp.length > 0 && onWhatsApp[0]?.exists === true;
    const jid = onWhatsApp?.[0]?.jid ?? `${cleanPhone}@s.whatsapp.net`;

    reply.send({
      success: true,
      data: { phoneNumber: cleanPhone, isRegistered, jid: isRegistered ? jid : null },
    });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// INVITE LINK — accept & info (session-level)
// ========================================

interface AcceptInviteBody {
  code: string;
}

/**
 * Accept a group invite code
 * POST /session/:sessionId/accept-invite
 */
export async function acceptInviteHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: AcceptInviteBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { code } = request.body;
    const user = request.user!;

    if (!code) {
      reply.status(400).send({ success: false, error: 'Missing invite code' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const groupId = await socket.groupAcceptInvite(code);

    reply.send({
      success: true,
      data: { code, groupId },
    });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Get info about an invite code
 * POST /session/:sessionId/invite-info
 */
export async function getInviteInfoHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: AcceptInviteBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { code } = request.body;
    const user = request.user!;

    if (!code) {
      reply.status(400).send({ success: false, error: 'Missing invite code' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const info = await socket.groupGetInviteInfo(code);

    reply.send({
      success: true,
      data: {
        id: info.id,
        subject: info.subject,
        desc: info.desc || null,
        participants: info.participants?.map((p) => ({ id: p.id, admin: p.admin || null })) ?? [],
      },
    });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// MEDIA DOWNLOAD
// ========================================

interface DownloadMediaBody {
  messageId: string;
  jid: string;
}

/**
 * Download media from an incoming message
 * POST /session/:sessionId/media/download
 */
export async function downloadMediaHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: DownloadMediaBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { messageId, jid } = request.body;
    const user = request.user!;

    if (!messageId || !jid) {
      reply.status(400).send({ success: false, error: 'Missing messageId or jid' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    // socket not needed — downloadMediaMessage uses the stored message directly
    const stored = getMessage(sessionId, messageId);

    if (!stored) {
      reply.status(404).send({ success: false, error: 'Message not found in store' });
      return;
    }

    if (!stored.message) {
      reply.status(400).send({ success: false, error: 'Message has no media content' });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await downloadMediaMessage(stored as any, 'buffer', {});

    // Determine mimetype from message content
    let mimetype = 'application/octet-stream';
    if (stored.message?.imageMessage?.mimetype) mimetype = stored.message.imageMessage.mimetype;
    else if (stored.message?.videoMessage?.mimetype) mimetype = stored.message.videoMessage.mimetype;
    else if (stored.message?.audioMessage?.mimetype) mimetype = stored.message.audioMessage.mimetype;
    else if (stored.message?.documentMessage?.mimetype) mimetype = stored.message.documentMessage.mimetype;
    else if (stored.message?.stickerMessage?.mimetype) mimetype = stored.message.stickerMessage.mimetype;

    reply.send({
      success: true,
      data: {
        messageId,
        mimetype,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        base64: (buffer as any).toString('base64'),
        size: (buffer as Uint8Array).length,
      },
    });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// FORWARD MESSAGE
// ========================================

interface ForwardBody {
  to: string;
  messageId: string;
  fromJid: string;
}

/**
 * Forward a message to another chat
 * POST /session/:sessionId/forward
 */
export async function forwardHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: ForwardBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { to, messageId, fromJid } = request.body;
    const user = request.user!;

    if (!to || !messageId || !fromJid) {
      reply.status(400).send({ success: false, error: 'Missing to, messageId, or fromJid' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const stored = getMessage(sessionId, messageId);

    if (!stored) {
      reply.status(404).send({ success: false, error: 'Message not found in store' });
      return;
    }

    const targetJid = formatJid(to);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgResult = await socket.sendMessage(targetJid, {
      forward: {
        key: stored.key,
        message: stored.message,
      },
    } as any);

    reply.send({
      success: true,
      data: { to: targetJid, forwardedMessageId: msgResult?.key?.id ?? undefined },
    });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// EDIT MESSAGE
// ========================================

interface EditMessageBody {
  to: string;
  messageId: string;
  text: string;
}

/**
 * Edit a sent message
 * PUT /session/:sessionId/message
 */
export async function editMessageHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: EditMessageBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { to, messageId, text } = request.body;
    const user = request.user!;

    if (!to || !messageId || !text) {
      reply.status(400).send({ success: false, error: 'Missing to, messageId, or text' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const jid = formatJid(to);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgResult = await socket.sendMessage(jid, {
      text,
      edit: { remoteJid: jid, id: messageId, fromMe: true },
    } as any);

    reply.send({
      success: true,
      data: { to: jid, messageId, editedMessageId: msgResult?.key?.id ?? undefined },
    });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// PIN MESSAGE
// ========================================

interface PinMessageBody {
  jid: string;
  pin: boolean;
}

/**
 * Pin or unpin a chat
 * POST /session/:sessionId/message/pin
 */
export async function pinMessageHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: PinMessageBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { jid, pin } = request.body;
    const user = request.user!;

    if (!jid) {
      reply.status(400).send({ success: false, error: 'Missing jid' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const targetJid = formatJid(jid);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await socket.chatModify({ pin } as any, targetJid);

    reply.send({ success: true, data: { jid: targetJid, pinned: pin } });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// STAR MESSAGE
// ========================================

interface StarMessageBody {
  jid: string;
  messageId: string;
  star: boolean;
}

/**
 * Star or unstar a message
 * POST /session/:sessionId/message/star
 */
export async function starMessageHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: StarMessageBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { jid, messageId, star } = request.body;
    const user = request.user!;

    if (!jid || !messageId) {
      reply.status(400).send({ success: false, error: 'Missing jid or messageId' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const targetJid = formatJid(jid);

    await socket.star(targetJid, [{ id: messageId, fromMe: true }], star);

    reply.send({ success: true, data: { jid: targetJid, messageId, starred: star } });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// DISAPPEARING MESSAGES
// ========================================

interface DisappearingBody {
  duration: number;
}

/**
 * Set disappearing messages in a chat
 * PUT /session/:sessionId/chat/:jid/disappearing
 */
export async function updateDisappearingHandler(
  request: FastifyRequest<{ Params: SessionParams & { jid: string }; Body: DisappearingBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId, jid } = request.params;
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
    const targetJid = formatJid(jid);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await socket.chatModify({ ephemeralExpiration: duration } as any, targetJid);

    reply.send({ success: true, data: { jid: targetJid, duration } });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// CHAT OPERATIONS
// ========================================

interface ChatModifyBody {
  action: 'archive' | 'unarchive' | 'mute' | 'unmute' | 'pin' | 'unpin' | 'clear' | 'delete' | 'markRead';
  duration?: number;
}

/**
 * Modify chat state (archive, mute, pin, clear, delete, markRead)
 * PUT /session/:sessionId/chat/:jid/modify
 */
export async function chatModifyHandler(
  request: FastifyRequest<{ Params: SessionParams & { jid: string }; Body: ChatModifyBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId, jid } = request.params;
    const { action, duration } = request.body;
    const user = request.user!;

    const validActions = ['archive', 'unarchive', 'mute', 'unmute', 'pin', 'unpin', 'clear', 'delete', 'markRead'];
    if (!action || !validActions.includes(action)) {
      reply.status(400).send({ success: false, error: `action must be one of: ${validActions.join(', ')}` });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const targetJid = formatJid(jid);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mod: any;
    switch (action) {
      case 'archive':
        mod = { archive: true, lastMessages: [] };
        break;
      case 'unarchive':
        mod = { archive: false, lastMessages: [] };
        break;
      case 'mute':
        mod = { mute: duration ?? 86400 };
        break;
      case 'unmute':
        mod = { mute: null };
        break;
      case 'pin':
        mod = { pin: true };
        break;
      case 'unpin':
        mod = { pin: false };
        break;
      case 'clear':
        mod = { clear: true, lastMessages: [] };
        break;
      case 'delete':
        mod = { delete: true, lastMessages: [] };
        break;
      case 'markRead':
        mod = { markRead: true, lastMessages: [] };
        break;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await socket.chatModify(mod as any, targetJid);

    reply.send({ success: true, data: { jid: targetJid, action } });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

export default {
  reactHandler,
  sendPollHandler,
  sendLocationHandler,
  sendContactHandler,
  deleteMessageHandler,
  checkNumberHandler,
  acceptInviteHandler,
  getInviteInfoHandler,
  downloadMediaHandler,
  forwardHandler,
  editMessageHandler,
  pinMessageHandler,
  starMessageHandler,
  updateDisappearingHandler,
  chatModifyHandler,
};

export { buildVCard, formatJid, formatGroupJid };
