import fs from 'fs';
import path from 'path';
import {
  activityLogs,
  chatMessages,
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

export type OrganizationRow = typeof organizations.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type TaskAssignmentRow = typeof taskAssignments.$inferSelect;
export type TaskProgressUpdateRow = typeof taskProgressUpdates.$inferSelect;
export type TaskSubmissionRow = typeof taskSubmissions.$inferSelect;
export type TaskReviewRow = typeof taskReviews.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type ActivityLogRow = typeof activityLogs.$inferSelect;
export type TaskAttachmentRow = typeof taskAttachments.$inferSelect;
export type ChatMessageRow = typeof chatMessages.$inferSelect;

export interface LocalDatabaseState {
  counters: {
    organizations: number;
    users: number;
    tasks: number;
    taskAssignments: number;
    taskProgressUpdates: number;
    taskSubmissions: number;
    taskReviews: number;
    notifications: number;
    activityLogs: number;
    taskAttachments: number;
    chatMessages: number;
  };
  organizations: OrganizationRow[];
  users: UserRow[];
  tasks: TaskRow[];
  taskAssignments: TaskAssignmentRow[];
  taskProgressUpdates: TaskProgressUpdateRow[];
  taskSubmissions: TaskSubmissionRow[];
  taskReviews: TaskReviewRow[];
  notifications: NotificationRow[];
  activityLogs: ActivityLogRow[];
  taskAttachments: TaskAttachmentRow[];
  chatMessages: ChatMessageRow[];
}

const DATA_FILE_PATH = path.resolve(process.cwd(), '.data', 'velopulse-db.json');

function reviveDates<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => reviveDates(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (
        typeof v === 'string' &&
        (k.endsWith('At') || k.endsWith('Date')) &&
        !Number.isNaN(Date.parse(v))
      ) {
        out[k] = new Date(v);
      } else {
        out[k] = reviveDates(v);
      }
    }
    return out as T;
  }
  return obj;
}

function createEmptyState(): LocalDatabaseState {
  return {
    counters: {
      organizations: 0,
      users: 0,
      tasks: 0,
      taskAssignments: 0,
      taskProgressUpdates: 0,
      taskSubmissions: 0,
      taskReviews: 0,
      notifications: 0,
      activityLogs: 0,
      taskAttachments: 0,
      chatMessages: 0,
    },
    organizations: [],
    users: [],
    tasks: [],
    taskAssignments: [],
    taskProgressUpdates: [],
    taskSubmissions: [],
    taskReviews: [],
    notifications: [],
    activityLogs: [],
    taskAttachments: [],
    chatMessages: [],
  };
}

declare global {
  var _veloPulseLocalDb: LocalDatabaseState | undefined;
}

function loadStateFromDisk(): LocalDatabaseState {
  if (process.env.VITEST === 'true') {
    return createEmptyState();
  }
  try {
    if (fs.existsSync(DATA_FILE_PATH)) {
      const raw = fs.readFileSync(DATA_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as LocalDatabaseState;
      const revived = reviveDates(parsed);
      if (!revived.chatMessages) revived.chatMessages = [];
      if (!revived.counters.chatMessages) revived.counters.chatMessages = 0;
      return revived;
    }
  } catch {
    // Fallback to in-memory state if disk read fails
  }
  return createEmptyState();
}

export function getLocalDb(): LocalDatabaseState {
  if (!global._veloPulseLocalDb) {
    global._veloPulseLocalDb = loadStateFromDisk();
  }
  if (!global._veloPulseLocalDb.chatMessages) {
    global._veloPulseLocalDb.chatMessages = [];
  }
  if (typeof global._veloPulseLocalDb.counters.chatMessages !== 'number') {
    global._veloPulseLocalDb.counters.chatMessages = 0;
  }
  return global._veloPulseLocalDb;
}

export function saveLocalDb(): void {
  if (process.env.VITEST === 'true' || !global._veloPulseLocalDb) {
    return;
  }
  try {
    const dir = path.dirname(DATA_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      DATA_FILE_PATH,
      JSON.stringify(global._veloPulseLocalDb, null, 2),
      'utf-8'
    );
  } catch {
    // Ignore write errors in read-only serverless environments
  }
}

export function nextId(
  table: keyof LocalDatabaseState['counters']
): number {
  const state = getLocalDb();
  state.counters[table] = (state.counters[table] || 0) + 1;
  return state.counters[table];
}
