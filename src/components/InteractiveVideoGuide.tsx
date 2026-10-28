import React, { useEffect, useRef, useState } from 'react';
import {
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  Lock,
  MousePointer,
  Paperclip,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserPlus,
  Volume2,
  VolumeX,
  Wrench,
} from 'lucide-react';

interface SceneSpec {
  id: number;
  durationSec: number;
  timeRange: string;
  title: string;
  subtitle: string;
  narration: string;
  tips: string[];
}

const SCENES: SceneSpec[] = [
  {
    id: 0,
    durationSec: 12,
    timeRange: '00:00 - 00:12',
    title: 'المشهد 1: تسجيل الدخول الآمن وتوجيه الصلاحيات',
    subtitle: 'Smart Authentication & Role-Based Routing',
    narration:
      'مرحباً بك في الدليل التفاعلي لمنصة VeloPulse. تبدأ رحلة المستخدم من شاشة تسجيل الدخول المحمية، حيث يدخل المدير أو الموظف البريد الإلكتروني وكلمة المرور، ليتعرف النظام تلقائياً على صلاحياته ويوجهه إلى لوحة التحكم المخصصة له.',
    tips: [
      'يمكنك التبديل بين العربية والإنجليزية من الزر العلوي في أي وقت.',
      'النظام محمي ضد محاولات التخمين المتكررة (Rate Limiting).',
    ],
  },
  {
    id: 1,
    durationSec: 13,
    timeRange: '00:12 - 00:25',
    title: 'المشهد 2: لوحة القيادة والمراقبة اللحظية للمدير',
    subtitle: 'Executive Overview & Real-Time SSE Sync',
    narration:
      'فور دخول مدير النظام، تظهر لوحة القيادة التنفيذية التي تعرض خمسة مؤشرات رئيسية، مع جدول المراقبة اللحظية الذي يحدث نسب إنجاز جميع الموظفين تلقائياً في نفس اللحظة دون الحاجة لتحديث الصفحة.',
    tips: [
      'اللون الأخضر في المؤشرات يدل على المهام المعتمدة، والبرتقالي للمهام بانتظار المراجعة.',
      'جميع التعديلات تظهر فوراً بفضل تقنية البث اللحظي Real-Time SSE.',
    ],
  },
  {
    id: 2,
    durationSec: 14,
    timeRange: '00:25 - 00:39',
    title: 'المشهد 3: إضافة موظف جديد وتوليد بيانات دخوله',
    subtitle: 'Admin-Controlled Employee Provisioning',
    narration:
      'لإضافة موظف جديد، يضغط المدير على زر Add Employee، ويدخل الاسم والبريد الإلكتروني والقسم والمسمى الوظيفي، ثم يولد كلمة مرور قوية بضغطة زر ويحفظ الحساب ليظهر الموظف فوراً في الدليل.',
    tips: [
      'لا يوجد تسجيل عشوائي؛ المدير وحده من ينشئ الحسابات لضمان أمان المؤسسة.',
      'يمكن إيقاف حساب أي موظف مؤقتاً أو أرشفته مع حفظ تاريخه السابق.',
    ],
  },
  {
    id: 3,
    durationSec: 15,
    timeRange: '00:39 - 00:54',
    title: 'المشهد 4: إنشاء المهمة وإسنادها لعدة موظفين بشكل مستقل',
    subtitle: 'Multi-Employee Independent Task Assignment',
    narration:
      'عند إنشاء مهمة جديدة، يحدد المدير العنوان ودرجة الأولوية وتاريخ التسليم، ويمكنه اختيار موظف واحد أو عدة موظفين معاً؛ حيث يحصل كل موظف على نسخة تكليف مستقلة وشريط إنجاز خاص به، مع كون حقل معايير الإنجاز اختيارياً بالكامل.',
    tips: [
      'حقل Completion Criteria اختياري تماماً ولا يمنع إسناد المهمة إذا تُرك فارغاً.',
      'كل موظف يتقدم في المهمة بشكل مستقل دون التأثير على نسبة زملائه.',
    ],
  },
  {
    id: 4,
    durationSec: 15,
    timeRange: '00:54 - 01:09',
    title: 'المشهد 5: مساحة عمل الموظف وتحديث نسبة الإنجاز',
    subtitle: 'Employee Workspace, Progress Slider & Attachments',
    narration:
      'في حساب الموظف، يضغط على Start Task لبدء المهمة، ثم يحرك شريط الإنجاز لتسجيل تقدمه الفعلي مع كتابة ما تم إنجازه وأي معوقات وإرفاق ملفات الإثبات. كل تحديث يُحفظ في سجل تاريخي غير قابل للتلاعب.',
    tips: [
      'يرى الموظف مهامه الخاصة فقط ولا يطلع على مهام الآخرين.',
      'كل تحديث في شريط التقدم يرسل إشعاراً لحظياً لمدير النظام.',
    ],
  },
  {
    id: 5,
    durationSec: 15,
    timeRange: '01:09 - 01:24',
    title: 'المشهد 6: تسليم العمل المكتمل ومراجعة المدير ومنح المكافأة',
    subtitle: '100% Submission, Manager Review & Quality Bonus',
    narration:
      'عند وصول العمل إلى مئة بالمئة، يرسل الموظف المهمة للمراجعة فتتحول إلى Awaiting Review. يفتح المدير نافذة المراجعة، ويعتمد الإنجاز مع منح مكافأة جودة إضافية تصل إلى خمسين نقطة، أو يطلب تعديلات.',
    tips: [
      'لا تُحتسب النقاط في لوحة المتصدرين إلا بعد اعتماد المدير النهائي (Approve).',
      'عند طلب تعديل (Request Revisions) تعود المهمة للموظف مع ملاحظات المدير.',
    ],
  },
  {
    id: 6,
    durationSec: 14,
    timeRange: '01:24 - 01:38',
    title: 'المشهد 7: لوحة المتصدرين وتصدير تقارير Excel وحل المشكلات',
    subtitle: 'Leaderboard Ranking, CSV Export & Troubleshooting',
    narration:
      'بمجرد اعتماد المهمة، تُحسب النقاط تلقائياً وفق معادلة الأولوية والالتزام بالوقت ومكافأة الجودة، ويتحدث ترتيب الموظف في لوحة المتصدرين فوراً، مع إمكانية تصدير تقارير شاملة بصيغة CSV بنقرة واحدة.',
    tips: [
      'المعادلة: (النقاط الأساسية × معامل الأولوية) + مكافأة الوقت + مكافأة الجودة.',
      'يمكن للمدير تعديل أوزان النقاط واسم المؤسسة من صفحة الإعدادات Settings.',
    ],
  },
];

export function InteractiveVideoGuide() {
  const [currentScene, setCurrentScene] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [sceneProgress, setSceneProgress] = useState(0); // 0 to 100 within current scene
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.5 | 2>(1);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeSpec = SCENES[currentScene];

  // Handle Web Speech API Arabic voiceover when enabled
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    if (voiceEnabled && isPlaying) {
      const utterance = new SpeechSynthesisUtterance(activeSpec.narration);
      utterance.lang = 'ar-SA';
      utterance.rate = playbackSpeed === 1 ? 1.0 : playbackSpeed === 1.5 ? 1.2 : 1.35;
      window.speechSynthesis.speak(utterance);
    }

    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [currentScene, voiceEnabled, isPlaying, playbackSpeed, activeSpec.narration]);

  // Scene progression loop
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const tickMs = 80;
    const stepPerTick =
      (100 / ((activeSpec.durationSec * 1000) / tickMs)) * playbackSpeed;

    timerRef.current = setInterval(() => {
      setSceneProgress((prev) => {
        if (prev + stepPerTick >= 100) {
          if (currentScene < SCENES.length - 1) {
            setCurrentScene((s) => s + 1);
            return 0;
          } else {
            setIsPlaying(false);
            return 100;
          }
        }
        return prev + stepPerTick;
      });
    }, tickMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, currentScene, activeSpec.durationSec, playbackSpeed]);

  const selectScene = (idx: number) => {
    setCurrentScene(idx);
    setSceneProgress(0);
    setIsPlaying(true);
  };

  const handleRestart = () => {
    setCurrentScene(0);
    setSceneProgress(0);
    setIsPlaying(true);
  };

  const overallPercentage = Math.round(
    ((currentScene + sceneProgress / 100) / SCENES.length) * 100
  );

  // Derived sub-animations based on sceneProgress (0..100)
  const typedEmail = 'admin@valeo.com'.slice(
    0,
    Math.floor((Math.min(sceneProgress, 45) / 45) * 15)
  );
  const typedPass = '••••••••'.slice(
    0,
    Math.floor((Math.max(0, Math.min(sceneProgress - 35, 35)) / 35) * 8)
  );
  const animatedSliderValue =
    sceneProgress < 30
      ? 20
      : sceneProgress < 65
      ? Math.round(20 + ((sceneProgress - 30) / 35) * 65)
      : 85;

  return (
    <div
      dir="rtl"
      className="no-print bg-slate-900 text-white rounded-xl border border-slate-800 overflow-hidden shadow-lg"
    >
      {/* Top Video Player Header */}
      <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-600 text-white rounded">
                فيديو تفاعلي متحرك
              </span>
              <h2 className="text-sm sm:text-base font-bold text-white">
                العرض التعليمي المتحرك لمنصة VeloPulse (7 مشاهد عملية)
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              شاهد كيف يعمل النظام خطوة بخطوة بالأنيميشن الحي أو تنقل بين المشاهد التفاعلية بالأسفل
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setVoiceEnabled((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
              voiceEnabled
                ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {voiceEnabled ? (
              <Volume2 className="w-3.5 h-3.5" />
            ) : (
              <VolumeX className="w-3.5 h-3.5" />
            )}
            <span>{voiceEnabled ? 'الشرح الصوتي: مفعل' : 'تفعيل الشرح الصوتي'}</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setPlaybackSpeed((s) => (s === 1 ? 1.5 : s === 1.5 ? 2 : 1))
            }
            className="px-2.5 py-1.5 rounded-md text-xs font-mono font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer"
          >
            {playbackSpeed}x
          </button>
        </div>
      </div>

      {/* Main Animated Stage + Live Narration Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[430px]">
        {/* Right Column: Scene Explanation & Subtitles */}
        <div className="lg:col-span-5 p-6 bg-slate-900/90 border-b lg:border-b-0 lg:border-l border-slate-800 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="px-2.5 py-1 rounded bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-mono font-semibold">
                المشهد {currentScene + 1} من {SCENES.length} · {activeSpec.timeRange}
              </span>
              <span className="font-mono text-slate-400">
                {Math.round(sceneProgress)}%
              </span>
            </div>

            <div>
              <h3 className="text-lg font-extrabold text-white leading-snug">
                {activeSpec.title}
              </h3>
              <p className="text-xs font-mono text-indigo-400 mt-1">
                {activeSpec.subtitle}
              </p>
            </div>

            {/* Animated Subtitle Box */}
            <div className="p-4 rounded-lg bg-slate-950/90 border border-slate-800 text-xs sm:text-sm text-slate-200 leading-relaxed shadow-inner">
              <p>{activeSpec.narration}</p>
            </div>

            {/* Key Takeaways for Current Scene */}
            <div className="space-y-2 pt-1">
              <p className="text-xs font-bold text-slate-400">
                ملاحظات هامة في هذه الخطوة:
              </p>
              {activeSpec.tips.map((tip, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-xs text-slate-300 bg-slate-800/50 p-2.5 rounded border border-slate-700/60"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Scene Quick Prev/Next */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button
              type="button"
              disabled={currentScene === 0}
              onClick={() => selectScene(Math.max(0, currentScene - 1))}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
              <span>المشهد السابق</span>
            </button>

            <button
              type="button"
              disabled={currentScene === SCENES.length - 1}
              onClick={() =>
                selectScene(Math.min(SCENES.length - 1, currentScene + 1))
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-medium cursor-pointer"
            >
              <span>المشهد التالي</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Left Column: Live Animated Application Canvas */}
        <div
          dir="ltr"
          className="lg:col-span-7 p-6 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/40 flex items-center justify-center relative overflow-hidden text-left"
        >
          {/* SCENE 0: ANIMATED LOGIN */}
          {currentScene === 0 && (
            <div className="w-full max-w-md bg-white text-slate-900 rounded-lg border border-slate-200 p-6 shadow-2xl relative transition-all duration-500">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                <span className="text-sm font-bold text-slate-900">VeloPulse</span>
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[11px] font-semibold">
                  العربية / English
                </span>
              </div>
              <p className="text-base font-bold text-center text-slate-900">
                Sign In to Workspace
              </p>
              <p className="text-xs text-slate-500 text-center mb-4">
                Enter your email and password to sign in
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-700 mb-1">
                    Work Email Address
                  </label>
                  <div className="px-3 py-2 border-2 border-indigo-600 rounded text-xs font-mono bg-indigo-50/20 flex items-center justify-between">
                    <span>{typedEmail || 'admin@valeo.com'}</span>
                    <span className="w-0.5 h-4 bg-indigo-600 animate-pulse" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-700 mb-1">
                    Password
                  </label>
                  <div className="px-3 py-2 border border-slate-300 rounded text-xs font-mono bg-slate-50">
                    {typedPass || '••••••••'}
                  </div>
                </div>

                <div
                  className={`py-2.5 px-4 rounded text-xs font-bold text-center text-white transition-all duration-300 ${
                    sceneProgress > 72
                      ? 'bg-emerald-600 scale-[0.98]'
                      : 'bg-indigo-700'
                  }`}
                >
                  {sceneProgress > 72
                    ? '✓ Authenticated! Loading Workspace...'
                    : 'Sign In to Workspace →'}
                </div>
              </div>

              {/* Animated Mouse Cursor */}
              <div
                style={{
                  transform:
                    sceneProgress < 40
                      ? 'translate(220px, -95px)'
                      : sceneProgress < 70
                      ? 'translate(220px, -45px)'
                      : 'translate(180px, -8px)',
                }}
                className="transition-transform duration-500 pointer-events-none"
              >
                <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-900 text-white text-[10px] rounded-full shadow-lg">
                  <MousePointer className="w-3 h-3 text-indigo-400" />
                  <span>Admin</span>
                </div>
              </div>
            </div>
          )}

          {/* SCENE 1: ANIMATED LIVE DASHBOARD */}
          {currentScene === 1 && (
            <div className="w-full bg-white text-slate-900 rounded-lg border border-slate-200 p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    Operations &amp; Workforce Overview
                  </p>
                  <p className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    <span>Live updates active (Real-Time SSE)</span>
                  </p>
                </div>
                <span className="px-2.5 py-1 bg-indigo-700 text-white text-[11px] font-medium rounded">
                  + Create &amp; Assign Task
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2.5">
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                  <p className="text-[10px] text-slate-500">Active Employees</p>
                  <p className="text-lg font-bold font-mono text-slate-900">14</p>
                </div>
                <div className="p-2.5 bg-indigo-50/60 border border-indigo-200 rounded">
                  <p className="text-[10px] text-indigo-800">In Progress</p>
                  <p className="text-lg font-bold font-mono text-indigo-700">
                    {sceneProgress > 50 ? '10' : '9'}
                  </p>
                </div>
                <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded">
                  <p className="text-[10px] text-amber-800">Awaiting Review</p>
                  <p className="text-lg font-bold font-mono text-amber-700">
                    {sceneProgress > 50 ? '4' : '3'}
                  </p>
                </div>
                <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded">
                  <p className="text-[10px] text-emerald-800">Approved</p>
                  <p className="text-lg font-bold font-mono text-emerald-700">28</p>
                </div>
              </div>

              <div className="border border-slate-200 rounded overflow-hidden text-[11px]">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                  Live Task Assignment &amp; Progress Monitoring
                </div>
                <div className="divide-y divide-slate-100">
                  <div className="p-2.5 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900">Ahmed Hassan</p>
                      <p className="text-[10px] text-slate-500">
                        Cloud SQL Migration
                      </p>
                    </div>
                    <div className="w-36">
                      <div className="flex justify-between text-[10px] font-mono mb-1">
                        <span className="text-indigo-700 font-bold">
                          {sceneProgress > 45 ? '100%' : '75%'}
                        </span>
                        <span>
                          {sceneProgress > 45 ? 'Awaiting Review' : 'In Progress'}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          style={{ width: sceneProgress > 45 ? '100%' : '75%' }}
                          className="h-full bg-indigo-600 transition-all duration-500"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="p-2.5 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900">Nadia Al-Farsi</p>
                      <p className="text-[10px] text-slate-500">
                        Security Audit Verification
                      </p>
                    </div>
                    <div className="w-36">
                      <div className="flex justify-between text-[10px] font-mono mb-1">
                        <span className="text-emerald-700 font-bold">100%</span>
                        <span>Approved</span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className="w-full h-full bg-emerald-600" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SCENE 2: ANIMATED ADD EMPLOYEE */}
          {currentScene === 2 && (
            <div className="w-full max-w-md bg-white text-slate-900 rounded-lg border border-slate-200 p-5 shadow-2xl space-y-3 text-xs">
              <div className="border-b border-slate-200 pb-2 flex items-center justify-between">
                <span className="font-bold text-sm text-slate-900">
                  Generate New Employee Account
                </span>
                <UserPlus className="w-4 h-4 text-indigo-700" />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] text-slate-600 mb-0.5">
                    Full Name *
                  </label>
                  <div className="p-2 border border-indigo-500 bg-indigo-50/20 rounded font-semibold">
                    Omar Al-Masri
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-600 mb-0.5">
                    Employee Email *
                  </label>
                  <div className="p-2 border border-slate-300 bg-slate-50 rounded font-mono text-[11px]">
                    omar@company.com
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="font-bold text-slate-900">
                    Assigned Employee Password *
                  </span>
                  <span className="text-indigo-700 font-semibold">
                    ↻ Generate Random Password
                  </span>
                </div>
                <div className="p-2 bg-white border border-slate-300 rounded font-mono text-indigo-900 font-bold">
                  {sceneProgress > 40 ? 'Vp!8xKm#2026' : 'EmpPass2026!'}
                </div>
              </div>

              <div
                className={`p-2.5 rounded text-center text-white font-semibold transition-all ${
                  sceneProgress > 70 ? 'bg-emerald-600' : 'bg-indigo-700'
                }`}
              >
                {sceneProgress > 70
                  ? '✓ Employee Added Instantly Without Refresh!'
                  : 'Create Employee & Save Credentials'}
              </div>
            </div>
          )}

          {/* SCENE 3: ANIMATED MULTI-EMPLOYEE TASK CREATION */}
          {currentScene === 3 && (
            <div className="w-full max-w-lg bg-white text-slate-900 rounded-lg border border-slate-200 p-5 shadow-2xl space-y-3 text-xs">
              <div className="border-b border-slate-200 pb-2 flex items-center justify-between">
                <span className="font-bold text-sm text-slate-900">
                  Create &amp; Assign Task (Multi-Employee)
                </span>
                <ClipboardList className="w-4 h-4 text-indigo-700" />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[10px] text-slate-600 mb-0.5">
                    Task Title *
                  </label>
                  <div className="p-2 border border-slate-300 rounded bg-slate-50 font-semibold">
                    Deploy Payment Gateway v2
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-600 mb-0.5">
                    Priority *
                  </label>
                  <div className="p-2 border border-red-300 bg-red-50 text-red-800 rounded font-bold">
                    Critical (2.0x)
                  </div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="font-bold text-slate-800">
                    Assign to Employee(s) * ({sceneProgress > 35 ? '2' : '1'}{' '}
                    selected)
                  </span>
                  <span className="text-indigo-700 font-medium">
                    Independent progress per assignee
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 p-2 bg-slate-50 border border-slate-200 rounded">
                  <div className="p-2 rounded border border-indigo-400 bg-indigo-50/80 font-semibold">
                    ☑ Ahmed Hassan (0% → Independent)
                  </div>
                  <div
                    className={`p-2 rounded border transition-all ${
                      sceneProgress > 35
                        ? 'border-indigo-400 bg-indigo-50/80 font-semibold'
                        : 'border-slate-200 bg-white text-slate-500'
                    }`}
                  >
                    {sceneProgress > 35 ? '☑' : '☐'} Omar Al-Masri (0% → Independent)
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-emerald-700 font-semibold mb-0.5">
                  Completion Criteria (Optional — حقل اختياري تماماً)
                </label>
                <div className="p-2 border border-dashed border-slate-300 rounded text-slate-400 text-[11px]">
                  Left blank intentionally — task assigns immediately!
                </div>
              </div>

              <div
                className={`p-2 rounded text-center text-white font-semibold ${
                  sceneProgress > 75 ? 'bg-emerald-600' : 'bg-indigo-700'
                }`}
              >
                {sceneProgress > 75
                  ? '✓ Assigned to 2 Employees Instantly!'
                  : 'Create & Assign Task'}
              </div>
            </div>
          )}

          {/* SCENE 4: ANIMATED EMPLOYEE PROGRESS SLIDER */}
          {currentScene === 4 && (
            <div className="w-full max-w-lg bg-white text-slate-900 rounded-lg border border-slate-200 p-5 shadow-2xl space-y-3.5 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div>
                  <span className="text-[10px] font-bold uppercase text-indigo-700">
                    Employee Workspace · In Progress
                  </span>
                  <h4 className="font-bold text-sm text-slate-900">
                    Deploy Payment Gateway v2
                  </h4>
                </div>
                <span className="font-mono text-sm font-extrabold text-indigo-700">
                  {animatedSliderValue}%
                </span>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded space-y-2">
                <div className="flex justify-between text-[11px] font-semibold">
                  <span>Interactive Progress Slider (0% → 100%)</span>
                  <span className="font-mono text-indigo-700">
                    20% → {animatedSliderValue}%
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${animatedSliderValue}%` }}
                    className="h-full bg-indigo-600 transition-all duration-150"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-600 mb-0.5">
                  Work Completed Since Last Update *
                </label>
                <div className="p-2 border border-slate-300 rounded bg-slate-50 text-[11px]">
                  Integrated webhook signature verification and completed staging tests.
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="inline-flex items-center gap-1 text-[11px] text-indigo-700 font-semibold">
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>Attached: test-evidence.pdf</span>
                </span>
                <span className="px-3 py-1.5 bg-indigo-700 text-white rounded font-semibold">
                  Record Update ({animatedSliderValue}%)
                </span>
              </div>
            </div>
          )}

          {/* SCENE 5: ANIMATED MANAGER COMPLETION REVIEW */}
          {currentScene === 5 && (
            <div className="w-full max-w-lg bg-white text-slate-900 rounded-lg border border-slate-200 p-5 shadow-2xl space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div>
                  <span className="text-[10px] font-bold text-amber-700 uppercase">
                    Status: Awaiting Manager Review (100%)
                  </span>
                  <h4 className="font-bold text-sm text-slate-900">
                    Manager Completion Review — Ahmed Hassan
                  </h4>
                </div>
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] text-slate-600 mb-0.5">
                    Review Decision *
                  </label>
                  <div className="p-2 border-2 border-emerald-600 bg-emerald-50 text-emerald-900 rounded font-bold">
                    ✓ Approve Completion
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-600 mb-0.5">
                    Manager Quality Bonus (0–50 pts)
                  </label>
                  <div className="p-2 border border-indigo-300 bg-indigo-50 text-indigo-900 rounded font-mono font-bold">
                    +{sceneProgress > 40 ? '25' : '20'} Bonus Points
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-600 mb-0.5">
                  Reviewer Notes / Feedback *
                </label>
                <div className="p-2 border border-slate-300 rounded bg-slate-50 text-[11px]">
                  Clean implementation, zero regressions, approved for production.
                </div>
              </div>

              <div
                className={`p-2.5 rounded text-center text-white font-bold transition-all ${
                  sceneProgress > 65 ? 'bg-emerald-600' : 'bg-indigo-700'
                }`}
              >
                {sceneProgress > 65
                  ? '✓ Approved! +250 Total Points Added to Leaderboard'
                  : 'Confirm Approval & Award Points'}
              </div>
            </div>
          )}

          {/* SCENE 6: ANIMATED LEADERBOARD & CSV EXPORT */}
          {currentScene === 6 && (
            <div className="w-full max-w-lg bg-white text-slate-900 rounded-lg border border-slate-200 p-5 shadow-2xl space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  <span className="font-bold text-sm text-slate-900">
                    Employee Leaderboard &amp; CSV Reports
                  </span>
                </div>
                <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded text-[11px] font-semibold">
                  ⬇ Export CSV Report
                </span>
              </div>

              <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded font-mono text-[11px] text-indigo-950 text-center">
                (100 Base × 2.0 Critical) + 25 On-Time + 25 Quality = 250 pts
              </div>

              <div className="divide-y divide-slate-200 border border-slate-200 rounded">
                <div className="p-2.5 flex items-center justify-between bg-amber-50/40">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-amber-400 text-slate-900 font-bold flex items-center justify-center">
                      #1
                    </span>
                    <div>
                      <p className="font-bold text-slate-900">Ahmed Hassan</p>
                      <p className="text-[10px] text-slate-500">
                        100% On-Time · 6 Approved Tasks
                      </p>
                    </div>
                  </div>
                  <span className="font-mono font-extrabold text-sm text-indigo-700">
                    1,145 pts
                  </span>
                </div>

                <div className="p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center">
                      #2
                    </span>
                    <div>
                      <p className="font-bold text-slate-900">Nadia Al-Farsi</p>
                      <p className="text-[10px] text-slate-500">
                        95% On-Time · 5 Approved Tasks
                      </p>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-sm text-slate-800">
                    920 pts
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Interactive Video Timeline & Playback Controls */}
      <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 space-y-3">
        {/* Scene Selector Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-7 gap-1.5">
          {SCENES.map((scene, idx) => {
            const isCurrent = idx === currentScene;
            const isDone = idx < currentScene;
            return (
              <button
                key={scene.id}
                type="button"
                onClick={() => selectScene(idx)}
                className={`p-2 rounded text-right transition-all cursor-pointer border ${
                  isCurrent
                    ? 'bg-indigo-600/30 border-indigo-500 text-white'
                    : isDone
                    ? 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                    : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                  <span>مشهد 0{idx + 1}</span>
                  <span>{isDone ? '✓' : isCurrent ? '●' : ''}</span>
                </div>
                <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    style={{
                      width: isDone
                        ? '100%'
                        : isCurrent
                        ? `${sceneProgress}%`
                        : '0%',
                    }}
                    className="h-full bg-indigo-400 transition-all duration-100"
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* Play / Pause / Restart & Overall Progress Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>إيقاف مؤقت (Pause)</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>تشغيل الفيديو (Play)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleRestart}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إعادة من البداية</span>
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
            <span>إجمالي التقدم في العرض: {overallPercentage}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
