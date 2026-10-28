import React, { useMemo, useState } from 'react';
import {
  CurrentUser,
  EmployeeStat,
  EnrichedAssignment,
} from '../types/workspace.ts';
import {
  AssignmentStatusText,
  formatDateShort,
  PriorityText,
  ProgressBar,
} from './StatusIndicators.tsx';
import { isArabicActive } from '../lib/i18n.ts';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Plus,
} from 'lucide-react';

interface DeadlinesCalendarViewProps {
  currentUser: CurrentUser;
  assignments: EnrichedAssignment[];
  employees: EmployeeStat[];
  onInspectAssignment: (
    a: EnrichedAssignment,
    mode?: 'update' | 'submit' | 'review' | 'history'
  ) => void;
  onOpenCreateTask?: () => void;
}

function toDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function DeadlinesCalendarView({
  currentUser,
  assignments,
  employees,
  onInspectAssignment,
  onOpenCreateTask,
}: DeadlinesCalendarViewProps) {
  const ar = isArabicActive();
  const isAdmin = currentUser.role === 'admin';

  // Find initial reference date (default to today, or if most tasks are in a specific month, still allow easy navigation)
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [cursorDate, setCursorDate] = useState<Date>(() => new Date());
  const [selectedDateKey, setSelectedDateKey] = useState<string>(() =>
    toDateKey(new Date())
  );

  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  const activeAssignments = useMemo(() => {
    return assignments.filter((a) => {
      if (a.status === 'canceled') return false;
      if (!a.task?.dueDate) return false;
      if (employeeFilter !== 'all' && a.employeeId !== Number(employeeFilter)) {
        return false;
      }
      if (statusFilter !== 'all') {
        if (statusFilter === 'overdue') {
          if (!a.isOverdue) return false;
        } else if (a.status !== statusFilter) {
          return false;
        }
      }
      if (priorityFilter !== 'all' && a.task.priority !== priorityFilter) {
        return false;
      }
      return true;
    });
  }, [assignments, employeeFilter, statusFilter, priorityFilter]);

  // Group assignments by YYYY-MM-DD due date
  const assignmentsByDate = useMemo(() => {
    const map = new Map<string, EnrichedAssignment[]>();
    for (const a of activeAssignments) {
      if (!a.task?.dueDate) continue;
      const d = new Date(a.task.dueDate);
      if (Number.isNaN(d.getTime())) continue;
      const key = toDateKey(d);
      const list = map.get(key) || [];
      list.push(a);
      map.set(key, list);
    }
    return map;
  }, [activeAssignments]);

  // Summary metrics for the calendar header
  const calendarStats = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const weekEnd = todayStart + 7 * 24 * 60 * 60 * 1000;

    let overdueCount = 0;
    let dueNext7Days = 0;
    let awaitingReview = 0;
    let completedApproved = 0;

    for (const a of activeAssignments) {
      if (a.status === 'approved') {
        completedApproved++;
      } else if (a.status === 'awaiting_review') {
        awaitingReview++;
      }
      if (a.isOverdue && a.status !== 'approved') {
        overdueCount++;
      }
      if (a.task?.dueDate && a.status !== 'approved') {
        const dueTime = new Date(a.task.dueDate).getTime();
        if (dueTime >= todayStart && dueTime <= weekEnd) {
          dueNext7Days++;
        }
      }
    }

    return { overdueCount, dueNext7Days, awaitingReview, completedApproved };
  }, [activeAssignments]);

  // Generate calendar grid days for Month or Week view
  const calendarDays = useMemo(() => {
    const year = cursorDate.getFullYear();
    const month = cursorDate.getMonth();

    if (viewMode === 'week') {
      const startOfWeek = new Date(cursorDate);
      const dayOfWeek = startOfWeek.getDay(); // 0 (Sun) - 6 (Sat)
      startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);

      const days: { date: Date; key: string; isCurrentMonth: boolean }[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        days.push({
          date: d,
          key: toDateKey(d),
          isCurrentMonth: d.getMonth() === month,
        });
      }
      return days;
    }

    // Month view: 42 cells (6 weeks) starting Sunday
    const firstDayOfMonth = new Date(year, month, 1);
    const startPadding = firstDayOfMonth.getDay();
    const gridStartDate = new Date(year, month, 1 - startPadding);

    const days: { date: Date; key: string; isCurrentMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStartDate);
      d.setDate(gridStartDate.getDate() + i);
      days.push({
        date: d,
        key: toDateKey(d),
        isCurrentMonth: d.getMonth() === month,
      });
    }
    return days;
  }, [cursorDate, viewMode]);

  const todayKey = toDateKey(new Date());

  const handlePrev = () => {
    setCursorDate((prev) => {
      const next = new Date(prev);
      if (viewMode === 'month') {
        next.setMonth(next.getMonth() - 1);
      } else {
        next.setDate(next.getDate() - 7);
      }
      return next;
    });
  };

  const handleNext = () => {
    setCursorDate((prev) => {
      const next = new Date(prev);
      if (viewMode === 'month') {
        next.setMonth(next.getMonth() + 1);
      } else {
        next.setDate(next.getDate() + 7);
      }
      return next;
    });
  };

  const handleToday = () => {
    const now = new Date();
    setCursorDate(now);
    setSelectedDateKey(toDateKey(now));
  };

  const periodLabel = useMemo(() => {
    const locale = ar ? 'ar-EG' : 'en-US';
    if (viewMode === 'month') {
      return cursorDate.toLocaleDateString(locale, {
        month: 'long',
        year: 'numeric',
      });
    }
    const first = calendarDays[0]?.date;
    const last = calendarDays[calendarDays.length - 1]?.date;
    if (!first || !last) return '';
    return `${first.toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
    })} – ${last.toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`;
  }, [cursorDate, viewMode, calendarDays, ar]);

  const dayHeaders = ar
    ? ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const selectedDayAssignments = assignmentsByDate.get(selectedDateKey) || [];

  function getAssignmentBadgeStyle(a: EnrichedAssignment): {
    bg: string;
    dot: string;
    label: string;
  } {
    if (a.status === 'approved') {
      return {
        bg: 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100',
        dot: 'bg-emerald-600',
        label: ar ? 'مكتملة' : 'Approved',
      };
    }
    if (a.isOverdue) {
      return {
        bg: 'bg-red-50 border-red-300 text-red-900 hover:bg-red-100',
        dot: 'bg-red-600',
        label: ar ? 'متأخرة' : 'Overdue',
      };
    }
    if (a.status === 'awaiting_review') {
      return {
        bg: 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100',
        dot: 'bg-amber-500',
        label: ar ? 'مراجعة 100%' : 'Review 100%',
      };
    }
    if (a.status === 'in_progress') {
      return {
        bg: 'bg-indigo-50 border-indigo-300 text-indigo-900 hover:bg-indigo-100',
        dot: 'bg-indigo-600',
        label: `${a.progressPercentage}%`,
      };
    }
    return {
      bg: 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200',
      dot: 'bg-slate-500',
      label: ar ? 'لم تبدأ' : 'Not Started',
    };
  }

  return (
    <div className="space-y-6">
      {/* Header & Primary Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display flex items-center gap-2.5">
            <CalendarIcon className="w-6 h-6 text-indigo-700" />
            <span>
              {ar
                ? 'تقويم المواعيد النهائية للمهام'
                : 'Task Deadlines & Schedule Calendar'}
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {ar
              ? 'عرض شهري وأسبوعي تفاعلي يوضح مواعيد تسليم المهام القادمة، قيد التنفيذ، والمتأخرة بألوان مميزة.'
              : 'Interactive monthly and weekly calendar highlighting upcoming, in-progress, awaiting review, and overdue task deadlines.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Month / Week View Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                viewMode === 'month'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {ar ? 'عرض شهري' : 'Monthly View'}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                viewMode === 'week'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {ar ? 'عرض أسبوعي' : 'Weekly View'}
            </button>
          </div>

          {isAdmin && onOpenCreateTask && (
            <button
              type="button"
              onClick={onOpenCreateTask}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-indigo-700 hover:bg-indigo-800 rounded-md cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{ar ? 'إنشاء مهمة جديدة' : 'Create Task'}</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Strip + Color Legend */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-red-700">
              {ar ? 'مهام متأخرة (Overdue)' : 'Overdue Deadlines'}
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums text-red-700 mt-1">
              {calendarStats.overdueCount}
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white border border-indigo-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-indigo-700">
              {ar ? 'مستحقة خلال 7 أيام' : 'Due Next 7 Days'}
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums text-indigo-700 mt-1">
              {calendarStats.dueNext7Days}
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white border border-amber-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-amber-800">
              {ar ? 'بانتظار المراجعة (100%)' : 'Awaiting Review (100%)'}
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1">
              {calendarStats.awaitingReview}
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <Eye className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white border border-emerald-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-emerald-800">
              {ar ? 'مكتملة ومعتمدة' : 'Completed & Approved'}
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
              {calendarStats.completedApproved}
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Navigation & Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        {/* Date Navigation */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrev}
            className="p-1.5 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
            aria-label="Previous period"
          >
            {ar ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>

          <button
            type="button"
            onClick={handleToday}
            className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md cursor-pointer"
          >
            {ar ? 'اليوم' : 'Today'}
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="p-1.5 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
            aria-label="Next period"
          >
            {ar ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>

          <h2 className="text-base font-bold text-slate-900 font-display mx-2">
            {periodLabel}
          </h2>
        </div>

        {/* Color Legend & Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="hidden xl:flex items-center gap-3 text-xs text-slate-600 mx-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
              {ar ? 'متأخرة' : 'Overdue'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
              {ar ? 'قيد التنفيذ' : 'In Progress'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              {ar ? 'بانتظار المراجعة' : 'Awaiting Review'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
              {ar ? 'معتمدة' : 'Approved'}
            </span>
          </div>

          {isAdmin && (
            <select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
              aria-label="Filter calendar by employee"
            >
              <option value="all">
                {ar ? 'جميع الموظفين' : 'All Employees'}
              </option>
              {employees
                .filter((e) => e.role === 'employee')
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName}
                  </option>
                ))}
            </select>
          )}

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
            aria-label="Filter calendar by status"
          >
            <option value="all">{ar ? 'جميع الحالات' : 'All Statuses'}</option>
            <option value="overdue">
              {ar ? 'المتأخرة فقط' : 'Overdue Only'}
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
              {ar ? 'مكتملة ومعتمدة' : 'Completed & Approved'}
            </option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
            aria-label="Filter calendar by priority"
          >
            <option value="all">
              {ar ? 'جميع الأولويات' : 'All Priorities'}
            </option>
            <option value="Critical">{ar ? 'حرجة' : 'Critical'}</option>
            <option value="High">{ar ? 'عالية' : 'High'}</option>
            <option value="Medium">{ar ? 'متوسطة' : 'Medium'}</option>
            <option value="Low">{ar ? 'منخفضة' : 'Low'}</option>
          </select>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
        {/* Days of Week Header */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {dayHeaders.map((dayName) => (
            <div
              key={dayName}
              className="py-2.5 px-2 text-center text-xs font-bold text-slate-600 border-r last:border-r-0 border-slate-200"
            >
              {dayName}
            </div>
          ))}
        </div>

        {/* Calendar Cells */}
        <div className="grid grid-cols-7 divide-x divide-y divide-slate-200">
          {calendarDays.map((cell) => {
            const dayItems = assignmentsByDate.get(cell.key) || [];
            const isToday = cell.key === todayKey;
            const isSelected = cell.key === selectedDateKey;
            const hasOverdue = dayItems.some(
              (a) => a.isOverdue && a.status !== 'approved'
            );

            return (
              <div
                key={cell.key}
                onClick={() => setSelectedDateKey(cell.key)}
                className={`p-2 transition-colors cursor-pointer flex flex-col justify-between ${
                  viewMode === 'week' ? 'min-h-[260px]' : 'min-h-[125px]'
                } ${
                  !cell.isCurrentMonth && viewMode === 'month'
                    ? 'bg-slate-50/60 text-slate-400'
                    : 'bg-white'
                } ${
                  isSelected
                    ? 'ring-2 ring-inset ring-indigo-600 bg-indigo-50/20'
                    : 'hover:bg-slate-50/80'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 text-xs font-mono font-bold rounded-full ${
                      isToday
                        ? 'bg-indigo-700 text-white'
                        : cell.isCurrentMonth
                        ? 'text-slate-900'
                        : 'text-slate-400'
                    }`}
                  >
                    {cell.date.getDate()}
                  </span>

                  {dayItems.length > 0 && (
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        hasOverdue
                          ? 'bg-red-100 text-red-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {dayItems.length} {ar ? 'مهام' : 'tasks'}
                    </span>
                  )}
                </div>

                {/* Task Pills inside Cell */}
                <div className="space-y-1 flex-1 overflow-y-auto max-h-40">
                  {dayItems
                    .slice(0, viewMode === 'week' ? 8 : 3)
                    .map((assign) => {
                      const style = getAssignmentBadgeStyle(assign);
                      return (
                        <button
                          key={assign.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDateKey(cell.key);
                            onInspectAssignment(
                              assign,
                              isAdmin && assign.status === 'awaiting_review'
                                ? 'review'
                                : !isAdmin &&
                                  (assign.status === 'in_progress' ||
                                    assign.status === 'rejected')
                                ? 'update'
                                : 'history'
                            );
                          }}
                          className={`w-full text-right px-2 py-1 rounded border text-[11px] transition-colors flex flex-col gap-0.5 cursor-pointer ${style.bg}`}
                        >
                          <div className="flex items-center justify-between gap-1 w-full">
                            <span className="font-semibold truncate">
                              {assign.task?.title}
                            </span>
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] opacity-85 w-full">
                            <span className="truncate">
                              {isAdmin
                                ? assign.employee?.fullName.split(' ')[0]
                                : assign.task?.priority}
                            </span>
                            <span className="font-mono font-bold shrink-0">
                              {style.label}
                            </span>
                          </div>
                        </button>
                      );
                    })}

                  {dayItems.length > (viewMode === 'week' ? 8 : 3) && (
                    <p className="text-[10px] font-semibold text-indigo-700 text-center pt-0.5">
                      +
                      {dayItems.length - (viewMode === 'week' ? 8 : 3)}{' '}
                      {ar ? 'مهام أخرى' : 'more'}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Day Detailed Agenda Panel */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-bold text-slate-900 font-display">
              {ar
                ? `جدول المهام المستحقة في: ${formatDateShort(selectedDateKey)}`
                : `Deadlines Agenda for ${formatDateShort(selectedDateKey)}`}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {selectedDayAssignments.length === 0
                ? ar
                  ? 'لا توجد مهام مستحقة التسليم في هذا اليوم.'
                  : 'No task assignments have a deadline on this date.'
                : ar
                ? `إجمالي ${selectedDayAssignments.length} تكليفات مستحقة في هذا التاريخ.`
                : `Showing ${selectedDayAssignments.length} task assignment(s) due on this date.`}
            </p>
          </div>
        </div>

        {selectedDayAssignments.length > 0 && (
          <div className="divide-y divide-slate-200 mt-2">
            {selectedDayAssignments.map((a) => (
              <div
                key={a.id}
                className="py-3.5 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="space-y-1 min-w-[220px] max-w-xl">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-slate-900 text-sm">
                      {a.task?.title}
                    </span>
                    {a.task && <PriorityText priority={a.task.priority} />}
                    <AssignmentStatusText
                      status={a.status}
                      isOverdue={a.isOverdue}
                    />
                  </div>
                  <p className="text-xs text-slate-600">
                    {ar ? 'الموظف المكلف:' : 'Assigned to:'}{' '}
                    <strong className="text-slate-900">
                      {a.employee?.fullName}
                    </strong>{' '}
                    ({a.employee?.department})
                  </p>
                </div>

                <div className="w-48">
                  <ProgressBar
                    percentage={a.progressPercentage}
                    status={a.status}
                    isOverdue={a.isOverdue}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onInspectAssignment(
                        a,
                        isAdmin && a.status === 'awaiting_review'
                          ? 'review'
                          : !isAdmin &&
                            (a.status === 'in_progress' ||
                              a.status === 'rejected')
                          ? 'update'
                          : 'history'
                      )
                    }
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-md cursor-pointer"
                  >
                    {isAdmin && a.status === 'awaiting_review'
                      ? ar
                        ? 'مراجعة واعتماد'
                        : 'Review & Approve'
                      : !isAdmin &&
                        (a.status === 'in_progress' || a.status === 'rejected')
                      ? ar
                        ? 'تحديث التقدم'
                        : 'Update Progress'
                      : ar
                      ? 'فتح تفاصيل المهمة'
                      : 'Open Task Details'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
