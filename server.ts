import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import {
  authenticateWithPassword,
  ensureSeedData,
  getAllWorkspaceData,
  logActivity,
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

// Security Headers Middleware
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );
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
app.get('/api/realtime/stream', (req: Request, res: Response) => {
  const token = String(req.query.token || '');
  if (!token) {
    return res.status(401).end();
  }

  // Strictly verify signed session token before allowing SSE subscription
  if (!verifySessionToken(token)) {
    return res.status(401).end();
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

  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
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
// AI DATABASE ASSISTANT (SERVER-SIDE GEMINI LLM WITH LIVE POSTGRESQL ACCESS)
// ---------------------------------------------------------------------------
app.post(
  '/api/assistant/chat',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const { message, history = [], lang = 'ar' } = req.body || {};
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required.' });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY is not configured on the server.',
          fallback: true,
        });
      }

      // Fetch real-time authoritative data from PostgreSQL
      const data = await getAllWorkspaceData(req.dbUser!);

      const activeAssignments = data.assignments
        .filter((a) => a.status !== 'canceled')
        .map((a) => ({
          assignmentId: a.id,
          taskId: a.taskId,
          taskTitle: a.task?.title || '',
          taskDescription: a.task?.description || '',
          priority: a.task?.priority || '',
          category: a.task?.category || '',
          startDate: a.task?.startDate || '',
          dueDate: a.task?.dueDate || '',
          employeeId: a.employeeId,
          employeeName: a.employee?.fullName || '',
          employeeDepartment: a.employee?.department || '',
          status: a.status,
          isCompleted100Percent:
            a.status === 'approved' || a.progressPercentage === 100,
          isUnfinished: a.status !== 'approved' && a.progressPercentage < 100,
          progressPercentage: a.progressPercentage,
          isOverdue: a.isOverdue,
          latestNote: a.latestNote,
          startedAt: a.startedAt,
          submittedAt: a.submittedAt,
          completedAt: a.completedAt,
          updatedAt: a.updatedAt,
          recentProgressUpdates: (a.progressUpdates || [])
            .slice(0, 3)
            .map((u) => ({
              from: u.previousPercentage,
              to: u.newPercentage,
              description: u.description,
              blockers: u.blockers,
              createdAt: u.createdAt,
            })),
        }));

      const employeesSnapshot = data.employees
        .filter((e) => e.accountStatus === 'active')
        .map((e) => ({
          employeeId: e.id,
          fullName: e.fullName,
          email: e.email,
          role: e.role,
          department: e.department,
          jobTitle: e.jobTitle,
          totalAssignedTasks: e.totalAssigned,
          approvedCompletedTasks: e.approvedCompleted,
          inProgressTasks: e.inProgress,
          awaitingReviewTasks: e.awaitingReview,
          notStartedTasks: e.notStarted,
          overdueTasks: e.overdue,
          completionRatePercent: e.completionRate,
          onTimeRatePercent: e.onTimeRate,
          weightedScorePoints: e.weightedScore,
        }));

      const dbSnapshotJson = JSON.stringify(
        {
          currentTimeISO: new Date().toISOString(),
          organizationName: data.organization.name,
          loggedInUser: {
            id: data.currentUser.id,
            fullName: data.currentUser.fullName,
            role: data.currentUser.role,
            department: data.currentUser.department,
          },
          platformSummary: data.summary,
          employees: employeesSnapshot,
          assignments: activeAssignments,
          recentActivityLogs: data.activityLogs.slice(0, 10).map((l) => ({
            actorName: l.actorName,
            action: l.action,
            entityType: l.entityType,
            createdAt: l.createdAt,
          })),
        },
        null,
        2
      );

      const recentHistoryText = Array.isArray(history)
        ? history
            .slice(-8)
            .map(
              (h: any) =>
                `${h.sender === 'user' ? 'User' : 'Assistant'}: ${h.text}${
                  Array.isArray(h.bullets) && h.bullets.length
                    ? '\n' + h.bullets.join('\n')
                    : ''
                }`
            )
            .join('\n\n')
        : '';

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const systemInstruction = `أنت المساعد الذكي الرسمي لمنصة "${data.organization.name}" (VeloPulse Enterprise).
لديك وصول مباشر وكامل وفوري إلى قاعدة بيانات المنصة الحية (PostgreSQL) المرفقة أدناه بصيغة JSON.

قواعد صارمة ودقيقة للإجابة:
1. افهم كلام المستخدم بذكاء عالٍ سواء كان باللهجة العامية المصرية (مثل: "ايه المهام اللي لسة مكتملتش"، "مين اللي خلص التاسكات بتاعته"، "احر مهمة خلصها كانت ايه"، "مين اشطر موظف") أو باللغة العربية الفصحى أو بالإنجليزية.
2. اعتمد حصرياً وبأمانة تامة على بيانات قاعدة البيانات الحية المرفقة في (LIVE_DATABASE_SNAPSHOT). لا تخمن ولا تخلط بين المهام المكتملة والمهام غير المكتملة أبداً:
   - المهام المكتملة (Completed/Finished): هي التي حالتها "approved" أو نسبة إنجازها 100% (isCompleted100Percent: true).
   - المهام غير المكتملة / التي لم تكتمل بعد / اللي لسة مخلصتش (Unfinished/Incomplete): هي المهام التي نسبة إنجازها أقل من 100% (isUnfinished: true، مثل حالة "not_started" أي 0% لم تبدأ بعد، أو "in_progress" قيد التنفيذ، أو "rejected"). انتبه: قد يكون عنوان المهمة نفسها مكتوباً بالعربية مثل "غير مكتملة"، فاذكر عنوانها بوضوح بين علامتي تنصيص واذكر من الموظف المسندة إليه ونسبتها الحالية (مثلاً 0%).
3. انتبه لسياق الحوار السابق (CONVERSATION_HISTORY): إذا سأل المستخدم سؤالاً تكميلياً بضمير الغائب (مثل: "آخر مهمة خلصها كانت إيه؟" أو "طب إيه مهامه اللي لسة مخلصتش؟") فإنه يقصد الموظف الذي كان الحديث عنه في الرسالة السابقة.
4. عند السؤال عن أفضل موظف أو متصدر الأداء، ركز على الموظفين الفعليين (role: "employee" أو من لديهم مهام مسندة) ولا تملأ القائمة بحسابات المديرين الفارغة (0/0).
5. اجعل إجابتك في حقل "reply" طبيعية، ذكية، مباشرة، وودودة بلغة المستخدم (${lang === 'ar' ? 'العربية' : 'English'})، وضع التفاصيل المنظمة والأرقام في مصفوفة "bullets"، وضع أرقام المهام المرتبطة في "referencedAssignmentIds" وأرقام الموظفين المرتبطين في "referencedEmployeeIds".`;

      const promptContent = `=== LIVE_DATABASE_SNAPSHOT ===
${dbSnapshotJson}

=== CONVERSATION_HISTORY ===
${recentHistoryText || 'No prior messages.'}

=== CURRENT_USER_QUESTION ===
${message}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: promptContent,
        config: {
          systemInstruction,
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description:
                  'Direct, intelligent conversational answer to the user question based on the live database.',
              },
              bullets: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  'Structured bullet points listing specific tasks, employees, percentages, statuses, or dates relevant to the answer.',
              },
              referencedAssignmentIds: {
                type: Type.ARRAY,
                items: { type: Type.INTEGER },
                description:
                  'List of assignmentId numbers mentioned in the answer.',
              },
              referencedEmployeeIds: {
                type: Type.ARRAY,
                items: { type: Type.INTEGER },
                description:
                  'List of employeeId numbers mentioned in the answer.',
              },
            },
            required: ['reply', 'bullets'],
          },
        },
      });

      const rawText = response.text || '{}';
      const parsed = JSON.parse(rawText);

      return res.json({
        reply: parsed.reply || '',
        bullets: Array.isArray(parsed.bullets) ? parsed.bullets : [],
        referencedAssignmentIds: Array.isArray(parsed.referencedAssignmentIds)
          ? parsed.referencedAssignmentIds
          : [],
        referencedEmployeeIds: Array.isArray(parsed.referencedEmployeeIds)
          ? parsed.referencedEmployeeIds
          : [],
        poweredBy: 'gemini-3.8-flash',
      });
    } catch (error: any) {
      console.error('AI Assistant error:', error);
      return res.status(500).json({
        error: error?.message || 'Failed to generate AI response.',
        fallback: true,
      });
    }
  }
);

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

