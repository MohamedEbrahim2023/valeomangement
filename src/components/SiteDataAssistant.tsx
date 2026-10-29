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
  Bot,
  ChevronDown,
  ChevronUp,
  Cpu,
  Database,
  ExternalLink,
  Layers,
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
  ragTelemetry?: RagPipelineTelemetry;
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

  // Conversational memory: tracks the last employee discussed for pronoun resolution
  const lastEmployeeIdRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeAssignments = useMemo(
    () => assignments.filter((a) => a.status !== 'canceled'),
    [assignments]
  );

  // Real-time local vector index of site data (Sentence-Transformers 384-D + FAISS/Chroma)
  const localVectorIndex = useMemo(
    () =>
      harvestAndChunkSiteData({
        currentUser,
        summary,
        employees,
        tasks,
        assignments,
        activityLogs,
      }),
    [currentUser, summary, employees, tasks, assignments, activityLogs]
  );

  const initialGreeting = useMemo<ChatMessage>(
    () => ({
      id: 'welcome-msg',
      sender: 'assistant',
      text: ar
        ? `شبيك لبيك.. «عبدك المطيغ» بين إيديك يا ${currentUser.fullName}! 🧞‍♂️✨\nأنا مساعدك الفرفوش والمطيع جداً (اللي مبيشربش قهوة، مبينامش، ومبيقولش لأ أبداً 😄). فصصت لك الموقع كله لـ (${localVectorIndex.length}) مقطع نصي بتقنية RAG المحلية ونموذج Llama 3 علشان أجاوبك في لمح البصر.. أؤمرني يا كبير!`
        : `Your wish is my command, ${currentUser.fullName}! I am "Abdak Al-Moti'gh" — your cheerful, tirelessly obedient local RAG genie! 🧞‍♂️✨\nI don't drink coffee, I never sleep, and I've indexed ${localVectorIndex.length} site data chunks into FAISS/Chroma with Llama 3 so I can answer anything in a blink!`,
      bullets: ar
        ? [
            'مثال: "إيه هي المهام اللي لسة مكتملتش؟"',
            'مثال: "مين أفضل موظف هذا الشهر؟" ثم "آخر مهمة خلصها كانت إيه؟"',
            'مثال: "مين الموظف اللي خلص التاسكات بتاعته؟"',
            'مثال: "أنت مين وإزاي بتشتغل يا عبدك المطيغ؟"',
          ]
        : [
            'Example: "Which tasks are not finished yet?"',
            'Example: "Who is the best employee this month?" then "What was the last task he finished?"',
            'Example: "Which employees finished their tasks?"',
            'Example: "Who are you and how do you work?"',
          ],
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }),
    [ar, currentUser.fullName, localVectorIndex.length]
  );

  const [messages, setMessages] = useState<ChatMessage[]>([initialGreeting]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const buildActionsFromIds = (
    empIds: number[],
    assignIds: number[]
  ): AssistantActionLink[] => {
    const actions: AssistantActionLink[] = [];
    for (const empId of empIds.slice(0, 3)) {
      const emp = employees.find((e) => e.id === Number(empId));
      if (emp && onSelectEmployee) {
        actions.push({
          label: ar ? `ملف ${emp.fullName}` : `${emp.fullName}'s Profile`,
          type: 'employee',
          employee: emp,
        });
      }
    }
    for (const assignId of assignIds.slice(0, 4)) {
      const foundAssign = activeAssignments.find(
        (a) => a.id === Number(assignId)
      );
      if (foundAssign) {
        actions.push({
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
    return actions;
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

    setMessages((prev) => [...prev, userMsg]);
    if (!customQuery) {
      setInput('');
    }

    setIsThinking(true);
    const token =
      authToken || localStorage.getItem('velopulse_auth_token') || '';

    // 1. Try Server-Side Local RAG Endpoint (/api/assistant/chat)
    if (token) {
      try {
        const res = await fetch('/api/assistant/chat', {
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
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.reply) {
            if (typeof data.resolvedEmployeeId === 'number') {
              lastEmployeeIdRef.current = data.resolvedEmployeeId;
            }
            const aiActions = buildActionsFromIds(
              Array.isArray(data.referencedEmployeeIds)
                ? data.referencedEmployeeIds
                : [],
              Array.isArray(data.referencedAssignmentIds)
                ? data.referencedAssignmentIds
                : []
            );

            const botMsg: ChatMessage = {
              id: `b-${Date.now() + 1}`,
              sender: 'assistant',
              text: data.reply,
              bullets: Array.isArray(data.bullets) ? data.bullets : [],
              actions: aiActions,
              ragTelemetry: data.ragTelemetry,
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
        // Fall through to client-side Local RAG execution if server is offline
      }
    }

    // 2. Direct In-Browser Local RAG Execution (Sentence-Transformers + FAISS/Chroma + Llama 3)
    try {
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

      const botMsg: ChatMessage = {
        id: `b-${Date.now() + 1}`,
        sender: 'assistant',
        text: localResult.reply,
        bullets: localResult.bullets,
        actions,
        ragTelemetry: localResult.ragTelemetry,
        timestamp: nowTime,
      };
      setMessages((prev) => [...prev, botMsg]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleReindexVectorStore = async () => {
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
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }).catch(() => {});
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleMessageTelemetry = (msgId: string) => {
    setExpandedTelemetryMsgIds((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  const quickPrompts = ar
    ? [
        'إيه هي المهام اللي لسة مكتملتش؟',
        'مين أفضل موظف هذا الشهر؟',
        'آخر مهمة خلصها كانت إيه؟',
        'مين الموظف اللي خلص التاسكات بتاعته؟',
        'إيه المهام اللي مستنية مراجعة المدير؟',
        'كيف يعمل نظام RAG و Llama 3 المحلي؟',
      ]
    : [
        'Which tasks are not finished yet?',
        'Who is the best employee this month?',
        'What was the last task he finished?',
        'Who finished their tasks?',
        'Tasks awaiting manager review',
        'How does the local RAG + Llama 3 work?',
      ];

  return (
    <>
      {/* Floating Launcher Button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-16 md:bottom-5 end-3 sm:end-5 z-40 inline-flex items-center gap-2 sm:gap-2.5 px-3 py-2.5 sm:px-4 sm:py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white shadow-xl border border-slate-700 transition-all cursor-pointer max-w-[calc(100vw-1.5rem)]"
        >
          <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 shrink-0">
            <Bot className="w-4 h-4 text-white" />
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-900" />
          </div>
          <div className="text-start min-w-0">
            <p className="text-xs font-bold leading-tight truncate">
              {ar ? 'عبدك المطيغ 🧞‍♂️✨' : 'Abdak Al-Moti\'gh 🧞‍♂️✨'}
            </p>
            <p className="text-[10px] text-slate-300 leading-tight truncate max-w-[175px] sm:max-w-none">
              {ar
                ? 'شبيك لبيك.. مساعدك الفرفوش اللي حافظ الموقع كله!'
                : 'Your cheerful local RAG genie at your service!'}
            </p>
          </div>
        </button>
      )}

      {/* Assistant Chat Window */}
      {isOpen && (
        <div
          dir={ar ? 'rtl' : 'ltr'}
          className={`fixed z-50 bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col overflow-hidden transition-all ${
            isExpanded
              ? 'inset-2 sm:inset-8'
              : 'inset-x-2 top-3 bottom-16 sm:inset-auto sm:bottom-4 sm:end-4 sm:w-[460px] sm:h-[630px] sm:max-h-[86vh]'
          }`}
        >
          {/* Header */}
          <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-bold truncate">
                  {ar
                    ? 'عبدك المطيغ 🧞‍♂️ (تحت أمرك يا كبير!)'
                    : 'Abdak Al-Moti\'gh 🧞‍♂️ (At Your Service!)'}
                </h3>
                <p className="text-[11px] text-slate-300 truncate">
                  {ar
                    ? 'مساعدك الفرفوش اللي مبيقولش لأ · حافظ كل تفصيلة بـ RAG و Llama 3 😄'
                    : 'Cheerful Local RAG + Llama 3 Genie · Never sleeps, knows everything!'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setShowRagArchitectureBar((v) => !v)}
                title={
                  ar
                    ? 'عرض حالة قاعدة البيانات المتجهية ونموذج Embeddings'
                    : 'View Vector DB & Embeddings Status'
                }
                className={`p-1.5 rounded-md cursor-pointer ${
                  showRagArchitectureBar
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleReindexVectorStore}
                title={
                  ar
                    ? 'إعادة جمع بيانات الموقع وتوليد المتجهات (Re-Index Embeddings)'
                    : 'Re-Index Site Chunks & Embeddings'
                }
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-md cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`}
                />
              </button>
              <button
                type="button"
                onClick={() => {
                  lastEmployeeIdRef.current = null;
                  setMessages([initialGreeting]);
                }}
                title={ar ? 'مسح المحادثة' : 'Clear Chat'}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-md cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsExpanded((v) => !v)}
                title={ar ? 'تكبير / تصغير' : 'Expand / Collapse'}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-md cursor-pointer"
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

          {/* Local RAG Architecture Status Strip (Expandable) */}
          {showRagArchitectureBar && (
            <div className="px-3.5 py-2.5 bg-slate-800 text-slate-200 border-b border-slate-700 text-[11px] space-y-1.5 shrink-0">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">
                  {ar
                    ? 'بنية نظام الاسترجاع المعزز بالتوليد (Local RAG Pipeline)'
                    : 'Local RAG Pipeline Architecture'}
                </span>
                <span className="font-mono text-emerald-400">
                  {localVectorIndex.length} Chunks Indexed
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1 text-[10px] text-slate-300 font-mono">
                <div>1. Chunker: Live Site Data → {localVectorIndex.length} Text Documents</div>
                <div>2. Embeddings: {EMBEDDING_MODEL_NAME} ({EMBEDDING_DIM}-D)</div>
                <div>3. Vector DB: {VECTOR_DB_ENGINE}</div>
                <div>4. Generator: {LLAMA3_MODEL_NAME}</div>
              </div>
            </div>
          )}

          {/* Quick Suggestion Buttons */}
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto shrink-0">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => handleSendQuery(prompt)}
                className="px-2.5 py-1 text-[11px] font-medium bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 border border-slate-200 hover:border-indigo-300 rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Messages Stream */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/50">
            {messages.map((m) => {
              const showTelemetry = Boolean(expandedTelemetryMsgIds[m.id]);
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${
                    m.sender === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed shadow-xs ${
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

                    {/* RAG Vector Retrieval Inspector Toggle */}
                    {m.ragTelemetry && (
                      <div className="mt-2.5 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => toggleMessageTelemetry(m.id)}
                          className="w-full flex items-center justify-between text-[10px] font-mono text-slate-500 hover:text-indigo-700 cursor-pointer"
                        >
                          <span className="flex items-center gap-1">
                            <Database className="w-3 h-3 text-indigo-600" />
                            <span>
                              {ar
                                ? `RAG: تم استرجاع ${m.ragTelemetry.retrievedChunks.length} متجهات من ${m.ragTelemetry.totalIndexedChunks} (${m.ragTelemetry.retrievalLatencyMs}ms)`
                                : `RAG: Top-${m.ragTelemetry.retrievedChunks.length} of ${m.ragTelemetry.totalIndexedChunks} vectors (${m.ragTelemetry.retrievalLatencyMs}ms)`}
                            </span>
                          </span>
                          {showTelemetry ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {showTelemetry && (
                          <div className="mt-2 p-2.5 bg-slate-900 text-slate-200 rounded-lg text-[10px] font-mono space-y-2">
                            <div className="text-indigo-300 border-b border-slate-700 pb-1">
                              <div>Embeddings: {m.ragTelemetry.embeddingModel}</div>
                              <div>Vector DB: {m.ragTelemetry.vectorDbEngine}</div>
                              <div>LLM: {m.ragTelemetry.llmModel}</div>
                            </div>
                            <div className="space-y-1.5">
                              <p className="text-slate-400 font-sans font-semibold">
                                {ar
                                  ? 'المقاطع النصية المسترجعة (Cosine Similarity):'
                                  : 'Retrieved Vector Chunks (Cosine Similarity):'}
                              </p>
                              {m.ragTelemetry.retrievedChunks.map((chunk, i) => (
                                <div
                                  key={chunk.id}
                                  className="p-1.5 bg-slate-800/90 border border-slate-700 rounded space-y-0.5"
                                >
                                  <div className="flex items-center justify-between text-emerald-400">
                                    <span>
                                      #{i + 1} [{chunk.metadata.chunkType}]
                                    </span>
                                    <span>
                                      Similarity: {(chunk.score * 100).toFixed(1)}%
                                    </span>
                                  </div>
                                  <p className="text-slate-300 font-sans line-clamp-2">
                                    {chunk.metadata.title}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 px-1">
                    {m.timestamp}
                  </span>
                </div>
              );
            })}
            {isThinking && (
              <div className="flex flex-col items-start">
                <div className="bg-white border border-indigo-200 rounded-xl px-3.5 py-2.5 text-xs text-indigo-800 flex items-center gap-2 shadow-xs">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  <span className="font-medium">
                    {ar
                      ? 'جاري تحويل السؤال لمتجه (Sentence-Transformers) والبحث في FAISS/Chroma وتوليد إجابة Llama 3...'
                      : 'Computing 384-D query embedding, searching FAISS/Chroma, and generating Llama 3 answer...'}
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
                  ? 'أؤمر «عبدك المطيغ» بأي سؤال عن الموظفين أو المهام... 🧞‍♂️'
                  : 'Ask "Abdak Al-Moti\'gh" anything about tasks or staff... 🧞‍♂️'
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
