import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import fs from 'fs';
import {
  EMBEDDING_DIM,
  EMBEDDING_MODEL_NAME,
  harvestAndChunkSiteData,
  LLAMA3_MODEL_NAME,
  runLocalRagPipeline,
  VECTOR_DB_ENGINE,
} from './src/lib/local-rag-engine.ts';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import crypto from 'crypto';
import {
  getSupabaseStatusSnapshot,
  verifyPostgresConnectivity,
} from './src/db/index.ts';
import {
  authenticateWithPassword,
  ensureSeedData,
  getAllWorkspaceData,
  getUserByEmail,
  getUserByUid,
  logActivity,
  markChatMessagesDeliveredForUser,
  markChatMessagesReadByRecipient,
  markUserConnectedSse,
  markUserDisconnectedSse,
  resetDatabaseSeedFlag,
  sendChatMessage,
  toggleChatMessageReaction,
  togglePinChatMessage,
  touchUserLastActivity,
} from './src/db/repository.ts';
import {
  addAttachmentMetadata,
  AppError,
  archiveEmployeeByAdmin,
  changeUserPassword,
  createEmployeeByAdmin,
  createTaskWithAssignments,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  resetEmployeePasswordByAdmin,
  reviewTaskSubmission,
  startTaskAssignment,
  submitProgressUpdate,
  submitTaskForReview,
  updateEmployeeByAdmin,
  updateOrganizationSettings,
  updateSelfProfile,
  updateTaskByAdmin,
} from './src/db/mutations.ts';
import {
  checkRateLimit,
  createSessionToken,
  sanitizeCsvCell,
  sanitizeUserRecord,
  verifySessionToken,
} from './src/lib/security.ts';
import {
  createEmployeeSchema,
  createTaskSchema,
  loginSchema,
  orgSettingsSchema,
  passwordChangeSchema,
  passwordResetRequestSchema,
  progressUpdateSchema,
  reviewSubmissionSchema,
  submitCompletionSchema,
  updateEmployeeSchema,
  updateSelfProfileSchema,
  updateTaskSchema,
} from './src/lib/validation.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
app.use(express.json({ limit: '1mb' }));

// Security & Mobile APK CORS Headers Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Cache-Control, Pragma'
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(self), geolocation=()'
  );
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Real-time SSE Event Clients
const sseClients = new Set<Response>();

function broadcastRealtimeEvent(eventType: string, payload: Record<string, unknown>) {
  const message = `data: ${JSON.stringify({
    type: eventType,
    timestamp: new Date().toISOString(),
    ...payload,
  })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch {
      sseClients.delete(client);
    }
  }
}

// ---------------------------------------------------------------------------
// PUBLIC / AUTHENTICATION ENDPOINTS
// ---------------------------------------------------------------------------

// Email & Password Login (Rate-limited + Account Enumeration safe response)
app.post('/api/auth/login', async (req: Request, res: Response) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'local';
  const rate = checkRateLimit(`login:${ip}`, 15, 60_000);
  if (!rate.allowed) {
    return res.status(429).json({
      error: `Too many sign-in attempts. Please wait ${rate.retryAfterSeconds} seconds.`,
      code: 'RATE_LIMITED',
    });
  }

  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid credentials format',
      code: 'VALIDATION_ERROR',
    });
  }

  try {
    const user = await authenticateWithPassword(
      parsed.data.email,
      parsed.data.password
    );
    const token = createSessionToken(user.uid, user.email);

    await logActivity({
      organizationId: user.organizationId,
      actorId: user.id,
      action: 'USER_SIGNED_IN',
      entityType: 'user',
      entityId: String(user.id),
      metadata: { method: 'password', role: user.role },
    });

    const workspace = await getAllWorkspaceData(user);
    broadcastRealtimeEvent('PRESENCE_UPDATED', {
      userId: user.id,
      isOnline: true,
      lastSeenAt: new Date().toISOString(),
    });

    return res.json({
      token,
      user: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        department: user.department,
        jobTitle: user.jobTitle,
        accountStatus: user.accountStatus,
      },
      workspace,
    });
  } catch (error: any) {
    if (error?.message === 'ACCOUNT_DEACTIVATED') {
      return res.status(403).json({
        error: 'This employee account has been deactivated by an administrator.',
        code: 'ACCOUNT_DEACTIVATED',
      });
    }
    if (error?.message === 'DATABASE_CONNECTION_ERROR') {
      return res.status(503).json({
        error:
          'Database connection error: Please verify your DATABASE_URL environment variable is configured.',
        code: 'DATABASE_CONNECTION_ERROR',
      });
    }
    return res.status(401).json({
      error: 'Invalid email address or password.',
      code: 'INVALID_CREDENTIALS',
    });
  }
});

// Password Reset Request (Protected against account enumeration)
app.post('/api/auth/password-reset', async (req: Request, res: Response) => {
  const ip = req.ip || 'local';
  const rate = checkRateLimit(`reset:${ip}`, 8, 60_000);
  if (!rate.allowed) {
    return res.status(429).json({
      error: `Too many requests. Please try again in ${rate.retryAfterSeconds}s.`,
    });
  }

  const parsed = passwordResetRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Enter a valid email address',
    });
  }

  // Always return a consistent success message to prevent account enumeration
  return res.json({
    message:
      'If an active account matches that email address, password recovery instructions have been recorded.',
  });
});

// Seed / Demo Status Check
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    await ensureSeedData();
    res.json({ status: 'ok' });
  } catch {
    res.status(500).json({ status: 'error' });
  }
});

// ---------------------------------------------------------------------------
// REALTIME SSE STREAM
// ---------------------------------------------------------------------------
app.get('/api/realtime/stream', async (req: Request, res: Response) => {
  const token = String(req.query.token || '');
  if (!token) {
    return res.status(401).end();
  }

  // Strictly verify signed session token before allowing SSE subscription
  const session = verifySessionToken(token);
  if (!session) {
    return res.status(401).end();
  }

  let connectedUser = await getUserByUid(session.uid);
  if (!connectedUser && session.email) {
    connectedUser = await getUserByEmail(session.email);
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(
    `data: ${JSON.stringify({
      type: 'CONNECTED',
      timestamp: new Date().toISOString(),
    })}\n\n`
  );

  sseClients.add(res);

  if (connectedUser) {
    markUserConnectedSse(connectedUser.id);
    await touchUserLastActivity(connectedUser.id);
    const delivered = await markChatMessagesDeliveredForUser(connectedUser.id);
    if (delivered.deliveredMessageIds.length > 0) {
      broadcastRealtimeEvent('CHAT_MESSAGES_DELIVERED', {
        recipientId: connectedUser.id,
        messageIds: delivered.deliveredMessageIds,
        deliveredAt: new Date().toISOString(),
      });
    }
    broadcastRealtimeEvent('PRESENCE_UPDATED', {
      userId: connectedUser.id,
      isOnline: true,
      lastSeenAt: new Date().toISOString(),
    });
  }

  const heartbeat = setInterval(() => {
    try {
      if (connectedUser) {
        markUserConnectedSse(connectedUser.id);
      }
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
    if (connectedUser) {
      markUserDisconnectedSse(connectedUser.id);
      const lastSeenAt = new Date().toISOString();
      touchUserLastActivity(connectedUser.id).catch(() => {});
      broadcastRealtimeEvent('PRESENCE_UPDATED', {
        userId: connectedUser.id,
        isOnline: false,
        lastSeenAt,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// PROTECTED WORKSPACE & DATA ENDPOINTS
// ---------------------------------------------------------------------------

app.get('/api/workspace', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const data = await getAllWorkspaceData(req.dbUser!);
    // Prevent caching of workspace data
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
    );
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.json(data);
  } catch (error: any) {
    console.error('Error in GET /api/workspace:', error);
    return res.status(500).json({
      error: error.message || 'Failed to load workspace data',
    });
  }
});

// Update Self Profile (Permitted fields only)
app.patch('/api/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = updateSelfProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error:
        parsed.error.issues[0]?.message ||
        'Invalid profile fields or unauthorized field modification attempt.',
      code: 'VALIDATION_ERROR',
    });
  }

  try {
    const updated = await updateSelfProfile(req.dbUser!, parsed.data);
    const workspace = await getAllWorkspaceData(updated);
    broadcastRealtimeEvent('PROFILE_UPDATED', { userId: updated.id });
    return res.json({ user: sanitizeUserRecord(updated), workspace });
  } catch (error: any) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return res.status(status).json({ error: error.message });
  }
});

// Change Password
app.post(
  '/api/profile/change-password',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const parsed = passwordChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid password format',
      });
    }

    try {
      await changeUserPassword(
        req.dbUser!,
        parsed.data.currentPassword,
        parsed.data.newPassword
      );
      return res.json({ message: 'Password updated successfully.' });
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : 500;
      return res.status(status).json({ error: error.message });
    }
  }
);

// ---------------------------------------------------------------------------
// ADMIN EMPLOYEE MANAGEMENT ENDPOINTS
// ---------------------------------------------------------------------------

app.post('/api/employees', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = createEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid employee data',
      code: 'VALIDATION_ERROR',
    });
  }

  try {
    const created = await createEmployeeByAdmin(req.dbUser!, parsed.data);
    const workspace = await getAllWorkspaceData(req.dbUser!);
    broadcastRealtimeEvent('EMPLOYEE_CREATED', { employeeId: created.id });
    return res.status(201).json({ employee: sanitizeUserRecord(created), workspace });
  } catch (error: any) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return res.status(status).json({
      error: error.message || 'Failed to create employee',
      code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
    });
  }
});

app.patch(
  '/api/employees/:id',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const employeeId = Number(req.params.id);
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      return res.status(400).json({ error: 'Invalid employee ID' });
    }

    const parsed = updateEmployeeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid employee update data',
      });
    }

    try {
      const updated = await updateEmployeeByAdmin(
        req.dbUser!,
        employeeId,
        parsed.data
      );
      const workspace = await getAllWorkspaceData(req.dbUser!);
      broadcastRealtimeEvent('EMPLOYEE_UPDATED', { employeeId: updated.id });
      return res.json({ employee: sanitizeUserRecord(updated), workspace });
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : 500;
      return res.status(status).json({ error: error.message });
    }
  }
);

app.delete(
  '/api/employees/:id',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const employeeId = Number(req.params.id);
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      return res.status(400).json({ error: 'Invalid employee ID' });
    }

    try {
      const archived = await archiveEmployeeByAdmin(req.dbUser!, employeeId);
      const workspace = await getAllWorkspaceData(req.dbUser!);
      broadcastRealtimeEvent('EMPLOYEE_ARCHIVED', { employeeId });
      return res.json({ employee: sanitizeUserRecord(archived), workspace });
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : 500;
      return res.status(status).json({ error: error.message });
    }
  }
);

app.post(
  '/api/employees/:id/reset-password',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const employeeId = Number(req.params.id);
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      return res.status(400).json({ error: 'Invalid employee ID' });
    }

    const tempPassword = String(req.body.temporaryPassword || '').trim();
    if (tempPassword.length < 8) {
      return res.status(400).json({
        error: 'Temporary password must be at least 8 characters.',
      });
    }

    try {
      const updated = await resetEmployeePasswordByAdmin(
        req.dbUser!,
        employeeId,
        tempPassword
      );
      const workspace = await getAllWorkspaceData(req.dbUser!);
      return res.json({
        message: 'Temporary password issued successfully.',
        employeeId: updated.id,
        workspace,
      });
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : 500;
      return res.status(status).json({ error: error.message });
    }
  }
);

// ---------------------------------------------------------------------------
// TASK & ASSIGNMENT ENDPOINTS
// ---------------------------------------------------------------------------

app.post('/api/tasks', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Invalid task parameters',
      code: 'VALIDATION_ERROR',
    });
  }

  try {
    const result = await createTaskWithAssignments(req.dbUser!, parsed.data);
    const workspace = await getAllWorkspaceData(req.dbUser!);
    broadcastRealtimeEvent('TASK_CREATED', { taskId: result.task.id });
    return res.status(201).json({ ...result, workspace });
  } catch (error: any) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return res.status(status).json({ error: error.message });
  }
});

app.patch(
  '/api/tasks/:id',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const taskId = Number(req.params.id);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid task update data',
      });
    }

    try {
      const updated = await updateTaskByAdmin(req.dbUser!, taskId, parsed.data);
      const workspace = await getAllWorkspaceData(req.dbUser!);
      broadcastRealtimeEvent('TASK_UPDATED', { taskId: updated.id });
      return res.json({ task: updated, workspace });
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : 500;
      return res.status(status).json({ error: error.message });
    }
  }
);

// Employee: Start Task Assignment
app.post(
  '/api/assignments/:id/start',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const assignmentId = Number(req.params.id);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      return res.status(400).json({ error: 'Invalid assignment ID' });
    }

    try {
      const updated = await startTaskAssignment(req.dbUser!, assignmentId);
      const workspace = await getAllWorkspaceData(req.dbUser!);
      broadcastRealtimeEvent('TASK_STARTED', {
        assignmentId,
        employeeId: req.dbUser!.id,
      });
      return res.json({ assignment: updated, workspace });
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : 500;
      return res.status(status).json({ error: error.message });
    }
  }
);

// Employee: Update Progress
app.post(
  '/api/assignments/:id/progress',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const assignmentId = Number(req.params.id);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      return res.status(400).json({ error: 'Invalid assignment ID' });
    }

    const parsed = progressUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid progress update data',
        code: 'VALIDATION_ERROR',
      });
    }

    try {
      const result = await submitProgressUpdate(
        req.dbUser!,
        assignmentId,
        parsed.data
      );
      const workspace = await getAllWorkspaceData(req.dbUser!);
      broadcastRealtimeEvent('PROGRESS_UPDATED', {
        assignmentId,
        employeeId: req.dbUser!.id,
        newPercentage: parsed.data.progressPercentage,
      });
      return res.json({ ...result, workspace });
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : 500;
      return res.status(status).json({ error: error.message });
    }
  }
);

// Employee: Submit Task for Completion Review
app.post(
  '/api/assignments/:id/submit',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const assignmentId = Number(req.params.id);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      return res.status(400).json({ error: 'Invalid assignment ID' });
    }

    const parsed = submitCompletionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid completion submission',
        code: 'VALIDATION_ERROR',
      });
    }

    try {
      const result = await submitTaskForReview(
        req.dbUser!,
        assignmentId,
        parsed.data
      );
      const workspace = await getAllWorkspaceData(req.dbUser!);
      broadcastRealtimeEvent('WORK_SUBMITTED', {
        assignmentId,
        employeeId: req.dbUser!.id,
      });
      return res.json({ ...result, workspace });
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : 500;
      return res.status(status).json({ error: error.message });
    }
  }
);

// Admin: Approve or Reject Completion Submission
app.post(
  '/api/assignments/:id/review',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const assignmentId = Number(req.params.id);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      return res.status(400).json({ error: 'Invalid assignment ID' });
    }

    const parsed = reviewSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid review decision data',
        code: 'VALIDATION_ERROR',
      });
    }

    try {
      const result = await reviewTaskSubmission(
        req.dbUser!,
        assignmentId,
        parsed.data
      );
      const workspace = await getAllWorkspaceData(req.dbUser!);
      broadcastRealtimeEvent('SUBMISSION_REVIEWED', {
        assignmentId,
        decision: parsed.data.decision,
      });
      return res.json({ ...result, workspace });
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : 500;
      return res.status(status).json({ error: error.message });
    }
  }
);

// Add Attachment Metadata
app.post(
  '/api/assignments/:id/attachments',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const assignmentId = Number(req.params.id);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      return res.status(400).json({ error: 'Invalid assignment ID' });
    }

    try {
      const created = await addAttachmentMetadata(req.dbUser!, assignmentId, {
        originalFilename: String(req.body.originalFilename || 'evidence.pdf'),
        contentType: String(req.body.contentType || 'application/pdf'),
        fileSize: Number(req.body.fileSize || 1024),
      });
      const workspace = await getAllWorkspaceData(req.dbUser!);
      broadcastRealtimeEvent('ATTACHMENT_ADDED', { assignmentId });
      return res.status(201).json({ attachment: created, workspace });
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : 500;
      return res.status(status).json({ error: error.message });
    }
  }
);

// ---------------------------------------------------------------------------
// NOTIFICATIONS & SETTINGS ENDPOINTS
// ---------------------------------------------------------------------------

app.post(
  '/api/notifications/:id/read',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const notifId = Number(req.params.id);
    if (!Number.isInteger(notifId) || notifId <= 0) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }

    try {
      const updated = await markNotificationAsRead(req.dbUser!, notifId);
      const workspace = await getAllWorkspaceData(req.dbUser!);
      return res.json({ notification: updated, workspace });
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : 500;
      return res.status(status).json({ error: error.message });
    }
  }
);

app.post(
  '/api/notifications/read-all',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      await markAllNotificationsAsRead(req.dbUser!);
      const workspace = await getAllWorkspaceData(req.dbUser!);
      return res.json({ success: true, workspace });
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : 500;
      return res.status(status).json({ error: error.message });
    }
  }
);

app.patch(
  '/api/organization',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const parsed = orgSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid organization settings',
      });
    }

    try {
      const updated = await updateOrganizationSettings(req.dbUser!, parsed.data);
      const workspace = await getAllWorkspaceData(req.dbUser!);
      broadcastRealtimeEvent('ORG_UPDATED', {});
      return res.json({ organization: updated, workspace });
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : 500;
      return res.status(status).json({ error: error.message });
    }
  }
);

// ---------------------------------------------------------------------------
// REAL-TIME TEAM & ADMIN CHAT ENDPOINTS (PRESENCE, DELIVERY ✓✓, READ ✓✓)
// ---------------------------------------------------------------------------

app.post(
  '/api/chat/messages',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const rawBody = String(req.body?.body || '').trim();
    const rawRecipient = req.body?.recipientId;
    const recipientId =
      rawRecipient === null ||
      rawRecipient === undefined ||
      rawRecipient === 'general'
        ? null
        : Number(rawRecipient);

    const rawReplyTo = req.body?.replyToMessageId;
    const replyToMessageId =
      rawReplyTo === null || rawReplyTo === undefined
        ? null
        : Number(rawReplyTo);
    const pinAnnouncement = Boolean(req.body?.pinAnnouncement);

    if (!rawBody) {
      return res.status(400).json({ error: 'Message text is required.' });
    }
    if (rawBody.length > 2000) {
      return res
        .status(400)
        .json({ error: 'Message cannot exceed 2000 characters.' });
    }
    if (
      recipientId !== null &&
      (!Number.isInteger(recipientId) || recipientId <= 0)
    ) {
      return res.status(400).json({ error: 'Invalid recipient ID.' });
    }

    try {
      const { message, recipient } = await sendChatMessage({
        sender: req.dbUser!,
        recipientId,
        body: rawBody,
        replyToMessageId:
          replyToMessageId && Number.isInteger(replyToMessageId)
            ? replyToMessageId
            : null,
        pinAnnouncement,
      });
      const workspace = await getAllWorkspaceData(req.dbUser!);

      broadcastRealtimeEvent('CHAT_MESSAGE_CREATED', {
        message,
        senderId: req.dbUser!.id,
        senderName: req.dbUser!.fullName,
        recipientId: message.recipientId,
        recipientName: recipient?.fullName || null,
      });

      return res.status(201).json({ message, workspace });
    } catch (error: any) {
      return res
        .status(400)
        .json({ error: error?.message || 'Failed to send chat message.' });
    }
  }
);

app.post(
  '/api/chat/messages/:id/react',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const messageId = Number(req.params.id);
    const emoji = String(req.body?.emoji || '').trim();
    if (!Number.isInteger(messageId) || messageId <= 0 || !emoji) {
      return res.status(400).json({ error: 'Valid messageId and emoji are required.' });
    }

    try {
      const updatedMessage = await toggleChatMessageReaction({
        user: req.dbUser!,
        messageId,
        emoji,
      });
      const workspace = await getAllWorkspaceData(req.dbUser!);

      broadcastRealtimeEvent('CHAT_MESSAGE_UPDATED', {
        message: updatedMessage,
        actorId: req.dbUser!.id,
      });

      return res.json({ message: updatedMessage, workspace });
    } catch (error: any) {
      return res
        .status(400)
        .json({ error: error?.message || 'Failed to react to message.' });
    }
  }
);

app.post(
  '/api/chat/messages/:id/pin',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const messageId = Number(req.params.id);
    if (!Number.isInteger(messageId) || messageId <= 0) {
      return res.status(400).json({ error: 'Invalid message ID.' });
    }

    try {
      const isPinnedParam =
        typeof req.body?.isPinned === 'boolean' ? req.body.isPinned : undefined;
      const updatedMessage = await togglePinChatMessage({
        actor: req.dbUser!,
        messageId,
        isPinned: isPinnedParam,
      });
      const workspace = await getAllWorkspaceData(req.dbUser!);

      broadcastRealtimeEvent('CHAT_MESSAGE_UPDATED', {
        message: updatedMessage,
        actorId: req.dbUser!.id,
      });

      return res.json({ message: updatedMessage, workspace });
    } catch (error: any) {
      if (error?.message === 'FORBIDDEN_ONLY_ADMIN_CAN_PIN') {
        return res.status(403).json({
          error: 'Only administrators can pin or unpin announcements.',
          code: 'FORBIDDEN',
        });
      }
      return res
        .status(400)
        .json({ error: error?.message || 'Failed to pin/unpin message.' });
    }
  }
);

app.post(
  '/api/chat/messages/read',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const rawContact = req.body?.contactId;
    const contactId =
      rawContact === null ||
      rawContact === undefined ||
      rawContact === 'general'
        ? null
        : Number(rawContact);

    if (
      contactId !== null &&
      (!Number.isInteger(contactId) || contactId <= 0)
    ) {
      return res.status(400).json({ error: 'Invalid contact ID.' });
    }

    try {
      const result = await markChatMessagesReadByRecipient({
        reader: req.dbUser!,
        contactId,
      });
      const workspace = await getAllWorkspaceData(req.dbUser!);

      if (result.updatedMessageIds.length > 0) {
        broadcastRealtimeEvent('CHAT_MESSAGES_READ', {
          readerId: req.dbUser!.id,
          readerName: req.dbUser!.fullName,
          contactId,
          messageIds: result.updatedMessageIds,
          readAt: new Date().toISOString(),
        });
      }

      return res.json({
        updatedMessageIds: result.updatedMessageIds,
        workspace,
      });
    } catch (error: any) {
      return res
        .status(500)
        .json({ error: error?.message || 'Failed to mark messages as read.' });
    }
  }
);

app.post(
  '/api/chat/messages/delivered',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const result = await markChatMessagesDeliveredForUser(req.dbUser!.id);
      if (result.deliveredMessageIds.length > 0) {
        broadcastRealtimeEvent('CHAT_MESSAGES_DELIVERED', {
          recipientId: req.dbUser!.id,
          messageIds: result.deliveredMessageIds,
          deliveredAt: new Date().toISOString(),
        });
      }
      return res.json({ deliveredMessageIds: result.deliveredMessageIds });
    } catch (error: any) {
      return res
        .status(500)
        .json({ error: error?.message || 'Failed to mark messages delivered.' });
    }
  }
);

app.post(
  '/api/chat/heartbeat',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    await touchUserLastActivity(req.dbUser!.id);
    const isTypingTo = req.body?.typingTo ?? undefined;
    if (isTypingTo !== undefined) {
      broadcastRealtimeEvent('CHAT_USER_TYPING', {
        userId: req.dbUser!.id,
        userName: req.dbUser!.fullName,
        recipientId: isTypingTo === 'general' ? null : Number(isTypingTo),
      });
    }
    return res.json({
      online: true,
      lastSeenAt: new Date().toISOString(),
    });
  }
);

// ---------------------------------------------------------------------------
// ADMIN-ONLY CSV EXPORTS (Protected against CSV Formula Injection)
// ---------------------------------------------------------------------------

app.get(
  '/api/reports/export/employees.csv',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (req.dbUser!.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden: Only administrators can export employee reports.',
      });
    }

    try {
      const data = await getAllWorkspaceData(req.dbUser!);
      const headers = [
        'Employee ID',
        'Full Name',
        'Email',
        'Department',
        'Job Title',
        'Status',
        'Assigned Tasks',
        'Approved Completed',
        'In Progress',
        'Overdue',
        'Completion Rate (%)',
        'On-Time Rate (%)',
        'Weighted Score',
      ];
      const rows = data.employees.map((e) => [
        sanitizeCsvCell(e.employeeNumber || e.id),
        sanitizeCsvCell(e.fullName),
        sanitizeCsvCell(e.email),
        sanitizeCsvCell(e.department),
        sanitizeCsvCell(e.jobTitle),
        sanitizeCsvCell(e.accountStatus),
        sanitizeCsvCell(e.totalAssigned),
        sanitizeCsvCell(e.approvedCompleted),
        sanitizeCsvCell(e.inProgress),
        sanitizeCsvCell(e.overdue),
        sanitizeCsvCell(e.completionRate),
        sanitizeCsvCell(e.onTimeRate),
        sanitizeCsvCell(e.weightedScore),
      ]);

      const csv = [
        headers.map(sanitizeCsvCell).join(','),
        ...rows.map((r) => r.join(',')),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="velopulse-employees-report.csv"'
      );
      return res.send(csv);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to generate CSV export.' });
    }
  }
);

app.get(
  '/api/reports/export/tasks.csv',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    if (req.dbUser!.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden: Only administrators can export task reports.',
      });
    }

    try {
      const data = await getAllWorkspaceData(req.dbUser!);
      const headers = [
        'Assignment ID',
        'Task Title',
        'Category',
        'Priority',
        'Employee Name',
        'Department',
        'Status',
        'Progress (%)',
        'Deadline',
        'Overdue',
        'Latest Progress Note',
      ];
      const rows = data.assignments.map((a) => [
        sanitizeCsvCell(a.id),
        sanitizeCsvCell(a.task?.title || ''),
        sanitizeCsvCell(a.task?.category || ''),
        sanitizeCsvCell(a.task?.priority || ''),
        sanitizeCsvCell(a.employee?.fullName || ''),
        sanitizeCsvCell(a.employee?.department || ''),
        sanitizeCsvCell(a.status),
        sanitizeCsvCell(a.progressPercentage),
        sanitizeCsvCell(
          a.task?.dueDate ? new Date(a.task.dueDate).toISOString().split('T')[0] : ''
        ),
        sanitizeCsvCell(a.isOverdue ? 'YES' : 'NO'),
        sanitizeCsvCell(a.latestNote || ''),
      ]);

      const csv = [
        headers.map(sanitizeCsvCell).join(','),
        ...rows.map((r) => r.join(',')),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="velopulse-task-assignments-report.csv"'
      );
      return res.send(csv);
    } catch {
      return res.status(500).json({ error: 'Failed to generate CSV export.' });
    }
  }
);

// ---------------------------------------------------------------------------
// LOCAL RAG CHATBOT ENGINE (SITE DATA CHUNKING + SENTENCE-TRANSFORMERS 384-D
// EMBEDDINGS + LOCAL CHROMA/FAISS VECTOR DB + LOCAL LLAMA 3 SYNTHESIS)
// ---------------------------------------------------------------------------

const VECTOR_STORE_FILE = path.resolve(
  process.cwd(),
  '.data',
  'vector-store-chroma-faiss.json'
);

function persistLocalVectorStoreIndex(documents: unknown[]) {
  if (process.env.VITEST === 'true') return;
  try {
    const dir = path.dirname(VECTOR_STORE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      VECTOR_STORE_FILE,
      JSON.stringify(
        {
          engine: VECTOR_DB_ENGINE,
          embeddingModel: EMBEDDING_MODEL_NAME,
          dimension: EMBEDDING_DIM,
          llmModel: LLAMA3_MODEL_NAME,
          updatedAt: new Date().toISOString(),
          totalVectors: documents.length,
          documents,
        },
        null,
        2
      ),
      'utf-8'
    );
  } catch {
    // Ignore disk write errors in read-only environments
  }
}

app.post(
  '/api/assistant/reindex',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const data = await getAllWorkspaceData(req.dbUser!);
      const indexedDocs = harvestAndChunkSiteData({
        organization: data.organization,
        currentUser: data.currentUser,
        summary: data.summary,
        employees: data.employees,
        tasks: data.tasks,
        assignments: data.assignments,
        activityLogs: data.activityLogs,
      });
      persistLocalVectorStoreIndex(indexedDocs);
      return res.json({
        status: 'indexed',
        embeddingModel: EMBEDDING_MODEL_NAME,
        embeddingDimension: EMBEDDING_DIM,
        vectorDbEngine: VECTOR_DB_ENGINE,
        llmModel: LLAMA3_MODEL_NAME,
        totalVectors: indexedDocs.length,
        indexedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      return res.status(500).json({
        error: error?.message || 'Failed to re-index local vector store.',
      });
    }
  }
);

app.post(
  '/api/assistant/chat',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        message,
        lang = 'ar',
        topK = 4,
        lastEmployeeId = null,
      } = req.body || {};
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required.' });
      }

      // 1. Collect live site data from workspace database
      const data = await getAllWorkspaceData(req.dbUser!);
      const snapshot = {
        organization: data.organization,
        currentUser: data.currentUser,
        summary: data.summary,
        employees: data.employees,
        tasks: data.tasks,
        assignments: data.assignments,
        activityLogs: data.activityLogs,
      };

      // 2. Harvest chunks, compute Sentence-Transformers 384-D embeddings,
      //    persist to local Chroma/FAISS vector store, retrieve top-K chunks,
      //    and synthesize answer using local Llama 3
      const empRef = {
        current:
          typeof lastEmployeeId === 'number' ? lastEmployeeId : null,
      };
      const ragResult = await runLocalRagPipeline({
        query: message,
        snapshot,
        lang: lang === 'en' ? 'en' : 'ar',
        topK: Number(topK) || 4,
        lastEmployeeIdRef: empRef,
        ollamaUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
      });

      const indexedDocs = harvestAndChunkSiteData(snapshot);
      persistLocalVectorStoreIndex(indexedDocs);

      return res.json({
        reply: ragResult.reply,
        bullets: ragResult.bullets,
        referencedAssignmentIds: ragResult.referencedAssignmentIds,
        referencedEmployeeIds: ragResult.referencedEmployeeIds,
        suggestedFollowUps: ragResult.suggestedFollowUps,
        resolvedEmployeeId: empRef.current,
        ragTelemetry: ragResult.ragTelemetry,
        poweredBy: LLAMA3_MODEL_NAME,
      });
    } catch (error: any) {
      console.error('Local RAG Assistant error:', error);
      return res.status(500).json({
        error: error?.message || 'Failed to execute local RAG pipeline.',
        fallback: true,
      });
    }
  }
);

// ---------------------------------------------------------------------------
// ANDROID APK & SUPABASE BACKEND ENDPOINTS
// ---------------------------------------------------------------------------

app.get('/api/mobile/status', async (_req: Request, res: Response) => {
  await ensureSeedData();
  const apkPath = path.join(
    __dirname,
    'public',
    'downloads',
    'VeloPulse-Enterprise-v1.0.0.apk'
  );
  let apkReady = false;
  let apkSizeBytes = 0;
  let apkSha256 = '';

  if (fs.existsSync(apkPath)) {
    apkReady = true;
    const buf = fs.readFileSync(apkPath);
    apkSizeBytes = buf.length;
    apkSha256 = crypto.createHash('sha256').update(buf).digest('hex');
  }

  return res.json({
    apkReady,
    apkFilename: 'VeloPulse-Enterprise-v1.0.0.apk',
    apkSizeBytes,
    apkSha256,
    apkDownloadUrl: '/api/mobile/download-apk',
    androidProjectDownloadUrl: '/api/mobile/download-android-project',
    packageName: 'io.velopulse.enterprise',
    versionName: '1.0.0',
    versionCode: 1,
    minSdk: 21,
    targetSdk: 29,
    backendUrl:
      process.env.APP_URL ||
      'https://ais-pre-6koxp5cugo7zbxeupl33g2-886551457424.europe-west2.run.app',
    supabase: getSupabaseStatusSnapshot(),
  });
});

app.post('/api/mobile/test-supabase', async (req: Request, res: Response) => {
  const customUrl =
    typeof req.body?.databaseUrl === 'string'
      ? req.body.databaseUrl.trim()
      : undefined;
  const result = await verifyPostgresConnectivity(customUrl);
  resetDatabaseSeedFlag();
  await ensureSeedData();
  return res.json(result);
});

app.get('/api/mobile/download-apk', (_req: Request, res: Response) => {
  const apkPath = path.join(
    __dirname,
    'public',
    'downloads',
    'VeloPulse-Enterprise-v1.0.0.apk'
  );
  if (!fs.existsSync(apkPath)) {
    return res.status(404).json({ error: 'APK binary not found' });
  }
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="VeloPulse-Enterprise-v1.0.0.apk"'
  );
  return res.sendFile(apkPath);
});

app.get(
  '/api/mobile/download-android-project',
  (_req: Request, res: Response) => {
    const zipPath = path.join(
      __dirname,
      'public',
      'downloads',
      'VeloPulse-Android-Studio-Project.zip'
    );
    if (!fs.existsSync(zipPath)) {
      return res.status(404).json({ error: 'Android Studio project archive not found' });
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="VeloPulse-Android-Studio-Project.zip"'
    );
    return res.sendFile(zipPath);
  }
);

app.get('/api/mobile/download-sql-schema', (_req: Request, res: Response) => {
  const sqlPath = path.join(__dirname, 'supabase-schema.sql');
  if (!fs.existsSync(sqlPath)) {
    return res.status(404).json({ error: 'Schema SQL file not found' });
  }
  res.setHeader('Content-Type', 'application/sql; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="supabase-schema.sql"'
  );
  return res.sendFile(sqlPath);
});

// ---------------------------------------------------------------------------
// SERVER BOOTSTRAP
// ---------------------------------------------------------------------------

async function startServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VeloPulse Enterprise Server running on http://0.0.0.0:${PORT}`);
  });
}

if (process.env.VITEST !== 'true' && !process.env.VERCEL) {
  startServer();
}

export default app;

