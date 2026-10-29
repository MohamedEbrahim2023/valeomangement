import React, { useState } from 'react';
import {
  CurrentUser,
  EmployeeStat,
  EnrichedAssignment,
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
  AlertCircle,
  BookmarkPlus,
  CheckCircle2,
  FileText,
  History,
  Paperclip,
  Plus,
  Repeat,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { TaskTimeTrackerWidget } from './SmartProductivityFeatures.tsx';

interface SavedTaskTemplate {
  id: string;
  labelAr: string;
  labelEn: string;
  title: string;
  description: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  category: string;
  estimatedEffort: number;
  recurrence: 'none' | 'weekly' | 'monthly';
  completionCriteria: string;
}

const DEFAULT_TASK_TEMPLATES: SavedTaskTemplate[] = [
  {
    id: 'tpl-sec-audit',
    labelAr: '🔒 مراجعة السيرفر وأمن المعلومات (أسبوعياً)',
    labelEn: '🔒 Weekly Server & Security Audit',
    title: 'مراجعة أمن المعلومات وفحص السيرفرات الأسبوعي',
    description:
      'فحص سجلات الوصول، تحديث شهادات الحماية، التأكد من النسخ الاحتياطي لقواعد البيانات، ومراجعة أداء الخوادم.',
    priority: 'Critical',
    category: 'Security & Compliance',
    estimatedEffort: 8,
    recurrence: 'weekly',
    completionCriteria: 'اجتياز فحص الثغرات وتوثيق تقرير الحالة الأسبوعي بنسبة 100%',
  },
  {
    id: 'tpl-monthly-kpi',
    labelAr: '📊 إعداد تقرير الأداء الشهري للقسم (شهرياً)',
    labelEn: '📊 Monthly Department KPI Report',
    title: 'إعداد وتجميع تقرير مؤشرات الأداء الشهري (KPIs)',
    description:
      'تجميع إحصائيات إنجاز الفريق، تحليل المهام المكتملة والمتأخرة، ورفع التوصيات التنفيذية للإدارة العليا.',
    priority: 'High',
    category: 'Executive Operations',
    estimatedEffort: 10,
    recurrence: 'monthly',
    completionCriteria: 'اعتماد التقرير المالي والتشغيلي من مدير القسم',
  },
  {
    id: 'tpl-api-release',
    labelAr: '⚡ اختبار وإطلاق تحديثات النظام (Release QA)',
    labelEn: '⚡ Production Release QA & Smoke Testing',
    title: 'اختبار جودة التحديثات البرمجية قبل الإطلاق (QA Release)',
    description:
      'تنفيذ اختبارات التكامل الشاملة (End-to-End Tests)، التحقق من استقرار واجهات API، ومراجعة تجربة المستخدم.',
    priority: 'High',
    category: 'Platform Engineering',
    estimatedEffort: 12,
    recurrence: 'none',
    completionCriteria: 'نجاح جميع الاختبارات الآلية دون أخطاء حرجة',
  },
];

const CUSTOM_TEMPLATES_KEY = 'velopulse_custom_task_templates_v1';

// ---------------------------------------------------------------------------
// 1. ADD EMPLOYEE MODAL
// ---------------------------------------------------------------------------
export function AddEmployeeModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (payload: {
    fullName: string;
    email: string;
    department: string;
    jobTitle: string;
    employeeNumber?: string;
    accountStatus: 'active' | 'deactivated' | 'invited';
    temporaryPassword?: string;
  }) => Promise<void>;
}) {
  const ar = isArabicActive();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('Platform Engineering');
  const [jobTitle, setJobTitle] = useState('Software Engineer');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [accountStatus, setAccountStatus] = useState<
    'active' | 'deactivated' | 'invited'
  >('active');
  const [temporaryPassword, setTemporaryPassword] = useState('EmpPass2026!');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateRandomPassword = () => {
    const chars =
      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let generated = 'Vp!';
    for (let i = 0; i < 9; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setTemporaryPassword(generated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        fullName,
        email,
        department,
        jobTitle,
        employeeNumber: employeeNumber || undefined,
        accountStatus,
        temporaryPassword,
      });
      onClose();
    } catch (err: any) {
      setError(
        err.message || (ar ? 'تعذر إنشاء حساب الموظف' : 'Failed to create employee')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-employee-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-lg w-full p-4 sm:p-6 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div>
            <h2
              id="add-employee-title"
              className="text-lg font-bold text-slate-900 font-display"
            >
              {ar ? 'إنشاء حساب موظف جديد' : 'Generate New Employee Account'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {ar
                ? 'إصدار البريد الإلكتروني وكلمة المرور الخاصة بدخول الموظف للمنصة.'
                : 'Issue work email and login password credentials for this employee.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2 text-xs text-red-800">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar ? 'الاسم الكامل للموظف *' : 'Full Name *'}
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={ar ? 'مثال: أحمد محمود' : 'e.g. Nadia Al-Farsi'}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar ? 'البريد الإلكتروني لتسجيل الدخول *' : 'Employee Login Email *'}
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="employee@company.com"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar ? 'القسم / الإدارة *' : 'Department *'}
              </label>
              <input
                type="text"
                required
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar ? 'المسمى الوظيفي *' : 'Job Title *'}
              </label>
              <input
                type="text"
                required
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar ? 'الرقم الوظيفي (اختياري)' : 'Employee Identifier (Optional)'}
              </label>
              <input
                type="text"
                value={employeeNumber}
                onChange={(e) => setEmployeeNumber(e.target.value)}
                placeholder="EMP-204"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar ? 'حالة الحساب الابتدائية' : 'Initial Account Status'}
              </label>
              <select
                value={accountStatus}
                onChange={(e) => setAccountStatus(e.target.value as any)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="active">
                  {ar
                    ? 'نشط (جاهز لتسجيل الدخول فوراً)'
                    : 'Active (Ready for Sign-In)'}
                </option>
                <option value="invited">{ar ? 'مدعو' : 'Invited'}</option>
                <option value="deactivated">
                  {ar ? 'معطل' : 'Deactivated'}
                </option>
              </select>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-900">
                {ar ? 'كلمة مرور الموظف المخصصة *' : 'Assigned Employee Password *'}
              </label>
              <button
                type="button"
                onClick={generateRandomPassword}
                className="text-xs font-medium text-indigo-700 hover:underline cursor-pointer"
              >
                {ar ? 'توليد كلمة مرور عشوائية' : 'Generate Random Password'}
              </button>
            </div>
            <input
              type="text"
              required
              minLength={8}
              value={temporaryPassword}
              onChange={(e) => setTemporaryPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
            <p className="text-xs text-slate-600 mt-1.5">
              {ar
                ? 'شارك هذا البريد الإلكتروني وكلمة المرور مع الموظف ليتمكن من تسجيل الدخول إلى مساحة عمله.'
                : 'Share this email and password directly with the employee so they can sign in to their workspace.'}
            </p>
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
            >
              {ar ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-700 hover:bg-indigo-800 rounded-md disabled:opacity-50 cursor-pointer"
            >
              {submitting
                ? ar
                  ? 'جاري إنشاء الحساب...'
                  : 'Generating Account...'
                : ar
                ? 'إنشاء حساب الموظف وحفظ البيانات'
                : 'Create Employee & Save Credentials'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. EDIT / DEACTIVATE / ARCHIVE EMPLOYEE MODAL
// ---------------------------------------------------------------------------
export function EditEmployeeModal({
  employee,
  onClose,
  onUpdate,
  onArchive,
}: {
  employee: EmployeeStat;
  onClose: () => void;
  onUpdate: (
    id: number,
    payload: {
      fullName: string;
      department: string;
      jobTitle: string;
      employeeNumber?: string | null;
      accountStatus: 'active' | 'deactivated' | 'invited';
    }
  ) => Promise<void>;
  onArchive: (id: number) => Promise<void>;
}) {
  const ar = isArabicActive();
  const [fullName, setFullName] = useState(employee.fullName);
  const [department, setDepartment] = useState(employee.department);
  const [jobTitle, setJobTitle] = useState(employee.jobTitle);
  const [employeeNumber, setEmployeeNumber] = useState(
    employee.employeeNumber || ''
  );
  const [accountStatus, setAccountStatus] = useState<
    'active' | 'deactivated' | 'invited'
  >(employee.accountStatus);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onUpdate(employee.id, {
        fullName,
        department,
        jobTitle,
        employeeNumber: employeeNumber || null,
        accountStatus,
      });
      onClose();
    } catch (err: any) {
      setError(
        err.message || (ar ? 'تعذر تحديث بيانات الموظف' : 'Failed to update employee')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onArchive(employee.id);
      onClose();
    } catch (err: any) {
      setError(
        err.message || (ar ? 'تعذر أرشفة حساب الموظف' : 'Failed to archive employee')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-lg w-full p-4 sm:p-6 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900 font-display">
              {ar ? 'تعديل ملف الموظف' : 'Edit Employee Profile'}
            </h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              {employee.email}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2 text-xs text-red-800">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="mt-4 space-y-4">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar ? 'القسم / الإدارة' : 'Department'}
              </label>
              <input
                type="text"
                required
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar ? 'الرقم الوظيفي' : 'Employee ID'}
              </label>
              <input
                type="text"
                value={employeeNumber}
                onChange={(e) => setEmployeeNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar ? 'حالة الحساب (التحكم بالوصول)' : 'Account Status (Access Control)'}
              </label>
              <select
                value={accountStatus}
                onChange={(e) => setAccountStatus(e.target.value as any)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                <option value="active">
                  {ar ? 'نشط (مصرّح بالدخول)' : 'Active (Authorized)'}
                </option>
                <option value="deactivated">
                  {ar ? 'معطل (إيقاف الجلسات)' : 'Deactivated (Revoke Sessions)'}
                </option>
                <option value="invited">{ar ? 'مدعو' : 'Invited'}</option>
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
            {!confirmArchive ? (
              <button
                type="button"
                onClick={() => setConfirmArchive(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 rounded-md cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{ar ? 'أرشفة حساب الموظف' : 'Archive Employee'}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleArchive}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md cursor-pointer"
                >
                  {ar
                    ? 'تأكيد الأرشفة (مع حفظ السجل التاريخي)'
                    : 'Confirm Archive (Preserves History)'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmArchive(false)}
                  className="text-xs text-slate-600 hover:underline cursor-pointer"
                >
                  {ar ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
              >
                {ar ? 'إغلاق' : 'Close'}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-medium text-white bg-indigo-700 hover:bg-indigo-800 rounded-md disabled:opacity-50 cursor-pointer"
              >
                {submitting
                  ? ar
                    ? 'جاري الحفظ...'
                    : 'Saving...'
                  : ar
                  ? 'حفظ التغييرات'
                  : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. EMPLOYEE PROFILE & ASSIGNED TASKS DRAWER
// ---------------------------------------------------------------------------
export function EmployeeDetailDrawer({
  employee,
  assignments,
  onClose,
  onInspectAssignment,
  onEditEmployee,
}: {
  employee: EmployeeStat;
  assignments: EnrichedAssignment[];
  onClose: () => void;
  onInspectAssignment: (a: EnrichedAssignment) => void;
  onEditEmployee: (e: EmployeeStat) => void;
}) {
  const ar = isArabicActive();
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex justify-end"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto p-4 sm:p-6 border-s border-slate-200 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between pb-4 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-mono">
                  {employee.employeeNumber || `ID-${employee.id}`}
                </span>
                <span aria-hidden="true">·</span>
                <span>{employee.department}</span>
                <span aria-hidden="true">·</span>
                <AccountStatusText status={employee.accountStatus} />
              </div>
              <h2 className="text-xl font-bold text-slate-900 font-display mt-1">
                {employee.fullName}
              </h2>
              <p className="text-sm text-slate-600">
                {employee.jobTitle} ·{' '}
                <span className="font-mono text-xs">{employee.email}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onEditEmployee(employee)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
              >
                {ar ? 'تعديل الحساب' : 'Edit Account'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Performance Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-b border-slate-200">
            <div>
              <p className="text-xs text-slate-500">
                {ar ? 'المهام المسندة' : 'Assigned Tasks'}
              </p>
              <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {employee.totalAssigned}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">
                {ar ? 'المكتملة المعتمدة' : 'Approved Completed'}
              </p>
              <p className="text-lg font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
                {employee.approvedCompleted}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">
                {ar ? 'معدل الإنجاز' : 'Completion Rate'}
              </p>
              <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {employee.completionRate}%
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">
                {ar ? 'النقاط الموزونة' : 'Weighted Score'}
              </p>
              <p className="text-lg font-bold font-mono tabular-nums text-indigo-700 mt-0.5">
                {employee.weightedScore} {ar ? 'نقطة' : 'pts'}
              </p>
            </div>
          </div>

          {/* Employee Assignments List */}
          <div className="mt-6">
            <h3 className="text-sm font-bold text-slate-900 font-display mb-3">
              {ar
                ? `المهام المسندة وسجل التقدم المستقل (${assignments.length})`
                : `Assigned Tasks & Independent Progress (${assignments.length})`}
            </h3>
            {assignments.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center border border-dashed border-slate-200 rounded-md">
                {ar
                  ? 'لا توجد مهام مسندة حالياً لهذا الموظف.'
                  : 'No tasks currently assigned to this employee.'}
              </p>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
                {assignments.map((a) => (
                  <div
                    key={a.id}
                    className="p-4 hover:bg-slate-50 transition-colors flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {a.task?.title || (ar ? 'مهمة' : 'Task')}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                          {a.task && (
                            <PriorityText priority={a.task.priority} />
                          )}
                          <span aria-hidden="true">·</span>
                          <span>
                            {ar ? 'التسليم:' : 'Due'}{' '}
                            {formatDateShort(a.task?.dueDate)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <AssignmentStatusText
                            status={a.status}
                            isOverdue={a.isOverdue}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onInspectAssignment(a)}
                        className="px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {ar ? 'فحص السجل' : 'Inspect History'}
                      </button>
                    </div>
                    <div className="max-w-xs">
                      <ProgressBar
                        percentage={a.progressPercentage}
                        status={a.status}
                        isOverdue={a.isOverdue}
                      />
                    </div>
                    {a.latestNote && (
                      <p className="text-xs text-slate-600 line-clamp-2">
                        {ar ? 'آخر ملاحظة:' : 'Latest Note:'} “{a.latestNote}”
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200 mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
          >
            {ar ? 'إغلاق الملف' : 'Close Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. CREATE / EDIT TASK MODAL (Multi-Employee Independent Assignment)
// ---------------------------------------------------------------------------
export function CreateEditTaskModal({
  employees,
  existingTask,
  onClose,
  onSubmitCreate,
  onSubmitUpdate,
}: {
  employees: EmployeeStat[];
  existingTask?: TaskData | null;
  onClose: () => void;
  onSubmitCreate: (payload: {
    title: string;
    description: string;
    priority: 'Low' | 'Medium' | 'High' | 'Critical';
    category: string;
    startDate: string;
    dueDate: string;
    estimatedEffort: number;
    assignedEmployeeIds: number[];
    completionCriteria?: string;
    checklist: { id: string; label: string; done: boolean }[];
  }) => Promise<void>;
  onSubmitUpdate?: (
    taskId: number,
    payload: {
      title: string;
      description: string;
      priority: 'Low' | 'Medium' | 'High' | 'Critical';
      category: string;
      startDate: string;
      dueDate: string;
      estimatedEffort: number;
      completionCriteria?: string | null;
      taskStatus?: 'active' | 'canceled' | 'archived';
      assignedEmployeeIds: number[];
    }
  ) => Promise<void>;
}) {
  const ar = isArabicActive();
  const todayIso = new Date().toISOString().split('T')[0];
  const nextWeekIso = new Date(Date.now() + 7 * 86_400_000)
    .toISOString()
    .split('T')[0];

  const [title, setTitle] = useState(existingTask?.title || '');
  const [description, setDescription] = useState(
    existingTask?.description || ''
  );
  const [priority, setPriority] = useState<
    'Low' | 'Medium' | 'High' | 'Critical'
  >(existingTask?.priority || 'High');
  const [category, setCategory] = useState(
    existingTask?.category || 'Platform Engineering'
  );
  const [startDate, setStartDate] = useState(
    existingTask?.startDate
      ? new Date(existingTask.startDate).toISOString().split('T')[0]
      : todayIso
  );
  const [dueDate, setDueDate] = useState(
    existingTask?.dueDate
      ? new Date(existingTask.dueDate).toISOString().split('T')[0]
      : nextWeekIso
  );
  const [estimatedEffort, setEstimatedEffort] = useState(
    existingTask?.estimatedEffort || 12
  );
  const [completionCriteria, setCompletionCriteria] = useState(
    existingTask?.completionCriteria || ''
  );

  const initialAssignees =
    existingTask?.assignments
      ?.filter((a) => a.status !== 'canceled')
      .map((a) => a.employeeId) || [];

  const [selectedEmpIds, setSelectedEmpIds] = useState<number[]>(
    initialAssignees.length > 0
      ? initialAssignees
      : employees.filter(
          (e) => e.role === 'employee' && e.accountStatus === 'active'
        )[0]
      ? [
          employees.filter(
            (e) => e.role === 'employee' && e.accountStatus === 'active'
          )[0].id,
        ]
      : []
  );

  const [checklistInput, setChecklistInput] = useState('');
  const [checklist, setChecklist] = useState<
    { id: string; label: string; done: boolean }[]
  >(existingTask?.checklist || []);

  const [confirmCancelTask, setConfirmCancelTask] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recurrence, setRecurrence] = useState<'none' | 'weekly' | 'monthly'>(
    'none'
  );
  const [templateSavedNotice, setTemplateSavedNotice] = useState<string | null>(
    null
  );
  const [customTemplates, setCustomTemplates] = useState<SavedTaskTemplate[]>(
    () => {
      try {
        const raw = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    }
  );

  const allTemplates = [...DEFAULT_TASK_TEMPLATES, ...customTemplates];

  const applyTaskTemplate = (tpl: SavedTaskTemplate) => {
    setTitle(tpl.title);
    setDescription(tpl.description);
    setPriority(tpl.priority);
    setCategory(tpl.category);
    setEstimatedEffort(tpl.estimatedEffort);
    setRecurrence(tpl.recurrence);
    setCompletionCriteria(tpl.completionCriteria);
    if (tpl.recurrence === 'weekly') {
      setDueDate(
        new Date(Date.now() + 7 * 86_400_000).toISOString().split('T')[0]
      );
    } else if (tpl.recurrence === 'monthly') {
      setDueDate(
        new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0]
      );
    }
  };

  const handleSaveCurrentAsTemplate = () => {
    if (!title.trim() || title.trim().length < 3) {
      setError(
        ar
          ? 'يرجى كتابة عنوان ووصف المهمة أولاً لحفظها كقالب جاهز.'
          : 'Please enter a title and description first to save as a template.'
      );
      return;
    }
    const newTpl: SavedTaskTemplate = {
      id: `custom-${Date.now()}`,
      labelAr: `⭐ ${title.trim()}`,
      labelEn: `⭐ ${title.trim()}`,
      title: title.trim(),
      description:
        description.trim() ||
        (ar ? 'مهمة قياسية متكررة' : 'Standard recurring task template'),
      priority,
      category,
      estimatedEffort: Number(estimatedEffort) || 8,
      recurrence,
      completionCriteria,
    };
    const updated = [...customTemplates, newTpl];
    setCustomTemplates(updated);
    try {
      localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(updated));
    } catch {
      // ignore storage error
    }
    setTemplateSavedNotice(
      ar
        ? `تم حفظ القالب "${newTpl.title}" بنجاح لاستخدامه بضغطة زر!`
        : `Saved "${newTpl.title}" to your ready-to-use templates!`
    );
    setTimeout(() => setTemplateSavedNotice(null), 4000);
  };

  const activeEmployees = employees.filter(
    (e) => e.role === 'employee' && e.accountStatus !== 'deactivated'
  );

  const toggleEmployee = (id: number) => {
    setSelectedEmpIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const addChecklistItem = () => {
    if (!checklistInput.trim()) return;
    setChecklist((prev) => [
      ...prev,
      {
        id: `chk-${Date.now()}`,
        label: checklistInput.trim(),
        done: false,
      },
    ]);
    setChecklistInput('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (selectedEmpIds.length === 0) {
      setError(
        ar
          ? 'يرجى اختيار موظف واحد على الأقل لإسناد هذه المهمة.'
          : 'Please select at least one employee to assign this task.'
      );
      return;
    }
    setSubmitting(true);
    try {
      if (existingTask && onSubmitUpdate) {
        await onSubmitUpdate(existingTask.id, {
          title,
          description,
          priority,
          category,
          startDate,
          dueDate,
          estimatedEffort: Number(estimatedEffort),
          completionCriteria: completionCriteria || null,
          assignedEmployeeIds: selectedEmpIds,
        });
      } else {
        const recurrencePrefix =
          recurrence === 'weekly'
            ? ar
              ? '[مهمة أسبوعية متكررة 🔁] '
              : '[Weekly Recurring 🔁] '
            : recurrence === 'monthly'
            ? ar
              ? '[مهمة شهرية متكررة 🗓️] '
              : '[Monthly Recurring 🗓️] '
            : '';
        const finalTitle =
          recurrence !== 'none' && !title.includes('🔁') && !title.includes('🗓️')
            ? `${recurrencePrefix}${title}`
            : title;
        await onSubmitCreate({
          title: finalTitle,
          description,
          priority,
          category,
          startDate,
          dueDate,
          estimatedEffort: Number(estimatedEffort),
          assignedEmployeeIds: selectedEmpIds,
          completionCriteria: completionCriteria || undefined,
          checklist,
        });
      }
      onClose();
    } catch (err: any) {
      setError(
        err.message || (ar ? 'تعذر حفظ المهمة' : 'Failed to save task')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelTask = async () => {
    if (!existingTask || !onSubmitUpdate) return;
    setSubmitting(true);
    try {
      await onSubmitUpdate(existingTask.id, {
        title,
        description,
        priority,
        category,
        startDate,
        dueDate,
        estimatedEffort: Number(estimatedEffort),
        completionCriteria: completionCriteria || null,
        taskStatus: 'canceled',
        assignedEmployeeIds: selectedEmpIds,
      });
      onClose();
    } catch (err: any) {
      setError(
        err.message || (ar ? 'تعذر إلغاء المهمة' : 'Failed to cancel task')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-2xl w-full p-4 sm:p-6 my-2 sm:my-8 max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900 font-display">
              {existingTask
                ? ar
                  ? 'تعديل المهمة والتكليفات'
                  : 'Edit Task & Assignments'
                : ar
                ? 'إنشاء وإسناد مهمة جديدة'
                : 'Create & Assign Task'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {ar
                ? 'عند إسناد المهمة لعدة موظفين، يحصل كل موظف على نسخة تكليف وشريط تقدم مستقل خاص به.'
                : 'When assigned to multiple employees, each employee receives an independent assignment and progress tracker.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2 text-xs text-red-800">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Ready-to-Use Task Templates & Recurrence Selector */}
          {!existingTask && (
            <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>
                    {ar
                      ? 'قوالب المهام الجاهزة والمهام المتكررة (Task Templates & Recurring)'
                      : 'Ready-to-Use Task Templates & Recurrence'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSaveCurrentAsTemplate}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-indigo-800 bg-white hover:bg-indigo-100 border border-indigo-300 rounded-md cursor-pointer"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  <span>
                    {ar ? 'حفظ النموذج الحالي كقالب' : 'Save Current as Template'}
                  </span>
                </button>
              </div>

              {templateSavedNotice && (
                <div className="px-2.5 py-1.5 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded text-xs font-medium">
                  ✓ {templateSavedNotice}
                </div>
              )}

              {/* Quick Template Pills */}
              <div className="flex flex-wrap gap-1.5">
                {allTemplates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTaskTemplate(tpl)}
                    className="px-2.5 py-1 text-xs font-medium bg-white hover:bg-indigo-600 hover:text-white text-slate-800 border border-indigo-200 rounded-md transition-colors cursor-pointer"
                  >
                    {ar ? tpl.labelAr : tpl.labelEn}
                  </button>
                ))}
              </div>

              {/* Recurrence Selector */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-indigo-200/70">
                <span className="text-xs font-semibold text-indigo-950 flex items-center gap-1.5">
                  <Repeat className="w-3.5 h-3.5 text-indigo-700" />
                  {ar ? 'دورية وتكرار المهمة:' : 'Task Recurrence Schedule:'}
                </span>
                <div className="inline-flex items-center gap-1 bg-white p-1 rounded-md border border-indigo-200">
                  {[
                    {
                      id: 'none',
                      label: ar ? 'مرة واحدة' : 'One-Time',
                    },
                    {
                      id: 'weekly',
                      label: ar ? '🔁 أسبوعياً' : '🔁 Weekly',
                    },
                    {
                      id: 'monthly',
                      label: ar ? '🗓️ شهرياً' : '🗓️ Monthly',
                    },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setRecurrence(opt.id as any);
                        if (opt.id === 'weekly') {
                          setDueDate(
                            new Date(Date.now() + 7 * 86_400_000)
                              .toISOString()
                              .split('T')[0]
                          );
                        } else if (opt.id === 'monthly') {
                          setDueDate(
                            new Date(Date.now() + 30 * 86_400_000)
                              .toISOString()
                              .split('T')[0]
                          );
                        }
                      }}
                      className={`px-2.5 py-1 text-xs font-semibold rounded cursor-pointer transition-colors ${
                        recurrence === opt.id
                          ? 'bg-indigo-700 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {ar ? 'عنوان المهمة *' : 'Task Title *'}
            </label>
            <input
              type="text"
              required
              minLength={3}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                ar
                  ? 'مثال: تطوير نظام التقارير الشهرية ومراجعة الأداء'
                  : 'e.g. Implement OAuth2 Token Rotation & Audit Logging'
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {ar ? 'الوصف التفصيلي للمهمة *' : 'Detailed Description *'}
            </label>
            <textarea
              required
              minLength={10}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                ar
                  ? 'حدد الهدف المطلوب، النطاق الفني، والمخرجات المتوقعة بوضوح...'
                  : 'Specify objective, technical scope, and deliverables...'
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar ? 'الأولوية *' : 'Priority *'}
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                <option value="Low">{ar ? 'منخفضة (Low)' : 'Low'}</option>
                <option value="Medium">
                  {ar ? 'متوسطة (Medium)' : 'Medium'}
                </option>
                <option value="High">{ar ? 'عالية (High)' : 'High'}</option>
                <option value="Critical">
                  {ar ? 'حرجة (Critical)' : 'Critical'}
                </option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar ? 'التصنيف / القسم' : 'Category / Department'}
              </label>
              <input
                type="text"
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar ? 'الجهد المقدر (بالساعات)' : 'Estimated Effort (Hours)'}
              </label>
              <input
                type="number"
                min={1}
                max={1000}
                value={estimatedEffort}
                onChange={(e) => setEstimatedEffort(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar ? 'تاريخ البدء *' : 'Start Date *'}
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar ? 'الموعد النهائي للتسليم *' : 'Deadline *'}
              </label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
          </div>

          {/* Multi-Employee Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-700">
                {ar
                  ? `إسناد إلى الموظفين * (تم اختيار ${selectedEmpIds.length})`
                  : `Assign to Employee(s) * (${selectedEmpIds.length} selected)`}
              </label>
              <span className="text-xs text-slate-500">
                {ar
                  ? 'تقدم مستقل لكل موظف مكلف'
                  : 'Independent progress per assignee'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2.5 border border-slate-300 rounded-md bg-slate-50">
              {activeEmployees.map((emp) => {
                const checked = selectedEmpIds.includes(emp.id);
                return (
                  <label
                    key={emp.id}
                    className={`flex items-center gap-2.5 p-2 rounded border text-xs cursor-pointer transition-colors ${
                      checked
                        ? 'bg-indigo-50/80 border-indigo-300 text-slate-900'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEmployee(emp.id)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    />
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{emp.fullName}</p>
                      <p className="text-slate-500 truncate">
                        {emp.department} · {emp.currentActiveWorkload}{' '}
                        {ar ? 'مهام نشطة' : 'active'}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {ar ? 'معايير الإنجاز والقبول (اختياري)' : 'Completion Criteria (Optional)'}
            </label>
            <input
              type="text"
              value={completionCriteria}
              onChange={(e) => setCompletionCriteria(e.target.value)}
              placeholder={
                ar
                  ? 'مثال: اجتياز جميع الاختبارات ومراجعة التوثيق الفني'
                  : 'e.g. All integration tests passing and documentation reviewed'
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>

          {!existingTask && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar
                  ? 'المهام الفرعية / خطوات التنفيذ (اختياري)'
                  : 'Subtasks / Checklist Items (Optional)'}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={checklistInput}
                  onChange={(e) => setChecklistInput(e.target.value)}
                  placeholder={
                    ar
                      ? 'أضف خطوة فرعية أو مرحلة عمل...'
                      : 'Add a milestone or checklist step...'
                  }
                  className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-md"
                />
                <button
                  type="button"
                  onClick={addChecklistItem}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{ar ? 'إضافة' : 'Add'}</span>
                </button>
              </div>
              {checklist.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-slate-700">
                  {checklist.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between py-1 px-2 bg-slate-50 rounded border border-slate-200"
                    >
                      <span>{item.label}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setChecklist((prev) =>
                            prev.filter((i) => i.id !== item.id)
                          )
                        }
                        className="text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
            {existingTask && existingTask.taskStatus === 'active' ? (
              !confirmCancelTask ? (
                <button
                  type="button"
                  onClick={() => setConfirmCancelTask(true)}
                  className="px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 rounded-md cursor-pointer"
                >
                  {ar ? 'إلغاء المهمة' : 'Cancel Task'}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleCancelTask}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md cursor-pointer"
                  >
                    {ar ? 'تأكيد إلغاء المهمة' : 'Confirm Task Cancellation'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmCancelTask(false)}
                    className="text-xs text-slate-600 cursor-pointer"
                  >
                    {ar ? 'تراجع' : 'Back'}
                  </button>
                </div>
              )
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
              >
                {ar ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-medium text-white bg-indigo-700 hover:bg-indigo-800 rounded-md disabled:opacity-50 cursor-pointer"
              >
                {submitting
                  ? ar
                    ? 'جاري الحفظ...'
                    : 'Saving...'
                  : existingTask
                  ? ar
                    ? 'حفظ تعديلات المهمة'
                    : 'Save Task Changes'
                  : ar
                  ? 'إنشاء وإسناد المهمة'
                  : 'Create & Assign Task'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. UNIFIED ASSIGNMENT PROGRESS, COMPLETION SUBMISSION & MANAGER REVIEW MODAL
// ---------------------------------------------------------------------------
export function AssignmentActionModal({
  assignment,
  currentUser,
  initialMode,
  onClose,
  onStartTask,
  onUpdateProgress,
  onSubmitCompletion,
  onReviewSubmission,
  onAddAttachment,
}: {
  assignment: EnrichedAssignment;
  currentUser: CurrentUser;
  initialMode?: 'update' | 'submit' | 'review' | 'history';
  onClose: () => void;
  onStartTask: (assignmentId: number) => Promise<void>;
  onUpdateProgress: (
    assignmentId: number,
    payload: {
      progressPercentage: number;
      description: string;
      blockers?: string;
      nextSteps?: string;
      evidenceUrl?: string;
    }
  ) => Promise<void>;
  onSubmitCompletion: (
    assignmentId: number,
    payload: {
      progressPercentage: number;
      submissionSummary: string;
      evidenceNotes?: string;
    }
  ) => Promise<void>;
  onReviewSubmission: (
    assignmentId: number,
    payload: {
      decision: 'approved' | 'rejected' | 'changes_requested';
      reviewNotes: string;
      qualityBonusAwarded: number;
    }
  ) => Promise<void>;
  onAddAttachment: (
    assignmentId: number,
    file: { originalFilename: string; contentType: string; fileSize: number }
  ) => Promise<void>;
}) {
  const ar = isArabicActive();
  const isOwner = assignment.employeeId === currentUser.id;
  const isAdmin = currentUser.role === 'admin';
  const canEditProgress =
    isOwner &&
    assignment.status !== 'approved' &&
    assignment.status !== 'canceled';

  const defaultTab =
    initialMode ||
    (isAdmin && assignment.status === 'awaiting_review'
      ? 'review'
      : canEditProgress
      ? 'update'
      : 'history');

  const [activeTab, setActiveTab] = useState<
    'update' | 'submit' | 'review' | 'history'
  >(defaultTab);

  // Progress Update form state
  const [progressPercentage, setProgressPercentage] = useState<number>(
    assignment.progressPercentage
  );
  const [description, setDescription] = useState('');
  const [blockers, setBlockers] = useState('');
  const [nextSteps, setNextSteps] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');

  // Completion Submission form state
  const [submissionSummary, setSubmissionSummary] = useState('');
  const [evidenceNotes, setEvidenceNotes] = useState('');

  // Manager Review form state
  const [decision, setDecision] = useState<
    'approved' | 'rejected' | 'changes_requested'
  >('approved');
  const [reviewNotes, setReviewNotes] = useState('');
  const [qualityBonusAwarded, setQualityBonusAwarded] = useState(20);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachmentSuccess, setAttachmentSuccess] = useState<string | null>(
    null
  );

  const handleProgressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onUpdateProgress(assignment.id, {
        progressPercentage: Number(progressPercentage),
        description,
        blockers: blockers || undefined,
        nextSteps: nextSteps || undefined,
        evidenceUrl: evidenceUrl || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(
        err.message ||
          (ar ? 'تعذر حفظ تحديث التقدم' : 'Failed to save progress update')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompletionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmitCompletion(assignment.id, {
        progressPercentage: 100,
        submissionSummary,
        evidenceNotes: evidenceNotes || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(
        err.message ||
          (ar
            ? 'تعذر إرسال المهمة للمراجعة'
            : 'Failed to submit task for review')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleManagerReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onReviewSubmission(assignment.id, {
        decision,
        reviewNotes,
        qualityBonusAwarded: decision === 'approved' ? qualityBonusAwarded : 0,
      });
      onClose();
    } catch (err: any) {
      setError(
        err.message ||
          (ar
            ? 'تعذر تسجيل قرار المراجعة'
            : 'Failed to record review decision')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setAttachmentSuccess(null);
    try {
      await onAddAttachment(assignment.id, {
        originalFilename: file.name,
        contentType: file.type || 'application/pdf',
        fileSize: file.size || 2048,
      });
      setAttachmentSuccess(
        ar
          ? `تم إرفاق الملف "${file.name}" بسجل المهمة بنجاح.`
          : `Attached "${file.name}" to assignment record.`
      );
    } catch (err: any) {
      setError(
        err.message ||
          (ar ? 'تعذر إرفاق الملف' : 'Failed to upload attachment metadata')
      );
    }
  };

  const latestSubmission = assignment.submissions[0];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-3xl w-full p-4 sm:p-6 my-2 sm:my-8 max-h-[92dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{assignment.task?.category || (ar ? 'عام' : 'General')}</span>
              <span aria-hidden="true">·</span>
              {assignment.task && (
                <PriorityText priority={assignment.task.priority} />
              )}
              <span aria-hidden="true">·</span>
              <span>
                {ar ? 'موعد التسليم:' : 'Due'}{' '}
                {formatDateShort(assignment.task?.dueDate)}
              </span>
              <span aria-hidden="true">·</span>
              <AssignmentStatusText
                status={assignment.status}
                isOverdue={assignment.isOverdue}
              />
            </div>
            <h2 className="text-lg font-bold text-slate-900 font-display mt-1">
              {assignment.task?.title || (ar ? 'تكليف مهمة' : 'Task Assignment')}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              {ar ? 'الموظف المكلف:' : 'Assignee:'}{' '}
              <strong className="text-slate-900">
                {assignment.employee?.fullName || currentUser.fullName}
              </strong>{' '}
              ({assignment.employee?.department || currentUser.department})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Task Description & Completion Criteria */}
        <div className="py-3.5 border-b border-slate-200 text-xs text-slate-700 space-y-3">
          <p className="leading-relaxed">{assignment.task?.description}</p>
          {assignment.task?.completionCriteria && (
            <p className="text-slate-600">
              <strong className="text-slate-900">
                {ar ? 'معايير الإنجاز:' : 'Completion Criteria:'}
              </strong>{' '}
              {assignment.task.completionCriteria}
            </p>
          )}
          {assignment.status !== 'approved' &&
            assignment.status !== 'canceled' && (
              <TaskTimeTrackerWidget
                assignmentId={assignment.id}
                estimatedEffortHours={assignment.task?.estimatedEffort || 8}
                onStartTaskIfNotStarted={
                  assignment.status === 'not_started'
                    ? () => onStartTask(assignment.id)
                    : undefined
                }
              />
            )}
        </div>

        {/* Segmented Tab Bar */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg my-4">
          {canEditProgress && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('update')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'update'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {ar
                  ? `تحديث التقدم (${assignment.progressPercentage}%)`
                  : `Update Progress (${assignment.progressPercentage}%)`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setProgressPercentage(100);
                  setActiveTab('submit');
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'submit'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {ar
                  ? 'تسليم العمل المكتمل (100%)'
                  : 'Submit Completed Work (100%)'}
              </button>
            </>
          )}
          {isAdmin && assignment.status === 'awaiting_review' && (
            <button
              type="button"
              onClick={() => setActiveTab('review')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'review'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {ar ? 'مراجعة واعتماد المدير' : 'Manager Completion Review'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'history'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {ar
              ? `سجل التقدم والمراجعات (${assignment.progressUpdates.length})`
              : `Progress & Review History (${assignment.progressUpdates.length})`}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2 text-xs text-red-800">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {attachmentSuccess && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-md flex items-start gap-2 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{attachmentSuccess}</span>
          </div>
        )}

        {/* TAB 1: UPDATE PROGRESS */}
        {activeTab === 'update' && canEditProgress && (
          <form onSubmit={handleProgressSubmit} className="space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-3">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="progress-range"
                  className="text-xs font-semibold text-slate-900"
                >
                  {ar ? 'نسبة الإنجاز الجديدة (السابقة: ' : 'New Progress Percentage (Previous: '}
                  <span className="font-mono">
                    {assignment.progressPercentage}%
                  </span>
                  )
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={progressPercentage}
                    onChange={(e) =>
                      setProgressPercentage(
                        Math.max(0, Math.min(100, Number(e.target.value)))
                      )
                    }
                    className="w-20 px-2 py-1 text-sm font-mono tabular-nums text-right border border-slate-300 rounded bg-white"
                  />
                  <span className="text-xs font-mono text-slate-600">%</span>
                </div>
              </div>
              <input
                id="progress-range"
                type="range"
                min={0}
                max={100}
                step={5}
                value={progressPercentage}
                onChange={(e) => setProgressPercentage(Number(e.target.value))}
                className="w-full accent-indigo-700 cursor-pointer"
              />
              <ProgressBar
                percentage={progressPercentage}
                status={assignment.status}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar
                  ? 'ما تم إنجازه منذ آخر تحديث * (10 أحرف على الأقل)'
                  : 'Work Completed Since Last Update * (Min 10 characters)'}
              </label>
              <textarea
                required
                minLength={10}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  ar
                    ? 'اشرح الخطوات المنجزة، المخرجات، أو التحديثات التي قمت بها...'
                    : 'Describe concrete milestones, code commits, or deliverables completed...'
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {ar
                    ? 'العوائق أو التحديات (اختياري)'
                    : 'Blockers or Challenges (Optional)'}
                </label>
                <input
                  type="text"
                  value={blockers}
                  onChange={(e) => setBlockers(e.target.value)}
                  placeholder={
                    ar
                      ? 'أي معوقات أو متطلبات معلقة...'
                      : 'Any dependencies or impediments...'
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {ar ? 'الخطوات القادمة (اختياري)' : 'Next Steps (Optional)'}
                </label>
                <input
                  type="text"
                  value={nextSteps}
                  onChange={(e) => setNextSteps(e.target.value)}
                  placeholder={
                    ar ? 'الإجراءات القادمة المخطط لها...' : 'Planned next actions...'
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer hover:text-indigo-700">
                <Paperclip className="w-4 h-4" />
                <span>
                  {ar
                    ? 'إرفاق ملف إثبات (PDF, PNG, CSV, ZIP)'
                    : 'Attach Evidence File (PDF, PNG, CSV, ZIP)'}
                </span>
                <input
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                >
                  {ar ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium text-white bg-indigo-700 hover:bg-indigo-800 rounded-md inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {submitting
                      ? ar
                        ? 'جاري حفظ التقدم...'
                        : 'Saving Progress...'
                      : ar
                      ? `تسجيل التحديث (${assignment.progressPercentage}% ← ${progressPercentage}%)`
                      : `Record Update (${assignment.progressPercentage}% → ${progressPercentage}%)`}
                  </span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* TAB 2: SUBMIT COMPLETED TASK FOR REVIEW */}
        {activeTab === 'submit' && canEditProgress && (
          <form onSubmit={handleCompletionSubmit} className="space-y-4">
            <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-md text-xs text-amber-900">
              <p className="font-semibold">
                {ar
                  ? 'نظام مراجعة واعتماد المدير'
                  : 'Explicit Manager Review Workflow'}
              </p>
              <p className="mt-0.5">
                {ar
                  ? 'عند الإرسال تتحول نسبة الإنجاز إلى 100% وتنتقل المهمة إلى حالة (بانتظار المراجعة) ليقوم المدير بمراجعتها واعتماد نقاطها في لوحة الصدارة.'
                  : 'Submitting sets your progress to 100% and transitions the assignment to Awaiting Review. An administrator will verify your work before it counts toward official leaderboard rankings.'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar
                  ? 'ملخص الإنجاز النهائي والمخرجات المسلمة * (10 أحرف على الأقل)'
                  : 'Completion Summary & Deliverable Overview * (Min 10 characters)'}
              </label>
              <textarea
                required
                minLength={10}
                rows={4}
                value={submissionSummary}
                onChange={(e) => setSubmissionSummary(e.target.value)}
                placeholder={
                  ar
                    ? 'لخّص كافة المخرجات المكتملة ونتائج التحقق وكيفية استيفاء متطلبات المهمة...'
                    : 'Summarize all completed deliverables, verification results, and how completion criteria were met...'
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar
                  ? 'روابط الإثبات / ملاحظات إضافية (اختياري)'
                  : 'Verification Evidence / PR Links / Notes (Optional)'}
              </label>
              <input
                type="text"
                value={evidenceNotes}
                onChange={(e) => setEvidenceNotes(e.target.value)}
                placeholder={
                  ar
                    ? 'مثال: رابط المستند أو التقرير النهائي...'
                    : 'e.g. Verified on staging environment, all 28 tests passing'
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
              >
                {ar ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {submitting
                    ? ar
                      ? 'جاري الإرسال...'
                      : 'Submitting...'
                    : ar
                    ? 'إرسال العمل المكتمل (100%) للمراجعة'
                    : 'Submit 100% Complete Work for Review'}
                </span>
              </button>
            </div>
          </form>
        )}

        {/* TAB 3: MANAGER COMPLETION REVIEW */}
        {activeTab === 'review' && isAdmin && (
          <form onSubmit={handleManagerReview} className="space-y-4">
            {latestSubmission ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-slate-900">
                    {ar
                      ? `تسليم الإصدار v${latestSubmission.version} بواسطة ${assignment.employee?.fullName}`
                      : `Submission v${latestSubmission.version} by ${assignment.employee?.fullName}`}
                  </span>
                  <span className="font-mono">
                    {formatDateTimeShort(latestSubmission.submittedAt)}
                  </span>
                </div>
                <p className="text-sm text-slate-900">
                  {latestSubmission.submissionSummary}
                </p>
                {latestSubmission.evidenceNotes && (
                  <p className="text-xs text-slate-600">
                    <strong>{ar ? 'الإثبات:' : 'Evidence:'}</strong>{' '}
                    {latestSubmission.evidenceNotes}
                  </p>
                )}
              </div>
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600">
                {ar ? 'آخر ملاحظة:' : 'Latest Note:'}{' '}
                {assignment.latestNote ||
                  (ar ? 'بانتظار المراجعة' : 'Awaiting review')}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {ar ? 'قرار المراجعة *' : 'Review Decision *'}
                </label>
                <select
                  value={decision}
                  onChange={(e) => setDecision(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                >
                  <option value="approved">
                    {ar
                      ? 'اعتماد الإنجاز النهائي (يُحتسب في لوحة الصدارة)'
                      : 'Approve Completion (Counts Toward Leaderboard)'}
                  </option>
                  <option value="changes_requested">
                    {ar
                      ? 'طلب تعديلات (إعادة إلى قيد التنفيذ)'
                      : 'Request Revisions (Return to In Progress)'}
                  </option>
                  <option value="rejected">
                    {ar
                      ? 'رفض التسليم (إعادة إلى قيد التنفيذ)'
                      : 'Reject Submission (Return to In Progress)'}
                  </option>
                </select>
              </div>

              {decision === 'approved' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {ar
                      ? 'نقاط بونص الجودة من المدير (0 إلى 50 نقطة)'
                      : 'Manager Quality Bonus Points (0–50 pts)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={qualityBonusAwarded}
                    onChange={(e) =>
                      setQualityBonusAwarded(Number(e.target.value))
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {ar
                  ? 'ملاحظات المراجع / التغذية الراجعة للموظف *'
                  : 'Reviewer Notes / Feedback for Employee *'}
              </label>
              <textarea
                required
                minLength={5}
                rows={3}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder={
                  decision === 'approved'
                    ? ar
                      ? 'اكتب ملاحظة الاعتماد وتقييم جودة العمل...'
                      : 'Document approval sign-off and quality evaluation...'
                    : ar
                    ? 'وضح للموظف التعديلات المطلوبة قبل إعادة التسليم...'
                    : 'Explain specifically what needs to be revised before resubmission...'
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
              >
                {ar ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={`px-4 py-2 text-xs font-medium text-white rounded-md inline-flex items-center gap-1.5 cursor-pointer ${
                  decision === 'approved'
                    ? 'bg-emerald-700 hover:bg-emerald-800'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {submitting
                    ? ar
                      ? 'جاري الحفظ...'
                      : 'Recording Decision...'
                    : decision === 'approved'
                    ? ar
                      ? 'تأكيد الاعتماد النهائي'
                      : 'Confirm Approval'
                    : ar
                    ? 'إعادة للموظف للتعديل'
                    : 'Return for Revisions'}
                </span>
              </button>
            </div>
          </form>
        )}

        {/* TAB 4: APPEND-ONLY PROGRESS, SUBMISSION & REVIEW HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            {/* Reviews History */}
            {assignment.reviews.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                  {ar
                    ? `قرارات مراجعة المدير (${assignment.reviews.length})`
                    : `Manager Review Decisions (${assignment.reviews.length})`}
                </h3>
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
                  {assignment.reviews.map((rev) => (
                    <div key={rev.id} className="p-3.5 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">
                          {ar
                            ? `القرار: ${
                                rev.decision === 'approved'
                                  ? 'معتمدة'
                                  : 'مطلوب تعديلات'
                              }`
                            : `Decision: ${rev.decision.toUpperCase()}`}
                          {rev.qualityBonusAwarded > 0
                            ? ar
                              ? ` (+${rev.qualityBonusAwarded} نقطة بونص جودة)`
                              : ` (+${rev.qualityBonusAwarded} Quality Bonus pts)`
                            : ''}
                        </span>
                        <span className="font-mono text-slate-500">
                          {formatDateTimeShort(rev.createdAt)}
                        </span>
                      </div>
                      <p className="text-slate-700">{rev.reviewNotes}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Submissions History */}
            {assignment.submissions.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                  {ar
                    ? `تسليمات الإنجاز (${assignment.submissions.length})`
                    : `Completion Submissions (${assignment.submissions.length})`}
                </h3>
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
                  {assignment.submissions.map((sub) => (
                    <div key={sub.id} className="p-3.5 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">
                          {ar
                            ? `إصدار التسليم v${sub.version}`
                            : `Submission Version v${sub.version}`}
                        </span>
                        <span className="font-mono text-slate-500">
                          {formatDateTimeShort(sub.submittedAt)}
                        </span>
                      </div>
                      <p className="text-slate-700">{sub.submissionSummary}</p>
                      {sub.evidenceNotes && (
                        <p className="text-slate-500">
                          {ar ? 'الإثبات:' : 'Evidence:'} {sub.evidenceNotes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attachments */}
            {assignment.attachments.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                  {ar
                    ? `ملفات الإثبات المرفقة (${assignment.attachments.length})`
                    : `Attached Evidence Files (${assignment.attachments.length})`}
                </h3>
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
                  {assignment.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="p-3 text-xs flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <span className="font-medium text-slate-900">
                          {att.originalFilename}
                        </span>
                        <span className="text-slate-500 font-mono">
                          ({Math.round(att.fileSize / 1024)} KB)
                        </span>
                      </div>
                      <span className="font-mono text-slate-500">
                        {formatDateTimeShort(att.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Append-Only Progress Updates */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <History className="w-4 h-4 text-indigo-700" />
                <h3 className="text-xs font-bold text-slate-900">
                  {ar
                    ? `سجل تحديثات التقدم الزمني (${assignment.progressUpdates.length})`
                    : `Immutable Progress History (${assignment.progressUpdates.length})`}
                </h3>
              </div>
              {assignment.progressUpdates.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-md">
                  {ar
                    ? 'لم يتم تسجيل أي تحديثات تقدم لهذه المهمة بعد.'
                    : 'No progress updates recorded yet for this assignment.'}
                </p>
              ) : (
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
                  {assignment.progressUpdates.map((upd) => (
                    <div key={upd.id} className="p-3.5 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-indigo-700 tabular-nums">
                          {upd.previousPercentage}% → {upd.newPercentage}%
                        </span>
                        <span className="font-mono text-slate-500">
                          {formatDateTimeShort(upd.createdAt)}
                        </span>
                      </div>
                      <p className="text-slate-900 leading-relaxed">
                        {upd.description}
                      </p>
                      {(upd.blockers || upd.nextSteps) && (
                        <div className="flex flex-wrap gap-4 text-slate-500 pt-1">
                          {upd.blockers && (
                            <span>
                              <strong className="text-slate-700">
                                {ar ? 'العوائق:' : 'Blockers:'}
                              </strong>{' '}
                              {upd.blockers}
                            </span>
                          )}
                          {upd.nextSteps && (
                            <span>
                              <strong className="text-slate-700">
                                {ar ? 'الخطوات القادمة:' : 'Next Steps:'}
                              </strong>{' '}
                              {upd.nextSteps}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
