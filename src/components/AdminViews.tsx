import React, { useMemo, useState } from 'react';
import {
  EmployeeStat,
  EnrichedAssignment,
  SummaryMetrics,
  TaskData,
} from '../types/workspace.ts';
import {
  AccountStatusText,
  AssignmentStatusText,
  formatDateShort,
  formatDateTimeShort,
  PriorityText,
  ProgressBar,
} from './StatusIndicators.tsx';
import { isArabicActive } from '../lib/i18n.ts';
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Edit3,
  FolderPlus,
  Kanban,
  LayoutList,
  Plus,
  Search,
  UserPlus,
} from 'lucide-react';
import {
  DailySmartBriefingCard,
  InteractiveKanbanBoard,
} from './SmartProductivityFeatures.tsx';

// ---------------------------------------------------------------------------
// 1. ADMIN OVERVIEW DASHBOARD
// ---------------------------------------------------------------------------
export function AdminOverviewView({
  summary,
  assignments,
  employees,
  formulaNote,
  onOpenAddEmployee,
  onOpenCreateTask,
  onInspectAssignment,
  onSelectEmployee,
}: {
  summary: SummaryMetrics;
  assignments: EnrichedAssignment[];
  employees: EmployeeStat[];
  formulaNote: string;
  onOpenAddEmployee: () => void;
  onOpenCreateTask: () => void;
  onInspectAssignment: (
    a: EnrichedAssignment,
    mode?: 'update' | 'submit' | 'review' | 'history'
  ) => void;
  onSelectEmployee: (e: EmployeeStat) => void;
}) {
  const ar = isArabicActive();
  const awaitingReviewList = useMemo(
    () => assignments.filter((a) => a.status === 'awaiting_review'),
    [assignments]
  );

  const activeMonitoringList = useMemo(
    () => assignments.filter((a) => a.status !== 'canceled').slice(0, 12),
    [assignments]
  );

  return (
    <div className="space-y-8">
      {/* Header & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">
            {ar
              ? 'اللوحة التنفيذية للعمليات والمهام'
              : 'Executive Operations Overview'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">{formulaNote}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenAddEmployee}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5 text-indigo-700" />
            <span>{ar ? 'إضافة موظف' : 'Add Employee'}</span>
          </button>
          <button
            type="button"
            onClick={onOpenCreateTask}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-indigo-700 hover:bg-indigo-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>{ar ? 'إنشاء وإسناد مهمة' : 'Create & Assign Task'}</span>
          </button>
        </div>
      </div>

      {/* Daily Smart Briefing by Your Obedient Genie */}
      <DailySmartBriefingCard
        currentUser={{
          id: 1,
          uid: 'admin',
          email: 'admin@velopulse.io',
          fullName: ar ? 'مدير النظام' : 'System Administrator',
          role: 'admin',
          department: 'Executive Operations',
          jobTitle: 'Director of Operations',
          employeeNumber: 'ADM-001',
          accountStatus: 'active',
          lastActivityAt: new Date().toISOString(),
        }}
        assignments={assignments}
        employees={employees}
        onInspectAssignment={onInspectAssignment}
      />

      {/* 9 Real Database-Calculated Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-xs text-slate-500">
            {ar ? 'إجمالي الموظفين' : 'Total Employees'}
          </p>
          <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {summary.totalEmployees}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-xs text-slate-500">
            {ar ? 'الموظفون النشطون' : 'Active Staff'}
          </p>
          <p className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {summary.activeEmployees}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-xs text-slate-500">
            {ar ? 'المهام المسندة' : 'Assigned Tasks'}
          </p>
          <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {summary.totalAssignedTasks}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-xs text-slate-500">
            {ar ? 'لم تبدأ' : 'Not Started'}
          </p>
          <p className="text-xl font-bold font-mono tabular-nums text-slate-600 mt-1">
            {summary.tasksNotStarted}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-xs text-slate-500">
            {ar ? 'قيد التنفيذ' : 'In Progress'}
          </p>
          <p className="text-xl font-bold font-mono tabular-nums text-indigo-700 mt-1">
            {summary.tasksInProgress}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-xs text-slate-500">
            {ar ? 'بانتظار المراجعة' : 'Awaiting Review'}
          </p>
          <p className="text-xl font-bold font-mono tabular-nums text-amber-700 mt-1">
            {summary.tasksAwaitingReview}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-xs text-slate-500">
            {ar ? 'معتمدة' : 'Approved'}
          </p>
          <p className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {summary.completedApprovedTasks}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-xs text-slate-500">
            {ar ? 'متأخرة' : 'Overdue'}
          </p>
          <p className="text-xl font-bold font-mono tabular-nums text-red-700 mt-1">
            {summary.overdueTasks}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5">
          <p className="text-xs text-slate-500">
            {ar ? 'معدل الإنجاز' : 'Completion Rate'}
          </p>
          <p className="text-xl font-bold font-mono tabular-nums text-indigo-700 mt-1">
            {summary.overallCompletionRate}%
          </p>
        </div>
      </div>

      {/* Awaiting Review Banner / Queue if any */}
      {awaitingReviewList.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 font-display">
                {ar
                  ? `تسليمات بانتظار اعتماد المدير (${awaitingReviewList.length})`
                  : `Submissions Awaiting Manager Approval (${awaitingReviewList.length})`}
              </h2>
              <p className="text-xs text-slate-500">
                {ar
                  ? 'أنهى الموظفون هذه المهام بنسبة 100% وأرسلوها للمراجعة والاعتماد النهائي.'
                  : 'Employees have reported 100% completion on these assignments and submitted deliverables for sign-off.'}
              </p>
            </div>
          </div>
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
            {awaitingReviewList.map((a) => (
              <div
                key={a.id}
                className="p-3.5 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {a.task?.title}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {ar ? 'تم التسليم بواسطة ' : 'Submitted by '}
                    <strong className="text-slate-900">
                      {a.employee?.fullName}
                    </strong>{' '}
                    ({a.employee?.department}) ·{' '}
                    <span className="font-mono">
                      {formatDateTimeShort(a.submittedAt)}
                    </span>
                  </p>
                  {a.latestNote && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                      {ar ? 'الملخص:' : 'Summary:'} “{a.latestNote}”
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onInspectAssignment(a, 'review')}
                  className="px-3.5 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {ar ? 'مراجعة واعتماد / طلب تعديل' : 'Review & Approve / Reject'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Progress Monitoring Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 font-display">
              {ar
                ? 'المراقبة الحية لتكليفات المهام ونسب الإنجاز'
                : 'Live Task Assignment & Progress Monitoring'}
            </h2>
            <p className="text-xs text-slate-500">
              {ar
                ? 'متابعة فورية لتحديثات الموظفين، آخر ملاحظات العمل، والالتزام بالمواعيد النهائية.'
                : 'Real-time employee progress updates, latest work notes, and deadline compliance across all active assignments.'}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table
            className={`w-full ${
              ar ? 'text-right' : 'text-left'
            } border-collapse`}
          >
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">{ar ? 'الموظف' : 'Employee'}</th>
                <th className="py-3 px-4">
                  {ar ? 'عنوان المهمة والأولوية' : 'Task Title & Priority'}
                </th>
                <th className="py-3 px-4">{ar ? 'الحالة' : 'Status'}</th>
                <th className="py-3 px-4 w-44">
                  {ar ? 'نسبة الإنجاز' : 'Persisted Progress'}
                </th>
                <th className="py-3 px-4">
                  {ar ? 'آخر ملاحظة عمل' : 'Latest Progress Note'}
                </th>
                <th className="py-3 px-4">
                  {ar ? 'موعد التسليم' : 'Deadline'}
                </th>
                <th className="py-3 px-4">
                  {ar ? 'آخر تحديث' : 'Last Updated'}
                </th>
                <th className="py-3 px-4 text-right">
                  {ar ? 'إجراء' : 'Action'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {activeMonitoringList.map((a) => {
                const empStat = employees.find((e) => e.id === a.employeeId);
                return (
                  <tr
                    key={a.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="py-3 px-4 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => empStat && onSelectEmployee(empStat)}
                        className="font-semibold text-slate-900 hover:text-indigo-700"
                      >
                        {a.employee?.fullName || (ar ? 'موظف' : 'Employee')}
                      </button>
                      <p className="text-slate-500">{a.employee?.department}</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">
                        {a.task?.title}
                      </p>
                      <div className="mt-0.5">
                        {a.task && <PriorityText priority={a.task.priority} />}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <AssignmentStatusText
                        status={a.status}
                        isOverdue={a.isOverdue}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <ProgressBar
                        percentage={a.progressPercentage}
                        status={a.status}
                        isOverdue={a.isOverdue}
                      />
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      <p className="text-slate-600 truncate">
                        {a.latestNote ||
                          (ar
                            ? 'لم يتم تسجيل ملاحظة بعد'
                            : 'No progress note submitted yet')}
                      </p>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap text-slate-700">
                      {formatDateShort(a.task?.dueDate)}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap text-slate-500">
                      {formatDateTimeShort(a.updatedAt)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          onInspectAssignment(
                            a,
                            a.status === 'awaiting_review' ? 'review' : 'history'
                          )
                        }
                        className="px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded transition-colors cursor-pointer"
                      >
                        {a.status === 'awaiting_review'
                          ? ar
                            ? 'مراجعة العمل'
                            : 'Review Work'
                          : ar
                          ? 'فحص السجل'
                          : 'Inspect'}
                      </button>
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
// 2. ADMIN EMPLOYEE DIRECTORY & TABLE
// ---------------------------------------------------------------------------
export function AdminEmployeeDirectoryView({
  employees,
  onOpenAddEmployee,
  onSelectEmployee,
  onEditEmployee,
}: {
  employees: EmployeeStat[];
  onOpenAddEmployee: () => void;
  onSelectEmployee: (e: EmployeeStat) => void;
  onEditEmployee: (e: EmployeeStat) => void;
}) {
  const ar = isArabicActive();
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<
    'completionRate' | 'approvedCompleted' | 'lastActivityAt'
  >('completionRate');
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const departments = useMemo(() => {
    const set = new Set(employees.map((e) => e.department));
    return Array.from(set);
  }, [employees]);

  const filtered = useMemo(() => {
    return employees
      .filter((e) => {
        const q = search.trim().toLowerCase();
        if (
          q &&
          !e.fullName.toLowerCase().includes(q) &&
          !e.email.toLowerCase().includes(q) &&
          !(e.employeeNumber || '').toLowerCase().includes(q)
        ) {
          return false;
        }
        if (deptFilter !== 'all' && e.department !== deptFilter) return false;
        if (statusFilter !== 'all' && e.accountStatus !== statusFilter)
          return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'completionRate') {
          return b.completionRate - a.completionRate;
        }
        if (sortBy === 'approvedCompleted') {
          return b.approvedCompleted - a.approvedCompleted;
        }
        return (
          new Date(b.lastActivityAt).getTime() -
          new Date(a.lastActivityAt).getTime()
        );
      });
  }, [employees, search, deptFilter, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">
            {ar
              ? 'دليل الموظفين ومؤشرات الأداء'
              : 'Employee Directory & Workload Metrics'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {ar
              ? 'إدارة حسابات الموظفين، متابعة عبء العمل المسند، ومراجعة معدلات الإنجاز الفردية.'
              : 'Manage employee accounts, inspect assigned task workloads, and review individual completion rates.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenAddEmployee}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-indigo-700 hover:bg-indigo-800 rounded-md cursor-pointer"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>{ar ? 'إضافة موظف' : 'Add Employee'}</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={
              ar
                ? 'البحث باسم الموظف أو البريد أو الرقم الوظيفي...'
                : 'Search by employee name, email, or ID...'
            }
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-md"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={deptFilter}
            onChange={(e) => {
              setDeptFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
            aria-label="Filter by department"
          >
            <option value="all">
              {ar ? 'جميع الأقسام' : 'All Departments'}
            </option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
            aria-label="Filter by account status"
          >
            <option value="all">
              {ar ? 'جميع حالات الحساب' : 'All Account Statuses'}
            </option>
            <option value="active">{ar ? 'نشط' : 'Active'}</option>
            <option value="invited">{ar ? 'مدعو' : 'Invited'}</option>
            <option value="deactivated">{ar ? 'معطل' : 'Deactivated'}</option>
          </select>

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <ArrowUpDown className="w-3.5 h-3.5" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
              aria-label="Sort employees"
            >
              <option value="completionRate">
                {ar ? 'ترتيب: معدل الإنجاز' : 'Sort: Completion Rate'}
              </option>
              <option value="approvedCompleted">
                {ar ? 'ترتيب: المهام المكتملة' : 'Sort: Completed Tasks'}
              </option>
              <option value="lastActivityAt">
                {ar ? 'ترتيب: أحدث نشاط' : 'Sort: Recent Activity'}
              </option>
            </select>
          </div>
        </div>
      </div>

      {/* Employee Data Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className={`w-full ${
              ar ? 'text-right' : 'text-left'
            } border-collapse`}
          >
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">{ar ? 'الموظف' : 'Employee'}</th>
                <th className="py-3 px-4">
                  {ar ? 'القسم والمسمى الوظيفي' : 'Department & Title'}
                </th>
                <th className="py-3 px-4">{ar ? 'الحالة' : 'Status'}</th>
                <th className="py-3 px-4 text-right">
                  {ar ? 'المسندة' : 'Assigned'}
                </th>
                <th className="py-3 px-4 text-right">
                  {ar ? 'المعتمدة' : 'Approved'}
                </th>
                <th className="py-3 px-4 text-right">
                  {ar ? 'قيد التنفيذ' : 'In Progress'}
                </th>
                <th className="py-3 px-4 text-right">
                  {ar ? 'متأخرة' : 'Overdue'}
                </th>
                <th className="py-3 px-4 w-36">
                  {ar ? 'معدل الإنجاز' : 'Completion Rate'}
                </th>
                <th className="py-3 px-4">
                  {ar ? 'آخر نشاط' : 'Last Activity'}
                </th>
                <th className="py-3 px-4 text-right">
                  {ar ? 'إجراءات' : 'Actions'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {paginated.map((emp) => (
                <tr
                  key={emp.id}
                  className="hover:bg-slate-50/80 transition-colors"
                >
                  <td className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => onSelectEmployee(emp)}
                      className="font-semibold text-slate-900 hover:text-indigo-700"
                    >
                      {emp.fullName}
                    </button>
                    <p className="text-slate-500 font-mono">{emp.email}</p>
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-medium text-slate-900">
                      {emp.department}
                    </p>
                    <p className="text-slate-500">
                      {emp.jobTitle} ·{' '}
                      <span className="font-mono">
                        {emp.employeeNumber || `ID-${emp.id}`}
                      </span>
                    </p>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <AccountStatusText status={emp.accountStatus} />
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                    {emp.totalAssigned}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-emerald-700">
                    {emp.approvedCompleted}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-indigo-700">
                    {emp.inProgress}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-red-700">
                    {emp.overdue}
                  </td>
                  <td className="py-3 px-4">
                    <ProgressBar
                      percentage={emp.completionRate}
                      status={
                        emp.completionRate === 100 ? 'approved' : undefined
                      }
                    />
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                    {formatDateTimeShort(emp.lastActivityAt)}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSelectEmployee(emp)}
                        className="px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded cursor-pointer"
                      >
                        {ar
                          ? `المهام (${emp.totalAssigned})`
                          : `Tasks (${emp.totalAssigned})`}
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditEmployee(emp)}
                        className="px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 rounded cursor-pointer"
                      >
                        {ar ? 'تعديل' : 'Edit'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
          <span>
            {ar ? (
              <>
                عرض <strong className="font-mono">{paginated.length}</strong> من
                أصل <strong className="font-mono">{filtered.length}</strong> حساب
                موظف
              </>
            ) : (
              <>
                Showing{' '}
                <strong className="font-mono">{paginated.length}</strong> of{' '}
                <strong className="font-mono">{filtered.length}</strong> employee
                accounts
              </>
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1 border border-slate-300 rounded bg-white disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono">
              {ar ? `صفحة ${page} / ${totalPages}` : `Page ${page} / ${totalPages}`}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1 border border-slate-300 rounded bg-white disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. ADMIN TASK MANAGEMENT & MULTI-EMPLOYEE INDEPENDENT ASSIGNMENTS
// ---------------------------------------------------------------------------
export function AdminTaskManagementView({
  tasks,
  employees,
  onOpenCreateTask,
  onEditTask,
  onInspectAssignment,
}: {
  tasks: TaskData[];
  employees: EmployeeStat[];
  onOpenCreateTask: () => void;
  onEditTask: (t: TaskData) => void;
  onInspectAssignment: (
    a: EnrichedAssignment,
    mode?: 'update' | 'submit' | 'review' | 'history'
  ) => void;
}) {
  const ar = isArabicActive();
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const q = search.trim().toLowerCase();
      if (
        q &&
        !t.title.toLowerCase().includes(q) &&
        !t.description.toLowerCase().includes(q) &&
        !t.category.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) {
        return false;
      }
      const assigns = t.assignments || [];
      if (statusFilter !== 'all') {
        const hasStatus = assigns.some((a) => a.status === statusFilter);
        if (!hasStatus) return false;
      }
      if (employeeFilter !== 'all') {
        const empId = Number(employeeFilter);
        const hasEmp = assigns.some((a) => a.employeeId === empId);
        if (!hasEmp) return false;
      }
      if (overdueOnly) {
        const hasOverdue = assigns.some((a) => a.isOverdue);
        if (!hasOverdue) return false;
      }
      return true;
    });
  }, [
    tasks,
    search,
    priorityFilter,
    statusFilter,
    employeeFilter,
    overdueOnly,
  ]);

  const flattenedFilteredAssignments = useMemo(() => {
    const list: EnrichedAssignment[] = [];
    for (const t of filteredTasks) {
      for (const a of t.assignments || []) {
        if (statusFilter !== 'all' && a.status !== statusFilter) continue;
        if (employeeFilter !== 'all' && a.employeeId !== Number(employeeFilter))
          continue;
        if (overdueOnly && !a.isOverdue) continue;
        list.push(a);
      }
    }
    return list;
  }, [filteredTasks, statusFilter, employeeFilter, overdueOnly]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">
            {ar
              ? 'إدارة المهام والتكليفات المستقلة للموظفين'
              : 'Task Directory & Independent Employee Assignments'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {ar
              ? 'يحتفظ كل موظف مكلف بمهمة مشتركة بسجل إنجاز مستقل، شريط تقدم خاص، وحالة مراجعة منفصلة.'
              : 'Each employee assigned to a shared task maintains an independent assignment record, progress bar, and review state.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Mode Switcher: List vs Interactive Kanban */}
          <div className="inline-flex items-center p-1 bg-slate-200/80 rounded-lg border border-slate-300">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>{ar ? 'العرض الجدولي' : 'Table View'}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-indigo-700 text-white shadow-2xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>
                {ar
                  ? 'لوحة كانبان (سحب وإفلات)'
                  : 'Kanban Board (Drag & Drop)'}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenCreateTask}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-indigo-700 hover:bg-indigo-800 rounded-md cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{ar ? 'إنشاء وإسناد مهمة' : 'Create & Assign Task'}</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              ar
                ? 'البحث في المهام بالعنوان أو الوصف أو التصنيف...'
                : 'Search tasks by title, description, or category...'
            }
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-md"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="admin-task-status-filter"
              className="text-xs font-medium text-slate-600 whitespace-nowrap"
            >
              {ar ? 'الحالة:' : 'Status:'}
            </label>
            <select
              id="admin-task-status-filter"
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
              <option value="canceled">{ar ? 'ملغاة' : 'Canceled'}</option>
            </select>
          </div>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            aria-label="Filter tasks by priority"
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
          >
            <option value="all">
              {ar ? 'جميع الأولويات' : 'All Priorities'}
            </option>
            <option value="Critical">{ar ? 'حرجة' : 'Critical'}</option>
            <option value="High">{ar ? 'عالية' : 'High'}</option>
            <option value="Medium">{ar ? 'متوسطة' : 'Medium'}</option>
            <option value="Low">{ar ? 'منخفضة' : 'Low'}</option>
          </select>

          <select
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            aria-label="Filter tasks by assigned employee"
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
          >
            <option value="all">
              {ar ? 'جميع الموظفين المكلفين' : 'All Assigned Employees'}
            </option>
            {employees
              .filter((e) => e.role === 'employee')
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName}
                </option>
              ))}
          </select>

          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer px-2.5 py-1.5 border border-slate-300 rounded-md bg-white">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
              className="rounded border-slate-300 text-red-600"
            />
            <span>{ar ? 'المتأخرة فقط' : 'Overdue Only'}</span>
          </label>
        </div>
      </div>

      {/* Tasks List or Interactive Kanban Board */}
      {viewMode === 'kanban' ? (
        <InteractiveKanbanBoard
          assignments={flattenedFilteredAssignments}
          currentUser={{
            id: 1,
            uid: 'admin',
            email: 'admin@velopulse.io',
            fullName: ar ? 'مدير النظام' : 'System Administrator',
            role: 'admin',
            department: 'Executive Operations',
            jobTitle: 'Director of Operations',
            employeeNumber: 'ADM-001',
            accountStatus: 'active',
            lastActivityAt: new Date().toISOString(),
          }}
          onInspectAssignment={onInspectAssignment}
        />
      ) : (
        <div className="space-y-4">
          {filteredTasks.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
              <p className="text-sm font-semibold text-slate-900">
                {ar
                  ? 'لا توجد مهام تطابق الفلاتر المحددة'
                  : 'No tasks match the selected filters'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {ar
                  ? 'قم بتغيير فلتر الحالة أو أنشئ مهمة جديدة.'
                  : 'Adjust your status filter dropdown or create a new task assignment.'}
              </p>
            </div>
          ) : (
            filteredTasks.map((task) => {
            const allAssigns = task.assignments || [];
            const assigns =
              statusFilter === 'all'
                ? allAssigns
                : allAssigns.filter((a) => a.status === statusFilter);
            return (
              <div
                key={task.id}
                className="bg-white border border-slate-200 rounded-lg overflow-hidden"
              >
                {/* Task Header */}
                <div className="p-5 border-b border-slate-200 flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono">TASK-{task.id}</span>
                      <span aria-hidden="true">·</span>
                      <span>{task.category}</span>
                      <span aria-hidden="true">·</span>
                      <PriorityText priority={task.priority} />
                      <span aria-hidden="true">·</span>
                      <span>
                        {ar ? 'الفترة:' : 'Window:'}{' '}
                        {formatDateShort(task.startDate)} →{' '}
                        <strong className="text-slate-900">
                          {formatDateShort(task.dueDate)}
                        </strong>
                      </span>
                      {task.taskStatus === 'canceled' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-red-700 font-semibold">
                            {ar ? 'ملغاة' : 'CANCELED'}
                          </span>
                        </>
                      )}
                    </div>
                    <h2 className="text-base font-bold text-slate-900 font-display mt-1">
                      {task.title}
                    </h2>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {task.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onEditTask(task)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>
                        {ar ? 'تعديل / إعادة إسناد' : 'Edit / Reassign'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Independent Employee Assignments Table */}
                <div className="bg-slate-50/50 px-5 py-3">
                  <p className="text-xs font-semibold text-slate-700 mb-2">
                    {ar
                      ? `تكليفات الموظفين المستقلة (${assigns.length})`
                      : `Independent Employee Assignments (${assigns.length})`}
                  </p>
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-md bg-white">
                    {assigns.map((a) => (
                      <div
                        key={a.id}
                        className="p-3 flex flex-wrap items-center justify-between gap-4 text-xs"
                      >
                        <div className="min-w-[180px]">
                          <p className="font-semibold text-slate-900">
                            {a.employee?.fullName}
                          </p>
                          <p className="text-slate-500">
                            {a.employee?.department}
                          </p>
                        </div>

                        <div className="min-w-[150px]">
                          <AssignmentStatusText
                            status={a.status}
                            isOverdue={a.isOverdue}
                          />
                        </div>

                        <div className="w-48">
                          <ProgressBar
                            percentage={a.progressPercentage}
                            status={a.status}
                            isOverdue={a.isOverdue}
                          />
                        </div>

                        <div className="flex-1 min-w-[180px]">
                          <p className="text-slate-600 truncate">
                            {a.latestNote
                              ? `“${a.latestNote}”`
                              : ar
                              ? 'لا توجد تحديثات مسجلة بعد'
                              : 'No progress updates recorded yet'}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onInspectAssignment(
                                a,
                                a.status === 'awaiting_review'
                                  ? 'review'
                                  : 'history'
                              )
                            }
                            className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                              a.status === 'awaiting_review'
                                ? 'bg-amber-600 text-white hover:bg-amber-700'
                                : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100'
                            }`}
                          >
                            {a.status === 'awaiting_review'
                              ? ar
                                ? 'مراجعة التسليم'
                                : 'Review Submission'
                              : ar
                              ? `السجل (${a.progressUpdates.length})`
                              : `History (${a.progressUpdates.length})`}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })
        )}
        </div>
      )}
    </div>
  );
}
