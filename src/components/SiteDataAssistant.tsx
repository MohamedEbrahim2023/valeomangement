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
import {
  EMBEDDING_DIM,
  EMBEDDING_MODEL_NAME,
  harvestAndChunkSiteData,
  LLAMA3_MODEL_NAME,
  RagPipelineTelemetry,
  runLocalRagPipeline,
  VECTOR_DB_ENGINE,
} from '../lib/local-rag-engine.ts';
import {
  generateWithInBrowserLlm,
  InBrowserLlmProgress,
  initInBrowserLlm,
} from '../lib/in-browser-llm.ts';
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Database,
  Download,
  ExternalLink,
  Layers,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  X,
  Zap,
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

interface ActionableCommandProposal {
  id: string;
  kind: 'send_chat' | 'create_task';
  targetEmployeeId: number | null;
  targetEmployeeName: string;
  messageBody?: string;
  taskTitle?: string;
  taskDescription?: string;
  taskPriority?: 'Low' | 'Medium' | 'High' | 'Critical';
  executed?: boolean;
  executing?: boolean;
  resultMessage?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  bullets?: string[];
  actions?: AssistantActionLink[];
  suggestedFollowUps?: string[];
  ragTelemetry?: RagPipelineTelemetry;
  pendingCommand?: ActionableCommandProposal;
  isStreaming?: boolean;
  timestamp: string;
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
  const [showRagArchitectureBar, setShowRagArchitectureBar] = useState(false);
  const [expandedTelemetryMsgIds, setExpandedTelemetryMsgIds] = useState<
    Record<string, boolean>
  >({});
  const [input, setInput] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  // In-Browser LLM Mode ('instant-hybrid' vs 'onnx-qwen' running @huggingface/transformers in browser)
  const [llmEngineMode, setLlmEngineMode] = useState<
    'instant-hybrid' | 'onnx-qwen'
  >('instant-hybrid');
  const [onnxState, setOnnxState] = useState<InBrowserLlmProgress>({
    status: 'idle',
    progress: 0,
  });

  // Conversational memory: tracks the last employee discussed for pronoun resolution
  const lastEmployeeIdRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const streamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Voice-to-Voice Mode State (SpeechRecognition + SpeechSynthesis)
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const [voiceReplyEnabled, setVoiceReplyEnabled] = useState(false);
  const recognitionRef = useRef<any>(null);

  const speakTextAloud = (textToSpeak: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const clean = textToSpeak.replace(/[*#`_~]/g, '');
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = ar ? 'ar-EG' : 'en-US';
    utterance.rate = 1.02;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const toggleVoiceMic = () => {
    if (typeof window === 'undefined') return;
    const SpeechRec =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setInput(
        ar
          ? 'ابعت رسالة لسارة في الشات وقولها تسلم المهمة'
          : 'Send a message to Sara in chat to submit the task'
      );
      return;
    }
    if (isListeningVoice && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListeningVoice(false);
      return;
    }
    const rec = new SpeechRec();
    rec.lang = ar ? 'ar-EG' : 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => setIsListeningVoice(true);
    rec.onend = () => setIsListeningVoice(false);
    rec.onerror = () => setIsListeningVoice(false);
    rec.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      if (transcript.trim()) {
        setInput(transcript.trim());
        handleSendQuery(transcript.trim());
      }
    };
    recognitionRef.current = rec;
    rec.start();
  };

  // Parse Actionable AI Genie Commands ("ابعت رسالة لـ...", "أنشئ مهمة لـ...")
  const detectActionableCommand = (
    rawQuery: string
  ): ActionableCommandProposal | null => {
    const q = rawQuery.trim();
    const qLower = q.toLowerCase();

    const findMatchingEmployee = (text: string): EmployeeStat | null => {
      const normalized = text
        .replace(/أ|إ|آ/g, 'ا')
        .replace(/ة/g, 'ه')
        .toLowerCase();
      for (const emp of employees) {
        const fullNorm = emp.fullName
          .replace(/أ|إ|آ/g, 'ا')
          .replace(/ة/g, 'ه')
          .toLowerCase();
        const firstNorm = fullNorm.split(' ')[0];
        if (
          normalized.includes(fullNorm) ||
          (firstNorm.length >= 3 && normalized.includes(firstNorm))
        ) {
          return emp;
        }
      }
      // Common Arabic phonetic matches for seeded staff
      if (normalized.includes('ساره') || normalized.includes('sara')) {
        return (
          employees.find((e) => e.fullName.toLowerCase().includes('sara')) ||
          employees[0] ||
          null
        );
      }
      if (normalized.includes('عمر') || normalized.includes('omar')) {
        return (
          employees.find((e) => e.fullName.toLowerCase().includes('omar')) ||
          employees[0] ||
          null
        );
      }
      if (normalized.includes('ليلي') || normalized.includes('laila')) {
        return (
          employees.find((e) => e.fullName.toLowerCase().includes('laila')) ||
          employees[0] ||
          null
        );
      }
      if (normalized.includes('كريم') || normalized.includes('karim')) {
        return (
          employees.find((e) => e.fullName.toLowerCase().includes('karim')) ||
          employees[0] ||
          null
        );
      }
      return null;
    };

    // 1. Detect "Send Chat Message" command
    const isChatCmd =
      /(ابعت|ابعث|ارسل|أرسل|قول)\s+(رساله|رسالة)/.test(q) ||
      /(ابعت|ارسل)\s+ل/.test(q) ||
      /send\s+(a\s+)?message\s+to/i.test(qLower);

    if (isChatCmd) {
      const targetEmp = findMatchingEmployee(q);
      let msgBody = q;
      const bodyMatchAr = q.match(
        /(?:وقوله|وقولها|تقوله|تقولها|مفادها|بعنوان|ان|إن|بأن|:)\s*(.+)$/i
      );
      const bodyMatchEn = q.match(/(?:saying|that|:)\s*(.+)$/i);
      if (bodyMatchAr && bodyMatchAr[1]) {
        msgBody = bodyMatchAr[1].trim();
      } else if (bodyMatchEn && bodyMatchEn[1]) {
        msgBody = bodyMatchEn[1].trim();
      } else {
        msgBody = ar
          ? 'يرجى مراجعة المهمة المسندة وتحديث نسبة الإنجاز أو تسليمها في أقرب وقت.'
          : 'Please check your assigned task and submit your latest progress update.';
      }

      return {
        id: `cmd-${Date.now()}`,
        kind: 'send_chat',
        targetEmployeeId: targetEmp ? targetEmp.id : null,
        targetEmployeeName: targetEmp
          ? targetEmp.fullName
          : ar
          ? 'غرفة الفريق العامة (الجميع)'
          : 'General Team Room (Everyone)',
        messageBody: msgBody,
      };
    }

    // 2. Detect "Create & Assign Task" command
    const isTaskCmd =
      /(انشئ|أنشئ|اعمل|اسند|أسند|اضف|أضف)\s+(مهمه|مهمة)/.test(q) ||
      /create\s+(a\s+)?(new\s+)?task/i.test(qLower) ||
      /assign\s+(a\s+)?task/i.test(qLower);

    if (isTaskCmd) {
      const targetEmp =
        findMatchingEmployee(q) ||
        employees.find((e) => e.role === 'employee') ||
        null;
      let extractedTitle = ar
        ? 'مراجعة السيرفر وفحص استقرار الأنظمة'
        : 'Server Security Audit & Health Check';
      const titleMatchAr = q.match(/(?:بعنوان|باسم|عن|:)\s*(.+)$/i);
      const titleMatchEn = q.match(/(?:titled|called|for|:)\s*(.+)$/i);
      if (titleMatchAr && titleMatchAr[1]) {
        extractedTitle = titleMatchAr[1].trim();
      } else if (titleMatchEn && titleMatchEn[1]) {
        extractedTitle = titleMatchEn[1].trim();
      }

      return {
        id: `cmd-${Date.now()}`,
        kind: 'create_task',
        targetEmployeeId: targetEmp ? targetEmp.id : null,
        targetEmployeeName: targetEmp
          ? targetEmp.fullName
          : ar
          ? 'أول موظف نشط'
          : 'First Active Employee',
        taskTitle: extractedTitle,
        taskDescription: ar
          ? `مهمة تم إنشاؤها وإسنادها فوراً بواسطة المساعد الذكي «عبدك المطيغ»: ${extractedTitle}`
          : `Task created and assigned via Actionable AI Genie: ${extractedTitle}`,
        taskPriority: 'High',
      };
    }

    return null;
  };

  const executeConfirmedCommand = async (
    msgId: string,
    cmd: ActionableCommandProposal
  ) => {
    const token =
      authToken || localStorage.getItem('velopulse_auth_token') || '';
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.pendingCommand
          ? {
              ...m,
              pendingCommand: { ...m.pendingCommand, executing: true },
            }
          : m
      )
    );

    try {
      if (cmd.kind === 'send_chat') {
        const res = await fetch('/api/chat/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            recipientId: cmd.targetEmployeeId,
            body: cmd.messageBody || 'مرحباً، يرجى متابعة المهمة.',
          }),
        });
        if (!res.ok) throw new Error('Failed to send chat message');
      } else if (cmd.kind === 'create_task') {
        const todayIso = new Date().toISOString().split('T')[0];
        const dueIso = new Date(Date.now() + 7 * 86_400_000)
          .toISOString()
          .split('T')[0];
        const targetIds = cmd.targetEmployeeId
          ? [cmd.targetEmployeeId]
          : employees
              .filter((e) => e.role === 'employee')
              .slice(0, 1)
              .map((e) => e.id);
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: cmd.taskTitle || 'مهمة جديدة',
            description:
              cmd.taskDescription ||
              'تم إنشاء هذه المهمة وإسنادها عبر أوامر عبدك المطيغ الذكية.',
            priority: cmd.taskPriority || 'High',
            category: 'Executive Operations',
            startDate: todayIso,
            dueDate: dueIso,
            estimatedEffort: 8,
            assignedEmployeeIds: targetIds,
          }),
        });
        if (!res.ok) throw new Error('Failed to create task');
      }

      if (onRefreshDatabase) {
        await onRefreshDatabase();
      }

      const successText =
        cmd.kind === 'send_chat'
          ? ar
            ? `✅ تم إرسال الرسالة إلى «${cmd.targetEmployeeName}» في الشات الحي بنجاح!`
            : `✅ Message sent to "${cmd.targetEmployeeName}" in live chat!`
          : ar
          ? `✅ تم إنشاء المهمة «${cmd.taskTitle}» وإسنادها إلى «${cmd.targetEmployeeName}» بنجاح!`
          : `✅ Task "${cmd.taskTitle}" created and assigned to "${cmd.targetEmployeeName}"!`;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.pendingCommand
            ? {
                ...m,
                pendingCommand: {
                  ...m.pendingCommand,
                  executing: false,
                  executed: true,
                  resultMessage: successText,
                },
              }
            : m
        )
      );
      if (voiceReplyEnabled) {
        speakTextAloud(successText);
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.pendingCommand
            ? {
                ...m,
                pendingCommand: {
                  ...m.pendingCommand,
                  executing: false,
                  resultMessage: ar
                    ? '⚠️ تعذر التنفيذ: تأكد من صلاحيات الحساب.'
                    : '⚠️ Action failed: check account permissions.',
                },
              }
            : m
        )
      );
    }
  };

  const activeAssignments = useMemo(
    () => assignments.filter((a) => a.status !== 'canceled'),
    [assignments]
  );

  // Defer vector index calculation until the assistant is actually opened so login/mobile rendering is instant
  const localVectorIndex = useMemo(() => {
    if (!isOpen) return [];
    return harvestAndChunkSiteData({
      currentUser,
      summary,
      employees,
      tasks,
      assignments,
      activityLogs,
    });
  }, [isOpen, currentUser, summary, employees, tasks, assignments, activityLogs]);

  const initialGreeting = useMemo<ChatMessage>(
    () => ({
      id: 'welcome-msg',
      sender: 'assistant',
      text: ar
        ? `شبيك لبيك.. «عبدك المطيغ» بين إيديك يا ${currentUser.fullName}! 🧞‍♂️✨\nأنا مساعدك الذكي والتفاعلي اللي شغال جوه الموقع 100% بدون أي خدمات خارجية! فصصت لك كل بيانات الموظفين والمهام في قاعدة بيانات متجهية (FAISS / Chroma) علشان أرد عليك، أقارن، أقترح خطط، وأدردش معاك في لمح البصر.. أؤمرني يا كبير!`
        : `Your wish is my command, ${currentUser.fullName}! I am "Abdak Al-Moti'gh" — your smart, interactive, 100% self-contained in-browser AI genie! 🧞‍♂️✨\nI've indexed your live workspace into FAISS/Chroma to chat, compare employees, suggest action plans, and answer any question in a blink!`,
      bullets: ar
        ? [
            '💬 دردشة وتحليل: "ازيك يا عبدك المطيغ؟" أو "اقترح خطة لتحسين الأداء"',
            '⚖️ مقارنات ذكية: "قارن بين الموظفين" أو "مين أفضل موظف هذا الشهر؟"',
            '📋 متابعة المهام: "إيه هي المهام اللي لسة مكتملتش؟" ثم "آخر مهمة خلصها كانت إيه؟"',
            '😂 فرفشة: "قولي نكتة يا عبدك المطيغ!"',
          ]
        : [
            '💬 Chat & Strategy: "Suggest an action plan to improve performance"',
            '⚖️ Smart Comparisons: "Compare employees" or "Who is the best employee this month?"',
            '📋 Task Tracking: "Which tasks are not finished yet?" then "What was the last task he finished?"',
            '😂 Fun: "Tell me a tech joke!"',
          ],
      suggestedFollowUps: ar
        ? [
            'إيه هي المهام اللي لسة مكتملتش؟',
            'قارن بين الموظفين في الأداء',
            'اقترح خطة لتحسين الأداء',
            'قولي نكتة يا عبدك المطيغ 😂',
          ]
        : [
            'Which tasks are not finished yet?',
            'Compare employees head-to-head',
            'Suggest an action plan to improve performance',
            'Tell me a tech joke 😂',
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

  useEffect(() => {
    return () => {
      if (streamTimerRef.current) clearInterval(streamTimerRef.current);
    };
  }, []);

  const buildActionsFromIds = (
    empIds: number[],
    assignIds: number[]
  ): AssistantActionLink[] => {
    const actions: AssistantActionLink[] = [];
    const seenLabels = new Set<string>();
    const uniqueEmpIds = Array.from(new Set(empIds.map(Number)));
    const uniqueAssignIds = Array.from(new Set(assignIds.map(Number)));

    for (const empId of uniqueEmpIds.slice(0, 3)) {
      const emp = employees.find((e) => e.id === empId);
      if (emp && onSelectEmployee) {
        const label = ar ? `ملف ${emp.fullName}` : `${emp.fullName}'s Profile`;
        if (!seenLabels.has(label)) {
          seenLabels.add(label);
          actions.push({
            label,
            type: 'employee',
            employee: emp,
          });
        }
      }
    }
    for (const assignId of uniqueAssignIds.slice(0, 4)) {
      const foundAssign = activeAssignments.find((a) => a.id === assignId);
      if (foundAssign) {
        const label = ar
          ? `مهمة: ${foundAssign.task?.title}`
          : `Task: ${foundAssign.task?.title}`;
        if (!seenLabels.has(label)) {
          seenLabels.add(label);
          actions.push({
            label,
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
    return actions;
  };

  const animateReplyStream = (
    msgId: string,
    fullText: string,
    bullets: string[],
    actions: AssistantActionLink[],
    suggestedFollowUps: string[],
    ragTelemetry?: RagPipelineTelemetry
  ) => {
    if (streamTimerRef.current) clearInterval(streamTimerRef.current);

    const words = fullText.split(' ');
    if (words.length <= 4) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                text: fullText,
                bullets,
                actions,
                suggestedFollowUps,
                ragTelemetry,
                isStreaming: false,
              }
            : m
        )
      );
      return;
    }

    let currentIdx = 0;
    const step = Math.max(2, Math.ceil(words.length / 18));

    streamTimerRef.current = setInterval(() => {
      currentIdx += step;
      if (currentIdx >= words.length) {
        if (streamTimerRef.current) clearInterval(streamTimerRef.current);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  text: fullText,
                  bullets,
                  actions,
                  suggestedFollowUps,
                  ragTelemetry,
                  isStreaming: false,
                }
              : m
          )
        );
      } else {
        const partial = words.slice(0, currentIdx).join(' ') + ' ▍';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, text: partial, isStreaming: true } : m
          )
        );
      }
    }, 28);
  };

  const handleLoadInBrowserOnnxModel = async () => {
    setLlmEngineMode('onnx-qwen');
    try {
      await initInBrowserLlm('onnx-community/Qwen2.5-0.5B-Instruct', (st) => {
        setOnnxState(st);
      });
    } catch {
      setLlmEngineMode('instant-hybrid');
    }
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

    const botMsgId = `b-${Date.now() + 1}`;
    const placeholderBotMsg: ChatMessage = {
      id: botMsgId,
      sender: 'assistant',
      text: ar
        ? '🧞‍♂️ عبدك المطيغ يفكر ويسترجع البيانات...'
        : '🧞‍♂️ Abdak Al-Moti\'gh is thinking...',
      isStreaming: true,
      timestamp: nowTime,
    };

    setMessages((prev) => [...prev, userMsg, placeholderBotMsg]);
    if (!customQuery) {
      setInput('');
    }

    setIsThinking(true);

    try {
      // Check if user issued an Actionable Command ("ابعت رسالة لسارة...", "أنشئ مهمة جديدة لعمر...")
      const detectedCmd = detectActionableCommand(queryText);
      if (detectedCmd) {
        const replyMsg =
          detectedCmd.kind === 'send_chat'
            ? ar
              ? `أمرك يا فندم! 🧞‍♂️✨ جهزت لك رسالة فورية إلى «${detectedCmd.targetEmployeeName}» في الشات الحي. راجع التفاصيل بالأسفل واضغط تأكيد لإرسالها فوراً:`
              : `At your service! 🧞‍♂️✨ I prepared a live chat message to "${detectedCmd.targetEmployeeName}". Confirm below to send it immediately:`
            : ar
            ? `شبيك لبيك! 🧞‍♂️⚡ جهزت لك مهمة جديدة بعنوان «${detectedCmd.taskTitle}» لإسنادها إلى «${detectedCmd.targetEmployeeName}». اضغط تأكيد للتنفيذ الفوري:`
            : `Your wish is my command! 🧞‍♂️⚡ I prepared a new task "${detectedCmd.taskTitle}" assigned to "${detectedCmd.targetEmployeeName}". Confirm below to execute:`;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMsgId
              ? {
                  ...m,
                  text: replyMsg,
                  pendingCommand: detectedCmd,
                  isStreaming: false,
                }
              : m
          )
        );
        if (voiceReplyEnabled) {
          speakTextAloud(replyMsg);
        }
        setIsThinking(false);
        return;
      }

      // Execute Local RAG Pipeline (100% self-contained in browser)
      const localResult = await runLocalRagPipeline({
        query: queryText,
        snapshot: {
          currentUser,
          summary,
          employees,
          tasks,
          assignments,
          activityLogs,
        },
        lang: ar ? 'ar' : 'en',
        topK: 4,
        lastEmployeeIdRef,
      });

      const actions = buildActionsFromIds(
        localResult.referencedEmployeeIds,
        localResult.referencedAssignmentIds
      );
      const followUps = localResult.suggestedFollowUps || [];

      // If user enabled the @huggingface/transformers In-Browser ONNX Qwen2.5 model,
      // generate & stream tokens directly from the browser's WebGPU/WASM neural network
      if (llmEngineMode === 'onnx-qwen') {
        try {
          const neuralReply = await generateWithInBrowserLlm({
            query: queryText,
            retrievedChunks: localResult.ragTelemetry.retrievedChunks,
            groundedBaselineReply: localResult.reply,
            groundedBullets: localResult.bullets,
            lang: ar ? 'ar' : 'en',
            modelId: 'onnx-community/Qwen2.5-0.5B-Instruct',
            onProgress: (st) => setOnnxState(st),
            onTokenStream: (partial) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === botMsgId
                    ? { ...m, text: partial + ' ▍', isStreaming: true }
                    : m
                )
              );
            },
          });

          setMessages((prev) =>
            prev.map((m) =>
              m.id === botMsgId
                ? {
                    ...m,
                    text: neuralReply,
                    bullets: localResult.bullets,
                    actions,
                    suggestedFollowUps: followUps,
                    ragTelemetry: {
                      ...localResult.ragTelemetry,
                      llmModel:
                        'Qwen2.5-0.5B-Instruct (ONNX In-Browser WebGPU/WASM)',
                    },
                    isStreaming: false,
                  }
                : m
            )
          );
          setIsThinking(false);
          return;
        } catch {
          // If WebGPU/WASM fails on a restricted device, seamlessly fall back to instant hybrid engine
          setLlmEngineMode('instant-hybrid');
        }
      }

      // Sync with server-side RAG index in background if authenticated
      const token =
        authToken || localStorage.getItem('velopulse_auth_token') || '';
      if (token) {
        fetch('/api/assistant/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: queryText,
            lang: ar ? 'ar' : 'en',
            topK: 4,
            lastEmployeeId: lastEmployeeIdRef.current,
          }),
        }).catch(() => {});
      }

      animateReplyStream(
        botMsgId,
        localResult.reply,
        localResult.bullets,
        actions,
        followUps,
        localResult.ragTelemetry
      );
      if (voiceReplyEnabled) {
        speakTextAloud(localResult.reply);
      }
    } finally {
      setIsThinking(false);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      if (onRefreshDatabase) {
        await onRefreshDatabase();
      }
      const token =
        authToken || localStorage.getItem('velopulse_auth_token') || '';
      if (token) {
        await fetch('/api/assistant/reindex', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    } finally {
      setTimeout(() => setIsSyncing(false), 350);
    }
  };

  const toggleTelemetryForMsg = (id: string) => {
    setExpandedTelemetryMsgIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const quickSuggestions = ar
    ? [
        'ابعت رسالة لسارة في الشات وقولها تسلم المهمة ⚡',
        'أنشئ مهمة جديدة لعمر بعنوان مراجعة السيرفر ⚡',
        'إيه هي المهام اللي لسة مكتملتش؟',
        'قارن بين الموظفين في الأداء',
        'مين أفضل موظف هذا الشهر؟',
        'قولي نكتة يا عبدك المطيغ 😂',
      ]
    : [
        'Send a message to Sara saying please submit your task ⚡',
        'Create a new task for Omar titled Server Security Audit ⚡',
        'Which tasks are not finished yet?',
        'Compare employees head-to-head',
        'Who is the best employee this month?',
        'Tell me a tech joke 😂',
      ];

  return (
    <>
      {/* Floating Launcher Button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-20 md:bottom-5 end-4 sm:end-5 z-40 inline-flex items-center gap-2.5 px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-full bg-indigo-950 hover:bg-indigo-900 text-white shadow-xl border border-amber-400/50 transition-all cursor-pointer group"
        >
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center shadow-sm">
            <Bot className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="text-start">
            <p className="text-xs font-extrabold leading-tight flex items-center gap-1">
              <span>{ar ? 'عبدك المطيغ 🧞‍♂️' : "Abdak Al-Moti'gh 🧞‍♂️"}</span>
              <Sparkles className="w-3 h-3 text-amber-300" />
            </p>
            <p className="text-[10px] text-indigo-200 hidden sm:block">
              {ar
                ? 'مساعدك الذكي والتفاعلي داخل المتصفح 100%'
                : 'Smart In-Browser LLM + RAG Genie'}
            </p>
          </div>
        </button>
      )}

      {/* Assistant Chat Window */}
      {isOpen && (
        <div
          dir={ar ? 'rtl' : 'ltr'}
          className={`fixed z-50 bg-white border border-slate-300 rounded-none sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all ${
            isExpanded
              ? 'inset-0 sm:inset-3 md:inset-8'
              : 'inset-x-0 bottom-0 h-[88dvh] sm:inset-auto sm:bottom-5 sm:end-5 sm:w-[470px] sm:max-w-[calc(100vw-1.5rem)] sm:h-[670px] sm:max-h-[calc(100vh-2rem)] rounded-t-2xl'
          }`}
        >
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 shadow">
                <Bot className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs sm:text-sm font-extrabold truncate">
                    {ar
                      ? 'عبدك المطيغ — المساعد الذكي التفاعلي 🧞‍♂️'
                      : "Abdak Al-Moti'gh — Smart In-Browser AI 🧞‍♂️"}
                  </h3>
                  <span
                    className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"
                    title="100% Local In-Browser Engine Active"
                  />
                </div>
                <p className="text-[10px] text-indigo-200 truncate">
                  {ar
                    ? `شغال 100% جوه المتصفح بدون أي حاجة خارجية · ${localVectorIndex.length} متجه حي`
                    : `100% Self-Contained In-Browser LLM + RAG · ${localVectorIndex.length} Vectors`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const next = !voiceReplyEnabled;
                  setVoiceReplyEnabled(next);
                  if (!next && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                  }
                }}
                title={
                  ar
                    ? 'تفعيل / إيقاف الرد الصوتي التلقائي (Voice-to-Voice 🔊)'
                    : 'Toggle Voice Replies (Text-to-Speech 🔊)'
                }
                className={`p-1.5 rounded-md cursor-pointer ${
                  voiceReplyEnabled
                    ? 'bg-emerald-400 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {voiceReplyEnabled ? (
                  <Volume2 className="w-3.5 h-3.5" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowRagArchitectureBar((v) => !v)}
                title={
                  ar
                    ? 'إعدادات محرك الذكاء الاصطناعي المحلي (ONNX Qwen2.5 / RAG)'
                    : 'In-Browser LLM & RAG Engine Settings'
                }
                className={`p-1.5 rounded-md cursor-pointer ${
                  showRagArchitectureBar
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleManualSync}
                title={
                  ar
                    ? 'تحديث وإعادة فهرسة المتجهات الآن'
                    : 'Re-index site data vectors now'
                }
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-md cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-amber-400' : ''}`}
                />
              </button>
              <button
                type="button"
                onClick={() => {
                  lastEmployeeIdRef.current = null;
                  setMessages([initialGreeting]);
                }}
                title={ar ? 'مسح المحادثة' : 'Clear conversation'}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-md cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsExpanded((v) => !v)}
                title={ar ? 'تكبير / تصغير' : 'Expand / Collapse'}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-md cursor-pointer hidden sm:inline-flex"
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
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Engine Mode Selector Bar (Instant Hybrid vs In-Browser ONNX Qwen2.5) */}
          <div className="px-3 py-2 bg-indigo-950/95 border-b border-indigo-900 text-white flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="font-semibold text-indigo-100">
                {ar ? 'المحرك الذكي:' : 'LLM Engine:'}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setLlmEngineMode('instant-hybrid')}
                className={`px-2 py-1 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                  llmEngineMode === 'instant-hybrid'
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-indigo-900/80 text-indigo-200 hover:bg-indigo-800'
                }`}
              >
                {ar
                  ? '⚡ تفاعلي فوري (RAG + التحليل الذكي)'
                  : '⚡ Instant Smart RAG'}
              </button>

              <button
                type="button"
                onClick={handleLoadInBrowserOnnxModel}
                className={`px-2 py-1 rounded text-[10px] font-bold transition-colors inline-flex items-center gap-1 cursor-pointer ${
                  llmEngineMode === 'onnx-qwen'
                    ? 'bg-emerald-400 text-slate-950'
                    : 'bg-indigo-900/80 text-indigo-200 hover:bg-indigo-800'
                }`}
              >
                <Download className="w-3 h-3" />
                <span>
                  {ar
                    ? '🧠 Qwen2.5-0.5B (ONNX داخل المتصفح)'
                    : '🧠 Qwen2.5-0.5B (In-Browser ONNX)'}
                </span>
              </button>
            </div>
          </div>

          {/* ONNX Model Download Progress Bar (when active) */}
          {llmEngineMode === 'onnx-qwen' &&
            onnxState.status === 'downloading' && (
              <div className="px-3 py-2 bg-indigo-900 text-white text-[10px] space-y-1 shrink-0">
                <div className="flex items-center justify-between">
                  <span>
                    {ar
                      ? 'جاري تحميل نموذج Qwen2.5-0.5B-Instruct (ONNX q4) في ذاكرة المتصفح...'
                      : 'Downloading Qwen2.5-0.5B-Instruct (ONNX q4) into browser cache...'}
                  </span>
                  <span className="font-mono font-bold text-amber-300">
                    {onnxState.progress}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-indigo-950 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 transition-all duration-300"
                    style={{ width: `${onnxState.progress}%` }}
                  />
                </div>
              </div>
            )}

          {/* Collapsible Local RAG Architecture Status Bar */}
          {showRagArchitectureBar && (
            <div className="px-3.5 py-2.5 bg-slate-900 text-slate-200 border-b border-slate-800 text-[10px] space-y-1 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 font-semibold text-amber-300">
                  <Layers className="w-3 h-3" />
                  <span>Embeddings: {EMBEDDING_MODEL_NAME}</span>
                </span>
                <span className="font-mono text-emerald-400">
                  {EMBEDDING_DIM}-D Cosine
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 font-semibold text-indigo-300">
                  <Database className="w-3 h-3" />
                  <span>Vector Store: {VECTOR_DB_ENGINE}</span>
                </span>
                <span className="font-mono text-slate-300">
                  {localVectorIndex.length} Chunks Indexed
                </span>
              </div>
            </div>
          )}

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${
                  m.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed shadow-2xs ${
                    m.sender === 'user'
                      ? 'bg-indigo-700 text-white'
                      : 'bg-white border border-slate-200 text-slate-800'
                  }`}
                >
                  <p className="whitespace-pre-line font-medium">{m.text}</p>

                  {m.bullets && m.bullets.length > 0 && (
                    <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-[11px] text-slate-700">
                      {m.bullets.map((b, idx) => (
                        <li key={idx} className="leading-snug">
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Actionable AI Genie Command Confirmation Card */}
                  {m.pendingCommand && (
                    <div className="mt-3 p-3 rounded-lg bg-gradient-to-br from-indigo-50 via-white to-amber-50/60 border-2 border-indigo-300 space-y-2.5 text-slate-900">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold text-indigo-900 flex items-center gap-1">
                          <Zap className="w-3.5 h-3.5 text-amber-500" />
                          {m.pendingCommand.kind === 'send_chat'
                            ? ar
                              ? 'أمر إرسال رسالة مباشرة في الشات الحي'
                              : 'Direct Live Chat Message Action'
                            : ar
                            ? 'أمر إنشاء وإسناد مهمة جديدة'
                            : 'Direct Task Creation & Assignment Action'}
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-800 rounded-full">
                          {ar ? 'جاهز للتنفيذ' : 'Ready'}
                        </span>
                      </div>

                      <div className="text-[11px] bg-white p-2.5 rounded border border-slate-200 space-y-1">
                        <div>
                          <span className="text-slate-500">
                            {ar ? 'المستلم / المكلف:' : 'Target Employee:'}
                          </span>{' '}
                          <strong className="text-slate-900">
                            {m.pendingCommand.targetEmployeeName}
                          </strong>
                        </div>
                        {m.pendingCommand.kind === 'send_chat' ? (
                          <div>
                            <span className="text-slate-500">
                              {ar ? 'نص الرسالة:' : 'Message Body:'}
                            </span>{' '}
                            <strong className="text-indigo-900">
                              “{m.pendingCommand.messageBody}”
                            </strong>
                          </div>
                        ) : (
                          <div>
                            <span className="text-slate-500">
                              {ar ? 'عنوان المهمة:' : 'Task Title:'}
                            </span>{' '}
                            <strong className="text-indigo-900">
                              {m.pendingCommand.taskTitle}
                            </strong>
                          </div>
                        )}
                      </div>

                      {m.pendingCommand.resultMessage ? (
                        <div className="p-2 rounded bg-emerald-100 border border-emerald-300 text-emerald-950 text-[11px] font-bold">
                          {m.pendingCommand.resultMessage}
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={m.pendingCommand.executing}
                          onClick={() =>
                            executeConfirmedCommand(m.id, m.pendingCommand!)
                          }
                          className="w-full py-1.5 px-3 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white rounded-md text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            {m.pendingCommand.executing
                              ? ar
                                ? 'جاري التنفيذ الفوري...'
                                : 'Executing now...'
                              : ar
                              ? 'تأكيد وتنفيذ الأمر الآن ✓'
                              : 'Confirm & Execute Now ✓'}
                          </span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Read Aloud Button per Assistant Message */}
                  {m.sender === 'assistant' && !m.isStreaming && (
                    <div className="mt-2 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => speakTextAloud(m.text)}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-indigo-700 cursor-pointer"
                        title={
                          ar
                            ? 'استمع للرد بصوت عبدك المطيغ'
                            : 'Listen to reply aloud'
                        }
                      >
                        <Volume2 className="w-3 h-3" />
                        <span>{ar ? 'نطق صوتي' : 'Speak'}</span>
                      </button>
                    </div>
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
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 transition-colors cursor-pointer"
                        >
                          <span>{act.label}</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Dynamic Conversational Follow-up Chips */}
                  {m.sender === 'assistant' &&
                    !m.isStreaming &&
                    m.suggestedFollowUps &&
                    m.suggestedFollowUps.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-slate-100 space-y-1">
                        <p className="text-[10px] font-bold text-slate-400">
                          {ar ? '💡 أسئلة متابعة مقترحة:' : '💡 Suggested follow-ups:'}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {m.suggestedFollowUps.map((qText, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleSendQuery(qText)}
                              className="px-2 py-1 rounded-md text-[10px] font-semibold bg-amber-50/80 hover:bg-amber-100 text-amber-900 border border-amber-200/80 transition-colors cursor-pointer text-start"
                            >
                              {qText}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Expandable RAG Pipeline Telemetry Badge */}
                  {m.ragTelemetry && !m.isStreaming && (
                    <div className="mt-2 pt-1.5 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => toggleTelemetryForMsg(m.id)}
                        className="w-full flex items-center justify-between text-[10px] font-mono text-indigo-700 hover:text-indigo-900 cursor-pointer"
                      >
                        <span className="flex items-center gap-1">
                          <Cpu className="w-3 h-3 text-indigo-600" />
                          <span>
                            {ar
                              ? `استرجاع RAG: أعلى ${m.ragTelemetry.retrievedChunks.length} من ${m.ragTelemetry.totalIndexedChunks} متجه (${m.ragTelemetry.retrievalLatencyMs}ms)`
                              : `RAG: Top-${m.ragTelemetry.retrievedChunks.length} of ${m.ragTelemetry.totalIndexedChunks} vectors (${m.ragTelemetry.retrievalLatencyMs}ms)`}
                          </span>
                        </span>
                        {expandedTelemetryMsgIds[m.id] ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>

                      {expandedTelemetryMsgIds[m.id] && (
                        <div className="mt-1.5 p-2 rounded bg-slate-900 text-slate-100 font-mono text-[10px] space-y-1.5 overflow-x-auto">
                          <div className="text-amber-300 font-semibold">
                            {ar
                              ? 'المقاطع النصية المسترجعة من قاعدة البيانات المتجهية (FAISS/Chroma):'
                              : 'Retrieved Chunks from Local Vector Store (FAISS/Chroma):'}
                          </div>
                          {m.ragTelemetry.retrievedChunks.map((chunk, cIdx) => (
                            <div
                              key={chunk.id}
                              className="p-1.5 rounded bg-slate-800 border border-slate-700"
                            >
                              <div className="flex items-center justify-between text-emerald-400">
                                <span>
                                  #{cIdx + 1} [{chunk.metadata.chunkType}]
                                </span>
                                <span>
                                  Cosine: {(chunk.score * 100).toFixed(1)}%
                                </span>
                              </div>
                              <div className="text-slate-200 font-sans mt-0.5">
                                {chunk.metadata.title}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <span className="text-[10px] text-slate-400 mt-0.5 px-1">
                  {m.timestamp}
                </span>
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompt Chips */}
          <div className="px-3 py-2 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto">
            {quickSuggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                disabled={isThinking}
                onClick={() => handleSendQuery(s)}
                className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 border border-slate-200 whitespace-nowrap transition-colors cursor-pointer shrink-0 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Input Form with Voice-to-Voice Microphone Button */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendQuery();
            }}
            className="p-3 bg-white border-t border-slate-200 flex items-center gap-1.5 shrink-0"
          >
            <button
              type="button"
              onClick={toggleVoiceMic}
              title={
                ar
                  ? 'التحدث الصوتي مع عبدك المطيغ (Voice-to-Voice 🎙️)'
                  : 'Speak to Abdak Al-Moti\'gh with your voice 🎙️'
              }
              className={`p-2 rounded-lg border transition-all cursor-pointer shrink-0 ${
                isListeningVoice
                  ? 'bg-red-600 text-white border-red-600 animate-pulse'
                  : 'bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border-slate-300'
              }`}
            >
              {isListeningVoice ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>
            <input
              type="text"
              value={input}
              disabled={isThinking}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isListeningVoice
                  ? ar
                    ? '🎙️ جاري الاستماع لصوتك... تحدث الآن'
                    : '🎙️ Listening to your voice... speak now'
                  : ar
                  ? 'دردش، تحدث بالصوت 🎙️، أو اكتب أمراً (مثل: ابعت رسالة لسارة)...'
                  : 'Chat, speak 🎙️, or issue a command (e.g. Send a message to Sara)...'
              }
              className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-600 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!input.trim() || isThinking}
              className="px-3.5 py-2 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-40 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{ar ? 'إرسال' : 'Ask'}</span>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
