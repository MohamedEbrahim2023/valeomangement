import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Language,
  translateNotificationBody,
  translateNotificationTitle,
  translations,
} from './lib/i18n.ts';
import {
  EmployeeStat,
  EnrichedAssignment,
  TaskData,
  WorkspacePayload,
} from './types/workspace.ts';
import { AuthScreen } from './components/AuthScreen.tsx';
import {
  AdminEmployeeDirectoryView,
  AdminOverviewView,
  AdminTaskManagementView,
} from './components/AdminViews.tsx';
import {
  ActivityAuditLogView,
  EmployeeWorkspaceView,
  LeaderboardView,
  NotificationsCenterView,
  ProfileAndOrgSettingsView,
  ReportsAnalyticsView,
} from './components/EmployeeAndSharedViews.tsx';
import {
  AddEmployeeModal,
  AssignmentActionModal,
  CreateEditTaskModal,
  EditEmployeeModal,
  EmployeeDetailDrawer,
} from './components/WorkspaceModals.tsx';
import { UserGuideView } from './components/UserGuideView.tsx';
import { DeadlinesCalendarView } from './components/DeadlinesCalendarView.tsx';
import { SiteDataAssistant } from './components/SiteDataAssistant.tsx';
import {
  AlertToneType,
  getDesktopNotificationPermission,
  playNotificationChime,
  requestDesktopNotificationPermission,
  sendDesktopNotification,
  unlockAudioOnUserGesture,
} from './lib/alerts.ts';
import {
  AlertCircle,
  BarChart3,
  Bell,
  BellRing,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Shield,
  Sliders,
  Trophy,
  User,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

type ActiveSection =
  | 'overview'
  | 'employees'
  | 'tasks'
  | 'calendar'
  | 'leaderboard'
  | 'reports'
  | 'notifications'
  | 'audit'
  | 'settings'
  | 'guide';

const AUTH_TOKEN_KEY = 'velopulse_auth_token';
const WORKSPACE_CACHE_KEY = 'velopulse_cached_workspace';
const SAVED_CREDENTIALS_KEY = 'velopulse_saved_credentials';
const EXPLICIT_SIGNOUT_KEY = 'velopulse_explicit_signout';
const LANG_STORAGE_KEY = 'velopulse_lang';
const SOUND_ENABLED_KEY = 'velopulse_sound_enabled';

export default function App() {
  const [lang, setLang] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === 'ar' || saved === 'en') return saved;
    } catch {
      // Ignore storage errors
    }
    return 'en';
  });
  const t = translations[lang];

  // Persist authentication token and workspace cache in localStorage so user stays logged in
  const [authToken, setAuthTokenState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(AUTH_TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [workspace, setWorkspaceState] = useState<WorkspacePayload | null>(() => {
    try {
      const cached = localStorage.getItem(WORKSPACE_CACHE_KEY);
      return cached ? (JSON.parse(cached) as WorkspacePayload) : null;
    } catch {
      return null;
    }
  });

  const setAuthToken = useCallback((token: string | null) => {
    setAuthTokenState(token);
    try {
      if (token) {
        localStorage.setItem(AUTH_TOKEN_KEY, token);
        localStorage.removeItem(EXPLICIT_SIGNOUT_KEY);
      } else {
        localStorage.removeItem(AUTH_TOKEN_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const setWorkspace = useCallback((data: WorkspacePayload | null) => {
    setWorkspaceState(data);
    try {
      if (data) {
        localStorage.setItem(WORKSPACE_CACHE_KEY, JSON.stringify(data));
      } else {
        localStorage.removeItem(WORKSPACE_CACHE_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [activeSection, setActiveSection] = useState<ActiveSection>('overview');
  const [showPublicGuide, setShowPublicGuide] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  // Sound & Browser Desktop Notification States
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(SOUND_ENABLED_KEY);
      return saved !== 'false';
    } catch {
      return true;
    }
  });
  const [desktopNotifPerm, setDesktopNotifPerm] = useState<
    NotificationPermission | 'unsupported'
  >(() => getDesktopNotificationPermission());
  const [liveAlertBanner, setLiveAlertBanner] = useState<{
    id: number;
    title: string;
    body: string;
    eventType: string;
    relatedAssignmentId?: number | null;
  } | null>(null);

  const soundEnabledRef = useRef<boolean>(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  // Track which notification IDs have already been seen for the active user
  const seenNotifUserRef = useRef<number | null>(null);
  const seenNotifIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    unlockAudioOnUserGesture();
  }, []);

  const toggleSoundAlerts = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SOUND_ENABLED_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
      if (next) {
        playNotificationChime('TASK_ASSIGNED');
      }
      return next;
    });
  };

  const handleEnableOrTestDesktopAlerts = async () => {
    if (soundEnabledRef.current) {
      playNotificationChime('WORK_SUBMITTED');
    }
    const perm = await requestDesktopNotificationPermission();
    setDesktopNotifPerm(perm);

    const testTitle =
      lang === 'ar'
        ? '🔔 تنبيه فوري من منصة VeloPulse'
        : '🔔 VeloPulse Live Notification Active';
    const testBody =
      lang === 'ar'
        ? 'تم تفعيل التنبيهات الصوتية وإشعارات سطح المكتب بنجاح لاستقبال المهام والمراجعات فوراً.'
        : 'Sound chimes and browser desktop notifications are active for new tasks and reviews.';

    sendDesktopNotification({
      title: testTitle,
      body: testBody,
      tag: 'velopulse-test-alert',
    });

    setLiveAlertBanner({
      id: Date.now(),
      title: testTitle,
      body: testBody,
      eventType: 'TASK_ASSIGNED',
    });
  };

  // Modal & Drawer states
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeStat | null>(
    null
  );
  const [selectedProfileEmployee, setSelectedProfileEmployee] =
    useState<EmployeeStat | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskData | null>(null);
  const [activeAssignmentModal, setActiveAssignmentModal] = useState<{
    assignment: EnrichedAssignment;
    mode?: 'update' | 'submit' | 'review' | 'history';
  } | null>(null);

  const tokenRef = useRef<string | null>(null);
  tokenRef.current = authToken;

  // Apply structural LTR / RTL layout direction on <html> and persist language
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // Ignore storage errors
    }
  }, [lang]);

  const showNotificationToast = useCallback(
    (type: 'success' | 'error', message: string) => {
      setToast({ type, message });
      setTimeout(() => {
        setToast((prev) => (prev?.message === message ? null : prev));
      }, 4500);
    },
    []
  );

  const tryAutoLoginFromSavedCredentials = useCallback(async (): Promise<string | null> => {
    try {
      if (localStorage.getItem(EXPLICIT_SIGNOUT_KEY) === 'true') {
        return null;
      }
      const raw = localStorage.getItem(SAVED_CREDENTIALS_KEY);
      if (!raw) return null;
      const { email, password } = JSON.parse(raw);
      if (!email || !password) return null;

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.token) {
        setAuthToken(data.token);
        return data.token;
      }
    } catch {
      // Ignore auto-login failures
    }
    return null;
  }, [setAuthToken]);

  const fetchWorkspace = useCallback(
    async (tokenToUse?: string | null, silent = false) => {
      let tk = tokenToUse ?? tokenRef.current;
      if (!tk) {
        tk = await tryAutoLoginFromSavedCredentials();
        if (!tk) return;
      }
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      try {
        let res = await fetch(`/api/workspace?_t=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${tk}`,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
        });

        // If token expired, attempt seamless background re-authentication with saved credentials
        if (res.status === 401 || res.status === 403) {
          const freshToken = await tryAutoLoginFromSavedCredentials();
          if (freshToken) {
            tk = freshToken;
            res = await fetch(`/api/workspace?_t=${Date.now()}`, {
              cache: 'no-store',
              headers: {
                Authorization: `Bearer ${tk}`,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                Pragma: 'no-cache',
              },
            });
          }
        }

        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            setAuthToken(null);
            setWorkspace(null);
          }
          throw new Error(data.error || 'Failed to load workspace');
        }
        setWorkspace(data);
      } catch (err: any) {
        if (!silent) {
          setError(err.message || 'Unable to load workspace data');
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [setAuthToken, setWorkspace, tryAutoLoginFromSavedCredentials]
  );

  // Restore session and refresh workspace automatically on initial page load
  useEffect(() => {
    fetchWorkspace(authToken, Boolean(workspace));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep open drawers/modals synchronized in real time when workspace state updates
  // AND detect newly arrived notifications to fire Sound Chimes + Browser Desktop Notifications
  useEffect(() => {
    if (!workspace) return;

    const currentUserId = workspace.currentUser?.id;
    if (currentUserId) {
      if (seenNotifUserRef.current !== currentUserId) {
        // Initial load for this user: baseline existing notifications so we only chime on new ones
        seenNotifUserRef.current = currentUserId;
        seenNotifIdsRef.current = new Set(
          workspace.notifications.map((n) => n.id)
        );
      } else {
        const newUnreadNotifs = workspace.notifications.filter(
          (n) => !seenNotifIdsRef.current.has(n.id) && !n.readAt
        );
        for (const n of workspace.notifications) {
          seenNotifIdsRef.current.add(n.id);
        }

        if (newUnreadNotifs.length > 0) {
          const latest = newUnreadNotifs[0];
          const tone: AlertToneType =
            latest.eventType === 'TASK_ASSIGNED'
              ? 'TASK_ASSIGNED'
              : latest.eventType === 'WORK_SUBMITTED'
              ? 'WORK_SUBMITTED'
              : latest.eventType === 'TASK_APPROVED'
              ? 'TASK_APPROVED'
              : 'DEFAULT';

          if (soundEnabledRef.current) {
            playNotificationChime(tone);
          }

          sendDesktopNotification({
            title: translateNotificationTitle(latest.title, lang),
            body: translateNotificationBody(latest.body, lang),
            tag: `velopulse-notif-${latest.id}`,
            onClick: () => {
              if (latest.relatedAssignmentId) {
                const found = workspace.assignments.find(
                  (a) => a.id === latest.relatedAssignmentId
                );
                if (found) {
                  setActiveAssignmentModal({
                    assignment: found,
                    mode:
                      workspace.currentUser.role === 'admin' &&
                      found.status === 'awaiting_review'
                        ? 'review'
                        : 'history',
                  });
                  return;
                }
              }
              setActiveSection('notifications');
            },
          });

          setLiveAlertBanner({
            id: latest.id,
            title: translateNotificationTitle(latest.title, lang),
            body: translateNotificationBody(latest.body, lang),
            eventType: latest.eventType,
            relatedAssignmentId: latest.relatedAssignmentId,
          });
        }
      }
    }

    setSelectedProfileEmployee((prev) =>
      prev
        ? workspace.employees.find((e) => e.id === prev.id) || null
        : null
    );
    setEditingEmployee((prev) =>
      prev
        ? workspace.employees.find((e) => e.id === prev.id) || null
        : null
    );
    setEditingTask((prev) =>
      prev ? workspace.tasks.find((t) => t.id === prev.id) || null : null
    );
    setActiveAssignmentModal((prev) => {
      if (!prev) return null;
      const fresh = workspace.assignments.find(
        (a) => a.id === prev.assignment.id
      );
      return fresh ? { ...prev, assignment: fresh } : prev;
    });
  }, [workspace]);

  // Subscribe to Realtime SSE stream & visibility/focus sync when authenticated
  useEffect(() => {
    if (!authToken) {
      setRealtimeConnected(false);
      return;
    }

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isUnmounted = false;

    const connectStream = () => {
      if (isUnmounted) return;
      es = new EventSource(
        `/api/realtime/stream?token=${encodeURIComponent(authToken)}`
      );

      es.onopen = () => {
        if (!isUnmounted) setRealtimeConnected(true);
      };

      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type && payload.type !== 'CONNECTED') {
            fetchWorkspace(authToken, true);
          }
        } catch {
          // Ignore malformed event
        }
      };

      es.onerror = () => {
        if (isUnmounted) return;
        setRealtimeConnected(false);
        es?.close();
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            fetchWorkspace(authToken, true);
            connectStream();
          }, 3000);
        }
      };
    };

    connectStream();

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchWorkspace(authToken, true);
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      isUnmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      setRealtimeConnected(false);
    };
  }, [authToken, fetchWorkspace]);

  const apiRequest = async (
    path: string,
    method: string,
    body?: Record<string, unknown>
  ) => {
    const tk = tokenRef.current;
    if (!tk) throw new Error('Not authenticated');
    const res = await fetch(path, {
      method,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tk}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Operation failed');
    }
    if (data && data.workspace) {
      setWorkspace(data.workspace);
    } else {
      await fetchWorkspace(tk, true);
    }
    return data;
  };

  const handleQuickPersonaSwitch = async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Switch failed');
      setAuthToken(data.token);
      setActiveSection('overview');
      await fetchWorkspace(data.token);
      showNotificationToast(
        'success',
        `Switched workspace session to ${data.user.fullName} (${data.user.role.toUpperCase()})`
      );
    } catch (err: any) {
      showNotificationToast('error', err.message || 'Failed to switch account');
    }
  };

  const handleSignOut = () => {
    try {
      localStorage.setItem(EXPLICIT_SIGNOUT_KEY, 'true');
    } catch {
      // Ignore storage errors
    }
    setAuthToken(null);
    setWorkspace(null);
    setActiveSection('overview');
  };

  const handleDownloadCsv = async (type: 'employees' | 'tasks') => {
    if (!authToken) return;
    try {
      const res = await fetch(`/api/reports/export/${type}.csv`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'CSV export failed');
      }
      const csvText = await res.text();
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `velopulse-${type}-report.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showNotificationToast('success', `Exported ${type} CSV report.`);
    } catch (err: any) {
      showNotificationToast('error', err.message || 'CSV export failed');
    }
  };

  if (!authToken || !workspace) {
    if (showPublicGuide) {
      return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-8 max-w-6xl mx-auto">
          <UserGuideView onClose={() => setShowPublicGuide(false)} />
        </div>
      );
    }
    return (
      <AuthScreen
        lang={lang}
        externalError={error}
        onOpenGuide={() => setShowPublicGuide(true)}
        onToggleLang={() => setLang((l) => (l === 'en' ? 'ar' : 'en'))}
        onLoginSuccess={async (token) => {
          setAuthToken(token);
          await fetchWorkspace(token);
        }}
      />
    );
  }

  const { currentUser, organization, summary } = workspace;
  const isAdmin = currentUser.role === 'admin';
  const unreadNotifCount = workspace.notifications.filter(
    (n) => !n.readAt
  ).length;
  const pendingReviewCount = workspace.assignments.filter(
    (a) => a.status === 'awaiting_review'
  ).length;

  const navItems: {
    id: ActiveSection;
    label: string;
    icon: React.ReactNode;
    badge?: number;
    adminOnly?: boolean;
  }[] = [
    {
      id: 'overview',
      label: isAdmin ? t.navDashboard : t.navMyTasks,
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    ...(isAdmin
      ? [
          {
            id: 'employees' as ActiveSection,
            label: t.navEmployees,
            icon: <Users className="w-4 h-4" />,
          },
          {
            id: 'tasks' as ActiveSection,
            label: t.navTasks,
            icon: <ClipboardList className="w-4 h-4" />,
            badge: pendingReviewCount > 0 ? pendingReviewCount : undefined,
          },
        ]
      : []),
    {
      id: 'calendar',
      label: lang === 'ar' ? 'تقويم المواعيد' : 'Deadlines Calendar',
      icon: <Calendar className="w-4 h-4" />,
      badge: summary.overdueTasks > 0 ? summary.overdueTasks : undefined,
    },
    {
      id: 'leaderboard',
      label: t.navLeaderboard,
      icon: <Trophy className="w-4 h-4" />,
    },
    ...(isAdmin
      ? [
          {
            id: 'reports' as ActiveSection,
            label: t.navReports,
            icon: <BarChart3 className="w-4 h-4" />,
          },
          {
            id: 'audit' as ActiveSection,
            label: t.navAuditLog,
            icon: <Shield className="w-4 h-4" />,
          },
        ]
      : []),
    {
      id: 'notifications',
      label: t.navNotifications,
      icon: <Bell className="w-4 h-4" />,
      badge: unreadNotifCount > 0 ? unreadNotifCount : undefined,
    },
    {
      id: 'settings',
      label: isAdmin ? t.navSettings : t.navProfile,
      icon: isAdmin ? (
        <Sliders className="w-4 h-4" />
      ) : (
        <User className="w-4 h-4" />
      ),
    },
    {
      id: 'guide',
      label: lang === 'ar' ? 'دليل المستخدم (PDF)' : 'User Guide (PDF)',
      icon: <BookOpen className="w-4 h-4" />,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row overflow-x-hidden">
      {/* Mobile Slide-Over Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs md:hidden"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Navigation (Slide-over drawer on mobile, 260px static on desktop) */}
      <aside
        className={`fixed inset-y-0 start-0 z-50 w-72 max-w-[85vw] md:static md:w-64 bg-white border-e border-slate-200 shadow-2xl md:shadow-none shrink-0 flex flex-col justify-between overflow-y-auto transition-transform ${
          mobileMenuOpen ? 'flex' : 'hidden md:flex'
        }`}
      >
        <div className="p-4 sm:p-5 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-base font-bold tracking-tight text-slate-900 font-display block truncate">
                {organization?.name || t.appName}
              </span>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {isAdmin ? t.roleAdmin : t.roleEmployee} · {currentUser.department}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveSection(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 sm:py-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-indigo-50 text-indigo-800 font-semibold'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge !== undefined && (
                    <span className="font-mono text-xs font-bold text-indigo-700 px-1.5 py-0.5 bg-indigo-100/70 rounded">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="text-xs">
            <p className="font-semibold text-slate-900 truncate">
              {currentUser.fullName}
            </p>
            <p className="text-slate-500 font-mono truncate">
              {currentUser.email}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t.signOut}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header following SaaS Top Bar Contract */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-3 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden p-2 text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md shrink-0"
              aria-label="Open menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="text-xs text-slate-500 truncate">
              <span className="font-semibold text-slate-900 hidden sm:inline">
                {organization?.name || t.appName}
              </span>
              <span className="hidden sm:inline" aria-hidden="true">
                {' '}
                /{' '}
              </span>
              <span className="font-bold sm:font-medium text-slate-900 sm:text-slate-600 capitalize">
                {navItems.find((i) => i.id === activeSection)?.label ||
                  activeSection}
              </span>
              {realtimeConnected && (
                <span className="hidden lg:inline">
                  <span aria-hidden="true"> · </span>
                  <span className="text-emerald-700 font-medium">
                    {t.liveConnected}
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Sound Chime Toggle Button */}
            <button
              type="button"
              onClick={toggleSoundAlerts}
              title={
                soundEnabled
                  ? 'التنبيهات الصوتية مفعّلة (اضغط للكتم)'
                  : 'التنبيهات الصوتية مكتومة (اضغط للتفعيل)'
              }
              className={`inline-flex items-center justify-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                soundEnabled
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
              }`}
            >
              {soundEnabled ? (
                <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span className="hidden md:inline">
                {lang === 'ar'
                  ? soundEnabled
                    ? 'الصوت مفعّل'
                    : 'صامت'
                  : soundEnabled
                  ? 'Sound On'
                  : 'Muted'}
              </span>
            </button>

            {/* Browser Desktop Notification Enable / Test Button */}
            <button
              type="button"
              onClick={handleEnableOrTestDesktopAlerts}
              title="تفعيل أو تجربة إشعارات سطح المكتب والنغمة الصوتية"
              className={`inline-flex items-center justify-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                desktopNotifPerm === 'granted'
                  ? 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100'
                  : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
              }`}
            >
              <BellRing className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">
                {lang === 'ar'
                  ? desktopNotifPerm === 'granted'
                    ? 'تجربة الإشعار'
                    : 'تفعيل إشعارات المتصفح'
                  : desktopNotifPerm === 'granted'
                  ? 'Test Alert'
                  : 'Enable Browser Alerts'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('guide')}
              title={lang === 'ar' ? 'دليل المستخدم (PDF)' : 'User Guide (PDF)'}
              className="inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">دليل المستخدم (PDF)</span>
            </button>

            <button
              type="button"
              onClick={() => fetchWorkspace(authToken)}
              disabled={loading}
              title={t.refreshData}
              className="inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
              />
              <span className="hidden sm:inline">{t.refreshData}</span>
            </button>

            <button
              type="button"
              onClick={() => setLang((l) => (l === 'en' ? 'ar' : 'en'))}
              className="inline-flex items-center justify-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{lang === 'en' ? 'العربية' : 'EN'}</span>
            </button>
          </div>
        </header>

        {/* Live Real-Time Desktop & Sound Alert Pop-up Banner */}
        {liveAlertBanner && (
          <div className="px-3.5 sm:px-6 pt-3 sm:pt-4">
            <div
              role="alert"
              className="p-3 sm:p-3.5 rounded-lg border border-indigo-300 bg-indigo-950 text-white shadow-md flex flex-wrap items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-start gap-2.5 sm:gap-3">
                <div className="w-8 h-8 rounded-md bg-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                  <BellRing className="w-4 h-4 text-white animate-bounce" />
                </div>
                <div>
                  <p className="font-bold text-white text-xs sm:text-sm">
                    {liveAlertBanner.title}
                  </p>
                  <p className="text-indigo-200 mt-0.5">
                    {liveAlertBanner.body}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {liveAlertBanner.relatedAssignmentId && (
                  <button
                    type="button"
                    onClick={() => {
                      const found = workspace.assignments.find(
                        (a) => a.id === liveAlertBanner.relatedAssignmentId
                      );
                      if (found) {
                        setActiveAssignmentModal({
                          assignment: found,
                          mode:
                            isAdmin && found.status === 'awaiting_review'
                              ? 'review'
                              : 'history',
                        });
                      } else {
                        setActiveSection('notifications');
                      }
                      setLiveAlertBanner(null);
                    }}
                    className="px-3 py-1.5 bg-white text-indigo-950 font-bold rounded-md hover:bg-indigo-100 cursor-pointer"
                  >
                    {lang === 'ar' ? 'فتح المهمة الآن' : 'Open Task Now'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setLiveAlertBanner(null)}
                  className="p-1 text-indigo-300 hover:text-white cursor-pointer"
                  aria-label="Close alert"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast Banner */}
        {toast && (
          <div className="px-3.5 sm:px-6 pt-3 sm:pt-4">
            <div
              role="status"
              className={`p-3 rounded-md border flex items-center justify-between text-xs font-medium ${
                toast.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              <div className="flex items-center gap-2">
                {toast.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{toast.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="text-slate-500 hover:text-slate-900"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="px-3.5 sm:px-6 pt-3 sm:pt-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-800 flex items-center justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => fetchWorkspace(authToken)}
                className="underline font-semibold"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Active Section Viewport */}
        <main className="flex-1 p-3.5 sm:p-6 pb-28 md:pb-8 max-w-[1400px] w-full mx-auto overflow-x-hidden">
          {activeSection === 'guide' && (
            <UserGuideView onClose={() => setActiveSection('overview')} />
          )}

          {activeSection === 'overview' &&
            (isAdmin ? (
              <AdminOverviewView
                summary={summary}
                assignments={workspace.assignments}
                employees={workspace.employees}
                formulaNote={t.formulaNote}
                onOpenAddEmployee={() => setShowAddEmployee(true)}
                onOpenCreateTask={() => {
                  setEditingTask(null);
                  setShowTaskModal(true);
                }}
                onInspectAssignment={(a, mode) =>
                  setActiveAssignmentModal({ assignment: a, mode })
                }
                onSelectEmployee={(emp) => setSelectedProfileEmployee(emp)}
              />
            ) : (
              <EmployeeWorkspaceView
                currentUser={currentUser}
                summary={summary}
                assignments={workspace.assignments}
                employees={workspace.employees}
                organization={organization}
                onStartTask={async (assignmentId) => {
                  await apiRequest(
                    `/api/assignments/${assignmentId}/start`,
                    'POST'
                  );
                  showNotificationToast(
                    'success',
                    'Task started! Status updated to In Progress and manager notified.'
                  );
                }}
                onOpenAssignmentModal={(a, mode) =>
                  setActiveAssignmentModal({ assignment: a, mode })
                }
              />
            ))}

          {activeSection === 'employees' && isAdmin && (
            <AdminEmployeeDirectoryView
              employees={workspace.employees}
              onOpenAddEmployee={() => setShowAddEmployee(true)}
              onSelectEmployee={(emp) => setSelectedProfileEmployee(emp)}
              onEditEmployee={(emp) => setEditingEmployee(emp)}
            />
          )}

          {activeSection === 'tasks' && isAdmin && (
            <AdminTaskManagementView
              tasks={workspace.tasks}
              employees={workspace.employees}
              onOpenCreateTask={() => {
                setEditingTask(null);
                setShowTaskModal(true);
              }}
              onEditTask={(task) => {
                setEditingTask(task);
                setShowTaskModal(true);
              }}
              onInspectAssignment={(a, mode) =>
                setActiveAssignmentModal({ assignment: a, mode })
              }
            />
          )}

          {activeSection === 'leaderboard' && (
            <LeaderboardView
              leaderboard={workspace.leaderboard}
              organization={organization}
            />
          )}

          {activeSection === 'reports' && isAdmin && (
            <ReportsAnalyticsView
              employees={workspace.employees}
              assignments={workspace.assignments}
              onDownloadCsv={handleDownloadCsv}
            />
          )}

          {activeSection === 'notifications' && (
            <NotificationsCenterView
              notifications={workspace.notifications}
              assignments={workspace.assignments}
              onMarkRead={async (id) => {
                await apiRequest(`/api/notifications/${id}/read`, 'POST');
              }}
              onMarkAllRead={async () => {
                await apiRequest('/api/notifications/read-all', 'POST');
                showNotificationToast(
                  'success',
                  'All notifications marked as read.'
                );
              }}
              onInspectAssignment={(a) =>
                setActiveAssignmentModal({ assignment: a })
              }
            />
          )}

          {activeSection === 'audit' && isAdmin && (
            <ActivityAuditLogView logs={workspace.activityLogs} />
          )}

          {activeSection === 'settings' && (
            <ProfileAndOrgSettingsView
              currentUser={currentUser}
              organization={organization}
              onUpdateProfile={async (payload) => {
                await apiRequest('/api/profile', 'PATCH', payload);
                showNotificationToast('success', 'Profile updated.');
              }}
              onChangePassword={async (payload) => {
                await apiRequest('/api/profile/change-password', 'POST', payload);
                showNotificationToast('success', 'Password changed.');
              }}
              onUpdateOrg={async (payload) => {
                await apiRequest('/api/organization', 'PATCH', payload);
                showNotificationToast(
                  'success',
                  'Organization settings saved.'
                );
              }}
            />
          )}

          {activeSection === 'calendar' && (
            <DeadlinesCalendarView
              currentUser={currentUser}
              assignments={workspace.assignments}
              employees={workspace.employees}
              onInspectAssignment={(a, mode) =>
                setActiveAssignmentModal({ assignment: a, mode })
              }
              onOpenCreateTask={() => {
                setEditingTask(null);
                setShowTaskModal(true);
              }}
            />
          )}
        </main>
      </div>

      {/* MODALS & DRAWERS */}
      {showAddEmployee && (
        <AddEmployeeModal
          onClose={() => setShowAddEmployee(false)}
          onSubmit={async (payload) => {
            await apiRequest('/api/employees', 'POST', payload);
            showNotificationToast(
              'success',
              `Employee account created for ${payload.fullName}.`
            );
          }}
        />
      )}

      {editingEmployee && (
        <EditEmployeeModal
          employee={editingEmployee}
          onClose={() => setEditingEmployee(null)}
          onUpdate={async (id, payload) => {
            await apiRequest(`/api/employees/${id}`, 'PATCH', payload);
            showNotificationToast('success', 'Employee account updated.');
          }}
          onArchive={async (id) => {
            await apiRequest(`/api/employees/${id}`, 'DELETE');
            showNotificationToast(
              'success',
              'Employee archived and active assignments canceled while preserving history.'
            );
          }}
        />
      )}

      {selectedProfileEmployee && (
        <EmployeeDetailDrawer
          employee={selectedProfileEmployee}
          assignments={workspace.assignments.filter(
            (a) => a.employeeId === selectedProfileEmployee.id
          )}
          onClose={() => setSelectedProfileEmployee(null)}
          onInspectAssignment={(a) => {
            setSelectedProfileEmployee(null);
            setActiveAssignmentModal({ assignment: a });
          }}
          onEditEmployee={(emp) => {
            setSelectedProfileEmployee(null);
            setEditingEmployee(emp);
          }}
        />
      )}

      {showTaskModal && (
        <CreateEditTaskModal
          employees={workspace.employees}
          existingTask={editingTask}
          onClose={() => {
            setShowTaskModal(false);
            setEditingTask(null);
          }}
          onSubmitCreate={async (payload) => {
            await apiRequest('/api/tasks', 'POST', payload);
            if (soundEnabledRef.current) {
              playNotificationChime('TASK_ASSIGNED');
            }
            sendDesktopNotification({
              title:
                lang === 'ar'
                  ? `تم إسناد مهمة جديدة: ${payload.title}`
                  : `New Task Assigned: ${payload.title}`,
              body:
                lang === 'ar'
                  ? `تم إسناد المهمة إلى ${payload.assignedEmployeeIds.length} موظف(ين) وإرسال إشعار فوري لهم.`
                  : `Assigned to ${payload.assignedEmployeeIds.length} employee(s) with real-time alert.`,
            });
            showNotificationToast(
              'success',
              `Task "${payload.title}" created and assigned to ${payload.assignedEmployeeIds.length} employee(s).`
            );
          }}
          onSubmitUpdate={async (taskId, payload) => {
            await apiRequest(`/api/tasks/${taskId}`, 'PATCH', payload);
            showNotificationToast('success', 'Task and assignments updated.');
          }}
        />
      )}

      {activeAssignmentModal && (
        <AssignmentActionModal
          assignment={activeAssignmentModal.assignment}
          currentUser={currentUser}
          initialMode={activeAssignmentModal.mode}
          onClose={() => setActiveAssignmentModal(null)}
          onStartTask={async (assignmentId) => {
            await apiRequest(`/api/assignments/${assignmentId}/start`, 'POST');
            showNotificationToast('success', 'Task started.');
          }}
          onUpdateProgress={async (assignmentId, payload) => {
            await apiRequest(
              `/api/assignments/${assignmentId}/progress`,
              'POST',
              payload
            );
            showNotificationToast(
              'success',
              `Progress updated to ${payload.progressPercentage}% and administrator notified.`
            );
          }}
          onSubmitCompletion={async (assignmentId, payload) => {
            await apiRequest(
              `/api/assignments/${assignmentId}/submit`,
              'POST',
              payload
            );
            if (soundEnabledRef.current) {
              playNotificationChime('WORK_SUBMITTED');
            }
            sendDesktopNotification({
              title:
                lang === 'ar'
                  ? `تم تسليم المهمة للمراجعة (100%)`
                  : `Task Submitted for Manager Review (100%)`,
              body: payload.submissionSummary,
            });
            showNotificationToast(
              'success',
              'Task submitted for manager completion review (Status: Awaiting Review).'
            );
          }}
          onReviewSubmission={async (assignmentId, payload) => {
            await apiRequest(
              `/api/assignments/${assignmentId}/review`,
              'POST',
              payload
            );
            if (soundEnabledRef.current) {
              playNotificationChime(
                payload.decision === 'approved' ? 'TASK_APPROVED' : 'DEFAULT'
              );
            }
            showNotificationToast(
              'success',
              payload.decision === 'approved'
                ? 'Completion approved and leaderboard updated!'
                : 'Revision requested; assignment returned to In Progress.'
            );
          }}
          onAddAttachment={async (assignmentId, file) => {
            await apiRequest(
              `/api/assignments/${assignmentId}/attachments`,
              'POST',
              file
            );
          }}
        />
      )}

      {/* Mobile Fixed Bottom Navigation Bar (< md) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-1 py-1.5 flex items-center justify-around md:hidden shadow-lg"
      >
        <button
          type="button"
          onClick={() => setActiveSection('overview')}
          className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-medium min-w-[56px] ${
            activeSection === 'overview'
              ? 'text-indigo-700 font-bold'
              : 'text-slate-600'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span className="truncate max-w-[64px]">
            {lang === 'ar'
              ? isAdmin
                ? 'الرئيسية'
                : 'مهامي'
              : isAdmin
              ? 'Overview'
              : 'My Tasks'}
          </span>
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveSection('tasks')}
            className={`relative flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-medium min-w-[56px] ${
              activeSection === 'tasks'
                ? 'text-indigo-700 font-bold'
                : 'text-slate-600'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span className="truncate max-w-[64px]">
              {lang === 'ar' ? 'المهام' : 'Tasks'}
            </span>
            {pendingReviewCount > 0 && (
              <span className="absolute top-0.5 end-2 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                {pendingReviewCount}
              </span>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveSection('calendar')}
          className={`relative flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-medium min-w-[56px] ${
            activeSection === 'calendar'
              ? 'text-indigo-700 font-bold'
              : 'text-slate-600'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span className="truncate max-w-[64px]">
            {lang === 'ar' ? 'التقويم' : 'Calendar'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('leaderboard')}
          className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-medium min-w-[56px] ${
            activeSection === 'leaderboard'
              ? 'text-indigo-700 font-bold'
              : 'text-slate-600'
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span className="truncate max-w-[64px]">
            {lang === 'ar' ? 'لوحة الشرف' : 'Ranks'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('notifications')}
          className={`relative flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-medium min-w-[56px] ${
            activeSection === 'notifications'
              ? 'text-indigo-700 font-bold'
              : 'text-slate-600'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span className="truncate max-w-[64px]">
            {lang === 'ar' ? 'الإشعارات' : 'Alerts'}
          </span>
          {unreadNotifCount > 0 && (
            <span className="absolute top-0.5 end-2 w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center">
              {unreadNotifCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-medium text-slate-600 min-w-[52px]"
        >
          <Menu className="w-4 h-4" />
          <span className="truncate max-w-[60px]">
            {lang === 'ar' ? 'المزيد' : 'More'}
          </span>
        </button>
      </nav>

      {/* Built-in Native Site Database AI Assistant */}
      <SiteDataAssistant
        authToken={authToken}
        currentUser={currentUser}
        summary={summary}
        employees={workspace.employees}
        tasks={workspace.tasks}
        assignments={workspace.assignments}
        activityLogs={workspace.activityLogs}
        onRefreshDatabase={async () => {
          await fetchWorkspace(authToken, true);
        }}
        onInspectAssignment={(a, mode) =>
          setActiveAssignmentModal({ assignment: a, mode })
        }
        onSelectEmployee={(emp) => {
          if (isAdmin) {
            setSelectedProfileEmployee(emp);
          }
        }}
      />
    </div>
  );
}
