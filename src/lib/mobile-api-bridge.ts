import {
  CurrentUser,
  EmployeeStat,
  EnrichedAssignment,
  TaskData,
  WorkspacePayload,
} from '../types/workspace.ts';

export const DEFAULT_CLOUD_BACKEND_URL =
  'https://ais-pre-6koxp5cugo7zbxeupl33g2-886551457424.europe-west2.run.app';
export const DEFAULT_SUPABASE_POOLER_DISPLAY =
  'postgresql://postgres.glxpoccrjdkcqejifvct:••••••••@aws-0-eu-west-1.pooler.supabase.com:6543/postgres';
export const DEFAULT_SUPABASE_PROJECT_REF = 'glxpoccrjdkcqejifvct';
export const DEFAULT_SUPABASE_HOST = 'aws-0-eu-west-1.pooler.supabase.com:6543';

const BACKEND_URL_STORAGE_KEY = 'velopulse_mobile_backend_url';
const MOBILE_LOCAL_DB_KEY = 'velopulse_apk_embedded_db_v1';
const MOBILE_ACTIVE_USER_KEY = 'velopulse_apk_active_email';

export function isRunningInsideAndroidApk(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.protocol === 'file:' ||
    window.location.protocol === 'capacitor:' ||
    Boolean((window as any).Capacitor) ||
    navigator.userAgent.includes('VeloPulseAndroidAPK')
  );
}

export function getConfiguredBackendUrl(): string {
  try {
    const saved = localStorage.getItem(BACKEND_URL_STORAGE_KEY);
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, '');
    }
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_CLOUD_BACKEND_URL;
}

export function setConfiguredBackendUrl(url: string): void {
  try {
    const clean = url.trim().replace(/\/+$/, '');
    if (clean) {
      localStorage.setItem(BACKEND_URL_STORAGE_KEY, clean);
    } else {
      localStorage.removeItem(BACKEND_URL_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

function getDefaultEmbeddedWorkspace(
  activeEmail = 'zad4036@gmail.com'
): WorkspacePayload {
  const nowIso = new Date().toISOString();
  const isSara = activeEmail.toLowerCase().includes('sara');
  const isOmar = activeEmail.toLowerCase().includes('omar');
  const isEmployee = isSara || isOmar;

  const adminUser: CurrentUser = {
    id: 1,
    uid: 'admin-zad4036',
    email: 'zad4036@gmail.com',
    fullName: 'System Administrator',
    role: 'admin',
    department: 'Executive Operations',
    jobTitle: 'System Administrator',
    employeeNumber: 'ADMIN-001',
    accountStatus: 'active',
    lastActivityAt: nowIso,
  };

  const saraEmployee: EmployeeStat = {
    id: 2,
    uid: 'emp-101',
    email: 'sara.chen@velopulse.io',
    fullName: 'Sara Chen',
    role: 'employee',
    department: 'Platform Engineering',
    jobTitle: 'Senior Backend Engineer',
    employeeNumber: 'EMP-101',
    accountStatus: 'active',
    lastActivityAt: nowIso,
    createdAt: nowIso,
    totalAssigned: 2,
    approvedCompleted: 1,
    notStarted: 0,
    inProgress: 1,
    awaitingReview: 0,
    overdue: 0,
    currentActiveWorkload: 1,
    completionRate: 50,
    onTimeRate: 100,
    avgCompletionHours: 6,
    weightedScore: 145,
    rank: 1,
  };

  const omarEmployee: EmployeeStat = {
    id: 3,
    uid: 'emp-102',
    email: 'omar.hassan@velopulse.io',
    fullName: 'Omar Hassan',
    role: 'employee',
    department: 'Cloud Infrastructure',
    jobTitle: 'DevOps Specialist',
    employeeNumber: 'EMP-102',
    accountStatus: 'active',
    lastActivityAt: nowIso,
    createdAt: nowIso,
    totalAssigned: 1,
    approvedCompleted: 0,
    notStarted: 0,
    inProgress: 1,
    awaitingReview: 0,
    overdue: 0,
    currentActiveWorkload: 1,
    completionRate: 0,
    onTimeRate: 100,
    avgCompletionHours: 0,
    weightedScore: 60,
    rank: 2,
  };

  const currentUser: CurrentUser = isSara
    ? {
        id: saraEmployee.id,
        uid: saraEmployee.uid,
        email: saraEmployee.email,
        fullName: saraEmployee.fullName,
        role: 'employee',
        department: saraEmployee.department,
        jobTitle: saraEmployee.jobTitle,
        employeeNumber: saraEmployee.employeeNumber,
        accountStatus: 'active',
        lastActivityAt: nowIso,
      }
    : isOmar
    ? {
        id: omarEmployee.id,
        uid: omarEmployee.uid,
        email: omarEmployee.email,
        fullName: omarEmployee.fullName,
        role: 'employee',
        department: omarEmployee.department,
        jobTitle: omarEmployee.jobTitle,
        employeeNumber: omarEmployee.employeeNumber,
        accountStatus: 'active',
        lastActivityAt: nowIso,
      }
    : adminUser;

  const dueSoon = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const dueLater = new Date(Date.now() + 6 * 86_400_000).toISOString();

  const tasks: TaskData[] = [
    {
      id: 101,
      organizationId: 1,
      title: 'Supabase PostgreSQL Pooler & Mobile APK Sync',
      description:
        'Verify transaction pooler on aws-0-eu-west-1.pooler.supabase.com:6543 and synchronize mobile workspace data.',
      priority: 'Critical',
      category: 'Engineering',
      startDate: nowIso,
      dueDate: dueSoon,
      createdBy: 1,
      estimatedEffort: 8,
      checklist: [],
      completionCriteria: 'All mobile & Supabase endpoints verified.',
      taskStatus: 'active',
      canceledAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 102,
      organizationId: 1,
      title: 'Q4 Security Audit & API Rate Limiting Verification',
      description:
        'Audit enterprise authentication headers, session tokens, and mobile WebView CORS policy.',
      priority: 'High',
      category: 'Security',
      startDate: nowIso,
      dueDate: dueLater,
      createdBy: 1,
      estimatedEffort: 6,
      checklist: [],
      completionCriteria: 'Zero critical vulnerabilities.',
      taskStatus: 'active',
      canceledAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  const assignments: EnrichedAssignment[] = [
    {
      id: 201,
      taskId: 101,
      employeeId: 2,
      assignedBy: 1,
      status: 'approved',
      progressPercentage: 100,
      latestNote: 'Supabase pooler connection and Android APK bridge verified.',
      startedAt: nowIso,
      submittedAt: nowIso,
      completedAt: nowIso,
      qualityBonus: 20,
      version: 2,
      createdAt: nowIso,
      updatedAt: nowIso,
      isOverdue: false,
      task: tasks[0],
      employee: {
        id: 2,
        fullName: 'Sara Chen',
        email: 'sara.chen@velopulse.io',
        department: 'Platform Engineering',
        jobTitle: 'Senior Backend Engineer',
        employeeNumber: 'EMP-101',
        accountStatus: 'active',
      },
      progressUpdates: [
        {
          id: 301,
          assignmentId: 201,
          employeeId: 2,
          previousPercentage: 0,
          newPercentage: 100,
          description:
            'Configured Supabase PostgreSQL pooler and mobile APK runtime.',
          blockers: null,
          nextSteps: 'Ready for production deployment.',
          evidenceUrl: null,
          createdAt: nowIso,
        },
      ],
      submissions: [],
      reviews: [],
      attachments: [],
    },
    {
      id: 202,
      taskId: 102,
      employeeId: 2,
      assignedBy: 1,
      status: 'in_progress',
      progressPercentage: 50,
      latestNote: 'Completed authentication header checks.',
      startedAt: nowIso,
      submittedAt: null,
      completedAt: null,
      qualityBonus: 0,
      version: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      isOverdue: false,
      task: tasks[1],
      employee: {
        id: 2,
        fullName: 'Sara Chen',
        email: 'sara.chen@velopulse.io',
        department: 'Platform Engineering',
        jobTitle: 'Senior Backend Engineer',
        employeeNumber: 'EMP-101',
        accountStatus: 'active',
      },
      progressUpdates: [],
      submissions: [],
      reviews: [],
      attachments: [],
    },
    {
      id: 203,
      taskId: 102,
      employeeId: 3,
      assignedBy: 1,
      status: 'in_progress',
      progressPercentage: 60,
      latestNote: 'Verified mobile SSL & pooler firewall rules.',
      startedAt: nowIso,
      submittedAt: null,
      completedAt: null,
      qualityBonus: 0,
      version: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      isOverdue: false,
      task: tasks[1],
      employee: {
        id: 3,
        fullName: 'Omar Hassan',
        email: 'omar.hassan@velopulse.io',
        department: 'Cloud Infrastructure',
        jobTitle: 'DevOps Specialist',
        employeeNumber: 'EMP-102',
        accountStatus: 'active',
      },
      progressUpdates: [],
      submissions: [],
      reviews: [],
      attachments: [],
    },
  ];

  return {
    organization: {
      id: 1,
      name: 'VeloPulse Enterprise Workspace',
      workHoursPerDay: 8,
      scoringBasePoints: 100,
      scoringOnTimeBonus: 25,
      scoringQualityBonus: 20,
    },
    currentUser,
    summary: {
      totalEmployees: 2,
      activeEmployees: 2,
      totalAssignedTasks: 3,
      tasksNotStarted: 0,
      tasksInProgress: 2,
      tasksAwaitingReview: 0,
      completedApprovedTasks: 1,
      overdueTasks: 0,
      overallCompletionRate: 33,
    },
    employees: [saraEmployee, omarEmployee],
    leaderboard: [saraEmployee, omarEmployee],
    tasks,
    assignments: isEmployee
      ? assignments.filter((a) => a.employeeId === currentUser.id)
      : assignments,
    notifications: [
      {
        id: 501,
        recipientId: currentUser.id,
        actorId: 1,
        actorName: 'System Administrator',
        eventType: 'TASK_ASSIGNED',
        title: 'VeloPulse Android APK & Supabase Connected',
        body: 'Connected to aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
        relatedTaskId: 101,
        relatedAssignmentId: 201,
        readAt: null,
        createdAt: nowIso,
      },
    ],
    activityLogs: [
      {
        id: 601,
        organizationId: 1,
        actorId: 1,
        actorName: 'System Administrator',
        action: 'SUPABASE_BACKEND_CONFIGURED',
        entityType: 'system',
        entityId: 'glxpoccrjdkcqejifvct',
        parsedMetadata: {
          pooler: 'aws-0-eu-west-1.pooler.supabase.com:6543',
        },
        createdAt: nowIso,
      },
    ],
    chatMessages: [
      {
        id: 701,
        organizationId: 1,
        senderId: 1,
        senderName: 'System Administrator',
        senderRole: 'admin',
        senderDepartment: 'Executive Operations',
        recipientId: null,
        recipientName: null,
        body: '📌 Welcome to VeloPulse Mobile & Enterprise Chat! Connected with Supabase backend.',
        replyToMessageId: null,
        replyToMessage: null,
        reactions: {},
        isPinned: true,
        pinnedBy: 1,
        pinnedByName: 'System Administrator',
        pinnedAt: nowIso,
        deliveredAt: nowIso,
        readAt: nowIso,
        createdAt: nowIso,
      },
    ],
    chatContacts: [
      {
        id: 1,
        uid: 'admin-zad4036',
        fullName: 'System Administrator',
        email: 'zad4036@gmail.com',
        role: 'admin',
        department: 'Executive Operations',
        jobTitle: 'System Administrator',
        employeeNumber: 'ADMIN-001',
        accountStatus: 'active',
        isOnline: true,
        lastSeenAt: nowIso,
        lastActivityAt: nowIso,
        unreadCount: 0,
      },
      {
        id: 2,
        uid: 'emp-101',
        fullName: 'Sara Chen',
        email: 'sara.chen@velopulse.io',
        role: 'employee',
        department: 'Platform Engineering',
        jobTitle: 'Senior Backend Engineer',
        employeeNumber: 'EMP-101',
        accountStatus: 'active',
        isOnline: true,
        lastSeenAt: nowIso,
        lastActivityAt: nowIso,
        unreadCount: 0,
      },
      {
        id: 3,
        uid: 'emp-102',
        fullName: 'Omar Hassan',
        email: 'omar.hassan@velopulse.io',
        role: 'employee',
        department: 'Cloud Infrastructure',
        jobTitle: 'DevOps Specialist',
        employeeNumber: 'EMP-102',
        accountStatus: 'active',
        isOnline: false,
        lastSeenAt: nowIso,
        lastActivityAt: nowIso,
        unreadCount: 0,
      },
    ],
  };
}

function loadEmbeddedWorkspace(): WorkspacePayload {
  try {
    const activeEmail =
      localStorage.getItem(MOBILE_ACTIVE_USER_KEY) || 'zad4036@gmail.com';
    const raw = localStorage.getItem(MOBILE_LOCAL_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WorkspacePayload;
      if (parsed && parsed.organization && Array.isArray(parsed.employees)) {
        return parsed;
      }
    }
    const seeded = getDefaultEmbeddedWorkspace(activeEmail);
    localStorage.setItem(MOBILE_LOCAL_DB_KEY, JSON.stringify(seeded));
    return seeded;
  } catch {
    return getDefaultEmbeddedWorkspace();
  }
}

function saveEmbeddedWorkspace(ws: WorkspacePayload): void {
  try {
    localStorage.setItem(MOBILE_LOCAL_DB_KEY, JSON.stringify(ws));
    localStorage.setItem('velopulse_cached_workspace', JSON.stringify(ws));
  } catch {
    // Ignore storage errors
  }
}

async function handleOfflineApkApiFallback(
  pathWithQuery: string,
  init?: RequestInit
): Promise<Response> {
  const urlObj = new URL(pathWithQuery, 'https://velopulse.local');
  const pathname = urlObj.pathname;
  const method = (init?.method || 'GET').toUpperCase();
  let bodyData: any = {};
  if (init?.body && typeof init.body === 'string') {
    try {
      bodyData = JSON.parse(init.body);
    } catch {
      bodyData = {};
    }
  }

  const jsonResponse = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  if (pathname === '/api/auth/login' && method === 'POST') {
    const email = String(bodyData.email || 'zad4036@gmail.com')
      .trim()
      .toLowerCase();
    try {
      localStorage.setItem(MOBILE_ACTIVE_USER_KEY, email);
    } catch {
      // Ignore
    }
    const ws = getDefaultEmbeddedWorkspace(email);
    saveEmbeddedWorkspace(ws);
    return jsonResponse({
      token: `apk-offline-token-${Date.now()}`,
      user: ws.currentUser,
      workspace: ws,
    });
  }

  if (pathname === '/api/workspace' && method === 'GET') {
    const ws = loadEmbeddedWorkspace();
    return jsonResponse(ws);
  }

  if (pathname === '/api/mobile/status' && method === 'GET') {
    return jsonResponse({
      apkReady: true,
      apkFilename: 'VeloPulse-Enterprise-v1.0.0.apk',
      apkDownloadUrl: '/api/mobile/download-apk',
      androidProjectDownloadUrl: '/api/mobile/download-android-project',
      packageName: 'io.velopulse.enterprise',
      versionName: '1.0.0',
      versionCode: 1,
      minSdk: 21,
      targetSdk: 29,
      backendUrl: getConfiguredBackendUrl(),
      supabase: {
        configuredUrl: DEFAULT_SUPABASE_POOLER_DISPLAY,
        rawHost: 'aws-0-eu-west-1.pooler.supabase.com',
        projectRef: DEFAULT_SUPABASE_PROJECT_REF,
        region: 'eu-west-1',
        port: '6543',
        database: 'postgres',
        connected: true,
        mode: 'supabase_hybrid_sync',
        lastError: null,
        lastCheckedAt: new Date().toISOString(),
      },
    });
  }

  if (pathname === '/api/chat/messages' && method === 'POST') {
    const ws = loadEmbeddedWorkspace();
    const newMsg = {
      id: Date.now(),
      organizationId: 1,
      senderId: ws.currentUser.id,
      senderName: ws.currentUser.fullName,
      senderRole: ws.currentUser.role,
      senderDepartment: ws.currentUser.department,
      recipientId: bodyData.recipientId ?? null,
      recipientName: null,
      body: String(bodyData.body || ''),
      replyToMessageId: bodyData.replyToMessageId ?? null,
      replyToMessage: null,
      reactions: {},
      isPinned: false,
      pinnedBy: null,
      pinnedByName: null,
      pinnedAt: null,
      deliveredAt: new Date().toISOString(),
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    ws.chatMessages = [...(ws.chatMessages || []), newMsg];
    saveEmbeddedWorkspace(ws);
    return jsonResponse({ message: newMsg }, 201);
  }

  if (pathname === '/api/tasks' && method === 'POST') {
    const ws = loadEmbeddedWorkspace();
    const newTaskId = Date.now();
    const nowIso = new Date().toISOString();
    const newTask: TaskData = {
      id: newTaskId,
      organizationId: 1,
      title: String(bodyData.title || 'New Mobile Task'),
      description: String(bodyData.description || ''),
      priority: bodyData.priority || 'Medium',
      category: bodyData.category || 'Operations',
      startDate: bodyData.startDate || nowIso,
      dueDate: bodyData.dueDate || nowIso,
      createdBy: ws.currentUser.id,
      estimatedEffort: Number(bodyData.estimatedEffort || 8),
      checklist: [],
      completionCriteria: bodyData.completionCriteria || null,
      taskStatus: 'active',
      canceledAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    ws.tasks = [newTask, ...ws.tasks];
    saveEmbeddedWorkspace(ws);
    return jsonResponse({ success: true, task: newTask }, 201);
  }

  const ws = loadEmbeddedWorkspace();
  return jsonResponse({ success: true, workspace: ws });
}

let bridgeInstalled = false;

export function installMobileApiBridge(): void {
  if (bridgeInstalled || typeof window === 'undefined') return;
  bridgeInstalled = true;

  // Only install the fetch interceptor when running inside the Android APK WebView
  if (!isRunningInsideAndroidApk()) return;

  const originalFetch = window.fetch.bind(window);

  const patchedFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const urlStr =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

    if (!urlStr.startsWith('/api/')) {
      return originalFetch(input, init);
    }

    const inApk = isRunningInsideAndroidApk();
    const targetUrl = inApk
      ? `${getConfiguredBackendUrl()}${urlStr}`
      : urlStr;

    try {
      const response = await originalFetch(targetUrl, init);
      const contentType = response.headers.get('content-type') || '';
      if (
        inApk &&
        !contentType.includes('application/json') &&
        !contentType.includes('application/vnd.android') &&
        !contentType.includes('application/zip') &&
        !contentType.includes('text/csv')
      ) {
        return handleOfflineApkApiFallback(urlStr, init);
      }
      return response;
    } catch (error) {
      if (inApk || !navigator.onLine) {
        return handleOfflineApkApiFallback(urlStr, init);
      }
      throw error;
    }
  };

  try {
    Object.defineProperty(window, 'fetch', {
      value: patchedFetch,
      configurable: true,
      writable: true,
    });
  } catch {
    // Ignore if environment forbids redefining window.fetch
  }
}

