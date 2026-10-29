import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  Timer,
  Flame,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Printer,
  Award,
  Volume2,
  VolumeX,
  GripVertical,
  ChevronRight,
  FileText,
  X,
  Building2,
  UserCheck,
} from 'lucide-react';
import {
  CurrentUser,
  EmployeeStat,
  EnrichedAssignment,
  SummaryMetrics,
} from '../types/workspace.ts';
import {
  PriorityText,
  AssignmentStatusText,
  ProgressBar,
  formatDateShort,
} from './StatusIndicators.tsx';
import { isArabicActive } from '../lib/i18n.ts';

// ============================================================================
// 1. BUILT-IN TIME TRACKER & POMODORO ENGINE (Persisted per Assignment ID)
// ============================================================================
interface TimeTrackerRecord {
  elapsedSeconds: number;
  isRunning: boolean;
  lastStartedAt: number | null;
  pomodoroMode: boolean;
  pomodoroTargetSeconds: number;
}

const TIME_STORAGE_KEY = 'velopulse_assignment_time_tracker_v1';

function loadAllTimeRecords(): Record<number, TimeTrackerRecord> {
  try {
    const raw = localStorage.getItem(TIME_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveTimeRecord(assignmentId: number, record: TimeTrackerRecord) {
  try {
    const all = loadAllTimeRecords();
    all[assignmentId] = record;
    localStorage.setItem(TIME_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore storage errors
  }
}

export function getAssignmentElapsedSeconds(assignmentId: number): number {
  const all = loadAllTimeRecords();
  const rec = all[assignmentId];
  if (!rec) return 0;
  if (rec.isRunning && rec.lastStartedAt) {
    const delta = Math.max(0, Math.floor((Date.now() - rec.lastStartedAt) / 1000));
    return rec.elapsedSeconds + delta;
  }
  return rec.elapsedSeconds || 0;
}

export function formatDurationHMS(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return [
    String(hrs).padStart(2, '0'),
    String(mins).padStart(2, '0'),
    String(secs).padStart(2, '0'),
  ].join(':');
}

export function TaskTimeTrackerWidget({
  assignmentId,
  estimatedEffortHours = 8,
  compact = false,
  onStartTaskIfNotStarted,
}: {
  assignmentId: number;
  estimatedEffortHours?: number;
  compact?: boolean;
  onStartTaskIfNotStarted?: () => void;
}) {
  const ar = isArabicActive();
  const [record, setRecord] = useState<TimeTrackerRecord>(() => {
    const all = loadAllTimeRecords();
    return (
      all[assignmentId] || {
        elapsedSeconds: 0,
        isRunning: false,
        lastStartedAt: null,
        pomodoroMode: false,
        pomodoroTargetSeconds: 25 * 60,
      }
    );
  });
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const all = loadAllTimeRecords();
    if (all[assignmentId]) {
      setRecord(all[assignmentId]);
    }
  }, [assignmentId]);

  useEffect(() => {
    if (!record.isRunning) return;
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [record.isRunning]);

  const liveElapsedSeconds = useMemo(() => {
    if (record.isRunning && record.lastStartedAt) {
      const delta = Math.max(0, Math.floor((nowTick - record.lastStartedAt) / 1000));
      return record.elapsedSeconds + delta;
    }
    return record.elapsedSeconds;
  }, [record, nowTick]);

  const toggleRunning = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (record.isRunning) {
      const delta = record.lastStartedAt
        ? Math.max(0, Math.floor((Date.now() - record.lastStartedAt) / 1000))
        : 0;
      const next: TimeTrackerRecord = {
        ...record,
        elapsedSeconds: record.elapsedSeconds + delta,
        isRunning: false,
        lastStartedAt: null,
      };
      setRecord(next);
      saveTimeRecord(assignmentId, next);
    } else {
      const next: TimeTrackerRecord = {
        ...record,
        isRunning: true,
        lastStartedAt: Date.now(),
      };
      setRecord(next);
      saveTimeRecord(assignmentId, next);
      if (onStartTaskIfNotStarted) {
        onStartTaskIfNotStarted();
      }
    }
  };

  const startPomodoro = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next: TimeTrackerRecord = {
      ...record,
      isRunning: true,
      lastStartedAt: Date.now(),
      pomodoroMode: true,
      pomodoroTargetSeconds: 25 * 60,
    };
    setRecord(next);
    saveTimeRecord(assignmentId, next);
    if (onStartTaskIfNotStarted) {
      onStartTaskIfNotStarted();
    }
  };

  const addManualMinutes = (mins: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const next: TimeTrackerRecord = {
      ...record,
      elapsedSeconds: Math.max(0, record.elapsedSeconds + mins * 60),
    };
    setRecord(next);
    saveTimeRecord(assignmentId, next);
  };

  const resetTimer = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next: TimeTrackerRecord = {
      elapsedSeconds: 0,
      isRunning: false,
      lastStartedAt: null,
      pomodoroMode: false,
      pomodoroTargetSeconds: 25 * 60,
    };
    setRecord(next);
    saveTimeRecord(assignmentId, next);
  };

  const actualHours = Number((liveElapsedSeconds / 3600).toFixed(2));
  const effortRatio =
    estimatedEffortHours > 0
      ? Math.min(150, Math.round((actualHours / estimatedEffortHours) * 100))
      : 0;
  const isOverEffort = actualHours > estimatedEffortHours;

  if (compact) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border text-[11px] transition-colors ${
          record.isRunning
            ? 'bg-indigo-50/90 border-indigo-300 text-indigo-950'
            : 'bg-slate-50 border-slate-200 text-slate-700'
        }`}
      >
        <div className="flex items-center gap-1.5">
          <Timer
            className={`w-3.5 h-3.5 ${
              record.isRunning ? 'text-indigo-600 animate-pulse' : 'text-slate-500'
            }`}
          />
          <span className="font-mono font-bold tabular-nums">
            {formatDurationHMS(liveElapsedSeconds)}
          </span>
          <span className="text-slate-400">·</span>
          <span className="text-[10px] text-slate-500 font-mono">
            {actualHours}h / {estimatedEffortHours}h
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleRunning}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
              record.isRunning
                ? 'bg-amber-600 text-white hover:bg-amber-700'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {record.isRunning ? (
              <>
                <Pause className="w-2.5 h-2.5" />
                <span>{ar ? 'إيقاف' : 'Pause'}</span>
              </>
            ) : (
              <>
                <Play className="w-2.5 h-2.5" />
                <span>{ar ? 'بدء المؤقت ⏱️' : 'Start ⏱️'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`rounded-lg border p-3.5 transition-all ${
        record.isRunning
          ? 'bg-gradient-to-r from-indigo-50/90 via-white to-emerald-50/60 border-indigo-300 shadow-xs'
          : 'bg-slate-50/80 border-slate-200'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              record.isRunning
                ? 'bg-indigo-600 text-white animate-pulse'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            <Timer className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">
                {ar
                  ? 'مؤقت العمل الفعلي على المهمة (Time Tracker & Pomodoro)'
                  : 'Built-in Task Time Tracker & Pomodoro'}
              </span>
              {record.pomodoroMode && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-800 rounded">
                  🍅 Pomodoro 25m
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {ar ? (
                <>
                  الوقت الفعلي المسجل:{' '}
                  <strong className="font-mono text-slate-800">
                    {actualHours} ساعة
                  </strong>{' '}
                  من أصل الجهد المقدر{' '}
                  <strong className="font-mono text-slate-800">
                    {estimatedEffortHours} ساعة
                  </strong>{' '}
                  ({effortRatio}%)
                </>
              ) : (
                <>
                  Actual logged:{' '}
                  <strong className="font-mono text-slate-800">
                    {actualHours}h
                  </strong>{' '}
                  vs Estimated Effort{' '}
                  <strong className="font-mono text-slate-800">
                    {estimatedEffortHours}h
                  </strong>{' '}
                  ({effortRatio}%)
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="px-3 py-1 bg-slate-900 text-white font-mono text-sm font-bold tabular-nums rounded-md tracking-wider">
            {formatDurationHMS(liveElapsedSeconds)}
          </div>

          <button
            type="button"
            onClick={toggleRunning}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
              record.isRunning
                ? 'bg-amber-600 text-white hover:bg-amber-700'
                : 'bg-indigo-700 text-white hover:bg-indigo-800'
            }`}
          >
            {record.isRunning ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>{ar ? 'إيقاف المؤقت' : 'Pause Timer'}</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>{ar ? 'بدء المؤقت ⏱️' : 'Start Timer ⏱️'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={startPomodoro}
            title={ar ? 'بدء جلسة تركيز بومودورو 25 دقيقة' : 'Start 25m Pomodoro Focus Session'}
            className="px-2.5 py-1.5 text-xs font-medium bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-md cursor-pointer"
          >
            {ar ? '🍅 بومودورو 25د' : '🍅 25m Focus'}
          </button>

          <button
            type="button"
            onClick={(e) => addManualMinutes(30, e)}
            title={ar ? 'إضافة 30 دقيقة عمل يدوية' : 'Log +30m manually'}
            className="px-2 py-1.5 text-[11px] font-mono font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md cursor-pointer"
          >
            +30m
          </button>

          <button
            type="button"
            onClick={(e) => addManualMinutes(60, e)}
            title={ar ? 'إضافة ساعة عمل يدوية' : 'Log +1h manually'}
            className="px-2 py-1.5 text-[11px] font-mono font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md cursor-pointer"
          >
            +1h
          </button>

          {liveElapsedSeconds > 0 && (
            <button
              type="button"
              onClick={resetTimer}
              title={ar ? 'تصفير المؤقت' : 'Reset Timer'}
              className="p-1.5 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Effort vs Actual Progress Bar */}
      <div className="mt-2.5 flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isOverEffort
                ? 'bg-red-600'
                : effortRatio > 80
                ? 'bg-amber-500'
                : 'bg-emerald-600'
            }`}
            style={{ width: `${Math.min(100, Math.max(2, effortRatio))}%` }}
          />
        </div>
        <span
          className={`text-[10px] font-semibold whitespace-nowrap ${
            isOverEffort ? 'text-red-700' : 'text-emerald-700'
          }`}
        >
          {isOverEffort
            ? ar
              ? '⚠️ تجاوز الوقت المقدر'
              : '⚠️ Over Estimated Effort'
            : ar
            ? '✓ ضمن الوقت المقدر'
            : '✓ Within Estimated Effort'}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// 2. DAILY SMART BRIEFING CARD («ملخص الصباح الذكي من عبدك المطيغ 🧞‍♂️☀️»)
// ============================================================================
export function DailySmartBriefingCard({
  currentUser,
  assignments,
  employees,
  onInspectAssignment,
  onNavigateTab,
}: {
  currentUser: CurrentUser;
  assignments: EnrichedAssignment[];
  employees?: EmployeeStat[];
  onInspectAssignment: (
    a: EnrichedAssignment,
    mode?: 'update' | 'submit' | 'review' | 'history'
  ) => void;
  onNavigateTab?: (tab: string) => void;
}) {
  const ar = isArabicActive();
  const [dismissed, setDismissed] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const isAdmin = currentUser.role === 'admin';
  const relevantAssignments = useMemo(() => {
    const active = assignments.filter((a) => a.status !== 'canceled');
    if (isAdmin) return active;
    return active.filter((a) => a.employeeId === currentUser.id);
  }, [assignments, isAdmin, currentUser.id]);

  // 1) Top 3 Priorities Today (Active & sorted by Critical -> High -> Medium -> Low)
  const topPriorities = useMemo(() => {
    const priorityRank: Record<string, number> = {
      Critical: 4,
      High: 3,
      Medium: 2,
      Low: 1,
    };
    return relevantAssignments
      .filter((a) => a.status !== 'approved')
      .sort((a, b) => {
        const pDiff =
          (priorityRank[b.task?.priority || 'Medium'] || 2) -
          (priorityRank[a.task?.priority || 'Medium'] || 2);
        if (pDiff !== 0) return pDiff;
        return (
          new Date(a.task?.dueDate || 0).getTime() -
          new Date(b.task?.dueDate || 0).getTime()
        );
      })
      .slice(0, 3);
  }, [relevantAssignments]);

  // 2) Approaching Deadline (within 4 days) or Overdue
  const urgentDeadlines = useMemo(() => {
    const now = Date.now();
    const fourDaysMs = 4 * 86_400_000;
    return relevantAssignments
      .filter((a) => {
        if (a.status === 'approved') return false;
        if (a.isOverdue) return true;
        if (!a.task?.dueDate) return false;
        const dueMs = new Date(a.task.dueDate).getTime();
        return dueMs - now <= fourDaysMs;
      })
      .slice(0, 3);
  }, [relevantAssignments]);

  // 3) Needs Review (Admin) or Needs Action / Revision (Employee)
  const reviewOrActionList = useMemo(() => {
    if (isAdmin) {
      return relevantAssignments
        .filter((a) => a.status === 'awaiting_review')
        .slice(0, 3);
    }
    return relevantAssignments
      .filter(
        (a) =>
          a.status === 'rejected' ||
          a.status === 'not_started' ||
          a.status === 'awaiting_review'
      )
      .slice(0, 3);
  }, [relevantAssignments, isAdmin]);

  const toggleSpeakBriefing = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const greeting = ar
      ? `صباح الخير يا ${currentUser.fullName}! أنا عبدك المطيغ، وده ملخصك الذكي لليوم. `
      : `Good morning ${currentUser.fullName}! Here is your daily smart briefing from Your Obedient Genie. `;
    const pText =
      topPriorities.length > 0
        ? ar
          ? `أهم أولوياتك اليوم هي: ${topPriorities
              .map((p) => p.task?.title)
              .join('، ثم ')}. `
          : `Your top priorities today are: ${topPriorities
              .map((p) => p.task?.title)
              .join(', ')}. `
        : ar
        ? 'كل مهامك مكتملة ومعتمدة اليوم! '
        : 'All your tasks are completed today! ';
    const rText =
      reviewOrActionList.length > 0
        ? ar
          ? `ويوجد ${reviewOrActionList.length} مهام تحتاج للمراجعة أو المتابعة الفورية.`
          : `And there are ${reviewOrActionList.length} items awaiting immediate review or action.`
        : '';

    const utterance = new SpeechSynthesisUtterance(greeting + pText + rText);
    utterance.lang = ar ? 'ar-EG' : 'en-US';
    utterance.rate = 1.0;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  if (dismissed) return null;

  return (
    <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl border border-indigo-500/30 p-4 sm:p-5 shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3.5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-indigo-600 flex items-center justify-center text-xl shadow-xs shrink-0">
            🧞‍♂️
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/30 rounded-full">
                {ar ? '☀️ ملخص الصباح الذكي' : '☀️ Daily Smart Briefing'}
              </span>
              <h2 className="text-sm sm:text-base font-bold text-white font-display">
                {ar
                  ? `أهلاً بك يا ${currentUser.fullName.split(' ')[0]}! إليك موجز العمل اليوم من «عبدك المطيغ»`
                  : `Welcome ${currentUser.fullName.split(' ')[0]}! Here is your Daily Smart Briefing`}
              </h2>
            </div>
            <p className="text-xs text-indigo-200/80 mt-0.5">
              {ar
                ? 'تحليل فوري لأهم 3 أولويات اليوم، المواعيد النهائية القريبة، والمهام التي تنتظر قرارك.'
                : 'Real-time synthesis of your top 3 priorities today, approaching deadlines, and items awaiting action.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleSpeakBriefing}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
              isSpeaking
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-white/10 hover:bg-white/20 text-white border-white/15'
            }`}
          >
            {isSpeaking ? (
              <>
                <VolumeX className="w-3.5 h-3.5" />
                <span>{ar ? 'إيقاف القراءة الصوتية' : 'Stop Audio'}</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5 text-amber-300" />
                <span>{ar ? 'استمع للملخص صوتياً 🔊' : 'Listen to Briefing 🔊'}</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            title={ar ? 'إخفاء الملخص مؤقتاً' : 'Dismiss briefing'}
            className="p-1.5 text-indigo-300 hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3 Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-4">
        {/* Column 1: Top 3 Priorities Today */}
        <div className="bg-white/5 border border-white/10 rounded-lg p-3.5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-400" />
              {ar ? '1. أهم 3 أولويات اليوم' : '1. Top 3 Priorities Today'}
            </span>
            <span className="text-[11px] font-mono text-indigo-200 bg-white/10 px-1.5 py-0.5 rounded">
              {topPriorities.length}
            </span>
          </div>
          {topPriorities.length === 0 ? (
            <p className="text-xs text-indigo-200/70 py-3">
              {ar
                ? '🎉 ممتاز! لا توجد مهام معلقة ذات أولوية قصوى حالياً.'
                : '🎉 Great job! No high-priority pending tasks right now.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {topPriorities.map((a, idx) => (
                <li
                  key={a.id}
                  onClick={() =>
                    onInspectAssignment(
                      a,
                      isAdmin && a.status === 'awaiting_review'
                        ? 'review'
                        : 'update'
                    )
                  }
                  className="p-2 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition-colors flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">
                      {idx + 1}. {a.task?.title}
                    </p>
                    <p className="text-[11px] text-indigo-200/80 truncate mt-0.5">
                      {isAdmin ? `${a.employee?.fullName} · ` : ''}
                      {a.task?.priority} · {a.progressPercentage}%
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-indigo-300 shrink-0 mt-0.5" />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Column 2: Approaching Deadlines / Overdue */}
        <div className="bg-white/5 border border-white/10 rounded-lg p-3.5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-rose-400" />
              {ar
                ? '2. تقترب من التسليم أو متأخرة'
                : '2. Approaching / Overdue Deadlines'}
            </span>
            <span className="text-[11px] font-mono text-rose-200 bg-rose-500/20 px-1.5 py-0.5 rounded">
              {urgentDeadlines.length}
            </span>
          </div>
          {urgentDeadlines.length === 0 ? (
            <p className="text-xs text-indigo-200/70 py-3">
              {ar
                ? '✓ جميع المهام تسير ضمن الجدول الزمني المحدد دون تأخير.'
                : '✓ All active tasks are comfortably on schedule.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {urgentDeadlines.map((a) => (
                <li
                  key={a.id}
                  onClick={() => onInspectAssignment(a, 'update')}
                  className="p-2 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition-colors flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">
                      {a.task?.title}
                    </p>
                    <p className="text-[11px] text-rose-300 truncate mt-0.5">
                      {a.isOverdue
                        ? ar
                          ? '⚠️ متأخرة عن الموعد'
                          : '⚠️ Overdue'
                        : ar
                        ? '⏰ موعد قريب:'
                        : '⏰ Due soon:'}{' '}
                      {formatDateShort(a.task?.dueDate)}
                      {isAdmin ? ` (${a.employee?.fullName})` : ''}
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-indigo-300 shrink-0 mt-0.5" />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Column 3: Awaiting Review / Immediate Action */}
        <div className="bg-white/5 border border-white/10 rounded-lg p-3.5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              {isAdmin
                ? ar
                  ? '3. تنتظر مراجعتك واعتمادك'
                  : '3. Awaiting Your Manager Review'
                : ar
                ? '3. تحتاج لبدء التنفيذ أو المراجعة'
                : '3. Needs Action / In Review'}
            </span>
            <span className="text-[11px] font-mono text-emerald-200 bg-emerald-500/20 px-1.5 py-0.5 rounded">
              {reviewOrActionList.length}
            </span>
          </div>
          {reviewOrActionList.length === 0 ? (
            <p className="text-xs text-indigo-200/70 py-3">
              {isAdmin
                ? ar
                  ? '✓ لا توجد تسليمات معلقة في طابور الاعتماد حالياً.'
                  : '✓ No pending submissions in the review queue.'
                : ar
                ? '✓ جميع مهامك قيد التنفيذ النشط أو معتمدة.'
                : '✓ All your assignments are actively progressing or approved.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {reviewOrActionList.map((a) => (
                <li
                  key={a.id}
                  onClick={() =>
                    onInspectAssignment(
                      a,
                      isAdmin && a.status === 'awaiting_review'
                        ? 'review'
                        : 'update'
                    )
                  }
                  className="p-2 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition-colors flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">
                      {a.task?.title}
                    </p>
                    <p className="text-[11px] text-emerald-300 truncate mt-0.5">
                      {isAdmin
                        ? `${a.employee?.fullName} — ${
                            ar ? 'جاهزة للاعتماد 100%' : 'Ready for approval'
                          }`
                        : a.status === 'rejected'
                        ? ar
                          ? 'مطلوب تعديلات من المدير'
                          : 'Revision requested'
                        : a.status === 'not_started'
                        ? ar
                          ? 'لم تبدأ بعد — ابدأ الآن'
                          : 'Not started yet'
                        : ar
                        ? 'بانتظار اعتماد المدير'
                        : 'Awaiting manager review'}
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-indigo-300 shrink-0 mt-0.5" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 3. INTERACTIVE DRAG & DROP KANBAN BOARD (4 Columns + Quick Move)
// ============================================================================
type KanbanColumnKey =
  | 'not_started'
  | 'in_progress'
  | 'awaiting_review'
  | 'approved';

export function InteractiveKanbanBoard({
  assignments,
  currentUser,
  onStartTask,
  onInspectAssignment,
}: {
  assignments: EnrichedAssignment[];
  currentUser: CurrentUser;
  onStartTask?: (assignmentId: number) => Promise<void>;
  onInspectAssignment: (
    a: EnrichedAssignment,
    mode?: 'update' | 'submit' | 'review' | 'history'
  ) => void;
}) {
  const ar = isArabicActive();
  const isAdmin = currentUser.role === 'admin';
  const [draggedAssignmentId, setDraggedAssignmentId] = useState<number | null>(
    null
  );
  const [dragOverCol, setDragOverCol] = useState<KanbanColumnKey | null>(null);

  const columns: {
    key: KanbanColumnKey;
    titleAr: string;
    titleEn: string;
    badgeBg: string;
    borderAccent: string;
  }[] = [
    {
      key: 'not_started',
      titleAr: 'لم تبدأ (Not Started)',
      titleEn: 'Not Started',
      badgeBg: 'bg-slate-200 text-slate-800',
      borderAccent: 'border-t-4 border-t-slate-400',
    },
    {
      key: 'in_progress',
      titleAr: 'قيد التنفيذ (In Progress)',
      titleEn: 'In Progress',
      badgeBg: 'bg-indigo-100 text-indigo-800',
      borderAccent: 'border-t-4 border-t-indigo-600',
    },
    {
      key: 'awaiting_review',
      titleAr: 'بانتظار المراجعة (Awaiting Review)',
      titleEn: 'Awaiting Review',
      badgeBg: 'bg-amber-100 text-amber-800',
      borderAccent: 'border-t-4 border-t-amber-500',
    },
    {
      key: 'approved',
      titleAr: 'معتمدة ومكتملة (Approved)',
      titleEn: 'Approved & Completed',
      badgeBg: 'bg-emerald-100 text-emerald-800',
      borderAccent: 'border-t-4 border-t-emerald-600',
    },
  ];

  const grouped = useMemo(() => {
    const map: Record<KanbanColumnKey, EnrichedAssignment[]> = {
      not_started: [],
      in_progress: [],
      awaiting_review: [],
      approved: [],
    };
    for (const a of assignments) {
      if (a.status === 'canceled') continue;
      if (a.status === 'not_started') {
        map.not_started.push(a);
      } else if (a.status === 'in_progress' || a.status === 'rejected') {
        map.in_progress.push(a);
      } else if (a.status === 'awaiting_review') {
        map.awaiting_review.push(a);
      } else if (a.status === 'approved') {
        map.approved.push(a);
      }
    }
    return map;
  }, [assignments]);

  const handleTransitionAssignment = async (
    assignment: EnrichedAssignment,
    targetColumn: KanbanColumnKey
  ) => {
    const currentEffective: KanbanColumnKey =
      assignment.status === 'rejected'
        ? 'in_progress'
        : (assignment.status as KanbanColumnKey);
    if (currentEffective === targetColumn) return;

    if (targetColumn === 'in_progress') {
      if (assignment.status === 'not_started' && onStartTask) {
        await onStartTask(assignment.id);
      } else {
        onInspectAssignment(assignment, 'update');
      }
    } else if (targetColumn === 'awaiting_review') {
      onInspectAssignment(assignment, 'submit');
    } else if (targetColumn === 'approved') {
      if (isAdmin) {
        onInspectAssignment(assignment, 'review');
      } else {
        onInspectAssignment(assignment, 'submit');
      }
    } else {
      onInspectAssignment(assignment, 'update');
    }
  };

  const handleDropOnColumn = async (targetColumn: KanbanColumnKey) => {
    setDragOverCol(null);
    if (draggedAssignmentId == null) return;
    const found = assignments.find((a) => a.id === draggedAssignmentId);
    setDraggedAssignmentId(null);
    if (!found) return;
    await handleTransitionAssignment(found, targetColumn);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-indigo-50/70 border border-indigo-200 rounded-lg px-3.5 py-2 text-xs text-indigo-950">
        <div className="flex items-center gap-2">
          <GripVertical className="w-4 h-4 text-indigo-600" />
          <span className="font-semibold">
            {ar
              ? 'لوحة كانبان التفاعلية بالسحب والإفلات (Drag & Drop Kanban): اسحب أي بطاقة مهمة وأفلتها في العمود التالي لتحديث حالتها أو اعتمادها فوراً.'
              : 'Interactive Drag & Drop Kanban Board: Drag any task card across columns or use the quick move buttons below.'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {columns.map((col) => {
          const items = grouped[col.key];
          const isOver = dragOverCol === col.key;
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverCol !== col.key) setDragOverCol(col.key);
              }}
              onDragLeave={() => {
                if (dragOverCol === col.key) setDragOverCol(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDropOnColumn(col.key);
              }}
              className={`bg-slate-100/90 rounded-lg border ${
                col.borderAccent
              } p-3 min-h-[420px] transition-all ${
                isOver
                  ? 'ring-2 ring-indigo-600 bg-indigo-50/70 border-indigo-400'
                  : 'border-slate-200'
              }`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-200">
                <h3 className="text-xs font-bold text-slate-900 font-display">
                  {ar ? col.titleAr : col.titleEn}
                </h3>
                <span
                  className={`px-2 py-0.5 text-xs font-mono font-bold rounded-full ${col.badgeBg}`}
                >
                  {items.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-3">
                {items.length === 0 ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center text-xs text-slate-400">
                    {ar
                      ? 'اسحب وأفلت مهمة هنا'
                      : 'Drag & drop a task card here'}
                  </div>
                ) : (
                  items.map((a) => (
                    <div
                      key={a.id}
                      draggable
                      onDragStart={() => setDraggedAssignmentId(a.id)}
                      onDragEnd={() => {
                        setDraggedAssignmentId(null);
                        setDragOverCol(null);
                      }}
                      onClick={() =>
                        onInspectAssignment(
                          a,
                          isAdmin && a.status === 'awaiting_review'
                            ? 'review'
                            : 'update'
                        )
                      }
                      className={`bg-white rounded-lg border border-slate-200 p-3.5 shadow-2xs hover:shadow-md transition-all cursor-grab active:cursor-grabbing space-y-2.5 ${
                        draggedAssignmentId === a.id ? 'opacity-50 scale-95' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                          <span className="font-mono font-semibold text-slate-700">
                            #{a.taskId}
                          </span>
                          <span>·</span>
                          {a.task && <PriorityText priority={a.task.priority} />}
                        </div>
                        <GripVertical className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      </div>

                      <h4 className="text-xs font-bold text-slate-900 leading-snug">
                        {a.task?.title || (ar ? 'مهمة' : 'Task')}
                      </h4>

                      {a.employee && (
                        <div className="flex items-center justify-between text-[11px] text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                          <span className="font-medium truncate">
                            👤 {a.employee.fullName}
                          </span>
                          <span className="text-slate-400 truncate">
                            {a.employee.department}
                          </span>
                        </div>
                      )}

                      <ProgressBar
                        percentage={a.progressPercentage}
                        status={a.status}
                        isOverdue={a.isOverdue}
                      />

                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>
                          {ar ? 'التسليم:' : 'Due:'}{' '}
                          <strong
                            className={
                              a.isOverdue ? 'text-red-700' : 'text-slate-800'
                            }
                          >
                            {formatDateShort(a.task?.dueDate)}
                          </strong>
                        </span>
                        <AssignmentStatusText
                          status={a.status}
                          isOverdue={a.isOverdue}
                        />
                      </div>

                      {/* Compact Time Tracker inside Kanban Card */}
                      {a.status !== 'approved' && (
                        <TaskTimeTrackerWidget
                          assignmentId={a.id}
                          estimatedEffortHours={a.task?.estimatedEffort || 8}
                          compact
                          onStartTaskIfNotStarted={
                            a.status === 'not_started' && onStartTask
                              ? () => onStartTask(a.id)
                              : undefined
                          }
                        />
                      )}

                      {/* Quick Action / Move Footer */}
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1.5"
                      >
                        {col.key === 'not_started' && (
                          <button
                            type="button"
                            onClick={() =>
                              handleTransitionAssignment(a, 'in_progress')
                            }
                            className="w-full py-1 px-2 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded cursor-pointer flex items-center justify-center gap-1"
                          >
                            <span>
                              {ar
                                ? 'نقل إلى قيد التنفيذ ←'
                                : 'Move to In Progress →'}
                            </span>
                          </button>
                        )}
                        {col.key === 'in_progress' && (
                          <button
                            type="button"
                            onClick={() =>
                              handleTransitionAssignment(a, 'awaiting_review')
                            }
                            className="w-full py-1 px-2 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded cursor-pointer flex items-center justify-center gap-1"
                          >
                            <span>
                              {ar
                                ? 'تسليم للمراجعة (100%) ←'
                                : 'Submit for Review (100%) →'}
                            </span>
                          </button>
                        )}
                        {col.key === 'awaiting_review' && isAdmin && (
                          <button
                            type="button"
                            onClick={() =>
                              handleTransitionAssignment(a, 'approved')
                            }
                            className="w-full py-1 px-2 text-[11px] font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded cursor-pointer flex items-center justify-center gap-1"
                          >
                            <span>
                              {ar
                                ? 'مراجعة واعتماد المهمة ✓'
                                : 'Review & Approve ✓'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 4. MONTHLY PDF PERFORMANCE REPORT CARD MODAL (Printable Official Report)
// ============================================================================
export function MonthlyPerformanceReportModal({
  employees,
  assignments,
  summary,
  initialEmployeeId = 'all',
  onClose,
}: {
  employees: EmployeeStat[];
  assignments: EnrichedAssignment[];
  summary: SummaryMetrics;
  initialEmployeeId?: number | 'all';
  onClose: () => void;
}) {
  const ar = isArabicActive();
  const [selectedTarget, setSelectedTarget] = useState<string>(
    String(initialEmployeeId)
  );
  const reportMonthLabel = new Date().toLocaleDateString(
    ar ? 'ar-EG' : 'en-US',
    { month: 'long', year: 'numeric' }
  );

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.role === 'employee'),
    [employees]
  );

  const selectedEmployee = useMemo(() => {
    if (selectedTarget === 'all') return null;
    return activeEmployees.find((e) => e.id === Number(selectedTarget)) || null;
  }, [selectedTarget, activeEmployees]);

  const targetAssignments = useMemo(() => {
    if (!selectedEmployee) {
      return assignments.filter((a) => a.status !== 'canceled');
    }
    return assignments.filter(
      (a) => a.employeeId === selectedEmployee.id && a.status !== 'canceled'
    );
  }, [assignments, selectedEmployee]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full p-4 sm:p-8 my-4 max-h-[94dvh] overflow-y-auto shadow-2xl print:max-h-none print:shadow-none print:border-none print:p-0">
        {/* Top Action Bar (Hidden when printing) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-6 border-b border-slate-200 print:hidden">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-bold text-slate-700">
              {ar ? 'نطاق التقرير الشهري:' : 'Report Scope:'}
            </label>
            <select
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-md bg-white text-slate-900"
            >
              <option value="all">
                {ar
                  ? '🏢 تقرير الأداء المؤسسي الشامل (جميع الأقسام والموظفين)'
                  : '🏢 Full Organization & Departmental Report'}
              </option>
              {activeEmployees.map((emp) => (
                <option key={emp.id} value={String(emp.id)}>
                  👤 {emp.fullName} ({emp.department} — {emp.weightedScore} pts)
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 rounded-md cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>
                {ar
                  ? 'طباعة / حفظ كملف PDF 🖨️'
                  : 'Print / Save as PDF 🖨️'}
              </span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-900 rounded-md cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Report Content */}
        <div className="space-y-6">
          {/* Official Header Banner */}
          <div className="border-2 border-slate-900 rounded-xl p-5 bg-slate-50 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-indigo-700 text-white flex items-center justify-center font-bold text-lg font-mono">
                VP
              </div>
              <div>
                <p className="text-[11px] font-mono uppercase tracking-widest text-indigo-700 font-bold">
                  VELOPULSE ENTERPRISE WORKFORCE ANALYTICS
                </p>
                <h1 className="text-xl font-bold text-slate-900 font-display mt-0.5">
                  {selectedEmployee
                    ? ar
                      ? `شهادة وتقرير تقييم الأداء الشهري — ${selectedEmployee.fullName}`
                      : `Monthly Performance Report Card — ${selectedEmployee.fullName}`
                    : ar
                    ? 'التقرير التنفيذي لتقييم الأداء الشهري للمؤسسة والأقسام'
                    : 'Executive Organization Monthly Performance Report'}
                </h1>
                <p className="text-xs text-slate-600 mt-0.5">
                  {ar
                    ? `الفترة التقييمية: ${reportMonthLabel} · تاريخ الإصدار الرسمي: ${new Date().toLocaleDateString('ar-EG')}`
                    : `Evaluation Period: ${reportMonthLabel} · Issued: ${new Date().toLocaleDateString('en-US')}`}
                </p>
              </div>
            </div>

            <div className="text-right font-mono">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                {ar ? '✓ معتمد رسمياً' : '✓ OFFICIALLY VERIFIED'}
              </span>
              <p className="text-[11px] text-slate-500 mt-1">
                REF: VP-REP-{new Date().getFullYear()}-
                {selectedEmployee ? selectedEmployee.id : 'ORG'}
              </p>
            </div>
          </div>

          {/* Individual Employee Profile & Certificate Box OR Organization KPI Strip */}
          {selectedEmployee ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 border border-slate-200 rounded-lg p-4 bg-white space-y-2">
                <div className="flex items-center gap-2 text-xs text-indigo-700 font-bold">
                  <UserCheck className="w-4 h-4" />
                  <span>{ar ? 'بيانات الموظف الرسمية' : 'Employee Profile'}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-slate-500">
                      {ar ? 'الاسم الكامل:' : 'Full Name:'}
                    </span>
                    <p className="font-bold text-slate-900 mt-0.5">
                      {selectedEmployee.fullName}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">
                      {ar ? 'المسمى الوظيفي والقسم:' : 'Role & Department:'}
                    </span>
                    <p className="font-bold text-slate-900 mt-0.5">
                      {selectedEmployee.jobTitle} ({selectedEmployee.department})
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">
                      {ar ? 'الرقم الوظيفي:' : 'Employee ID:'}
                    </span>
                    <p className="font-mono font-bold text-slate-900 mt-0.5">
                      {selectedEmployee.employeeNumber || `EMP-${selectedEmployee.id}`}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">
                      {ar ? 'البريد الإلكتروني:' : 'Email:'}
                    </span>
                    <p className="font-mono text-slate-800 mt-0.5">
                      {selectedEmployee.email}
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-2 border-indigo-600 rounded-lg p-4 bg-indigo-50/50 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-900">
                    {ar ? 'التصنيف ومجموع النقاط' : 'Overall Score & Standing'}
                  </span>
                  <Award className="w-5 h-5 text-indigo-700" />
                </div>
                <div className="my-2">
                  <p className="text-3xl font-bold font-mono text-indigo-700">
                    {selectedEmployee.weightedScore}{' '}
                    <span className="text-xs font-normal text-slate-600">
                      {ar ? 'نقطة' : 'pts'}
                    </span>
                  </p>
                  <p className="text-xs font-semibold text-slate-800 mt-1">
                    {ar ? 'معدل الإنجاز:' : 'Completion Rate:'}{' '}
                    <strong className="font-mono text-emerald-700">
                      {selectedEmployee.completionRate}%
                    </strong>{' '}
                    ({selectedEmployee.approvedCompleted}/
                    {selectedEmployee.totalAssigned})
                  </p>
                </div>
                <div className="text-[11px] font-semibold text-indigo-900 bg-white px-2.5 py-1 rounded border border-indigo-200">
                  {selectedEmployee.completionRate >= 80
                    ? ar
                      ? '⭐ تقدير ممتاز — أداء استثنائي'
                      : '⭐ Exceeds Expectations (Distinguished)'
                    : selectedEmployee.completionRate >= 50
                    ? ar
                      ? '✓ تقدير جيد جداً — التزام منتظم'
                      : '✓ Meets Expectations (Solid Delivery)'
                    : ar
                    ? '📈 قيد التطوير والمتابعة'
                    : '📈 Developing / Active Progress'}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                <p className="text-xs text-slate-500">
                  {ar ? 'إجمالي الموظفين النشطين' : 'Active Employees'}
                </p>
                <p className="text-2xl font-bold font-mono text-slate-900 mt-1">
                  {summary.activeEmployees} / {summary.totalEmployees}
                </p>
              </div>
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                <p className="text-xs text-slate-500">
                  {ar ? 'إجمالي التكليفات' : 'Total Assignments'}
                </p>
                <p className="text-2xl font-bold font-mono text-slate-900 mt-1">
                  {summary.totalAssignedTasks}
                </p>
              </div>
              <div className="border border-slate-200 rounded-lg p-4 bg-emerald-50/60">
                <p className="text-xs text-emerald-800">
                  {ar ? 'المهام المعتمدة (100%)' : 'Approved Completed'}
                </p>
                <p className="text-2xl font-bold font-mono text-emerald-700 mt-1">
                  {summary.completedApprovedTasks} ({summary.overallCompletionRate}%)
                </p>
              </div>
              <div className="border border-slate-200 rounded-lg p-4 bg-indigo-50/60">
                <p className="text-xs text-indigo-800">
                  {ar ? 'المهام قيد التنفيذ' : 'Tasks In Progress'}
                </p>
                <p className="text-2xl font-bold font-mono text-indigo-700 mt-1">
                  {summary.tasksInProgress}
                </p>
              </div>
            </div>
          )}

          {/* If Organization Report: Employee Ranking Table */}
          {!selectedEmployee && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200">
                <h2 className="text-xs font-bold text-slate-900">
                  {ar
                    ? 'جدول تقييم أداء الموظفين وترتيب النقاط الموزونة'
                    : 'Employee Performance Leaderboard & Completion Breakdown'}
                </h2>
              </div>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                    <th className="py-2.5 px-3">{ar ? '#' : 'Rank'}</th>
                    <th className="py-2.5 px-3">{ar ? 'الموظف' : 'Employee'}</th>
                    <th className="py-2.5 px-3">{ar ? 'القسم' : 'Department'}</th>
                    <th className="py-2.5 px-3 text-right">
                      {ar ? 'المسندة' : 'Assigned'}
                    </th>
                    <th className="py-2.5 px-3 text-right">
                      {ar ? 'المعتمدة' : 'Approved'}
                    </th>
                    <th className="py-2.5 px-3 text-right">
                      {ar ? 'نسبة الإنجاز' : 'Completion %'}
                    </th>
                    <th className="py-2.5 px-3 text-right">
                      {ar ? 'النقاط الموزونة' : 'Weighted Score'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {[...activeEmployees]
                    .sort((a, b) => b.weightedScore - a.weightedScore)
                    .map((emp, idx) => (
                      <tr key={emp.id}>
                        <td className="py-2 px-3 font-mono font-bold">
                          #{idx + 1}
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-900">
                          {emp.fullName}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {emp.department}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {emp.totalAssigned}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                          {emp.approvedCompleted}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">
                          {emp.completionRate}%
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-indigo-700">
                          {emp.weightedScore} pts
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Detailed Tasks & Assignments Log */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200">
              <h2 className="text-xs font-bold text-slate-900">
                {ar
                  ? `سجل المهام والتكليفات التفصيلي (${targetAssignments.length})`
                  : `Detailed Task Assignments & Audit Record (${targetAssignments.length})`}
              </h2>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                  <th className="py-2.5 px-3">{ar ? 'المهمة' : 'Task Title'}</th>
                  {!selectedEmployee && (
                    <th className="py-2.5 px-3">
                      {ar ? 'الموظف المكلف' : 'Assignee'}
                    </th>
                  )}
                  <th className="py-2.5 px-3">{ar ? 'الأولوية' : 'Priority'}</th>
                  <th className="py-2.5 px-3">{ar ? 'الحالة' : 'Status'}</th>
                  <th className="py-2.5 px-3 text-right">
                    {ar ? 'التقدم' : 'Progress'}
                  </th>
                  <th className="py-2.5 px-3">
                    {ar ? 'تاريخ التسليم' : 'Due Date'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {targetAssignments.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 px-3 font-semibold text-slate-900">
                      {a.task?.title}
                    </td>
                    {!selectedEmployee && (
                      <td className="py-2 px-3 text-slate-700">
                        {a.employee?.fullName}
                      </td>
                    )}
                    <td className="py-2 px-3">
                      {a.task && <PriorityText priority={a.task.priority} />}
                    </td>
                    <td className="py-2 px-3">
                      <AssignmentStatusText
                        status={a.status}
                        isOverdue={a.isOverdue}
                      />
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold">
                      {a.progressPercentage}%
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-600">
                      {formatDateShort(a.task?.dueDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Official Signatures Footer */}
          <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-300 text-xs text-slate-700">
            <div>
              <p className="font-bold text-slate-900">
                {ar
                  ? 'توقيع واعتماد إدارة العمليات والموارد البشرية:'
                  : 'Authorized Executive Operations Signature:'}
              </p>
              <div className="h-10 border-b border-dashed border-slate-400 mt-4" />
              <p className="text-[11px] text-slate-500 mt-1">
                VeloPulse Enterprise Governance System
              </p>
            </div>
            <div>
              <p className="font-bold text-slate-900">
                {ar
                  ? 'توقيع الموظف / رئيس القسم بالاطلاع:'
                  : 'Employee / Department Head Acknowledgment:'}
              </p>
              <div className="h-10 border-b border-dashed border-slate-400 mt-4" />
              <p className="text-[11px] text-slate-500 mt-1">
                {selectedEmployee
                  ? selectedEmployee.fullName
                  : ar
                  ? 'جميع رؤساء الأقسام'
                  : 'Department Heads'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
