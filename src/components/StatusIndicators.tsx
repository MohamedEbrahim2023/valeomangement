import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Eye,
  Flame,
  RotateCcw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { isArabicActive } from '../lib/i18n.ts';

export function AssignmentStatusText({
  status,
  isOverdue,
}: {
  status: string;
  isOverdue?: boolean;
}) {
  const ar = isArabicActive();

  if (isOverdue && status !== 'approved' && status !== 'canceled') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap shrink-0">
        <AlertTriangle
          className="w-3.5 h-3.5 text-red-600 shrink-0"
          aria-hidden="true"
        />
        <span>
          {ar
            ? `متأخرة (${formatStatusLabel(status)})`
            : `Overdue (${formatStatusLabel(status)})`}
        </span>
      </span>
    );
  }

  switch (status) {
    case 'approved':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap shrink-0">
          <CheckCircle2
            className="w-3.5 h-3.5 text-emerald-600 shrink-0"
            aria-hidden="true"
          />
          <span>{ar ? 'مكتملة ومعتمدة' : 'Completed & Approved'}</span>
        </span>
      );
    case 'awaiting_review':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap shrink-0">
          <Eye
            className="w-3.5 h-3.5 text-amber-600 shrink-0"
            aria-hidden="true"
          />
          <span>{ar ? 'بانتظار المراجعة' : 'Awaiting Review'}</span>
        </span>
      );
    case 'in_progress':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 whitespace-nowrap shrink-0">
          <Clock
            className="w-3.5 h-3.5 text-indigo-600 shrink-0"
            aria-hidden="true"
          />
          <span>{ar ? 'قيد التنفيذ' : 'In Progress'}</span>
        </span>
      );
    case 'rejected':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap shrink-0">
          <RotateCcw
            className="w-3.5 h-3.5 text-red-600 shrink-0"
            aria-hidden="true"
          />
          <span>{ar ? 'مطلوب تعديلات' : 'Revision Requested'}</span>
        </span>
      );
    case 'canceled':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">
          <XCircle
            className="w-3.5 h-3.5 text-slate-400 shrink-0"
            aria-hidden="true"
          />
          <span>{ar ? 'ملغاة' : 'Canceled'}</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap shrink-0">
          <Circle
            className="w-3.5 h-3.5 text-slate-400 shrink-0"
            aria-hidden="true"
          />
          <span>{ar ? 'لم تبدأ' : 'Not Started'}</span>
        </span>
      );
  }
}

export function PriorityText({ priority }: { priority: string }) {
  const ar = isArabicActive();
  switch (priority) {
    case 'Critical':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 whitespace-nowrap shrink-0">
          <Flame
            className="w-3.5 h-3.5 text-red-600 shrink-0"
            aria-hidden="true"
          />
          <span>{ar ? 'أولوية حرجة' : 'Critical Priority'}</span>
        </span>
      );
    case 'High':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 whitespace-nowrap shrink-0">
          <ShieldAlert
            className="w-3.5 h-3.5 text-amber-600 shrink-0"
            aria-hidden="true"
          />
          <span>{ar ? 'أولوية عالية' : 'High Priority'}</span>
        </span>
      );
    case 'Medium':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 whitespace-nowrap shrink-0">
          <span>{ar ? 'أولوية متوسطة' : 'Medium Priority'}</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 whitespace-nowrap shrink-0">
          <span>{ar ? 'أولوية منخفضة' : 'Low Priority'}</span>
        </span>
      );
  }
}

export function AccountStatusText({ status }: { status: string }) {
  const ar = isArabicActive();
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap shrink-0">
        <CheckCircle2
          className="w-3.5 h-3.5 text-emerald-600 shrink-0"
          aria-hidden="true"
        />
        <span>{ar ? 'نشط' : 'Active'}</span>
      </span>
    );
  }
  if (status === 'invited') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap shrink-0">
        <Clock
          className="w-3.5 h-3.5 text-amber-600 shrink-0"
          aria-hidden="true"
        />
        <span>{ar ? 'مدعو' : 'Invited'}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap shrink-0">
      <XCircle
        className="w-3.5 h-3.5 text-red-600 shrink-0"
        aria-hidden="true"
      />
      <span>{ar ? 'معطل' : 'Deactivated'}</span>
    </span>
  );
}

export function ProgressBar({
  percentage,
  status,
  isOverdue,
}: {
  percentage: number;
  status?: string;
  isOverdue?: boolean;
}) {
  const safeVal = Math.max(0, Math.min(100, percentage));
  let barColor = 'bg-indigo-600';
  if (status === 'approved') {
    barColor = 'bg-emerald-600';
  } else if (isOverdue) {
    barColor = 'bg-red-600';
  } else if (status === 'awaiting_review') {
    barColor = 'bg-amber-500';
  } else if (safeVal === 0) {
    barColor = 'bg-slate-300';
  }

  return (
    <div className="flex items-center gap-2.5 w-full min-w-[120px]">
      <div
        className="flex-1 h-2 bg-slate-100 rounded-sm overflow-hidden border border-slate-200/80"
        role="progressbar"
        aria-valuenow={safeVal}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full transition-transform duration-150 origin-left ${barColor}`}
          style={{ transform: `scaleX(${safeVal / 100})` }}
        />
      </div>
      <span className="text-xs font-mono tabular-nums font-medium text-slate-700 w-9 text-right shrink-0">
        {safeVal}%
      </span>
    </div>
  );
}

export function formatStatusLabel(status: string): string {
  const ar = isArabicActive();
  switch (status) {
    case 'not_started':
      return ar ? 'لم تبدأ' : 'Not Started';
    case 'in_progress':
      return ar ? 'قيد التنفيذ' : 'In Progress';
    case 'awaiting_review':
      return ar ? 'بانتظار المراجعة' : 'Awaiting Review';
    case 'approved':
      return ar ? 'معتمدة' : 'Approved';
    case 'rejected':
      return ar ? 'مطلوب تعديلات' : 'Revision Requested';
    case 'canceled':
      return ar ? 'ملغاة' : 'Canceled';
    default:
      return status;
  }
}

export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  const locale = isArabicActive() ? 'ar-EG' : 'en-US';
  return d.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTimeShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  const locale = isArabicActive() ? 'ar-EG' : 'en-US';
  return d.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
