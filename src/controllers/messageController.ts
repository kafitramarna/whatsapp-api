/**
 * Message Controller
 *
 * Handles special message types: reaction, poll, location, contact card,
 * delete message, and check number endpoints.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { getSession } from '../services/whatsappService';
import { Session } from '../models/Session';

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

export default {
  reactHandler,
  sendPollHandler,
  sendLocationHandler,
  sendContactHandler,
  deleteMessageHandler,
  checkNumberHandler,
  acceptInviteHandler,
  getInviteInfoHandler,
};

export { buildVCard, formatJid, formatGroupJid };
