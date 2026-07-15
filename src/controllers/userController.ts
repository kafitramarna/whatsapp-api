/**
 * User Controller
 * 
 * Handles user management API endpoints
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { User } from '../models/User';

// Request body types
interface CreateUserBody {
  username: string;
  password: string;
  email?: string;
}

interface UpdateUserBody {
  username?: string;
  email?: string;
  password?: string;
  is_active?: boolean;
}

interface UserParams {
  userId: string;
}

/**
 * Create a new user
 * POST /users
 */
export async function createUserHandler(
  request: FastifyRequest<{ Body: CreateUserBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { username, password, email } = request.body;

    // Validate input
    if (!username || !password) {
      reply.status(400).send({
        success: false,
        error: 'Username and password are required',
      });
      return;
    }

    // Check if username already exists
    const existing = await User.findOne({ where: { username } });
    if (existing) {
      reply.status(400).send({
        success: false,
        error: 'Username already exists',
      });
      return;
    }

    // Create user
    const user = await User.create({ username, password, email });

    reply.status(201).send({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        api_key: user.api_key, // Only shown once at creation
        is_active: user.is_active,
        created_at: user.createdAt,
      },
    });
  } catch (error) {
    console.error('[User] Create error:', error);
    reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * List all users
 * GET /users
 */
export async function listUsersHandler(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const users = await User.findAll({
      attributes: ['id', 'username', 'email', 'is_active', 'last_login', 'createdAt'],
    });

    // Mask API keys in list response
    const maskedUsers = users.map((u) => ({
      ...u.toJSON(),
      api_key: u.getMaskedApiKey(),
    }));

    reply.send({
      success: true,
      data: maskedUsers,
    });
  } catch (error) {
    console.error('[User] List error:', error);
    reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get user by ID
 * GET /users/:userId
 */
export async function getUserHandler(
  request: FastifyRequest<{ Params: UserParams }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { userId } = request.params;

    const user = await User.findByPk(userId, {
      attributes: ['id', 'username', 'email', 'is_active', 'last_login', 'createdAt'],
    });

    if (!user) {
      reply.status(404).send({
        success: false,
        error: 'User not found',
      });
      return;
    }

    reply.send({
      success: true,
      data: {
        ...user.toJSON(),
        api_key: user.getMaskedApiKey(),
      },
    });
  } catch (error) {
    console.error('[User] Get error:', error);
    reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Update user
 * PUT /users/:userId
 */
export async function updateUserHandler(
  request: FastifyRequest<{ Params: UserParams; Body: UpdateUserBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { userId } = request.params;
    const { username, email, password, is_active } = request.body;

    const user = await User.findByPk(userId);

    if (!user) {
      reply.status(404).send({
        success: false,
        error: 'User not found',
      });
      return;
    }

    // Check username uniqueness if changing
    if (username && username !== user.username) {
      const existing = await User.findOne({ where: { username } });
      if (existing) {
        reply.status(400).send({
          success: false,
          error: 'Username already exists',
        });
        return;
      }
      user.username = username;
    }

    if (password) {
      user.password = password; // Will be hashed by hook
    }

    if (typeof is_active === 'boolean') {
      user.is_active = is_active;
    }

    if (email !== undefined) {
      user.email = email;
    }

    await user.save();

    reply.send({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_active: user.is_active,
        updated_at: user.updatedAt,
      },
    });
  } catch (error) {
    console.error('[User] Update error:', error);
    reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Delete user
 * DELETE /users/:userId
 */
export async function deleteUserHandler(
  request: FastifyRequest<{ Params: UserParams }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { userId } = request.params;

    const user = await User.findByPk(userId);

    if (!user) {
      reply.status(404).send({
        success: false,
        error: 'User not found',
      });
      return;
    }

    await user.destroy();

    reply.send({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    console.error('[User] Delete error:', error);
    reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Regenerate API key
 * POST /users/:userId/regenerate-key
 */
export async function regenerateApiKeyHandler(
  request: FastifyRequest<{ Params: UserParams }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { userId } = request.params;

    const user = await User.findByPk(userId);

    if (!user) {
      reply.status(404).send({
        success: false,
        error: 'User not found',
      });
      return;
    }

    const newApiKey = await user.regenerateApiKey();

    reply.send({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        api_key: newApiKey, // Only shown once at regeneration
      },
    });
  } catch (error) {
    console.error('[User] Regenerate key error:', error);
    reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get current user profile (from API key)
 * GET /users/me
 */
export async function getMeHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const user = request.user;

    if (!user) {
      reply.status(401).send({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    reply.send({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        api_key: user.getMaskedApiKey(),
        is_active: user.is_active,
        last_login: user.last_login,
        created_at: user.createdAt,
      },
    });
  } catch (error) {
    console.error('[User] Get me error:', error);
    reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export default {
  createUserHandler,
  listUsersHandler,
  getUserHandler,
  updateUserHandler,
  deleteUserHandler,
  regenerateApiKeyHandler,
  getMeHandler,
};
