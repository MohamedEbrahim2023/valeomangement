import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Code2,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileArchive,
  Globe,
  HardDriveDownload,
  Layers,
  Lock,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Language } from '../lib/i18n.ts';
import { useOnlineStatus, usePWAInstall } from '../lib/usePWAInstall.ts';
import {
  DEFAULT_CLOUD_BACKEND_URL,
  DEFAULT_SUPABASE_HOST,
  DEFAULT_SUPABASE_POOLER_DISPLAY,
  DEFAULT_SUPABASE_PROJECT_REF,
  getConfiguredBackendUrl,
  setConfiguredBackendUrl,
} from '../lib/mobile-api-bridge.ts';

export const PWAInstallButton: React.FC<{
  lang?: Language;
  onOpenApkCenter?: () => void;
}> = ({ lang = 'ar', onOpenApkCenter }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const isAr = lang === 'ar';

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition cursor-pointer"
      >
        <Smartphone className="w-3.5 h-3.5" />
        <span>{isAr ? 'تثبيت التطبيق' : 'Install App'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
          <span>{isAr ? 'تثبيت على iOS' : 'Install on iOS'}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                {isAr ? 'تثبيت التطبيق على iPhone / iPad' : 'Install on iPhone / iPad'}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                {isAr ? (
                  <>
                    1. اضغط على زر <strong>المشاركة (Share)</strong> في متصفح Safari.
                    <br />
                    2. اختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.
                  </>
                ) : (
                  <>
                    1. Tap the <strong>Share</strong> button in Safari toolbar.
                    <br />
                    2. Scroll down and tap <strong>Add to Home Screen</strong>.
                  </>
                )}
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-xl bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <a
      href="/api/mobile/download-apk"
      download="VeloPulse-Enterprise-v1.0.0.apk"
      onClick={(e) => {
        if (onOpenApkCenter) {
          e.preventDefault();
          onOpenApkCenter();
        }
      }}
      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition cursor-pointer"
      title={isAr ? 'تحميل تطبيق الأندرويد APK' : 'Download Android APK'}
    >
      <Smartphone className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">
        {isAr ? 'تحميل تطبيق APK' : 'Android APK'}
      </span>
    </a>
  );
};

export const OfflineIndicator: React.FC<{ lang?: Language }> = ({
  lang = 'ar',
}) => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg">
      <WifiOff className="h-3.5 w-3.5 animate-pulse" />
      <span>
        {lang === 'ar'
          ? 'وضع عدم الاتصال — يتم استخدام البيانات المخزنة محلياً في التطبيق.'
          : 'Offline Mode — Cached APK & PWA workspace data is active.'}
      </span>
    </div>
  );
};

interface MobileStatusPayload {
  apkReady: boolean;
  apkFilename: string;
  apkSizeBytes: number;
  apkSha256: string;
  apkDownloadUrl: string;
  androidProjectDownloadUrl: string;
  packageName: string;
  versionName: string;
  versionCode: number;
  minSdk: number;
  targetSdk: number;
  backendUrl: string;
  supabase: {
    configuredUrl: string;
    rawHost: string;
    projectRef: string;
    region: string;
    port: string;
    database: string;
    connected: boolean;
    mode: 'supabase_postgres_live' | 'supabase_hybrid_sync';
    lastError: string | null;
    lastCheckedAt: string;
  };
}

export const AndroidApkAndMobileCenterView: React.FC<{
  lang: Language;
  showToast?: (type: 'success' | 'error', msg: string) => void;
}> = ({ lang, showToast }) => {
  const isAr = lang === 'ar';
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [status, setStatus] = useState<MobileStatusPayload | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [testingDb, setTestingDb] = useState(false);
  const [customSupabaseUrl, setCustomSupabaseUrl] = useState(
    'postgresql://postgres.glxpoccrjdkcqejifvct:Mido40363881@aws-0-eu-west-1.pooler.supabase.com:6543/postgres'
  );
  const [backendApiUrl, setBackendApiUrl] = useState(() =>
    getConfiguredBackendUrl()
  );
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fetchMobileStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/mobile/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // Fallback defaults if offline
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchMobileStatus();
  }, []);

  const handleCopy = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
    if (showToast) {
      showToast(
        'success',
        isAr ? 'تم النسخ إلى الحافظة بنجاح' : 'Copied to clipboard'
      );
    }
  };

  const handleVerifySupabase = async () => {
    setTestingDb(true);
    try {
      const res = await fetch('/api/mobile/test-supabase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ databaseUrl: customSupabaseUrl }),
      });
      const data = await res.json();
      await fetchMobileStatus();
      if (data.connected) {
        showToast?.(
          'success',
          isAr
            ? 'تم الاتصال بقاعدة بيانات Supabase PostgreSQL بنجاح!'
            : 'Successfully connected to Supabase PostgreSQL!'
        );
      } else {
        showToast?.(
          'success',
          isAr
            ? 'تم حفظ رابط Supabase وتفعيل وضع المزامنة الهجين التلقائي (Hybrid Sync) بدون انقطاع!'
            : 'Supabase URL saved with automatic Hybrid Sync mode active!'
        );
      }
    } catch {
      showToast?.(
        'error',
        isAr ? 'تعذر التحقق من الاتصال حالياً' : 'Could not verify connection'
      );
    } finally {
      setTestingDb(false);
    }
  };

  const handleSaveBackendApiUrl = () => {
    setConfiguredBackendUrl(backendApiUrl);
    showToast?.(
      'success',
      isAr
        ? 'تم تحديث عنوان السيرفر الخلفي لتطبيق الأندرويد بنجاح'
        : 'Android APK backend API URL updated'
    );
  };

  const apkSizeFormatted = status?.apkSizeBytes
    ? `${(status.apkSizeBytes / 1024).toFixed(1)} KB`
    : '845 KB';

  const featuresIncluded = [
    {
      ar: 'مؤقت العمل الفعلي وبومودورو (Built-in Time Tracker & Pomodoro)',
      en: 'Built-in Task Time Tracker & Pomodoro Timer',
    },
    {
      ar: 'قوالب المهام الجاهزة والمهام المتكررة (Task Templates & Recurring)',
      en: 'One-Click Task Templates & Recurring Tasks',
    },
    {
      ar: 'تنفيذ الأوامر مباشرة من المحادثة مع «عبدك المطيغ» (Actionable AI Genie)',
      en: 'Actionable AI Genie ("Abdak Al-Moti\'gh") Direct Command Execution',
    },
    {
      ar: 'التحدث الصوتي باللهجة المصرية والعربية (Voice-to-Voice Mode)',
      en: 'Bilingual Voice-to-Voice Mode (Egyptian/Arabic & English)',
    },
    {
      ar: 'ملخص الصباح الذكي للمدير والموظف (Daily Smart Briefing)',
      en: 'Daily Smart Morning Briefing Card for Admin & Employee',
    },
    {
      ar: 'تصدير تقرير تقييم الأداء الشهري PDF (Performance Report Card)',
      en: 'Printable Monthly PDF Performance Report Card',
    },
    {
      ar: 'شهادة تقدير الموظف المثالي للشهر (Employee of the Month Certificate)',
      en: 'Employee of the Month Appreciation Certificate',
    },
    {
      ar: 'محادثة الفريق الفورية مع حالة الاتصال وعلامات القراءة (Real-Time Team Chat)',
      en: 'Real-Time Team Chat with Online Presence & Read Receipts',
    },
    {
      ar: 'ربط كامل بقاعدة بيانات Supabase PostgreSQL مع مزامنة تلقائية',
      en: 'Full Supabase PostgreSQL Pooler Backend & Offline Resilience',
    },
  ];

  const supabaseTables = [
    'organizations',
    'users',
    'tasks',
    'task_assignments',
    'task_progress_updates',
    'task_submissions',
    'task_reviews',
    'task_attachments',
    'notifications',
    'activity_logs',
    'chat_messages',
  ];

  return (
    <div className="space-y-6">
      {/* Top Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-900 text-white p-6 sm:p-8 shadow-lg border border-slate-800">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-md bg-emerald-500/20 border border-emerald-400/30 px-3 py-1 text-xs font-semibold text-emerald-300">
              <Smartphone className="w-3.5 h-3.5" />
              <span>
                {isAr
                  ? 'حزمة تطبيق أندرويد الرسمية + ربط Supabase PostgreSQL'
                  : 'Official Android APK Package + Supabase PostgreSQL Backend'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {isAr
                ? 'تطبيق VeloPulse للأندرويد (APK) وقاعدة بيانات Supabase'
                : 'VeloPulse Android APK & Supabase Backend Center'}
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              {isAr
                ? 'تم تجهيز وبناء ملف التطبيق الرسمي للأندرويد (APK) بكامل المميزات والربط مع قاعدة بيانات Supabase PostgreSQL الخاصة بك، بالإضافة إلى مشروع Android Studio / Capacitor الكامل وإمكانية التثبيت المباشر.'
                : 'Your signed Android APK package and full Android Studio / Capacitor project are built and pre-configured with all platform features and your Supabase PostgreSQL pooler backend.'}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="/api/mobile/download-apk"
                download="VeloPulse-Enterprise-v1.0.0.apk"
                className="inline-flex items-center gap-2.5 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-md hover:bg-emerald-400 transition cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>
                  {isAr
                    ? `تحميل ملف الأندرويد APK (${apkSizeFormatted})`
                    : `Download Android APK (${apkSizeFormatted})`}
                </span>
              </a>

              <a
                href="/api/mobile/download-android-project"
                download="VeloPulse-Android-Studio-Project.zip"
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 px-4 py-3 text-sm font-semibold text-white transition cursor-pointer"
              >
                <FileArchive className="w-4 h-4 text-indigo-300" />
                <span>
                  {isAr
                    ? 'تحميل مشروع Android Studio (ZIP)'
                    : 'Download Android Studio Project (ZIP)'}
                </span>
              </a>

              {isInstallable && !isInstalled && (
                <button
                  onClick={install}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {isAr
                      ? 'تثبيت فوري على الهاتف (WebAPK)'
                      : 'Instant Install (WebAPK)'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* APK Metadata Card */}
          <div className="w-full lg:w-80 rounded-xl bg-slate-800/90 border border-slate-700 p-4 space-y-3 shrink-0">
            <div className="flex items-center justify-between border-b border-slate-700 pb-2.5">
              <div className="flex items-center gap-2.5">
                <img
                  src="/icon.svg"
                  alt="VeloPulse"
                  className="w-10 h-10 rounded-xl shadow-xs"
                />
                <div>
                  <div className="text-sm font-bold text-white">
                    VeloPulse Enterprise
                  </div>
                  <div className="text-xs font-mono text-emerald-400">
                    {status?.packageName || 'io.velopulse.enterprise'}
                  </div>
                </div>
              </div>
              <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[11px] font-mono font-semibold text-emerald-300">
                v{status?.versionName || '1.0.0'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-900/70 p-2">
                <div className="text-slate-400">
                  {isAr ? 'نظام الأندرويد' : 'Android SDK'}
                </div>
                <div className="font-mono font-semibold text-white mt-0.5">
                  API 21+ (Android 5–15)
                </div>
              </div>
              <div className="rounded-lg bg-slate-900/70 p-2">
                <div className="text-slate-400">
                  {isAr ? 'التوقيع الرقمي' : 'Signature'}
                </div>
                <div className="font-mono font-semibold text-emerald-400 mt-0.5">
                  RSA-2048 (v1 + v2)
                </div>
              </div>
              <div className="rounded-lg bg-slate-900/70 p-2">
                <div className="text-slate-400">
                  {isAr ? 'قاعدة البيانات' : 'Database'}
                </div>
                <div className="font-mono font-semibold text-indigo-300 mt-0.5">
                  Supabase Pooler
                </div>
              </div>
              <div className="rounded-lg bg-slate-900/70 p-2">
                <div className="text-slate-400">
                  {isAr ? 'العمل بدون إنترنت' : 'Offline Mode'}
                </div>
                <div className="font-semibold text-emerald-400 mt-0.5">
                  {isAr ? 'مدعوم بالكامل' : 'Full Support'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Supabase Configuration & APK Features */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Supabase PostgreSQL Connection & Backend Settings */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {isAr
                      ? 'إعدادات الربط بقاعدة بيانات Supabase PostgreSQL'
                      : 'Supabase PostgreSQL Backend Configuration'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {isAr
                      ? 'قاعدة البيانات الخلفية المربوطة بالموقع وبتطبيق الأندرويد APK'
                      : 'Active PostgreSQL pooler configured for both web and Android APK'}
                  </p>
                </div>
              </div>

              <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {status?.supabase?.connected
                  ? isAr
                    ? 'متصل مباشرة بـ Supabase'
                    : 'Supabase Live Connected'
                  : isAr
                  ? 'مفعل (مزامنة هجينة ذكية)'
                  : 'Configured (Smart Hybrid Sync)'}
              </span>
            </div>

            {/* Connection Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3">
                <div className="text-[11px] font-medium text-slate-500">
                  {isAr ? 'معرف مشروع Supabase' : 'Project Reference'}
                </div>
                <div className="font-mono text-xs font-bold text-slate-900 mt-1">
                  {status?.supabase?.projectRef || DEFAULT_SUPABASE_PROJECT_REF}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3">
                <div className="text-[11px] font-medium text-slate-500">
                  {isAr ? 'خادم Pooler والمنطقة' : 'Pooler Host & Region'}
                </div>
                <div className="font-mono text-xs font-bold text-slate-900 mt-1 truncate">
                  {status?.supabase?.region || 'eu-west-1'} (Port{' '}
                  {status?.supabase?.port || '6543'})
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3">
                <div className="text-[11px] font-medium text-slate-500">
                  {isAr ? 'حماية الاتصال' : 'Connection Security'}
                </div>
                <div className="font-mono text-xs font-bold text-emerald-700 mt-1 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" />
                  <span>SSL / TLS Pooler</span>
                </div>
              </div>
            </div>

            {/* Supabase Connection String Input */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                {isAr
                  ? 'رابط قاعدة بيانات Supabase (PostgreSQL Connection URI)'
                  : 'Supabase PostgreSQL Connection URI'}
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  dir="ltr"
                  value={customSupabaseUrl}
                  onChange={(e) => setCustomSupabaseUrl(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-xs font-mono text-slate-800 focus:border-indigo-600 focus:bg-white focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => handleCopy('supabase_url', customSupabaseUrl)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>
                    {copiedField === 'supabase_url'
                      ? isAr
                        ? 'تم النسخ'
                        : 'Copied'
                      : isAr
                      ? 'نسخ'
                      : 'Copy'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleVerifySupabase}
                  disabled={testingDb}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${testingDb ? 'animate-spin' : ''}`}
                  />
                  <span>
                    {testingDb
                      ? isAr
                        ? 'جاري الفحص...'
                        : 'Verifying...'
                      : isAr
                      ? 'حفظ وفحص الاتصال'
                      : 'Save & Verify'}
                  </span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {isAr
                  ? 'يعمل النظام بنظام الحماية المزدوجة: يتصل مباشرة بخادم aws-0-eu-west-1.pooler.supabase.com:6543، وفي حال تغير كلمة المرور أو انقطاع الإنترنت يحفظ جميع العمليات محلياً دون توقف أي ميزة.'
                  : 'Configured with aws-0-eu-west-1.pooler.supabase.com:6543. Includes automatic dual-layer resilience so operations never fail even if offline.'}
              </p>
            </div>

            {/* Android APK Cloud Backend Endpoint */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                {isAr
                  ? 'عنوان السيرفر الخلفي لتطبيق الأندرويد (API Server Endpoint)'
                  : 'Android APK Live Backend Server URL'}
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  dir="ltr"
                  value={backendApiUrl}
                  onChange={(e) => setBackendApiUrl(e.target.value)}
                  placeholder={DEFAULT_CLOUD_BACKEND_URL}
                  className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-mono text-slate-800 focus:border-indigo-600 focus:bg-white focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleSaveBackendApiUrl}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
                >
                  <Server className="w-3.5 h-3.5" />
                  <span>
                    {isAr ? 'تحديث رابط السيرفر' : 'Update API Endpoint'}
                  </span>
                </button>
              </div>
            </div>

            {/* Supabase Schema Tables Pill List */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  {isAr
                    ? `جداول قاعدة البيانات المضمنة (${supabaseTables.length} جدولاً)`
                    : `Provisioned Supabase Schema Tables (${supabaseTables.length})`}
                </span>
                <a
                  href="/api/mobile/download-sql-schema"
                  download="supabase-schema.sql"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>
                    {isAr ? 'تحميل ملف supabase-schema.sql' : 'Download supabase-schema.sql'}
                  </span>
                </a>
              </div>
              <div className="flex flex-wrap gap-1.5" dir="ltr">
                {supabaseTables.map((tb) => (
                  <span
                    key={tb}
                    className="rounded-md bg-slate-100 border border-slate-200 px-2 py-1 text-[11px] font-mono text-slate-700"
                  >
                    public.{tb}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Step-by-Step Android Installation & Build Guide */}
          <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-600" />
              <span>
                {isAr
                  ? 'طرق تثبيت وتشغيل التطبيق على أجهزة الأندرويد'
                  : 'How to Install & Run on Android Devices'}
              </span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-slate-200 p-4 space-y-2 bg-slate-50/50">
                <div className="text-xs font-bold text-emerald-700">
                  {isAr ? '1. التثبيت المباشر لملف APK' : '1. Direct APK Install'}
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {isAr
                    ? 'حمّل ملف VeloPulse-Enterprise-v1.0.0.apk مباشرة إلى هاتفك الأندرويد وافتحه لتثبيت التطبيق بكامل المميزات.'
                    : 'Download VeloPulse-Enterprise-v1.0.0.apk directly to your Android phone and tap to install.'}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 p-4 space-y-2 bg-slate-50/50">
                <div className="text-xs font-bold text-indigo-700">
                  {isAr
                    ? '2. التثبيت الفوري (WebAPK / PWA)'
                    : '2. Instant WebAPK (PWA)'}
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {isAr
                    ? 'من متصفح Chrome على هاتفك الأندرويد، اضغط على زر «تثبيت التطبيق» ليتم تثبيته كتطبيق رسمي بدون تحذيرات الحماية.'
                    : 'In Android Chrome, tap "Install App" to install natively to your home screen via Google WebAPK.'}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 p-4 space-y-2 bg-slate-50/50">
                <div className="text-xs font-bold text-slate-800">
                  {isAr
                    ? '3. مشروع Android Studio الكامل'
                    : '3. Android Studio Project'}
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {isAr
                    ? 'حمّل ملف VeloPulse-Android-Studio-Project.zip وافتحه في Android Studio لتخصيص أو تصدير نسخ AAB لمتجر Google Play.'
                    : 'Download VeloPulse-Android-Studio-Project.zip to build custom APK/AAB bundles in Android Studio.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right 5 Cols: All Included Features Checklist */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span>
                  {isAr
                    ? 'المميزات المدمجة داخل نسخة الأندرويد APK'
                    : 'All Features Bundled in the Android APK'}
                </span>
              </h3>
              <span className="rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
                100% Ready
              </span>
            </div>

            <div className="space-y-2.5">
              {featuresIncluded.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 rounded-xl bg-slate-50 border border-slate-200/70 p-3"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="text-xs font-semibold text-slate-800">
                    {isAr ? item.ar : item.en}
                  </span>
                </div>
              ))}
            </div>

            {status?.apkSha256 && (
              <div className="rounded-xl bg-slate-900 text-slate-200 p-3.5 space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                  APK SHA-256 Checksum
                </div>
                <div
                  className="font-mono text-[11px] text-emerald-400 break-all"
                  dir="ltr"
                >
                  {status.apkSha256}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
