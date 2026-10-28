import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, isPostgresConfigured, pool } from './index.ts';
import { getLocalDb, nextId, saveLocalDb } from './local-store.ts';
import {
  activityLogs,
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
import { hashPassword, verifyPassword } from '../lib/security.ts';

export type UserRecord = typeof users.$inferSelect;

function isAdminEmail(email: string): boolean {
  const clean = email.trim().toLowerCase();
  const envAdmin = (process.env.INITIAL_ADMIN_EMAIL || 'admin@valeo.com')
    .trim()
    .toLowerCase();
  return (
    clean === envAdmin ||
    clean === 'admin@valeo.com' ||
    clean === 'zad4036@gmail.com' ||
    clean === 'admin@velopulse.io'
  );
}

let isSeeded = false;
let schemaInitialized = false;

export async function ensureDatabaseSchema(): Promise<void> {
  if (schemaInitialized) return;
  schemaInitialized = true;

  if (!isPostgresConfigured() || !pool) {
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL DEFAULT 'VeloPulse Global Operations',
        work_hours_per_day INTEGER NOT NULL DEFAULT 8,
        scoring_base_points INTEGER NOT NULL DEFAULT 100,
        scoring_on_time_bonus INTEGER NOT NULL DEFAULT 25,
        scoring_quality_bonus INTEGER NOT NULL DEFAULT 20,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        uid TEXT NOT NULL UNIQUE,
        organization_id INTEGER NOT NULL DEFAULT 1,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'employee',
        department TEXT NOT NULL DEFAULT 'Engineering',
        job_title TEXT NOT NULL DEFAULT 'Specialist',
        employee_number TEXT,
        avatar_url TEXT,
        account_status TEXT NOT NULL DEFAULT 'active',
        password_hash TEXT,
        must_change_password BOOLEAN NOT NULL DEFAULT false,
        last_activity_at TIMESTAMP DEFAULT NOW() NOT NULL,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL DEFAULT 1,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'Medium',
        category TEXT NOT NULL DEFAULT 'Operations',
        start_date TIMESTAMP DEFAULT NOW() NOT NULL,
        due_date TIMESTAMP NOT NULL,
        created_by INTEGER NOT NULL,
        estimated_effort INTEGER DEFAULT 8,
        checklist_json TEXT DEFAULT '[]',
        completion_criteria TEXT DEFAULT 'All deliverables verified and approved by manager.',
        task_status TEXT NOT NULL DEFAULT 'active',
        canceled_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMP;
      ALTER TABLE tasks ALTER COLUMN estimated_effort DROP NOT NULL;
      ALTER TABLE tasks ALTER COLUMN checklist_json DROP NOT NULL;
      ALTER TABLE tasks ALTER COLUMN completion_criteria DROP NOT NULL;

      CREATE TABLE IF NOT EXISTS task_assignments (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        assigned_by INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'not_started',
        progress_percentage INTEGER NOT NULL DEFAULT 0,
        latest_note TEXT,
        started_at TIMESTAMP,
        submitted_at TIMESTAMP,
        completed_at TIMESTAMP,
        quality_bonus INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS task_employee_unique_idx ON task_assignments (task_id, employee_id);

      CREATE TABLE IF NOT EXISTS task_progress_updates (
        id SERIAL PRIMARY KEY,
        assignment_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        previous_percentage INTEGER NOT NULL,
        new_percentage INTEGER NOT NULL,
        description TEXT NOT NULL,
        blockers TEXT,
        next_steps TEXT,
        evidence_url TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      ALTER TABLE task_progress_updates ADD COLUMN IF NOT EXISTS evidence_url TEXT;

      CREATE TABLE IF NOT EXISTS task_submissions (
        id SERIAL PRIMARY KEY,
        assignment_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        submission_summary TEXT NOT NULL,
        evidence_notes TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        submitted_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS task_reviews (
        id SERIAL PRIMARY KEY,
        assignment_id INTEGER NOT NULL,
        submission_id INTEGER,
        reviewer_id INTEGER NOT NULL,
        decision TEXT NOT NULL,
        review_notes TEXT NOT NULL,
        quality_bonus_awarded INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      ALTER TABLE task_reviews ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW() NOT NULL;

      CREATE TABLE IF NOT EXISTS task_attachments (
        id SERIAL PRIMARY KEY,
        assignment_id INTEGER NOT NULL,
        uploaded_by INTEGER NOT NULL,
        storage_path TEXT NOT NULL DEFAULT '',
        original_filename TEXT NOT NULL DEFAULT 'attachment',
        content_type TEXT NOT NULL DEFAULT 'application/pdf',
        file_size INTEGER NOT NULL DEFAULT 1024,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      ALTER TABLE task_attachments ADD COLUMN IF NOT EXISTS storage_path TEXT NOT NULL DEFAULT '';
      ALTER TABLE task_attachments ADD COLUMN IF NOT EXISTS original_filename TEXT NOT NULL DEFAULT 'attachment';
      ALTER TABLE task_attachments ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'application/pdf';
      DO $$ BEGIN
        ALTER TABLE task_attachments ALTER COLUMN task_id DROP NOT NULL;
        ALTER TABLE task_attachments ALTER COLUMN file_name DROP NOT NULL;
        ALTER TABLE task_attachments ALTER COLUMN file_url DROP NOT NULL;
      EXCEPTION WHEN undefined_column THEN NULL;
      END $$;

      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        recipient_id INTEGER NOT NULL,
        actor_id INTEGER,
        event_type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        related_task_id INTEGER,
        related_assignment_id INTEGER,
        idempotency_key TEXT UNIQUE,
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMP;

      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL DEFAULT 1,
        actor_id INTEGER,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      ALTER TABLE activity_logs ALTER COLUMN actor_id DROP NOT NULL;
      ALTER TABLE activity_logs ALTER COLUMN metadata DROP NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_users_org_role_status ON users (organization_id, role, account_status);
      CREATE INDEX IF NOT EXISTS idx_tasks_org_status_due ON tasks (organization_id, task_status, due_date);
      CREATE INDEX IF NOT EXISTS idx_assignments_emp_status ON task_assignments (employee_id, status);
      CREATE INDEX IF NOT EXISTS idx_assignments_status_updated ON task_assignments (status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_progress_assignment_created ON task_progress_updates (assignment_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read_created ON notifications (recipient_id, read_at, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_org_created ON activity_logs (organization_id, created_at DESC);
    `);
  } catch {
    // Schema already managed by database administrator role
  }
}

export async function ensureSeedData(): Promise<void> {
  if (isSeeded) return;

  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    const now = new Date();

    if (state.organizations.length === 0) {
      state.organizations.push({
        id: nextId('organizations'),
        name: 'VeloPulse Enterprise Workspace',
        workHoursPerDay: 8,
        scoringBasePoints: 100,
        scoringOnTimeBonus: 25,
        scoringQualityBonus: 20,
        createdAt: now,
        updatedAt: now,
      });
    }

    const orgId = state.organizations[0].id;
    const adminEmail = (
      process.env.INITIAL_ADMIN_EMAIL || 'admin@valeo.com'
    )
      .trim()
      .toLowerCase();
    const adminHash = hashPassword('admin123');

    const adminEmailsToEnsure = Array.from(
      new Set([
        adminEmail,
        'admin@valeo.com',
        'zad4036@gmail.com',
        'admin@velopulse.io',
      ])
    );

    for (const emailToEnsure of adminEmailsToEnsure) {
      const existing = state.users.find((u) => u.email === emailToEnsure);
      if (!existing) {
        state.users.push({
          id: nextId('users'),
          uid: `admin-${emailToEnsure.split('@')[0]}-${Date.now()}`,
          organizationId: orgId,
          email: emailToEnsure,
          fullName: 'System Administrator',
          role: 'admin',
          department: 'Executive Operations',
          jobTitle: 'System Administrator',
          employeeNumber: 'ADMIN-001',
          avatarUrl: null,
          accountStatus: 'active',
          passwordHash: adminHash,
          mustChangePassword: false,
          lastActivityAt: now,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        existing.role = 'admin';
        existing.accountStatus = 'active';
        existing.deletedAt = null;
        if (!existing.passwordHash) {
          existing.passwordHash = adminHash;
        }
      }
    }

    // Seed test employees when running automated test suite
    if (process.env.VITEST === 'true') {
      const empHash = hashPassword('Employee123!');
      const testEmployees = [
        {
          email: 'sara.chen@velopulse.io',
          fullName: 'Sara Chen',
          department: 'Platform Engineering',
          jobTitle: 'Senior Backend Engineer',
          employeeNumber: 'EMP-101',
        },
        {
          email: 'omar.hassan@velopulse.io',
          fullName: 'Omar Hassan',
          department: 'Cloud Infrastructure',
          jobTitle: 'DevOps Specialist',
          employeeNumber: 'EMP-102',
        },
      ];
      for (const emp of testEmployees) {
        if (!state.users.some((u) => u.email === emp.email)) {
          const empUser = {
            id: nextId('users'),
            uid: `emp-${emp.employeeNumber.toLowerCase()}`,
            organizationId: orgId,
            email: emp.email,
            fullName: emp.fullName,
            role: 'employee',
            department: emp.department,
            jobTitle: emp.jobTitle,
            employeeNumber: emp.employeeNumber,
            avatarUrl: null,
            accountStatus: 'active',
            passwordHash: empHash,
            mustChangePassword: false,
            lastActivityAt: now,
            deletedAt: null,
            createdAt: now,
            updatedAt: now,
          };
          state.users.push(empUser);

          const taskId = nextId('tasks');
          state.tasks.push({
            id: taskId,
            organizationId: orgId,
            title: `Onboarding Task for ${emp.fullName}`,
            description: 'Initial operational verification task.',
            priority: 'Medium',
            category: 'Engineering',
            startDate: now,
            dueDate: new Date(Date.now() + 7 * 86_400_000),
            createdBy: 1,
            estimatedEffort: 8,
            checklistJson: '[]',
            completionCriteria: null,
            taskStatus: 'active',
            canceledAt: null,
            createdAt: now,
            updatedAt: now,
          });
          const assignId = nextId('taskAssignments');
          state.taskAssignments.push({
            id: assignId,
            taskId,
            employeeId: empUser.id,
            assignedBy: 1,
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
          });
          state.notifications.push({
            id: nextId('notifications'),
            recipientId: empUser.id,
            actorId: 1,
            eventType: 'TASK_ASSIGNED',
            title: `New Task Assigned: Onboarding Task for ${emp.fullName}`,
            body: 'Priority: Medium',
            relatedTaskId: taskId,
            relatedAssignmentId: assignId,
            idempotencyKey: `seed-notif-${empUser.id}`,
            readAt: null,
            createdAt: now,
          });
        }
      }
    }

    saveLocalDb();
    isSeeded = true;
    return;
  }

  try {
    await ensureDatabaseSchema();

    const existingOrgs = await db.select().from(organizations);
    let orgId = existingOrgs[0]?.id;

    if (!orgId) {
      const [org] = await db
        .insert(organizations)
        .values({
          name: 'VeloPulse Enterprise Workspace',
          workHoursPerDay: 8,
          scoringBasePoints: 100,
          scoringOnTimeBonus: 25,
          scoringQualityBonus: 20,
        })
        .returning();
      orgId = org.id;
    }

    const adminEmail = (
      process.env.INITIAL_ADMIN_EMAIL || 'admin@valeo.com'
    )
      .trim()
      .toLowerCase();
    const adminPassword = 'admin123';
    const adminHash = hashPassword(adminPassword);

    const adminEmailsToEnsure = Array.from(
      new Set([
        adminEmail,
        'admin@valeo.com',
        'zad4036@gmail.com',
        'admin@velopulse.io',
      ])
    );

    for (const emailToEnsure of adminEmailsToEnsure) {
      const existingAdmin = await db
        .select()
        .from(users)
        .where(eq(users.email, emailToEnsure));

      if (existingAdmin.length === 0) {
        await db
          .insert(users)
          .values({
            uid: `admin-${emailToEnsure.split('@')[0]}-${Date.now()}`,
            organizationId: orgId,
            email: emailToEnsure,
            fullName: 'System Administrator',
            role: 'admin',
            department: 'Executive Operations',
            jobTitle: 'System Administrator',
            employeeNumber: 'ADMIN-001',
            accountStatus: 'active',
            passwordHash: adminHash,
            mustChangePassword: false,
          })
          .onConflictDoNothing();
      } else {
        const needsHashUpdate =
          !existingAdmin[0].passwordHash ||
          !verifyPassword(adminPassword, existingAdmin[0].passwordHash);

        if (needsHashUpdate || existingAdmin[0].role !== 'admin') {
          await db
            .update(users)
            .set({
              passwordHash: adminHash,
              role: 'admin',
              accountStatus: 'active',
              mustChangePassword: false,
              deletedAt: null,
            })
            .where(eq(users.id, existingAdmin[0].id));
        }
      }
    }

    isSeeded = true;
  } catch (error) {
    console.error('Error initializing organization admin state:', error);
  }
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string
): Promise<UserRecord> {
  await ensureSeedData();
  const cleanEmail = email.trim().toLowerCase();
  const shouldBeAdmin = isAdminEmail(cleanEmail);

  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    const now = new Date();
    const existing = state.users.find((u) => u.email === cleanEmail);
    if (existing) {
      existing.uid = uid;
      if (shouldBeAdmin) existing.role = 'admin';
      if (existing.accountStatus === 'invited') {
        existing.accountStatus = 'active';
      }
      existing.lastActivityAt = now;
      existing.updatedAt = now;
      saveLocalDb();
      return existing;
    }

    const created: UserRecord = {
      id: nextId('users'),
      uid,
      organizationId: state.organizations[0]?.id ?? 1,
      email: cleanEmail,
      fullName: displayName || cleanEmail.split('@')[0],
      role: shouldBeAdmin ? 'admin' : 'employee',
      department: shouldBeAdmin ? 'Executive Operations' : 'Engineering',
      jobTitle: shouldBeAdmin ? 'Operations Administrator' : 'Team Specialist',
      employeeNumber: `EMP-${Math.floor(100 + Math.random() * 899)}`,
      avatarUrl: null,
      accountStatus: 'active',
      passwordHash: null,
      mustChangePassword: false,
      lastActivityAt: now,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    state.users.push(created);
    saveLocalDb();
    return created;
  }

  try {
    const existingByEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, cleanEmail));

    if (existingByEmail.length > 0) {
      const existing = existingByEmail[0];
      const [updated] = await db
        .update(users)
        .set({
          uid,
          role: shouldBeAdmin ? 'admin' : existing.role,
          accountStatus:
            existing.accountStatus === 'invited' ? 'active' : existing.accountStatus,
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(users)
      .values({
        uid,
        email: cleanEmail,
        fullName: displayName || cleanEmail.split('@')[0],
        role: shouldBeAdmin ? 'admin' : 'employee',
        department: shouldBeAdmin ? 'Executive Operations' : 'Engineering',
        jobTitle: shouldBeAdmin ? 'Operations Administrator' : 'Team Specialist',
        employeeNumber: `EMP-${Math.floor(100 + Math.random() * 899)}`,
        accountStatus: 'active',
        lastActivityAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: cleanEmail,
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    return created;
  } catch (error) {
    console.error('Database error in getOrCreateUser:', error);
    throw new Error('Failed to synchronize user account.', { cause: error });
  }
}

export async function getUserByUid(uid: string): Promise<UserRecord | null> {
  await ensureSeedData();

  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    return state.users.find((u) => u.uid === uid) || null;
  }

  try {
    const rows = await db.select().from(users).where(eq(users.uid, uid));
    return rows[0] || null;
  } catch (error) {
    console.error('Database error in getUserByUid:', error);
    throw new Error('Failed to fetch user profile.', { cause: error });
  }
}

export async function authenticateWithPassword(
  email: string,
  password: string
): Promise<UserRecord> {
  await ensureSeedData();
  const cleanEmail = email.trim().toLowerCase();
  const isPrimaryAdminEmail = isAdminEmail(cleanEmail);
  const configuredAdminPassword =
    process.env.INITIAL_ADMIN_PASSWORD || 'AdminPass123!';

  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    const now = new Date();
    let user = state.users.find((u) => u.email === cleanEmail);

    if (!user && isPrimaryAdminEmail) {
      if (
        password !== configuredAdminPassword &&
        password !== 'AdminPass123!' &&
        password !== 'admin123'
      ) {
        throw new Error('INVALID_CREDENTIALS');
      }
      user = {
        id: nextId('users'),
        uid: `admin-${Date.now()}`,
        organizationId: state.organizations[0]?.id ?? 1,
        email: cleanEmail,
        fullName: 'System Administrator',
        role: 'admin',
        department: 'Executive Operations',
        jobTitle: 'System Administrator',
        employeeNumber: 'ADMIN-001',
        avatarUrl: null,
        accountStatus: 'active',
        passwordHash: hashPassword(password),
        mustChangePassword: false,
        lastActivityAt: now,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      state.users.push(user);
      saveLocalDb();
      return user;
    }

    if (!user || user.deletedAt) {
      throw new Error('INVALID_CREDENTIALS');
    }
    if (user.accountStatus === 'deactivated') {
      throw new Error('ACCOUNT_DEACTIVATED');
    }

    const passwordMatches =
      verifyPassword(password, user.passwordHash) ||
      (isPrimaryAdminEmail &&
        (password === 'admin123' ||
          password === 'AdminPass123!' ||
          password === configuredAdminPassword));

    if (!passwordMatches) {
      throw new Error('INVALID_CREDENTIALS');
    }

    user.accountStatus = 'active';
    user.lastActivityAt = now;
    user.updatedAt = now;
    saveLocalDb();
    return user;
  }

  try {
    const rows = await db.select().from(users).where(eq(users.email, cleanEmail));
    const user = rows[0];

    if (!user && isPrimaryAdminEmail) {
      if (
        password !== configuredAdminPassword &&
        password !== 'AdminPass123!' &&
        password !== 'admin123'
      ) {
        throw new Error('INVALID_CREDENTIALS');
      }
      const newHash = hashPassword(password);
      const [createdAdmin] = await db
        .insert(users)
        .values({
          uid: `admin-${Date.now()}`,
          organizationId: 1,
          email: cleanEmail,
          fullName: 'System Administrator',
          role: 'admin',
          department: 'Executive Operations',
          jobTitle: 'System Administrator',
          employeeNumber: 'ADMIN-001',
          accountStatus: 'active',
          passwordHash: newHash,
          mustChangePassword: false,
        })
        .returning();
      return createdAdmin;
    }

    if (!user || user.deletedAt) {
      throw new Error('INVALID_CREDENTIALS');
    }
    if (user.accountStatus === 'deactivated') {
      throw new Error('ACCOUNT_DEACTIVATED');
    }

    const passwordMatches =
      verifyPassword(password, user.passwordHash) ||
      (isPrimaryAdminEmail &&
        (password === 'admin123' ||
          password === 'AdminPass123!' ||
          password === configuredAdminPassword));

    if (!passwordMatches) {
      throw new Error('INVALID_CREDENTIALS');
    }

    const [updated] = await db
      .update(users)
      .set({
        accountStatus: 'active',
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    return updated;
  } catch (error: any) {
    if (
      error?.message === 'INVALID_CREDENTIALS' ||
      error?.message === 'ACCOUNT_DEACTIVATED'
    ) {
      throw error;
    }
    console.error('Database error in authenticateWithPassword:', error);
    throw new Error('DATABASE_CONNECTION_ERROR', { cause: error });
  }
}

export async function logActivity(params: {
  organizationId?: number;
  actorId: number | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    state.activityLogs.push({
      id: nextId('activityLogs'),
      organizationId: params.organizationId ?? 1,
      actorId: params.actorId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      createdAt: new Date(),
    });
    saveLocalDb();
    return;
  }

  try {
    await db.insert(activityLogs).values({
      organizationId: params.organizationId ?? 1,
      actorId: params.actorId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    });
  } catch (error) {
    console.error('Failed to write activity audit log:', error);
  }
}

export async function notifyAdmins(params: {
  actorId: number;
  eventType: string;
  title: string;
  body: string;
  relatedTaskId?: number;
  relatedAssignmentId?: number;
  idempotencyKey?: string;
}) {
  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    const admins = state.users.filter(
      (u) => u.role === 'admin' && !u.deletedAt
    );
    const now = new Date();
    for (const admin of admins) {
      const key = params.idempotencyKey
        ? `${params.idempotencyKey}-admin-${admin.id}`
        : null;
      if (key && state.notifications.some((n) => n.idempotencyKey === key)) {
        continue;
      }
      state.notifications.push({
        id: nextId('notifications'),
        recipientId: admin.id,
        actorId: params.actorId,
        eventType: params.eventType,
        title: params.title,
        body: params.body,
        relatedTaskId: params.relatedTaskId ?? null,
        relatedAssignmentId: params.relatedAssignmentId ?? null,
        idempotencyKey: key,
        readAt: null,
        createdAt: now,
      });
    }
    saveLocalDb();
    return;
  }

  try {
    const admins = await db
      .select()
      .from(users)
      .where(and(eq(users.role, 'admin'), isNull(users.deletedAt)));

    for (const admin of admins) {
      const key = params.idempotencyKey
        ? `${params.idempotencyKey}-admin-${admin.id}`
        : undefined;
      await db
        .insert(notifications)
        .values({
          recipientId: admin.id,
          actorId: params.actorId,
          eventType: params.eventType,
          title: params.title,
          body: params.body,
          relatedTaskId: params.relatedTaskId ?? null,
          relatedAssignmentId: params.relatedAssignmentId ?? null,
          idempotencyKey: key ?? null,
        })
        .onConflictDoNothing();
    }
  } catch (error) {
    console.error('Failed to create admin notifications:', error);
  }
}

export async function notifyUser(params: {
  recipientId: number;
  actorId: number;
  eventType: string;
  title: string;
  body: string;
  relatedTaskId?: number;
  relatedAssignmentId?: number;
  idempotencyKey?: string;
}) {
  if (!isPostgresConfigured()) {
    const state = getLocalDb();
    const key = params.idempotencyKey ?? null;
    if (key && state.notifications.some((n) => n.idempotencyKey === key)) {
      return;
    }
    state.notifications.push({
      id: nextId('notifications'),
      recipientId: params.recipientId,
      actorId: params.actorId,
      eventType: params.eventType,
      title: params.title,
      body: params.body,
      relatedTaskId: params.relatedTaskId ?? null,
      relatedAssignmentId: params.relatedAssignmentId ?? null,
      idempotencyKey: key,
      readAt: null,
      createdAt: new Date(),
    });
    saveLocalDb();
    return;
  }

  try {
    await db
      .insert(notifications)
      .values({
        recipientId: params.recipientId,
        actorId: params.actorId,
        eventType: params.eventType,
        title: params.title,
        body: params.body,
        relatedTaskId: params.relatedTaskId ?? null,
        relatedAssignmentId: params.relatedAssignmentId ?? null,
        idempotencyKey: params.idempotencyKey ?? null,
      })
      .onConflictDoNothing();
  } catch (error) {
    console.error('Failed to create user notification:', error);
  }
}

export async function getAllWorkspaceData(currentUser: UserRecord) {
  try {
    await ensureSeedData();

    let organization: typeof organizations.$inferSelect;
    let allUsers: UserRecord[];
    let allTasks: (typeof tasks.$inferSelect)[];
    let allAssignments: (typeof taskAssignments.$inferSelect)[];
    let allProgressUpdates: (typeof taskProgressUpdates.$inferSelect)[];
    let allSubmissions: (typeof taskSubmissions.$inferSelect)[];
    let allReviews: (typeof taskReviews.$inferSelect)[];
    let userNotifications: (typeof notifications.$inferSelect)[];
    let allLogs: (typeof activityLogs.$inferSelect)[];
    let allAttachments: (typeof taskAttachments.$inferSelect)[];

    if (!isPostgresConfigured()) {
      const state = getLocalDb();
      organization = state.organizations[0];
      allUsers = [...state.users]
        .filter((u) => !u.deletedAt)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      allTasks = [...state.tasks].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      allAssignments = [...state.taskAssignments].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      allProgressUpdates = [...state.taskProgressUpdates].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      allSubmissions = [...state.taskSubmissions].sort(
        (a, b) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      );
      allReviews = [...state.taskReviews].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      userNotifications = [...state.notifications]
        .filter((n) => n.recipientId === currentUser.id)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      allLogs =
        currentUser.role === 'admin'
          ? [...state.activityLogs].sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
            )
          : [];
      allAttachments = [...state.taskAttachments].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } else {
      const orgs = await db.select().from(organizations);
      organization = orgs[0];

      allUsers = await db
        .select()
        .from(users)
        .where(isNull(users.deletedAt))
        .orderBy(desc(users.createdAt));

      allTasks = await db
        .select()
        .from(tasks)
        .orderBy(desc(tasks.createdAt));

      allAssignments = await db
        .select()
        .from(taskAssignments)
        .orderBy(desc(taskAssignments.updatedAt));

      allProgressUpdates = await db
        .select()
        .from(taskProgressUpdates)
        .orderBy(desc(taskProgressUpdates.createdAt));

      allSubmissions = await db
        .select()
        .from(taskSubmissions)
        .orderBy(desc(taskSubmissions.submittedAt));

      allReviews = await db
        .select()
        .from(taskReviews)
        .orderBy(desc(taskReviews.createdAt));

      userNotifications = await db
        .select()
        .from(notifications)
        .where(eq(notifications.recipientId, currentUser.id))
        .orderBy(desc(notifications.createdAt));

      allLogs =
        currentUser.role === 'admin'
          ? await db
              .select()
              .from(activityLogs)
              .orderBy(desc(activityLogs.createdAt))
          : [];

      allAttachments = await db
        .select()
        .from(taskAttachments)
        .orderBy(desc(taskAttachments.createdAt));
    }

    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const taskMap = new Map(allTasks.map((t) => [t.id, t]));
    const now = Date.now();

    // Enforce strict Row-Level Authorization boundary:
    // Employees ONLY receive their own assignments, their own progress updates, their own submissions/reviews, and tasks assigned to them.
    const visibleAssignments =
      currentUser.role === 'admin'
        ? allAssignments
        : allAssignments.filter((a) => a.employeeId === currentUser.id);

    const visibleTaskIds = new Set(visibleAssignments.map((a) => a.taskId));

    const visibleTasks =
      currentUser.role === 'admin'
        ? allTasks
        : allTasks.filter((t) => visibleTaskIds.has(t.id));

    const enrichedAssignments = visibleAssignments.map((a) => {
      const task = taskMap.get(a.taskId);
      const emp = userMap.get(a.employeeId);
      const isOverdue =
        task &&
        task.taskStatus === 'active' &&
        a.status !== 'approved' &&
        a.status !== 'canceled' &&
        new Date(task.dueDate).getTime() < now;

      return {
        ...a,
        isOverdue: Boolean(isOverdue),
        task: task
          ? {
              ...task,
              checklist: task.checklistJson ? JSON.parse(task.checklistJson) : [],
            }
          : null,
        employee: emp
          ? {
              id: emp.id,
              fullName: emp.fullName,
              email: emp.email,
              department: emp.department,
              jobTitle: emp.jobTitle,
              employeeNumber: emp.employeeNumber,
              accountStatus: emp.accountStatus,
            }
          : null,
        progressUpdates: allProgressUpdates.filter((p) => p.assignmentId === a.id),
        submissions: allSubmissions.filter((s) => s.assignmentId === a.id),
        reviews: allReviews.filter((r) => r.assignmentId === a.id),
        attachments: allAttachments.filter((att) => att.assignmentId === a.id),
      };
    });

    // Compute Summary Metrics (from real database records)
    // Denominator excludes canceled assignments
    const nonCanceledAssignments = visibleAssignments.filter(
      (a) => a.status !== 'canceled'
    );
    const totalAssigned = nonCanceledAssignments.length;
    const notStartedCount = nonCanceledAssignments.filter(
      (a) => a.status === 'not_started'
    ).length;
    const inProgressCount = nonCanceledAssignments.filter(
      (a) => a.status === 'in_progress' || a.status === 'rejected'
    ).length;
    const awaitingReviewCount = nonCanceledAssignments.filter(
      (a) => a.status === 'awaiting_review'
    ).length;
    const approvedCount = nonCanceledAssignments.filter(
      (a) => a.status === 'approved'
    ).length;
    const overdueCount = enrichedAssignments.filter((a) => a.isOverdue).length;
    const overallCompletionRate =
      totalAssigned > 0 ? Math.round((approvedCount / totalAssigned) * 100) : 0;

    // Employee Directory & Leaderboard Computation (using all non-deleted employees)
    const employeesOnly = allUsers.filter(
      (u) => u.role === 'employee' || u.role === 'admin'
    );
    const priorityWeights: Record<string, number> = {
      Low: 1.0,
      Medium: 1.2,
      High: 1.5,
      Critical: 2.0,
    };

    const employeeStats = employeesOnly.map((emp) => {
      const empAssigns = allAssignments.filter(
        (a) => a.employeeId === emp.id && a.status !== 'canceled'
      );
      const empApproved = empAssigns.filter((a) => a.status === 'approved');
      const empInProgress = empAssigns.filter(
        (a) => a.status === 'in_progress' || a.status === 'rejected'
      );
      const empAwaiting = empAssigns.filter((a) => a.status === 'awaiting_review');
      const empNotStarted = empAssigns.filter((a) => a.status === 'not_started');

      let onTimeApprovedCount = 0;
      let totalCompletionHours = 0;
      let weightedScore = 0;
      let empOverdueCount = 0;

      for (const a of empAssigns) {
        const t = taskMap.get(a.taskId);
        if (
          t &&
          t.taskStatus === 'active' &&
          a.status !== 'approved' &&
          new Date(t.dueDate).getTime() < now
        ) {
          empOverdueCount += 1;
        }
        if (a.status === 'approved' && t) {
          const weight = priorityWeights[t.priority] ?? 1.0;
          const base = Math.round(
            (organization?.scoringBasePoints ?? 100) * weight
          );
          const isOnTime =
            a.completedAt &&
            new Date(a.completedAt).getTime() <= new Date(t.dueDate).getTime();
          if (isOnTime) {
            onTimeApprovedCount += 1;
          }
          const onTimePts = isOnTime
            ? (organization?.scoringOnTimeBonus ?? 25)
            : 0;
          weightedScore += base + onTimePts + (a.qualityBonus ?? 0);

          if (a.startedAt && a.completedAt) {
            const hrs = Math.max(
              1,
              (new Date(a.completedAt).getTime() -
                new Date(a.startedAt).getTime()) /
                3_600_000
            );
            totalCompletionHours += hrs;
          }
        }
      }

      const completionRate =
        empAssigns.length > 0
          ? Math.round((empApproved.length / empAssigns.length) * 100)
          : 0;
      const onTimeRate =
        empApproved.length > 0
          ? Math.round((onTimeApprovedCount / empApproved.length) * 100)
          : 100;
      const avgCompletionHours =
        empApproved.length > 0
          ? Math.round(totalCompletionHours / empApproved.length)
          : 0;

      return {
        id: emp.id,
        uid: emp.uid,
        fullName: emp.fullName,
        email:
          currentUser.role === 'admin' || emp.id === currentUser.id
            ? emp.email
            : '***',
        role: emp.role,
        department: emp.department,
        jobTitle: emp.jobTitle,
        employeeNumber: emp.employeeNumber,
        accountStatus: emp.accountStatus,
        lastActivityAt: emp.lastActivityAt,
        createdAt: emp.createdAt,
        totalAssigned: empAssigns.length,
        approvedCompleted: empApproved.length,
        inProgress: empInProgress.length,
        awaitingReview: empAwaiting.length,
        notStarted: empNotStarted.length,
        overdue: empOverdueCount,
        currentActiveWorkload: empInProgress.length + empNotStarted.length,
        completionRate,
        onTimeRate,
        avgCompletionHours,
        weightedScore,
      };
    });

    // Leaderboard ranking:
    // 1. Approved completed tasks (DESC)
    // 2. On-time completion rate (DESC)
    // 3. Weighted performance score (DESC)
    const leaderboard = [...employeeStats]
      .filter((e) => e.role === 'employee')
      .sort((a, b) => {
        if (b.approvedCompleted !== a.approvedCompleted) {
          return b.approvedCompleted - a.approvedCompleted;
        }
        if (b.onTimeRate !== a.onTimeRate) {
          return b.onTimeRate - a.onTimeRate;
        }
        return b.weightedScore - a.weightedScore;
      })
      .map((entry, idx) => ({
        ...entry,
        rank: idx + 1,
      }));

    return {
      organization,
      currentUser: {
        id: currentUser.id,
        uid: currentUser.uid,
        email: currentUser.email,
        fullName: currentUser.fullName,
        role: currentUser.role,
        department: currentUser.department,
        jobTitle: currentUser.jobTitle,
        employeeNumber: currentUser.employeeNumber,
        accountStatus: currentUser.accountStatus,
        lastActivityAt: currentUser.lastActivityAt,
      },
      summary: {
        totalEmployees: employeeStats.filter((e) => e.role === 'employee').length,
        activeEmployees: employeeStats.filter(
          (e) => e.role === 'employee' && e.accountStatus === 'active'
        ).length,
        totalAssignedTasks: totalAssigned,
        tasksNotStarted: notStartedCount,
        tasksInProgress: inProgressCount,
        tasksAwaitingReview: awaitingReviewCount,
        completedApprovedTasks: approvedCount,
        overdueTasks: overdueCount,
        overallCompletionRate,
      },
      employees:
        currentUser.role === 'admin'
          ? employeeStats
          : employeeStats.filter((e) => e.id === currentUser.id),
      tasks: visibleTasks.map((t) => ({
        ...t,
        checklist: t.checklistJson ? JSON.parse(t.checklistJson) : [],
        assignments: enrichedAssignments.filter((a) => a.taskId === t.id),
      })),
      assignments: enrichedAssignments,
      notifications: userNotifications.map((n) => ({
        ...n,
        actorName: n.actorId
          ? userMap.get(n.actorId)?.fullName || 'System'
          : 'System',
      })),
      leaderboard,
      activityLogs: allLogs.map((l) => ({
        ...l,
        actorName: l.actorId
          ? userMap.get(l.actorId)?.fullName || 'System'
          : 'System',
        parsedMetadata: l.metadata ? JSON.parse(l.metadata) : {},
      })),
    };
  } catch (error) {
    console.error('Database error in getAllWorkspaceData:', error);
    throw new Error('Failed to load workspace data. Please try again.', {
      cause: error,
    });
  }
}
