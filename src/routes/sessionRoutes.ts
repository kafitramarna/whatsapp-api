/**
 * Session Routes
 * 
 * All routes for WhatsApp session management
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { apiKeyAuth } from '../middleware/apiKeyAuth';
import {
  createSessionHandler,
  getSessionStatusHandler,
  getQrCodeHandler,
  deleteSessionHandler,
  listSessionsHandler,
  sendMessageHandler,
  markReadHandler,
  sendPresenceHandler,
} from '../controllers/sessionController';
import {
  sendToGroupHandler,
  broadcastHandler,
  listGroupsHandler,
  createGroupHandler,
  getGroupInfoHandler,
  addGroupParticipantsHandler,
  removeGroupParticipantsHandler,
  leaveGroupHandler,
  updateWebhookHandler,
} from '../controllers/groupController';
import {
  createScheduledHandler,
  listScheduledHandler,
  getScheduledHandler,
  cancelScheduledHandler,
  historyScheduledHandler,
} from '../controllers/scheduleController';
import { 
  SessionSchemas, 
  MessagingSchemas, 
  ScheduledSchemas, 
  GroupSchemas 
} from '../config/routeSchemas';

/**
 * Register session routes
 */
export async function sessionRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
): Promise<void> {
  // Apply API key authentication to all routes in this plugin
  fastify.addHook('preHandler', apiKeyAuth);

  // ========================================
  // SESSION MANAGEMENT
  // ========================================

  // Create new session
  fastify.post('/session/create', { schema: SessionSchemas.create }, createSessionHandler);

  // List all sessions
  fastify.get('/sessions', { schema: SessionSchemas.list }, listSessionsHandler);

  // Get session status
  fastify.get('/session/:sessionId/status', { schema: SessionSchemas.status }, getSessionStatusHandler);

  // Get QR code
  fastify.get('/session/:sessionId/qr', { schema: SessionSchemas.qr }, getQrCodeHandler);

  // Delete session
  fastify.delete('/session/:sessionId', { schema: SessionSchemas.delete }, deleteSessionHandler);

  // Update webhook URL
  fastify.put('/session/:sessionId/webhook', { schema: SessionSchemas.updateWebhook }, updateWebhookHandler);

  // ========================================
  // MESSAGING
  // ========================================

  // Send message (text and/or media) to individual
  fastify.post('/session/:sessionId/send', { schema: MessagingSchemas.send }, sendMessageHandler);
  fastify.post('/session/:sessionId/read', { schema: MessagingSchemas.read }, markReadHandler);
  fastify.post('/session/:sessionId/presence', { schema: MessagingSchemas.presence }, sendPresenceHandler);

  // Send message to group
  fastify.post('/session/:sessionId/send-group', { schema: MessagingSchemas.sendGroup }, sendToGroupHandler);

  // Broadcast to multiple recipients
  fastify.post('/session/:sessionId/broadcast', { schema: MessagingSchemas.broadcast }, broadcastHandler);

  // ========================================
  // SCHEDULED MESSAGES
  // ========================================

  // Create scheduled message
  fastify.post('/session/:sessionId/schedule', { schema: ScheduledSchemas.create }, createScheduledHandler);

  // List pending scheduled messages
  fastify.get('/session/:sessionId/schedule', { schema: ScheduledSchemas.list }, listScheduledHandler);

  // Get scheduled message history
  fastify.get('/session/:sessionId/schedule/history', { schema: ScheduledSchemas.history }, historyScheduledHandler);

  // Get specific scheduled message
  fastify.get('/session/:sessionId/schedule/:messageId', { schema: ScheduledSchemas.get }, getScheduledHandler);

  // Cancel scheduled message
  fastify.delete('/session/:sessionId/schedule/:messageId', { schema: ScheduledSchemas.cancel }, cancelScheduledHandler);

  // ========================================
  // GROUP MANAGEMENT
  // ========================================

  // List all groups
  fastify.get('/session/:sessionId/groups', { schema: GroupSchemas.list }, listGroupsHandler);

  // Create new group
  fastify.post('/session/:sessionId/groups', { schema: GroupSchemas.create }, createGroupHandler);

  // Get group info
  fastify.get('/session/:sessionId/groups/:groupId', { schema: GroupSchemas.info }, getGroupInfoHandler);

  // Add participants to group
  fastify.post('/session/:sessionId/groups/:groupId/add', { schema: GroupSchemas.addParticipants }, addGroupParticipantsHandler);

  // Remove participants from group
  fastify.post('/session/:sessionId/groups/:groupId/remove', { schema: GroupSchemas.removeParticipants }, removeGroupParticipantsHandler);

  // Leave group
  fastify.delete('/session/:sessionId/groups/:groupId', { schema: GroupSchemas.leave }, leaveGroupHandler);
}

export default sessionRoutes;
