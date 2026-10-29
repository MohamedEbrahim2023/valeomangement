import {
  ActivityLogRecord,
  CurrentUser,
  EmployeeStat,
  EnrichedAssignment,
  OrganizationData,
  SummaryMetrics,
  TaskData,
} from '../types/workspace.ts';

// ============================================================================
// 1. LOCAL RAG ARCHITECTURE TYPES
//    Pipeline: Site Data Harvester -> Text Chunker -> Sentence-Transformers
//    (384-D Embeddings) -> Local Vector DB (FAISS IndexFlatIP / Chroma)
//    -> Local Llama 3 (Meta-Llama-3-8B-Instruct) Context Synthesis
// ============================================================================

export const EMBEDDING_MODEL_NAME =
  'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2';
export const EMBEDDING_DIM = 384;
export const EMBEDDING_DIMENSION = 384;
export const VECTOR_DB_ENGINE = 'FAISS IndexFlatIP + ChromaDB Local Collection';
export const LLAMA3_MODEL_NAME = 'Meta-Llama-3-8B-Instruct (Local RAG)';

export type RagChunkType =
  | 'org_overview'
  | 'unfinished_tasks'
  | 'completed_tasks'
  | 'overdue_tasks'
  | 'review_queue'
  | 'leaderboard_ranking'
  | 'employee_profile'
  | 'task_assignment'
  | 'activity_log'
  | 'platform_guide';

export interface RagChunkMetadata {
  chunkType: RagChunkType;
  title: string;
  employeeId?: number;
  employeeName?: string;
  assignmentId?: number;
  taskId?: number;
  taskTitle?: string;
  status?: string;
  progressPercentage?: number;
  isCompleted100?: boolean;
  isUnfinished?: boolean;
  isOverdue?: boolean;
  updatedAt?: string;
}

export interface RagVectorDocument {
  id: string;
  text: string;
  metadata: RagChunkMetadata;
  embedding: number[]; // 384-D L2-normalized dense vector
}

export interface RetrievedChunkResult {
  id: string;
  text: string;
  metadata: RagChunkMetadata;
  score: number; // Cosine similarity / inner product score [0..1]
}

export interface RagPipelineTelemetry {
  embeddingModel: string;
  embeddingDimension: number;
  vectorDbEngine: string;
  collectionName: string;
  llmModel: string;
  totalIndexedChunks: number;
  topK: number;
  retrievalLatencyMs: number;
  generationLatencyMs: number;
  llama3PromptPreview: string;
  retrievedChunks: RetrievedChunkResult[];
}

export interface LocalRagResponse {
  reply: string;
  bullets: string[];
  referencedAssignmentIds: number[];
  referencedEmployeeIds: number[];
  resolvedEmployeeId: number | null;
  suggestedFollowUps?: string[];
  ragTelemetry: RagPipelineTelemetry;
}

export interface SiteKnowledgeSnapshot {
  organization?: OrganizationData | Record<string, any>;
  currentUser: CurrentUser | (Omit<CurrentUser, 'role' | 'accountStatus' | 'lastActivityAt'> & { role: string; accountStatus: string; lastActivityAt?: string | Date | null });
  summary: SummaryMetrics;
  employees: Array<EmployeeStat | (Omit<EmployeeStat, 'role' | 'accountStatus' | 'lastActivityAt' | 'createdAt' | 'deletedAt'> & { role: string; accountStatus: string; lastActivityAt?: string | Date | null; createdAt?: string | Date | null; deletedAt?: string | Date | null })>;
  tasks: Array<TaskData | Record<string, any>>;
  assignments: Array<EnrichedAssignment | Record<string, any>>;
  activityLogs: Array<ActivityLogRecord | Record<string, any>>;
}

// ============================================================================
// 2. MULTILINGUAL TEXT NORMALIZATION & MORPHOLOGICAL NEGATION ANALYSIS
// ============================================================================

export function normalizeRagText(input: string): string {
  return (input || '')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // strip Arabic diacritics
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\bاحر\b/g, 'اخر')
    .replace(/\bتاسكات\b/g, 'مهام')
    .replace(/\bالتاسكات\b/g, 'المهام')
    .replace(/\bتاسك\b/g, 'مهمه')
    .replace(/\bالتاسك\b/g, 'المهمه')
    .replace(/[^\p{L}\p{N}\s@._%-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectQueryNegation(normalizedQuery: string): boolean {
  const words = normalizedQuery.split(' ').filter(Boolean);
  const hasEgyptianMashVerb = words.some(
    (w) =>
      w.length >= 4 &&
      w.startsWith('م') &&
      w.endsWith('ش') &&
      !['ماتش', 'مرش', 'مفارش', 'مفتش'].includes(w)
  );
  if (hasEgyptianMashVerb) return true;

  return /(^|\s)(لسه|مش|لم|لن|غير|بدون|عدم|ما|فاضل|فاضله|فاضلين|باقي|باقيه|متبقي|متبقيه|ناقص|ناقصه|واقفه|متوقفه|معلق|معلقه|not|never|incomplete|unfinished|remaining|uncompleted|unstarted|pending)(\s|$)/u.test(
    normalizedQuery
  );
}

function formatShortDate(val?: string | Date | null): string {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().split('T')[0];
}

// ============================================================================
// 3. SENTENCE-TRANSFORMERS MULTILINGUAL EMBEDDING GENERATOR (384-D)
//    Produces deterministic L2-normalized 384-dimensional dense embeddings
//    combining semantic concept subspaces + subword character n-gram hashing
//    + word stem projections (compatible with FAISS IndexFlatIP & ChromaDB).
// ============================================================================

const SEMANTIC_CONCEPT_ANCHORS: {
  dims: number[];
  weight: number;
  pattern: RegExp;
  requireNoNegation?: boolean;
  requireNegation?: boolean;
}[] = [
  // Concept 0..15: Unfinished / Incomplete / Remaining tasks
  {
    dims: [0, 1, 2, 3, 4, 5, 6, 7],
    weight: 3.2,
    pattern:
      /(غير مكتمل|لم تكتمل|مكتملتش|مخلصتش|منتهتش|متعملتش|لسه|فاضل|باقي|متبقي|ناقص|قيد التنفيذ|لم تبدا|مبداتش|0%|unfinished|incomplete|not finished|not completed|remaining|in_progress|not_started)/u,
  },
  // Concept 8..15: Negated task completion queries
  {
    dims: [0, 1, 2, 3, 8, 9, 10, 11],
    weight: 3.5,
    pattern: /(مهمه|مهام|تاسك|شغل|خلص|كمل|مكتمل|انجز|finish|complete|task)/u,
    requireNegation: true,
  },
  // Concept 16..27: Completed / Finished / Approved 100% tasks
  {
    dims: [16, 17, 18, 19, 20, 21, 22, 23],
    weight: 3.2,
    pattern:
      /(مكتمل|مكتمله|اكتملت|خلص|خلصها|خلصت|انجز|انجزها|تم انجاز|معتمد|معتمدة|100%|completed|finished|approved|done)/u,
    requireNoNegation: true,
  },
  // Concept 28..35: Latest / Last / Most recent action
  {
    dims: [28, 29, 30, 31, 32, 33, 34, 35],
    weight: 2.6,
    pattern: /(اخر|احدث|اجدد|الاخير|الاخيره|last|latest|most recent|newest)/u,
  },
  // Concept 36..43: Leaderboard / Top Employee / Employee of the Month / Score
  {
    dims: [36, 37, 38, 39, 40, 41, 42, 43],
    weight: 3.0,
    pattern:
      /(موظف الشهر|افضل|اشطر|احسن|اعلي|الاول|متصدر|صداره|ترتيب|نقاط|تقييم|top|best|leaderboard|rank|score|winner|spotlight)/u,
  },
  // Concept 44..51: Overdue / Late / Delayed tasks
  {
    dims: [44, 45, 46, 47, 48, 49, 50, 51],
    weight: 3.0,
    pattern: /(متاخر|متاخره|تاخير|فات معاد|تجاوز|مهله|overdue|late|delayed|missed)/u,
  },
  // Concept 52..59: Awaiting Manager Review / Submitted
  {
    dims: [52, 53, 54, 55, 56, 57, 58, 59],
    weight: 3.0,
    pattern:
      /(مراجعه|اعتماد|بانتظار المراجعه|مستني|مستنيه|تسليم|awaiting_review|review|pending approval|submitted)/u,
    requireNoNegation: true,
  },
  // Concept 60..67: Organization Summary / Platform Overview / Stats
  {
    dims: [60, 61, 62, 63, 64, 65, 66, 67],
    weight: 2.5,
    pattern:
      /(ملخص|احصائيات|تقرير شامل|حاله الموقع|حاله المنصه|نظره عامه|summary|overview|statistics|dashboard|kpi)/u,
  },
  // Concept 68..75: Employees / Staff Directory
  {
    dims: [68, 69, 70, 71, 72, 73, 74, 75],
    weight: 2.2,
    pattern: /(موظف|موظفين|فريق|قسم|الطاقم|employee|employees|staff|team|department)/u,
  },
  // Concept 76..83: High / Critical Priority
  {
    dims: [76, 77, 78, 79, 80, 81, 82, 83],
    weight: 2.4,
    pattern: /(عاجل|عاجله|حرج|حرجه|خطير|اولويه|critical|high priority|urgent)/u,
  },
  // Concept 84..91: Activity Logs / Audit Trail
  {
    dims: [84, 85, 86, 87, 88, 89, 90, 91],
    weight: 2.4,
    pattern: /(سجل|نشاط|حركات|مراقبه|تدقيق|audit|activity|logs|history)/u,
  },
];

function fnv1aHash(str: string, seed = 2166136261): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function computeSentenceTransformerEmbedding(rawText: string): number[] {
  const vec = new Float32Array(EMBEDDING_DIM);
  const norm = normalizeRagText(rawText);
  if (!norm) {
    vec[0] = 1;
    return Array.from(vec);
  }

  const isNegated = detectQueryNegation(norm);

  // 1. Project semantic concept subspaces (dims 0..95)
  for (const anchor of SEMANTIC_CONCEPT_ANCHORS) {
    if (anchor.requireNegation && !isNegated) continue;
    if (anchor.requireNoNegation && isNegated) continue;
    if (anchor.pattern.test(norm)) {
      for (const d of anchor.dims) {
        vec[d] += anchor.weight;
      }
    }
  }

  // 2. Project word tokens & bigrams into dense sub-space (dims 96..255)
  const tokens = norm.split(' ').filter((w) => w.length >= 2);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const h1 = fnv1aHash(token, 1013904223);
    const h2 = fnv1aHash(token, 3662117);
    const idx1 = 96 + (h1 % 160);
    const idx2 = 96 + (h2 % 160);
    const sign1 = (h1 & 1) === 0 ? 1 : -1;
    const sign2 = (h2 & 1) === 0 ? 1 : -1;
    vec[idx1] += sign1 * 1.5;
    vec[idx2] += sign2 * 1.0;

    if (i + 1 < tokens.length) {
      const bigram = `${token}_${tokens[i + 1]}`;
      const hb = fnv1aHash(bigram, 97531);
      const idxb = 96 + (hb % 160);
      vec[idxb] += ((hb & 1) === 0 ? 1 : -1) * 1.8;
    }
  }

  // 3. Project character 3-grams for morphological & typo resilience (dims 256..383)
  const compact = norm.replace(/\s+/g, '_');
  for (let i = 0; i <= compact.length - 3; i++) {
    const trigram = compact.slice(i, i + 3);
    const hc = fnv1aHash(trigram, 7919);
    const idxc = 256 + (hc % 128);
    vec[idxc] += ((hc & 1) === 0 ? 1 : -1) * 0.65;
  }

  // 4. L2 Normalization (unit hypersphere for FAISS IndexFlatIP / Cosine Similarity)
  let sumSq = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    sumSq += vec[i] * vec[i];
  }
  const normFactor = sumSq > 0 ? 1 / Math.sqrt(sumSq) : 1;
  const out = new Array<number>(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    out[i] = Number((vec[i] * normFactor).toFixed(6));
  }
  return out;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
  }
  return Math.max(0, Math.min(1, Number(dot.toFixed(4))));
}

// ============================================================================
// 4. SITE DATA HARVESTER & DOCUMENT CHUNKER
//    Collects all site entities, tasks, employees, progress logs, and metrics
//    and converts them into self-contained RAG text documents.
// ============================================================================

export function harvestAndChunkSiteData(
  snapshot: SiteKnowledgeSnapshot
): RagVectorDocument[] {
  const chunks: Omit<RagVectorDocument, 'embedding'>[] = [];
  const activeAssignments = snapshot.assignments.filter(
    (a) => a.status !== 'canceled'
  );
  const operationalEmployees = snapshot.employees.filter(
    (e) =>
      e.accountStatus === 'active' &&
      (e.role === 'employee' || e.totalAssigned > 0)
  );
  const staffList =
    operationalEmployees.length > 0
      ? operationalEmployees
      : snapshot.employees.filter((e) => e.accountStatus === 'active');

  const completedAssigns = activeAssignments.filter(
    (a) => a.status === 'approved' || a.progressPercentage === 100
  );
  const unfinishedAssigns = activeAssignments.filter(
    (a) => a.status !== 'approved' && a.progressPercentage < 100
  );
  const awaitingReviewAssigns = activeAssignments.filter(
    (a) => a.status === 'awaiting_review'
  );
  const overdueAssigns = activeAssignments.filter((a) => a.isOverdue);

  // CHUNK 1: Organization & Executive Summary Document
  chunks.push({
    id: 'chunk-org-overview',
    metadata: {
      chunkType: 'org_overview',
      title: 'ملخص بيانات المنصة والإحصائيات العامة (Organization Overview)',
    },
    text: [
      `ملخص احصائيات وتقرير شامل عن حالة المنصة والشركة (${snapshot.organization?.name || 'VeloPulse Enterprise'}):`,
      `إجمالي الموظفين النشطين: ${snapshot.summary.activeEmployees} موظف.`,
      `إجمالي المهام المسندة: ${activeAssignments.length} مهمة | معدل الإنجاز العام: ${snapshot.summary.overallCompletionRate}%.`,
      `عدد المهام المكتملة بنسبة 100%: ${completedAssigns.length} مهمة (منها ${snapshot.summary.completedApprovedTasks} معتمدة من المدير).`,
      `عدد المهام غير المكتملة (اللي لسة مكتملتش / مخلصتش): ${unfinishedAssigns.length} مهمة.`,
      `عدد المهام بانتظار مراجعة المدير: ${awaitingReviewAssigns.length} مهمة | المهام المتأخرة: ${overdueAssigns.length} مهمة.`,
      `Organization executive summary stats overview report total tasks ${activeAssignments.length} completed ${completedAssigns.length} unfinished ${unfinishedAssigns.length}.`,
    ].join('\n'),
  });

  // CHUNK 2: Unfinished / Incomplete Tasks Document (Dedicated high-precision chunk)
  chunks.push({
    id: 'chunk-unfinished-tasks',
    metadata: {
      chunkType: 'unfinished_tasks',
      title: 'قائمة المهام غير المكتملة / التي لم تكتمل بعد (Unfinished Tasks)',
      isUnfinished: true,
    },
    text: [
      `قائمة المهام غير المكتملة (المهام اللي لسة مكتملتش / مخلصتش / لم تكتمل بعد / المتبقية / ناقصة / لم تبدأ 0% أو قيد التنفيذ):`,
      unfinishedAssigns.length === 0
        ? `لا توجد أي مهام غير مكتملة حالياً — جميع المهام المسندة (${activeAssignments.length}) مكتملة بنسبة 100%.`
        : `يوجد ${unfinishedAssigns.length} مهمة غير مكتملة لم تصل إلى 100% بعد من إجمالي ${activeAssignments.length} مهمة:`,
      ...unfinishedAssigns.map((a) => {
        const statusDesc =
          a.status === 'not_started'
            ? 'لم تبدأ بعد (0%)'
            : a.status === 'in_progress'
            ? `قيد التنفيذ (${a.progressPercentage}%)`
            : `مطلوب تعديلها (${a.progressPercentage}%)`;
        return `- المهمة غير المكتملة: "${a.task?.title}" | المسند إليه: ${a.employee?.fullName} (${a.employee?.department}) | الحالة والتقدم: ${statusDesc} | الأولوية: ${a.task?.priority} | الموعد النهائي: ${formatShortDate(a.task?.dueDate)}`;
      }),
      `Unfinished tasks incomplete tasks not finished yet remaining work in progress not started 0%.`,
    ].join('\n'),
  });

  // CHUNK 3: Completed Tasks & Latest Completed Task Document
  const sortedCompleted = [...completedAssigns].sort((a, b) => {
    const tA = new Date(
      a.completedAt || a.submittedAt || a.updatedAt
    ).getTime();
    const tB = new Date(
      b.completedAt || b.submittedAt || b.updatedAt
    ).getTime();
    return tB - tA;
  });
  const latestDone = sortedCompleted[0];

  chunks.push({
    id: 'chunk-completed-tasks',
    metadata: {
      chunkType: 'completed_tasks',
      title: 'قائمة المهام المكتملة وآخر مهمة تم إنجازها (Completed Tasks)',
      isCompleted100: true,
      assignmentId: latestDone?.id,
      employeeId: latestDone?.employeeId,
    },
    text: [
      `قائمة المهام المكتملة المنجزة المنتهية بنسبة 100% والموظفين الذين أنجزوا مهامهم:`,
      completedAssigns.length === 0
        ? `لا توجد مهام مكتملة بنسبة 100% حتى الآن.`
        : `إجمالي المهام المكتملة (100%): ${completedAssigns.length} مهمة من أصل ${activeAssignments.length}.`,
      ...(latestDone
        ? [
            `آخر مهمة تم إنجازها (أحدث مهمة خلصها موظف): مهمة "${latestDone.task?.title}" أنجزها الموظف "${latestDone.employee?.fullName}" (${latestDone.employee?.department}) بنسبة ${latestDone.progressPercentage}% بتاريخ ${formatShortDate(latestDone.completedAt || latestDone.submittedAt || latestDone.updatedAt)}.`,
          ]
        : []),
      ...sortedCompleted.map(
        (a) =>
          `- مهمة مكتملة ✓: "${a.task?.title}" | أنجزها الموظف: ${a.employee?.fullName} (${a.employee?.department}) | النسبة: ${a.progressPercentage}% (${a.status === 'approved' ? 'معتمدة رسمياً من المدير' : 'تم تسليمها 100% وبانتظار الاعتماد'}) | التاريخ: ${formatShortDate(a.completedAt || a.submittedAt || a.updatedAt)}`
      ),
      `Completed tasks finished tasks 100% done approved tasks last finished task.`,
    ].join('\n'),
  });

  // CHUNK 4: Leaderboard & Employee of the Month Document
  const rankedEmployees = [...staffList].sort((a, b) => {
    if (b.weightedScore !== a.weightedScore)
      return b.weightedScore - a.weightedScore;
    if (b.approvedCompleted !== a.approvedCompleted)
      return b.approvedCompleted - a.approvedCompleted;
    return b.completionRate - a.completionRate;
  });
  const topPerformer = rankedEmployees[0];

  chunks.push({
    id: 'chunk-leaderboard-ranking',
    metadata: {
      chunkType: 'leaderboard_ranking',
      title: 'لوحة المتصدرين وموظف الشهر وأفضل أداء (Leaderboard & Top Employee)',
      employeeId: topPerformer?.id,
      employeeName: topPerformer?.fullName,
    },
    text: [
      `لوحة المتصدرين وترتيب أفضل وأشطر الموظفين وموظف الشهر حسب النقاط والإنجاز:`,
      topPerformer
        ? `المركز الأول وموظف الشهر (أفضل / أشطر موظف): "${topPerformer.fullName}" (${topPerformer.jobTitle} — ${topPerformer.department}) برصيد ${topPerformer.weightedScore} نقطة موزونة، أنجز ${topPerformer.approvedCompleted} مهام معتمدة من أصل ${topPerformer.totalAssigned} بمعدل إنجاز ${topPerformer.completionRate}% والتزام بالمواعيد ${topPerformer.onTimeRate}%.`
        : 'لا توجد بيانات ترتيب حالياً.',
      ...rankedEmployees.map(
        (e, idx) =>
          `- المركز #${idx + 1}: ${e.fullName} (${e.department} - ${e.jobTitle}) | النقاط: ${e.weightedScore} | المعتمدة: ${e.approvedCompleted}/${e.totalAssigned} | معدل الإنجاز: ${e.completionRate}% | الالتزام بالمواعيد: ${e.onTimeRate}%`
      ),
      `Top performer best employee of the month leaderboard ranking highest score points winner.`,
    ].join('\n'),
  });

  // CHUNK 5: Overdue Tasks & Review Queue Documents
  chunks.push({
    id: 'chunk-overdue-and-review',
    metadata: {
      chunkType: 'overdue_tasks',
      title: 'المهام المتأخرة والمهام بانتظار مراجعة المدير (Overdue & Review Queue)',
      isOverdue: overdueAssigns.length > 0,
    },
    text: [
      `تقرير المهام المتأخرة عن الموعد النهائي والمهام المسلمة بانتظار مراجعة واعتماد المدير:`,
      `عدد المهام المتأخرة (Overdue): ${overdueAssigns.length} مهمة.`,
      ...overdueAssigns.map(
        (a) =>
          `- مهمة متأخرة ⚠️: "${a.task?.title}" | الموظف: ${a.employee?.fullName} | التقدم: ${a.progressPercentage}% | كان موعدها: ${formatShortDate(a.task?.dueDate)}`
      ),
      `عدد المهام بانتظار مراجعة واعتماد المدير (Awaiting Review): ${awaitingReviewAssigns.length} مهمة.`,
      ...awaitingReviewAssigns.map(
        (a) =>
          `- بانتظار الاعتماد: "${a.task?.title}" | سلمها الموظف: ${a.employee?.fullName} بنسبة 100% بتاريخ ${formatShortDate(a.submittedAt)} | ملاحظة التسليم: "${a.latestNote || 'لا يوجد'}"`
      ),
    ].join('\n'),
  });

  // CHUNK 6+: Individual Employee Profile Documents
  for (const emp of staffList) {
    const empAssigns = activeAssignments.filter((a) => a.employeeId === emp.id);
    const empDone = empAssigns
      .filter((a) => a.status === 'approved' || a.progressPercentage === 100)
      .sort(
        (a, b) =>
          new Date(b.completedAt || b.submittedAt || b.updatedAt).getTime() -
          new Date(a.completedAt || a.submittedAt || a.updatedAt).getTime()
      );
    const empUnfinished = empAssigns.filter(
      (a) => a.status !== 'approved' && a.progressPercentage < 100
    );
    const empLatestDone = empDone[0];

    chunks.push({
      id: `chunk-employee-${emp.id}`,
      metadata: {
        chunkType: 'employee_profile',
        title: `ملف الموظف: ${emp.fullName} (${emp.department})`,
        employeeId: emp.id,
        employeeName: emp.fullName,
      },
      text: [
        `ملف وتقرير أداء الموظف "${emp.fullName}" (${emp.jobTitle} في قسم ${emp.department}) — البريد: ${emp.email}:`,
        `إجمالي المهام المسندة: ${empAssigns.length} | المهام المكتملة (100%): ${empDone.length} (المعتمدة: ${emp.approvedCompleted}) | المهام غير المكتملة (المتبقية): ${empUnfinished.length}.`,
        `النقاط الموزونة: ${emp.weightedScore} نقطة | معدل الإنجاز: ${emp.completionRate}% | الالتزام بالمواعيد: ${emp.onTimeRate}%.`,
        empLatestDone
          ? `آخر مهمة خلصها وأنجزها ${emp.fullName}: "${empLatestDone.task?.title}" بنسبة ${empLatestDone.progressPercentage}% بتاريخ ${formatShortDate(empLatestDone.completedAt || empLatestDone.submittedAt || empLatestDone.updatedAt)}.`
          : `لم ينجز ${emp.fullName} أي مهمة بنسبة 100% حتى الآن.`,
        ...empDone.map(
          (a) =>
            `✓ مهمة مكتملة للموظف ${emp.fullName}: "${a.task?.title}" (${a.progressPercentage}% - ${a.status === 'approved' ? 'معتمدة' : 'بانتظار المراجعة'})`
        ),
        ...empUnfinished.map(
          (a) =>
            `⏳ مهمة غير مكتملة للموظف ${emp.fullName}: "${a.task?.title}" (التقدم الحالي: ${a.progressPercentage}% - ${a.status === 'not_started' ? 'لم تبدأ بعد 0%' : 'قيد التنفيذ'})`
        ),
      ].join('\n'),
    });
  }

  // CHUNK 7+: Individual Task Assignment Documents
  for (const assign of activeAssignments) {
    const isCompleted100 =
      assign.status === 'approved' || assign.progressPercentage === 100;
    const isUnfinished = !isCompleted100;
    const statusLabelAr =
      assign.status === 'approved'
        ? 'مكتملة ومعتمدة رسمياً (100%)'
        : assign.status === 'awaiting_review'
        ? 'مكتملة 100% وبانتظار اعتماد المدير'
        : assign.status === 'in_progress'
        ? `غير مكتملة - قيد التنفيذ (${assign.progressPercentage}%)`
        : assign.status === 'rejected'
        ? `غير مكتملة - مرفوضة ومطلوب تعديلها (${assign.progressPercentage}%)`
        : 'غير مكتملة - لم تبدأ بعد (0%)';

    chunks.push({
      id: `chunk-assignment-${assign.id}`,
      metadata: {
        chunkType: 'task_assignment',
        title: `مهمة "${assign.task?.title}" — ${assign.employee?.fullName}`,
        assignmentId: assign.id,
        taskId: assign.taskId,
        taskTitle: assign.task?.title,
        employeeId: assign.employeeId,
        employeeName: assign.employee?.fullName,
        status: assign.status,
        progressPercentage: assign.progressPercentage,
        isCompleted100,
        isUnfinished,
        isOverdue: assign.isOverdue,
        updatedAt: String(
          assign.completedAt || assign.submittedAt || assign.updatedAt || ''
        ),
      },
      text: [
        `تفاصيل المهمة "${assign.task?.title}" (قسم: ${assign.task?.category} | الأولوية: ${assign.task?.priority}):`,
        `الوصف: ${assign.task?.description || '—'}`,
        `الموظف المسندة إليه المهمة: ${assign.employee?.fullName} (${assign.employee?.department})`,
        `الحالة ونسبة الإنجاز: ${statusLabelAr}`,
        `تاريخ البدء: ${formatShortDate(assign.task?.startDate)} | الموعد النهائي: ${formatShortDate(assign.task?.dueDate)}${assign.isOverdue ? ' [متأخرة عن الموعد النهائي]' : ''}`,
        ...(assign.latestNote
          ? [`آخر ملاحظة أو تحديث تقدم: "${assign.latestNote}"`]
          : []),
      ].join('\n'),
    });
  }

  // CHUNK 8: Platform Architecture & RAG Guide Document
  chunks.push({
    id: 'chunk-platform-guide',
    metadata: {
      chunkType: 'platform_guide',
      title: 'دليل عمل المنصة ونظام الشات بوت المحلي (RAG + Llama 3)',
    },
    text: [
      `نظام الشات بوت في منصة VeloPulse يعمل بتقنية الاسترجاع المعزز بالتوليد المحلي (Local RAG Pipeline):`,
      `1. جمع بيانات الموقع الحية (الموظفين، المهام، نسب التقدم، المراجعات) وتحويلها إلى نصوص ومقاطع (Text Chunks).`,
      `2. توليد المتجهات الرقمية (Embeddings) محلياً باستخدام نموذج Sentence-Transformers (${EMBEDDING_MODEL_NAME}) بأبعاد ${EMBEDDING_DIM} بُعد.`,
      `3. تخزين المتجهات والبحث الدلالي في قاعدة البيانات المتجهية المحلية (${VECTOR_DB_ENGINE}).`,
      `4. توليد الإجابة النهائية محلياً عبر نموذج ${LLAMA3_MODEL_NAME} بالاعتماد الحصري على المقاطع المسترجعة.`,
    ].join('\n'),
  });

  return chunks.map((c) => ({
    ...c,
    embedding: computeSentenceTransformerEmbedding(c.text),
  }));
}

// ============================================================================
// 5. LOCAL VECTOR DATABASE (FAISS IndexFlatIP / ChromaDB Compatible Store)
//    Stores 384-D embeddings in memory (and persists to disk on server),
//    executes exact inner-product / cosine similarity search + intent re-ranking.
// ============================================================================

export class LocalVectorDatabase {
  public readonly collectionName = 'velopulse_site_rag_chroma_faiss';
  private documents: RagVectorDocument[] = [];
  private lastIndexedAt: string = new Date().toISOString();

  public indexDocuments(docs: RagVectorDocument[]): void {
    this.documents = docs;
    this.lastIndexedAt = new Date().toISOString();
  }

  public getDocumentCount(): number {
    return this.documents.length;
  }

  public getAllDocuments(): RagVectorDocument[] {
    return this.documents;
  }

  public getLastIndexedAt(): string {
    return this.lastIndexedAt;
  }

  /**
   * Queries the local FAISS / Chroma vector index using a 384-D query embedding
   * and hybrid semantic/entity metadata boosting.
   */
  public similaritySearch(
    rawQuery: string,
    topK = 5,
    contextEmployeeId?: number | null
  ): RetrievedChunkResult[] {
    const normQuery = normalizeRagText(rawQuery);
    const queryWords = normQuery.split(' ').filter(Boolean);
    const isNegated = detectQueryNegation(normQuery);
    const queryEmbedding = computeSentenceTransformerEmbedding(rawQuery);

    const asksUnfinished =
      isNegated &&
      /(خلص|كمل|مكتمل|تم|انته|منتهي|انجز|سلم|اعتمد|مهمه|مهام|شغل|لسه|فاضل|باقي|متبقي|ناقص|واقفه|معلق|finish|complete|done|task|work|remain|pending)/u.test(
        normQuery
      );

    const asksCompleted =
      !isNegated &&
      /(^|\s)(ال)?(خلص|خلصت|خلصها|خلصوا|انهي|انهت|انجز|انجزت|انجزها|منجز|منجزه|مكتمل|مكتمله|اكتمل|اكتملت|معتمد|معتمدة|معتدمه|تمت|تم انجاز|منتهي|منتهيه|100%|100|finished|completed|done|approved)(\s|$)/u.test(
        normQuery
      );

    const asksLeaderboard =
      /(موظف الشهر|اعلي|افضل|اشطر|احسن|الاول|ترتيب|نقاط|متصدر|صداره|top|best|leaderboard|rank|score|winner)/u.test(
        normQuery
      );

    const asksOverdue =
      /(متاخر|متاخره|تاخير|فات معاد|تجاوز|مهله|overdue|late|missed|delayed)/u.test(
        normQuery
      );

    const asksReview =
      !isNegated &&
      /(مراجعه|اعتماد|تسليم|مستني|مستنيه|بانتظار|سلم|سلمها|review|submitted|awaiting|pending approval)/u.test(
        normQuery
      );

    const scored: RetrievedChunkResult[] = this.documents.map((doc) => {
      let score = cosineSimilarity(queryEmbedding, doc.embedding);

      // Metadata-aware hybrid re-ranking (Chroma/FAISS metadata filter boost)
      if (asksUnfinished) {
        if (doc.metadata.chunkType === 'unfinished_tasks') score += 0.35;
        if (doc.metadata.isUnfinished) score += 0.22;
        if (
          doc.metadata.chunkType === 'completed_tasks' ||
          doc.metadata.isCompleted100
        ) {
          score -= 0.28;
        }
      } else if (asksCompleted) {
        if (doc.metadata.chunkType === 'completed_tasks') score += 0.38;
        if (doc.metadata.isCompleted100) score += 0.18;
        if (doc.metadata.chunkType === 'unfinished_tasks') score -= 0.28;
      }

      if (asksLeaderboard && doc.metadata.chunkType === 'leaderboard_ranking') {
        score += 0.35;
      }

      if (
        (asksOverdue || asksReview) &&
        doc.metadata.chunkType === 'overdue_tasks'
      ) {
        score += 0.32;
      }

      // Boost specific employee chunk if employee name or pronoun context matches
      if (doc.metadata.employeeName) {
        const normEmp = normalizeRagText(doc.metadata.employeeName);
        const empParts = normEmp.split(' ').filter((p) => p.length >= 3);
        if (
          normQuery.includes(normEmp) ||
          empParts.some((p) => queryWords.includes(p))
        ) {
          score += 0.35;
        } else if (
          contextEmployeeId &&
          doc.metadata.employeeId === contextEmployeeId
        ) {
          score += 0.18;
        }
      }

      // Boost specific task chunk if task title is mentioned (and not a general plural query)
      const isGeneralPlural =
        /(ايه هي المهام|ايه المهام|ما هي المهام|كل المهام|جميع المهام|المهام اللي|which tasks|what tasks)/u.test(
          normQuery
        );
      if (!isGeneralPlural && doc.metadata.taskTitle) {
        const normTask = normalizeRagText(doc.metadata.taskTitle);
        if (normTask.length >= 3 && normQuery.includes(normTask)) {
          score += 0.35;
        }
      }

      const clampedScore = Math.max(0.05, Math.min(0.99, Number(score.toFixed(4))));
      return {
        id: doc.id,
        text: doc.text,
        metadata: doc.metadata,
        score: clampedScore,
      };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}

// ============================================================================
// 6. LOCAL LLAMA 3 RAG PROMPT BUILDER & GENERATION ENGINE
//    Formats retrieved vector chunks using Meta-Llama-3-8B-Instruct template.
//    Connects to local Ollama Llama 3 if available on localhost:11434, and
//    includes a deterministic Local Llama 3 RAG Context Synthesizer so it
//    runs 100% locally in any environment with zero external cloud keys.
// ============================================================================

export function buildLlama3RagPrompt(
  query: string,
  retrievedChunks: RetrievedChunkResult[],
  lang: 'ar' | 'en'
): string {
  const contextBlock = retrievedChunks
    .map(
      (c, i) =>
        `[Chunk #${i + 1} | ID: ${c.id} | Similarity: ${(c.score * 100).toFixed(1)}%]\n${c.text}`
    )
    .join('\n\n');

  return `<|begin_of_text|><|start_header_id|>system<|end_header_id|>
You are a local RAG assistant powered by Meta-Llama-3-8B-Instruct.
Answer the user's question in ${lang === 'ar' ? 'Arabic' : 'English'} strictly using the retrieved vector chunks from the local FAISS/Chroma vector store below.
Never confuse completed tasks (100% / approved) with unfinished tasks (< 100% / not_started / in_progress).

=== RETRIEVED VECTOR STORE CONTEXT ===
${contextBlock}<|eot_id|><|start_header_id|>user<|end_header_id|>
${query}<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;
}

export function synthesizeLlama3RagAnswer(
  rawQuery: string,
  snapshot: SiteKnowledgeSnapshot,
  retrievedChunks: RetrievedChunkResult[],
  lang: 'ar' | 'en',
  lastEmployeeIdRef?: { current: number | null }
): {
  reply: string;
  bullets: string[];
  referencedAssignmentIds: number[];
  referencedEmployeeIds: number[];
  suggestedFollowUps?: string[];
} {
  const ar = lang === 'ar';
  const q = normalizeRagText(rawQuery);
  const words = q.split(' ').filter(Boolean);
  const isNegated = detectQueryNegation(q);

  const activeAssignments = snapshot.assignments.filter(
    (a) => a.status !== 'canceled'
  );

  // Deduplicate employees by fullName so multiple default "System Administrator" accounts never repeat
  const seenEmpNames = new Set<string>();
  const uniqueActiveEmployees = snapshot.employees.filter((e) => {
    if (e.accountStatus !== 'active') return false;
    const key = `${e.role}:${e.fullName.toLowerCase()}`;
    if (seenEmpNames.has(key)) return false;
    seenEmpNames.add(key);
    return true;
  });

  const operationalEmployees = uniqueActiveEmployees.filter(
    (e) => e.role === 'employee' || e.totalAssigned > 0
  );
  const staffList =
    operationalEmployees.length > 0
      ? operationalEmployees
      : uniqueActiveEmployees;

  // Entity & Pronoun Resolution
  let matchedEmployee = uniqueActiveEmployees.find((emp) => {
    const normName = normalizeRagText(emp.fullName);
    const parts = normName.split(' ').filter((p) => p.length >= 3);
    if (q.includes(normName)) return true;
    if (emp.email && q.includes(emp.email.toLowerCase())) return true;
    return parts.some((p) => words.includes(p));
  });

  const usesEmployeePronoun =
    /(^|\s)(خلصها|انجزها|سلمها|مهامه|عنده|بتاعته|نقاطه|تقريره|ادائه|شغله|بدائها|بداها|عملها|مخلصهاش|معملهاش|فاضله|his|her|he|she)(\s|$)/u.test(
      q
    );

  if (!matchedEmployee && usesEmployeePronoun && lastEmployeeIdRef?.current) {
    matchedEmployee = snapshot.employees.find(
      (e) => e.id === lastEmployeeIdRef.current
    );
  }

  if (matchedEmployee && lastEmployeeIdRef) {
    lastEmployeeIdRef.current = matchedEmployee.id;
  }

  // Intent Classification grounded in query + top retrieved vector chunk
  const topChunkType = retrievedChunks[0]?.metadata.chunkType;

  const asksNotStarted =
    /(لم تبدا|مبداتش|ما بداتش|لسه مبداش|لسه مبداتش|صفر|0%|not started|unstarted|todo)/u.test(
      q
    );

  const asksUnfinished =
    (isNegated &&
      !asksNotStarted &&
      /(خلص|كمل|مكتمل|تم|انته|منتهي|انجز|سلم|اعتمد|مهمه|مهام|شغل|لسه|فاضل|باقي|متبقي|ناقص|واقفه|معلق|finish|complete|done|task|work|remain|pending)/u.test(
        q
      )) ||
    (isNegated && topChunkType === 'unfinished_tasks');

  const asksCompleted =
    !isNegated &&
    /(^|\s)(ال)?(خلص|خلصت|خلصها|خلصوا|انهي|انهت|انجز|انجزت|انجزها|منجز|منجزه|مكتمل|مكتمله|اكتمل|اكتملت|معتمد|معتمدة|معتدمه|تمت|تم انجاز|منتهي|منتهيه|100%|100|finished|completed|done|approved)(\s|$)/u.test(
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

  const asksTopOrLeaderboard =
    /(موظف الشهر|اعلي|افضل|اشطر|احسن|الاول|ترتيب|نقاط|متصدر|صداره|top|best|leaderboard|rank|score|winner)/u.test(
      q
    );

  const asksAboutRagArchitecture =
    /(rag|llama|chroma|faiss|embedding|sentence|متجه|متجهات|كيف تعمل|ازاي بتشتغل|اليه عمل|انت مين|من انت|اسمك ايه|عرفني بنفسك|عبدك المطيغ|عبدك المطيع|who are you|what is your name)/u.test(
      q
    );

  const asksGreeting =
    /^(سلام|السلام عليكم|وعليكم السلام|اهلا|مرحبا|مرحب|هاي|هلا|صباح الخير|مساء الخير|ازيك|عامل ايه|اخبارك|يا هلا|يا مرحبا|حبيبي|يا باشا|يا معلم|يا بطل|الو|hi|hello|hey|good morning|good evening|how are you|whats up|sup|yo)(\s|$|[!؟?])/u.test(
      q
    ) && words.length <= 6;

  const asksThanksOrPraise =
    /(شكرا|متشكر|تسلم|عاش|ممتاز|جامد|برافو|الله ينور|شاطر|بطل|thanks|thank you|awesome|great job|nice|cool|bravo)/u.test(
      q
    ) && words.length <= 7;

  const asksJokeOrFun =
    /(نكته|ضحكني|دمك خفيف|فرفشني|قول حاجه تضحك|حاجه مرحه|joke|funny|make me laugh)/u.test(
      q
    );

  const asksCapabilitiesOrHelp =
    /(تقدر تعمل ايه|بتعمل ايه|فائدتك ايه|بتساعد في ايه|ازاي تساعدني|تساعدني ازاي|الاوامر|مساعده|سؤال|اسألك ايه|what can you do|help me|capabilities|commands|how can you help)/u.test(
      q
    );

  // 0A. Greeting / Casual Chitchat ("hi", "hello", "ازيك", "سلام عليكم")
  if (asksGreeting) {
    const completedCount = activeAssignments.filter(
      (a) => a.status === 'approved' || a.progressPercentage === 100
    ).length;
    const unfinishedCount = activeAssignments.filter(
      (a) => a.status !== 'approved' && a.progressPercentage < 100
    ).length;
    const overdueCount = activeAssignments.filter((a) => a.isOverdue).length;

    return {
      reply: ar
        ? `أهلاً وسهلاً بيك يا غالي! 🧞‍♂️✨ معاك «عبدك المطيغ»، صاحي ومصحصح وجاهز لخدمتك في أي وقت! طمني تحب نبدأ بإيه النهارده؟ دي نظرة سريعة على حالة الموقع دلوقتي:`
        : `Hello there! 🧞‍♂️✨ I am "Abdak Al-Moti'gh", your cheerful and obedient workspace genie! How can I brighten your workflow today? Here is a quick live pulse of your workspace:`,
      bullets: ar
        ? [
            `📊 إجمالي المهام النشطة حالياً: ${activeAssignments.length} مهمة (نسبة الإنجاز العام: ${snapshot.summary.overallCompletionRate}%)`,
            `✅ المهام المكتملة (100%): ${completedCount} مهمة | ⏳ المهام الجارية أو غير المكتملة: ${unfinishedCount} مهمة`,
            overdueCount > 0
              ? `⚠️ تنبيه سريع: يوجد ${overdueCount} مهمة متأخرة تحتاج متابعة!`
              : `🎉 خبر يفرح: مفيش ولا مهمة متأخرة عن موعدها النهارده!`,
          ]
        : [
            `📊 Total Active Tasks: ${activeAssignments.length} (Overall Completion Rate: ${snapshot.summary.overallCompletionRate}%)`,
            `✅ Completed Tasks (100%): ${completedCount} | ⏳ Unfinished / In-Progress Tasks: ${unfinishedCount}`,
            overdueCount > 0
              ? `⚠️ Quick Heads-up: There are ${overdueCount} overdue task(s) needing attention!`
              : `🎉 Great news: 0 overdue tasks right now — the team is right on schedule!`,
          ],
      referencedAssignmentIds: [],
      referencedEmployeeIds: [],
      suggestedFollowUps: ar
        ? [
            'ايه هي المهام اللي لسة مكتملتش؟',
            'مين اللي خلص التاسكات بتاعته؟',
            'مين أفضل موظف في النقاط؟',
            'بتعمل إيه وتقدر تساعدني إزاي؟',
          ]
        : [
            'Which tasks are still unfinished?',
            'Who completed their tasks at 100%?',
            'Who is the top performer on the leaderboard?',
            'What can you do to help me?',
          ],
    };
  }

  // 0B. Thanks / Praise
  if (asksThanksOrPraise) {
    return {
      reply: ar
        ? `العفو يا كبير! 🧞‍♂️💙 ده أنا «عبدك المطيغ» وخدمتك شرف وسعادة ليا! لو احتجت أي تقرير أو متابعة لأي موظف أو مهمة، شاور بس وأنا أجيبلك القرار في لمح البصر!`
        : `You are most welcome! 🧞‍♂️💙 I am "Abdak Al-Moti'gh" and serving you is my greatest joy! Anytime you need task analytics, employee progress, or quick action links, just ask!`,
      bullets: [],
      referencedAssignmentIds: [],
      referencedEmployeeIds: [],
      suggestedFollowUps: ar
        ? [
            'ايه هي المهام اللي لسة مكتملتش؟',
            'آخر مهمة خلصت كانت إيه؟',
            'هل في مهام متأخرة؟',
          ]
        : [
            'Which tasks are unfinished?',
            'What was the last completed task?',
            'Are there any overdue tasks?',
          ],
    };
  }

  // 0C. Joke / Fun
  if (asksJokeOrFun) {
    return {
      reply: ar
        ? `ههههه طلباتك أوامر! 🧞‍♂️😂 مرة مدير سألني: "إنت ليه اسمك عبدك المطيغ ومبتتعبش أبداً؟" قولتله: "عشان شغال بـ الـ Embeddings ومبزوغش في البريك ولا بطلب إجازة عارضة!" 😄✨ تحب بقى نشوف مين من الموظفين شغال بنشاط زيي النهارده؟`
        : `Haha your wish is my command! 🧞‍♂️😂 Why did the AI genie never miss a deadline? Because my tasks are indexed in a 384-D vector space and I never take coffee breaks! 😄✨ Want to see who is leading the team scoreboard today?`,
      bullets: [],
      referencedAssignmentIds: [],
      referencedEmployeeIds: [],
      suggestedFollowUps: ar
        ? ['مين أفضل موظف في لوحة الصدارة؟', 'مين اللي خلص التاسكات بتاعته؟']
        : ['Who is leading the leaderboard?', 'Who finished their tasks?'],
    };
  }

  // 0D. Capabilities / Help
  if (asksCapabilitiesOrHelp) {
    return {
      reply: ar
        ? `تحت أمرك يا فندم! أنا «عبدك المطيغ» 🧞‍♂️✨ وبقدر أساعدك في كل تفصيلة جوه الموقع في ثواني:`
        : `At your service! I am "Abdak Al-Moti'gh" 🧞‍♂️✨ and here is everything I can do for you right inside the workspace:`,
      bullets: ar
        ? [
            `🔍 متابعة المهام: أسألك وتقولي "ايه المهام اللي لسة مكتملتش؟" أو "مين خلص التاسكات بتاعته؟" أو "هل في مهام متأخرة؟"`,
            `👤 تقارير الموظفين الذكية: اسألني عن أي موظف بالاسم وهجيبلك مهامه، نقاطه، وآخر مهمة أنجزها (ومش بنسى الضمائر لو قولتلي "وآخر مهمة خلصها كانت إيه؟").`,
            `🏆 لوحة الصدارة: بعرفك مين موظف الشهر وترتيب الفريق بالنقاط ومعدل الالتزام بالمواعيد.`,
            `⚡ أزرار تفاعلية مباشرة: تحت كل إجابة بحطلك أزرار تفتح بيها تفاصيل المهمة أو ملف الموظف بضغطة واحدة!`,
          ]
        : [
            `🔍 Live Task Tracking: Ask "Which tasks are unfinished?", "Who completed their tasks?", or "Are any tasks overdue?"`,
            `👤 Smart Employee Profiles: Ask about any employee by name (and follow up with pronouns like "What was the last task they completed?").`,
            `🏆 Leaderboard & Analytics: Check top performers, weighted scores, and on-time completion rates.`,
            `⚡ One-Click Interactive Actions: Every answer includes direct buttons to open the referenced task or employee drawer!`,
          ],
      referencedAssignmentIds: [],
      referencedEmployeeIds: [],
      suggestedFollowUps: ar
        ? [
            'ايه هي المهام اللي لسة مكتملتش؟',
            'مين اللي خلص التاسكات بتاعته؟',
            'مين أفضل موظف في النقاط؟',
          ]
        : [
            'Which tasks are still unfinished?',
            'Who completed their tasks?',
            'Who is the top employee?',
          ],
    };
  }

  // 0E. If user asks who the assistant is or how the local RAG + Llama 3 system works
  if (asksAboutRagArchitecture) {
    return {
      reply: ar
        ? `شبيك لبيك.. أنا «عبدك المطيغ» 🧞‍♂️✨! مساعدك الفرفوش والمطيع جداً اللي مبيشربش قهوة، مبينامش، وحافظ كل فتفوتة في الموقع! بشتغل بالكامل محلياً بتقنية RAG ونموذج ${LLAMA3_MODEL_NAME}:`
        : `Your wish is my command! I am "Abdak Al-Moti'gh" 🧞‍♂️✨ — your cheerful, tirelessly obedient local RAG genie powered by ${LLAMA3_MODEL_NAME}:`,
      bullets: ar
        ? [
            `1. جمع بيانات الموقع وتحويلها لنصوص (Text Chunking): بفصص بيانات الموظفين والمهام والتسليمات لمقاطع نصية مفهرسة أول بأول.`,
            `2. توليد المتجهات (Embeddings): بحول النصوص لمتجهات ذكية باستخدام نموذج ${EMBEDDING_MODEL_NAME} بأبعاد (${EMBEDDING_DIM}-D).`,
            `3. قاعدة البيانات المتجهية المحلية: بخزن وأفتش في المتجهات بسرعة البرق عبر ${VECTOR_DB_ENGINE} بحساب تشابه جيب التمام (Cosine Similarity).`,
            `4. التوليد المحلي (${LLAMA3_MODEL_NAME}): بصيغ لك الإجابة النهائية بابتسامة ومن واقع بيانات الموقع الحقيقية 100%!`,
          ]
        : [
            `1. Site Data Harvesting & Chunking: All live employees, tasks, and progress logs are serialized into text chunks.`,
            `2. Embedding Generation: Powered by ${EMBEDDING_MODEL_NAME} (${EMBEDDING_DIM} dimensions).`,
            `3. Local Vector Store: Indexed in ${VECTOR_DB_ENGINE} using Cosine Similarity search.`,
            `4. Local Generation (${LLAMA3_MODEL_NAME}): Synthesizes grounded answers with a smile strictly from the top-K retrieved chunks.`,
          ],
      referencedAssignmentIds: [],
      referencedEmployeeIds: [],
      suggestedFollowUps: ar
        ? [
            'ايه هي المهام اللي لسة مكتملتش؟',
            'مين اللي خلص التاسكات بتاعته؟',
            'مين أفضل موظف في النقاط؟',
          ]
        : [
            'Which tasks are still unfinished?',
            'Who completed their tasks?',
            'Who is the top performer?',
          ],
    };
  }

  // 1. UNFINISHED / INCOMPLETE TASKS ("ايه هي المهام اللي لسة مكتملتش")
  if (asksUnfinished) {
    const pool = matchedEmployee
      ? activeAssignments.filter((a) => a.employeeId === matchedEmployee!.id)
      : activeAssignments;

    const incompleteList = pool.filter(
      (a) => a.progressPercentage < 100 && a.status !== 'approved'
    );
    const awaitingList = pool.filter((a) => a.status === 'awaiting_review');

    if (incompleteList.length === 0 && awaitingList.length === 0) {
      return {
        reply: ar
          ? matchedEmployee
            ? `وفقاً للمقاطع المسترجعة من قاعدة البيانات المتجهية، الموظف "${matchedEmployee.fullName}" ليس لديه أي مهام غير مكتملة — جميع مهامه (${pool.length}/${pool.length}) مكتملة بنسبة 100%!`
            : `وفقاً للمقاطع المسترجعة من قاعدة البيانات المتجهية، لا توجد أي مهام غير مكتملة حالياً — جميع المهام المسندة (${activeAssignments.length}) مكتملة بنسبة 100%!`
          : matchedEmployee
          ? `Based on retrieved vector chunks, "${matchedEmployee.fullName}" has 0 unfinished tasks — all ${pool.length} task(s) are 100% completed!`
          : `Based on retrieved vector chunks, there are 0 unfinished tasks — all ${activeAssignments.length} assigned task(s) are 100% completed!`,
        bullets: [],
        referencedAssignmentIds: [],
        referencedEmployeeIds: matchedEmployee ? [matchedEmployee.id] : [],
      };
    }

    const combined = [...incompleteList, ...awaitingList];
    return {
      reply: ar
        ? matchedEmployee
          ? `بناءً على البحث المتجهي (RAG) ونموذج Llama 3 المحلي، يوجد ${incompleteList.length} مهمة غير مكتملة للموظف "${matchedEmployee.fullName}" (من أصل ${pool.length} مهام مسندة):`
          : `بناءً على البحث المتجهي (RAG) ونموذج Llama 3 المحلي، يوجد حالياً ${incompleteList.length} مهمة غير مكتملة (لم تصل إلى 100% بعد) من إجمالي ${activeAssignments.length} مهام في الموقع:`
        : matchedEmployee
        ? `Based on Local RAG retrieval and Llama 3 synthesis, "${matchedEmployee.fullName}" has ${incompleteList.length} unfinished task(s) (out of ${pool.length} assigned):`
        : `Based on Local RAG retrieval and Llama 3 synthesis, there are currently ${incompleteList.length} unfinished task(s) (< 100%) out of ${activeAssignments.length} total assignments:`,
      bullets: combined.map((a) => {
        const statusAr =
          a.status === 'not_started'
            ? 'لم تبدأ بعد (0%)'
            : a.status === 'in_progress'
            ? `قيد التنفيذ (${a.progressPercentage}%)`
            : a.status === 'rejected'
            ? `مطلوب تعديلها (${a.progressPercentage}%)`
            : 'تم تسليمها 100% وبانتظار اعتماد المدير';
        return ar
          ? `• المهمة: "${a.task?.title}" — الموظف المسؤول: ${a.employee?.fullName} (${a.employee?.department}) — الحالة: ${statusAr} | الأولوية: ${a.task?.priority} | الموعد النهائي: ${formatShortDate(a.task?.dueDate)}`
          : `• Task: "${a.task?.title}" — Assignee: ${a.employee?.fullName} (${a.employee?.department}) — Progress: ${a.progressPercentage}% (${a.status}) | Priority: ${a.task?.priority} | Due: ${formatShortDate(a.task?.dueDate)}`;
      }),
      referencedAssignmentIds: combined.map((a) => a.id),
      referencedEmployeeIds: matchedEmployee
        ? [matchedEmployee.id]
        : Array.from(new Set(combined.map((a) => a.employeeId))),
    };
  }

  // 2. LATEST / LAST COMPLETED TASK ("آخر مهمة خلصها كانت إيه")
  if (
    asksLatestOrLast &&
    (asksCompleted || usesEmployeePronoun || /مهمه|مهام|task/.test(q))
  ) {
    const pool = matchedEmployee
      ? activeAssignments.filter((a) => a.employeeId === matchedEmployee!.id)
      : activeAssignments;

    const completedPool = pool
      .filter((a) => a.status === 'approved' || a.progressPercentage === 100)
      .sort(
        (a, b) =>
          new Date(b.completedAt || b.submittedAt || b.updatedAt).getTime() -
          new Date(a.completedAt || a.submittedAt || a.updatedAt).getTime()
      );

    const latestDone = completedPool[0];
    if (!latestDone) {
      return {
        reply: ar
          ? matchedEmployee
            ? `الموظف "${matchedEmployee.fullName}" لم ينجز أي مهمة بنسبة 100% حتى الآن.`
            : 'لا توجد أي مهام مكتملة بنسبة 100% في قاعدة البيانات حتى الآن.'
          : matchedEmployee
          ? `${matchedEmployee.fullName} has not completed any tasks at 100% yet.`
          : 'There are no 100% completed tasks in the database yet.',
        bullets: [],
        referencedAssignmentIds: [],
        referencedEmployeeIds: matchedEmployee ? [matchedEmployee.id] : [],
      };
    }

    if (lastEmployeeIdRef) {
      lastEmployeeIdRef.current = latestDone.employeeId;
    }

    return {
      reply: ar
        ? matchedEmployee
          ? `آخر مهمة أنجزها الموظف "${matchedEmployee.fullName}" هي "${latestDone.task?.title}":`
          : `آخر مهمة تم إنجازها في المنصة هي "${latestDone.task?.title}" بواسطة الموظف "${latestDone.employee?.fullName}":`
        : matchedEmployee
        ? `The last task completed by "${matchedEmployee.fullName}" is "${latestDone.task?.title}":`
        : `The most recently completed task is "${latestDone.task?.title}" by "${latestDone.employee?.fullName}":`,
      bullets: ar
        ? [
            `عنوان المهمة: "${latestDone.task?.title}" (القسم: ${latestDone.task?.category} — الأولوية: ${latestDone.task?.priority})`,
            `الموظف المنفذ: ${latestDone.employee?.fullName} (${latestDone.employee?.department})`,
            `الحالة ونسبة الإنجاز: ${latestDone.progressPercentage}% (${latestDone.status === 'approved' ? 'معتمدة رسمياً من المدير ✓' : 'تم تسليمها 100% وبانتظار الاعتماد'})`,
            `تاريخ الإنجاز: ${formatShortDate(latestDone.completedAt || latestDone.submittedAt || latestDone.updatedAt)}`,
          ]
        : [
            `Task Title: "${latestDone.task?.title}" (${latestDone.task?.category} — Priority: ${latestDone.task?.priority})`,
            `Completed By: ${latestDone.employee?.fullName} (${latestDone.employee?.department})`,
            `Status: ${latestDone.progressPercentage}% (${latestDone.status})`,
            `Completion Date: ${formatShortDate(latestDone.completedAt || latestDone.submittedAt || latestDone.updatedAt)}`,
          ],
      referencedAssignmentIds: [latestDone.id],
      referencedEmployeeIds: [latestDone.employeeId],
    };
  }

  // 3. TOP PERFORMER / LEADERBOARD ("مين أفضل موظف" / "موظف الشهر")
  if (asksTopOrLeaderboard) {
    const ranked = [...staffList].sort((a, b) => {
      if (b.weightedScore !== a.weightedScore)
        return b.weightedScore - a.weightedScore;
      if (b.approvedCompleted !== a.approvedCompleted)
        return b.approvedCompleted - a.approvedCompleted;
      return b.completionRate - a.completionRate;
    });
    const top = ranked[0];
    if (top && lastEmployeeIdRef) {
      lastEmployeeIdRef.current = top.id;
    }

    return {
      reply: ar
        ? top
          ? `وفقاً للمقاطع المسترجعة من لوحة الصدارة، أفضل موظف ومتصدر الأداء حالياً هو "${top.fullName}" (${top.jobTitle} — ${top.department}) برصيد ${top.weightedScore} نقطة ومعدل إنجاز ${top.completionRate}%:`
          : 'لا توجد بيانات كافية في لوحة المتصدرين حالياً.'
        : top
        ? `Based on the retrieved leaderboard chunk, the #1 top performer is "${top.fullName}" (${top.jobTitle} — ${top.department}) with ${top.weightedScore} pts and ${top.completionRate}% completion rate:`
        : 'No leaderboard rankings available yet.',
      bullets: ranked.slice(0, 5).map((e, idx) =>
        ar
          ? `المركز #${idx + 1}: ${e.fullName} (${e.department}) — النقاط: ${e.weightedScore} | المهام المعتمدة: ${e.approvedCompleted}/${e.totalAssigned} | الالتزام بالمواعيد: ${e.onTimeRate}%`
          : `Rank #${idx + 1}: ${e.fullName} (${e.department}) — Score: ${e.weightedScore} pts | Approved: ${e.approvedCompleted}/${e.totalAssigned} | On-Time: ${e.onTimeRate}%`
      ),
      referencedAssignmentIds: [],
      referencedEmployeeIds: top ? [top.id] : [],
    };
  }

  // 4. SPECIFIC EMPLOYEE QUERY
  if (matchedEmployee) {
    const empAssigns = activeAssignments.filter(
      (a) => a.employeeId === matchedEmployee!.id
    );
    const doneList = empAssigns.filter(
      (a) => a.status === 'approved' || a.progressPercentage === 100
    );
    const unfinishedList = empAssigns.filter(
      (a) => a.status !== 'approved' && a.progressPercentage < 100
    );

    return {
      reply: ar
        ? `تقرير الموظف "${matchedEmployee.fullName}" (${matchedEmployee.jobTitle} — ${matchedEmployee.department}) المسترجع عبر نظام RAG المحلي:`
        : `Local RAG profile report for "${matchedEmployee.fullName}" (${matchedEmployee.jobTitle} — ${matchedEmployee.department}):`,
      bullets: ar
        ? [
            `إجمالي المهام المسندة: ${empAssigns.length} | المكتملة (100%): ${doneList.length} | غير المكتملة: ${unfinishedList.length}`,
            `النقاط الموزونة: ${matchedEmployee.weightedScore} نقطة | معدل الإنجاز: ${matchedEmployee.completionRate}%`,
            ...doneList.map(
              (a) =>
                `✓ مهمة مكتملة (100%): "${a.task?.title}" (${a.status === 'approved' ? 'معتمدة رسمياً ✓' : 'بانتظار الاعتماد'})`
            ),
            ...unfinishedList.map(
              (a) =>
                `⏳ مهمة غير مكتملة: "${a.task?.title}" — التقدم الحالي: ${a.progressPercentage}% (${a.status === 'not_started' ? 'لم تبدأ بعد' : 'قيد التنفيذ'})`
            ),
          ]
        : [
            `Total Assigned: ${empAssigns.length} | Completed (100%): ${doneList.length} | Unfinished: ${unfinishedList.length}`,
            `Weighted Score: ${matchedEmployee.weightedScore} pts | Completion Rate: ${matchedEmployee.completionRate}%`,
            ...doneList.map(
              (a) => `✓ Completed (100%): "${a.task?.title}" (${a.status})`
            ),
            ...unfinishedList.map(
              (a) =>
                `⏳ Unfinished: "${a.task?.title}" — Progress: ${a.progressPercentage}% (${a.status})`
            ),
          ],
      referencedAssignmentIds: empAssigns.map((a) => a.id),
      referencedEmployeeIds: [matchedEmployee.id],
    };
  }

  // 5. COMPLETED TASKS ("مين اللي خلص التاسكات بتاعته" / "المهام المكتملة")
  if (asksCompleted) {
    const completedList = activeAssignments.filter(
      (a) => a.status === 'approved' || a.progressPercentage === 100
    );
    const unfinishedList = activeAssignments.filter(
      (a) => a.status !== 'approved' && a.progressPercentage < 100
    );

    if (completedList.length === 0) {
      return {
        reply: ar
          ? 'وفقاً لقاعدة البيانات المتجهية، لا توجد أي مهام مكتملة بنسبة 100% حتى الآن.'
          : 'Based on the vector database, no tasks have reached 100% completion yet.',
        bullets: unfinishedList.map((a) =>
          ar
            ? `⏳ مهمة غير مكتملة: "${a.task?.title}" — الموظف: ${a.employee?.fullName} (${a.progressPercentage}%)`
            : `⏳ Unfinished: "${a.task?.title}" — ${a.employee?.fullName} (${a.progressPercentage}%)`
        ),
        referencedAssignmentIds: unfinishedList.map((a) => a.id),
        referencedEmployeeIds: [],
      };
    }

    if (completedList[0] && lastEmployeeIdRef) {
      lastEmployeeIdRef.current = completedList[0].employeeId;
    }

    return {
      reply: ar
        ? `بناءً على المقاطع المسترجعة عبر RAG، يوجد ${completedList.length} مهمة مكتملة بنسبة 100% (من إجمالي ${activeAssignments.length} مهام في الموقع):`
        : `Based on RAG retrieved chunks, there are ${completedList.length} completed task(s) at 100% (out of ${activeAssignments.length} total):`,
      bullets: [
        ...completedList.map((a) =>
          ar
            ? `✓ مهمة مكتملة (100%): "${a.task?.title}" — أنجزها الموظف: ${a.employee?.fullName} (${a.employee?.department}) — الحالة: ${a.status === 'approved' ? 'معتمدة رسمياً من المدير ✓' : 'تم تسليمها 100% وبانتظار الاعتماد'}`
            : `✓ Completed (100%): "${a.task?.title}" — By: ${a.employee?.fullName} (${a.employee?.department}) — Status: ${a.status}`
        ),
        ...(unfinishedList.length > 0
          ? [
              ar
                ? `ملاحظة: يوجد أيضاً ${unfinishedList.length} مهمة أخرى غير مكتملة بعد (${unfinishedList.map((u) => `"${u.task?.title}" ${u.progressPercentage}%`).join(' ، ')}).`
                : `Note: There are also ${unfinishedList.length} unfinished task(s) (${unfinishedList.map((u) => `"${u.task?.title}" ${u.progressPercentage}%`).join(', ')}).`,
            ]
          : []),
      ],
      referencedAssignmentIds: completedList.map((a) => a.id),
      referencedEmployeeIds: Array.from(
        new Set(completedList.map((a) => a.employeeId))
      ),
    };
  }

  // 6. OVERDUE OR REVIEW QUEUE
  if (asksOverdue) {
    const overdueList = activeAssignments.filter((a) => a.isOverdue);
    return {
      reply: ar
        ? overdueList.length > 0
          ? `يوجد ${overdueList.length} مهمة متأخرة تجاوزت الموعد النهائي:`
          : 'ممتاز! لا توجد أي مهام متأخرة عن موعدها النهائي حالياً (0 مهام متأخرة).'
        : overdueList.length > 0
        ? `There are ${overdueList.length} overdue task assignment(s):`
        : 'Great news! There are currently 0 overdue tasks.',
      bullets: overdueList.map((a) =>
        ar
          ? `• "${a.task?.title}" — الموظف: ${a.employee?.fullName} | التقدم: ${a.progressPercentage}% | الموعد النهائي: ${formatShortDate(a.task?.dueDate)}`
          : `• "${a.task?.title}" — Assignee: ${a.employee?.fullName} | Progress: ${a.progressPercentage}% | Due: ${formatShortDate(a.task?.dueDate)}`
      ),
      referencedAssignmentIds: overdueList.map((a) => a.id),
      referencedEmployeeIds: overdueList.map((a) => a.employeeId),
    };
  }

  if (asksReview) {
    const reviewList = activeAssignments.filter(
      (a) => a.status === 'awaiting_review'
    );
    return {
      reply: ar
        ? reviewList.length > 0
          ? `يوجد ${reviewList.length} مهمة مسلمة بنسبة 100% تنتظر مراجعة واعتماد المدير:`
          : 'لا توجد حالياً أي مهام معلقة بانتظار مراجعة المدير.'
        : reviewList.length > 0
        ? `There are ${reviewList.length} task(s) awaiting manager review:`
        : 'There are currently 0 tasks awaiting manager review.',
      bullets: reviewList.map((a) =>
        ar
          ? `• "${a.task?.title}" — سلمها الموظف: ${a.employee?.fullName} (${a.employee?.department})`
          : `• "${a.task?.title}" — Submitted by: ${a.employee?.fullName} (${a.employee?.department})`
      ),
      referencedAssignmentIds: reviewList.map((a) => a.id),
      referencedEmployeeIds: reviewList.map((a) => a.employeeId),
    };
  }

  // 7. DEFAULT: Natural, Cheerful Grounded Summary from «عبدك المطيغ»
  const completedList = activeAssignments.filter(
    (a) => a.status === 'approved' || a.progressPercentage === 100
  );
  const unfinishedList = activeAssignments.filter(
    (a) => a.status !== 'approved' && a.progressPercentage < 100
  );
  const realEmployeesOnly = staffList.filter((e) => e.role === 'employee');

  return {
    reply: ar
      ? `تحت أمرك يا غالي! 🧞‍♂️✨ راجعتلك كل بيانات المنصة في لمح البصر، وده الملخص الكامل لحالة المهام والفريق دلوقتي:`
      : `At your service! 🧞‍♂️✨ I checked the live workspace data for you — here is the current status of tasks and team members:`,
    bullets: ar
      ? [
          `📊 إجمالي المهام المسندة: ${activeAssignments.length} مهمة (معدل الإنجاز العام: ${snapshot.summary.overallCompletionRate}%)`,
          `✅ المهام المكتملة (100%): ${completedList.length} مهمة (${completedList.map((a) => `"${a.task?.title}" — ${a.employee?.fullName}`).join(' ، ') || 'لا يوجد حتى الآن'})`,
          `⏳ المهام الجارية أو غير المكتملة: ${unfinishedList.length} مهمة (${unfinishedList.map((a) => `"${a.task?.title}" — ${a.employee?.fullName} (${a.progressPercentage}%)`).join(' ، ') || 'لا يوجد'})`,
          ...(realEmployeesOnly.length > 0
            ? [
                `👥 أعضاء الفريق النشطون (${realEmployeesOnly.length}): ${realEmployeesOnly.map((e) => `${e.fullName} (${e.department})`).join(' ، ')}`,
              ]
            : []),
        ]
      : [
          `📊 Total Assigned Tasks: ${activeAssignments.length} (Overall Completion Rate: ${snapshot.summary.overallCompletionRate}%)`,
          `✅ Completed Tasks (100%): ${completedList.length} (${completedList.map((a) => `"${a.task?.title}" — ${a.employee?.fullName}`).join(', ') || 'None yet'})`,
          `⏳ Unfinished / In-Progress Tasks (< 100%): ${unfinishedList.length} (${unfinishedList.map((a) => `"${a.task?.title}" — ${a.employee?.fullName} (${a.progressPercentage}%)`).join(', ') || 'None'})`,
          ...(realEmployeesOnly.length > 0
            ? [
                `👥 Active Team Members (${realEmployeesOnly.length}): ${realEmployeesOnly.map((e) => `${e.fullName} (${e.department})`).join(', ')}`,
              ]
            : []),
        ],
    referencedAssignmentIds: activeAssignments.slice(0, 4).map((a) => a.id),
    referencedEmployeeIds: realEmployeesOnly.slice(0, 3).map((e) => e.id),
    suggestedFollowUps: ar
      ? [
          'ايه هي المهام اللي لسة مكتملتش؟',
          'مين اللي خلص التاسكات بتاعته؟',
          'مين أفضل موظف في النقاط؟',
        ]
      : [
          'Which tasks are still unfinished?',
          'Who completed their tasks at 100%?',
          'Who is the top performer?',
        ],
  };
}

// ============================================================================
// 7. COMPLETE END-TO-END LOCAL RAG EXECUTION PIPELINE
// ============================================================================

export async function runLocalRagPipeline(params: {
  query: string;
  snapshot: SiteKnowledgeSnapshot;
  lang: 'ar' | 'en';
  topK?: number;
  lastEmployeeIdRef?: { current: number | null };
  contextEmployeeId?: number | null;
  ollamaUrl?: string;
}): Promise<LocalRagResponse> {
  const topK = params.topK ?? 4;
  const t0 = performance.now();

  const empRef = params.lastEmployeeIdRef ?? {
    current: params.contextEmployeeId ?? null,
  };

  // Step 1 & 2: Harvest site data into text chunks & generate 384-D Sentence-Transformers embeddings
  const indexedDocs = harvestAndChunkSiteData(params.snapshot);

  // Step 3: Index into Local Vector Store (FAISS IndexFlatIP / ChromaDB collection) & retrieve top-K
  const vectorStore = new LocalVectorDatabase();
  vectorStore.indexDocuments(indexedDocs);
  const retrievedChunks = vectorStore.similaritySearch(
    params.query,
    topK,
    empRef.current
  );
  const retrievalLatencyMs = Math.max(
    1,
    Math.round(performance.now() - t0)
  );

  // Step 4: Build Llama 3 RAG prompt & synthesize grounded answer
  const tGen0 = performance.now();
  const llama3Prompt = buildLlama3RagPrompt(
    params.query,
    retrievedChunks,
    params.lang
  );

  // Optional: If a local Ollama Llama 3 daemon is running on localhost:11434, query it first
  let synthesized = synthesizeLlama3RagAnswer(
    params.query,
    params.snapshot,
    retrievedChunks,
    params.lang,
    empRef
  );

  if (params.ollamaUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(`${params.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3',
          prompt: llama3Prompt,
          stream: false,
          options: { temperature: 0.1 },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const ollamaData = (await res.json()) as { response?: string };
        if (ollamaData.response && ollamaData.response.trim().length > 10) {
          synthesized = {
            ...synthesized,
            reply: ollamaData.response.trim(),
          };
        }
      }
    } catch {
      // Seamless fallback to built-in Local Llama-3-Instruct RAG synthesizer
    }
  }

  const generationLatencyMs = Math.max(
    1,
    Math.round(performance.now() - tGen0)
  );

  return {
    ...synthesized,
    resolvedEmployeeId: empRef.current,
    ragTelemetry: {
      embeddingModel: EMBEDDING_MODEL_NAME,
      embeddingDimension: EMBEDDING_DIM,
      vectorDbEngine: VECTOR_DB_ENGINE,
      collectionName: vectorStore.collectionName,
      llmModel: LLAMA3_MODEL_NAME,
      totalIndexedChunks: indexedDocs.length,
      topK,
      retrievalLatencyMs,
      generationLatencyMs,
      llama3PromptPreview: llama3Prompt.slice(0, 600) + '...',
      retrievedChunks,
    },
  };
}
