/**
 * Profile Controller
 *
 * Handles profile management (name, status, picture),
 * block/unblock contacts, and status/stories.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { getSession } from '../services/whatsappService';
import { Session } from '../models/Session';
import { prepareMediaBuffer } from '../lib/mediaUtils';

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

// ========================================
// PROFILE NAME
// ========================================

interface UpdateNameBody {
  name: string;
}

/**
 * Update profile name
 * PUT /session/:sessionId/profile/name
 */
export async function updateProfileNameHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: UpdateNameBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { name } = request.body;
    const user = request.user!;

    if (!name) {
      reply.status(400).send({ success: false, error: 'Missing name' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    await socket.updateProfileName(name);

    reply.send({ success: true, data: { name } });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// PROFILE STATUS
// ========================================

interface UpdateStatusBody {
  status: string;
}

/**
 * Update profile status (about)
 * PUT /session/:sessionId/profile/status
 */
export async function updateProfileStatusHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: UpdateStatusBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { status } = request.body;
    const user = request.user!;

    if (!status) {
      reply.status(400).send({ success: false, error: 'Missing status' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    await socket.updateProfileStatus(status);

    reply.send({ success: true, data: { status } });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// PROFILE PICTURE
// ========================================

interface UpdatePictureBody {
  image: string;
}

/**
 * Update profile picture
 * PUT /session/:sessionId/profile/picture
 */
export async function updateProfilePictureHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: UpdatePictureBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
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
    const { buffer } = await prepareMediaBuffer(image);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await socket.updateProfilePicture(socket.user?.id ?? '', { url: buffer } as any);

    reply.send({ success: true, message: 'Profile picture updated' });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Remove profile picture
 * DELETE /session/:sessionId/profile/picture
 */
export async function removeProfilePictureHandler(
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
    await socket.removeProfilePicture(socket.user?.id ?? '');

    reply.send({ success: true, message: 'Profile picture removed' });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// GET PROFILE PICTURE URL
// ========================================

interface ProfilePictureParams {
  sessionId: string;
  jid: string;
}

/**
 * Get profile picture URL for a JID
 * GET /session/:sessionId/profile-picture/:jid
 */
export async function getProfilePictureHandler(
  request: FastifyRequest<{ Params: ProfilePictureParams }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId, jid } = request.params;
    const user = request.user!;

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const targetJid = formatJid(jid);
    const url = await socket.profilePictureUrl(targetJid, 'image');

    reply.send({ success: true, data: { jid: targetJid, url: url ?? null } });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// BLOCK / UNBLOCK
// ========================================

interface BlockBody {
  jid: string;
}

/**
 * Block a contact
 * POST /session/:sessionId/block
 */
export async function blockContactHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: BlockBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { jid } = request.body;
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
    await socket.updateBlockStatus(targetJid, 'block');

    reply.send({ success: true, data: { jid: targetJid, blocked: true } });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Unblock a contact
 * POST /session/:sessionId/unblock
 */
export async function unblockContactHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: BlockBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { jid } = request.body;
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
    await socket.updateBlockStatus(targetJid, 'unblock');

    reply.send({ success: true, data: { jid: targetJid, blocked: false } });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ========================================
// STATUS / STORIES
// ========================================

interface SendStatusBody {
  text: string;
  backgroundColor?: string;
  font?: number;
  recipients?: string[];
}

interface SendStatusMediaBody {
  type: 'image' | 'video';
  media: string;
  caption?: string;
  recipients?: string[];
}

/**
 * Send a text status/story
 * POST /session/:sessionId/status
 */
export async function sendStatusHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: SendStatusBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { text, backgroundColor, font, recipients } = request.body;
    const user = request.user!;

    if (!text) {
      reply.status(400).send({ success: false, error: 'Missing text' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content: any = {
      text,
      backgroundColor: backgroundColor ?? '#0b1015',
      font: font ?? 0,
    };

    if (recipients && recipients.length > 0) {
      content.statusJidList = recipients.map((r) => formatJid(r));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgResult = await socket.sendMessage('status@broadcast', content as any);

    reply.send({
      success: true,
      data: { statusId: msgResult?.key?.id ?? undefined, text, recipients: recipients?.length ?? 0 },
    });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Send a media status/story (image or video)
 * POST /session/:sessionId/status/media
 */
export async function sendStatusMediaHandler(
  request: FastifyRequest<{ Params: SessionParams; Body: SendStatusMediaBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { sessionId } = request.params;
    const { type, media, caption, recipients } = request.body;
    const user = request.user!;

    if (!media) {
      reply.status(400).send({ success: false, error: 'Missing media (base64 or URL)' });
      return;
    }

    if (!type || !['image', 'video'].includes(type)) {
      reply.status(400).send({ success: false, error: 'type must be "image" or "video"' });
      return;
    }

    const result = await verifySession(sessionId, user.id);
    if ('error' in result) {
      reply.status(400).send({ success: false, error: result.error });
      return;
    }

    const { socket } = result;
    const { buffer, mimetype } = await prepareMediaBuffer(media);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content: any = {
      [type]: buffer,
      mimetype,
      caption: caption ?? '',
    };

    if (recipients && recipients.length > 0) {
      content.statusJidList = recipients.map((r) => formatJid(r));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgResult = await socket.sendMessage('status@broadcast', content as any);

    reply.send({
      success: true,
      data: {
        statusId: msgResult?.key?.id ?? undefined,
        type,
        caption: caption ?? '',
        recipients: recipients?.length ?? 0,
      },
    });
  } catch (error) {
    reply.status(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

export default {
  updateProfileNameHandler,
  updateProfileStatusHandler,
  updateProfilePictureHandler,
  removeProfilePictureHandler,
  getProfilePictureHandler,
  blockContactHandler,
  unblockContactHandler,
  sendStatusHandler,
  sendStatusMediaHandler,
};

export { formatJid as formatProfileJid };
