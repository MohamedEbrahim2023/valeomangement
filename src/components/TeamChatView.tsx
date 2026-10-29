import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Language } from '../lib/i18n.ts';
import {
  ChatContact,
  ChatMessageRecord,
  CurrentUser,
} from '../types/workspace.ts';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  CornerUpLeft,
  Hash,
  MessageSquare,
  Pin,
  PinOff,
  Reply,
  Search,
  Send,
  Shield,
  SmilePlus,
  Sparkles,
  User,
  Users,
  X,
} from 'lucide-react';

export const QUICK_REACTION_EMOJIS = ['👍', '✅', '❤️', '🔥'] as const;

export interface TeamChatViewProps {
  currentUser: CurrentUser;
  contacts: ChatContact[];
  messages: ChatMessageRecord[];
  onlineUserIds: number[];
  typingUsers?: Record<
    string,
    { userName?: string; senderName?: string; expiresAt: number }
  >;
  typingUserMap?: Record<
    string,
    { userName?: string; senderName?: string; expiresAt: number }
  >;
  lang: Language;
  selectedContactId?: number | 'general';
  initialSelectedContactId?: number | null;
  onSelectContact?: (contactId: number | 'general') => void;
  onSendMessage: (
    recipientId: number | null,
    body: string,
    replyToMessageId?: number | null,
    pinAnnouncement?: boolean
  ) => Promise<void>;
  onToggleReaction?: (messageId: number, emoji: string) => Promise<void>;
  onTogglePinMessage?: (messageId: number, isPinned?: boolean) => Promise<void>;
  onMarkMessagesRead?: (contactId: number | null) => Promise<void>;
  onMarkConversationRead?: (contactId: number | null) => Promise<void>;
  onEmitTyping?: (recipientId: number | 'general' | null) => void;
  onNotifyTyping?: (recipientId: number | null) => void;
}

export function formatLastSeenTimestamp(
  isoDate: string | null | undefined,
  lang: Language
): string {
  if (!isoDate) {
    return lang === 'ar' ? 'غير متصل' : 'Offline';
  }
  const time = new Date(isoDate).getTime();
  if (Number.isNaN(time)) {
    return lang === 'ar' ? 'غير متصل' : 'Offline';
  }
  const diffSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (diffSec < 60) {
    return lang === 'ar' ? 'آخر ظهور: منذ لحظات' : 'Last seen: just now';
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return lang === 'ar'
      ? `آخر ظهور: منذ ${diffMin} دقيقة`
      : `Last seen: ${diffMin}m ago`;
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return lang === 'ar'
      ? `آخر ظهور: منذ ${diffHours} ساعة`
      : `Last seen: ${diffHours}h ago`;
  }
  const dateObj = new Date(time);
  const formatted = dateObj.toLocaleDateString(
    lang === 'ar' ? 'ar-EG' : 'en-US',
    {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }
  );
  return lang === 'ar' ? `آخر ظهور: ${formatted}` : `Last seen: ${formatted}`;
}

function formatMessageTime(isoDate: string, lang: Language): string {
  try {
    return new Date(isoDate).toLocaleTimeString(
      lang === 'ar' ? 'ar-EG' : 'en-US',
      {
        hour: '2-digit',
        minute: '2-digit',
      }
    );
  } catch {
    return '';
  }
}

export const TeamChatView: React.FC<TeamChatViewProps> = ({
  currentUser,
  contacts,
  messages,
  onlineUserIds,
  typingUsers,
  typingUserMap,
  lang,
  selectedContactId: controlledContactId,
  initialSelectedContactId,
  onSelectContact,
  onSendMessage,
  onToggleReaction,
  onTogglePinMessage,
  onMarkMessagesRead,
  onMarkConversationRead,
  onEmitTyping,
  onNotifyTyping,
}) => {
  const ar = lang === 'ar';
  const isAdmin = currentUser.role === 'admin';

  const [internalContactId, setInternalContactId] = useState<
    number | 'general'
  >(() => {
    if (controlledContactId !== undefined) return controlledContactId;
    if (typeof initialSelectedContactId === 'number')
      return initialSelectedContactId;
    return 'general';
  });

  useEffect(() => {
    if (controlledContactId !== undefined) {
      setInternalContactId(controlledContactId);
    } else if (typeof initialSelectedContactId === 'number') {
      setInternalContactId(initialSelectedContactId);
    }
  }, [controlledContactId, initialSelectedContactId]);

  const selectedContactId = controlledContactId ?? internalContactId;
  const markReadFn = onMarkMessagesRead || onMarkConversationRead;

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<
    'all' | 'online' | 'admin' | 'employee'
  >('all');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);

  // Quote Reply state
  const [replyingToMessage, setReplyingToMessage] =
    useState<ChatMessageRecord | null>(null);
  // Admin option to immediately pin a new message in the General Room
  const [pinOnSend, setPinOnSend] = useState(false);
  // Pinned banner carousel index
  const [pinnedIndex, setPinnedIndex] = useState(0);
  // Highlighted message ID when jumping to a quoted or pinned message
  const [highlightedMsgId, setHighlightedMsgId] = useState<number | null>(null);
  // Mobile/touch active reaction picker message ID
  const [openPickerMsgId, setOpenPickerMsgId] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const lastTypingEmitRef = useRef<number>(0);

  const onlineSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds]);

  const enrichedContacts = useMemo(() => {
    return contacts.map((c) => ({
      ...c,
      isOnline: c.isOnline || onlineSet.has(c.id),
    }));
  }, [contacts, onlineSet]);

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedContacts.filter((c) => {
      if (roleFilter === 'online' && !c.isOnline) return false;
      if (roleFilter === 'admin' && c.role !== 'admin') return false;
      if (roleFilter === 'employee' && c.role !== 'employee') return false;
      if (!q) return true;
      return (
        c.fullName.toLowerCase().includes(q) ||
        c.department.toLowerCase().includes(q) ||
        c.jobTitle.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      );
    });
  }, [enrichedContacts, searchQuery, roleFilter]);

  const generalRoomMessages = useMemo(
    () => messages.filter((m) => m.recipientId === null),
    [messages]
  );

  const generalUnreadCount = useMemo(
    () =>
      generalRoomMessages.filter(
        (m) => m.senderId !== currentUser.id && !m.readAt
      ).length,
    [generalRoomMessages, currentUser.id]
  );

  const selectedContact = useMemo(() => {
    if (selectedContactId === 'general') return null;
    return enrichedContacts.find((c) => c.id === selectedContactId) || null;
  }, [enrichedContacts, selectedContactId]);

  const activeThreadMessages = useMemo(() => {
    if (selectedContactId === 'general') {
      return generalRoomMessages;
    }
    const target = enrichedContacts.find((c) => c.id === selectedContactId);
    const isTargetDefaultAdmin =
      target?.role === 'admin' && target?.fullName === 'System Administrator';
    const isCurrentDefaultAdmin =
      currentUser.role === 'admin' &&
      currentUser.fullName === 'System Administrator';

    return messages.filter((m) => {
      if (m.recipientId === null) return false;
      const fromSelected =
        m.senderId === selectedContactId ||
        (isTargetDefaultAdmin &&
          m.senderRole === 'admin' &&
          m.senderName === 'System Administrator');
      const toSelected =
        m.recipientId === selectedContactId ||
        (isTargetDefaultAdmin && m.recipientName === 'System Administrator');
      const fromMe =
        m.senderId === currentUser.id ||
        (isCurrentDefaultAdmin &&
          m.senderRole === 'admin' &&
          m.senderName === 'System Administrator');
      const toMe =
        m.recipientId === currentUser.id ||
        (isCurrentDefaultAdmin && m.recipientName === 'System Administrator');
      return (fromSelected && toMe) || (fromMe && toSelected);
    });
  }, [
    messages,
    selectedContactId,
    generalRoomMessages,
    enrichedContacts,
    currentUser,
  ]);

  // Pinned announcements in the active thread (most recently pinned first)
  const pinnedMessages = useMemo(() => {
    return activeThreadMessages
      .filter((m) => Boolean(m.isPinned))
      .sort((a, b) => {
        const tA = a.pinnedAt
          ? new Date(a.pinnedAt).getTime()
          : new Date(a.createdAt).getTime();
        const tB = b.pinnedAt
          ? new Date(b.pinnedAt).getTime()
          : new Date(b.createdAt).getTime();
        return tB - tA;
      });
  }, [activeThreadMessages]);

  useEffect(() => {
    if (pinnedIndex >= pinnedMessages.length) {
      setPinnedIndex(0);
    }
  }, [pinnedMessages.length, pinnedIndex]);

  // Reset reply target when switching conversations
  useEffect(() => {
    setReplyingToMessage(null);
    setPinOnSend(false);
    setOpenPickerMsgId(null);
  }, [selectedContactId]);

  // Automatically mark unread messages in the active conversation as read
  useEffect(() => {
    const hasUnreadInActiveThread = activeThreadMessages.some(
      (m) => m.senderId !== currentUser.id && !m.readAt
    );
    if (hasUnreadInActiveThread && markReadFn) {
      const contactParam =
        selectedContactId === 'general' ? null : selectedContactId;
      markReadFn(contactParam);
    }
  }, [activeThreadMessages, selectedContactId, currentUser.id, markReadFn]);

  // Scroll to bottom when a new message is added to the thread
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThreadMessages.length, selectedContactId]);

  const scrollToMessage = (msgId: number) => {
    const el = messageRefs.current[msgId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(msgId);
      setTimeout(() => {
        setHighlightedMsgId((prev) => (prev === msgId ? null : prev));
      }, 2200);
    }
  };

  const handleSelectContactItem = (id: number | 'general') => {
    setInternalContactId(id);
    onSelectContact?.(id);
    setMobileShowThread(true);
    const contactParam = id === 'general' ? null : id;
    markReadFn?.(contactParam);
  };

  const handleStartReply = (msg: ChatMessageRecord) => {
    setReplyingToMessage(msg);
    setOpenPickerMsgId(null);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const recipientParam =
        selectedContactId === 'general' ? null : selectedContactId;
      const replyId = replyingToMessage ? replyingToMessage.id : null;
      const shouldPin =
        isAdmin && selectedContactId === 'general' && pinOnSend;
      setDraft('');
      setReplyingToMessage(null);
      setPinOnSend(false);
      await onSendMessage(recipientParam, trimmed, replyId, shouldPin);
    } finally {
      setSending(false);
    }
  };

  const handleInputChange = (val: string) => {
    setDraft(val);
    const now = Date.now();
    if (now - lastTypingEmitRef.current > 2000) {
      lastTypingEmitRef.current = now;
      onEmitTyping?.(selectedContactId);
      onNotifyTyping?.(
        selectedContactId === 'general' ? null : selectedContactId
      );
    }
  };

  const onlineContactsCount = enrichedContacts.filter((c) => c.isOnline).length;
  const mergedTyping = typingUsers || typingUserMap || {};
  const activeTypingInfo =
    selectedContactId === 'general'
      ? mergedTyping['general'] || mergedTyping['room:general']
      : mergedTyping[String(selectedContactId)] ||
        mergedTyping[`dm:${selectedContactId}`];

  const currentPinnedBannerMsg =
    pinnedMessages[pinnedIndex] || pinnedMessages[0] || null;

  const quickReplies = ar
    ? [
        'أهلاً! شغال على المهمة حالياً وهرفع التحديث قريباً 👍',
        'تم تسليم المهمة بنسبة 100% للمراجعة ✅',
        'محتاج توضيح سريع بخصوص أولوية المهمة 🙏',
        'شكراً جزيلاً، تم الاستلام! 🚀',
      ]
    : [
        'Hi! Working on the task now, will log progress shortly 👍',
        'Task submitted at 100% for your review ✅',
        'Could we clarify a quick detail on this deliverable? 🙏',
        'Got it, thank you! 🚀',
      ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden flex flex-col lg:flex-row h-[calc(100dvh-9.5rem)] min-h-[560px] max-h-[840px]">
      {/* LEFT PANE: CONTACTS DIRECTORY & ROOMS */}
      <div
        className={`w-full lg:w-88 xl:w-96 border-b lg:border-b-0 ${
          ar ? 'lg:border-l' : 'lg:border-r'
        } border-slate-200 flex flex-col bg-slate-50/50 shrink-0 ${
          mobileShowThread ? 'hidden lg:flex' : 'flex h-full'
        }`}
      >
        {/* Contacts Header */}
        <div className="p-4 bg-white border-b border-slate-200">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 leading-tight">
                  {ar ? 'دردشة الفريق والإدارة' : 'Team & Admin Live Chat'}
                </h2>
                <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                  <span>
                    {ar
                      ? `${onlineContactsCount + 1} متصل الآن في المنصة`
                      : `${onlineContactsCount + 1} online right now`}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Search Contacts */}
          <div className="relative mb-2.5">
            <Search
              className={`w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 ${
                ar ? 'right-3' : 'left-3'
              }`}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                ar
                  ? 'ابحث عن عضو أو مدير أو قسم...'
                  : 'Search members, admins, department...'
              }
              className={`w-full ${
                ar ? 'pr-9 pl-3' : 'pl-9 pr-3'
              } py-2 text-xs bg-slate-100 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500 transition`}
            />
          </div>

          {/* Filter Tabs */}
          <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-xl text-[11px] font-semibold">
            {(
              [
                { id: 'all', labelAr: 'الكل', labelEn: 'All' },
                { id: 'online', labelAr: 'متصل 🟢', labelEn: 'Online 🟢' },
                { id: 'admin', labelAr: 'الإدارة', labelEn: 'Admins' },
                { id: 'employee', labelAr: 'الأعضاء', labelEn: 'Members' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRoleFilter(tab.id)}
                className={`py-1.5 px-2 rounded-lg transition text-center truncate ${
                  roleFilter === tab.id
                    ? 'bg-white text-indigo-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {ar ? tab.labelAr : tab.labelEn}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Contacts List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {/* General Team & Admin Broadcast Room */}
          <button
            type="button"
            onClick={() => handleSelectContactItem('general')}
            className={`w-full p-3.5 text-start transition flex items-start gap-3 hover:bg-indigo-50/40 ${
              selectedContactId === 'general'
                ? 'bg-indigo-50/80 border-s-4 border-indigo-600'
                : ''
            }`}
          >
            <div className="relative shrink-0">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-xs">
                <Hash className="w-5 h-5" />
              </div>
              <span
                title={ar ? 'غرفة نشطة دائماً' : 'Always active room'}
                className="w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white absolute -bottom-0.5 -right-0.5"
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold text-sm text-slate-900 truncate">
                  {ar
                    ? 'غرفة الفريق والإدارة العامة'
                    : 'General Team & Admin Room'}
                </span>
                {generalRoomMessages.length > 0 && (
                  <span className="text-[10px] text-slate-400 shrink-0">
                    {formatMessageTime(
                      generalRoomMessages[generalRoomMessages.length - 1]
                        .createdAt,
                      lang
                    )}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[11px] font-medium text-indigo-600">
                  {ar
                    ? 'مساحة مشتركة لجميع الأعضاء والمديرين'
                    : 'Shared channel for all members & admins'}
                </span>
              </div>

              {generalRoomMessages.length > 0 && (
                <p className="text-xs text-slate-500 truncate mt-1">
                  <span className="font-semibold text-slate-700">
                    {generalRoomMessages[generalRoomMessages.length - 1]
                      .senderId === currentUser.id
                      ? ar
                        ? 'أنت: '
                        : 'You: '
                      : `${generalRoomMessages[generalRoomMessages.length - 1].senderName}: `}
                  </span>
                  {generalRoomMessages[generalRoomMessages.length - 1].body}
                </p>
              )}
            </div>

            {generalUnreadCount > 0 && (
              <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-indigo-600 text-white shrink-0">
                {generalUnreadCount}
              </span>
            )}
          </button>

          {/* Direct Contact Items */}
          {filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              {ar
                ? 'لا يوجد أعضاء مطابقون للبحث الحالي.'
                : 'No contacts match your current filter.'}
            </div>
          ) : (
            filteredContacts.map((contact) => {
              const isSelected = selectedContactId === contact.id;
              const isSentByMe =
                contact.lastMessage?.senderId === currentUser.id;
              return (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => handleSelectContactItem(contact.id)}
                  className={`w-full p-3.5 text-start transition flex items-start gap-3 hover:bg-slate-100/80 ${
                    isSelected
                      ? 'bg-indigo-50/80 border-s-4 border-indigo-600'
                      : 'bg-white'
                  }`}
                >
                  {/* Avatar + Green Online Dot / Offline Gray Dot */}
                  <div className="relative shrink-0">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm shadow-xs ${
                        contact.role === 'admin'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {contact.fullName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <span
                      title={
                        contact.isOnline
                          ? ar
                            ? 'متصل الآن'
                            : 'Connected / Online'
                          : formatLastSeenTimestamp(contact.lastSeenAt, lang)
                      }
                      className={`w-3.5 h-3.5 rounded-full border-2 border-white absolute -bottom-0.5 -right-0.5 ${
                        contact.isOnline ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    />
                  </div>

                  {/* Contact Info & Last Message */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-bold text-sm text-slate-900 truncate">
                          {contact.fullName}
                        </span>
                        {contact.role === 'admin' && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-amber-100 text-amber-800 shrink-0">
                            {ar ? 'إدارة' : 'Admin'}
                          </span>
                        )}
                      </div>
                      {contact.lastMessage && (
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {formatMessageTime(
                            contact.lastMessage.createdAt,
                            lang
                          )}
                        </span>
                      )}
                    </div>

                    {/* Role & Online / Last Seen Status */}
                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px]">
                      {contact.isOnline ? (
                        <span className="text-emerald-600 font-semibold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          {ar ? 'متصل الآن' : 'Online now'}
                        </span>
                      ) : (
                        <span className="text-slate-400 flex items-center gap-1 truncate">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span className="truncate">
                            {formatLastSeenTimestamp(contact.lastSeenAt, lang)}
                          </span>
                        </span>
                      )}
                    </div>

                    {/* Last Message Preview with Delivery/Read Sign */}
                    {contact.lastMessage ? (
                      <div className="flex items-center gap-1 mt-1 text-xs text-slate-500 truncate">
                        {isSentByMe && (
                          <span
                            className="shrink-0"
                            title={
                              contact.lastMessage.readAt
                                ? ar
                                  ? 'تمت القراءة'
                                  : 'Read'
                                : contact.lastMessage.deliveredAt
                                ? ar
                                  ? 'تم الاستلام'
                                  : 'Delivered'
                                : ar
                                ? 'تم الإرسال'
                                : 'Sent'
                            }
                          >
                            {contact.lastMessage.readAt ? (
                              <CheckCheck className="w-3.5 h-3.5 text-sky-500 inline" />
                            ) : contact.lastMessage.deliveredAt ? (
                              <CheckCheck className="w-3.5 h-3.5 text-slate-400 inline" />
                            ) : (
                              <Check className="w-3.5 h-3.5 text-slate-400 inline" />
                            )}
                          </span>
                        )}
                        <span className="truncate">
                          {contact.lastMessage.body}
                        </span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 truncate mt-1">
                        {contact.jobTitle} · {contact.department}
                      </p>
                    )}
                  </div>

                  {/* Unread Counter Badge */}
                  {contact.unreadCount > 0 && (
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-indigo-600 text-white shrink-0 self-center">
                      {contact.unreadCount}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT PANE: ACTIVE CONVERSATION STREAM */}
      <div
        className={`flex-1 flex flex-col bg-slate-50/30 h-full min-w-0 ${
          !mobileShowThread ? 'hidden lg:flex' : 'flex'
        }`}
      >
        {/* Active Conversation Top Bar */}
        <div className="px-4 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Back button on mobile */}
            <button
              type="button"
              onClick={() => setMobileShowThread(false)}
              className="lg:hidden p-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"
              aria-label="Back to contacts"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            {selectedContact ? (
              <>
                <div className="relative shrink-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                      selectedContact.role === 'admin'
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    }`}
                  >
                    {selectedContact.fullName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <span
                    className={`w-3 h-3 rounded-full border-2 border-white absolute -bottom-0.5 -right-0.5 ${
                      selectedContact.isOnline
                        ? 'bg-emerald-500'
                        : 'bg-slate-300'
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900 truncate">
                      {selectedContact.fullName}
                    </h3>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                        selectedContact.role === 'admin'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {selectedContact.role === 'admin'
                        ? ar
                          ? 'مدير النظام'
                          : 'Administrator'
                        : selectedContact.jobTitle}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs mt-0.5">
                    {selectedContact.isOnline ? (
                      <span className="text-emerald-600 font-semibold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        {ar ? 'متصل الآن (نشط)' : 'Connected · Online now'}
                      </span>
                    ) : (
                      <span className="text-slate-500 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {formatLastSeenTimestamp(
                          selectedContact.lastSeenAt,
                          lang
                        )}
                      </span>
                    )}
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-400 truncate hidden sm:inline">
                      {selectedContact.department}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-slate-900 truncate">
                    {ar
                      ? 'غرفة الفريق والإدارة العامة'
                      : 'General Team & Admin Room'}
                  </h3>
                  <p className="text-xs text-slate-500 truncate">
                    {ar
                      ? `${enrichedContacts.length + 1} عضو ومدير · يمكنك الرد المباشر ↩️ والتفاعل بـ 👍 ✅ ❤️ 🔥`
                      : `${enrichedContacts.length + 1} members & admins · Quote reply ↩️ & react with 👍 ✅ ❤️ 🔥`}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Receipt Signs Legend */}
          <div className="hidden xl:flex items-center gap-3 text-[11px] text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl shrink-0">
            <span className="flex items-center gap-1">
              <Check className="w-3.5 h-3.5 text-slate-400" />
              {ar ? 'أُرسلت' : 'Sent'}
            </span>
            <span className="flex items-center gap-1">
              <CheckCheck className="w-3.5 h-3.5 text-slate-400" />
              {ar ? 'استُلمت' : 'Delivered'}
            </span>
            <span className="flex items-center gap-1">
              <CheckCheck className="w-3.5 h-3.5 text-sky-500" />
              {ar ? 'قُرئت' : 'Read'}
            </span>
          </div>
        </div>

        {/* PINNED ANNOUNCEMENTS BANNER (تثبيت الرسائل الهامة أعلى غرفة الفريق) */}
        {currentPinnedBannerMsg && (
          <div className="bg-amber-50/95 border-b border-amber-200/80 px-4 py-2.5 flex items-center justify-between gap-3 shadow-2xs">
            <button
              type="button"
              onClick={() => scrollToMessage(currentPinnedBannerMsg.id)}
              className="flex items-start gap-2.5 text-start flex-1 min-w-0 group cursor-pointer"
            >
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                <Pin className="w-4 h-4 rotate-45" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-extrabold uppercase tracking-wide text-amber-800">
                    {ar
                      ? '📌 إعلان مثبت من الإدارة'
                      : '📌 Pinned Announcement'}
                  </span>
                  {pinnedMessages.length > 1 && (
                    <span className="px-1.5 py-0.2 rounded bg-amber-200/70 text-amber-900 text-[10px] font-bold">
                      {pinnedIndex + 1} / {pinnedMessages.length}
                    </span>
                  )}
                  <span className="text-[10px] text-amber-700/80 font-medium">
                    · {currentPinnedBannerMsg.senderName}
                  </span>
                </div>
                <p className="text-xs font-medium text-slate-800 truncate group-hover:text-indigo-700 transition mt-0.5">
                  {currentPinnedBannerMsg.body}
                </p>
              </div>
            </button>

            <div className="flex items-center gap-1.5 shrink-0">
              {pinnedMessages.length > 1 && (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      setPinnedIndex(
                        (prev) =>
                          (prev - 1 + pinnedMessages.length) %
                          pinnedMessages.length
                      )
                    }
                    className="p-1 rounded-lg hover:bg-amber-200/50 text-amber-800"
                    title={ar ? 'الإعلان السابق' : 'Previous pinned'}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPinnedIndex(
                        (prev) => (prev + 1) % pinnedMessages.length
                      )
                    }
                    className="p-1 rounded-lg hover:bg-amber-200/50 text-amber-800"
                    title={ar ? 'الإعلان التالي' : 'Next pinned'}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => scrollToMessage(currentPinnedBannerMsg.id)}
                className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200/80 text-amber-900 text-[11px] font-semibold transition cursor-pointer"
              >
                {ar ? 'عرض' : 'Jump'}
              </button>

              {isAdmin && onTogglePinMessage && (
                <button
                  type="button"
                  onClick={() =>
                    onTogglePinMessage(currentPinnedBannerMsg.id, false)
                  }
                  className="p-1.5 rounded-lg hover:bg-amber-200/70 text-amber-800 hover:text-rose-700 transition cursor-pointer"
                  title={
                    ar ? 'إلغاء تثبيت الإعلان' : 'Unpin announcement'
                  }
                >
                  <PinOff className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeThreadMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
                <Sparkles className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">
                {selectedContact
                  ? ar
                    ? `ابدأ محادثة فورية مع ${selectedContact.fullName}`
                    : `Start a real-time conversation with ${selectedContact.fullName}`
                  : ar
                  ? 'مرحباً بك في غرفة الفريق العامة'
                  : 'Welcome to the General Team Room'}
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                {ar
                  ? 'جميع الرسائل تصل في الوقت الفعلي مع دعم الرد المباشر ↩️ والتفاعل بالإيموجي (👍 ✅ ❤️ 🔥) وتثبيت الإعلانات الهامة.'
                  : 'Messages arrive in real time with Quote Replies ↩️, Emoji Reactions (👍 ✅ ❤️ 🔥), and Pinned Announcements.'}
              </p>
            </div>
          ) : (
            activeThreadMessages.map((msg) => {
              const isMine =
                msg.senderId === currentUser.id ||
                (currentUser.role === 'admin' &&
                  currentUser.fullName === 'System Administrator' &&
                  msg.senderRole === 'admin' &&
                  msg.senderName === 'System Administrator' &&
                  selectedContactId !== msg.senderId);

              const reactionEntries = Object.entries(
                msg.reactions || {}
              ).filter(([, list]) => Array.isArray(list) && list.length > 0);
              const isHighlighted = highlightedMsgId === msg.id;

              return (
                <div
                  key={msg.id}
                  ref={(el) => {
                    messageRefs.current[msg.id] = el;
                  }}
                  className={`group flex flex-col transition-all duration-300 ${
                    isMine ? 'items-end' : 'items-start'
                  } ${
                    isHighlighted
                      ? 'ring-2 ring-amber-400 bg-amber-50/60 rounded-2xl p-1.5 -m-1.5'
                      : ''
                  }`}
                >
                  <div className="relative max-w-[88%] sm:max-w-[74%]">
                    {/* Hover / Tap Action Toolbar (Emoji Reactions + Quote Reply + Admin Pin) */}
                    <div
                      className={`flex items-center gap-0.5 bg-white border border-slate-200/90 rounded-full px-1.5 py-0.5 shadow-sm mb-1 transition-opacity ${
                        openPickerMsgId === msg.id
                          ? 'opacity-100'
                          : 'opacity-90 sm:opacity-0 sm:group-hover:opacity-100'
                      } ${isMine ? 'justify-end ms-auto' : 'justify-start me-auto'} w-fit`}
                    >
                      {QUICK_REACTION_EMOJIS.map((emoji) => {
                        const myReacted = (
                          msg.reactions?.[emoji] || []
                        ).some((u) => u.userId === currentUser.id);
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => onToggleReaction?.(msg.id, emoji)}
                            className={`w-6 h-6 rounded-full text-xs flex items-center justify-center transition hover:scale-125 cursor-pointer ${
                              myReacted
                                ? 'bg-indigo-100 ring-1 ring-indigo-400'
                                : 'hover:bg-slate-100'
                            }`}
                            title={
                              ar ? `تفاعل بـ ${emoji}` : `React with ${emoji}`
                            }
                          >
                            {emoji}
                          </button>
                        );
                      })}

                      <span className="w-px h-3.5 bg-slate-200 mx-0.5" />

                      {/* Quote Reply Button */}
                      <button
                        type="button"
                        onClick={() => handleStartReply(msg)}
                        className="px-1.5 py-0.5 rounded-full text-[11px] font-semibold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 flex items-center gap-1 transition cursor-pointer"
                        title={
                          ar
                            ? 'الرد على هذه الرسالة'
                            : 'Reply to this message'
                        }
                      >
                        <Reply className="w-3 h-3" />
                        <span className="hidden sm:inline">
                          {ar ? 'رد' : 'Reply'}
                        </span>
                      </button>

                      {/* Admin Pin / Unpin Button */}
                      {isAdmin && onTogglePinMessage && (
                        <button
                          type="button"
                          onClick={() =>
                            onTogglePinMessage(msg.id, !msg.isPinned)
                          }
                          className={`px-1.5 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer ${
                            msg.isPinned
                              ? 'text-amber-700 bg-amber-100 hover:bg-amber-200'
                              : 'text-slate-600 hover:text-amber-700 hover:bg-amber-50'
                          }`}
                          title={
                            msg.isPinned
                              ? ar
                                ? 'إلغاء تثبيت الرسالة'
                                : 'Unpin message'
                              : ar
                              ? 'تثبيت كإعلان هام'
                              : 'Pin as announcement'
                          }
                        >
                          <Pin className="w-3 h-3" />
                          <span className="hidden sm:inline">
                            {msg.isPinned
                              ? ar
                                ? 'مثبتة'
                                : 'Pinned'
                              : ar
                              ? 'تثبيت'
                              : 'Pin'}
                          </span>
                        </button>
                      )}
                    </div>

                    {/* Message Bubble */}
                    <div
                      className={`rounded-2xl px-4 py-2.5 shadow-xs ${
                        isMine
                          ? 'bg-indigo-600 text-white rounded-br-xs'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-bl-xs'
                      } ${
                        msg.isPinned
                          ? isMine
                            ? 'ring-2 ring-amber-400/90'
                            : 'border-amber-300 bg-amber-50/20'
                          : ''
                      }`}
                    >
                      {/* Pinned Tag inside bubble */}
                      {msg.isPinned && (
                        <div
                          className={`flex items-center gap-1 text-[10px] font-bold mb-1 ${
                            isMine ? 'text-amber-200' : 'text-amber-700'
                          }`}
                        >
                          <Pin className="w-3 h-3 rotate-45" />
                          <span>
                            {ar ? 'رسالة إعلان مثبتة' : 'Pinned Announcement'}
                          </span>
                        </div>
                      )}

                      {/* Sender Name in General Room or Incoming DM */}
                      {!isMine && (
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[11px] font-bold text-indigo-600">
                            {msg.senderName}
                          </span>
                          {msg.senderRole === 'admin' ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 text-[9px] font-bold rounded bg-amber-100 text-amber-800">
                              <Shield className="w-2.5 h-2.5" />
                              {ar ? 'إدارة' : 'Admin'}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">
                              · {msg.senderDepartment}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Quoted Reply Block (الرد المباشر على رسالة محددة) */}
                      {msg.replyToMessage && (
                        <button
                          type="button"
                          onClick={() =>
                            scrollToMessage(msg.replyToMessage!.id)
                          }
                          className={`w-full text-start mb-2 px-2.5 py-1.5 rounded-xl border-s-4 transition flex flex-col gap-0.5 cursor-pointer ${
                            isMine
                              ? 'bg-indigo-700/70 border-amber-300 text-indigo-100 hover:bg-indigo-700'
                              : 'bg-slate-100 border-indigo-500 text-slate-700 hover:bg-slate-200/70'
                          }`}
                        >
                          <div className="flex items-center gap-1 text-[10px] font-bold">
                            <CornerUpLeft className="w-3 h-3 shrink-0" />
                            <span className="truncate">
                              {msg.replyToMessage.senderName}
                            </span>
                          </div>
                          <p
                            className={`text-[11px] line-clamp-2 ${
                              isMine ? 'text-indigo-100/90' : 'text-slate-600'
                            }`}
                          >
                            {msg.replyToMessage.body}
                          </p>
                        </button>
                      )}

                      {/* Message Body */}
                      <p className="text-xs sm:text-sm whitespace-pre-wrap break-words leading-relaxed">
                        {msg.body}
                      </p>

                      {/* Timestamp + Delivery / Read Receipt Marks */}
                      <div
                        className={`flex items-center justify-end gap-1.5 mt-1.5 text-[10px] ${
                          isMine ? 'text-indigo-100' : 'text-slate-400'
                        }`}
                      >
                        <span>{formatMessageTime(msg.createdAt, lang)}</span>
                        {isMine && (
                          <span className="inline-flex items-center gap-0.5 font-medium">
                            {msg.readAt ? (
                              <>
                                <CheckCheck className="w-3.5 h-3.5 text-sky-300" />
                                <span className="text-[9px] text-sky-200">
                                  {ar ? 'مقروءة' : 'Read'}
                                </span>
                              </>
                            ) : msg.deliveredAt ? (
                              <>
                                <CheckCheck className="w-3.5 h-3.5 text-indigo-200" />
                                <span className="text-[9px] text-indigo-200">
                                  {ar ? 'مستلمة' : 'Delivered'}
                                </span>
                              </>
                            ) : (
                              <>
                                <Check className="w-3.5 h-3.5 text-indigo-200" />
                                <span className="text-[9px] text-indigo-200">
                                  {ar ? 'مرسلة' : 'Sent'}
                                </span>
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Active Emoji Reaction Badges Beneath Message */}
                    {reactionEntries.length > 0 && (
                      <div
                        className={`flex flex-wrap items-center gap-1 mt-1 ${
                          isMine ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        {reactionEntries.map(([emoji, usersList]) => {
                          const iReacted = usersList.some(
                            (u) => u.userId === currentUser.id
                          );
                          const namesTooltip = usersList
                            .map((u) => u.userName)
                            .join('، ');
                          return (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => onToggleReaction?.(msg.id, emoji)}
                              title={namesTooltip}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border transition cursor-pointer ${
                                iReacted
                                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-2xs'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span>{emoji}</span>
                              <span className="text-[11px]">
                                {usersList.length}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Typing Indicator */}
          {activeTypingInfo && activeTypingInfo.expiresAt > Date.now() && (
            <div className="flex items-center gap-2 text-xs text-indigo-600 font-medium px-2 py-1">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-bounce [animation-delay:300ms]" />
              </span>
              <span>
                {ar
                  ? `${activeTypingInfo.userName || activeTypingInfo.senderName || 'عضو'} يكتب الآن...`
                  : `${activeTypingInfo.userName || activeTypingInfo.senderName || 'Member'} is typing...`}
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* QUOTE REPLY PREVIEW BANNER ABOVE COMPOSER */}
        {replyingToMessage && (
          <div className="px-4 py-2 bg-indigo-50/90 border-t border-indigo-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <Reply className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-indigo-900 flex items-center gap-1">
                  <span>
                    {ar ? 'الرد على:' : 'Replying to:'}{' '}
                    {replyingToMessage.senderName}
                  </span>
                </div>
                <p className="text-xs text-slate-600 truncate">
                  {replyingToMessage.body}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReplyingToMessage(null)}
              className="p-1 rounded-lg hover:bg-indigo-200/60 text-slate-500 hover:text-slate-800 transition cursor-pointer"
              aria-label="Cancel reply"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Quick Reply Chips + Admin Pin Announcement Toggle */}
        <div className="px-4 py-2 bg-white border-t border-slate-100 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {quickReplies.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setDraft(chip)}
                className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200/80 shrink-0 transition cursor-pointer"
              >
                {chip}
              </button>
            ))}
          </div>

          {isAdmin && selectedContactId === 'general' && (
            <button
              type="button"
              onClick={() => setPinOnSend((prev) => !prev)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 shrink-0 border transition cursor-pointer ${
                pinOnSend
                  ? 'bg-amber-100 border-amber-400 text-amber-900 shadow-2xs'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-amber-50 hover:text-amber-800'
              }`}
              title={
                ar
                  ? 'تثبيت الرسالة القادمة كإعلان هام أعلى الغرفة'
                  : 'Pin next message as an announcement at the top of the room'
              }
            >
              <Pin className="w-3 h-3 rotate-45" />
              <span>
                {ar ? 'تثبيت كإعلان هام' : 'Pin as Announcement'}
              </span>
            </button>
          )}
        </div>

        {/* Message Composer */}
        <form
          onSubmit={handleSend}
          className="p-3 sm:p-4 bg-white border-t border-slate-200 flex items-center gap-2.5"
        >
          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hidden sm:flex items-center justify-center shrink-0">
            <User className="w-4 h-4" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={
              replyingToMessage
                ? ar
                  ? `اكتب ردك على ${replyingToMessage.senderName}...`
                  : `Write your reply to ${replyingToMessage.senderName}...`
                : selectedContact
                ? ar
                  ? `اكتب رسالة فورية إلى ${selectedContact.fullName}...`
                  : `Write a real-time message to ${selectedContact.fullName}...`
                : pinOnSend
                ? ar
                  ? '📌 اكتب إعلاناً هاماً ليتم تثبيته أعلى غرفة الفريق...'
                  : '📌 Write an important announcement to pin at the top...'
                : ar
                ? 'اكتب رسالة لجميع أعضاء الفريق والإدارة...'
                : 'Write a message to the General Team & Admin Room...'
            }
            className="flex-1 bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500 transition"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs sm:text-sm flex items-center gap-1.5 shadow-xs transition shrink-0 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>{ar ? 'إرسال' : 'Send'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
