export type Language = 'en' | 'ar';

export function isArabicActive(lang?: Language): boolean {
  if (lang) return lang === 'ar';
  if (typeof document !== 'undefined' && document.documentElement.lang === 'ar') {
    return true;
  }
  try {
    if (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('velopulse_lang') === 'ar'
    ) {
      return true;
    }
  } catch {
    // Ignore storage errors
  }
  return false;
}

export function translateEventType(eventType: string, lang?: Language): string {
  if (!isArabicActive(lang)) return eventType;
  const map: Record<string, string> = {
    TASK_ASSIGNED: 'إسناد مهمة جديدة',
    TASK_STARTED: 'بدء العمل على المهمة',
    PROGRESS_UPDATED: 'تحديث نسبة الإنجاز',
    WORK_SUBMITTED: 'تسليم المهمة للمراجعة',
    COMPLETION_SUBMITTED: 'تسليم المهمة للمراجعة',
    TASK_APPROVED: 'اعتماد وإنجاز المهمة',
    REVIEW_APPROVED: 'اعتماد وإنجاز المهمة',
    TASK_CHANGES_REQUESTED: 'طلب تعديلات على المهمة',
    REVIEW_REJECTED: 'طلب تعديلات على المهمة',
    TASK_CANCELED: 'إلغاء المهمة',
    TASK_CREATED: 'إنشاء مهمة جديدة',
    TASK_UPDATED: 'تحديث بيانات المهمة',
    EMPLOYEE_CREATED: 'إضافة موظف جديد',
    EMPLOYEE_UPDATED: 'تحديث بيانات موظف',
    EMPLOYEE_DEACTIVATED: 'إيقاف حساب موظف',
    EMPLOYEE_ACTIVATED: 'تفعيل حساب موظف',
    USER_SIGNED_IN: 'تسجيل دخول للنظام',
    PROFILE_UPDATED: 'تحديث الملف الشخصي',
    ORG_SETTINGS_UPDATED: 'تحديث إعدادات المؤسسة',
    PASSWORD_CHANGED: 'تغيير كلمة المرور',
    PASSWORD_RESET_BY_ADMIN: 'إعادة تعيين كلمة مرور',
    CHAT_MESSAGE_RECEIVED: 'رسالة دردشة فورية جديدة',
  };
  return map[eventType] || eventType;
}

export function translateActorName(actorName: string, lang?: Language): string {
  if (!isArabicActive(lang)) return actorName;
  if (!actorName) return 'النظام';
  if (actorName === 'System Administrator') return 'مدير النظام';
  if (actorName === 'System') return 'النظام';
  return actorName;
}

export function translateNotificationTitle(
  title: string,
  lang?: Language
): string {
  if (!isArabicActive(lang) || !title) return title;

  // Match "Progress Updated: Name (20% → 100%)"
  const progMatch = title.match(/^Progress Updated:\s*(.+?)\s*\((.+)\)$/i);
  if (progMatch) {
    return `تحديث التقدم: ${progMatch[1]} (${progMatch[2]})`;
  }

  // Match "Task Started: Name"
  const startMatch = title.match(/^Task Started:\s*(.+)$/i);
  if (startMatch) {
    return `بدء المهمة: ${startMatch[1]}`;
  }

  // Match "New Task Assigned: Title" or "Task Assigned: Title"
  const assignMatch = title.match(/^(?:New )?Task Assigned:\s*(.+)$/i);
  if (assignMatch) {
    return `مهمة جديدة مسندة: ${assignMatch[1]}`;
  }

  // Match "Completion Review Requested: Name"
  const subMatch = title.match(/^Completion Review Requested:\s*(.+)$/i);
  if (subMatch) {
    return `طلب مراجعة واعتماد مهمة: ${subMatch[1]}`;
  }

  // Match "Task Approved: Title" or "Completion Approved: Title"
  const appMatch = title.match(/^(?:Task|Completion) Approved:\s*(.+)$/i);
  if (appMatch) {
    return `تم اعتماد المهمة بنجاح: ${appMatch[1]}`;
  }

  // Match "Revisions Requested: Title" or "Changes Requested: Title"
  const revMatch = title.match(/^(?:Revisions|Changes) Requested:\s*(.+)$/i);
  if (revMatch) {
    return `مطلوب تعديلات على المهمة: ${revMatch[1]}`;
  }

  // Match "Task Canceled: Title"
  const cancelMatch = title.match(/^Task Canceled:\s*(.+)$/i);
  if (cancelMatch) {
    return `تم إلغاء المهمة: ${cancelMatch[1]}`;
  }

  // Match "Employee Added: Name" or "New Employee Added: Name"
  const empMatch = title.match(/^(?:New )?Employee (?:Added|Created):\s*(.+)$/i);
  if (empMatch) {
    return `تمت إضافة موظف جديد: ${empMatch[1]}`;
  }

  // Match "New Chat Message from Name"
  const chatDmMatch = title.match(/^New Chat Message from\s*(.+)$/i);
  if (chatDmMatch) {
    return `💬 رسالة جديدة من ${chatDmMatch[1]}`;
  }

  // Match "Team Chat (Name)"
  const teamChatMatch = title.match(/^Team Chat \((.+)\)$/i);
  if (teamChatMatch) {
    return `💬 دردشة الفريق (${teamChatMatch[1]})`;
  }

  return title;
}

export function translateNotificationBody(
  body: string,
  lang?: Language
): string {
  if (!isArabicActive(lang) || !body) return body;

  // 1. "Mohamed Ebrahim updated "this is atask" to 100%: "Note""
  const updMatch = body.match(
    /^(.+?) updated "(.+?)" to (\d+%):\s*"([\s\S]*)"$/i
  );
  if (updMatch) {
    return `قام ${updMatch[1]} بتحديث تقدم المهمة "${updMatch[2]}" إلى ${updMatch[3]}: "${updMatch[4]}"`;
  }

  // 2. "Submitted for completion review (v1): ..."
  const subHistMatch = body.match(
    /^Submitted for completion review \(v(\d+)\):\s*([\s\S]*)$/i
  );
  if (subHistMatch) {
    return `تم إرسال المهمة لمراجعة الاعتماد النهائي (الإصدار ${subHistMatch[1]}): ${subHistMatch[2]}`;
  }

  // 3. "Mohamed Ebrahim started working on "check site"."
  const startMatch = body.match(/^(.+?) started working on "(.+?)"\.?$/i);
  if (startMatch) {
    return `بدأ ${startMatch[1]} العمل على المهمة "${startMatch[2]}".`;
  }

  // 4. "Mohamed Ebrahim submitted "Task" (v1) for completion approval."
  const reviewReqMatch = body.match(
    /^(.+?) submitted "(.+?)" \(v(\d+)\) for completion approval\.?$/i
  );
  if (reviewReqMatch) {
    return `قام ${reviewReqMatch[1]} بتسليم المهمة "${reviewReqMatch[2]}" (الإصدار ${reviewReqMatch[3]}) لاعتماد الإنجاز.`;
  }

  // 5. "Priority: High · Due 10/30/2026"
  const prioMatch = body.match(/^Priority:\s*(\w+)\s*·\s*Due\s*(.+)$/i);
  if (prioMatch) {
    const prioAr: Record<string, string> = {
      Critical: 'حرجة',
      High: 'عالية',
      Medium: 'متوسطة',
      Low: 'منخفضة',
    };
    return `الأولوية: ${prioAr[prioMatch[1]] || prioMatch[1]} · تاريخ التسليم: ${prioMatch[2]}`;
  }

  // 6. "Name (Title, Dept) was added to the organization."
  const empAddMatch = body.match(
    /^(.+?) \((.+?)\) was added to the organization\.?$/i
  );
  if (empAddMatch) {
    return `تمت إضافة الموظف ${empAddMatch[1]} (${empAddMatch[2]}) إلى المؤسسة.`;
  }

  // 7. "You have been assigned to "Task"."
  const reassignMatch = body.match(/^You have been assigned to "(.+?)"\.?$/i);
  if (reassignMatch) {
    return `تم تكليفك بالعمل على المهمة "${reassignMatch[1]}".`;
  }

  // 8. "The task "Task" has been canceled by an administrator."
  const cancelMatch = body.match(
    /^The task "(.+?)" has been canceled by an administrator\.?$/i
  );
  if (cancelMatch) {
    return `تم إلغاء المهمة "${cancelMatch[1]}" بواسطة مدير النظام.`;
  }

  // 9. Manager approved or requested revisions body
  const approvedBodyMatch = body.match(
    /^Your submission for "(.+?)" was approved!(.*)$/i
  );
  if (approvedBodyMatch) {
    return `تم اعتماد تسليمك للمهمة "${approvedBodyMatch[1]}" بنجاح! ${approvedBodyMatch[2]}`;
  }

  return body;
}

export const translations = {
  en: {
    appName: 'VeloPulse Enterprise',
    tagline: 'Workforce Management & Task Operations',
    signInTitle: 'Sign in to your workspace',
    signInSubtitle:
      'Access your enterprise administrator console or personal employee task workspace.',
    googleSignIn: 'Continue with Google',
    emailLabel: 'Work Email Address',
    passwordLabel: 'Password',
    signInButton: 'Sign In with Email',
    forgotPassword: 'Forgot password?',
    resetPasswordTitle: 'Reset your password',
    resetPasswordDesc:
      'Enter your work email address to request a password reset link.',
    sendResetButton: 'Send Recovery Instructions',
    backToLogin: 'Back to sign in',
    quickDemoAccounts: 'Quick Test Accounts (One-Click Sign In)',
    roleAdmin: 'Administrator',
    roleEmployee: 'Employee',
    navDashboard: 'Overview',
    navEmployees: 'Employees',
    navTasks: 'Tasks & Assignments',
    navReviews: 'Completion Reviews',
    navLeaderboard: 'Leaderboard',
    navReports: 'Reports & Analytics',
    navAuditLog: 'Audit Log',
    navSettings: 'Organization',
    navMyTasks: 'My Tasks',
    navNotifications: 'Notifications',
    navProfile: 'My Profile',
    signOut: 'Sign Out',
    refreshData: 'Refresh',
    liveConnected: 'Realtime Active',
    addEmployee: 'Add Employee',
    createTask: 'Create Task',
    exportEmployeesCsv: 'Export Employees CSV',
    exportTasksCsv: 'Export Tasks CSV',
    totalEmployees: 'Total Employees',
    activeEmployees: 'Active Employees',
    totalAssigned: 'Assigned Tasks',
    notStarted: 'Not Started',
    inProgress: 'In Progress',
    awaitingReview: 'Awaiting Review',
    completedApproved: 'Completed & Approved',
    overdueTasks: 'Overdue Tasks',
    completionRate: 'Completion Rate',
    startTask: 'Start Task',
    updateProgress: 'Update Progress',
    submitForReview: 'Submit for Review',
    viewSubmission: 'View Submission',
    reviseAndResubmit: 'Revise & Resubmit',
    viewCompleted: 'View Completed Task',
    approveTask: 'Approve Completion',
    rejectTask: 'Request Revisions',
    markAllRead: 'Mark All as Read',
    searchPlaceholder: 'Search by name, email, or task title...',
    allDepartments: 'All Departments',
    allStatuses: 'All Statuses',
    allPriorities: 'All Priorities',
    formulaNote:
      'Completion Rate = (Approved Completed Assignments ÷ Non-Canceled Assigned Tasks) × 100',
  },
  ar: {
    appName: 'فيلوبالس للمؤسسات',
    tagline: 'إدارة الموظفين وتتبع المهام التشغيلية',
    signInTitle: 'تسجيل الدخول إلى مساحة العمل',
    signInSubtitle:
      'الدخول إلى لوحة تحكم المدير التنفيذي أو مساحة عمل الموظف الخاصة بك.',
    googleSignIn: 'المتابعة باستخدام حساب Google',
    emailLabel: 'البريد الإلكتروني للعمل',
    passwordLabel: 'كلمة المرور',
    signInButton: 'تسجيل الدخول بالبريد الإلكتروني',
    forgotPassword: 'هل نسيت كلمة المرور؟',
    resetPasswordTitle: 'إعادة تعيين كلمة المرور',
    resetPasswordDesc:
      'أدخل بريدك الإلكتروني للعمل لإرسال تعليمات استعادة كلمة المرور.',
    sendResetButton: 'إرسال تعليمات الاستعادة',
    backToLogin: 'العودة لتسجيل الدخول',
    quickDemoAccounts: 'حسابات الاختبار السريع (دخول بنقرة واحدة)',
    roleAdmin: 'مدير النظام',
    roleEmployee: 'موظف',
    navDashboard: 'نظرة عامة',
    navEmployees: 'الموظفون',
    navTasks: 'المهام والتكليفات',
    navReviews: 'مراجعة الإنجاز',
    navLeaderboard: 'لوحة الصدارة',
    navReports: 'التقارير والتحليلات',
    navAuditLog: 'سجل التدقيق',
    navSettings: 'إعدادات المؤسسة',
    navMyTasks: 'مهامي',
    navNotifications: 'الإشعارات',
    navProfile: 'ملفي الشخصي',
    signOut: 'تسجيل الخروج',
    refreshData: 'تحديث البيانات',
    liveConnected: 'متصل بالوقت الفعلي',
    addEmployee: 'إضافة موظف',
    createTask: 'إنشاء مهمة',
    exportEmployeesCsv: 'تصدير الموظفين CSV',
    exportTasksCsv: 'تصدير المهام CSV',
    totalEmployees: 'إجمالي الموظفين',
    activeEmployees: 'الموظفون النشطون',
    totalAssigned: 'المهام المسندة',
    notStarted: 'لم تبدأ',
    inProgress: 'قيد التنفيذ',
    awaitingReview: 'بانتظار المراجعة',
    completedApproved: 'مكتملة ومعتمدة',
    overdueTasks: 'مهام متأخرة',
    completionRate: 'معدل الإنجاز',
    startTask: 'بدء المهمة',
    updateProgress: 'تحديث التقدم',
    submitForReview: 'إرسال للمراجعة',
    viewSubmission: 'عرض التسليم',
    reviseAndResubmit: 'تعديل وإعادة الإرسال',
    viewCompleted: 'عرض المهمة المكتملة',
    approveTask: 'اعتماد الإنجاز',
    rejectTask: 'طلب تعديلات',
    markAllRead: 'تحديد الكل كمقروء',
    searchPlaceholder: 'البحث بالاسم أو البريد أو عنوان المهمة...',
    allDepartments: 'جميع الأقسام',
    allStatuses: 'جميع الحالات',
    allPriorities: 'جميع الأولويات',
    formulaNote:
      'معدل الإنجاز = (التكليفات المكتملة المعتمدة ÷ إجمالي التكليفات غير الملغاة) × 100',
  },
};
