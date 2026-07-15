/**
 * Route Schemas for OpenAPI Documentation
 * 
 * Defines request/response schemas for all API endpoints
 */

// Common schemas
export const ErrorResponseSchema = {
  type: 'object' as const,
  properties: {
    success: { type: 'boolean' as const, example: false },
    error: { type: 'string' as const },
  },
};

export const SuccessResponseSchema = {
  type: 'object' as const,
  properties: {
    success: { type: 'boolean' as const, example: true },
    message: { type: 'string' as const },
  },
};

// Auth schemas
export const AuthSchemas = {
  register: {
    tags: ['Auth'],
    summary: 'Register new user',
    description: 'Create a new user account (public endpoint)',
    body: {
      type: 'object' as const,
      required: ['username', 'password'],
      properties: {
        username: { type: 'string' as const, example: 'new_user' },
        email: { type: 'string' as const, format: 'email', example: 'user@example.com' },
        password: { type: 'string' as const, minLength: 6, example: 'password123' },
      },
      example: {
        username: 'new_user',
        email: 'user@example.com',
        password: 'password123',
      },
    },
    response: {
      201: {
        type: 'object' as const,
        properties: {
          success: { type: 'boolean' as const },
          data: {
            type: 'object' as const,
            properties: {
              id: { type: 'string' as const },
              username: { type: 'string' as const },
              api_key: { type: 'string' as const },
            },
          },
        },
      },
      400: ErrorResponseSchema,
    },
  },
  login: {
    tags: ['Auth'],
    summary: 'User login',
    description: 'Authenticate with username + password. Returns API key (plaintext for existing users with old column, masked for new users). Use /auth/regenerate-key if you lost your API key.',
    body: {
      type: 'object' as const,
      required: ['username', 'password'],
      properties: {
        username: { type: 'string' as const, example: 'admin' },
        password: { type: 'string' as const, example: 'admin123' },
      },
      example: {
        username: 'admin',
        password: 'admin123',
      },
    },
    response: {
      200: {
        type: 'object' as const,
        properties: {
          success: { type: 'boolean' as const },
          data: {
            type: 'object' as const,
            properties: {
              id: { type: 'string' as const },
              username: { type: 'string' as const },
              email: { type: 'string' as const, nullable: true },
              api_key: { type: 'string' as const, description: 'Full API key (existing users) or masked **** (new users)' },
              last_login: { type: 'string' as const, format: 'date-time' },
            },
          },
        },
      },
      401: ErrorResponseSchema,
    },
  },
  regenerateKey: {
    tags: ['Auth'],
    summary: 'Regenerate API key',
    description: 'Regenerate API key using username + password. Use this when you lost your API key and cannot authenticate via x-api-key header. The new key is only shown once.',
    body: {
      type: 'object' as const,
      required: ['username', 'password'],
      properties: {
        username: { type: 'string' as const, example: 'admin' },
        password: { type: 'string' as const, example: 'admin123' },
      },
      example: {
        username: 'admin',
        password: 'admin123',
      },
    },
    response: {
      200: {
        type: 'object' as const,
        properties: {
          success: { type: 'boolean' as const },
          message: { type: 'string' as const },
          data: {
            type: 'object' as const,
            properties: {
              id: { type: 'string' as const },
              username: { type: 'string' as const },
              api_key: { type: 'string' as const, description: 'New API key — save this, it will not be shown again' },
            },
          },
        },
      },
      401: ErrorResponseSchema,
    },
  },
};

// Session schemas
export const SessionSchemas = {
  create: {
    tags: ['Session'],
    summary: 'Create WhatsApp session',
    description: 'Create a new WhatsApp session and get QR code',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string' as const, description: 'Optional custom session ID' },
        webhook_url: { type: 'string' as const, description: 'Webhook URL for events', nullable: true, example: 'https://webhook.site/...' },
      },
    },
    response: {
      200: {
        type: 'object' as const,
        properties: {
          success: { type: 'boolean' as const },
          data: {
            type: 'object' as const,
            properties: {
              session_id: { type: 'string' as const },
              status: { type: 'string' as const },
              connected: { type: 'boolean' as const },
              qr: { type: 'string' as const, nullable: true },
              message: { type: 'string' as const },
            },
          },
        },
      },
    },
  },
  list: {
    tags: ['Session'],
    summary: 'List sessions',
    description: 'Get all sessions for current user',
    security: [{ ApiKeyAuth: [] }],
    response: {
      200: {
        type: 'object' as const,
        properties: {
          success: { type: 'boolean' as const },
          data: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                session_id: { type: 'string' as const },
                status: { type: 'string' as const },
                phone_number: { type: 'string' as const },
                name: { type: 'string' as const },
                connected: { type: 'boolean' as const },
                hasQr: { type: 'boolean' as const },
              },
            },
          },
        },
      },
    },
  },
  status: {
    tags: ['Session'],
    summary: 'Get session status',
    security: [{ ApiKeyAuth: [] }],
    params: {
      type: 'object' as const,
      properties: {
        sessionId: { type: 'string' as const },
      },
    },
  },
  qr: {
    tags: ['Session'],
    summary: 'Get QR code',
    description: 'Get QR code for session authentication',
    security: [{ ApiKeyAuth: [] }],
    params: {
      type: 'object' as const,
      properties: {
        sessionId: { type: 'string' as const },
      },
    },
  },
  delete: {
    tags: ['Session'],
    summary: 'Delete session',
    description: 'Logout and delete WhatsApp session',
    security: [{ ApiKeyAuth: [] }],
    params: {
      type: 'object' as const,
      properties: {
        sessionId: { type: 'string' as const },
      },
    },
  },
  updateWebhook: {
    tags: ['Session'],
    summary: 'Update webhook URL',
    description: 'Set or update the webhook URL for session events',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['webhook_url'],
      properties: {
        webhook_url: { type: 'string' as const, format: 'uri', nullable: true },
        webhook_secret: { type: 'string' as const, description: 'HMAC secret for webhook signing', nullable: true },
      },
    },
  },
};

// Messaging schemas
export const MessagingSchemas = {
  send: {
    tags: ['Messaging'],
    summary: 'Send message',
    description: 'Send text and/or media to individual contact',
    security: [{ ApiKeyAuth: [] }],
    params: {
      type: 'object' as const,
      properties: {
        sessionId: { type: 'string' as const },
      },
    },
    body: {
      type: 'object' as const,
      required: ['to'],
      properties: {
        to: { type: 'string' as const, description: 'Phone number (e.g., 6281234567890)' },
        message: { type: 'string' as const, description: 'Text message' },
        replyTo: { type: 'string' as const, description: 'Message ID to reply to' },
        media: {
          type: 'array' as const,
          description: 'Array of media items',
          items: {
            type: 'object' as const,
            properties: {
              type: { type: 'string' as const, enum: ['image', 'video', 'document', 'audio', 'sticker'] },
              data: { type: 'string' as const, description: 'URL, local path, or base64' },
              caption: { type: 'string' as const },
              filename: { type: 'string' as const },
              mimetype: { type: 'string' as const },
              isAnimated: { type: 'boolean' as const, description: 'For stickers — whether animated' },
            },
          },
        },
      },
    },
  },
  read: {
    tags: ['Messaging'],
    summary: 'Mark message as read',
    security: [{ ApiKeyAuth: [] }],
    params: {
      type: 'object' as const,
      properties: {
        sessionId: { type: 'string' as const },
      },
    },
    body: {
      type: 'object' as const,
      required: ['remoteJid', 'messageId'],
      properties: {
        remoteJid: { type: 'string' as const },
        messageId: { type: 'string' as const },
      },
    },
  },
  presence: {
    tags: ['Messaging'],
    summary: 'Send presence update',
    security: [{ ApiKeyAuth: [] }],
    params: {
      type: 'object' as const,
      properties: {
        sessionId: { type: 'string' as const },
      },
    },
    body: {
      type: 'object' as const,
      required: ['remoteJid', 'presence'],
      properties: {
        remoteJid: { type: 'string' as const },
        presence: { type: 'string' as const, enum: ['composing', 'paused'] },
      },
    },
  },
  sendGroup: {
    tags: ['Messaging'],
    summary: 'Send to group',
    description: 'Send message to WhatsApp group',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['groupId'],
      properties: {
        groupId: { type: 'string' as const, description: 'Group JID (e.g., 120363xxx@g.us)' },
        message: { type: 'string' as const },
        replyTo: { type: 'string' as const, description: 'Message ID to reply to' },
        media: { type: 'array' as const },
      },
    },
  },
  broadcast: {
    tags: ['Messaging'],
    summary: 'Broadcast message',
    description: 'Send message to multiple recipients with delay',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['recipients'],
      properties: {
        recipients: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Array of phone numbers',
        },
        message: { type: 'string' as const },
        media: { type: 'array' as const },
        delay: { type: 'number' as const, default: 1000, description: 'Delay in ms between messages' },
      },
    },
  },
};

// Scheduled message schemas
export const ScheduledSchemas = {
  create: {
    tags: ['Scheduled'],
    summary: 'Create scheduled message',
    description: 'Schedule a message to be sent at specific time',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['recipient', 'scheduled_at'],
      properties: {
        recipient: { type: 'string' as const, description: 'Phone number or group JID' },
        recipient_type: { type: 'string' as const, enum: ['individual', 'group'], default: 'individual' },
        message: { type: 'string' as const },
        media: { type: 'array' as const },
        scheduled_at: { type: 'string' as const, format: 'date-time', description: 'ISO 8601 date-time' },
      },
    },
  },
  list: {
    tags: ['Scheduled'],
    summary: 'List pending scheduled messages',
    security: [{ ApiKeyAuth: [] }],
  },
  history: {
    tags: ['Scheduled'],
    summary: 'Get scheduled message history',
    description: 'Get sent/failed/cancelled messages',
    security: [{ ApiKeyAuth: [] }],
  },
  get: {
    tags: ['Scheduled'],
    summary: 'Get scheduled message by ID',
    security: [{ ApiKeyAuth: [] }],
  },
  cancel: {
    tags: ['Scheduled'],
    summary: 'Cancel scheduled message',
    security: [{ ApiKeyAuth: [] }],
  },
};

// Group schemas
export const GroupSchemas = {
  list: {
    tags: ['Groups'],
    summary: 'List all groups',
    description: 'Get all groups the session is participating in',
    security: [{ ApiKeyAuth: [] }],
  },
  create: {
    tags: ['Groups'],
    summary: 'Create group',
    description: 'Create a new WhatsApp group',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['name', 'participants'],
      properties: {
        name: { type: 'string' as const },
        participants: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Array of phone numbers to add',
        },
      },
    },
  },
  info: {
    tags: ['Groups'],
    summary: 'Get group info',
    description: 'Get group metadata and participants',
    security: [{ ApiKeyAuth: [] }],
  },
  addParticipants: {
    tags: ['Groups'],
    summary: 'Add participants',
    description: 'Add members to group',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['participants'],
      properties: {
        participants: { type: 'array' as const, items: { type: 'string' as const } },
      },
    },
  },
  removeParticipants: {
    tags: ['Groups'],
    summary: 'Remove participants',
    description: 'Remove members from group',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['participants'],
      properties: {
        participants: { type: 'array' as const, items: { type: 'string' as const } },
      },
    },
  },
  leave: {
    tags: ['Groups'],
    summary: 'Leave group',
    security: [{ ApiKeyAuth: [] }],
  },
  mention: {
    tags: ['Groups'],
    summary: 'Mention users in group',
    description: 'Send a message mentioning specific users in a group',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['message', 'mentioned'],
      properties: {
        message: { type: 'string' as const, description: 'Message text' },
        mentioned: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Array of JIDs to mention (e.g., 6281234567890@s.whatsapp.net)',
        },
      },
      example: {
        message: 'Hello everyone!',
        mentioned: ['6281234567890@s.whatsapp.net', '6289876543210@s.whatsapp.net'],
      },
    },
  },
  promote: {
    tags: ['Groups'],
    summary: 'Promote to admin',
    description: 'Promote participants to group admin',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['participants'],
      properties: {
        participants: { type: 'array' as const, items: { type: 'string' as const } },
      },
    },
  },
  demote: {
    tags: ['Groups'],
    summary: 'Demote from admin',
    description: 'Demote admins to regular participants',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['participants'],
      properties: {
        participants: { type: 'array' as const, items: { type: 'string' as const } },
      },
    },
  },
  settings: {
    tags: ['Groups'],
    summary: 'Update group settings',
    description: 'Set group to announcement, locked, or unlocked mode',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['setting'],
      properties: {
        setting: { type: 'string' as const, enum: ['announcement', 'unlocked', 'locked'], description: 'Group setting mode' },
      },
      example: { setting: 'announcement' },
    },
  },
  subject: {
    tags: ['Groups'],
    summary: 'Update group subject',
    description: 'Change the group name',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['subject'],
      properties: {
        subject: { type: 'string' as const, description: 'New group subject/name' },
      },
      example: { subject: 'My Group' },
    },
  },
  description: {
    tags: ['Groups'],
    summary: 'Update group description',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['description'],
      properties: {
        description: { type: 'string' as const, description: 'New group description' },
      },
      example: { description: 'This is a test group' },
    },
  },
  getInvite: {
    tags: ['Groups'],
    summary: 'Get invite link',
    description: 'Get the current group invite code/link',
    security: [{ ApiKeyAuth: [] }],
  },
  revokeInvite: {
    tags: ['Groups'],
    summary: 'Revoke invite link',
    description: 'Revoke the current invite link and generate a new one',
    security: [{ ApiKeyAuth: [] }],
  },
};

// User schemas
export const UserSchemas = {
  me: {
    hide: true,
    tags: ['Users'],
    summary: 'Get current user',
    description: 'Get authenticated user profile',
    security: [{ ApiKeyAuth: [] }],
  },
  list: {
    hide: true,
    tags: ['Users'],
    summary: 'List all users (admin)',
    security: [{ ApiKeyAuth: [] }],
  },
  create: {
    hide: true,
    tags: ['Users'],
    summary: 'Create user (admin)',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['username', 'password'],
      properties: {
        username: { type: 'string' as const, example: 'admin_user' },
        email: { type: 'string' as const, example: 'admin@example.com' },
        password: { type: 'string' as const, example: 'adminPass123' },
        role: { type: 'string' as const, enum: ['admin', 'user'], example: 'user' },
      },
    },
  },
  get: {
    hide: true,
    tags: ['Users'],
    summary: 'Get user by ID (admin)',
    security: [{ ApiKeyAuth: [] }],
  },
  update: {
    hide: true,
    tags: ['Users'],
    summary: 'Update user (admin)',
    security: [{ ApiKeyAuth: [] }],
  },
  delete: {
    hide: true,
    tags: ['Users'],
    summary: 'Delete user (admin)',
    security: [{ ApiKeyAuth: [] }],
  },
  regenerateKey: {
    hide: true,
    tags: ['Users'],
    summary: 'Regenerate API key (admin)',
    security: [{ ApiKeyAuth: [] }],
  },
};

// Webhook schemas
export const WebhookSchemas = {
  listEndpoints: {
    tags: ['Webhooks'],
    summary: 'List webhook endpoints',
    description: 'Get all webhook endpoints for a session',
    security: [{ ApiKeyAuth: [] }],
  },
  createEndpoint: {
    tags: ['Webhooks'],
    summary: 'Create webhook endpoint',
    description: 'Add a new webhook endpoint for a session',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['url'],
      properties: {
        url: { type: 'string' as const, format: 'uri', description: 'Webhook endpoint URL' },
        secret: { type: 'string' as const, description: 'HMAC secret for signing' },
        events: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Event types to receive. Empty = all events',
          example: ['message.received', 'message.status'],
        },
      },
      example: {
        url: 'https://example.com/webhook',
        events: ['message.received'],
      },
    },
  },
  updateEndpoint: {
    tags: ['Webhooks'],
    summary: 'Update webhook endpoint',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      properties: {
        url: { type: 'string' as const, format: 'uri' },
        secret: { type: 'string' as const },
        events: { type: 'array' as const, items: { type: 'string' as const } },
        is_active: { type: 'boolean' as const },
      },
    },
  },
  deleteEndpoint: {
    tags: ['Webhooks'],
    summary: 'Delete webhook endpoint',
    security: [{ ApiKeyAuth: [] }],
  },
  test: {
    tags: ['Webhooks'],
    summary: 'Test webhook endpoint',
    description: 'Send a test payload to a URL and return status + latency',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['url'],
      properties: {
        url: { type: 'string' as const, format: 'uri', description: 'URL to test' },
        secret: { type: 'string' as const, description: 'Optional HMAC secret for signing test payload' },
      },
      example: {
        url: 'https://example.com/webhook',
      },
    },
  },
  listLogs: {
    tags: ['Webhooks'],
    summary: 'List webhook delivery logs',
    description: 'Get paginated webhook delivery logs with optional status filter',
    security: [{ ApiKeyAuth: [] }],
    querystring: {
      type: 'object' as const,
      properties: {
        page: { type: 'integer' as const, default: 1 },
        limit: { type: 'integer' as const, default: 20 },
        status: { type: 'string' as const, enum: ['pending', 'success', 'failed', 'retrying'] },
      },
    },
  },
  retryLog: {
    tags: ['Webhooks'],
    summary: 'Retry failed webhook delivery',
    description: 'Manually retry a failed webhook log entry',
    security: [{ ApiKeyAuth: [] }],
  },
  updateEvents: {
    tags: ['Webhooks'],
    summary: 'Update webhook event filter',
    description: 'Set which event types the session-level webhook should receive',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['events'],
      properties: {
        events: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Event types to receive. Empty = all events',
          example: ['message.received', 'message.status', 'presence.update', 'message.reaction', 'message.deleted', 'group.update', 'group.participants', 'call'],
        },
      },
    },
  },
};

// Message schemas (special message types)
export const MessageSchemas = {
  react: {
    tags: ['Messages'],
    summary: 'React to message',
    description: 'React to a message with an emoji',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['to', 'messageId', 'emoji'],
      properties: {
        to: { type: 'string' as const, description: 'Phone number or JID' },
        messageId: { type: 'string' as const, description: 'ID of message to react to' },
        emoji: { type: 'string' as const, description: 'Emoji to react with (e.g., "👍")' },
      },
      example: { to: '6281234567890', messageId: 'msg123', emoji: '👍' },
    },
  },
  sendPoll: {
    tags: ['Messages'],
    summary: 'Send poll',
    description: 'Send a poll message with selectable options',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['to', 'name', 'options'],
      properties: {
        to: { type: 'string' as const, description: 'Phone number or JID' },
        name: { type: 'string' as const, description: 'Poll question/title' },
        options: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Poll options (min 2)',
        },
        selectableCount: { type: 'integer' as const, default: 1, description: 'How many options can be selected' },
      },
      example: { to: '6281234567890', name: 'Lunch?', options: ['Pizza', 'Burger', 'Salad'], selectableCount: 1 },
    },
  },
  sendLocation: {
    tags: ['Messages'],
    summary: 'Send location',
    description: 'Send a location message with coordinates',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['to', 'latitude', 'longitude'],
      properties: {
        to: { type: 'string' as const, description: 'Phone number or JID' },
        latitude: { type: 'number' as const, description: 'Latitude coordinate' },
        longitude: { type: 'number' as const, description: 'Longitude coordinate' },
        name: { type: 'string' as const, description: 'Location name (optional)' },
        address: { type: 'string' as const, description: 'Location address (optional)' },
      },
      example: { to: '6281234567890', latitude: -6.2088, longitude: 106.8456, name: 'Monas', address: 'Jakarta' },
    },
  },
  sendContact: {
    tags: ['Messages'],
    summary: 'Send contact card',
    description: 'Send a contact card (vCard) to a recipient',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['to', 'name', 'phoneNumber'],
      properties: {
        to: { type: 'string' as const, description: 'Phone number or JID' },
        name: { type: 'string' as const, description: 'Contact display name' },
        phoneNumber: { type: 'string' as const, description: 'Contact phone number' },
        organization: { type: 'string' as const, description: 'Contact organization (optional)' },
      },
      example: { to: '6281234567890', name: 'John Doe', phoneNumber: '6289876543210', organization: 'ACME Corp' },
    },
  },
  deleteMessage: {
    tags: ['Messages'],
    summary: 'Delete message',
    description: 'Delete a message for me or for everyone',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['to', 'messageId', 'deleteFor'],
      properties: {
        to: { type: 'string' as const, description: 'Phone number or JID' },
        messageId: { type: 'string' as const, description: 'ID of message to delete' },
        deleteFor: { type: 'string' as const, enum: ['me', 'everyone'], description: 'Delete for me or everyone' },
      },
      example: { to: '6281234567890', messageId: 'msg123', deleteFor: 'everyone' },
    },
  },
  checkNumber: {
    tags: ['Messages'],
    summary: 'Check number on WhatsApp',
    description: 'Check if a phone number is registered on WhatsApp',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['phoneNumber'],
      properties: {
        phoneNumber: { type: 'string' as const, description: 'Phone number to check' },
      },
      example: { phoneNumber: '6281234567890' },
    },
  },
  acceptInvite: {
    tags: ['Groups'],
    summary: 'Accept invite code',
    description: 'Accept a group invite code and join the group',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['code'],
      properties: {
        code: { type: 'string' as const, description: 'Invite code (from invite link)' },
      },
      example: { code: 'abc123XYZ' },
    },
  },
  inviteInfo: {
    tags: ['Groups'],
    summary: 'Get invite info',
    description: 'Get information about a group from an invite code',
    security: [{ ApiKeyAuth: [] }],
    body: {
      type: 'object' as const,
      required: ['code'],
      properties: {
        code: { type: 'string' as const, description: 'Invite code' },
      },
      example: { code: 'abc123XYZ' },
    },
  },
};

export default {
  AuthSchemas,
  SessionSchemas,
  MessagingSchemas,
  ScheduledSchemas,
  GroupSchemas,
  UserSchemas,
  WebhookSchemas,
  MessageSchemas,
};
