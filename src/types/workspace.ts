export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface OrganizationData {
  id: number;
  name: string;
  workHoursPerDay: number;
  scoringBasePoints: number;
  scoringOnTimeBonus: number;
  scoringQualityBonus: number;
}

export interface CurrentUser {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  role: 'admin' | 'employee';
  department: string;
  jobTitle: string;
  employeeNumber: string | null;
  accountStatus: 'active' | 'deactivated' | 'invited';
  lastActivityAt: string;
}

export interface SummaryMetrics {
  totalEmployees: number;
  activeEmployees: number;
  totalAssignedTasks: number;
  tasksNotStarted: number;
  tasksInProgress: number;
  tasksAwaitingReview: number;
  completedApprovedTasks: number;
  overdueTasks: number;
  overallCompletionRate: number;
}

export interface EmployeeStat {
  id: number;
  uid: string;
  fullName: string;
  email: string;
  role: 'admin' | 'employee';
  department: string;
  jobTitle: string;
  employeeNumber: string | null;
  accountStatus: 'active' | 'deactivated' | 'invited';
  lastActivityAt: string;
  createdAt: string;
  totalAssigned: number;
  approvedCompleted: number;
  inProgress: number;
  awaitingReview: number;
  notStarted: number;
  overdue: number;
  currentActiveWorkload: number;
  completionRate: number;
  onTimeRate: number;
  avgCompletionHours: number;
  weightedScore: number;
  rank?: number;
}

export interface ProgressUpdateRecord {
  id: number;
  assignmentId: number;
  employeeId: number;
  previousPercentage: number;
  newPercentage: number;
  description: string;
  blockers: string | null;
  nextSteps: string | null;
  evidenceUrl: string | null;
  createdAt: string;
}

export interface SubmissionRecord {
  id: number;
  assignmentId: number;
  employeeId: number;
  submissionSummary: string;
  evidenceNotes: string | null;
  version: number;
  submittedAt: string;
}

export interface ReviewRecord {
  id: number;
  assignmentId: number;
  submissionId: number | null;
  reviewerId: number;
  decision: 'approved' | 'rejected' | 'changes_requested';
  reviewNotes: string;
  qualityBonusAwarded: number;
  createdAt: string;
}

export interface AttachmentRecord {
  id: number;
  assignmentId: number;
  uploadedBy: number;
  storagePath: string;
  originalFilename: string;
  contentType: string;
  fileSize: number;
  createdAt: string;
}

export interface TaskData {
  id: number;
  organizationId: number;
  title: string;
  description: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  category: string;
  startDate: string;
  dueDate: string;
  createdBy: number;
  estimatedEffort: number;
  checklist: ChecklistItem[];
  completionCriteria: string | null;
  taskStatus: 'active' | 'canceled' | 'archived';
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignments?: EnrichedAssignment[];
}

export interface EnrichedAssignment {
  id: number;
  taskId: number;
  employeeId: number;
  assignedBy: number;
  status:
    | 'not_started'
    | 'in_progress'
    | 'awaiting_review'
    | 'approved'
    | 'rejected'
    | 'canceled';
  progressPercentage: number;
  latestNote: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  qualityBonus: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  isOverdue: boolean;
  task: TaskData | null;
  employee: {
    id: number;
    fullName: string;
    email: string;
    department: string;
    jobTitle: string;
    employeeNumber: string | null;
    accountStatus: string;
  } | null;
  progressUpdates: ProgressUpdateRecord[];
  submissions: SubmissionRecord[];
  reviews: ReviewRecord[];
  attachments: AttachmentRecord[];
}

export interface NotificationRecord {
  id: number;
  recipientId: number;
  actorId: number | null;
  actorName: string;
  eventType: string;
  title: string;
  body: string;
  relatedTaskId: number | null;
  relatedAssignmentId: number | null;
  readAt: string | null;
  createdAt: string;
}

export interface ActivityLogRecord {
  id: number;
  organizationId: number;
  actorId: number | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  parsedMetadata: Record<string, unknown>;
  createdAt: string;
}

export interface WorkspacePayload {
  organization: OrganizationData;
  currentUser: CurrentUser;
  summary: SummaryMetrics;
  employees: EmployeeStat[];
  tasks: TaskData[];
  assignments: EnrichedAssignment[];
  notifications: NotificationRecord[];
  leaderboard: EmployeeStat[];
  activityLogs: ActivityLogRecord[];
}
