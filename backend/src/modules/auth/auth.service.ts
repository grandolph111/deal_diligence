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
   * Handles account linking when same email is used with different Auth0 providers
   */
  async findOrCreateUser(auth0Info: Auth0UserInfo): Promise<User> {
    const { sub: auth0Id, email, name, picture } = auth0Info;

    // Try to find existing user by auth0Id
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

    // User not found by auth0Id - check if email already exists
    // This handles cases where user logs in with different Auth0 providers (Google vs email/password)
    if (email) {
      const existingUserByEmail = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUserByEmail) {
        // Link this auth0Id to the existing account by updating it
        user = await prisma.user.update({
          where: { id: existingUserByEmail.id },
          data: {
            auth0Id, // Update to new auth0Id
            name: name || existingUserByEmail.name,
            avatarUrl: picture || existingUserByEmail.avatarUrl,
          },
        });
        return user;
      }
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

  /**
   * Dev-creds login: match email + devPassword against a seeded user and
   * return the user profile + a mock token the frontend can send as a
   * Bearer token. Prototype only.
   */
  async devLogin(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { company: true },
    });
    if (!user || !user.devPassword || user.devPassword !== password) {
      return null;
    }
    return {
      token: `mock-dev-token-${user.id}`,
      user,
    };
  },
};
