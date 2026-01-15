import { prisma } from '../../config/database';
import { User } from '@prisma/client';

interface Auth0UserInfo {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}

export const authService = {
  /**
   * Find or create a user based on Auth0 information
   */
  async findOrCreateUser(auth0Info: Auth0UserInfo): Promise<User> {
    const { sub: auth0Id, email, name, picture } = auth0Info;

    // Try to find existing user
    let user = await prisma.user.findUnique({
      where: { auth0Id },
    });

    if (user) {
      // Update user info if changed
      if (email !== user.email || name !== user.name || picture !== user.avatarUrl) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            email: email || user.email,
            name: name || user.name,
            avatarUrl: picture || user.avatarUrl,
          },
        });
      }
      return user;
    }

    // Create new user
    if (!email) {
      throw new Error('Email is required for new users');
    }

    user = await prisma.user.create({
      data: {
        auth0Id,
        email,
        name,
        avatarUrl: picture,
      },
    });

    return user;
  },

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  },

  /**
   * Get user by Auth0 ID
   */
  async getUserByAuth0Id(auth0Id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { auth0Id },
    });
  },

  /**
   * Update user profile
   */
  async updateUser(
    id: string,
    data: { name?: string; avatarUrl?: string }
  ): Promise<User> {
    return prisma.user.update({
      where: { id },
      data,
    });
  },
};
