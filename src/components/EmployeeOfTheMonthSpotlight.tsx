import React, { useMemo, useState } from 'react';
import { EmployeeStat, OrganizationData } from '../types/workspace.ts';
import { isArabicActive } from '../lib/i18n.ts';
import {
  Award,
  CheckCircle2,
  Crown,
  Download,
  FileCheck2,
  Printer,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  UserCheck,
  X,
} from 'lucide-react';

interface EmployeeOfTheMonthSpotlightProps {
  employees: EmployeeStat[];
  organization?: OrganizationData;
  currentUserId?: number;
  isAdmin?: boolean;
  fullPageView?: boolean;
  onSelectEmployee?: (emp: EmployeeStat) => void;
}

export function EmployeeOfTheMonthSpotlight({
  employees,
  organization,
  currentUserId,
  isAdmin = false,
  fullPageView = false,
  onSelectEmployee,
}: EmployeeOfTheMonthSpotlightProps) {
  const ar = isArabicActive();
  const [showCertificateModal, setShowCertificateModal] = useState(false);
  const [certLang, setCertLang] = useState<'ar' | 'en'>(ar ? 'ar' : 'en');
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);
  const [customNoteAr, setCustomNoteAr] = useState(
    'تقديراً لالتزامه الاستثنائي بالمواعيد النهائية، وجودة تسليماته المعتمدة، ومساهمته الفعالة في رفع كفاءة الأداء التشغيلي للمؤسسة خلال هذا الشهر.'
  );
  const [customNoteEn, setCustomNoteEn] = useState(
    'In recognition of outstanding dedication, exceptional on-time delivery discipline, high-quality approved deliverables, and measurable operational impact throughout the month.'
  );

  // Rank active employees (non-admin preferred if available, otherwise any active user)
  const rankedCandidates = useMemo(() => {
    const activeNonAdmins = employees.filter(
      (e) => e.accountStatus === 'active' && e.role === 'employee'
    );
    const pool =
      activeNonAdmins.length > 0
        ? activeNonAdmins
        : employees.filter((e) => e.accountStatus === 'active');

    return [...pool].sort((a, b) => {
      if (b.weightedScore !== a.weightedScore) {
        return b.weightedScore - a.weightedScore;
      }
      if (b.approvedCompleted !== a.approvedCompleted) {
        return b.approvedCompleted - a.approvedCompleted;
      }
      if (b.onTimeRate !== a.onTimeRate) {
        return b.onTimeRate - a.onTimeRate;
      }
      return b.completionRate - a.completionRate;
    });
  }, [employees]);

  const winner = useMemo(() => {
    if (selectedEmpId) {
      const found = rankedCandidates.find((e) => e.id === selectedEmpId);
      if (found) return found;
    }
    return rankedCandidates[0] || null;
  }, [rankedCandidates, selectedEmpId]);

  if (!winner) return null;

  const now = new Date();
  const monthNameAr = now.toLocaleDateString('ar-EG', {
    month: 'long',
    year: 'numeric',
  });
  const monthNameEn = now.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  const issueDateAr = now.toLocaleDateString('ar-EG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const issueDateEn = now.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const certificateNumber = `VP-EOTM-${now.getFullYear()}${String(
    now.getMonth() + 1
  ).padStart(2, '0')}-${String(winner.id).padStart(4, '0')}`;

  const orgName = organization?.name || 'VeloPulse Enterprise';
  const isCurrentUserWinner = currentUserId === winner.id;

  const handlePrintCertificate = () => {
    const isCertAr = certLang === 'ar';

    const htmlContent = `<!DOCTYPE html>
<html lang="${isCertAr ? 'ar' : 'en'}" dir="${isCertAr ? 'rtl' : 'ltr'}">
<head>
  <meta charset="UTF-8" />
  <title>${
    isCertAr
      ? `شهادة تقدير موظف الشهر - ${winner.fullName}`
      : `Employee of the Month Certificate - ${winner.fullName}`
  }</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 landscape;
      margin: 10mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: ${isCertAr ? "'Cairo', sans-serif" : "'Inter', sans-serif"};
      background: #ffffff;
      color: #0f172a;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .cert-outer {
      width: 100%;
      max-width: 1040px;
      min-height: 670px;
      background: #ffffff;
      border: 8px solid #1e1b4b;
      border-radius: 16px;
      padding: 16px;
      position: relative;
    }
    .cert-inner {
      border: 3px double #d97706;
      border-radius: 10px;
      padding: 32px 44px;
      min-height: 625px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      background: radial-gradient(circle at top right, rgba(254, 243, 199, 0.35), transparent 55%),
                  radial-gradient(circle at bottom left, rgba(224, 231, 255, 0.35), transparent 55%);
    }
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 16px;
    }
    .org-badge {
      font-size: 13px;
      font-weight: 800;
      color: #3730a3;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .serial-tag {
      font-family: monospace;
      font-size: 12px;
      color: #64748b;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 4px 10px;
      border-radius: 6px;
    }
    .title-block {
      text-align: center;
      margin: 12px 0 8px;
    }
    .gold-pill {
      display: inline-block;
      background: #fef3c7;
      color: #b45309;
      border: 1px solid #fde68a;
      font-size: 12px;
      font-weight: 800;
      padding: 4px 16px;
      border-radius: 999px;
      margin-bottom: 8px;
    }
    .cert-main-title {
      font-size: 32px;
      font-weight: 900;
      color: #1e1b4b;
      margin: 0;
    }
    .cert-subtitle {
      font-size: 14px;
      color: #64748b;
      margin-top: 4px;
    }
    .recipient-section {
      text-align: center;
      margin: 10px 0;
    }
    .recipient-name {
      font-size: 34px;
      font-weight: 900;
      color: #b45309;
      margin: 4px 0;
      border-bottom: 2px solid #fde68a;
      display: inline-block;
      padding: 0 32px 6px;
    }
    .recipient-role {
      font-size: 15px;
      font-weight: 700;
      color: #334155;
      margin-top: 4px;
    }
    .citation-text {
      text-align: center;
      max-width: 780px;
      margin: 10px auto;
      font-size: 14px;
      line-height: 1.75;
      color: #334155;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      max-width: 820px;
      margin: 12px auto;
      width: 100%;
    }
    .metric-box {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-top: 3px solid #4338ca;
      border-radius: 8px;
      padding: 10px 14px;
      text-align: center;
    }
    .metric-val {
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
    }
    .metric-lbl {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
      font-weight: 600;
    }
    .footer-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 16px;
      padding-top: 14px;
      border-top: 1px solid #e2e8f0;
    }
    .sig-block {
      text-align: center;
      min-width: 210px;
    }
    .sig-line {
      border-bottom: 1.5px solid #334155;
      height: 30px;
      margin-bottom: 6px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      font-weight: 700;
      color: #1e1b4b;
      font-size: 14px;
      padding-bottom: 4px;
    }
    .sig-label {
      font-size: 12px;
      color: #64748b;
      font-weight: 600;
    }
    .seal-circle {
      width: 90px;
      height: 90px;
      border-radius: 50%;
      background: linear-gradient(135deg, #f59e0b, #b45309);
      color: #ffffff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border: 4px double #fef3c7;
      text-align: center;
      font-weight: 800;
      font-size: 11px;
      line-height: 1.25;
      padding: 8px;
    }
  </style>
</head>
<body>
  <div class="cert-outer">
    <div class="cert-inner">
      <div class="header-row">
        <div>
          <div class="org-badge">${orgName}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
            ${
              isCertAr
                ? 'نظام إدارة العمليات وتقييم الأداء المؤسسي'
                : 'Enterprise Operations & Performance Management System'
            }
          </div>
        </div>
        <div class="serial-tag">
          ${isCertAr ? 'رقم الشهادة المرجعي:' : 'Certificate ID:'} ${certificateNumber}
        </div>
      </div>

      <div class="title-block">
        <div class="gold-pill">
          ★ ${
            isCertAr
              ? `وسام التميز التشغيلي · ${monthNameAr}`
              : `Operational Excellence Award · ${monthNameEn}`
          } ★
        </div>
        <h1 class="cert-main-title">
          ${
            isCertAr
              ? 'شهادة تقدير — موظف الشهر المتميز'
              : 'Certificate of Appreciation — Employee of the Month'
          }
        </h1>
        <div class="cert-subtitle">
          ${
            isCertAr
              ? 'تمنح إدارة المؤسسة هذه الشهادة الرسمية تكريماً للأداء الاستثنائي إلى:'
              : 'This official certificate is proudly presented in recognition of outstanding performance to:'
          }
        </div>
      </div>

      <div class="recipient-section">
        <div class="recipient-name">${winner.fullName}</div>
        <div class="recipient-role">
          ${winner.jobTitle} · ${winner.department}
          ${winner.employeeNumber ? ` (${winner.employeeNumber})` : ''}
        </div>
      </div>

      <p class="citation-text">
        ${isCertAr ? customNoteAr : customNoteEn}
      </p>

      <div class="metrics-grid">
        <div class="metric-box">
          <div class="metric-val">${winner.weightedScore}</div>
          <div class="metric-lbl">${
            isCertAr ? 'النقاط الموزونة' : 'Weighted Score'
          }</div>
        </div>
        <div class="metric-box">
          <div class="metric-val">${winner.onTimeRate}%</div>
          <div class="metric-lbl">${
            isCertAr ? 'الالتزام بالمواعيد' : 'On-Time Rate'
          }</div>
        </div>
        <div class="metric-box">
          <div class="metric-val">${winner.approvedCompleted}</div>
          <div class="metric-lbl">${
            isCertAr ? 'المهام المعتمدة' : 'Approved Tasks'
          }</div>
        </div>
        <div class="metric-box">
          <div class="metric-val">${winner.completionRate}%</div>
          <div class="metric-lbl">${
            isCertAr ? 'معدل الإنجاز الكلي' : 'Completion Rate'
          }</div>
        </div>
      </div>

      <div class="footer-row">
        <div class="sig-block">
          <div class="sig-line">${isCertAr ? issueDateAr : issueDateEn}</div>
          <div class="sig-label">${
            isCertAr ? 'تاريخ الإصدار الرسمي' : 'Official Date of Issue'
          }</div>
        </div>

        <div class="seal-circle">
          <span>★</span>
          <span>${isCertAr ? 'ختم التميز' : 'VERIFIED'}</span>
          <span>${isCertAr ? 'المعتمد' : 'EXCELLENCE'}</span>
        </div>

        <div class="sig-block">
          <div class="sig-line">${orgName}</div>
          <div class="sig-label">${
            isCertAr
              ? 'اعتماد الإدارة التنفيذية'
              : 'Executive Management Sign-Off'
          }</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(htmlContent);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 2000);
      }, 450);
    }
  };

  return (
    <div className="space-y-6">
      {fullPageView && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 font-display">
              {ar
                ? 'شهادة تقدير الموظف المثالي (موظف الشهر)'
                : 'Employee of the Month Certificate of Appreciation'}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {ar
                ? 'تكريم رسمي للموظف الأعلى أداءً والتزاماً بالمواعيد النهائية وجودة المهام المعتمدة، مع إمكانية طباعة وتحميل الشهادة بصيغة PDF.'
                : 'Official recognition of top performance, on-time delivery, and approved task quality with printable A4 landscape PDF export.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handlePrintCertificate}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-xs cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>
              {ar
                ? 'طباعة / تحميل الشهادة (PDF) 🖨️'
                : 'Print / Download Certificate (PDF) 🖨️'}
            </span>
          </button>
        </div>
      )}

      {/* Spotlight Banner at Top of Dashboard */}
      <div className="relative overflow-hidden rounded-xl border border-amber-300/80 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shadow-sm">
        <div className="relative p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Left: Trophy + Winner Profile */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="relative shrink-0">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg border-2 border-amber-200/60">
                <Trophy className="w-8 h-8 text-slate-950" />
              </div>
              <span className="absolute -top-2 -right-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-300 text-slate-950 text-xs font-black shadow">
                #1
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  <Crown className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    {ar
                      ? `نجم وموظف الشهر المتميز · ${monthNameAr}`
                      : `Employee of the Month Spotlight · ${monthNameEn}`}
                  </span>
                </span>

                {isCurrentUserWinner && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {ar
                        ? 'تهانينا! أنت متصدر الأداء هذا الشهر'
                        : 'Congratulations! You are #1 this month'}
                    </span>
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-baseline gap-2.5 pt-0.5">
                <h2
                  onClick={() => onSelectEmployee && onSelectEmployee(winner)}
                  className={`text-xl sm:text-2xl font-extrabold text-white font-display ${
                    onSelectEmployee
                      ? 'hover:text-amber-300 cursor-pointer transition-colors'
                      : ''
                  }`}
                >
                  {winner.fullName}
                </h2>
                <span className="text-xs sm:text-sm text-indigo-200 font-medium">
                  {winner.jobTitle} · {winner.department}
                </span>
              </div>

              <p className="text-xs text-slate-300 max-w-2xl">
                {ar
                  ? 'تم اختياره تلقائياً بناءً على أعلى نقاط أداء موزونة، وأفضل نسبة التزام بالمواعيد النهائية، وجودة المهام المعتمدة.'
                  : 'Automatically spotlighted for achieving the highest weighted score, on-time delivery discipline, and approved task quality.'}
              </p>
            </div>
          </div>

          {/* Right: Key Performance Pills + Certificate Button */}
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <div className="grid grid-cols-3 gap-2.5 bg-slate-800/90 border border-white/10 rounded-lg p-2.5">
              <div className="px-2.5 text-center border-e border-white/10">
                <p className="text-[11px] text-indigo-200">
                  {ar ? 'النقاط الموزونة' : 'Weighted Score'}
                </p>
                <p className="text-base sm:text-lg font-extrabold font-mono text-amber-400">
                  {winner.weightedScore}{' '}
                  <span className="text-[10px] font-normal text-indigo-200">
                    {ar ? 'نقطة' : 'pts'}
                  </span>
                </p>
              </div>
              <div className="px-2.5 text-center border-e border-white/10">
                <p className="text-[11px] text-indigo-200">
                  {ar ? 'الالتزام بالمواعيد' : 'On-Time Rate'}
                </p>
                <p className="text-base sm:text-lg font-extrabold font-mono text-emerald-400">
                  {winner.onTimeRate}%
                </p>
              </div>
              <div className="px-2.5 text-center">
                <p className="text-[11px] text-indigo-200">
                  {ar ? 'المهام المعتمدة' : 'Approved Tasks'}
                </p>
                <p className="text-base sm:text-lg font-extrabold font-mono text-white">
                  {winner.approvedCompleted}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {isAdmin && rankedCandidates.length > 1 && (
                <select
                  aria-label={
                    ar ? 'اختيار الموظف للشهادة' : 'Select employee for certificate'
                  }
                  value={winner.id}
                  onChange={(e) => setSelectedEmpId(Number(e.target.value))}
                  className="px-2.5 py-2 text-xs font-medium bg-white/10 text-white border border-white/20 rounded-lg focus:outline-none focus:border-amber-400 cursor-pointer"
                >
                  {rankedCandidates.map((emp, idx) => (
                    <option
                      key={emp.id}
                      value={emp.id}
                      className="text-slate-900 bg-white"
                    >
                      #{idx + 1} {emp.fullName} ({emp.weightedScore}{' '}
                      {ar ? 'نقطة' : 'pts'})
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={() => {
                  setCertLang(ar ? 'ar' : 'en');
                  setShowCertificateModal(true);
                }}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow transition-colors cursor-pointer whitespace-nowrap"
              >
                <Award className="w-4 h-4" />
                <span>
                  {ar
                    ? 'شهادة التقدير الرقمية (PDF)'
                    : 'Digital Certificate (PDF)'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Printable Certificate View (Inline on Full Page OR Modal) */}
      {(fullPageView || showCertificateModal) && (
        <div
          className={
            fullPageView
              ? 'w-full'
              : 'fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto'
          }
        >
          <div
            className={
              fullPageView
                ? 'bg-white border border-slate-200 rounded-xl w-full overflow-hidden shadow-md'
                : 'bg-white border border-slate-200 rounded-xl max-w-4xl w-full overflow-hidden shadow-2xl my-8'
            }
          >
            {/* Control Bar */}
            <div className="px-6 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Award className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-bold">
                    {ar
                      ? 'شهادة تقدير موظف الشهر الرقمية القابلة للطباعة (PDF)'
                      : 'Printable Employee of the Month Digital Certificate (PDF)'}
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    {ar
                      ? 'يمكنك معاينة الشهادة أو تخصيص نص التقدير ثم طباعتها أو حفظها كملف PDF بحجم A4 أفقي.'
                      : 'Preview the official certificate, customize the citation text, and print or save as an A4 landscape PDF.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-md bg-slate-800 p-0.5 border border-slate-700 text-xs">
                  <button
                    type="button"
                    onClick={() => setCertLang('ar')}
                    className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                      certLang === 'ar'
                        ? 'bg-amber-400 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    شهادة بالعربية
                  </button>
                  <button
                    type="button"
                    onClick={() => setCertLang('en')}
                    className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                      certLang === 'en'
                        ? 'bg-amber-400 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    English Certificate
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handlePrintCertificate}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-md cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>
                    {ar ? 'طباعة / تحميل PDF' : 'Print / Save PDF'}
                  </span>
                </button>

                {!fullPageView && (
                  <button
                    type="button"
                    onClick={() => setShowCertificateModal(false)}
                    className="p-1.5 text-slate-400 hover:text-white rounded-md cursor-pointer"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Certificate Live Visual Preview */}
            <div className="p-6 bg-slate-100 space-y-4 max-h-[82vh] overflow-y-auto">
              <div
                dir={certLang === 'ar' ? 'rtl' : 'ltr'}
                className="bg-white border-[6px] border-indigo-950 rounded-xl p-3 shadow-md"
              >
                <div className="border-2 border-amber-500/80 rounded-lg p-6 sm:p-8 bg-gradient-to-br from-amber-50/30 via-white to-indigo-50/30 space-y-6">
                  {/* Certificate Top Header */}
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-wider text-indigo-800">
                        {orgName}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {certLang === 'ar'
                          ? 'نظام إدارة العمليات وتقييم الأداء المؤسسي'
                          : 'Enterprise Operations & Performance Management System'}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded text-slate-600">
                      {certLang === 'ar' ? 'رقم الشهادة:' : 'Certificate ID:'}{' '}
                      {certificateNumber}
                    </span>
                  </div>

                  {/* Certificate Title */}
                  <div className="text-center space-y-2">
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                      <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-600" />
                      <span>
                        {certLang === 'ar'
                          ? `وسام التميز التشغيلي · ${monthNameAr}`
                          : `Operational Excellence Award · ${monthNameEn}`}
                      </span>
                    </span>

                    <h2 className="text-2xl sm:text-3xl font-black text-indigo-950 font-display">
                      {certLang === 'ar'
                        ? 'شهادة تقدير — موظف الشهر المتميز'
                        : 'Certificate of Appreciation — Employee of the Month'}
                    </h2>

                    <p className="text-xs sm:text-sm text-slate-600">
                      {certLang === 'ar'
                        ? 'تمنح إدارة المؤسسة هذه الشهادة الرسمية تكريماً للأداء الاستثنائي إلى:'
                        : 'This official certificate is proudly presented in recognition of outstanding performance to:'}
                    </p>
                  </div>

                  {/* Recipient Highlight */}
                  <div className="text-center py-2">
                    <div className="inline-block border-b-2 border-amber-400 px-8 pb-2">
                      <p className="text-2xl sm:text-3xl font-black text-amber-700 font-display">
                        {winner.fullName}
                      </p>
                    </div>
                    <p className="text-xs sm:text-sm font-bold text-slate-700 mt-2">
                      {winner.jobTitle} · {winner.department}
                      {winner.employeeNumber ? ` (${winner.employeeNumber})` : ''}
                    </p>
                  </div>

                  {/* Citation Paragraph */}
                  <p className="text-center text-xs sm:text-sm text-slate-700 max-w-2xl mx-auto leading-relaxed">
                    {certLang === 'ar' ? customNoteAr : customNoteEn}
                  </p>

                  {/* 4 Verified Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
                    <div className="bg-white border border-slate-200 border-t-2 border-t-indigo-700 rounded-lg p-3 text-center">
                      <p className="text-lg font-extrabold font-mono text-slate-900">
                        {winner.weightedScore}
                      </p>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {certLang === 'ar'
                          ? 'النقاط الموزونة'
                          : 'Weighted Score'}
                      </p>
                    </div>
                    <div className="bg-white border border-slate-200 border-t-2 border-t-emerald-600 rounded-lg p-3 text-center">
                      <p className="text-lg font-extrabold font-mono text-emerald-700">
                        {winner.onTimeRate}%
                      </p>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {certLang === 'ar'
                          ? 'الالتزام بالمواعيد'
                          : 'On-Time Rate'}
                      </p>
                    </div>
                    <div className="bg-white border border-slate-200 border-t-2 border-t-amber-500 rounded-lg p-3 text-center">
                      <p className="text-lg font-extrabold font-mono text-slate-900">
                        {winner.approvedCompleted}
                      </p>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {certLang === 'ar'
                          ? 'المهام المعتمدة'
                          : 'Approved Tasks'}
                      </p>
                    </div>
                    <div className="bg-white border border-slate-200 border-t-2 border-t-indigo-700 rounded-lg p-3 text-center">
                      <p className="text-lg font-extrabold font-mono text-indigo-700">
                        {winner.completionRate}%
                      </p>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {certLang === 'ar'
                          ? 'معدل الإنجاز الكلي'
                          : 'Completion Rate'}
                      </p>
                    </div>
                  </div>

                  {/* Certificate Footer / Seal & Signatures */}
                  <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
                    <div className="text-center min-w-[160px]">
                      <p className="text-xs font-bold text-slate-900 border-b border-slate-400 pb-1">
                        {certLang === 'ar' ? issueDateAr : issueDateEn}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {certLang === 'ar'
                          ? 'تاريخ الإصدار الرسمي'
                          : 'Official Date of Issue'}
                      </p>
                    </div>

                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 text-white flex flex-col items-center justify-center border-4 border-amber-200 shadow-md text-center p-2">
                      <ShieldCheck className="w-5 h-5 text-amber-100" />
                      <span className="text-[10px] font-black leading-tight mt-0.5">
                        {certLang === 'ar' ? 'ختم التميز المعتمد' : 'VERIFIED SEAL'}
                      </span>
                    </div>

                    <div className="text-center min-w-[160px]">
                      <p className="text-xs font-bold text-indigo-950 border-b border-slate-400 pb-1">
                        {orgName}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {certLang === 'ar'
                          ? 'اعتماد الإدارة التنفيذية'
                          : 'Executive Management Sign-Off'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Admin Optional Custom Citation Editor */}
              {isAdmin && (
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {ar
                      ? 'تخصيص عبارة التقدير في الشهادة قبل الطباعة (اختياري للمدير):'
                      : 'Customize Certificate Appreciation Citation before printing (Optional):'}
                  </label>
                  <textarea
                    rows={2}
                    value={certLang === 'ar' ? customNoteAr : customNoteEn}
                    onChange={(e) =>
                      certLang === 'ar'
                        ? setCustomNoteAr(e.target.value)
                        : setCustomNoteEn(e.target.value)
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:border-indigo-600"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
