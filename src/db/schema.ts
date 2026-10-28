import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const organizations = pgTable('organizations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  workHoursPerDay: integer('work_hours_per_day').notNull().default(8),
  scoringBasePoints: integer('scoring_base_points').notNull().default(100),
  scoringOnTimeBonus: integer('scoring_on_time_bonus').notNull().default(25),
  scoringQualityBonus: integer('scoring_quality_bonus').notNull().default(20),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    organizationId: integer('organization_id').notNull().default(1),
    email: text('email').notNull().unique(),
    fullName: text('full_name').notNull(),
    role: text('role').notNull().default('employee'), // 'admin' | 'employee'
    department: text('department').notNull().default('Engineering'),
    jobTitle: text('job_title').notNull().default('Specialist'),
    employeeNumber: text('employee_number'),
    avatarUrl: text('avatar_url'),
    accountStatus: text('account_status').notNull().default('active'), // 'active' | 'deactivated' | 'invited'
    passwordHash: text('password_hash'),
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    lastActivityAt: timestamp('last_activity_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_users_org_role_status').on(
      table.organizationId,
      table.role,
      table.accountStatus
    ),
  ]
);

export const profiles = users;

export const tasks = pgTable(
  'tasks',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().default(1),
    title: text('title').notNull(),
    description: text('description').notNull(),
    priority: text('priority').notNull().default('Medium'), // 'Low' | 'Medium' | 'High' | 'Critical'
    category: text('category').notNull().default('General'),
    startDate: timestamp('start_date').notNull(),
    dueDate: timestamp('due_date').notNull(),
    createdBy: integer('created_by')
      .references(() => users.id)
      .notNull(),
    estimatedEffort: integer('estimated_effort').default(8),
    checklistJson: text('checklist_json'),
    completionCriteria: text('completion_criteria'),
    taskStatus: text('task_status').notNull().default('active'), // 'active' | 'canceled' | 'archived'
    canceledAt: timestamp('canceled_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_tasks_org_status_due').on(
      table.organizationId,
      table.taskStatus,
      table.dueDate
    ),
  ]
);

export const taskAssignments = pgTable(
  'task_assignments',
  {
    id: serial('id').primaryKey(),
    taskId: integer('task_id')
      .references(() => tasks.id)
      .notNull(),
    employeeId: integer('employee_id')
      .references(() => users.id)
      .notNull(),
    assignedBy: integer('assigned_by')
      .references(() => users.id)
      .notNull(),
    status: text('status').notNull().default('not_started'), // 'not_started' | 'in_progress' | 'awaiting_review' | 'approved' | 'rejected' | 'canceled'
    progressPercentage: integer('progress_percentage').notNull().default(0),
    latestNote: text('latest_note'),
    startedAt: timestamp('started_at'),
    submittedAt: timestamp('submitted_at'),
    completedAt: timestamp('completed_at'),
    qualityBonus: integer('quality_bonus').notNull().default(0),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('task_employee_unique_idx').on(table.taskId, table.employeeId),
    index('idx_assignments_emp_status').on(table.employeeId, table.status),
    index('idx_assignments_status_updated').on(table.status, table.updatedAt),
  ]
);

export const taskProgressUpdates = pgTable(
  'task_progress_updates',
  {
    id: serial('id').primaryKey(),
    assignmentId: integer('assignment_id')
      .references(() => taskAssignments.id)
      .notNull(),
    employeeId: integer('employee_id')
      .references(() => users.id)
      .notNull(),
    previousPercentage: integer('previous_percentage').notNull(),
    newPercentage: integer('new_percentage').notNull(),
    description: text('description').notNull(),
    blockers: text('blockers'),
    nextSteps: text('next_steps'),
    evidenceUrl: text('evidence_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_progress_assignment_created').on(
      table.assignmentId,
      table.createdAt
    ),
  ]
);

export const taskSubmissions = pgTable('task_submissions', {
  id: serial('id').primaryKey(),
  assignmentId: integer('assignment_id')
    .references(() => taskAssignments.id)
    .notNull(),
  employeeId: integer('employee_id')
    .references(() => users.id)
    .notNull(),
  submissionSummary: text('submission_summary').notNull(),
  evidenceNotes: text('evidence_notes'),
  version: integer('version').notNull().default(1),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
});

export const taskReviews = pgTable('task_reviews', {
  id: serial('id').primaryKey(),
  assignmentId: integer('assignment_id')
    .references(() => taskAssignments.id)
    .notNull(),
  submissionId: integer('submission_id').references(() => taskSubmissions.id),
  reviewerId: integer('reviewer_id')
    .references(() => users.id)
    .notNull(),
  decision: text('decision').notNull(), // 'approved' | 'rejected' | 'changes_requested'
  reviewNotes: text('review_notes').notNull(),
  qualityBonusAwarded: integer('quality_bonus_awarded').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    recipientId: integer('recipient_id')
      .references(() => users.id)
      .notNull(),
    actorId: integer('actor_id').references(() => users.id),
    eventType: text('event_type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    relatedTaskId: integer('related_task_id').references(() => tasks.id),
    relatedAssignmentId: integer('related_assignment_id').references(
      () => taskAssignments.id
    ),
    idempotencyKey: text('idempotency_key').unique(),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_notifications_recipient_read_created').on(
      table.recipientId,
      table.readAt,
      table.createdAt
    ),
  ]
);

export const activityLogs = pgTable(
  'activity_logs',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().default(1),
    actorId: integer('actor_id').references(() => users.id),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    metadata: text('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_activity_logs_org_created').on(
      table.organizationId,
      table.createdAt
    ),
  ]
);

export const taskAttachments = pgTable('task_attachments', {
  id: serial('id').primaryKey(),
  assignmentId: integer('assignment_id')
    .references(() => taskAssignments.id)
    .notNull(),
  uploadedBy: integer('uploaded_by')
    .references(() => users.id)
    .notNull(),
  storagePath: text('storage_path').notNull(),
  originalFilename: text('original_filename').notNull(),
  contentType: text('content_type').notNull(),
  fileSize: integer('file_size').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  assignments: many(taskAssignments),
  notifications: many(notifications),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  creator: one(users, {
    fields: [tasks.createdBy],
    references: [users.id],
  }),
  assignments: many(taskAssignments),
}));

export const taskAssignmentsRelations = relations(
  taskAssignments,
  ({ one, many }) => ({
    task: one(tasks, {
      fields: [taskAssignments.taskId],
      references: [tasks.id],
    }),
    employee: one(users, {
      fields: [taskAssignments.employeeId],
      references: [users.id],
    }),
    progressUpdates: many(taskProgressUpdates),
    submissions: many(taskSubmissions),
    reviews: many(taskReviews),
    attachments: many(taskAttachments),
  })
);
