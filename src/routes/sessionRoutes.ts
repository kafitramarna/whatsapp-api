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
  mentionHandler,
  promoteHandler,
  demoteHandler,
  updateGroupSettingsHandler,
  updateGroupSubjectHandler,
  updateGroupDescriptionHandler,
  getInviteLinkHandler,
  revokeInviteLinkHandler,
} from '../controllers/groupController';
import {
  reactHandler,
  sendPollHandler,
  sendLocationHandler,
  sendContactHandler,
  deleteMessageHandler,
  checkNumberHandler,
  acceptInviteHandler,
  getInviteInfoHandler,
} from '../controllers/messageController';
import {
  listWebhookEndpointsHandler,
  createWebhookEndpointHandler,
  updateWebhookEndpointHandler,
  deleteWebhookEndpointHandler,
  testWebhookHandler,
  listWebhookLogsHandler,
  retryWebhookLogHandler,
  updateWebhookEventsHandler,
} from '../controllers/webhookController';
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
  GroupSchemas,
  WebhookSchemas,
  MessageSchemas,
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

  // Mention users in group
  fastify.post('/session/:sessionId/groups/:groupId/mention', { schema: GroupSchemas.mention }, mentionHandler);

  // Promote participants to admin
  fastify.post('/session/:sessionId/groups/:groupId/promote', { schema: GroupSchemas.promote }, promoteHandler);

  // Demote participants from admin
  fastify.post('/session/:sessionId/groups/:groupId/demote', { schema: GroupSchemas.demote }, demoteHandler);

  // Update group settings
  fastify.put('/session/:sessionId/groups/:groupId/settings', { schema: GroupSchemas.settings }, updateGroupSettingsHandler);

  // Update group subject
  fastify.put('/session/:sessionId/groups/:groupId/subject', { schema: GroupSchemas.subject }, updateGroupSubjectHandler);

  // Update group description
  fastify.put('/session/:sessionId/groups/:groupId/description', { schema: GroupSchemas.description }, updateGroupDescriptionHandler);

  // Get group invite link
  fastify.get('/session/:sessionId/groups/:groupId/invite', { schema: GroupSchemas.getInvite }, getInviteLinkHandler);

  // Revoke group invite link
  fastify.post('/session/:sessionId/groups/:groupId/invite/revoke', { schema: GroupSchemas.revokeInvite }, revokeInviteLinkHandler);

  // ========================================
  // SPECIAL MESSAGE TYPES
  // ========================================

  // React to a message
  fastify.post('/session/:sessionId/react', { schema: MessageSchemas.react }, reactHandler);

  // Send poll
  fastify.post('/session/:sessionId/send-poll', { schema: MessageSchemas.sendPoll }, sendPollHandler);

  // Send location
  fastify.post('/session/:sessionId/send-location', { schema: MessageSchemas.sendLocation }, sendLocationHandler);

  // Send contact card (vCard)
  fastify.post('/session/:sessionId/send-contact', { schema: MessageSchemas.sendContact }, sendContactHandler);

  // Delete message
  fastify.delete('/session/:sessionId/message', { schema: MessageSchemas.deleteMessage }, deleteMessageHandler);

  // Check number on WhatsApp
  fastify.post('/session/:sessionId/check-number', { schema: MessageSchemas.checkNumber }, checkNumberHandler);

  // Accept group invite
  fastify.post('/session/:sessionId/accept-invite', { schema: MessageSchemas.acceptInvite }, acceptInviteHandler);

  // Get invite info
  fastify.post('/session/:sessionId/invite-info', { schema: MessageSchemas.inviteInfo }, getInviteInfoHandler);

  // ========================================
  // WEBHOOK MANAGEMENT
  // ========================================

  // List webhook endpoints
  fastify.get('/session/:sessionId/webhooks', { schema: WebhookSchemas.listEndpoints }, listWebhookEndpointsHandler);

  // Create webhook endpoint
  fastify.post('/session/:sessionId/webhooks', { schema: WebhookSchemas.createEndpoint }, createWebhookEndpointHandler);

  // Update webhook endpoint
  fastify.put('/session/:sessionId/webhooks/:endpointId', { schema: WebhookSchemas.updateEndpoint }, updateWebhookEndpointHandler);

  // Delete webhook endpoint
  fastify.delete('/session/:sessionId/webhooks/:endpointId', { schema: WebhookSchemas.deleteEndpoint }, deleteWebhookEndpointHandler);

  // Test webhook
  fastify.post('/session/:sessionId/webhooks/test', { schema: WebhookSchemas.test }, testWebhookHandler);

  // List webhook delivery logs
  fastify.get('/session/:sessionId/webhooks/logs', { schema: WebhookSchemas.listLogs }, listWebhookLogsHandler);

  // Retry failed webhook delivery
  fastify.post('/session/:sessionId/webhooks/logs/:logId/retry', { schema: WebhookSchemas.retryLog }, retryWebhookLogHandler);

  // Update session-level webhook event filter
  fastify.put('/session/:sessionId/webhook/events', { schema: WebhookSchemas.updateEvents }, updateWebhookEventsHandler);
}

export default sessionRoutes;
