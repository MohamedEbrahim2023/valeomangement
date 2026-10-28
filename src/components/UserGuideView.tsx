import React, { useRef } from 'react';
import {
  AlertCircle,
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Lock,
  Printer,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  Wrench,
} from 'lucide-react';
import { InteractiveVideoGuide } from './InteractiveVideoGuide.tsx';

export function UserGuideView({ onClose }: { onClose?: () => void }) {
  const guideContentRef = useRef<HTMLDivElement>(null);

  const handlePrintPdf = () => {
    window.print();
  };

  const handleDownloadStandaloneGuide = () => {
    if (!guideContentRef.current) return;
    const htmlBody = guideContentRef.current.innerHTML;
    const fullHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>دليل المستخدم الشامل - منصة VeloPulse لإدارة المهام والموظفين</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Cairo', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: #f8fafc;
      color: #0f172a;
    }
    .font-mono {
      font-family: 'JetBrains Mono', monospace;
    }
    @media print {
      body {
        background-color: #ffffff !important;
      }
      .no-print {
        display: none !important;
      }
      .print-break-inside-avoid {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .print-page-break {
        break-before: page;
        page-break-before: always;
      }
      @page {
        size: A4;
        margin: 12mm;
      }
    }
  </style>
</head>
<body class="p-4 sm:p-8">
  <div class="max-w-5xl mx-auto">
    <div class="no-print mb-6 bg-indigo-900 text-white p-4 rounded-lg flex flex-wrap items-center justify-between gap-4 shadow-md">
      <div>
        <h2 class="font-bold text-base">دليل المستخدم الشامل والمرجع الفني - منصة VeloPulse</h2>
        <p class="text-xs text-indigo-200 mt-0.5">اضغط على زر "حفظ كملف PDF" واختر Save as PDF لحفظ النسخة الرسمية الجاهزة للطباعة.</p>
      </div>
      <button onclick="window.print()" class="px-5 py-2.5 bg-white text-indigo-900 font-bold text-xs rounded-md hover:bg-indigo-50 cursor-pointer shadow-xs">
        🖨️ طباعة / حفظ كملف PDF (Save as PDF)
      </button>
    </div>
    ${htmlBody}
  </div>
</body>
</html>`;

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'VeloPulse-User-Guide-AR.html');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div dir="rtl" className="space-y-6 text-right font-sans">
      {/* Print-specific CSS rules */}
      <style>{`
        @media print {
          aside, header, .no-print {
            display: none !important;
          }
          main {
            padding: 0 !important;
            max-width: 100% !important;
          }
          body, html {
            background: #ffffff !important;
          }
          .print-break-inside-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .print-page-break {
            break-before: page;
            page-break-before: always;
          }
          @page {
            size: A4;
            margin: 10mm;
          }
        }
      `}</style>

      {/* Top Action Control Bar (Hidden in PDF Print) */}
      <div className="no-print bg-white border border-slate-200 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              الفيديو التعليمي التفاعلي ودليل المستخدم الشامل (PDF)
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              شاهد عرض الأنيميشن التفاعلي لخطوات العمل، أو اطبع واحفظ الدليل الشامل كملف PDF للعميل.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handlePrintPdf}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 rounded-md transition-colors cursor-pointer shadow-xs"
          >
            <Printer className="w-4 h-4" />
            <span>حفظ مباشر كملف PDF (Save as PDF)</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadStandaloneGuide}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>تحميل ملف الدليل المستقل للعميل</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md cursor-pointer"
            >
              إغلاق الدليل
            </button>
          )}
        </div>
      </div>

      {/* INTERACTIVE ANIMATED VIDEO WALKTHROUGH (Hidden when printing PDF) */}
      <div className="no-print">
        <InteractiveVideoGuide />
      </div>

      {/* PRINTABLE / EXPORTABLE GUIDE DOCUMENT */}
      <div
        ref={guideContentRef}
        className="bg-white border border-slate-200 rounded-lg p-6 sm:p-10 space-y-10 shadow-xs"
      >
        {/* ================================================================= */}
        {/* COVER SECTION */}
        {/* ================================================================= */}
        <section className="border-b-2 border-slate-900 pb-8 print-break-inside-avoid">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-md text-xs font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>الوثيقة الرسمية لتشغيل النظام — الإصدار المؤسسي 2026</span>
            </div>
            <span className="text-xs font-mono text-slate-500">
              VeloPulse Enterprise Workforce Operations
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight">
            دليل المستخدم الشامل لمنصة VeloPulse
          </h1>
          <p className="text-base text-slate-600 mt-3 max-w-3xl leading-relaxed">
            النظام المؤسسي المتكامل لإدارة فرق العمل، إسناد المهام المستقلة، تتبع نسب الإنجاز لحظياً، اعتماد المراجعات الإدارية، وتقييم الأداء القياسي للموظفين.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
              <p className="text-xs text-slate-500">قاعدة البيانات</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5 font-mono">
                Supabase PostgreSQL
              </p>
            </div>
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
              <p className="text-xs text-slate-500">معيار التشفير والأمان</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5 font-mono">
                Scrypt + HMAC-SHA256
              </p>
            </div>
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
              <p className="text-xs text-slate-500">المزامنة والتحديث</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">
                لحظي (Real-Time SSE)
              </p>
            </div>
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
              <p className="text-xs text-slate-500">لغات الواجهة</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">
                العربية (RTL) / الإنجليزية (LTR)
              </p>
            </div>
          </div>
        </section>

        {/* ================================================================= */}
        {/* TABLE OF CONTENTS */}
        {/* ================================================================= */}
        <section className="bg-slate-50 border border-slate-200 rounded-lg p-6 print-break-inside-avoid">
          <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-700" />
            <span>فهرس محتويات الدليل</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
            <div className="flex items-center justify-between p-2.5 bg-white rounded border border-slate-200">
              <span className="font-semibold">1. نظرة عامة وهيكل الصلاحيات (المدير والموظف)</span>
              <span className="font-mono text-indigo-700 font-bold">القسم 01</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-white rounded border border-slate-200">
              <span className="font-semibold">2. شرح شاشة تسجيل الدخول والأمان (مع صورة توضيحية)</span>
              <span className="font-mono text-indigo-700 font-bold">القسم 02</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-white rounded border border-slate-200">
              <span className="font-semibold">3. دليل مدير النظام: لوحة القيادة والمراقبة اللحظية</span>
              <span className="font-mono text-indigo-700 font-bold">القسم 03</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-white rounded border border-slate-200">
              <span className="font-semibold">4. إدارة الموظفين وتوليد الحسابات وكلمات المرور</span>
              <span className="font-mono text-indigo-700 font-bold">القسم 04</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-white rounded border border-slate-200">
              <span className="font-semibold">5. إنشاء المهام وإسنادها لموظف أو عدة موظفين</span>
              <span className="font-mono text-indigo-700 font-bold">القسم 05</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-white rounded border border-slate-200">
              <span className="font-semibold">6. دليل الموظف: بدء المهام، تحديث الإنجاز، والتسليم</span>
              <span className="font-mono text-indigo-700 font-bold">القسم 06</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-white rounded border border-slate-200">
              <span className="font-semibold">7. مراجعة المدير، اعتماد المهام، ونظام النقاط والمتصدرين</span>
              <span className="font-mono text-indigo-700 font-bold">القسم 07</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-white rounded border border-slate-200">
              <span className="font-semibold">8. دليل حل جميع المشاكل الشائعة (Troubleshooting FAQ)</span>
              <span className="font-mono text-indigo-700 font-bold">القسم 08</span>
            </div>
          </div>
        </section>

        {/* ================================================================= */}
        {/* SECTION 1: ROLES & ARCHITECTURE */}
        {/* ================================================================= */}
        <section className="space-y-4 print-break-inside-avoid">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <span className="px-2.5 py-1 bg-indigo-700 text-white text-xs font-mono font-bold rounded">
              01
            </span>
            <h2 className="text-xl font-bold text-slate-900">
              نظرة عامة وهيكل الصلاحيات داخل المنصة (Role-Based Access Control)
            </h2>
          </div>

          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            تعمل منصة <strong>VeloPulse</strong> بنظام صلاحيات مؤسسي صارم يمنع التسجيل الذاتي العشوائي؛ حيث يمتلك <strong>مدير النظام (Administrator)</strong> وحده صلاحية إنشاء حسابات الموظفين وإصدار بيانات الدخول الخاصة بهم، مع عزل كامل لبيانات كل موظف.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-indigo-200 bg-indigo-50/40 rounded-lg p-5 space-y-3">
              <div className="flex items-center gap-2 text-indigo-900 font-bold text-sm">
                <ShieldCheck className="w-5 h-5 text-indigo-700" />
                <span>صلاحيات مدير النظام (System Administrator)</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-700 list-disc pr-4 leading-relaxed">
                <li><strong>إنشاء حسابات الموظفين:</strong> إضافة الموظفين وتحديد أقسامهم ومسمياتهم الوظيفية وتوليد كلمات المرور الخاصة بهم.</li>
                <li><strong>إدارة حالة الحسابات:</strong> تفعيل الحسابات، إيقافها مؤقتاً (Deactivate)، إعادة تعيين كلمة المرور، أو أرشفة الموظف مع الاحتفاظ بسجله التاريخي.</li>
                <li><strong>إنشاء وإسناد المهام:</strong> إسناد المهمة لموظف واحد أو لعدة موظفين في نفس الوقت مع تتبع مستقل لكل موظف.</li>
                <li><strong>مراجعة واعتماد التسليمات:</strong> قبول المهام المسلمة (Approve) ومنح نقاط جودة إضافية، أو طلب تعديلات (Request Revisions).</li>
                <li><strong>التقارير والسجل الرقابي:</strong> تصدير تقارير الأداء بصيغة CSV والاطلاع على سجل الحركات غير القابل للتعديل (Audit Log).</li>
              </ul>
            </div>

            <div className="border border-slate-200 bg-slate-50 rounded-lg p-5 space-y-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <UserCheck className="w-5 h-5 text-emerald-700" />
                <span>صلاحيات الموظف (Employee Workspace)</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-700 list-disc pr-4 leading-relaxed">
                <li><strong>خصوصية كاملة:</strong> يرى الموظف فقط المهام المسندة إليه، ولا يمكنه رؤية مهام أو تقارير زملائه التفصيلية.</li>
                <li><strong>بدء تنفيذ المهام:</strong> تحويل حالة المهمة من <code>Not Started</code> إلى <code>In Progress</code> بضغطة زر مع إشعار المدير تلقائياً.</li>
                <li><strong>تحديث نسبة الإنجاز:</strong> تحريك مؤشر الإنجاز (0% إلى 100%) مع كتابة ما تم إنجازه، المعوقات (Blockers)، والخطوات القادمة.</li>
                <li><strong>رفع ملفات الإثبات:</strong> إرفاق ملفات الإثبات والتسليم على المهمة.</li>
                <li><strong>تسليم العمل للمراجعة:</strong> إرسال المهمة المكتملة بنسبة 100% للمدير لمراجعتها واعتماد نقاطها في لوحة المتصدرين.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ================================================================= */}
        {/* SECTION 2: LOGIN SCREEN + VISUAL SCREENSHOT 1 */}
        {/* ================================================================= */}
        <section className="space-y-4 print-break-inside-avoid">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <span className="px-2.5 py-1 bg-indigo-700 text-white text-xs font-mono font-bold rounded">
              02
            </span>
            <h2 className="text-xl font-bold text-slate-900">
              شاشة تسجيل الدخول والأمان (Login &amp; Authentication)
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-6 space-y-3 text-xs text-slate-700 leading-relaxed">
              <p>
                صُممت واجهة تسجيل الدخول لتكون بسيطة، نظيفة، ومحمية بالكامل ضد محاولات التخمين:
              </p>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-700 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                    1
                  </span>
                  <p>
                    <strong>تبديل لغة الواجهة (العربية / English):</strong> في أعلى الشاشة يمكنك التبديل الفوري بين اللغة العربية (RTL) والإنجليزية (LTR).
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-700 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                    2
                  </span>
                  <p>
                    <strong>البريد الإلكتروني وكلمة المرور:</strong> يدخل المدير أو الموظف البريد الإلكتروني وكلمة المرور المخصصة له.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-700 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                    3
                  </span>
                  <p>
                    <strong>التوجيه الذكي حسب الصلاحية:</strong> يتعرف النظام تلقائياً على نوع الحساب؛ فإذا كان <code>Admin</code> يفتح لوحة الإدارة الشاملة، وإذا كان <code>Employee</code> يفتح مساحة عمل الموظف.
                  </p>
                </div>
              </div>
            </div>

            {/* Visual Capture 1: Login Screen */}
            <div className="lg:col-span-6 bg-slate-100 border border-slate-300 rounded-lg p-4">
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2 pb-1.5 border-b border-slate-200">
                <span className="font-semibold text-slate-700">صورة (1): واجهة تسجيل الدخول في المشروع</span>
                <span className="font-mono">AuthScreen.tsx</span>
              </div>
              <div dir="ltr" className="bg-white border border-slate-200 rounded-md p-5 max-w-sm mx-auto shadow-xs text-left">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-900">VeloPulse</span>
                  <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-medium text-slate-700">
                    ① العربية / English
                  </span>
                </div>
                <div className="text-center mb-4">
                  <p className="text-sm font-bold text-slate-900">Sign In to Workspace</p>
                  <p className="text-[11px] text-slate-500">Enter your email and password to sign in</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-medium text-slate-700 mb-1">
                      ② Work Email Address
                    </label>
                    <div className="px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono text-slate-800 bg-slate-50">
                      admin@valeo.com
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="font-medium text-slate-700">Password</span>
                      <span className="text-indigo-700 font-medium">Forgot password?</span>
                    </div>
                    <div className="px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono text-slate-800 bg-slate-50">
                      ••••••••
                    </div>
                  </div>
                  <div className="py-2 px-3 bg-indigo-700 text-white text-center rounded text-xs font-medium">
                    ③ Sign In to Workspace →
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================= */}
        {/* SECTION 3: ADMIN OVERVIEW + VISUAL SCREENSHOT 2 */}
        {/* ================================================================= */}
        <section className="space-y-4 print-break-inside-avoid print-page-break">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <span className="px-2.5 py-1 bg-indigo-700 text-white text-xs font-mono font-bold rounded">
              03
            </span>
            <h2 className="text-xl font-bold text-slate-900">
              دليل مدير النظام: لوحة القيادة والمراقبة اللحظية (Admin Overview)
            </h2>
          </div>

          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            فور دخول مدير النظام، تظهر لوحة القيادة التنفيذية التي تعرض نبض العمل في الشركة لحظة بلحظة دون الحاجة لتحديث الصفحة:
          </p>

          {/* Visual Capture 2: Admin Overview */}
          <div className="bg-slate-100 border border-slate-300 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between text-[11px] text-slate-500 pb-1.5 border-b border-slate-200">
              <span className="font-semibold text-slate-700">
                صورة (2): لوحة القيادة التنفيذية وجدول المراقبة اللحظية للمدير
              </span>
              <span className="font-mono">AdminOverviewView</span>
            </div>

            <div dir="ltr" className="bg-white border border-slate-200 rounded-md p-4 space-y-4 text-left">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    Operations &amp; Workforce Overview
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Real-time task progress, review queue, and organization completion metrics.
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className="px-2.5 py-1 bg-white border border-slate-300 rounded text-[11px] font-medium text-slate-700">
                    ① + Add Employee
                  </span>
                  <span className="px-2.5 py-1 bg-indigo-700 text-white rounded text-[11px] font-medium">
                    ② + Create &amp; Assign Task
                  </span>
                </div>
              </div>

              {/* 5 KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <div className="p-2.5 border border-slate-200 rounded bg-slate-50">
                  <p className="text-[10px] text-slate-500">③ Active Employees</p>
                  <p className="text-base font-bold font-mono text-slate-900">12 / 12</p>
                </div>
                <div className="p-2.5 border border-slate-200 rounded bg-slate-50">
                  <p className="text-[10px] text-slate-500">In Progress</p>
                  <p className="text-base font-bold font-mono text-indigo-700">8</p>
                </div>
                <div className="p-2.5 border border-amber-200 rounded bg-amber-50/50">
                  <p className="text-[10px] text-amber-800">Awaiting Review</p>
                  <p className="text-base font-bold font-mono text-amber-700">3</p>
                </div>
                <div className="p-2.5 border border-emerald-200 rounded bg-emerald-50/50">
                  <p className="text-[10px] text-emerald-800">Approved Completed</p>
                  <p className="text-base font-bold font-mono text-emerald-700">24 (85%)</p>
                </div>
                <div className="p-2.5 border border-slate-200 rounded bg-slate-50">
                  <p className="text-[10px] text-slate-500">Overdue Tasks</p>
                  <p className="text-base font-bold font-mono text-red-600">1</p>
                </div>
              </div>

              {/* Live Monitoring Table Sample */}
              <div className="border border-slate-200 rounded overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-800">
                  ④ Live Task Assignment &amp; Progress Monitoring
                </div>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-slate-50/60 border-b border-slate-200 text-slate-500">
                      <th className="py-1.5 px-2.5 text-left">Employee</th>
                      <th className="py-1.5 px-2.5 text-left">Task</th>
                      <th className="py-1.5 px-2.5 text-left">Status</th>
                      <th className="py-1.5 px-2.5 text-left">Progress</th>
                      <th className="py-1.5 px-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-2 px-2.5 font-semibold">Ahmed Hassan</td>
                      <td className="py-2 px-2.5">API Security Audit</td>
                      <td className="py-2 px-2.5 text-amber-700 font-medium">● Awaiting Review</td>
                      <td className="py-2 px-2.5 font-mono">100%</td>
                      <td className="py-2 px-2.5 text-right">
                        <span className="px-2 py-0.5 border border-indigo-200 text-indigo-700 rounded">
                          ⑤ Review Work
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-700">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
              <strong>① و ② أزرار الإجراءات السريعة:</strong> لإضافة موظف جديد أو إنشاء مهمة جديدة مباشرة من الصفحة الرئيسية.
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
              <strong>③ شريط المؤشرات الخمسة (KPIs):</strong> يعرض عدد الموظفين النشطين، المهام الجارية، المهام بانتظار المراجعة، المهام المعتمدة، والمتأخرة.
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
              <strong>④ و ⑤ جدول المتابعة اللحظية:</strong> يعرض كل موظف ونسبة إنجازه الفعلية وآخر ملاحظة كتبها، مع زر <code>Review Work</code> للمراجعة الفورية.
            </div>
          </div>
        </section>

        {/* ================================================================= */}
        {/* SECTION 4: EMPLOYEE MANAGEMENT + VISUAL SCREENSHOT 3 */}
        {/* ================================================================= */}
        <section className="space-y-4 print-break-inside-avoid">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <span className="px-2.5 py-1 bg-indigo-700 text-white text-xs font-mono font-bold rounded">
              04
            </span>
            <h2 className="text-xl font-bold text-slate-900">
              إدارة الموظفين وتوليد الحسابات وكلمات المرور (Employee Directory)
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-6 space-y-3 text-xs text-slate-700 leading-relaxed">
              <p className="font-semibold text-slate-900 text-sm">
                كيف تضيف موظفاً جديداً وتسلمه حسابه؟
              </p>
              <ol className="space-y-2.5 list-decimal pr-4">
                <li>
                  انتقل إلى قسم <strong>Employees</strong> من القائمة الجانبية أو اضغط على زر <strong>Add Employee</strong>.
                </li>
                <li>
                  أدخل <strong>الاسم الكامل (Full Name)</strong> و<strong>البريد الإلكتروني للعمل (Employee Login Email)</strong>.
                </li>
                <li>
                  حدد <strong>القسم (Department)</strong> و<strong>المسمى الوظيفي (Job Title)</strong> والرقم الوظيفي الاختياري (مثل <code>EMP-204</code>).
                </li>
                <li>
                  في خانة <strong>Assigned Employee Password</strong>، يمكنك كتابة كلمة مرور خاصة بالموظف (8 أحرف على الأقل) أو الضغط على زر <strong>Generate Random Password</strong> لتوليد كلمة مرور قوية تلقائياً.
                </li>
                <li>
                  اضغط على <strong>Create Employee &amp; Save Credentials</strong>؛ سيظهر الموظف فوراً في الجدول بدون تحديث الصفحة، ويمكنه الدخول فوراً ببريده وكلمة المرور.
                </li>
              </ol>

              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-md text-amber-900 space-y-1">
                <p className="font-bold">💡 الفرق بين إيقاف الحساب (Deactivate) والأرشفة (Archive):</p>
                <p>
                  • <strong>Deactivate:</strong> يمنع الموظف من تسجيل الدخول مؤقتاً مع بقاء مهامه الحالية كما هي.
                </p>
                <p>
                  • <strong>Archive Employee:</strong> يُستخدم عند انتهاء عمل الموظف بالشركة؛ حيث يلغي المهام غير المكتملة تلقائياً، لكنه <strong>يحتفظ بجميع المهام السابقة المعتمدة</strong> في تقارير الشركة.
                </p>
              </div>
            </div>

            {/* Visual Capture 3: Add Employee Modal */}
            <div className="lg:col-span-6 bg-slate-100 border border-slate-300 rounded-lg p-4">
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2 pb-1.5 border-b border-slate-200">
                <span className="font-semibold text-slate-700">
                  صورة (3): نافذة توليد حساب موظف جديد وإصدار كلمة المرور
                </span>
                <span className="font-mono">AddEmployeeModal</span>
              </div>

              <div dir="ltr" className="bg-white border border-slate-200 rounded-md p-4 space-y-3 text-left shadow-xs">
                <div className="border-b border-slate-200 pb-2">
                  <p className="text-sm font-bold text-slate-900">Generate New Employee Account</p>
                  <p className="text-[10px] text-slate-500">
                    Issue work email and login password credentials for this employee.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                  <div>
                    <label className="block text-slate-700 font-medium mb-0.5">① Full Name *</label>
                    <div className="px-2 py-1.5 border border-slate-300 rounded bg-slate-50">
                      Nadia Al-Farsi
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-medium mb-0.5">② Login Email *</label>
                    <div className="px-2 py-1.5 border border-slate-300 rounded bg-slate-50 font-mono">
                      nadia@company.com
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-medium mb-0.5">③ Department *</label>
                    <div className="px-2 py-1.5 border border-slate-300 rounded bg-slate-50">
                      Platform Engineering
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-medium mb-0.5">Job Title *</label>
                    <div className="px-2 py-1.5 border border-slate-300 rounded bg-slate-50">
                      Senior QA Engineer
                    </div>
                  </div>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-[11px]">
                  <div className="flex justify-between mb-1">
                    <span className="font-bold text-slate-900">④ Assigned Employee Password *</span>
                    <span className="text-indigo-700 font-medium">Generate Random Password</span>
                  </div>
                  <div className="px-2 py-1 bg-white border border-slate-300 rounded font-mono text-slate-900">
                    Vp!9kLm2#xQ
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 text-[11px]">
                  <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded">Cancel</span>
                  <span className="px-3 py-1 bg-indigo-700 text-white font-medium rounded">
                    ⑤ Create Employee &amp; Save Credentials
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================= */}
        {/* SECTION 5: TASK CREATION & MULTI-ASSIGNMENT + VISUAL SCREENSHOT 4 */}
        {/* ================================================================= */}
        <section className="space-y-4 print-break-inside-avoid print-page-break">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <span className="px-2.5 py-1 bg-indigo-700 text-white text-xs font-mono font-bold rounded">
              05
            </span>
            <h2 className="text-xl font-bold text-slate-900">
              إنشاء المهام وإسنادها لموظف أو عدة موظفين (Multi-Employee Task Assignment)
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-6 space-y-3 text-xs text-slate-700 leading-relaxed">
              <p>
                تتميز منصة <strong>VeloPulse</strong> بنظام <strong>الإسناد المستقل المتعدد (Independent Multi-Employee Assignment)</strong>:
              </p>
              <ul className="space-y-2 list-disc pr-4">
                <li>
                  <strong>كيف يعمل الإسناد المتعدد؟</strong> عند اختيار 3 موظفين في مهمة واحدة، ينشئ النظام 3 تكليفات مستقلة تماماً؛ بحيث يبدأ كل موظف مهمته، ويحدث نسبة إنجازه (مثلاً الموظف الأول 80% والثاني 40%)، ويسلم عمله ويتم تقييمه بشكل مستقل دون أن يؤثر على زملائه.
                </li>
                <li>
                  <strong>درجة الأولوية (Priority):</strong> يمكنك اختيار <code>Low</code> أو <code>Medium</code> أو <code>High</code> أو <code>Critical</code>، وكل درجة تزيد من معامل النقاط التلقائي للمهمة.
                </li>
                <li>
                  <strong>معايير الإنجاز (Completion Criteria - Optional):</strong> حقل اختياري بالكامل؛ يمكنك تركه فارغاً أو كتابة شروط قبول المهمة.
                </li>
                <li>
                  <strong>الفلترة حسب الحالة (Status Filter):</strong> في صفحة المهام يمكنك تصفية المهام فوراً حسب حالتها (<code>Not Started</code>، <code>In Progress</code>، <code>Awaiting Review</code>، <code>Completed</code>، <code>Revision Requested</code>).
                </li>
              </ul>
            </div>

            {/* Visual Capture 4: Create Task Modal */}
            <div className="lg:col-span-6 bg-slate-100 border border-slate-300 rounded-lg p-4">
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2 pb-1.5 border-b border-slate-200">
                <span className="font-semibold text-slate-700">
                  صورة (4): نافذة إنشاء مهمة وإسنادها لعدة موظفين
                </span>
                <span className="font-mono">CreateEditTaskModal</span>
              </div>

              <div dir="ltr" className="bg-white border border-slate-200 rounded-md p-4 space-y-2.5 text-left shadow-xs text-[11px]">
                <div className="border-b border-slate-200 pb-2">
                  <p className="text-sm font-bold text-slate-900">Create &amp; Assign Task</p>
                </div>
                <div>
                  <label className="block font-medium text-slate-700">① Task Title *</label>
                  <div className="px-2 py-1 border border-slate-300 rounded bg-slate-50">
                    Q4 Database Security &amp; Backup Verification
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block font-medium text-slate-700">② Priority *</label>
                    <div className="px-2 py-1 border border-slate-300 rounded bg-slate-50 font-semibold text-red-700">
                      Critical (2.0x)
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700">Start Date *</label>
                    <div className="px-2 py-1 border border-slate-300 rounded bg-slate-50 font-mono">
                      2026-10-28
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700">③ Deadline *</label>
                    <div className="px-2 py-1 border border-slate-300 rounded bg-slate-50 font-mono">
                      2026-11-04
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    ④ Assign to Employee(s) * (2 selected — Independent progress)
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-2 bg-slate-50 border border-slate-300 rounded">
                    <div className="p-1.5 bg-indigo-50 border border-indigo-300 rounded">
                      ☑ <strong>Ahmed Hassan</strong> (Engineering)
                    </div>
                    <div className="p-1.5 bg-indigo-50 border border-indigo-300 rounded">
                      ☑ <strong>Nadia Al-Farsi</strong> (QA)
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block font-medium text-slate-700">
                    ⑤ Completion Criteria (Optional - اختياري)
                  </label>
                  <div className="px-2 py-1 border border-slate-300 rounded text-slate-400">
                    Optional — can be left empty
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================= */}
        {/* SECTION 6: EMPLOYEE WORKSPACE + VISUAL SCREENSHOT 5 */}
        {/* ================================================================= */}
        <section className="space-y-4 print-break-inside-avoid">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <span className="px-2.5 py-1 bg-indigo-700 text-white text-xs font-mono font-bold rounded">
              06
            </span>
            <h2 className="text-xl font-bold text-slate-900">
              دليل الموظف: دورة حياة المهمة من البدء حتى التسليم النهائي
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-6 space-y-3 text-xs text-slate-700 leading-relaxed">
              <p className="font-semibold text-slate-900 text-sm">
                يمر عمل الموظف على أي مهمة بـ 3 خطوات واضحة:
              </p>
              <div className="space-y-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                  <p className="font-bold text-slate-900">الخطوة 1: بدء المهمة (Start Task)</p>
                  <p className="mt-1">
                    عند إسناد مهمة جديدة تكون حالتها <code>Not Started</code>. يضغط الموظف على زر <strong>Start Task</strong> فتتحول فوراً إلى <code>In Progress</code> ويُسجل وقت البدء الفعلي لحساب سرعة الإنجاز.
                  </p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                  <p className="font-bold text-slate-900">الخطوة 2: تحديث نسبة الإنجاز وإرفاق الملفات (Update Progress)</p>
                  <p className="mt-1">
                    يضغط الموظف على <strong>Update Progress</strong>، ويحرك المؤشر (مثلاً إلى <code>65%</code>)، ويكتب ملخص ما أنجزه وأي معوقات (Blockers)، ويمكنه إرفاق ملفات الإثبات عبر <strong>Attach Evidence File</strong>. كل تحديث يُحفظ في سجل زمني غير قابل للحذف.
                  </p>
                </div>
                <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-md">
                  <p className="font-bold text-emerald-950">الخطوة 3: تسليم العمل المكتمل للمراجعة (Submit 100% Complete Work)</p>
                  <p className="mt-1 text-emerald-900">
                    عند اكتمال العمل، يفتح الموظف تبويب <strong>Submit Completed Work (100%)</strong> ويكتب ملخص التسليم النهائي؛ فتنتقل المهمة إلى حالة <code>Awaiting Review</code> ويصل إشعار فوري للمدير.
                  </p>
                </div>
              </div>
            </div>

            {/* Visual Capture 5: Employee Progress & Submission Modal */}
            <div className="lg:col-span-6 bg-slate-100 border border-slate-300 rounded-lg p-4">
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2 pb-1.5 border-b border-slate-200">
                <span className="font-semibold text-slate-700">
                  صورة (5): نافذة تحديث نسبة الإنجاز وتسليم المهمة للموظف
                </span>
                <span className="font-mono">AssignmentActionModal</span>
              </div>

              <div dir="ltr" className="bg-white border border-slate-200 rounded-md p-4 space-y-3 text-left shadow-xs text-[11px]">
                <div className="flex gap-1 p-1 bg-slate-100 rounded">
                  <span className="px-2.5 py-1 bg-white rounded shadow-xs font-semibold text-slate-900">
                    ① Update Progress (65%)
                  </span>
                  <span className="px-2.5 py-1 text-slate-600">
                    ② Submit Completed Work (100%)
                  </span>
                  <span className="px-2.5 py-1 text-slate-600">
                    History (3)
                  </span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2">
                  <div className="flex justify-between font-semibold">
                    <span>③ New Progress Percentage</span>
                    <span className="font-mono text-indigo-700">65%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="w-2/3 h-full bg-indigo-600" />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-0.5">
                    ④ Work Completed Since Last Update *
                  </label>
                  <div className="p-2 border border-slate-300 rounded bg-slate-50 text-slate-700">
                    Completed schema validation and unit tests for all endpoints.
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-indigo-700 font-medium">
                    ⑤ 📎 Attach Evidence File
                  </span>
                  <span className="px-3 py-1 bg-indigo-700 text-white rounded font-medium">
                    Record Update (40% → 65%)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================= */}
        {/* SECTION 7: MANAGER REVIEW, SCORING & LEADERBOARD + SCREENSHOT 6 */}
        {/* ================================================================= */}
        <section className="space-y-4 print-break-inside-avoid print-page-break">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <span className="px-2.5 py-1 bg-indigo-700 text-white text-xs font-mono font-bold rounded">
              07
            </span>
            <h2 className="text-xl font-bold text-slate-900">
              مراجعة المدير، معادلة حساب النقاط، ولوحة المتصدرين (Review &amp; Leaderboard)
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-6 space-y-3 text-xs text-slate-700 leading-relaxed">
              <p className="font-semibold text-slate-900 text-sm">
                آلية اعتماد المهام وحساب النقاط التلقائي:
              </p>
              <p>
                لا تُحتسب أي مهمة في رصيد الموظف بلوحة المتصدرين بمجرد وصولها إلى 100%، بل يجب أن يراجعها المدير ويختار أحد القرارين:
              </p>
              <ul className="space-y-2 list-disc pr-4">
                <li>
                  <strong>الاعتماد النهائي (Approve Completion):</strong> تتحول المهمة إلى <code>Completed (Approved)</code>، ويمنح المدير مكافأة جودة من <code>0</code> إلى <code>50 نقطة</code>، وتُضاف النقاط فوراً لحساب الموظف.
                </li>
                <li>
                  <strong>طلب تعديلات أو رفض (Request Revisions / Reject):</strong> تعود المهمة تلقائياً إلى حالة <code>Revision Requested</code> عند الموظف مع ملاحظات المدير ليقوم بتعديلها وإعادة إرسالها.
                </li>
              </ul>

              <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-md space-y-2">
                <p className="font-bold text-indigo-950">📐 المعادلة الرياضية لحساب نقاط كل مهمة معتمدة:</p>
                <p dir="ltr" className="font-mono text-[11px] bg-white p-2 rounded border border-indigo-200 text-center text-slate-900">
                  Score = (Base 100 × Priority Weight) + On-Time Bonus (25) + Quality Bonus (0..50)
                </p>
                <p className="text-[11px] text-indigo-900">
                  • <strong>معامل الأولوية (Priority Weight):</strong> Low = <code>1.0x</code> | Medium = <code>1.2x</code> | High = <code>1.5x</code> | Critical = <code>2.0x</code>.
                </p>
                <p className="text-[11px] text-indigo-900">
                  • يمكن للمدير تعديل النقاط الأساسية (Base Points) ومكافأة الالتزام بالوقت من قسم <strong>Settings</strong>.
                </p>
              </div>
            </div>

            {/* Visual Capture 6: Manager Review & Leaderboard */}
            <div className="lg:col-span-6 bg-slate-100 border border-slate-300 rounded-lg p-4">
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2 pb-1.5 border-b border-slate-200">
                <span className="font-semibold text-slate-700">
                  صورة (6): نافذة مراجعة المدير ومنح مكافأة الجودة
                </span>
                <span className="font-mono">Manager Completion Review</span>
              </div>

              <div dir="ltr" className="bg-white border border-slate-200 rounded-md p-4 space-y-3 text-left shadow-xs text-[11px]">
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                  <p className="font-bold text-slate-900">Submission v1 by Ahmed Hassan</p>
                  <p className="text-slate-600 mt-0.5">
                    All security checks passed and verified on production pooler.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-medium text-slate-700 mb-0.5">
                      ① Review Decision *
                    </label>
                    <div className="px-2 py-1.5 border border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold rounded">
                      ✓ Approve Completion
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-0.5">
                      ② Quality Bonus (0–50 pts)
                    </label>
                    <div className="px-2 py-1.5 border border-slate-300 bg-slate-50 font-mono font-bold rounded">
                      +20 pts
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-0.5">
                    ③ Reviewer Notes / Feedback *
                  </label>
                  <div className="p-2 border border-slate-300 rounded bg-slate-50 text-slate-700">
                    Excellent execution and delivered ahead of schedule.
                  </div>
                </div>
                <div className="flex justify-end">
                  <span className="px-3 py-1.5 bg-emerald-700 text-white font-medium rounded">
                    ④ Confirm Approval
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================= */}
        {/* SECTION 8: TROUBLESHOOTING & FAQ GUIDE */}
        {/* ================================================================= */}
        <section className="space-y-4 print-page-break">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <span className="px-2.5 py-1 bg-indigo-700 text-white text-xs font-mono font-bold rounded">
              08
            </span>
            <h2 className="text-xl font-bold text-slate-900">
              دليل حل جميع المشاكل الشائعة (Comprehensive Troubleshooting Guide)
            </h2>
          </div>

          <p className="text-xs sm:text-sm text-slate-600">
            مرجع سريع لحل أي مشكلة تشغيلية أو تقنية قد تواجه مدير النظام أو الموظفين أثناء العمل اليومي:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Issue 1 */}
            <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/70 space-y-1.5 print-break-inside-avoid">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                <Wrench className="w-4 h-4 text-indigo-700 shrink-0" />
                <span>1. الموظف نسي كلمة المرور أو تظهر له رسالة (Invalid email or password)</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong>الحل:</strong> يدخل مدير النظام إلى قسم <strong>Employees</strong>، ويضغط على اسم الموظف لفتح ملفه أو تعديله، أو ينشئ له كلمة مرور جديدة ويشاركها معه مع التأكد من عدم وجود مسافات فارغة قبل أو بعد كلمة المرور.
              </p>
            </div>

            {/* Issue 2 */}
            <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/70 space-y-1.5 print-break-inside-avoid">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                <Wrench className="w-4 h-4 text-indigo-700 shrink-0" />
                <span>2. ظهور رسالة (This employee account has been deactivated) عند الدخول</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong>الحل:</strong> هذا يعني أن حالة حساب الموظف موقوفة (<code>Deactivated</code>). لإعادة تفعيله، يدخل المدير إلى قسم <strong>Employees</strong> ← يضغط <strong>Edit</strong> أمام الموظف ← يغير الحالة إلى <strong>Active</strong> ثم يحفظ.
              </p>
            </div>

            {/* Issue 3 */}
            <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/70 space-y-1.5 print-break-inside-avoid">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                <Wrench className="w-4 h-4 text-indigo-700 shrink-0" />
                <span>3. الموظف أنهى المهمة 100% لكن نقاطه لم تزد في لوحة المتصدرين (Leaderboard)</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong>الحل:</strong> وصول المؤشر إلى 100% أو إرسال المهمة يضعها في حالة <code>Awaiting Review</code> (بانتظار مراجعة المدير). بمجرد أن يضغط المدير على <strong>Review Work</strong> ويختار <strong>Approve Completion</strong>، تُضاف النقاط فوراً للوحة المتصدرين.
              </p>
            </div>

            {/* Issue 4 */}
            <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/70 space-y-1.5 print-break-inside-avoid">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                <Wrench className="w-4 h-4 text-indigo-700 shrink-0" />
                <span>4. المدير يريد إرجاع مهمة للموظف لاستكمال نواقص بعد تسليمها</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong>الحل:</strong> يفتح المدير نافذة المراجعة (<strong>Review Work</strong>) ويختار <strong>Request Revisions (Return to In Progress)</strong> ويكتب الملاحظات المطلوبة؛ فتعود المهمة للموظف مع إشعار تنبيهي ليستكملها ويعيد تسليمها.
              </p>
            </div>

            {/* Issue 5 */}
            <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/70 space-y-1.5 print-break-inside-avoid">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                <Wrench className="w-4 h-4 text-indigo-700 shrink-0" />
                <span>5. ظهور رسالة (Too many sign-in attempts. Please wait...)</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong>الحل:</strong> هذا نظام الحماية الأمني التلقائي (Rate Limiter) ضد هجمات تخمين كلمات المرور بعد 15 محاولة خاطئة خلال دقيقة واحدة. انتظر 60 ثانية فقط ثم سجل الدخول بشكل طبيعي.
              </p>
            </div>

            {/* Issue 6 */}
            <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/70 space-y-1.5 print-break-inside-avoid">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                <Wrench className="w-4 h-4 text-indigo-700 shrink-0" />
                <span>6. الرغبة في إنشاء مهمة بدون ملء حقل معايير الإنجاز (Completion Criteria)</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong>الحل:</strong> حقل <strong>Completion Criteria (Optional)</strong> وحقل المهام الفرعية (Subtasks) اختياريان بالكامل؛ يمكنك تركهما فارغين وإسناد المهمة مباشرة.
              </p>
            </div>

            {/* Issue 7 */}
            <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/70 space-y-1.5 print-break-inside-avoid">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                <Wrench className="w-4 h-4 text-indigo-700 shrink-0" />
                <span>7. كيفية حذف مهمة تم إنشاؤها بالخطأ أو إلغائها</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong>الحل:</strong> من قسم <strong>Tasks</strong>، اضغط على زر <strong>Edit / Assignees</strong> بجانب المهمة، ثم اضغط في أسفل النافذة على زر <strong>Cancel Task</strong> ثم <strong>Confirm Task Cancellation</strong> لإلغائها واستبعادها من عبء العمل.
              </p>
            </div>

            {/* Issue 8 */}
            <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/70 space-y-1.5 print-break-inside-avoid">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                <Wrench className="w-4 h-4 text-indigo-700 shrink-0" />
                <span>8. كيفية تعديل اسم الشركة أو قواعد النقاط وساعات العمل اليومية</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong>الحل:</strong> من القائمة الجانبية، يدخل المدير إلى قسم <strong>Settings</strong>، وفي بطاقة <strong>Organization &amp; Scoring Rules</strong> يمكنه تعديل اسم المؤسسة، عدد ساعات العمل، النقاط الأساسية، ومكافأة الالتزام بالمواعيد، وستُعاد حسبة لوحة المتصدرين تلقائياً.
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="pt-6 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>دليل المستخدم الرسمي لمنصة VeloPulse Enterprise Workforce Operations</span>
          <span className="font-mono">Supabase PostgreSQL · Real-Time SSE · Scrypt Security</span>
        </footer>
      </div>
    </div>
  );
}
