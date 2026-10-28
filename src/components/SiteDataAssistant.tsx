import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityLogRecord,
  CurrentUser,
  EmployeeStat,
  EnrichedAssignment,
  SummaryMetrics,
  TaskData,
} from '../types/workspace.ts';
import { isArabicActive } from '../lib/i18n.ts';
import { formatDateShort, formatDateTimeShort } from './StatusIndicators.tsx';
import {
  Bot,
  Database,
  ExternalLink,
  Maximize2,
  Minimize2,
  RefreshCw,
  Send,
  Trash2,
  X,
} from 'lucide-react';

interface SiteDataAssistantProps {
  authToken?: string;
  currentUser: CurrentUser;
  summary: SummaryMetrics;
  employees: EmployeeStat[];
  tasks: TaskData[];
  assignments: EnrichedAssignment[];
  activityLogs: ActivityLogRecord[];
  onRefreshDatabase?: () => Promise<void>;
  onInspectAssignment?: (
    a: EnrichedAssignment,
    mode?: 'update' | 'submit' | 'review' | 'history'
  ) => void;
  onSelectEmployee?: (emp: EmployeeStat) => void;
}

interface AssistantActionLink {
  label: string;
  type: 'assignment' | 'employee';
  assignment?: EnrichedAssignment;
  mode?: 'update' | 'submit' | 'review' | 'history';
  employee?: EmployeeStat;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  bullets?: string[];
  actions?: AssistantActionLink[];
  timestamp: string;
}

/**
 * Normalizes Arabic & English text for high-accuracy NLU matching
 * (supports Egyptian Arabic, Modern Standard Arabic, common typos, and English).
 */
export function normalizeAssistantQuery(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // strip harakat
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\bاحر\b/g, 'اخر') // common keyboard typo: احر -> اخر
    .replace(/\bتاسكات\b/g, 'مهام')
    .replace(/\bالتاسكات\b/g, 'المهام')
    .replace(/\bتاسك\b/g, 'مهمه')
    .replace(/\bالتاسك\b/g, 'المهمه')
    .replace(/[^\p{L}\p{N}\s@._%-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detects any Egyptian Arabic, Standard Arabic, or English negation in the query.
 * - Matches ANY Egyptian verb negated with م...ش / م...تش (e.g. مكتملتش, مخلصتش, منتهتش, متعملتش, متسلمتش, مبداتش, مخلصش)
 * - Matches negation particles: لسه, مش, لم, لن, غير, بدون, عدم, ما, فاضل, باقي, متبقي, ناقص
 */
export function hasNegationInQuery(normalizedQuery: string): boolean {
  // 1. Any word starting with 'م' and ending with 'ش' (excluding non-negated nouns like ماتش / مرش)
  const words = normalizedQuery.split(' ').filter(Boolean);
  const hasEgyptianMashVerb = words.some(
    (w) =>
      w.length >= 4 &&
      w.startsWith('م') &&
      w.endsWith('ش') &&
      !['ماتش', 'مرش', 'مفارش', 'مفتش'].includes(w)
  );
  if (hasEgyptianMashVerb) return true;

  // 2. Explicit negation & unfinished particles
  return /(^|\s)(لسه|مش|لم|لن|غير|بدون|عدم|ما|فاضل|فاضله|فاضلين|باقي|باقيه|متبقي|متبقيه|ناقص|ناقصه|واقفه|متوقفه|معلق|معلقه|not|never|incomplete|unfinished|remaining|uncompleted|unstarted|pending)(\s|$)/u.test(
    normalizedQuery
  );
}

export function SiteDataAssistant({
  authToken,
  currentUser,
  summary,
  employees,
  tasks,
  assignments,
  activityLogs,
  onRefreshDatabase,
  onInspectAssignment,
  onSelectEmployee,
}: SiteDataAssistantProps) {
  const ar = isArabicActive();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  // Conversational memory: tracks the last employee discussed for pronoun resolution
  const lastEmployeeIdRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const initialGreeting = useMemo<ChatMessage>(
    () => ({
      id: 'welcome-msg',
      sender: 'assistant',
      text: ar
        ? `أهلاً بك يا ${currentUser.fullName}! أنا المساعد الذكي الداخلي للمنصة، متصل مباشرة بقاعدة البيانات الحية.\nيمكنك سؤالي بالعامية أو الفصحى أو الإنجليزية عن الموظفين، المهام المنجزة، المهام اللي لسة مكتملتش، آخر مهمة تم إنجازها، المهام المتأخرة، أو أداء أي موظف بالتحديد.`
        : `Hello ${currentUser.fullName}! I am the built-in Site Data Assistant with direct live access to the workspace database.\nAsk me anything about completed tasks, unfinished tasks, the latest finished task, overdue assignments, pending reviews, leaderboard rankings, or any specific employee.`,
      bullets: ar
        ? [
            'مثال: "إيه هي المهام اللي لسة مكتملتش؟"',
            'مثال: "مين أفضل موظف هذا الشهر؟" ثم "آخر مهمة خلصها كانت إيه؟"',
            'مثال: "مين الموظف اللي خلص التاسكات بتاعته؟"',
            'مثال: "إيه التاسكات المتأخرة أو اللي مستنية مراجعة؟"',
          ]
        : [
            'Example: "Which tasks are not finished yet?"',
            'Example: "Who is the best employee this month?" then "What was the last task he finished?"',
            'Example: "Which employees finished their tasks?"',
            'Example: "Show overdue tasks or tasks awaiting review"',
          ],
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }),
    [ar, currentUser.fullName]
  );

  const [messages, setMessages] = useState<ChatMessage[]>([initialGreeting]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const activeAssignments = useMemo(
    () => assignments.filter((a) => a.status !== 'canceled'),
    [assignments]
  );

  const operationalEmployees = useMemo(() => {
    const nonAdmins = employees.filter(
      (e) =>
        e.accountStatus === 'active' &&
        (e.role === 'employee' || e.totalAssigned > 0)
    );
    return nonAdmins.length > 0
      ? nonAdmins
      : employees.filter((e) => e.accountStatus === 'active');
  }, [employees]);

  // Core local Database Query & Conversational NLU Engine
  const generateDatabaseAnswer = (
    rawQuery: string
  ): Omit<ChatMessage, 'id' | 'sender' | 'timestamp'> => {
    const q = normalizeAssistantQuery(rawQuery);
    const words = q.split(' ').filter(Boolean);

    // -------------------------------------------------------------------------
    // 1. NEGATION & INTENT DETECTION (Morphological negation checked FIRST!)
    // -------------------------------------------------------------------------
    const isNegated = hasNegationInQuery(q);

    const asksNotStarted =
      /(لم تبدا|مبداتش|ما بداتش|لسه مبداش|لسه مبداتش|صفر|0%|not started|unstarted|todo)/u.test(
        q
      );

    // Any negated query about tasks/completion/work is asking for UNFINISHED tasks
    const asksUnfinished =
      isNegated &&
      !asksNotStarted &&
      /(خلص|كمل|مكتمل|تم|انته|منتهي|انجز|سلم|اعتمد|مهمه|مهام|شغل|لسه|فاضل|باقي|متبقي|ناقص|واقفه|معلق|finish|complete|done|task|work|remain|pending)/u.test(
        q
      );

    // Positive completion ONLY matches when there is NO negation in the query!
    const asksCompleted =
      !isNegated &&
      /(^|\s)(خلص|خلصت|خلصها|خلصوا|انهي|انهت|انجز|انجزت|انجزها|مكتمل|مكتمله|اكتمل|اكتملت|معتمد|معتمدة|تمت|تم انجاز|منتهي|منتهيه|100%|100|finished|completed|done|approved)(\s|$)/u.test(
        q
      );

    const asksLatestOrLast =
      /(^|\s)(اخر|احدث|اجدد|last|latest|most recent|newest)(\s|$)/u.test(q);

    const asksOverdue =
      /(متاخر|متاخره|تاخير|فات معاد|تجاوز|مهله|overdue|late|missed|delayed)/u.test(
        q
      );

    const asksReview =
      !isNegated &&
      /(مراجعه|اعتماد|تسليم|مستني|مستنيه|بانتظار|سلم|سلمها|review|submitted|awaiting|pending approval)/u.test(
        q
      );

    const asksInProgress =
      !asksUnfinished &&
      /(شغال|شغاله|جاري|جاريه|قيد التنفيذ|بيعمل|دلوقتي|حاليا|in progress|working on|active|ongoing)/u.test(
        q
      );

    const asksTopOrLeaderboard =
      /(موظف الشهر|اعلي|افضل|اشطر|احسن|الاول|ترتيب|نقاط|متصدر|صداره|top|best|leaderboard|rank|score|winner)/u.test(
        q
      );

    const asksPriority =
      /(عاجل|عاجله|حرج|حرجه|خطير|اولويه عاليه|هام جدا|critical|urgent|high priority)/u.test(
        q
      );

    const asksSummary =
      /(ملخص|احصائيات|تقرير شامل|حاله الموقع|حاله المنصه|كل الداتا|summary|overview|stats|report|status)/u.test(
        q
      );

    const asksRecentActivity =
      /(تحديثات|نشاط|سجل|حركات|activity|logs|updates)/u.test(q) &&
      !asksCompleted &&
      !asksUnfinished;

    const asksEmployeesList =
      /(كل الموظفين|قائمه الموظفين|اسماء الموظفين|عدد الموظفين|مين الموظفين|all employees|staff list|team|who works)/u.test(
        q
      );

    const asksAllTasksList =
      !asksUnfinished &&
      !asksCompleted &&
      /(كل المهام|جميع المهام|قائمه المهام|ايه المهام الموجوده|عدد المهام|all tasks|task list|how many tasks)/u.test(
        q
      );

    // -------------------------------------------------------------------------
    // 2. ENTITY RECOGNITION + CONVERSATIONAL PRONOUN RESOLUTION
    // -------------------------------------------------------------------------
    let matchedEmployee = employees.find((emp) => {
      const normName = normalizeAssistantQuery(emp.fullName);
      const nameParts = normName.split(' ').filter((p) => p.length >= 3);
      if (q.includes(normName)) return true;
      if (emp.email && q.includes(emp.email.toLowerCase())) return true;
      return nameParts.some((part) => words.includes(part));
    });

    // Only resolve pronoun to lastEmployee if the query contains a singular 3rd-person employee pronoun
    // (NOT general plural questions like "ايه هي المهام اللي لسة مكتملتش")
    const usesEmployeePronoun =
      /(^|\s)(خلصها|انجزها|سلمها|مهامه|عنده|بتاعته|نقاطه|تقريره|ادائه|شغله|بدائها|بداها|عملها|مخلصهاش|معملهاش|فاضله|his|her|he|she)(\s|$)/u.test(
        q
      );

    if (!matchedEmployee && usesEmployeePronoun && lastEmployeeIdRef.current) {
      matchedEmployee = employees.find(
        (e) => e.id === lastEmployeeIdRef.current
      );
    }

    if (matchedEmployee) {
      lastEmployeeIdRef.current = matchedEmployee.id;
    }

    // Only match a task by title if the user isn't asking a general plural status question ("ايه هي المهام...")
    const isGeneralPluralTaskQuestion =
      /(ايه هي المهام|ايه المهام|ما هي المهام|كل المهام|جميع المهام|المهام اللي|which tasks|what tasks|what are the tasks)/u.test(
        q
      );

    const matchedTask = !isGeneralPluralTaskQuestion
      ? tasks.find((t) => {
          const normTitle = normalizeAssistantQuery(t.title);
          return normTitle.length >= 3 && q.includes(normTitle);
        })
      : undefined;

    // -------------------------------------------------------------------------
    // CASE 1: UNFINISHED / INCOMPLETE Tasks ("ايه هي المهام اللي لسة مكتملتش" / "المهام اللي مخلصتش")
    // Checked BEFORE everything else so negated queries never fall into completed tasks!
    // -------------------------------------------------------------------------
    if (asksUnfinished) {
      const targetPool = matchedEmployee
        ? activeAssignments.filter((a) => a.employeeId === matchedEmployee!.id)
        : activeAssignments;

      // Any assignment that is NOT approved (including 0% not_started, in_progress, rejected, or awaiting_review)
      const strictlyIncompleteList = targetPool.filter(
        (a) => a.progressPercentage < 100 && a.status !== 'approved'
      );
      const awaitingReviewList = targetPool.filter(
        (a) => a.status === 'awaiting_review'
      );

      if (strictlyIncompleteList.length === 0 && awaitingReviewList.length === 0) {
        return {
          text: ar
            ? matchedEmployee
              ? `ممتاز! الموظف "${matchedEmployee.fullName}" ليس لديه أي مهام غير مكتملة — جميع مهامه المسندة (${targetPool.length}/${targetPool.length}) مكتملة ومعتمدة بنسبة 100%!`
              : `رائع! لا توجد أي مهام غير مكتملة في المنصة حالياً — جميع المهام المسندة (${activeAssignments.length} مهمة) مكتملة ومعتمدة بنسبة 100%!`
            : matchedEmployee
            ? `Great news! "${matchedEmployee.fullName}" has 0 unfinished tasks — all ${targetPool.length} assigned task(s) are 100% completed!`
            : `Great news! There are 0 unfinished tasks in the workspace — all ${activeAssignments.length} assigned task(s) are 100% completed!`,
        };
      }

      const combinedUnfinished = [
        ...strictlyIncompleteList,
        ...awaitingReviewList,
      ];

      return {
        text: ar
          ? matchedEmployee
            ? `يوجد ${strictlyIncompleteList.length} مهمة غير مكتملة للموظف "${matchedEmployee.fullName}" (من إجمالي ${targetPool.length} مهام مسندة إليه):`
            : `يوجد حالياً ${strictlyIncompleteList.length} مهمة غير مكتملة (لم تصل إلى 100% بعد) في قاعدة البيانات من إجمالي ${activeAssignments.length} مهام مسندة:`
          : matchedEmployee
          ? `There are ${strictlyIncompleteList.length} unfinished task(s) for "${matchedEmployee.fullName}" (out of ${targetPool.length} assigned):`
          : `There are currently ${strictlyIncompleteList.length} unfinished task(s) (< 100% progress) out of ${activeAssignments.length} total assignments:`,
        bullets: combinedUnfinished.map((a) => {
          const statusAr =
            a.status === 'not_started'
              ? 'لم تبدأ بعد (0%)'
              : a.status === 'in_progress'
              ? `قيد التنفيذ (${a.progressPercentage}%)`
              : a.status === 'rejected'
              ? `مرفوضة ومطلوب تعديلها (${a.progressPercentage}%)`
              : 'سلمها الموظف 100% وبانتظار اعتماد المدير';
          return ar
            ? `• المهمة: "${a.task?.title}"\n   الموظف المسؤول: ${
                a.employee?.fullName
              } (${a.employee?.department})\n   الحالة والتقدم: ${statusAr} | الأولوية: ${
                a.task?.priority
              } | الموعد النهائي: ${formatDateShort(a.task?.dueDate || null)}${
                a.isOverdue ? ' [متأخرة ⚠️]' : ''
              }`
            : `• Task: "${a.task?.title}"\n   Assignee: ${
                a.employee?.fullName
              } (${a.employee?.department})\n   Progress: ${
                a.progressPercentage
              }% (${a.status}) | Priority: ${
                a.task?.priority
              } | Due: ${formatDateShort(a.task?.dueDate || null)}${
                a.isOverdue ? ' [OVERDUE ⚠️]' : ''
              }`;
        }),
        actions: combinedUnfinished.slice(0, 4).map((a) => ({
          label: ar ? `فتح مهمة: ${a.task?.title}` : `Open: ${a.task?.title}`,
          type: 'assignment',
          assignment: a,
          mode:
            currentUser.role === 'admin' && a.status === 'awaiting_review'
              ? 'review'
              : 'history',
        })),
      };
    }

    // -------------------------------------------------------------------------
    // CASE 2: LAST / LATEST Task ("آخر مهمة خلصها كانت إيه" / "آخر مهمة")
    // -------------------------------------------------------------------------
    if (asksLatestOrLast && (asksCompleted || usesEmployeePronoun || /مهمه|مهام|task/.test(q))) {
      const pool = matchedEmployee
        ? activeAssignments.filter((a) => a.employeeId === matchedEmployee!.id)
        : activeAssignments;

      if (asksCompleted || /خلصها|انجزها|سلمها|اتسلمت|خلصت/.test(q)) {
        const completedPool = pool
          .filter((a) => a.status === 'approved' || a.progressPercentage === 100)
          .sort((a, b) => {
            const tA = new Date(
              a.completedAt || a.submittedAt || a.updatedAt
            ).getTime();
            const tB = new Date(
              b.completedAt || b.submittedAt || b.updatedAt
            ).getTime();
            return tB - tA;
          });

        const latestDone = completedPool[0];
        if (!latestDone) {
          return {
            text: matchedEmployee
              ? ar
                ? `الموظف "${matchedEmployee.fullName}" لم يسلم أي مهمة بنسبة 100% حتى الآن.`
                : `${matchedEmployee.fullName} has not completed any tasks at 100% yet.`
              : ar
              ? 'لا توجد أي مهام مكتملة بنسبة 100% في قاعدة البيانات حتى الآن.'
              : 'There are no 100% completed tasks in the database yet.',
          };
        }

        if (latestDone.employeeId) {
          lastEmployeeIdRef.current = latestDone.employeeId;
        }

        return {
          text: ar
            ? matchedEmployee
              ? `آخر مهمة أنجزها الموظف "${matchedEmployee.fullName}" هي مهمة "${latestDone.task?.title}":`
              : `آخر مهمة تم إنجازها في المنصة هي "${latestDone.task?.title}" بواسطة الموظف "${latestDone.employee?.fullName}":`
            : matchedEmployee
            ? `The last task completed by "${matchedEmployee.fullName}" is "${latestDone.task?.title}":`
            : `The most recently completed task is "${latestDone.task?.title}" by "${latestDone.employee?.fullName}":`,
          bullets: ar
            ? [
                `اسم المهمة: "${latestDone.task?.title}" (القسم: ${latestDone.task?.category || 'عام'} — الأولوية: ${latestDone.task?.priority})`,
                `الموظف المنفذ: ${latestDone.employee?.fullName} (${latestDone.employee?.department})`,
                `نسبة الإنجاز والحالة: ${latestDone.progressPercentage}% — ${
                  latestDone.status === 'approved'
                    ? 'معتمدة رسمياً من المدير ✓'
                    : 'تم تسليمها 100% وبانتظار اعتماد المدير'
                }`,
                `تاريخ الإنجاز/التسليم: ${formatDateTimeShort(
                  latestDone.completedAt ||
                    latestDone.submittedAt ||
                    latestDone.updatedAt
                )}`,
                ...(latestDone.latestNote
                  ? [`ملخص التسليم/الملاحظة: "${latestDone.latestNote}"`]
                  : []),
              ]
            : [
                `Task Title: "${latestDone.task?.title}" (${latestDone.task?.category} — Priority: ${latestDone.task?.priority})`,
                `Completed By: ${latestDone.employee?.fullName} (${latestDone.employee?.department})`,
                `Status: ${latestDone.progressPercentage}% — ${
                  latestDone.status === 'approved'
                    ? 'Manager Approved ✓'
                    : 'Submitted 100% (Awaiting Review)'
                }`,
                `Completion Date: ${formatDateTimeShort(
                  latestDone.completedAt ||
                    latestDone.submittedAt ||
                    latestDone.updatedAt
                )}`,
                ...(latestDone.latestNote
                  ? [`Submission Note: "${latestDone.latestNote}"`]
                  : []),
              ],
          actions: [
            {
              label: ar
                ? `فتح مهمة: ${latestDone.task?.title}`
                : `Open Task: ${latestDone.task?.title}`,
              type: 'assignment',
              assignment: latestDone,
              mode: 'history',
            },
          ],
        };
      }

      const sortedAll = [...pool].sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime()
      );
      const latestAny = sortedAll[0];
      if (latestAny) {
        return {
          text: ar
            ? `أحدث مهمة مسجلة${
                matchedEmployee ? ` للموظف "${matchedEmployee.fullName}"` : ''
              } هي "${latestAny.task?.title}":`
            : `The latest task${
                matchedEmployee ? ` for "${matchedEmployee.fullName}"` : ''
              } is "${latestAny.task?.title}":`,
          bullets: ar
            ? [
                `المهمة: "${latestAny.task?.title}" — المسند إليه: ${latestAny.employee?.fullName}`,
                `نسبة التقدم الحالية: ${latestAny.progressPercentage}% | الموعد النهائي: ${formatDateShort(
                  latestAny.task?.dueDate || null
                )}`,
              ]
            : [
                `Task: "${latestAny.task?.title}" — Assignee: ${latestAny.employee?.fullName}`,
                `Current Progress: ${latestAny.progressPercentage}% | Deadline: ${formatDateShort(
                  latestAny.task?.dueDate || null
                )}`,
              ],
          actions: [
            {
              label: ar
                ? `فتح: ${latestAny.task?.title}`
                : `Open: ${latestAny.task?.title}`,
              type: 'assignment',
              assignment: latestAny,
              mode: 'history',
            },
          ],
        };
      }
    }

    // -------------------------------------------------------------------------
    // CASE 3: Top Performer / Employee of the Month / Leaderboard
    // -------------------------------------------------------------------------
    if (asksTopOrLeaderboard) {
      const ranked = [...operationalEmployees].sort((a, b) => {
        if (b.weightedScore !== a.weightedScore)
          return b.weightedScore - a.weightedScore;
        if (b.approvedCompleted !== a.approvedCompleted)
          return b.approvedCompleted - a.approvedCompleted;
        return b.completionRate - a.completionRate;
      });

      const top = ranked[0];
      if (top) {
        lastEmployeeIdRef.current = top.id;
      }

      return {
        text: ar
          ? top
            ? `متصدر الأداء وموظف الشهر حالياً هو "${top.fullName}" (${top.jobTitle} — ${top.department}) برصيد ${top.weightedScore} نقطة موزونة ومعدل إنجاز ${top.completionRate}%:`
            : 'لا توجد بيانات كافية في لوحة الصدارة حالياً.'
          : top
          ? `The #1 top performer and Employee of the Month is "${top.fullName}" (${top.jobTitle} — ${top.department}) with a weighted score of ${top.weightedScore} pts and ${top.completionRate}% completion rate:`
          : 'No leaderboard rankings available yet.',
        bullets: ranked.slice(0, 5).map((e, idx) =>
          ar
            ? `المركز #${idx + 1}: ${e.fullName} (${e.department}) — النقاط: ${e.weightedScore} | المهام المعتمدة: ${e.approvedCompleted}/${e.totalAssigned} | الالتزام بالمواعيد: ${e.onTimeRate}%`
            : `Rank #${idx + 1}: ${e.fullName} (${e.department}) — Score: ${e.weightedScore} pts | Approved: ${e.approvedCompleted}/${e.totalAssigned} | On-Time: ${e.onTimeRate}%`
        ),
        actions:
          top && onSelectEmployee
            ? [
                {
                  label: ar
                    ? `عرض ملف ${top.fullName}`
                    : `View ${top.fullName}'s Profile`,
                  type: 'employee',
                  employee: top,
                },
              ]
            : [],
      };
    }

    // -------------------------------------------------------------------------
    // CASE 4: User asked about a specific Employee
    // -------------------------------------------------------------------------
    if (matchedEmployee) {
      const empAssignments = activeAssignments.filter(
        (a) => a.employeeId === matchedEmployee!.id
      );
      const completedList = empAssignments.filter(
        (a) => a.status === 'approved' || a.progressPercentage === 100
      );
      const unfinishedList = empAssignments.filter(
        (a) => a.progressPercentage < 100 && a.status !== 'approved'
      );
      const reviewList = empAssignments.filter(
        (a) => a.status === 'awaiting_review'
      );
      const overdueList = empAssignments.filter((a) => a.isOverdue);

      if (asksCompleted) {
        return {
          text: ar
            ? completedList.length > 0
              ? `الموظف "${matchedEmployee.fullName}" (${matchedEmployee.department}) أنجز ${completedList.length} مهمة بنسبة 100% من إجمالي ${empAssignments.length} مهام مسندة إليه:`
              : `الموظف "${matchedEmployee.fullName}" ليس لديه مهام مكتملة بنسبة 100% حتى الآن (لديه ${empAssignments.length} مهام مسندة، ومعدل إنجازه الحالي ${matchedEmployee.completionRate}%).`
            : completedList.length > 0
            ? `${matchedEmployee.fullName} (${matchedEmployee.department}) has completed ${completedList.length} task(s) at 100% out of ${empAssignments.length} assigned:`
            : `${matchedEmployee.fullName} has no 100% completed tasks yet (${empAssignments.length} assigned, current completion rate: ${matchedEmployee.completionRate}%).`,
          bullets: [
            ...completedList.map((a) =>
              ar
                ? `✓ مهمة مكتملة: "${a.task?.title}" — الحالة: ${
                    a.status === 'approved'
                      ? 'معتمدة رسمياً من المدير ✓'
                      : 'تم تسليمها 100% وبانتظار الاعتماد'
                  } — بتاريخ: ${formatDateTimeShort(
                    a.completedAt || a.submittedAt || a.updatedAt
                  )}`
                : `✓ Completed: "${a.task?.title}" — Status: ${
                    a.status === 'approved'
                      ? 'Manager Approved ✓'
                      : 'Submitted at 100% (Awaiting Review)'
                  }`
            ),
            ...unfinishedList.map((a) =>
              ar
                ? `⏳ مهمة متبقية غير مكتملة: "${a.task?.title}" — التقدم الحالي: ${a.progressPercentage}% (${
                    a.status === 'not_started' ? 'لم تبدأ بعد' : 'قيد التنفيذ'
                  })`
                : `⏳ Remaining Unfinished: "${a.task?.title}" — Progress: ${a.progressPercentage}%`
            ),
          ],
          actions: [
            ...(onSelectEmployee
              ? [
                  {
                    label: ar
                      ? `ملف ${matchedEmployee.fullName}`
                      : `View ${matchedEmployee.fullName}`,
                    type: 'employee' as const,
                    employee: matchedEmployee,
                  },
                ]
              : []),
            ...empAssignments.slice(0, 3).map((a) => ({
              label: ar ? `مهمة: ${a.task?.title}` : `Task: ${a.task?.title}`,
              type: 'assignment' as const,
              assignment: a,
              mode: 'history' as const,
            })),
          ],
        };
      }

      return {
        text: ar
          ? `تقرير قاعدة البيانات المباشر للموظف "${matchedEmployee.fullName}" (${matchedEmployee.jobTitle} — ${matchedEmployee.department}):`
          : `Live database profile for "${matchedEmployee.fullName}" (${matchedEmployee.jobTitle} — ${matchedEmployee.department}):`,
        bullets: ar
          ? [
              `إجمالي المهام المسندة: ${matchedEmployee.totalAssigned} مهمة`,
              `المهام المكتملة (100%): ${completedList.length} (منها ${matchedEmployee.approvedCompleted} معتمدة، و${reviewList.length} بانتظار المراجعة)`,
              `المهام غير المكتملة (اللي لسة مخلصتش): ${unfinishedList.length} مهمة`,
              `المهام المتأخرة: ${overdueList.length} | معدل الإنجاز: ${matchedEmployee.completionRate}% | النقاط: ${matchedEmployee.weightedScore}`,
              ...empAssignments.map(
                (a) =>
                  `▸ مهمة "${a.task?.title}": التقدم ${a.progressPercentage}% (${
                    a.status === 'approved'
                      ? 'معتمدة ✓'
                      : a.status === 'awaiting_review'
                      ? 'بانتظار المراجعة'
                      : a.status === 'in_progress'
                      ? 'قيد التنفيذ'
                      : 'لم تبدأ بعد 0%'
                  })`
              ),
            ]
          : [
              `Total Assigned Tasks: ${matchedEmployee.totalAssigned}`,
              `Completed (100%): ${completedList.length} (${matchedEmployee.approvedCompleted} approved, ${reviewList.length} awaiting review)`,
              `Unfinished Tasks: ${unfinishedList.length}`,
              `Overdue: ${overdueList.length} | Completion Rate: ${matchedEmployee.completionRate}% | Score: ${matchedEmployee.weightedScore} pts`,
              ...empAssignments.map(
                (a) =>
                  `▸ "${a.task?.title}": ${a.progressPercentage}% (${a.status})`
              ),
            ],
        actions: [
          ...(onSelectEmployee
            ? [
                {
                  label: ar
                    ? `فتح ملف ${matchedEmployee.fullName}`
                    : `Open ${matchedEmployee.fullName}'s Profile`,
                  type: 'employee' as const,
                  employee: matchedEmployee,
                },
              ]
            : []),
          ...empAssignments.slice(0, 3).map((a) => ({
            label: ar ? `عرض: ${a.task?.title}` : `Inspect: ${a.task?.title}`,
            type: 'assignment' as const,
            assignment: a,
            mode: 'history' as const,
          })),
        ],
      };
    }

    // -------------------------------------------------------------------------
    // CASE 5: User asked about a specific Task by title
    // -------------------------------------------------------------------------
    if (matchedTask) {
      const taskAssigns = activeAssignments.filter(
        (a) => a.taskId === matchedTask.id
      );
      return {
        text: ar
          ? `تفاصيل المهمة "${matchedTask.title}" من قاعدة البيانات:`
          : `Database details for task "${matchedTask.title}":`,
        bullets: ar
          ? [
              `الأولوية: ${matchedTask.priority} | القسم: ${matchedTask.category}`,
              `تاريخ البدء: ${formatDateShort(matchedTask.startDate)} | الموعد النهائي: ${formatDateShort(matchedTask.dueDate)}`,
              `عدد الموظفين المسندة إليهم: ${taskAssigns.length}`,
              ...taskAssigns.map(
                (a) =>
                  `• الموظف: ${a.employee?.fullName} — نسبة الإنجاز: ${a.progressPercentage}% (${
                    a.status === 'approved'
                      ? 'معتمدة ✓'
                      : a.status === 'awaiting_review'
                      ? 'تم التسليم 100% وبانتظار المراجعة'
                      : a.status === 'in_progress'
                      ? 'قيد التنفيذ'
                      : 'لم تبدأ'
                  })${a.latestNote ? ` — آخر ملاحظة: "${a.latestNote}"` : ''}`
              ),
            ]
          : [
              `Priority: ${matchedTask.priority} | Category: ${matchedTask.category}`,
              `Start Date: ${formatDateShort(matchedTask.startDate)} | Deadline: ${formatDateShort(matchedTask.dueDate)}`,
              `Assigned Employees: ${taskAssigns.length}`,
              ...taskAssigns.map(
                (a) =>
                  `• ${a.employee?.fullName} — Progress: ${a.progressPercentage}% (${a.status})${
                    a.latestNote ? ` — Note: "${a.latestNote}"` : ''
                  }`
              ),
            ],
        actions: taskAssigns.slice(0, 4).map((a) => ({
          label: ar
            ? `فتح تسليم ${a.employee?.fullName}`
            : `Open ${a.employee?.fullName}'s Assignment`,
          type: 'assignment' as const,
          assignment: a,
          mode:
            currentUser.role === 'admin' && a.status === 'awaiting_review'
              ? ('review' as const)
              : ('history' as const),
        })),
      };
    }

    // -------------------------------------------------------------------------
    // CASE 6: Completed Tasks ("مين الموظف اللي خلص التاسكات بتاعته" / "المهام المكتملة")
    // -------------------------------------------------------------------------
    if (asksCompleted) {
      const completedAssignments = activeAssignments.filter(
        (a) => a.status === 'approved' || a.progressPercentage === 100
      );

      const employeeCompletionSummary = employees
        .filter((e) => e.accountStatus === 'active')
        .map((emp) => {
          const empAssigns = activeAssignments.filter(
            (a) => a.employeeId === emp.id
          );
          const empDone = empAssigns.filter(
            (a) => a.status === 'approved' || a.progressPercentage === 100
          );
          const empUnfinished = empAssigns.filter(
            (a) => a.progressPercentage < 100 && a.status !== 'approved'
          );
          return {
            emp,
            total: empAssigns.length,
            doneCount: empDone.length,
            doneTasks: empDone,
            unfinishedTasks: empUnfinished,
            allFinished:
              empAssigns.length > 0 && empDone.length === empAssigns.length,
          };
        })
        .filter((item) => item.doneCount > 0)
        .sort((a, b) => b.doneCount - a.doneCount);

      if (employeeCompletionSummary.length > 0) {
        lastEmployeeIdRef.current = employeeCompletionSummary[0].emp.id;
      }

      if (employeeCompletionSummary.length === 0) {
        return {
          text: ar
            ? 'وفقاً لقاعدة البيانات الحالية، لا توجد مهام مكتملة بنسبة 100% حتى اللحظة. إليك حالة المهام الجارية حالياً:'
            : 'According to the live database, no assignments have reached 100% completion yet. Here is the current active progress:',
          bullets: activeAssignments.slice(0, 6).map((a) =>
            ar
              ? `• ${a.employee?.fullName} — مهمة "${a.task?.title}": التقدم الحالي ${a.progressPercentage}%`
              : `• ${a.employee?.fullName} — "${a.task?.title}": ${a.progressPercentage}% progress`
          ),
        };
      }

      const fullyFinishedEmps = employeeCompletionSummary.filter(
        (x) => x.allFinished
      );

      return {
        text: ar
          ? fullyFinishedEmps.length > 0
            ? `يوجد ${fullyFinishedEmps.length} موظف أنجز جميع مهامه المسندة بالكامل (100%)، وإجمالي المهام المكتملة في المنصة هو ${completedAssignments.length} مهمة:`
            : `إليك قائمة الموظفين الذين أنجزوا مهام بنسبة 100% (إجمالي ${completedAssignments.length} مهمة مكتملة من أصل ${activeAssignments.length} مهام في قاعدة البيانات):`
          : fullyFinishedEmps.length > 0
          ? `${fullyFinishedEmps.length} employee(s) have finished 100% of all their assigned tasks (${completedAssignments.length} completed assignments total):`
          : `Here are the employees who have completed tasks at 100% (${completedAssignments.length} of ${activeAssignments.length} assignments in database):`,
        bullets: employeeCompletionSummary.map((item) => {
          const taskNames = item.doneTasks
            .map(
              (a) =>
                `"${a.task?.title}" (${
                  a.status === 'approved'
                    ? ar
                      ? 'معتمدة ✓'
                      : 'Approved ✓'
                    : ar
                    ? 'بانتظار الاعتماد'
                    : 'Awaiting Review'
                })`
            )
            .join(' ، ');
          const remainingNames =
            item.unfinishedTasks.length > 0
              ? item.unfinishedTasks
                  .map((a) => `"${a.task?.title}" (${a.progressPercentage}%)`)
                  .join(' ، ')
              : '';
          return ar
            ? `• ${item.emp.fullName} (${item.emp.department}): أنجز ${item.doneCount} من أصل ${item.total} مهام ${
                item.allFinished ? '— [أنهى جميع مهامه بالكامل ⭐]' : ''
              }\n   ✓ المهام المكتملة: ${taskNames}${
                remainingNames
                  ? `\n   ⏳ المهام المتبقية غير المكتملة: ${remainingNames}`
                  : ''
              }`
            : `• ${item.emp.fullName} (${item.emp.department}): Completed ${item.doneCount} of ${item.total} tasks ${
                item.allFinished ? '— [All Assigned Tasks Finished ⭐]' : ''
              }\n   ✓ Completed: ${taskNames}${
                remainingNames ? `\n   ⏳ Remaining Unfinished: ${remainingNames}` : ''
              }`;
        }),
        actions: [
          ...employeeCompletionSummary.slice(0, 3).map((item) => ({
            label: ar
              ? `ملف ${item.emp.fullName}`
              : `${item.emp.fullName}'s Profile`,
            type: 'employee' as const,
            employee: item.emp,
          })),
          ...completedAssignments.slice(0, 3).map((a) => ({
            label: ar ? `مهمة: ${a.task?.title}` : `Task: ${a.task?.title}`,
            type: 'assignment' as const,
            assignment: a,
            mode:
              currentUser.role === 'admin' && a.status === 'awaiting_review'
                ? ('review' as const)
                : ('history' as const),
          })),
        ],
      };
    }

    // -------------------------------------------------------------------------
    // CASE 7: Tasks Awaiting Manager Review ("المهام اللي مستنية مراجعة")
    // -------------------------------------------------------------------------
    if (asksReview) {
      const reviewList = activeAssignments.filter(
        (a) => a.status === 'awaiting_review'
      );
      if (reviewList.length === 0) {
        return {
          text: ar
            ? 'لا توجد حالياً أي مهام معلقة بانتظار مراجعة أو اعتماد المدير. جميع التسليمات السابقة تمت مراجعتها!'
            : 'There are currently 0 submissions awaiting manager review. All submitted tasks have been processed!',
        };
      }
      return {
        text: ar
          ? `يوجد حالياً ${reviewList.length} مهمة تم تسليمها بنسبة 100% من الموظفين وتنتظر مراجعة واعتماد المدير:`
          : `There are currently ${reviewList.length} assignment(s) submitted at 100% awaiting manager review and approval:`,
        bullets: reviewList.map((a) =>
          ar
            ? `• "${a.task?.title}" — سلّمها الموظف: ${a.employee?.fullName} (${a.employee?.department}) بتاريخ ${formatDateTimeShort(a.submittedAt)}${
                a.latestNote ? ` — الملخص: "${a.latestNote}"` : ''
              }`
            : `• "${a.task?.title}" — Submitted by ${a.employee?.fullName} (${a.employee?.department}) on ${formatDateTimeShort(a.submittedAt)}${
                a.latestNote ? ` — Note: "${a.latestNote}"` : ''
              }`
        ),
        actions: reviewList.slice(0, 4).map((a) => ({
          label: ar
            ? `مراجعة: ${a.task?.title}`
            : `Review: ${a.task?.title}`,
          type: 'assignment' as const,
          assignment: a,
          mode:
            currentUser.role === 'admin'
              ? ('review' as const)
              : ('history' as const),
        })),
      };
    }

    // -------------------------------------------------------------------------
    // CASE 8: Overdue Tasks ("التاسكات المتأخرة")
    // -------------------------------------------------------------------------
    if (asksOverdue) {
      const overdueList = activeAssignments.filter((a) => a.isOverdue);
      if (overdueList.length === 0) {
        return {
          text: ar
            ? 'ممتاز! لا توجد أي مهام متأخرة عن موعدها النهائي في قاعدة البيانات حالياً (عدد المهام المتأخرة: 0).'
            : 'Great news! There are currently 0 overdue tasks in the database.',
        };
      }
      return {
        text: ar
          ? `تنبيه: يوجد ${overdueList.length} مهمة متأخرة تجاوزت الموعد النهائي للتسليم ولم تُعتمد بعد:`
          : `Alert: There are ${overdueList.length} overdue assignment(s) past their deadline:`,
        bullets: overdueList.map((a) =>
          ar
            ? `• "${a.task?.title}" — المسند إليه: ${a.employee?.fullName} | الموعد النهائي كان: ${formatDateShort(
                a.task?.dueDate || null
              )} | التقدم الحالي: ${a.progressPercentage}%`
            : `• "${a.task?.title}" — Assignee: ${a.employee?.fullName} | Due Date: ${formatDateShort(
                a.task?.dueDate || null
              )} | Progress: ${a.progressPercentage}%`
        ),
        actions: overdueList.slice(0, 4).map((a) => ({
          label: ar ? `فتح: ${a.task?.title}` : `Open: ${a.task?.title}`,
          type: 'assignment' as const,
          assignment: a,
          mode: 'history' as const,
        })),
      };
    }

    // -------------------------------------------------------------------------
    // CASE 9: In Progress Tasks ("التاسكات اللي شغالة دلوقتي")
    // -------------------------------------------------------------------------
    if (asksInProgress) {
      const inProgList = activeAssignments.filter(
        (a) => a.status === 'in_progress'
      );
      if (inProgList.length === 0) {
        const notStartedList = activeAssignments.filter(
          (a) => a.status === 'not_started'
        );
        return {
          text: ar
            ? `لا توجد مهام في حالة "قيد التنفيذ" حالياً، ولكن يوجد ${notStartedList.length} مهمة مسندة لم يبدأ العمل عليها بعد (0%):`
            : `There are currently 0 tasks with status "In Progress", and ${notStartedList.length} task(s) in "Not Started" (0%) status:`,
          bullets: notStartedList.map((a) =>
            ar
              ? `• "${a.task?.title}" — مسندة إلى: ${a.employee?.fullName} — التقدم: 0% (لم تبدأ بعد)`
              : `• "${a.task?.title}" — Assigned to: ${a.employee?.fullName} — Progress: 0% (Not Started)`
          ),
          actions: notStartedList.slice(0, 4).map((a) => ({
            label: ar ? `فتح: ${a.task?.title}` : `Open: ${a.task?.title}`,
            type: 'assignment' as const,
            assignment: a,
            mode: 'history' as const,
          })),
        };
      }
      return {
        text: ar
          ? `يوجد حالياً ${inProgList.length} مهمة قيد التنفيذ الفعلي بواسطة الموظفين:`
          : `There are currently ${inProgList.length} task(s) actively In Progress:`,
        bullets: inProgList.map((a) =>
          ar
            ? `• "${a.task?.title}" — يعمل عليها: ${a.employee?.fullName} (${a.employee?.department}) — نسبة الإنجاز: ${a.progressPercentage}% | الموعد النهائي: ${formatDateShort(
                a.task?.dueDate || null
              )}`
            : `• "${a.task?.title}" — Assignee: ${a.employee?.fullName} (${a.employee?.department}) — Progress: ${a.progressPercentage}% | Due: ${formatDateShort(
                a.task?.dueDate || null
              )}`
        ),
        actions: inProgList.slice(0, 4).map((a) => ({
          label: ar ? `فتح: ${a.task?.title}` : `Open: ${a.task?.title}`,
          type: 'assignment' as const,
          assignment: a,
          mode: 'history' as const,
        })),
      };
    }

    // -------------------------------------------------------------------------
    // CASE 10: Not Started Tasks ("المهام التي لم تبدأ")
    // -------------------------------------------------------------------------
    if (asksNotStarted) {
      const notStartedList = activeAssignments.filter(
        (a) => a.status === 'not_started'
      );
      if (notStartedList.length === 0) {
        return {
          text: ar
            ? 'جميع المهام المسندة تم البدء فيها بالفعل! لا توجد أي مهام متوقفة في حالة "لم تبدأ".'
            : 'All assigned tasks have already been started! There are 0 tasks in "Not Started" status.',
        };
      }
      return {
        text: ar
          ? `يوجد ${notStartedList.length} مهمة مسندة لم يبدأ الموظفون العمل عليها بعد (0%):`
          : `There are ${notStartedList.length} assigned task(s) that have not been started yet (0%):`,
        bullets: notStartedList.map((a) =>
          ar
            ? `• "${a.task?.title}" — مسندة إلى: ${a.employee?.fullName} (${a.employee?.department}) — الموعد النهائي: ${formatDateShort(
                a.task?.dueDate || null
              )}`
            : `• "${a.task?.title}" — Assigned to: ${a.employee?.fullName} (${a.employee?.department}) — Due: ${formatDateShort(
                a.task?.dueDate || null
              )}`
        ),
        actions: notStartedList.slice(0, 4).map((a) => ({
          label: ar ? `فتح: ${a.task?.title}` : `Open: ${a.task?.title}`,
          type: 'assignment' as const,
          assignment: a,
          mode: 'history' as const,
        })),
      };
    }

    // -------------------------------------------------------------------------
    // CASE 11: High / Critical Priority Tasks
    // -------------------------------------------------------------------------
    if (asksPriority) {
      const urgentAssigns = activeAssignments.filter(
        (a) => a.task?.priority === 'Critical' || a.task?.priority === 'High'
      );
      if (urgentAssigns.length === 0) {
        return {
          text: ar
            ? 'لا توجد مهام ذات أولوية حرجة أو عالية حالياً.'
            : 'There are currently no Critical or High priority tasks.',
        };
      }
      return {
        text: ar
          ? `يوجد ${urgentAssigns.length} مهمة ذات أولوية عالية/حرجة:`
          : `There are ${urgentAssigns.length} High/Critical priority assignment(s):`,
        bullets: urgentAssigns.map((a) =>
          ar
            ? `• [${a.task?.priority}] "${a.task?.title}" — المسند إليه: ${a.employee?.fullName} — التقدم: ${a.progressPercentage}%`
            : `• [${a.task?.priority}] "${a.task?.title}" — Assignee: ${a.employee?.fullName} — Progress: ${a.progressPercentage}%`
        ),
      };
    }

    // -------------------------------------------------------------------------
    // CASE 12: All Tasks List ("كل المهام" / "قائمة المهام")
    // -------------------------------------------------------------------------
    if (asksAllTasksList) {
      return {
        text: ar
          ? `إجمالي المهام المسندة في المنصة هو ${activeAssignments.length} مهمة:`
          : `There are ${activeAssignments.length} active task assignment(s) in the platform:`,
        bullets: activeAssignments.map((a) =>
          ar
            ? `• "${a.task?.title}" — الموظف: ${a.employee?.fullName} | التقدم: ${a.progressPercentage}% (${
                a.status === 'approved'
                  ? 'معتمدة ✓'
                  : a.status === 'awaiting_review'
                  ? 'بانتظار المراجعة'
                  : a.status === 'in_progress'
                  ? 'قيد التنفيذ'
                  : 'لم تبدأ بعد 0%'
              })`
            : `• "${a.task?.title}" — Assignee: ${a.employee?.fullName} | Progress: ${a.progressPercentage}% (${a.status})`
        ),
        actions: activeAssignments.slice(0, 4).map((a) => ({
          label: ar ? `مهمة: ${a.task?.title}` : `Task: ${a.task?.title}`,
          type: 'assignment',
          assignment: a,
          mode: 'history',
        })),
      };
    }

    // -------------------------------------------------------------------------
    // CASE 13: All Employees List / Staff Directory
    // -------------------------------------------------------------------------
    if (asksEmployeesList) {
      return {
        text: ar
          ? `يوجد في قاعدة البيانات ${operationalEmployees.length} موظف تشغيلي نشط:`
          : `There are ${operationalEmployees.length} active operational staff in the database:`,
        bullets: operationalEmployees.map((e) =>
          ar
            ? `• ${e.fullName} (${e.jobTitle} — ${e.department}) — المهام المسندة: ${e.totalAssigned} | المعتمدة: ${e.approvedCompleted} | النقاط: ${e.weightedScore} | معدل الإنجاز: ${e.completionRate}%`
            : `• ${e.fullName} (${e.jobTitle} — ${e.department}) — Assigned: ${e.totalAssigned} | Approved: ${e.approvedCompleted} | Score: ${e.weightedScore} | Rate: ${e.completionRate}%`
        ),
        actions: onSelectEmployee
          ? operationalEmployees.slice(0, 4).map((e) => ({
              label: e.fullName,
              type: 'employee' as const,
              employee: e,
            }))
          : [],
      };
    }

    // -------------------------------------------------------------------------
    // CASE 14: Recent Activity Logs
    // -------------------------------------------------------------------------
    if (asksRecentActivity) {
      const latestLogs = activityLogs.slice(0, 6);
      return {
        text: ar
          ? `إليك آخر ${latestLogs.length} حركات مسجلة في قاعدة البيانات:`
          : `Here are the latest ${latestLogs.length} recorded events in the database:`,
        bullets: latestLogs.map((log) =>
          ar
            ? `• [${formatDateTimeShort(log.createdAt)}] ${log.actorName}: ${log.action} (${log.entityType})`
            : `• [${formatDateTimeShort(log.createdAt)}] ${log.actorName}: ${log.action} (${log.entityType})`
        ),
      };
    }

    // -------------------------------------------------------------------------
    // CASE 15: General Executive Summary / Smart Fallback
    // -------------------------------------------------------------------------
    const completedAssigns = activeAssignments.filter(
      (a) => a.status === 'approved' || a.progressPercentage === 100
    );
    const unfinishedAssigns = activeAssignments.filter(
      (a) => a.status !== 'approved' && a.progressPercentage < 100
    );

    return {
      text: ar
        ? asksSummary
          ? 'إليك الملخص التنفيذي الشامل المباشر من قاعدة البيانات:'
          : `إليك الإحصائيات الفورية من قاعدة البيانات حول سؤالك ("${rawQuery}"):`
        : asksSummary
        ? 'Here is the live executive summary directly from the database:'
        : `Here is the live database snapshot for your query ("${rawQuery}"):`,
      bullets: ar
        ? [
            `إجمالي المهام المسندة: ${summary.totalAssignedTasks} مهمة (معدل الإنجاز العام: ${summary.overallCompletionRate}%)`,
            `✓ المهام المكتملة (100%): ${completedAssigns.length} مهمة (${completedAssigns.map((a) => `"${a.task?.title}"`).join(' ، ') || 'لا يوجد'})`,
            `⏳ المهام غير المكتملة (اللي لسة مكتملتش): ${unfinishedAssigns.length} مهمة (${unfinishedAssigns.map((a) => `"${a.task?.title}" — ${a.progressPercentage}%`).join(' ، ') || 'لا يوجد'})`,
            `المهام المتأخرة: ${summary.overdueTasks} مهمة`,
            ...operationalEmployees.slice(0, 4).map(
              (e) =>
                `👤 ${e.fullName} (${e.department}): مسند إليه ${e.totalAssigned} مهام — أنجز ${e.approvedCompleted} معتمدة — النقاط: ${e.weightedScore}`
            ),
          ]
        : [
            `Total Assigned Tasks: ${summary.totalAssignedTasks} (Overall Completion Rate: ${summary.overallCompletionRate}%)`,
            `✓ Completed Tasks (100%): ${completedAssigns.length} (${completedAssigns.map((a) => `"${a.task?.title}"`).join(', ') || 'None'})`,
            `⏳ Unfinished Tasks: ${unfinishedAssigns.length} (${unfinishedAssigns.map((a) => `"${a.task?.title}" — ${a.progressPercentage}%`).join(', ') || 'None'})`,
            `Overdue Tasks: ${summary.overdueTasks}`,
            ...operationalEmployees.slice(0, 4).map(
              (e) =>
                `👤 ${e.fullName} (${e.department}): ${e.totalAssigned} assigned — ${e.approvedCompleted} approved — ${e.weightedScore} pts`
            ),
          ],
    };
  };

  const handleSendQuery = async (customQuery?: string) => {
    const queryText = (customQuery ?? input).trim();
    if (!queryText || isThinking) return;

    const nowTime = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: queryText,
      timestamp: nowTime,
    };

    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    if (!customQuery) {
      setInput('');
    }

    const token =
      authToken || localStorage.getItem('velopulse_auth_token') || '';

    if (token) {
      setIsThinking(true);
      try {
        const res = await fetch('/api/assistant/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: queryText,
            history: messages.slice(-8).map((m) => ({
              sender: m.sender,
              text: m.text,
              bullets: m.bullets || [],
            })),
            lang: ar ? 'ar' : 'en',
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.reply) {
            const aiActions: AssistantActionLink[] = [];

            if (Array.isArray(data.referencedEmployeeIds)) {
              for (const empId of data.referencedEmployeeIds.slice(0, 3)) {
                const emp = employees.find((e) => e.id === Number(empId));
                if (emp && onSelectEmployee) {
                  lastEmployeeIdRef.current = emp.id;
                  aiActions.push({
                    label: ar ? `ملف ${emp.fullName}` : `${emp.fullName}'s Profile`,
                    type: 'employee',
                    employee: emp,
                  });
                }
              }
            }

            if (Array.isArray(data.referencedAssignmentIds)) {
              for (const assignId of data.referencedAssignmentIds.slice(0, 4)) {
                const foundAssign = activeAssignments.find(
                  (a) => a.id === Number(assignId)
                );
                if (foundAssign) {
                  aiActions.push({
                    label: ar
                      ? `مهمة: ${foundAssign.task?.title}`
                      : `Task: ${foundAssign.task?.title}`,
                    type: 'assignment',
                    assignment: foundAssign,
                    mode:
                      currentUser.role === 'admin' &&
                      foundAssign.status === 'awaiting_review'
                        ? 'review'
                        : 'history',
                  });
                }
              }
            }

            const botMsg: ChatMessage = {
              id: `b-${Date.now() + 1}`,
              sender: 'assistant',
              text: data.reply,
              bullets: Array.isArray(data.bullets) ? data.bullets : [],
              actions: aiActions,
              timestamp: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            };
            setMessages((prev) => [...prev, botMsg]);
            setIsThinking(false);
            return;
          }
        }
      } catch {
        // Fall through to local deterministic NLU engine if network/API is unavailable
      } finally {
        setIsThinking(false);
      }
    }

    // Fallback to local NLU engine if server AI endpoint is unreachable
    const answer = generateDatabaseAnswer(queryText);
    const botMsg: ChatMessage = {
      id: `b-${Date.now() + 1}`,
      sender: 'assistant',
      text: answer.text,
      bullets: answer.bullets,
      actions: answer.actions,
      timestamp: nowTime,
    };

    setMessages((prev) => [...prev, botMsg]);
  };

  const handleRefresh = async () => {
    if (!onRefreshDatabase) return;
    setIsSyncing(true);
    try {
      await onRefreshDatabase();
    } finally {
      setIsSyncing(false);
    }
  };

  const quickPrompts = ar
    ? [
        'إيه هي المهام اللي لسة مكتملتش؟',
        'مين أفضل موظف هذا الشهر؟',
        'آخر مهمة خلصها كانت إيه؟',
        'مين الموظف اللي خلص التاسكات بتاعته؟',
        'إيه المهام اللي مستنية مراجعة المدير؟',
        'إيه التاسكات المتأخرة؟',
      ]
    : [
        'Which tasks are not finished yet?',
        'Who is the best employee this month?',
        'What was the last task he finished?',
        'Who finished their tasks?',
        'Tasks awaiting manager review',
        'Show overdue tasks',
      ];

  return (
    <>
      {/* Floating Launcher Button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2.5 px-4 py-3 rounded-full bg-indigo-950 hover:bg-indigo-900 text-white shadow-xl border border-indigo-400/40 transition-all hover:scale-105 cursor-pointer"
        >
          <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600">
            <Bot className="w-4 h-4 text-white" />
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-indigo-950" />
          </div>
          <div className="text-start">
            <p className="text-xs font-extrabold leading-tight">
              {ar ? 'المساعد الذكي لبيانات الموقع' : 'Site Database AI Assistant'}
            </p>
            <p className="text-[10px] text-indigo-200 leading-tight">
              {ar ? 'متصل بقاعدة البيانات مباشرة' : 'Direct Live DB Access'}
            </p>
          </div>
        </button>
      )}

      {/* Assistant Chat Window */}
      {isOpen && (
        <div
          dir={ar ? 'rtl' : 'ltr'}
          className={`fixed z-50 bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all ${
            isExpanded
              ? 'inset-4 sm:inset-8'
              : 'bottom-4 right-4 w-[calc(100vw-2rem)] sm:w-[440px] h-[600px] max-h-[85vh]'
          }`}
        >
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-indigo-600/90 border border-indigo-400/40 flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs sm:text-sm font-bold truncate">
                    {ar
                      ? 'المساعد الذكي الداخلي للمنصة'
                      : 'Internal Site Data Assistant'}
                  </h3>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    <Database className="w-2.5 h-2.5" />
                    <span>{ar ? 'قاعدة البيانات' : 'Live DB'}</span>
                  </span>
                </div>
                <p className="text-[11px] text-indigo-200 truncate">
                  {ar
                    ? 'محرك ذكي خاص بالموقع يفهم سياق الحوار'
                    : '100% Built-In Context-Aware Engine'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {onRefreshDatabase && (
                <button
                  type="button"
                  onClick={handleRefresh}
                  title={ar ? 'تحديث البيانات من قاعدة البيانات' : 'Sync Live DB'}
                  className="p-1.5 text-indigo-200 hover:text-white hover:bg-white/10 rounded-md cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`}
                  />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  lastEmployeeIdRef.current = null;
                  setMessages([initialGreeting]);
                }}
                title={ar ? 'مسح المحادثة' : 'Clear Chat'}
                className="p-1.5 text-indigo-200 hover:text-white hover:bg-white/10 rounded-md cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsExpanded((v) => !v)}
                title={ar ? 'تكبير / تصغير' : 'Expand / Collapse'}
                className="p-1.5 text-indigo-200 hover:text-white hover:bg-white/10 rounded-md cursor-pointer"
              >
                {isExpanded ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title={ar ? 'إغلاق' : 'Close'}
                className="p-1.5 text-indigo-200 hover:text-white hover:bg-white/10 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Suggestion Chips */}
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto shrink-0">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => handleSendQuery(prompt)}
                className="px-2.5 py-1 text-[11px] font-medium bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 border border-slate-200 hover:border-indigo-300 rounded-full whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Messages Stream */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/50">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${
                  m.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed shadow-xs ${
                    m.sender === 'user'
                      ? 'bg-indigo-700 text-white'
                      : 'bg-white border border-slate-200 text-slate-800'
                  }`}
                >
                  <p className="whitespace-pre-line font-medium">{m.text}</p>

                  {m.bullets && m.bullets.length > 0 && (
                    <ul className="mt-2 space-y-1.5 border-t border-slate-100 pt-2 text-[11px] text-slate-700">
                      {m.bullets.map((b, idx) => (
                        <li
                          key={idx}
                          className="bg-slate-50 px-2.5 py-1.5 rounded-md border border-slate-200/70 whitespace-pre-line"
                        >
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}

                  {m.actions && m.actions.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                      {m.actions.map((act, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            if (
                              act.type === 'assignment' &&
                              act.assignment &&
                              onInspectAssignment
                            ) {
                              onInspectAssignment(act.assignment, act.mode);
                            } else if (
                              act.type === 'employee' &&
                              act.employee &&
                              onSelectEmployee
                            ) {
                              onSelectEmployee(act.employee);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 cursor-pointer"
                        >
                          <span>{act.label}</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 mt-1 px-1">
                  {m.timestamp}
                </span>
              </div>
            ))}
            {isThinking && (
              <div className="flex flex-col items-start">
                <div className="bg-white border border-indigo-200 rounded-xl px-3.5 py-2.5 text-xs text-indigo-800 flex items-center gap-2 shadow-xs">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  <span className="font-medium">
                    {ar
                      ? 'جاري فهم سؤالك وتحليل قاعدة البيانات الحية بذكاء...'
                      : 'Understanding your question and analyzing live database...'}
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendQuery();
            }}
            className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isThinking}
              placeholder={
                ar
                  ? 'اسأل بحرية بأي صيغة (مثال: إيه المهام اللي لسة مكتملتش؟)...'
                  : 'Ask freely in any phrasing (e.g. Which tasks are not finished?)...'
              }
              className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600 disabled:bg-slate-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isThinking}
              className="inline-flex items-center justify-center px-3.5 py-2 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 rounded-lg cursor-pointer shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
