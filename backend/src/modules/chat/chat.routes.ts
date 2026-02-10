import { Router } from 'express';
import { chatController } from './chat.controller';
import { requireAuth } from '../../middleware/auth';
import { loadProjectMembership, requirePermission } from '../../middleware/permissions';

// mergeParams allows access to :id from parent router
const router = Router({ mergeParams: true });

// All routes require authentication and project membership
router.use(requireAuth);
router.use(loadProjectMembership);

// All chat routes require canAccessVDR permission
// (chat is part of the VDR feature set)
router.use(requirePermission('canAccessVDR'));

// ============================================
// CONVERSATIONS
// ============================================

// GET /api/v1/projects/:id/chat/conversations - List all conversations
router.get('/conversations', chatController.listConversations);

// POST /api/v1/projects/:id/chat/conversations - Create a new conversation
router.post('/conversations', chatController.createConversation);

// GET /api/v1/projects/:id/chat/conversations/:conversationId - Get conversation with messages
router.get('/conversations/:conversationId', chatController.getConversation);

// PATCH /api/v1/projects/:id/chat/conversations/:conversationId - Update conversation title
router.patch('/conversations/:conversationId', chatController.updateConversation);

// DELETE /api/v1/projects/:id/chat/conversations/:conversationId - Delete conversation
router.delete('/conversations/:conversationId', chatController.deleteConversation);

// ============================================
// MESSAGES
// ============================================

// POST /api/v1/projects/:id/chat/conversations/:conversationId/messages - Send a message
router.post(
  '/conversations/:conversationId/messages',
  chatController.sendMessage
);

export default router;
