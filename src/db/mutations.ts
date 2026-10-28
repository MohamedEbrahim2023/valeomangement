import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, isPostgresConfigured } from './index.ts';
import { getLocalDb, nextId, saveLocalDb } from './local-store.ts';
import {
  notifications,
  organizations,
  taskAssignments,
  taskAttachments,
  taskProgressUpdates,
  taskReviews,
  tasks,
  taskSubmissions,
  users,
} from './schema.ts';
import {
  logActivity,
  notifyAdmins,
  notifyUser,
  UserRecord,
} from './repository.ts';
import { hashPassword, verifyPassword } from '../lib/security.ts';

export class AppError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode = 400, code = 'BAD_REQUEST') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function assertAdmin(user: UserRecord) {
  if (user.deletedAt || user.accountStatus === 'deactivated') {
    throw new AppError('Account is deactivated.', 403, 'ACCOUNT_DEACTIVATED');
  }
  if (user.role !== 'admin') {
    throw new AppError(
      'Forbidden: Administrative privileges required.',
      403,
      'FORBIDDEN_ADMIN_ONLY'
    );
  }
}

function assertActiveUser(user: UserRecord) {
  if (user.deletedAt || user.accountStatus === 'deactivated') {
    throw new AppError('Account is deactivated.', 403, 'ACCOUNT_DEACTIVATED');
  }
}

export async function createEmployeeByAdmin(
  admin: UserRecord,
  input: {
    fullName: string;
    email: string;
    department: string;
    jobTitle: string;
    employeeNumber?: string | null;
    accountStatus: 'active' | 'deactivated' | 'invited';
    temporaryPassword?: string;
  }
) {
  assertAdmin(admin);
  const cleanEmail = input.email.trim().toLowerCase();

  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    if (state.users.some((u) => u.email === cleanEmail)) {
      throw new AppError(
        'An employee account with this email address already exists.',
        409,
        'DUPLICATE_EMAIL'
      );
    }

    const tempPassword = input.temporaryPassword || 'Employee123!';
    const passwordHash = hashPassword(tempPassword);
    const empNumber =
      input.employeeNumber?.trim() ||
      `EMP-${Math.floor(100 + Math.random() * 899)}`;
    const now = new Date();

    const created: UserRecord = {
      id: nextId('users'),
      uid: `emp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      organizationId: admin.organizationId,
      email: cleanEmail,
      fullName: input.fullName.trim(),
      role: 'employee',
      department: input.department.trim(),
      jobTitle: input.jobTitle.trim(),
      employeeNumber: empNumber,
      avatarUrl: null,
      accountStatus: input.accountStatus,
      passwordHash,
      mustChangePassword: true,
      lastActivityAt: now,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    state.users.push(created);
    saveLocalDb();

    await logActivity({
      organizationId: admin.organizationId,
      actorId: admin.id,
      action: 'EMPLOYEE_CREATED',
      entityType: 'user',
      entityId: String(created.id),
      metadata: {
        fullName: created.fullName,
        department: created.department,
        jobTitle: created.jobTitle,
        accountStatus: created.accountStatus,
      },
    });

    await notifyAdmins({
      actorId: admin.id,
      eventType: 'EMPLOYEE_CREATED',
      title: `Employee Added: ${created.fullName}`,
      body: `${created.fullName} (${created.jobTitle}, ${created.department}) was added to the organization.`,
      idempotencyKey: `emp-created-${created.id}`,
    });

    return created;
  }

  try {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, cleanEmail));

    if (existing.length > 0) {
      throw new AppError(
        'An employee account with this email address already exists.',
        409,
        'DUPLICATE_EMAIL'
      );
    }

    const tempPassword = input.temporaryPassword || 'Employee123!';
    const passwordHash = hashPassword(tempPassword);
    const empNumber =
      input.employeeNumber?.trim() || `EMP-${Math.floor(100 + Math.random() * 899)}`;

    const [created] = await db
      .insert(users)
      .values({
        uid: `emp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        organizationId: admin.organizationId,
        email: cleanEmail,
        fullName: input.fullName.trim(),
        role: 'employee',
        department: input.department.trim(),
        jobTitle: input.jobTitle.trim(),
        employeeNumber: empNumber,
        accountStatus: input.accountStatus,
        passwordHash,
        mustChangePassword: true,
      })
      .returning();

    await logActivity({
      organizationId: admin.organizationId,
      actorId: admin.id,
      action: 'EMPLOYEE_CREATED',
      entityType: 'user',
      entityId: String(created.id),
      metadata: {
        fullName: created.fullName,
        department: created.department,
        jobTitle: created.jobTitle,
        accountStatus: created.accountStatus,
      },
    });

    await notifyAdmins({
      actorId: admin.id,
      eventType: 'EMPLOYEE_CREATED',
      title: `Employee Added: ${created.fullName}`,
      body: `${created.fullName} (${created.jobTitle}, ${created.department}) was added to the organization.`,
      idempotencyKey: `emp-created-${created.id}`,
    });

    return created;
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database error in createEmployeeByAdmin:', error);
    throw new Error('Failed to create employee record.', { cause: error });
  }
}

export async function updateEmployeeByAdmin(
  admin: UserRecord,
  employeeId: number,
  input: {
    fullName?: string;
    department?: string;
    jobTitle?: string;
    employeeNumber?: string | null;
    accountStatus?: 'active' | 'deactivated' | 'invited';
    role?: 'admin' | 'employee';
  }
) {
  assertAdmin(admin);

  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    const target = state.users.find((u) => u.id === employeeId);
    if (!target || target.deletedAt) {
      throw new AppError('Employee not found.', 404, 'NOT_FOUND');
    }

    if (
      target.id === admin.id &&
      (input.accountStatus === 'deactivated' || input.role === 'employee')
    ) {
      throw new AppError(
        'Administrators cannot deactivate or demote their own active session.',
        400,
        'SELF_LOCKOUT_PREVENTED'
      );
    }

    const prevStatus = target.accountStatus;
    target.fullName = input.fullName ?? target.fullName;
    target.department = input.department ?? target.department;
    target.jobTitle = input.jobTitle ?? target.jobTitle;
    if (input.employeeNumber !== undefined) {
      target.employeeNumber = input.employeeNumber;
    }
    target.accountStatus = input.accountStatus ?? target.accountStatus;
    target.role = input.role ?? target.role;
    target.updatedAt = new Date();
    saveLocalDb();

    const action =
      input.accountStatus === 'deactivated' && prevStatus !== 'deactivated'
        ? 'EMPLOYEE_DEACTIVATED'
        : input.accountStatus === 'active' && prevStatus === 'deactivated'
        ? 'EMPLOYEE_ACTIVATED'
        : 'EMPLOYEE_UPDATED';

    await logActivity({
      organizationId: admin.organizationId,
      actorId: admin.id,
      action,
      entityType: 'user',
      entityId: String(target.id),
      metadata: {
        fullName: target.fullName,
        accountStatus: target.accountStatus,
        department: target.department,
      },
    });

    return target;
  }

  try {
    const rows = await db.select().from(users).where(eq(users.id, employeeId));
    const target = rows[0];
    if (!target || target.deletedAt) {
      throw new AppError('Employee not found.', 404, 'NOT_FOUND');
    }

    if (
      target.id === admin.id &&
      (input.accountStatus === 'deactivated' || input.role === 'employee')
    ) {
      throw new AppError(
        'Administrators cannot deactivate or demote their own active session.',
        400,
        'SELF_LOCKOUT_PREVENTED'
      );
    }

    const [updated] = await db
      .update(users)
      .set({
        fullName: input.fullName ?? target.fullName,
        department: input.department ?? target.department,
        jobTitle: input.jobTitle ?? target.jobTitle,
        employeeNumber:
          input.employeeNumber !== undefined
            ? input.employeeNumber
            : target.employeeNumber,
        accountStatus: input.accountStatus ?? target.accountStatus,
        role: input.role ?? target.role,
        updatedAt: new Date(),
      })
      .where(eq(users.id, employeeId))
      .returning();

    const action =
      input.accountStatus === 'deactivated' && target.accountStatus !== 'deactivated'
        ? 'EMPLOYEE_DEACTIVATED'
        : input.accountStatus === 'active' && target.accountStatus === 'deactivated'
        ? 'EMPLOYEE_ACTIVATED'
        : 'EMPLOYEE_UPDATED';

    await logActivity({
      organizationId: admin.organizationId,
      actorId: admin.id,
      action,
      entityType: 'user',
      entityId: String(updated.id),
      metadata: {
        fullName: updated.fullName,
        accountStatus: updated.accountStatus,
        department: updated.department,
      },
    });

    return updated;
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database error in updateEmployeeByAdmin:', error);
    throw new Error('Failed to update employee record.', { cause: error });
  }
}

export async function archiveEmployeeByAdmin(
  admin: UserRecord,
  employeeId: number
) {
  assertAdmin(admin);
  if (admin.id === employeeId) {
    throw new AppError('Cannot delete your own administrator account.', 400);
  }

  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    const target = state.users.find((u) => u.id === employeeId);
    if (!target || target.deletedAt) {
      throw new AppError('Employee not found.', 404, 'NOT_FOUND');
    }

    const now = new Date();
    target.accountStatus = 'deactivated';
    target.deletedAt = now;
    target.updatedAt = now;

    const empAssignments = state.taskAssignments.filter(
      (a) => a.employeeId === employeeId
    );
    for (const assign of empAssignments) {
      if (assign.status !== 'approved' && assign.status !== 'canceled') {
        assign.status = 'canceled';
        assign.updatedAt = now;
      }
    }
    saveLocalDb();

    await logActivity({
      organizationId: admin.organizationId,
      actorId: admin.id,
      action: 'EMPLOYEE_ARCHIVED',
      entityType: 'user',
      entityId: String(employeeId),
      metadata: {
        fullName: target.fullName,
        preservedApprovedCount: empAssignments.filter(
          (a) => a.status === 'approved'
        ).length,
      },
    });

    return target;
  }

  try {
    const rows = await db.select().from(users).where(eq(users.id, employeeId));
    const target = rows[0];
    if (!target || target.deletedAt) {
      throw new AppError('Employee not found.', 404, 'NOT_FOUND');
    }

    const [archived] = await db
      .update(users)
      .set({
        accountStatus: 'deactivated',
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, employeeId))
      .returning();

    const empAssignments = await db
      .select()
      .from(taskAssignments)
      .where(eq(taskAssignments.employeeId, employeeId));

    for (const assign of empAssignments) {
      if (assign.status !== 'approved' && assign.status !== 'canceled') {
        await db
          .update(taskAssignments)
          .set({
            status: 'canceled',
            updatedAt: new Date(),
          })
          .where(eq(taskAssignments.id, assign.id));
      }
    }

    await logActivity({
      organizationId: admin.organizationId,
      actorId: admin.id,
      action: 'EMPLOYEE_ARCHIVED',
      entityType: 'user',
      entityId: String(employeeId),
      metadata: {
        fullName: target.fullName,
        preservedApprovedCount: empAssignments.filter((a) => a.status === 'approved')
          .length,
      },
    });

    return archived;
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database error in archiveEmployeeByAdmin:', error);
    throw new Error('Failed to archive employee.', { cause: error });
  }
}

export async function resetEmployeePasswordByAdmin(
  admin: UserRecord,
  employeeId: number,
  newTemporaryPassword: string
) {
  assertAdmin(admin);
  if (newTemporaryPassword.length < 8 || newTemporaryPassword.length > 128) {
    throw new AppError(
      'Temporary password must be between 8 and 128 characters.',
      400,
      'VALIDATION_ERROR'
    );
  }

  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    const target = state.users.find((u) => u.id === employeeId);
    if (!target || target.deletedAt) {
      throw new AppError('Employee not found.', 404, 'NOT_FOUND');
    }

    target.passwordHash = hashPassword(newTemporaryPassword);
    target.mustChangePassword = true;
    target.updatedAt = new Date();
    saveLocalDb();

    await logActivity({
      organizationId: admin.organizationId,
      actorId: admin.id,
      action: 'EMPLOYEE_PASSWORD_RESET_BY_ADMIN',
      entityType: 'user',
      entityId: String(employeeId),
      metadata: {
        targetEmail: target.email,
        mustChangePassword: true,
      },
    });

    await notifyUser({
      recipientId: employeeId,
      actorId: admin.id,
      eventType: 'PASSWORD_RESET',
      title: 'Temporary Password Issued by Administrator',
      body: 'An administrator reset your account password. Please update your password in Profile Settings.',
      idempotencyKey: `pwd-reset-${employeeId}-${Date.now()}`,
    });

    return target;
  }

  try {
    const rows = await db.select().from(users).where(eq(users.id, employeeId));
    const target = rows[0];
    if (!target || target.deletedAt) {
      throw new AppError('Employee not found.', 404, 'NOT_FOUND');
    }

    const passwordHash = hashPassword(newTemporaryPassword);
    const [updated] = await db
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, employeeId))
      .returning();

    await logActivity({
      organizationId: admin.organizationId,
      actorId: admin.id,
      action: 'EMPLOYEE_PASSWORD_RESET_BY_ADMIN',
      entityType: 'user',
      entityId: String(employeeId),
      metadata: {
        targetEmail: target.email,
        mustChangePassword: true,
      },
    });

    await notifyUser({
      recipientId: employeeId,
      actorId: admin.id,
      eventType: 'PASSWORD_RESET',
      title: 'Temporary Password Issued by Administrator',
      body: 'An administrator reset your account password. Please update your password in Profile Settings.',
      idempotencyKey: `pwd-reset-${employeeId}-${Date.now()}`,
    });

    return updated;
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database error in resetEmployeePasswordByAdmin:', error);
    throw new Error('Failed to reset employee password.', { cause: error });
  }
}

export async function updateSelfProfile(
  user: UserRecord,
  input: {
    fullName: string;
    jobTitle?: string;
    avatarUrl?: string | null;
  }
) {
  assertActiveUser(user);

  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    const target = state.users.find((u) => u.id === user.id);
    if (!target) {
      throw new AppError('User not found.', 404, 'NOT_FOUND');
    }
    const now = new Date();
    target.fullName = input.fullName.trim();
    target.jobTitle = input.jobTitle?.trim() || target.jobTitle;
    if (input.avatarUrl !== undefined) {
      target.avatarUrl = input.avatarUrl;
    }
    target.lastActivityAt = now;
    target.updatedAt = now;
    saveLocalDb();

    await logActivity({
      organizationId: user.organizationId,
      actorId: user.id,
      action: 'PROFILE_UPDATED',
      entityType: 'user',
      entityId: String(user.id),
      metadata: { fullName: target.fullName, jobTitle: target.jobTitle },
    });

    return target;
  }

  try {
    const [updated] = await db
      .update(users)
      .set({
        fullName: input.fullName.trim(),
        jobTitle: input.jobTitle?.trim() || user.jobTitle,
        avatarUrl: input.avatarUrl !== undefined ? input.avatarUrl : user.avatarUrl,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    await logActivity({
      organizationId: user.organizationId,
      actorId: user.id,
      action: 'PROFILE_UPDATED',
      entityType: 'user',
      entityId: String(user.id),
      metadata: { fullName: updated.fullName, jobTitle: updated.jobTitle },
    });

    return updated;
  } catch (error) {
    console.error('Database error in updateSelfProfile:', error);
    throw new Error('Failed to update profile.', { cause: error });
  }
}

export async function changeUserPassword(
  user: UserRecord,
  currentPassword: string,
  newPassword: string
) {
  assertActiveUser(user);
  if (user.passwordHash && !verifyPassword(currentPassword, user.passwordHash)) {
    throw new AppError('Current password is incorrect.', 400, 'INVALID_PASSWORD');
  }

  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    const target = state.users.find((u) => u.id === user.id);
    if (target) {
      target.passwordHash = hashPassword(newPassword);
      target.mustChangePassword = false;
      target.updatedAt = new Date();
      saveLocalDb();
    }
    await logActivity({
      organizationId: user.organizationId,
      actorId: user.id,
      action: 'PASSWORD_CHANGED',
      entityType: 'user',
      entityId: String(user.id),
    });
    return;
  }

  try {
    const newHash = hashPassword(newPassword);
    await db
      .update(users)
      .set({
        passwordHash: newHash,
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await logActivity({
      organizationId: user.organizationId,
      actorId: user.id,
      action: 'PASSWORD_CHANGED',
      entityType: 'user',
      entityId: String(user.id),
    });
  } catch (error) {
    console.error('Database error in changeUserPassword:', error);
    throw new Error('Failed to update password.', { cause: error });
  }
}

export async function createTaskWithAssignments(
  admin: UserRecord,
  input: {
    title: string;
    description: string;
    priority: 'Low' | 'Medium' | 'High' | 'Critical';
    category: string;
    startDate: string;
    dueDate: string;
    estimatedEffort?: number;
    assignedEmployeeIds: number[];
    checklist?: { id: string; label: string; done: boolean }[];
    completionCriteria?: string | null;
  }
) {
  assertAdmin(admin);

  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    const now = new Date();
    const createdTask: typeof tasks.$inferSelect = {
      id: nextId('tasks'),
      organizationId: admin.organizationId,
      title: input.title.trim(),
      description: input.description.trim(),
      priority: input.priority,
      category: input.category.trim(),
      startDate: new Date(input.startDate),
      dueDate: new Date(input.dueDate),
      createdBy: admin.id,
      estimatedEffort: input.estimatedEffort ?? 8,
      checklistJson: JSON.stringify(input.checklist ?? []),
      completionCriteria: input.completionCriteria?.trim() || null,
      taskStatus: 'active',
      canceledAt: null,
      createdAt: now,
      updatedAt: now,
    };
    state.tasks.push(createdTask);

    const uniqueEmployeeIds = Array.from(new Set(input.assignedEmployeeIds));
    const createdAssignments: (typeof taskAssignments.$inferSelect)[] = [];

    for (const empId of uniqueEmployeeIds) {
      const exists = state.taskAssignments.some(
        (a) => a.taskId === createdTask.id && a.employeeId === empId
      );
      if (!exists) {
        const assign: typeof taskAssignments.$inferSelect = {
          id: nextId('taskAssignments'),
          taskId: createdTask.id,
          employeeId: empId,
          assignedBy: admin.id,
          status: 'not_started',
          progressPercentage: 0,
          latestNote: null,
          startedAt: null,
          submittedAt: null,
          completedAt: null,
          qualityBonus: 0,
          version: 1,
          createdAt: now,
          updatedAt: now,
        };
        state.taskAssignments.push(assign);
        createdAssignments.push(assign);

        await notifyUser({
          recipientId: empId,
          actorId: admin.id,
          eventType: 'TASK_ASSIGNED',
          title: `New Task Assigned: ${createdTask.title}`,
          body: `Priority: ${createdTask.priority} · Due ${new Date(
            createdTask.dueDate
          ).toLocaleDateString()}`,
          relatedTaskId: createdTask.id,
          relatedAssignmentId: assign.id,
          idempotencyKey: `task-assign-${createdTask.id}-${empId}`,
        });
      }
    }
    saveLocalDb();

    await logActivity({
      organizationId: admin.organizationId,
      actorId: admin.id,
      action: 'TASK_CREATED',
      entityType: 'task',
      entityId: String(createdTask.id),
      metadata: {
        title: createdTask.title,
        priority: createdTask.priority,
        assignedEmployeeIds: uniqueEmployeeIds,
      },
    });

    return { task: createdTask, assignments: createdAssignments };
  }

  try {
    const [createdTask] = await db
      .insert(tasks)
      .values({
        organizationId: admin.organizationId,
        title: input.title.trim(),
        description: input.description.trim(),
        priority: input.priority,
        category: input.category.trim(),
        startDate: new Date(input.startDate),
        dueDate: new Date(input.dueDate),
        createdBy: admin.id,
        estimatedEffort: input.estimatedEffort ?? 8,
        checklistJson: JSON.stringify(input.checklist ?? []),
        completionCriteria: input.completionCriteria?.trim() || null,
        taskStatus: 'active',
      })
      .returning();

    const uniqueEmployeeIds = Array.from(new Set(input.assignedEmployeeIds));
    const createdAssignments = [];

    for (const empId of uniqueEmployeeIds) {
      const [assign] = await db
        .insert(taskAssignments)
        .values({
          taskId: createdTask.id,
          employeeId: empId,
          assignedBy: admin.id,
          status: 'not_started',
          progressPercentage: 0,
        })
        .onConflictDoNothing()
        .returning();

      if (assign) {
        createdAssignments.push(assign);
        await notifyUser({
          recipientId: empId,
          actorId: admin.id,
          eventType: 'TASK_ASSIGNED',
          title: `New Task Assigned: ${createdTask.title}`,
          body: `Priority: ${createdTask.priority} · Due ${new Date(
            createdTask.dueDate
          ).toLocaleDateString()}`,
          relatedTaskId: createdTask.id,
          relatedAssignmentId: assign.id,
          idempotencyKey: `task-assign-${createdTask.id}-${empId}`,
        });
      }
    }

    await logActivity({
      organizationId: admin.organizationId,
      actorId: admin.id,
      action: 'TASK_CREATED',
      entityType: 'task',
      entityId: String(createdTask.id),
      metadata: {
        title: createdTask.title,
        priority: createdTask.priority,
        assignedEmployeeIds: uniqueEmployeeIds,
      },
    });

    return { task: createdTask, assignments: createdAssignments };
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database error in createTaskWithAssignments:', error);
    throw new Error('Failed to create task and assignments.', { cause: error });
  }
}

export async function updateTaskByAdmin(
  admin: UserRecord,
  taskId: number,
  input: {
    title?: string;
    description?: string;
    priority?: 'Low' | 'Medium' | 'High' | 'Critical';
    category?: string;
    startDate?: string;
    dueDate?: string;
    estimatedEffort?: number;
    completionCriteria?: string | null;
    taskStatus?: 'active' | 'canceled' | 'archived';
    assignedEmployeeIds?: number[];
  }
) {
  assertAdmin(admin);

  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    const existingTask = state.tasks.find((t) => t.id === taskId);
    if (!existingTask) {
      throw new AppError('Task not found.', 404, 'NOT_FOUND');
    }

    const now = new Date();
    const isCanceling =
      input.taskStatus === 'canceled' && existingTask.taskStatus !== 'canceled';

    existingTask.title = input.title?.trim() ?? existingTask.title;
    existingTask.description =
      input.description?.trim() ?? existingTask.description;
    existingTask.priority = input.priority ?? existingTask.priority;
    existingTask.category = input.category?.trim() ?? existingTask.category;
    if (input.startDate) existingTask.startDate = new Date(input.startDate);
    if (input.dueDate) existingTask.dueDate = new Date(input.dueDate);
    if (input.estimatedEffort !== undefined) {
      existingTask.estimatedEffort = input.estimatedEffort;
    }
    if (input.completionCriteria !== undefined) {
      existingTask.completionCriteria = input.completionCriteria;
    }
    existingTask.taskStatus = input.taskStatus ?? existingTask.taskStatus;
    if (isCanceling) existingTask.canceledAt = now;
    existingTask.updatedAt = now;

    const currentAssignments = state.taskAssignments.filter(
      (a) => a.taskId === taskId
    );

    if (isCanceling) {
      for (const a of currentAssignments) {
        if (a.status !== 'approved') {
          a.status = 'canceled';
          a.updatedAt = now;
          await notifyUser({
            recipientId: a.employeeId,
            actorId: admin.id,
            eventType: 'TASK_CANCELED',
            title: `Task Canceled: ${existingTask.title}`,
            body: `The task "${existingTask.title}" has been canceled by an administrator.`,
            relatedTaskId: taskId,
            relatedAssignmentId: a.id,
            idempotencyKey: `task-cancel-${taskId}-${a.id}`,
          });
        }
      }
    } else if (input.assignedEmployeeIds) {
      const targetSet = new Set(input.assignedEmployeeIds);
      const currentMap = new Map(currentAssignments.map((a) => [a.employeeId, a]));

      for (const empId of targetSet) {
        const existingAssign = currentMap.get(empId);
        if (!existingAssign) {
          const createdAssign: typeof taskAssignments.$inferSelect = {
            id: nextId('taskAssignments'),
            taskId,
            employeeId: empId,
            assignedBy: admin.id,
            status: 'not_started',
            progressPercentage: 0,
            latestNote: null,
            startedAt: null,
            submittedAt: null,
            completedAt: null,
            qualityBonus: 0,
            version: 1,
            createdAt: now,
            updatedAt: now,
          };
          state.taskAssignments.push(createdAssign);
          await notifyUser({
            recipientId: empId,
            actorId: admin.id,
            eventType: 'TASK_ASSIGNED',
            title: `Task Assigned: ${existingTask.title}`,
            body: `You have been assigned to "${existingTask.title}".`,
            relatedTaskId: taskId,
            relatedAssignmentId: createdAssign.id,
            idempotencyKey: `task-reassign-${taskId}-${empId}-${Date.now()}`,
          });
        } else if (existingAssign.status === 'canceled') {
          existingAssign.status =
            existingAssign.progressPercentage > 0 ? 'in_progress' : 'not_started';
          existingAssign.updatedAt = now;
        }
      }

      for (const a of currentAssignments) {
        if (!targetSet.has(a.employeeId) && a.status !== 'approved') {
          a.status = 'canceled';
          a.updatedAt = now;
        }
      }
    }
    saveLocalDb();

    await logActivity({
      organizationId: admin.organizationId,
      actorId: admin.id,
      action: isCanceling ? 'TASK_CANCELED' : 'TASK_UPDATED',
      entityType: 'task',
      entityId: String(taskId),
      metadata: {
        title: existingTask.title,
        priority: existingTask.priority,
        dueDate: existingTask.dueDate,
        taskStatus: existingTask.taskStatus,
      },
    });

    return existingTask;
  }

  try {
    const existingRows = await db.select().from(tasks).where(eq(tasks.id, taskId));
    const existingTask = existingRows[0];
    if (!existingTask) {
      throw new AppError('Task not found.', 404, 'NOT_FOUND');
    }

    const isCanceling =
      input.taskStatus === 'canceled' && existingTask.taskStatus !== 'canceled';

    const [updatedTask] = await db
      .update(tasks)
      .set({
        title: input.title?.trim() ?? existingTask.title,
        description: input.description?.trim() ?? existingTask.description,
        priority: input.priority ?? existingTask.priority,
        category: input.category?.trim() ?? existingTask.category,
        startDate: input.startDate
          ? new Date(input.startDate)
          : existingTask.startDate,
        dueDate: input.dueDate ? new Date(input.dueDate) : existingTask.dueDate,
        estimatedEffort: input.estimatedEffort ?? existingTask.estimatedEffort,
        completionCriteria:
          input.completionCriteria !== undefined
            ? input.completionCriteria
            : existingTask.completionCriteria,
        taskStatus: input.taskStatus ?? existingTask.taskStatus,
        canceledAt: isCanceling ? new Date() : existingTask.canceledAt,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))
      .returning();

    const currentAssignments = await db
      .select()
      .from(taskAssignments)
      .where(eq(taskAssignments.taskId, taskId));

    if (isCanceling) {
      for (const a of currentAssignments) {
        if (a.status !== 'approved') {
          await db
            .update(taskAssignments)
            .set({ status: 'canceled', updatedAt: new Date() })
            .where(eq(taskAssignments.id, a.id));

          await notifyUser({
            recipientId: a.employeeId,
            actorId: admin.id,
            eventType: 'TASK_CANCELED',
            title: `Task Canceled: ${updatedTask.title}`,
            body: `The task "${updatedTask.title}" has been canceled by an administrator.`,
            relatedTaskId: taskId,
            relatedAssignmentId: a.id,
            idempotencyKey: `task-cancel-${taskId}-${a.id}`,
          });
        }
      }
    } else if (input.assignedEmployeeIds) {
      const targetSet = new Set(input.assignedEmployeeIds);
      const currentMap = new Map(currentAssignments.map((a) => [a.employeeId, a]));

      for (const empId of targetSet) {
        const existingAssign = currentMap.get(empId);
        if (!existingAssign) {
          const [createdAssign] = await db
            .insert(taskAssignments)
            .values({
              taskId,
              employeeId: empId,
              assignedBy: admin.id,
              status: 'not_started',
              progressPercentage: 0,
            })
            .returning();

          await notifyUser({
            recipientId: empId,
            actorId: admin.id,
            eventType: 'TASK_ASSIGNED',
            title: `Task Assigned: ${updatedTask.title}`,
            body: `You have been assigned to "${updatedTask.title}".`,
            relatedTaskId: taskId,
            relatedAssignmentId: createdAssign.id,
            idempotencyKey: `task-reassign-${taskId}-${empId}-${Date.now()}`,
          });
        } else if (existingAssign.status === 'canceled') {
          await db
            .update(taskAssignments)
            .set({
              status:
                existingAssign.progressPercentage > 0 ? 'in_progress' : 'not_started',
              updatedAt: new Date(),
            })
            .where(eq(taskAssignments.id, existingAssign.id));
        }
      }

      for (const a of currentAssignments) {
        if (!targetSet.has(a.employeeId) && a.status !== 'approved') {
          await db
            .update(taskAssignments)
            .set({ status: 'canceled', updatedAt: new Date() })
            .where(eq(taskAssignments.id, a.id));
        }
      }
    }

    await logActivity({
      organizationId: admin.organizationId,
      actorId: admin.id,
      action: isCanceling ? 'TASK_CANCELED' : 'TASK_UPDATED',
      entityType: 'task',
      entityId: String(taskId),
      metadata: {
        title: updatedTask.title,
        priority: updatedTask.priority,
        dueDate: updatedTask.dueDate,
        taskStatus: updatedTask.taskStatus,
      },
    });

    return updatedTask;
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database error in updateTaskByAdmin:', error);
    throw new Error('Failed to update task.', { cause: error });
  }
}

export async function startTaskAssignment(
  employee: UserRecord,
  assignmentId: number
) {
  assertActiveUser(employee);

  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    const assignment = state.taskAssignments.find((a) => a.id === assignmentId);
    if (!assignment) {
      throw new AppError('Task assignment not found.', 404, 'NOT_FOUND');
    }
    if (assignment.employeeId !== employee.id) {
      throw new AppError(
        'Forbidden: You can only start tasks assigned to your account.',
        403,
        'FORBIDDEN_NOT_ASSIGNEE'
      );
    }
    if (assignment.status === 'canceled') {
      throw new AppError('Cannot start a canceled assignment.', 400, 'CANCELED_TASK');
    }

    const task = state.tasks.find((t) => t.id === assignment.taskId);
    if (!task || task.taskStatus !== 'active') {
      throw new AppError(
        'Cannot start an inactive or canceled task.',
        400,
        'INACTIVE_TASK'
      );
    }

    if (assignment.status === 'in_progress') {
      return assignment;
    }
    if (assignment.status !== 'not_started') {
      throw new AppError(
        `Task cannot be started from status "${assignment.status}".`,
        400,
        'INVALID_STATE_TRANSITION'
      );
    }

    const now = new Date();
    assignment.status = 'in_progress';
    assignment.startedAt = assignment.startedAt ?? now;
    assignment.version += 1;
    assignment.updatedAt = now;

    const empRecord = state.users.find((u) => u.id === employee.id);
    if (empRecord) empRecord.lastActivityAt = now;
    saveLocalDb();

    await logActivity({
      organizationId: employee.organizationId,
      actorId: employee.id,
      action: 'TASK_STARTED',
      entityType: 'task_assignment',
      entityId: String(assignmentId),
      metadata: {
        taskId: task.id,
        taskTitle: task.title,
        employeeName: employee.fullName,
      },
    });

    await notifyAdmins({
      actorId: employee.id,
      eventType: 'TASK_STARTED',
      title: `Task Started: ${employee.fullName}`,
      body: `${employee.fullName} started working on "${task.title}".`,
      relatedTaskId: task.id,
      relatedAssignmentId: assignmentId,
      idempotencyKey: `start-assign-${assignmentId}`,
    });

    return assignment;
  }

  try {
    const rows = await db
      .select()
      .from(taskAssignments)
      .where(eq(taskAssignments.id, assignmentId));
    const assignment = rows[0];

    if (!assignment) {
      throw new AppError('Task assignment not found.', 404, 'NOT_FOUND');
    }
    if (assignment.employeeId !== employee.id) {
      throw new AppError(
        'Forbidden: You can only start tasks assigned to your account.',
        403,
        'FORBIDDEN_NOT_ASSIGNEE'
      );
    }
    if (assignment.status === 'canceled') {
      throw new AppError('Cannot start a canceled assignment.', 400, 'CANCELED_TASK');
    }

    const taskRows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, assignment.taskId));
    const task = taskRows[0];
    if (!task || task.taskStatus !== 'active') {
      throw new AppError('Cannot start an inactive or canceled task.', 400, 'INACTIVE_TASK');
    }

    if (assignment.status === 'in_progress') {
      return assignment;
    }
    if (assignment.status !== 'not_started') {
      throw new AppError(
        `Task cannot be started from status "${assignment.status}".`,
        400,
        'INVALID_STATE_TRANSITION'
      );
    }

    const now = new Date();
    const [updated] = await db
      .update(taskAssignments)
      .set({
        status: 'in_progress',
        startedAt: assignment.startedAt ?? now,
        version: assignment.version + 1,
        updatedAt: now,
      })
      .where(eq(taskAssignments.id, assignmentId))
      .returning();

    await db
      .update(users)
      .set({ lastActivityAt: now })
      .where(eq(users.id, employee.id));

    await logActivity({
      organizationId: employee.organizationId,
      actorId: employee.id,
      action: 'TASK_STARTED',
      entityType: 'task_assignment',
      entityId: String(assignmentId),
      metadata: {
        taskId: task.id,
        taskTitle: task.title,
        employeeName: employee.fullName,
      },
    });

    await notifyAdmins({
      actorId: employee.id,
      eventType: 'TASK_STARTED',
      title: `Task Started: ${employee.fullName}`,
      body: `${employee.fullName} started working on "${task.title}".`,
      relatedTaskId: task.id,
      relatedAssignmentId: assignmentId,
      idempotencyKey: `start-assign-${assignmentId}`,
    });

    return updated;
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database error in startTaskAssignment:', error);
    throw new Error('Failed to start task.', { cause: error });
  }
}

export async function submitProgressUpdate(
  employee: UserRecord,
  assignmentId: number,
  input: {
    progressPercentage: number;
    description: string;
    blockers?: string | null;
    nextSteps?: string | null;
    evidenceUrl?: string | null;
  }
) {
  assertActiveUser(employee);

  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    const assignment = state.taskAssignments.find((a) => a.id === assignmentId);
    if (!assignment) {
      throw new AppError('Assignment not found.', 404, 'NOT_FOUND');
    }
    if (assignment.employeeId !== employee.id) {
      throw new AppError(
        'Forbidden: You cannot modify another employee’s task progress.',
        403,
        'FORBIDDEN_NOT_ASSIGNEE'
      );
    }
    if (assignment.status === 'canceled' || assignment.status === 'approved') {
      throw new AppError(
        `Cannot update progress on an assignment with status "${assignment.status}".`,
        400,
        'INVALID_STATE_TRANSITION'
      );
    }

    const task = state.tasks.find((t) => t.id === assignment.taskId);
    if (!task || task.taskStatus !== 'active') {
      throw new AppError('Task is no longer active.', 400, 'INACTIVE_TASK');
    }

    const recentUpdates = state.taskProgressUpdates
      .filter((p) => p.assignmentId === assignmentId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    const latestUpdate = recentUpdates[0];
    if (
      latestUpdate &&
      latestUpdate.newPercentage === input.progressPercentage &&
      latestUpdate.description === input.description.trim() &&
      Date.now() - new Date(latestUpdate.createdAt).getTime() < 5000
    ) {
      return { assignment, progressEntry: latestUpdate };
    }

    const previousPercentage = assignment.progressPercentage;
    const now = new Date();
    const progressEntry: typeof taskProgressUpdates.$inferSelect = {
      id: nextId('taskProgressUpdates'),
      assignmentId,
      employeeId: employee.id,
      previousPercentage,
      newPercentage: input.progressPercentage,
      description: input.description.trim(),
      blockers: input.blockers?.trim() || null,
      nextSteps: input.nextSteps?.trim() || null,
      evidenceUrl: input.evidenceUrl?.trim() || null,
      createdAt: now,
    };
    state.taskProgressUpdates.push(progressEntry);

    assignment.status = 'in_progress';
    assignment.progressPercentage = input.progressPercentage;
    assignment.latestNote = input.description.trim();
    assignment.startedAt = assignment.startedAt ?? now;
    assignment.version += 1;
    assignment.updatedAt = now;

    const empRecord = state.users.find((u) => u.id === employee.id);
    if (empRecord) empRecord.lastActivityAt = now;
    saveLocalDb();

    await logActivity({
      organizationId: employee.organizationId,
      actorId: employee.id,
      action: 'PROGRESS_UPDATED',
      entityType: 'task_assignment',
      entityId: String(assignmentId),
      metadata: {
        taskId: task.id,
        taskTitle: task.title,
        previousPercentage,
        newPercentage: input.progressPercentage,
      },
    });

    await notifyAdmins({
      actorId: employee.id,
      eventType: 'PROGRESS_UPDATED',
      title: `Progress Updated: ${employee.fullName} (${previousPercentage}% → ${input.progressPercentage}%)`,
      body: `${employee.fullName} updated "${task.title}" to ${input.progressPercentage}%: "${input.description
        .trim()
        .slice(0, 120)}"`,
      relatedTaskId: task.id,
      relatedAssignmentId: assignmentId,
      idempotencyKey: `prog-update-${progressEntry.id}`,
    });

    return { assignment, progressEntry };
  }

  try {
    const rows = await db
      .select()
      .from(taskAssignments)
      .where(eq(taskAssignments.id, assignmentId));
    const assignment = rows[0];

    if (!assignment) {
      throw new AppError('Assignment not found.', 404, 'NOT_FOUND');
    }
    if (assignment.employeeId !== employee.id) {
      throw new AppError(
        'Forbidden: You cannot modify another employee’s task progress.',
        403,
        'FORBIDDEN_NOT_ASSIGNEE'
      );
    }
    if (assignment.status === 'canceled' || assignment.status === 'approved') {
      throw new AppError(
        `Cannot update progress on an assignment with status "${assignment.status}".`,
        400,
        'INVALID_STATE_TRANSITION'
      );
    }

    const taskRows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, assignment.taskId));
    const task = taskRows[0];
    if (!task || task.taskStatus !== 'active') {
      throw new AppError('Task is no longer active.', 400, 'INACTIVE_TASK');
    }

    const recentUpdates = await db
      .select()
      .from(taskProgressUpdates)
      .where(eq(taskProgressUpdates.assignmentId, assignmentId))
      .orderBy(desc(taskProgressUpdates.createdAt));

    const latestUpdate = recentUpdates[0];
    if (
      latestUpdate &&
      latestUpdate.newPercentage === input.progressPercentage &&
      latestUpdate.description === input.description.trim() &&
      Date.now() - new Date(latestUpdate.createdAt).getTime() < 5000
    ) {
      return { assignment, progressEntry: latestUpdate };
    }

    const previousPercentage = assignment.progressPercentage;
    const now = new Date();

    const [progressEntry] = await db
      .insert(taskProgressUpdates)
      .values({
        assignmentId,
        employeeId: employee.id,
        previousPercentage,
        newPercentage: input.progressPercentage,
        description: input.description.trim(),
        blockers: input.blockers?.trim() || null,
        nextSteps: input.nextSteps?.trim() || null,
        evidenceUrl: input.evidenceUrl?.trim() || null,
      })
      .returning();

    const [updatedAssignment] = await db
      .update(taskAssignments)
      .set({
        status: 'in_progress',
        progressPercentage: input.progressPercentage,
        latestNote: input.description.trim(),
        startedAt: assignment.startedAt ?? now,
        version: assignment.version + 1,
        updatedAt: now,
      })
      .where(eq(taskAssignments.id, assignmentId))
      .returning();

    await db
      .update(users)
      .set({ lastActivityAt: now })
      .where(eq(users.id, employee.id));

    await logActivity({
      organizationId: employee.organizationId,
      actorId: employee.id,
      action: 'PROGRESS_UPDATED',
      entityType: 'task_assignment',
      entityId: String(assignmentId),
      metadata: {
        taskId: task.id,
        taskTitle: task.title,
        previousPercentage,
        newPercentage: input.progressPercentage,
      },
    });

    await notifyAdmins({
      actorId: employee.id,
      eventType: 'PROGRESS_UPDATED',
      title: `Progress Updated: ${employee.fullName} (${previousPercentage}% → ${input.progressPercentage}%)`,
      body: `${employee.fullName} updated "${task.title}" to ${input.progressPercentage}%: "${input.description
        .trim()
        .slice(0, 120)}"`,
      relatedTaskId: task.id,
      relatedAssignmentId: assignmentId,
      idempotencyKey: `prog-update-${progressEntry.id}`,
    });

    return { assignment: updatedAssignment, progressEntry };
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database error in submitProgressUpdate:', error);
    throw new Error('Failed to record progress update.', { cause: error });
  }
}

export async function submitTaskForReview(
  employee: UserRecord,
  assignmentId: number,
  input: {
    progressPercentage: number;
    submissionSummary: string;
    evidenceNotes?: string | null;
  }
) {
  assertActiveUser(employee);

  if (input.progressPercentage !== 100) {
    throw new AppError(
      'Progress must be 100% to submit a task for completion review.',
      400,
      'INCOMPLETE_PROGRESS'
    );
  }

  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    const assignment = state.taskAssignments.find((a) => a.id === assignmentId);
    if (!assignment) {
      throw new AppError('Assignment not found.', 404, 'NOT_FOUND');
    }
    if (assignment.employeeId !== employee.id) {
      throw new AppError(
        'Forbidden: You can only submit your own assigned tasks.',
        403,
        'FORBIDDEN_NOT_ASSIGNEE'
      );
    }
    if (assignment.status === 'canceled' || assignment.status === 'approved') {
      throw new AppError(
        `Cannot submit an assignment with status "${assignment.status}".`,
        400,
        'INVALID_STATE_TRANSITION'
      );
    }

    const task = state.tasks.find((t) => t.id === assignment.taskId);
    if (!task || task.taskStatus !== 'active') {
      throw new AppError('Task is not active.', 400, 'INACTIVE_TASK');
    }

    const existingSubmissions = state.taskSubmissions
      .filter((s) => s.assignmentId === assignmentId)
      .sort((a, b) => b.version - a.version);
    const nextVersion =
      existingSubmissions.length > 0 ? existingSubmissions[0].version + 1 : 1;
    const now = new Date();

    if (assignment.progressPercentage !== 100) {
      state.taskProgressUpdates.push({
        id: nextId('taskProgressUpdates'),
        assignmentId,
        employeeId: employee.id,
        previousPercentage: assignment.progressPercentage,
        newPercentage: 100,
        description: `Submitted for completion review (v${nextVersion}): ${input.submissionSummary.trim()}`,
        blockers: null,
        nextSteps: null,
        evidenceUrl: null,
        createdAt: now,
      });
    }

    const submission: typeof taskSubmissions.$inferSelect = {
      id: nextId('taskSubmissions'),
      assignmentId,
      employeeId: employee.id,
      submissionSummary: input.submissionSummary.trim(),
      evidenceNotes: input.evidenceNotes?.trim() || null,
      version: nextVersion,
      submittedAt: now,
    };
    state.taskSubmissions.push(submission);

    assignment.status = 'awaiting_review';
    assignment.progressPercentage = 100;
    assignment.latestNote = input.submissionSummary.trim();
    assignment.startedAt = assignment.startedAt ?? now;
    assignment.submittedAt = now;
    assignment.version += 1;
    assignment.updatedAt = now;

    const empRecord = state.users.find((u) => u.id === employee.id);
    if (empRecord) empRecord.lastActivityAt = now;
    saveLocalDb();

    await logActivity({
      organizationId: employee.organizationId,
      actorId: employee.id,
      action: 'COMPLETION_SUBMITTED',
      entityType: 'task_assignment',
      entityId: String(assignmentId),
      metadata: {
        taskId: task.id,
        taskTitle: task.title,
        submissionVersion: nextVersion,
      },
    });

    await notifyAdmins({
      actorId: employee.id,
      eventType: 'WORK_SUBMITTED',
      title: `Completion Review Requested: ${employee.fullName}`,
      body: `${employee.fullName} submitted "${task.title}" (v${nextVersion}) for completion approval.`,
      relatedTaskId: task.id,
      relatedAssignmentId: assignmentId,
      idempotencyKey: `sub-review-${submission.id}`,
    });

    return { assignment, submission };
  }

  try {
    const rows = await db
      .select()
      .from(taskAssignments)
      .where(eq(taskAssignments.id, assignmentId));
    const assignment = rows[0];

    if (!assignment) {
      throw new AppError('Assignment not found.', 404, 'NOT_FOUND');
    }
    if (assignment.employeeId !== employee.id) {
      throw new AppError(
        'Forbidden: You can only submit your own assigned tasks.',
        403,
        'FORBIDDEN_NOT_ASSIGNEE'
      );
    }
    if (assignment.status === 'canceled' || assignment.status === 'approved') {
      throw new AppError(
        `Cannot submit an assignment with status "${assignment.status}".`,
        400,
        'INVALID_STATE_TRANSITION'
      );
    }

    const taskRows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, assignment.taskId));
    const task = taskRows[0];
    if (!task || task.taskStatus !== 'active') {
      throw new AppError('Task is not active.', 400, 'INACTIVE_TASK');
    }

    const existingSubmissions = await db
      .select()
      .from(taskSubmissions)
      .where(eq(taskSubmissions.assignmentId, assignmentId))
      .orderBy(desc(taskSubmissions.version));

    const nextVersion =
      existingSubmissions.length > 0 ? existingSubmissions[0].version + 1 : 1;

    const now = new Date();

    if (assignment.progressPercentage !== 100) {
      await db.insert(taskProgressUpdates).values({
        assignmentId,
        employeeId: employee.id,
        previousPercentage: assignment.progressPercentage,
        newPercentage: 100,
        description: `Submitted for completion review (v${nextVersion}): ${input.submissionSummary.trim()}`,
      });
    }

    const [submission] = await db
      .insert(taskSubmissions)
      .values({
        assignmentId,
        employeeId: employee.id,
        submissionSummary: input.submissionSummary.trim(),
        evidenceNotes: input.evidenceNotes?.trim() || null,
        version: nextVersion,
        submittedAt: now,
      })
      .returning();

    const [updatedAssignment] = await db
      .update(taskAssignments)
      .set({
        status: 'awaiting_review',
        progressPercentage: 100,
        latestNote: input.submissionSummary.trim(),
        startedAt: assignment.startedAt ?? now,
        submittedAt: now,
        version: assignment.version + 1,
        updatedAt: now,
      })
      .where(eq(taskAssignments.id, assignmentId))
      .returning();

    await db
      .update(users)
      .set({ lastActivityAt: now })
      .where(eq(users.id, employee.id));

    await logActivity({
      organizationId: employee.organizationId,
      actorId: employee.id,
      action: 'COMPLETION_SUBMITTED',
      entityType: 'task_assignment',
      entityId: String(assignmentId),
      metadata: {
        taskId: task.id,
        taskTitle: task.title,
        submissionVersion: nextVersion,
      },
    });

    await notifyAdmins({
      actorId: employee.id,
      eventType: 'WORK_SUBMITTED',
      title: `Completion Review Requested: ${employee.fullName}`,
      body: `${employee.fullName} submitted "${task.title}" (v${nextVersion}) for completion approval.`,
      relatedTaskId: task.id,
      relatedAssignmentId: assignmentId,
      idempotencyKey: `sub-review-${submission.id}`,
    });

    return { assignment: updatedAssignment, submission };
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database error in submitTaskForReview:', error);
    throw new Error('Failed to submit task for review.', { cause: error });
  }
}

export async function reviewTaskSubmission(
  admin: UserRecord,
  assignmentId: number,
  input: {
    decision: 'approved' | 'rejected' | 'changes_requested';
    reviewNotes: string;
    qualityBonusAwarded?: number;
  }
) {
  assertAdmin(admin);

  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    const assignment = state.taskAssignments.find((a) => a.id === assignmentId);
    if (!assignment) {
      throw new AppError('Assignment not found.', 404, 'NOT_FOUND');
    }
    if (assignment.status !== 'awaiting_review') {
      throw new AppError(
        'Only assignments awaiting review can be approved or rejected.',
        400,
        'INVALID_REVIEW_STATE'
      );
    }

    const task = state.tasks.find((t) => t.id === assignment.taskId);
    const subs = state.taskSubmissions
      .filter((s) => s.assignmentId === assignmentId)
      .sort((a, b) => b.version - a.version);
    const latestSubmission = subs[0];

    const now = new Date();
    const isApproved = input.decision === 'approved';
    const qualityBonus = isApproved ? (input.qualityBonusAwarded ?? 0) : 0;

    const review: typeof taskReviews.$inferSelect = {
      id: nextId('taskReviews'),
      assignmentId,
      submissionId: latestSubmission?.id ?? null,
      reviewerId: admin.id,
      decision: input.decision,
      reviewNotes: input.reviewNotes.trim(),
      qualityBonusAwarded: qualityBonus,
      createdAt: now,
    };
    state.taskReviews.push(review);

    assignment.status = isApproved ? 'approved' : 'in_progress';
    assignment.completedAt = isApproved ? now : null;
    if (isApproved) {
      assignment.qualityBonus = qualityBonus;
    }
    assignment.version += 1;
    assignment.updatedAt = now;
    saveLocalDb();

    await logActivity({
      organizationId: admin.organizationId,
      actorId: admin.id,
      action: isApproved ? 'COMPLETION_APPROVED' : 'COMPLETION_REJECTED',
      entityType: 'task_assignment',
      entityId: String(assignmentId),
      metadata: {
        taskId: task?.id,
        taskTitle: task?.title,
        decision: input.decision,
        qualityBonusAwarded: qualityBonus,
      },
    });

    await notifyUser({
      recipientId: assignment.employeeId,
      actorId: admin.id,
      eventType: isApproved ? 'TASK_APPROVED' : 'TASK_REJECTED',
      title: isApproved
        ? `Task Approved: ${task?.title || 'Assignment'}`
        : `Revision Requested: ${task?.title || 'Assignment'}`,
      body: isApproved
        ? `Your completion submission was approved by ${admin.fullName}. Notes: "${input.reviewNotes.trim()}"`
        : `${admin.fullName} requested revisions: "${input.reviewNotes.trim()}"`,
      relatedTaskId: task?.id,
      relatedAssignmentId: assignmentId,
      idempotencyKey: `review-decision-${review.id}`,
    });

    return { assignment, review };
  }

  try {
    const rows = await db
      .select()
      .from(taskAssignments)
      .where(eq(taskAssignments.id, assignmentId));
    const assignment = rows[0];

    if (!assignment) {
      throw new AppError('Assignment not found.', 404, 'NOT_FOUND');
    }
    if (assignment.status !== 'awaiting_review') {
      throw new AppError(
        'Only assignments awaiting review can be approved or rejected.',
        400,
        'INVALID_REVIEW_STATE'
      );
    }

    const taskRows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, assignment.taskId));
    const task = taskRows[0];

    const subs = await db
      .select()
      .from(taskSubmissions)
      .where(eq(taskSubmissions.assignmentId, assignmentId))
      .orderBy(desc(taskSubmissions.version));
    const latestSubmission = subs[0];

    const now = new Date();
    const isApproved = input.decision === 'approved';
    const qualityBonus = isApproved ? (input.qualityBonusAwarded ?? 0) : 0;

    const [review] = await db
      .insert(taskReviews)
      .values({
        assignmentId,
        submissionId: latestSubmission?.id ?? null,
        reviewerId: admin.id,
        decision: input.decision,
        reviewNotes: input.reviewNotes.trim(),
        qualityBonusAwarded: qualityBonus,
      })
      .returning();

    const newStatus = isApproved ? 'approved' : 'in_progress';

    const [updatedAssignment] = await db
      .update(taskAssignments)
      .set({
        status: newStatus,
        completedAt: isApproved ? now : null,
        qualityBonus: isApproved ? qualityBonus : assignment.qualityBonus,
        version: assignment.version + 1,
        updatedAt: now,
      })
      .where(eq(taskAssignments.id, assignmentId))
      .returning();

    await logActivity({
      organizationId: admin.organizationId,
      actorId: admin.id,
      action: isApproved ? 'COMPLETION_APPROVED' : 'COMPLETION_REJECTED',
      entityType: 'task_assignment',
      entityId: String(assignmentId),
      metadata: {
        taskId: task?.id,
        taskTitle: task?.title,
        decision: input.decision,
        qualityBonusAwarded: qualityBonus,
      },
    });

    await notifyUser({
      recipientId: assignment.employeeId,
      actorId: admin.id,
      eventType: isApproved ? 'TASK_APPROVED' : 'TASK_REJECTED',
      title: isApproved
        ? `Task Approved: ${task?.title || 'Assignment'}`
        : `Revision Requested: ${task?.title || 'Assignment'}`,
      body: isApproved
        ? `Your completion submission was approved by ${admin.fullName}. Notes: "${input.reviewNotes.trim()}"`
        : `${admin.fullName} requested revisions: "${input.reviewNotes.trim()}"`,
      relatedTaskId: task?.id,
      relatedAssignmentId: assignmentId,
      idempotencyKey: `review-decision-${review.id}`,
    });

    return { assignment: updatedAssignment, review };
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database error in reviewTaskSubmission:', error);
    throw new Error('Failed to record review decision.', { cause: error });
  }
}

export async function markNotificationAsRead(
  user: UserRecord,
  notificationId: number
) {
  assertActiveUser(user);

  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    const notif = state.notifications.find((n) => n.id === notificationId);
    if (!notif) {
      throw new AppError('Notification not found.', 404, 'NOT_FOUND');
    }
    if (notif.recipientId !== user.id) {
      throw new AppError(
        'Forbidden: Cannot access another user’s notification.',
        403,
        'FORBIDDEN_NOTIFICATION'
      );
    }
    notif.readAt = new Date();
    saveLocalDb();
    return notif;
  }

  try {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId));
    const notif = rows[0];
    if (!notif) {
      throw new AppError('Notification not found.', 404, 'NOT_FOUND');
    }
    if (notif.recipientId !== user.id) {
      throw new AppError(
        'Forbidden: Cannot access another user’s notification.',
        403,
        'FORBIDDEN_NOTIFICATION'
      );
    }

    const [updated] = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(eq(notifications.id, notificationId))
      .returning();

    return updated;
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database error in markNotificationAsRead:', error);
    throw new Error('Failed to mark notification as read.', { cause: error });
  }
}

export async function markAllNotificationsAsRead(user: UserRecord) {
  assertActiveUser(user);

  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    const now = new Date();
    for (const n of state.notifications) {
      if (n.recipientId === user.id && !n.readAt) {
        n.readAt = now;
      }
    }
    saveLocalDb();
    return { success: true };
  }

  try {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.recipientId, user.id),
          isNull(notifications.readAt)
        )
      );
    return { success: true };
  } catch (error) {
    console.error('Database error in markAllNotificationsAsRead:', error);
    throw new Error('Failed to mark notifications as read.', { cause: error });
  }
}

export async function updateOrganizationSettings(
  admin: UserRecord,
  input: {
    name: string;
    workHoursPerDay: number;
    scoringBasePoints: number;
    scoringOnTimeBonus: number;
    scoringQualityBonus: number;
  }
) {
  assertAdmin(admin);

  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    const org = state.organizations[0];
    if (!org) {
      throw new AppError('Organization not found.', 404, 'NOT_FOUND');
    }
    org.name = input.name.trim();
    org.workHoursPerDay = input.workHoursPerDay;
    org.scoringBasePoints = input.scoringBasePoints;
    org.scoringOnTimeBonus = input.scoringOnTimeBonus;
    org.scoringQualityBonus = input.scoringQualityBonus;
    org.updatedAt = new Date();
    saveLocalDb();

    await logActivity({
      organizationId: admin.organizationId,
      actorId: admin.id,
      action: 'ORG_SETTINGS_UPDATED',
      entityType: 'organization',
      entityId: String(org.id),
      metadata: {
        name: org.name,
        scoringBasePoints: org.scoringBasePoints,
        scoringOnTimeBonus: org.scoringOnTimeBonus,
      },
    });
    return org;
  }

  try {
    const orgs = await db.select().from(organizations);
    const org = orgs[0];
    if (!org) {
      throw new AppError('Organization not found.', 404, 'NOT_FOUND');
    }

    const [updated] = await db
      .update(organizations)
      .set({
        name: input.name.trim(),
        workHoursPerDay: input.workHoursPerDay,
        scoringBasePoints: input.scoringBasePoints,
        scoringOnTimeBonus: input.scoringOnTimeBonus,
        scoringQualityBonus: input.scoringQualityBonus,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, org.id))
      .returning();

    await logActivity({
      organizationId: admin.organizationId,
      actorId: admin.id,
      action: 'ORG_SETTINGS_UPDATED',
      entityType: 'organization',
      entityId: String(org.id),
      metadata: {
        name: updated.name,
        scoringBasePoints: updated.scoringBasePoints,
        scoringOnTimeBonus: updated.scoringOnTimeBonus,
      },
    });

    return updated;
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database error in updateOrganizationSettings:', error);
    throw new Error('Failed to update organization settings.', { cause: error });
  }
}

export async function addAttachmentMetadata(
  user: UserRecord,
  assignmentId: number,
  input: {
    originalFilename: string;
    contentType: string;
    fileSize: number;
  }
) {
  assertActiveUser(user);
  const allowedTypes = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'text/plain',
    'text/csv',
    'application/zip',
  ]);
  if (!allowedTypes.has(input.contentType)) {
    throw new AppError(
      'Unsupported attachment file type. Allowed: PDF, PNG, JPEG, TXT, CSV, ZIP.',
      400,
      'INVALID_ATTACHMENT_TYPE'
    );
  }
  if (input.fileSize <= 0 || input.fileSize > 10 * 1024 * 1024) {
    throw new AppError(
      'Attachment file size must be between 1 byte and 10 MB.',
      400,
      'INVALID_ATTACHMENT_SIZE'
    );
  }

  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    const assignment = state.taskAssignments.find((a) => a.id === assignmentId);
    if (!assignment) {
      throw new AppError('Assignment not found.', 404, 'NOT_FOUND');
    }
    if (user.role !== 'admin' && assignment.employeeId !== user.id) {
      throw new AppError('Forbidden.', 403, 'FORBIDDEN');
    }

    const safeName = input.originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const created: typeof taskAttachments.$inferSelect = {
      id: nextId('taskAttachments'),
      assignmentId,
      uploadedBy: user.id,
      storagePath: `/private/org-${user.organizationId}/assignments/${assignmentId}/${Date.now()}-${safeName}`,
      originalFilename: safeName,
      contentType: input.contentType,
      fileSize: input.fileSize,
      createdAt: new Date(),
    };
    state.taskAttachments.push(created);
    saveLocalDb();
    return created;
  }

  try {
    const rows = await db
      .select()
      .from(taskAssignments)
      .where(eq(taskAssignments.id, assignmentId));
    const assignment = rows[0];
    if (!assignment) {
      throw new AppError('Assignment not found.', 404, 'NOT_FOUND');
    }
    if (user.role !== 'admin' && assignment.employeeId !== user.id) {
      throw new AppError('Forbidden.', 403, 'FORBIDDEN');
    }

    const safeName = input.originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const [created] = await db
      .insert(taskAttachments)
      .values({
        assignmentId,
        uploadedBy: user.id,
        storagePath: `/private/org-${user.organizationId}/assignments/${assignmentId}/${Date.now()}-${safeName}`,
        originalFilename: safeName,
        contentType: input.contentType,
        fileSize: input.fileSize,
      })
      .returning();

    return created;
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Database error in addAttachmentMetadata:', error);
    throw new Error('Failed to attach file record.', { cause: error });
  }
}
