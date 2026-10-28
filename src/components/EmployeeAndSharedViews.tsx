import React, { useMemo, useState } from 'react';
import {
  ActivityLogRecord,
  CurrentUser,
  EmployeeStat,
  EnrichedAssignment,
  NotificationRecord,
  OrganizationData,
  SummaryMetrics,
} from '../types/workspace.ts';
import {
  AssignmentStatusText,
  formatDateShort,
  formatDateTimeShort,
  PriorityText,
  ProgressBar,
} from './StatusIndicators.tsx';
import {
  isArabicActive,
  translateActorName,
  translateEventType,
  translateNotificationBody,
  translateNotificationTitle,
} from '../lib/i18n.ts';
import {
  CheckCheck,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Lock,
  Play,
  Search,
  Sliders,
  Trophy,
  User,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmployeeOfTheMonthSpotlight } from './EmployeeOfTheMonthSpotlight.tsx';

// ---------------------------------------------------------------------------
// 1. EMPLOYEE PERSONAL WORKSPACE & MY TASKS
// ---------------------------------------------------------------------------
export function EmployeeWorkspaceView({
  currentUser,
  summary,
  assignments,
  employees = [],
  organization,
  onStartTask,
  onOpenAssignmentModal,
}: {
  currentUser: CurrentUser;
  summary: SummaryMetrics;
  assignments: EnrichedAssignment[];
  employees?: EmployeeStat[];
  organization?: OrganizationData;
  onStartTask: (assignmentId: number) => Promise<void>;
  onOpenAssignmentModal: (
    a: EnrichedAssignment,
    mode: 'update' | 'submit' | 'review' | 'history'
  ) => void;
}) {
  const ar = isArabicActive();
  const [statusFilter, setStatusFilter] = useState('all');
  const [deadlineFilter, setDeadlineFilter] = useState<
    'all' | 'upcoming' | 'overdue'
  >('all');
  const [startingId, setStartingId] = useState<number | null>(null);

  const filteredAssignments = useMemo(() => {
    const now = Date.now();
    return assignments.filter((a) => {
      if (a.status === 'canceled') return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (deadlineFilter === 'overdue' && !a.isOverdue) return false;
      if (deadlineFilter === 'upcoming') {
        const due = a.task?.dueDate ? new Date(a.task.dueDate).getTime() : 0;
        if (due < now || a.status === 'approved') return false;
      }
      return true;
    });
  }, [assignments, statusFilter, deadlineFilter]);

  const handleStart = async (id: number) => {
    setStartingId(id);
    try {
      await onStartTask(id);
    } finally {
      setStartingId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-indigo-700">
            {ar
              ? `مساحة عمل الموظف الشخصية · ${currentUser.department}`
              : `Employee Personal Workspace · ${currentUser.department}`}
          </p>
          <h1 className="text-2xl font-bold text-slate-900 font-display mt-0.5">
            {ar
              ? `مرحباً بك مجدداً، ${currentUser.fullName}`
              : `Welcome back, ${currentUser.fullName}`}
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            {ar
              ? 'استعرض مهامك المسندة، ابدأ التنفيذ، سجّل تحديثات نسبة الإنجاز، وسلّم العمل المكتمل لاعتماد المدير.'
              : 'Review your assigned tasks, start work, record append-only progress updates, and submit completed work for manager approval.'}
          </p>
        </div>

        <div className="flex items-center gap-6 text-right">
          <div>
            <p className="text-xs text-slate-500">
              {ar ? 'معدل الإنجاز' : 'Completion Rate'}
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums text-indigo-700">
              {summary.overallCompletionRate}%
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">
              {ar ? 'المهام المعتمدة' : 'Approved Tasks'}
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
              {summary.completedApprovedTasks}
            </p>
          </div>
        </div>
      </div>

      {/* Employee of the Month Spotlight & Printable PDF Certificate */}
      {employees.length > 0 && (
        <EmployeeOfTheMonthSpotlight
          employees={employees}
          organization={organization}
          currentUserId={currentUser.id}
          isAdmin={false}
        />
      )}

      {/* Personal Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">
            {ar ? 'مسندة إليّ' : 'Assigned to Me'}
          </p>
          <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {summary.totalAssignedTasks}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">
            {ar ? 'لم تبدأ' : 'Not Started'}
          </p>
          <p className="text-xl font-bold font-mono tabular-nums text-slate-700 mt-1">
            {summary.tasksNotStarted}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">
            {ar ? 'قيد التنفيذ' : 'In Progress'}
          </p>
          <p className="text-xl font-bold font-mono tabular-nums text-indigo-700 mt-1">
            {summary.tasksInProgress}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">
            {ar ? 'بانتظار المراجعة' : 'Awaiting Review'}
          </p>
          <p className="text-xl font-bold font-mono tabular-nums text-amber-700 mt-1">
            {summary.tasksAwaitingReview}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">
            {ar ? 'مكتملة ومعتمدة' : 'Completed & Approved'}
          </p>
          <p className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {summary.completedApprovedTasks}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">
            {ar ? 'متأخرة' : 'Overdue'}
          </p>
          <p className="text-xl font-bold font-mono tabular-nums text-red-700 mt-1">
            {summary.overdueTasks}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          {[
            { id: 'all', label: ar ? 'جميع مهامي' : 'All My Tasks' },
            { id: 'not_started', label: ar ? 'لم تبدأ' : 'Not Started' },
            { id: 'in_progress', label: ar ? 'قيد التنفيذ' : 'In Progress' },
            {
              id: 'awaiting_review',
              label: ar ? 'بانتظار المراجعة' : 'Awaiting Review',
            },
            { id: 'approved', label: ar ? 'مكتملة' : 'Completed' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="employee-task-status-filter"
              className="text-xs font-medium text-slate-600 whitespace-nowrap"
            >
              {ar ? 'الحالة:' : 'Status:'}
            </label>
            <select
              id="employee-task-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter tasks by status"
              className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              <option value="all">
                {ar ? 'جميع الحالات' : 'All Statuses'}
              </option>
              <option value="not_started">
                {ar ? 'لم تبدأ' : 'Not Started'}
              </option>
              <option value="in_progress">
                {ar ? 'قيد التنفيذ' : 'In Progress'}
              </option>
              <option value="awaiting_review">
                {ar ? 'بانتظار المراجعة' : 'Awaiting Review'}
              </option>
              <option value="approved">
                {ar ? 'مكتملة' : 'Completed'}
              </option>
              <option value="rejected">
                {ar ? 'مطلوب تعديلات' : 'Revision Requested'}
              </option>
            </select>
          </div>

          <select
            value={deadlineFilter}
            onChange={(e) => setDeadlineFilter(e.target.value as any)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
            aria-label="Filter by deadline"
          >
            <option value="all">
              {ar ? 'جميع المواعيد النهائية' : 'All Deadlines'}
            </option>
            <option value="upcoming">
              {ar ? 'المواعيد القادمة' : 'Upcoming Deadlines'}
            </option>
            <option value="overdue">
              {ar ? 'المتأخرة فقط' : 'Overdue Only'}
            </option>
          </select>
        </div>
      </div>

      {/* My Tasks Cards */}
      {filteredAssignments.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <p className="text-base font-bold text-slate-900 font-display">
            {ar
              ? 'لا توجد مهام تطابق الفلتر المحدد حالياً'
              : 'No tasks match your current filter'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {ar
              ? 'قم بتغيير فلتر الحالة بالأعلى لعرض كافة المهام المسندة إليك.'
              : 'Switch the status filter above to view all assigned tasks.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredAssignments.map((a) => {
            const latestReview = a.reviews[0];
            return (
              <div
                key={a.id}
                className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <div className="flex items-center gap-2">
                      <span>{a.task?.category}</span>
                      <span aria-hidden="true">·</span>
                      {a.task && <PriorityText priority={a.task.priority} />}
                    </div>
                    <AssignmentStatusText
                      status={a.status}
                      isOverdue={a.isOverdue}
                    />
                  </div>

                  <h2 className="text-base font-bold text-slate-900 font-display">
                    {a.task?.title}
                  </h2>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {a.task?.description}
                  </p>

                  {a.latestNote && (
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700">
                      <span className="font-semibold text-slate-900">
                        {ar ? 'آخر ملاحظة عمل:' : 'Latest Work Note:'}
                      </span>{' '}
                      “{a.latestNote}”
                    </div>
                  )}

                  {latestReview && (
                    <div className="p-2.5 bg-indigo-50/60 border border-indigo-200 rounded text-xs text-slate-800">
                      <span className="font-semibold">
                        {ar
                          ? `مراجعة المدير (${
                              latestReview.decision === 'approved'
                                ? 'معتمدة'
                                : 'مطلوب تعديل'
                            }):`
                          : `Manager Review (${latestReview.decision.toUpperCase()}):`}
                      </span>{' '}
                      {latestReview.reviewNotes}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {ar ? 'موعد التسليم:' : 'Deadline:'}{' '}
                      <strong className="font-mono text-slate-900">
                        {formatDateShort(a.task?.dueDate)}
                      </strong>
                    </span>
                    <span className="font-mono">
                      {ar ? 'آخر تحديث' : 'Updated'}{' '}
                      {formatDateTimeShort(a.updatedAt)}
                    </span>
                  </div>

                  <ProgressBar
                    percentage={a.progressPercentage}
                    status={a.status}
                    isOverdue={a.isOverdue}
                  />

                  {/* State-Dependent Primary Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onOpenAssignmentModal(a, 'history')}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900 underline cursor-pointer"
                    >
                      {ar
                        ? `عرض سجل التحديثات (${a.progressUpdates.length})`
                        : `View Progress History (${a.progressUpdates.length})`}
                    </button>

                    <div className="flex items-center gap-2">
                      {a.status === 'not_started' && (
                        <button
                          type="button"
                          disabled={startingId === a.id}
                          onClick={() => handleStart(a.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-indigo-700 hover:bg-indigo-800 rounded-md cursor-pointer disabled:opacity-50"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>
                            {startingId === a.id
                              ? ar
                                ? 'جاري البدء...'
                                : 'Starting...'
                              : ar
                              ? 'بدء المهمة'
                              : 'Start Task'}
                          </span>
                        </button>
                      )}

                      {(a.status === 'in_progress' ||
                        a.status === 'rejected') && (
                        <>
                          <button
                            type="button"
                            onClick={() => onOpenAssignmentModal(a, 'update')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-700 hover:bg-indigo-800 rounded-md cursor-pointer"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>
                              {a.status === 'rejected'
                                ? ar
                                  ? 'تعديل وتحديث'
                                  : 'Revise & Update'
                                : ar
                                ? 'تحديث التقدم'
                                : 'Update Progress'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenAssignmentModal(a, 'submit')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{ar ? 'تسليم 100%' : 'Submit 100%'}</span>
                          </button>
                        </>
                      )}

                      {a.status === 'awaiting_review' && (
                        <button
                          type="button"
                          onClick={() => onOpenAssignmentModal(a, 'history')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md cursor-pointer"
                        >
                          <span>
                            {ar ? 'عرض التسليم' : 'View Submission'}
                          </span>
                        </button>
                      )}

                      {a.status === 'approved' && (
                        <button
                          type="button"
                          onClick={() => onOpenAssignmentModal(a, 'history')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            {ar
                              ? 'عرض المهمة المكتملة'
                              : 'View Completed Task'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. EMPLOYEE LEADERBOARD & PERFORMANCE SCORING
// ---------------------------------------------------------------------------
export function LeaderboardView({
  leaderboard,
  organization,
}: {
  leaderboard: EmployeeStat[];
  organization: OrganizationData;
}) {
  const ar = isArabicActive();
  const [period, setPeriod] = useState<
    'all' | 'current_month' | 'previous_month' | 'custom'
  >('all');
  const [customStart, setCustomStart] = useState('2026-10-01');
  const [customEnd, setCustomEnd] = useState('2026-10-31');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">
            {ar
              ? 'لوحة الصدارة وتقييم الأداء'
              : 'Employee Leaderboard & Performance Scoring'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {ar
              ? 'ترتيب الموظفين المعتمد بناءً على المهام المكتملة المعتمدة من المدير، الالتزام بالمواعيد، وعدالة توزيع العمل.'
              : 'Authoritative rankings derived strictly from manager-approved task completions, on-time delivery, and workload fairness.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            {[
              { id: 'all', label: ar ? 'كل الأوقات' : 'All Time' },
              {
                id: 'current_month',
                label: ar ? 'الشهر الحالي' : 'Current Month',
              },
              {
                id: 'previous_month',
                label: ar ? 'الشهر السابق' : 'Previous Month',
              },
              { id: 'custom', label: ar ? 'فترة مخصصة' : 'Custom Range' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id as any)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  period === p.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="flex items-center gap-2 text-xs font-mono">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2 py-1 border border-slate-300 rounded bg-white"
              />
              <span>{ar ? 'إلى' : 'to'}</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2 py-1 border border-slate-300 rounded bg-white"
              />
            </div>
          )}
        </div>
      </div>

      {/* Employee of the Month Spotlight & Printable PDF Certificate */}
      <EmployeeOfTheMonthSpotlight
        employees={leaderboard}
        organization={organization}
      />

      {/* Methodology Documentation Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-2">
          <Trophy className="w-4 h-4 text-indigo-700" />
          <h2 className="text-sm font-bold text-slate-900 font-display">
            {ar
              ? 'منهجية الترتيب الشفاف وحساب النقاط الموزونة'
              : 'Transparent Ranking & Weighted Scoring Methodology'}
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
          <div>
            <strong className="text-slate-900">
              {ar ? '1. المعيار الأساسي:' : '1. Primary Criterion:'}
            </strong>{' '}
            {ar
              ? 'عدد المهام المكتملة والمعتمدة من المدير. المهام المرسلة للمراجعة لا تُحتسب حتى يتم اعتمادها.'
              : 'Number of manager-approved completed assignments. Unreviewed 100% submissions never count until approved.'}
          </div>
          <div>
            <strong className="text-slate-900">
              {ar ? '2. قواعد كسر التعادل:' : '2. Tie-Breaking Rules:'}
            </strong>{' '}
            {ar
              ? 'ثانياً: نسبة الالتزام بالموعد (%). ثالثاً: مجموع النقاط الموزونة حسب الأولوية.'
              : 'Secondary: On-Time Completion Rate (%). Tertiary: Weighted Complexity Score.'}
          </div>
          <div>
            <strong className="text-slate-900">
              {ar ? '3. المعادلة الموزونة:' : '3. Weighted Formula:'}
            </strong>{' '}
            <span className="font-mono">
              {ar
                ? `الأساسي (${
                    organization?.scoringBasePoints ?? 100
                  } نقطة × وزن الأولوية) + بونص الموعد (+${
                    organization?.scoringOnTimeBonus ?? 25
                  }) + بونص الجودة`
                : `Base (${
                    organization?.scoringBasePoints ?? 100
                  } pts × Priority Weight) + On-Time Bonus (+${
                    organization?.scoringOnTimeBonus ?? 25
                  } pts) + Quality Bonus`}
            </span>
          </div>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className={`w-full ${
              ar ? 'text-right' : 'text-left'
            } border-collapse`}
          >
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4 w-16">{ar ? 'المركز' : 'Rank'}</th>
                <th className="py-3 px-4">{ar ? 'الموظف' : 'Employee'}</th>
                <th className="py-3 px-4">{ar ? 'القسم' : 'Department'}</th>
                <th className="py-3 px-4 text-right">
                  {ar ? 'المكتملة المعتمدة' : 'Approved Completed'}
                </th>
                <th className="py-3 px-4 text-right">
                  {ar ? 'إجمالي المسندة' : 'Total Assigned'}
                </th>
                <th className="py-3 px-4 text-right">
                  {ar ? 'العبء الحالي' : 'Current Workload'}
                </th>
                <th className="py-3 px-4 text-right">
                  {ar ? 'معدل الإنجاز' : 'Completion Rate'}
                </th>
                <th className="py-3 px-4 text-right">
                  {ar ? 'الالتزام بالموعد' : 'On-Time Rate'}
                </th>
                <th className="py-3 px-4 text-right">
                  {ar ? 'النقاط الموزونة' : 'Weighted Score'}
                </th>
                <th className="py-3 px-4">
                  {ar ? 'مؤشر الأداء' : 'Performance Indicator'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {leaderboard.map((emp) => {
                let perfIndicator = ar ? 'تقدم طبيعي' : 'Normal Progress';
                let perfColor = 'text-slate-700';
                if (emp.overdue > 0) {
                  perfIndicator = ar
                    ? `يتطلب متابعة (${emp.overdue} متأخرة)`
                    : `Requires Attention (${emp.overdue} Overdue)`;
                  perfColor = 'text-red-700 font-semibold';
                } else if (emp.approvedCompleted >= 1 && emp.onTimeRate >= 90) {
                  perfIndicator = ar ? 'أداء متميز' : 'Strong Performance';
                  perfColor = 'text-emerald-700 font-semibold';
                }

                return (
                  <tr
                    key={emp.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono tabular-nums font-bold text-slate-900">
                      #{emp.rank}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-900">
                        {emp.fullName}
                      </p>
                      <p className="text-slate-500">{emp.jobTitle}</p>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">
                      {emp.department}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-emerald-700">
                      {emp.approvedCompleted}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {emp.totalAssigned}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-indigo-700">
                      {emp.currentActiveWorkload} {ar ? 'نشطة' : 'active'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {emp.completionRate}%
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {emp.onTimeRate}%
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-indigo-700">
                      {emp.weightedScore} {ar ? 'نقطة' : 'pts'}
                    </td>
                    <td className={`py-3.5 px-4 whitespace-nowrap ${perfColor}`}>
                      {perfIndicator}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. REPORTS, ANALYTICS & SANITIZED CSV EXPORTS
// ---------------------------------------------------------------------------
export function ReportsAnalyticsView({
  employees,
  assignments,
  onDownloadCsv,
}: {
  employees: EmployeeStat[];
  assignments: EnrichedAssignment[];
  onDownloadCsv: (type: 'employees' | 'tasks') => Promise<void>;
}) {
  const ar = isArabicActive();
  const deptData = useMemo(() => {
    const map = new Map<
      string,
      {
        department: string;
        Approved: number;
        InProgress: number;
        Overdue: number;
      }
    >();
    for (const emp of employees.filter((e) => e.role === 'employee')) {
      const current = map.get(emp.department) || {
        department: emp.department,
        Approved: 0,
        InProgress: 0,
        Overdue: 0,
      };
      current.Approved += emp.approvedCompleted;
      current.InProgress += emp.inProgress;
      current.Overdue += emp.overdue;
      map.set(emp.department, current);
    }
    return Array.from(map.values());
  }, [employees]);

  const employeeChartData = useMemo(() => {
    return employees
      .filter((e) => e.role === 'employee')
      .map((e) => ({
        name: e.fullName.split(' ')[0],
        CompletionRate: e.completionRate,
        OnTimeRate: e.onTimeRate,
      }));
  }, [employees]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">
            {ar
              ? 'تقارير وتحليلات المؤسسة'
              : 'Organizational Reports & Analytics'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {ar
              ? 'توزيع عبء العمل حسب الأقسام، معدلات التسليم في الموعد، وتصدير التقارير بصيغة CSV / Excel.'
              : 'Departmental workload distribution, on-time completion trends, and formula-injection safe CSV exports.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onDownloadCsv('employees')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-md cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-indigo-700" />
            <span>
              {ar ? 'تصدير تقرير الموظفين CSV' : 'Export Employees CSV'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onDownloadCsv('tasks')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-indigo-700 hover:bg-indigo-800 rounded-md cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>
              {ar ? 'تصدير تكليفات المهام CSV' : 'Export Task Assignments CSV'}
            </span>
          </button>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h2 className="text-sm font-bold text-slate-900 font-display mb-1">
            {ar
              ? 'نتائج المهام حسب القسم (معتمدة مقابل قيد التنفيذ مقابل متأخرة)'
              : 'Departmental Task Outcomes (Approved vs. In Progress vs. Overdue)'}
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            {ar
              ? 'إجمالي التكليفات النشطة للموظفين في كل قسم.'
              : 'Aggregated across all active employee assignments per department.'}
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="department" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="Approved"
                  name={ar ? 'معتمدة' : 'Approved'}
                  fill="#16a34a"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="InProgress"
                  name={ar ? 'قيد التنفيذ' : 'InProgress'}
                  fill="#4f46e5"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="Overdue"
                  name={ar ? 'متأخرة' : 'Overdue'}
                  fill="#dc2626"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h2 className="text-sm font-bold text-slate-900 font-display mb-1">
            {ar
              ? 'معدل إنجاز الموظف مقابل معدل التسليم في الموعد (%)'
              : 'Employee Completion Rate vs. On-Time Delivery Rate (%)'}
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            {ar
              ? 'مقارنة النسب المئوية بين الموظفين النشطين.'
              : 'Percentage comparison across active staff members.'}
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={employeeChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="CompletionRate"
                  name={ar ? 'معدل الإنجاز (%)' : 'Completion Rate (%)'}
                  fill="#3730a3"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="OnTimeRate"
                  name={ar ? 'الالتزام بالموعد (%)' : 'On-Time Rate (%)'}
                  fill="#0d9488"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Overdue & Attention Required Report Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-900 font-display">
            {ar
              ? 'التكليفات التي تتطلب متابعة (متأخرة وبانتظار المراجعة)'
              : 'Assignments Requiring Attention (Overdue & Awaiting Review)'}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table
            className={`w-full ${
              ar ? 'text-right' : 'text-left'
            } border-collapse text-xs`}
          >
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                <th className="py-3 px-4">
                  {ar ? 'عنوان المهمة' : 'Task Title'}
                </th>
                <th className="py-3 px-4">{ar ? 'الموظف' : 'Employee'}</th>
                <th className="py-3 px-4">{ar ? 'الحالة' : 'Status'}</th>
                <th className="py-3 px-4">{ar ? 'التقدم' : 'Progress'}</th>
                <th className="py-3 px-4">
                  {ar ? 'موعد التسليم' : 'Deadline'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {assignments
                .filter((a) => a.isOverdue || a.status === 'awaiting_review')
                .map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {a.task?.title}
                    </td>
                    <td className="py-3 px-4">
                      {a.employee?.fullName} ({a.employee?.department})
                    </td>
                    <td className="py-3 px-4">
                      <AssignmentStatusText
                        status={a.status}
                        isOverdue={a.isOverdue}
                      />
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums">
                      {a.progressPercentage}%
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums">
                      {formatDateShort(a.task?.dueDate)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. PERSISTENT NOTIFICATION CENTER
// ---------------------------------------------------------------------------
export function NotificationsCenterView({
  notifications,
  assignments,
  onMarkRead,
  onMarkAllRead,
  onInspectAssignment,
}: {
  notifications: NotificationRecord[];
  assignments: EnrichedAssignment[];
  onMarkRead: (id: number) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onInspectAssignment: (a: EnrichedAssignment) => void;
}) {
  const ar = isArabicActive();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filtered = useMemo(() => {
    if (filter === 'unread') {
      return notifications.filter((n) => !n.readAt);
    }
    return notifications;
  }, [notifications, filter]);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">
            {ar
              ? `مركز الإشعارات (${unreadCount} غير مقروء)`
              : `Notification Center (${unreadCount} Unread)`}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {ar
              ? 'إشعارات فورية ومستديمة لبدء المهام، تحديثات التقدم، طلبات المراجعة، وقرارات الاعتماد.'
              : 'Persistent notifications for task starts, progress updates, review submissions, and manager decisions.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                filter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              {ar ? `الكل (${notifications.length})` : `All (${notifications.length})`}
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                filter === 'unread'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              {ar ? `غير مقروء (${unreadCount})` : `Unread (${unreadCount})`}
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>{ar ? 'تحديد الكل كمقروء' : 'Mark All as Read'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            {ar
              ? 'لا توجد إشعارات لعرضها في هذا القسم.'
              : 'No notifications to display in this view.'}
          </div>
        ) : (
          filtered.map((n) => {
            const relatedAssignment = assignments.find(
              (a) => a.id === n.relatedAssignmentId
            );
            const isUnread = !n.readAt;
            return (
              <div
                key={n.id}
                className={`p-4 flex flex-wrap items-start justify-between gap-4 transition-colors ${
                  isUnread ? 'bg-indigo-50/30' : 'bg-white'
                }`}
              >
                <div className="space-y-1 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-indigo-700">
                      {translateEventType(n.eventType)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {ar
                        ? `المنفذ: ${translateActorName(n.actorName)}`
                        : `Actor: ${n.actorName}`}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">
                      {formatDateTimeShort(n.createdAt)}
                    </span>
                    {isUnread && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-indigo-700">
                          {ar ? 'غير مقروء' : 'UNREAD'}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    {translateNotificationTitle(n.title)}
                  </p>
                  <p className="text-xs text-slate-600">
                    {translateNotificationBody(n.body)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {relatedAssignment && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isUnread) onMarkRead(n.id);
                        onInspectAssignment(relatedAssignment);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200 rounded-md cursor-pointer"
                    >
                      <span>{ar ? 'فتح المهمة' : 'Open Task'}</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                  {isUnread && (
                    <button
                      type="button"
                      onClick={() => onMarkRead(n.id)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                    >
                      {ar ? 'تحديد كمقروء' : 'Mark Read'}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. ACTIVITY AUDIT LOG (Admin Only, Append-Only)
// ---------------------------------------------------------------------------
export function ActivityAuditLogView({
  logs,
}: {
  logs: ActivityLogRecord[];
}) {
  const ar = isArabicActive();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (l) =>
        l.action.toLowerCase().includes(q) ||
        l.actorName.toLowerCase().includes(q) ||
        l.entityType.toLowerCase().includes(q) ||
        JSON.stringify(l.parsedMetadata).toLowerCase().includes(q)
    );
  }, [logs, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">
            {ar
              ? 'سجل التدقيق الأمني والأنشطة (غير قابل للتعديل)'
              : 'Immutable Security & Activity Audit Log'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {ar
              ? 'سجل زمني موثق لكافة العمليات الإدارية، تحديثات تقدم الموظفين، مراجعات الاعتماد، وعمليات تسجيل الدخول.'
              : 'Append-only record of administrative actions, employee progress updates, completion reviews, and authentication events.'}
          </p>
        </div>

        <div className="relative min-w-[260px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              ar
                ? 'بحث في السجل حسب المنفذ أو نوع العملية...'
                : 'Filter audit trail by actor or action...'
            }
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-md bg-white"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className={`w-full ${
              ar ? 'text-right' : 'text-left'
            } border-collapse text-xs`}
          >
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                <th className="py-3 px-4">
                  {ar ? 'التاريخ والوقت' : 'Timestamp'}
                </th>
                <th className="py-3 px-4">{ar ? 'المنفذ' : 'Actor'}</th>
                <th className="py-3 px-4">{ar ? 'العملية' : 'Action'}</th>
                <th className="py-3 px-4">
                  {ar ? 'العنصر المستهدف' : 'Target Entity'}
                </th>
                <th className="py-3 px-4">
                  {ar ? 'تفاصيل العملية' : 'Audit Metadata'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                    {formatDateTimeShort(log.createdAt)}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                    {translateActorName(log.actorName)}
                  </td>
                  <td className="py-3 px-4 font-semibold text-indigo-700 whitespace-nowrap">
                    {translateEventType(log.action)}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                    {log.entityType} #{log.entityId}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600">
                    {Object.entries(log.parsedMetadata || {})
                      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                      .join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. PROFILE & ORGANIZATION SETTINGS VIEW
// ---------------------------------------------------------------------------
export function ProfileAndOrgSettingsView({
  currentUser,
  organization,
  onUpdateProfile,
  onChangePassword,
  onUpdateOrg,
}: {
  currentUser: CurrentUser;
  organization: OrganizationData;
  onUpdateProfile: (payload: {
    fullName: string;
    jobTitle: string;
  }) => Promise<void>;
  onChangePassword: (payload: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
  onUpdateOrg: (payload: {
    name: string;
    workHoursPerDay: number;
    scoringBasePoints: number;
    scoringOnTimeBonus: number;
    scoringQualityBonus: number;
  }) => Promise<void>;
}) {
  const ar = isArabicActive();
  const [fullName, setFullName] = useState(currentUser.fullName);
  const [jobTitle, setJobTitle] = useState(currentUser.jobTitle);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);
  const [pwdErr, setPwdErr] = useState<string | null>(null);

  const [orgName, setOrgName] = useState(organization?.name || 'VeloPulse');
  const [workHoursPerDay, setWorkHoursPerDay] = useState(
    organization?.workHoursPerDay || 8
  );
  const [scoringBasePoints, setScoringBasePoints] = useState(
    organization?.scoringBasePoints || 100
  );
  const [scoringOnTimeBonus, setScoringOnTimeBonus] = useState(
    organization?.scoringOnTimeBonus || 25
  );
  const [scoringQualityBonus, setScoringQualityBonus] = useState(
    organization?.scoringQualityBonus || 20
  );
  const [orgMsg, setOrgMsg] = useState<string | null>(null);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setProfileErr(null);
    try {
      await onUpdateProfile({ fullName, jobTitle });
      setProfileMsg(
        ar ? 'تم تحديث الملف الشخصي بنجاح.' : 'Profile updated successfully.'
      );
    } catch (err: any) {
      setProfileErr(err.message || 'Failed to update profile');
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);
    setPwdErr(null);
    try {
      await onChangePassword({ currentPassword, newPassword });
      setPwdMsg(
        ar ? 'تم تغيير كلمة المرور بنجاح.' : 'Password changed successfully.'
      );
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setPwdErr(err.message || 'Failed to change password');
    }
  };

  const handleSaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrgMsg(null);
    await onUpdateOrg({
      name: orgName,
      workHoursPerDay: Number(workHoursPerDay),
      scoringBasePoints: Number(scoringBasePoints),
      scoringOnTimeBonus: Number(scoringOnTimeBonus),
      scoringQualityBonus: Number(scoringQualityBonus),
    });
    setOrgMsg(
      ar
        ? 'تم حفظ إعدادات المؤسسة وأوزان النقاط بنجاح.'
        : 'Organization settings and scoring weights saved.'
    );
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 font-display">
          {ar
            ? 'إعدادات الحساب والأمان والمؤسسة'
            : 'Account Profile & Security Settings'}
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          {ar
            ? 'إدارة بيانات ملفك الشخصي، تحديث كلمة المرور، وعرض الصلاحيات.'
            : 'Manage your permitted profile fields, update your authentication password, and view role permissions.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Form */}
        <form
          onSubmit={handleSaveProfile}
          className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
        >
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-indigo-700" />
            <h2 className="text-base font-bold text-slate-900 font-display">
              {ar ? 'الملف الشخصي' : 'Personal Profile'}
            </h2>
          </div>

          {profileMsg && (
            <p className="text-xs text-emerald-700 font-medium">{profileMsg}</p>
          )}
          {profileErr && (
            <p className="text-xs text-red-700 font-medium">{profileErr}</p>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {ar ? 'الاسم الكامل' : 'Full Name'}
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {ar ? 'المسمى الوظيفي' : 'Job Title'}
            </label>
            <input
              type="text"
              required
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1 text-xs text-slate-500">
            <div>
              <span>{ar ? 'الصلاحية (للقراءة فقط):' : 'Trusted Role (Read-Only):'}</span>
              <p className="font-mono font-semibold text-slate-900 uppercase mt-0.5">
                {ar
                  ? currentUser.role === 'admin'
                    ? 'مدير النظام'
                    : 'موظف'
                  : currentUser.role}
              </p>
            </div>
            <div>
              <span>{ar ? 'القسم:' : 'Department:'}</span>
              <p className="font-semibold text-slate-900 mt-0.5">
                {currentUser.department}
              </p>
            </div>
          </div>

          <button
            type="submit"
            className="px-4 py-2 text-xs font-medium text-white bg-indigo-700 hover:bg-indigo-800 rounded-md cursor-pointer"
          >
            {ar ? 'حفظ تغييرات الملف الشخصي' : 'Save Profile Changes'}
          </button>
        </form>

        {/* Password Change Form */}
        <form
          onSubmit={handleSavePassword}
          className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
        >
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-indigo-700" />
            <h2 className="text-base font-bold text-slate-900 font-display">
              {ar ? 'تغيير كلمة المرور' : 'Change Password'}
            </h2>
          </div>

          {pwdMsg && (
            <p className="text-xs text-emerald-700 font-medium">{pwdMsg}</p>
          )}
          {pwdErr && (
            <p className="text-xs text-red-700 font-medium">{pwdErr}</p>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {ar ? 'كلمة المرور الحالية' : 'Current Password'}
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {ar
                ? 'كلمة المرور الجديدة (8 أحرف على الأقل)'
                : 'New Password (Min 8 chars, 1 uppercase, 1 number)'}
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>

          <button
            type="submit"
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md cursor-pointer"
          >
            {ar ? 'تحديث كلمة المرور' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Organization Settings (Admin Only) */}
      {currentUser.role === 'admin' && (
        <form
          onSubmit={handleSaveOrg}
          className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
        >
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-700" />
            <h2 className="text-base font-bold text-slate-900 font-display">
              {ar
                ? 'إعدادات المؤسسة ومعايير نقاط لوحة الصدارة'
                : 'Organization & Leaderboard Scoring Configuration'}
            </h2>
          </div>

          {orgMsg && (
            <p className="text-xs text-emerald-700 font-medium">{orgMsg}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar ? 'اسم المؤسسة' : 'Organization Name'}
              </label>
              <input
                type="text"
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar ? 'ساعات العمل اليومية القياسية' : 'Standard Work Hours / Day'}
              </label>
              <input
                type="number"
                min={1}
                max={24}
                value={workHoursPerDay}
                onChange={(e) => setWorkHoursPerDay(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar
                  ? 'النقاط الأساسية لإنجاز المهمة'
                  : 'Approved Completion Base Points'}
              </label>
              <input
                type="number"
                min={10}
                max={1000}
                value={scoringBasePoints}
                onChange={(e) => setScoringBasePoints(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar
                  ? 'نقاط بونص التسليم في الموعد'
                  : 'On-Time Delivery Bonus Points'}
              </label>
              <input
                type="number"
                min={0}
                max={500}
                value={scoringOnTimeBonus}
                onChange={(e) => setScoringOnTimeBonus(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar
                  ? 'نقاط بونص الجودة الافتراضية'
                  : 'Default Quality Bonus Points'}
              </label>
              <input
                type="number"
                min={0}
                max={500}
                value={scoringQualityBonus}
                onChange={(e) => setScoringQualityBonus(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
          </div>

          <button
            type="submit"
            className="px-4 py-2 text-xs font-medium text-white bg-indigo-700 hover:bg-indigo-800 rounded-md cursor-pointer"
          >
            {ar ? 'حفظ إعدادات المؤسسة' : 'Save Organization Settings'}
          </button>
        </form>
      )}
    </div>
  );
}
