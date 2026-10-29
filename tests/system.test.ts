import { describe, expect, it, beforeAll } from 'vitest';
import {
  checkRateLimit,
  createSessionToken,
  hashPassword,
  sanitizeCsvCell,
  verifyPassword,
  verifySessionToken,
} from '../src/lib/security.ts';
import {
  createEmployeeSchema,
  createTaskSchema,
  progressUpdateSchema,
  reviewSubmissionSchema,
  submitCompletionSchema,
  updateSelfProfileSchema,
} from '../src/lib/validation.ts';
import {
  authenticateWithPassword,
  ensureSeedData,
  getAllWorkspaceData,
} from '../src/db/repository.ts';
import {
  archiveEmployeeByAdmin,
  createEmployeeByAdmin,
  createTaskWithAssignments,
  markNotificationAsRead,
  reviewTaskSubmission,
  startTaskAssignment,
  submitProgressUpdate,
  submitTaskForReview,
  updateEmployeeByAdmin,
} from '../src/db/mutations.ts';

describe('1. Security Primitives & Input Validation', () => {
  it('hashes and verifies passwords using timing-safe scrypt', () => {
    const hash = hashPassword('SecurePass99!');
    expect(verifyPassword('SecurePass99!', hash)).toBe(true);
    expect(verifyPassword('WrongPass99!', hash)).toBe(false);
    expect(verifyPassword('SecurePass99!', null)).toBe(false);
  });

  it('creates and verifies signed HMAC session tokens and rejects tampered tokens', () => {
    const token = createSessionToken('uid-123', 'user@velopulse.io', 3600);
    const verified = verifySessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.uid).toBe('uid-123');
    expect(verified?.email).toBe('user@velopulse.io');

    // Tampered token must be rejected
    expect(verifySessionToken(`${token}tampered`)).toBeNull();
    // Expired token must be rejected
    const expired = createSessionToken('uid-123', 'user@velopulse.io', -10);
    expect(verifySessionToken(expired)).toBeNull();
  });

  it('prevents CSV formula injection on untrusted text values', () => {
    expect(sanitizeCsvCell('=cmd|\'/C calc\'!A0')).toBe('"\'=cmd|\'/C calc\'!A0"');
    expect(sanitizeCsvCell('+SUM(A1:A10)')).toBe('"\'+SUM(A1:A10)"');
    expect(sanitizeCsvCell('@HYPERLINK("http://evil")')).toBe(
      '"\'@HYPERLINK(""http://evil"")"'
    );
    expect(sanitizeCsvCell('Normal Text')).toBe('"Normal Text"');
  });

  it('enforces rate-limiting thresholds', () => {
    const testKey = `test-rate-${Date.now()}`;
    expect(checkRateLimit(testKey, 2, 60_000).allowed).toBe(true);
    expect(checkRateLimit(testKey, 2, 60_000).allowed).toBe(true);
    const blocked = checkRateLimit(testKey, 2, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('prevents privilege escalation in updateSelfProfileSchema (.strict())', () => {
    const valid = updateSelfProfileSchema.safeParse({
      fullName: 'Sara Chen',
      jobTitle: 'Staff Engineer',
    });
    expect(valid.success).toBe(true);

    // Attempt to inject role: 'admin' or accountStatus: 'active' must fail
    const escalationAttempt = updateSelfProfileSchema.safeParse({
      fullName: 'Sara Chen',
      role: 'admin',
    });
    expect(escalationAttempt.success).toBe(false);
  });

  it('validates progress percentages (0-100), completion submission (100% required), and task dates', () => {
    expect(
      progressUpdateSchema.safeParse({
        progressPercentage: 105,
        description: 'Valid description over 10 chars',
      }).success
    ).toBe(false);

    expect(
      progressUpdateSchema.safeParse({
        progressPercentage: -5,
        description: 'Valid description over 10 chars',
      }).success
    ).toBe(false);

    expect(
      submitCompletionSchema.safeParse({
        progressPercentage: 90,
        submissionSummary: 'Trying to submit at 90%',
      }).success
    ).toBe(false);

    expect(
      createTaskSchema.safeParse({
        title: 'Valid Task',
        description: 'Detailed description here',
        priority: 'High',
        category: 'Engineering',
        startDate: '2026-11-10',
        dueDate: '2026-11-01', // Before start date!
        assignedEmployeeIds: [1],
      }).success
    ).toBe(false);
  });
});

describe('2. End-to-End Database, Authorization & Workflow Integration Tests', () => {
  beforeAll(async () => {
    await ensureSeedData();
  });

  it('authenticates seeded administrator and employee, and rejects invalid credentials', async () => {
    const admin = await authenticateWithPassword(
      'admin@velopulse.io',
      'AdminPass123!'
    );
    expect(admin.role).toBe('admin');

    const employee = await authenticateWithPassword(
      'sara.chen@velopulse.io',
      'Employee123!'
    );
    expect(employee.role).toBe('employee');

    await expect(
      authenticateWithPassword('sara.chen@velopulse.io', 'WrongPassword!')
    ).rejects.toThrow('INVALID_CREDENTIALS');
  });

  it('enforces row-level data isolation: employee sees only their own assignments and notifications', async () => {
    const sara = await authenticateWithPassword(
      'sara.chen@velopulse.io',
      'Employee123!'
    );
    const omar = await authenticateWithPassword(
      'omar.hassan@velopulse.io',
      'Employee123!'
    );

    const saraWorkspace = await getAllWorkspaceData(sara);
    // Every assignment returned to Sara must belong to Sara
    expect(saraWorkspace.assignments.length).toBeGreaterThan(0);
    for (const assign of saraWorkspace.assignments) {
      expect(assign.employeeId).toBe(sara.id);
    }

    // Sara cannot access audit logs
    expect(saraWorkspace.activityLogs.length).toBe(0);

    // Sara cannot mark Omar's notification as read
    const omarWorkspace = await getAllWorkspaceData(omar);
    if (omarWorkspace.notifications.length > 0) {
      await expect(
        markNotificationAsRead(sara, omarWorkspace.notifications[0].id)
      ).rejects.toThrow(/Forbidden/);
    }
  });

  it('enforces employee management rules: admin creates employee, rejects duplicates, blocks non-admins, and revokes deactivated accounts', async () => {
    const admin = await authenticateWithPassword(
      'admin@velopulse.io',
      'AdminPass123!'
    );
    const sara = await authenticateWithPassword(
      'sara.chen@velopulse.io',
      'Employee123!'
    );

    // Unauthorized employee cannot create an employee
    await expect(
      createEmployeeByAdmin(sara, {
        fullName: 'Unauthorized Hire',
        email: 'unauth@velopulse.io',
        department: 'Engineering',
        jobTitle: 'Developer',
        accountStatus: 'active',
      })
    ).rejects.toThrow(/Forbidden/);

    // Admin creates a new employee
    const uniqueEmail = `test.emp.${Date.now()}@velopulse.io`;
    const newEmp = await createEmployeeByAdmin(admin, {
      fullName: 'Tariq Al-Zahrani',
      email: uniqueEmail,
      department: 'Security & Compliance',
      jobTitle: 'Security Analyst',
      accountStatus: 'active',
      temporaryPassword: 'TempPassword123!',
    });
    expect(newEmp.email).toBe(uniqueEmail);

    // Duplicate email is rejected
    await expect(
      createEmployeeByAdmin(admin, {
        fullName: 'Duplicate User',
        email: uniqueEmail,
        department: 'Engineering',
        jobTitle: 'Engineer',
        accountStatus: 'active',
      })
    ).rejects.toThrow(/already exists/);

    // Deactivating employee blocks sign-in
    await updateEmployeeByAdmin(admin, newEmp.id, {
      accountStatus: 'deactivated',
    });
    await expect(
      authenticateWithPassword(uniqueEmail, 'TempPassword123!')
    ).rejects.toThrow('ACCOUNT_DEACTIVATED');

    // Reactivate and then archive employee (preserving historical records)
    await updateEmployeeByAdmin(admin, newEmp.id, {
      accountStatus: 'active',
    });
    const archived = await archiveEmployeeByAdmin(admin, newEmp.id);
    expect(archived.deletedAt).not.toBeNull();
    expect(archived.accountStatus).toBe('deactivated');
  });

  it('verifies full multi-employee task lifecycle: independent progress, append-only history, completion submission, rejection/revision, approval, and leaderboard scoring', async () => {
    const admin = await authenticateWithPassword(
      'admin@velopulse.io',
      'AdminPass123!'
    );
    const sara = await authenticateWithPassword(
      'sara.chen@velopulse.io',
      'Employee123!'
    );
    const omar = await authenticateWithPassword(
      'omar.hassan@velopulse.io',
      'Employee123!'
    );

    // 1. Unauthorized user cannot create/assign a task
    await expect(
      createTaskWithAssignments(sara, {
        title: 'Unauthorized Task',
        description: 'Should fail server-side role check',
        priority: 'Medium',
        category: 'Engineering',
        startDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 86_400_000).toISOString(),
        assignedEmployeeIds: [sara.id],
      })
    ).rejects.toThrow(/Forbidden/);

    // 2. Admin creates a task assigned to BOTH Sara and Omar
    const { task, assignments } = await createTaskWithAssignments(admin, {
      title: `Multi-Employee API Gateway Migration ${Date.now()}`,
      description:
        'Migrate edge routes and verify independent progress tracking per employee.',
      priority: 'High',
      category: 'Platform Engineering',
      startDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      estimatedEffort: 16,
      assignedEmployeeIds: [sara.id, omar.id],
    });
    expect(assignments.length).toBe(2);

    const saraAssign = assignments.find((a) => a.employeeId === sara.id)!;
    const omarAssign = assignments.find((a) => a.employeeId === omar.id)!;

    // 3. Employee cannot start or update another employee's assignment
    await expect(startTaskAssignment(sara, omarAssign.id)).rejects.toThrow(
      /Forbidden/
    );
    await expect(
      submitProgressUpdate(sara, omarAssign.id, {
        progressPercentage: 50,
        description: 'Unauthorized progress update attempt',
      })
    ).rejects.toThrow(/Forbidden/);

    // 4. Sara starts her assignment and updates progress from 0% -> 40% -> 85%
    const started = await startTaskAssignment(sara, saraAssign.id);
    expect(started.status).toBe('in_progress');
    expect(started.startedAt).not.toBeNull();

    const upd1 = await submitProgressUpdate(sara, saraAssign.id, {
      progressPercentage: 40,
      description: 'Completed gateway route schema definitions and unit tests.',
    });
    expect(upd1.progressEntry.previousPercentage).toBe(0);
    expect(upd1.progressEntry.newPercentage).toBe(40);

    const upd2 = await submitProgressUpdate(sara, saraAssign.id, {
      progressPercentage: 85,
      description: 'Integrated rate limiter and verified staging traffic.',
    });
    expect(upd2.progressEntry.previousPercentage).toBe(40);
    expect(upd2.progressEntry.newPercentage).toBe(85);

    // Verify Omar's progress on the exact same task remained independent at 0%!
    const omarData = await getAllWorkspaceData(omar);
    const omarCurrent = omarData.assignments.find((a) => a.id === omarAssign.id)!;
    expect(omarCurrent.progressPercentage).toBe(0);
    expect(omarCurrent.status).toBe('not_started');

    // 5. Sara submits for completion review (100%)
    const sub1 = await submitTaskForReview(sara, saraAssign.id, {
      progressPercentage: 100,
      submissionSummary:
        'All gateway routes migrated and benchmarked under 12ms latency.',
      evidenceNotes: 'PR #412 merged to staging.',
    });
    expect(sub1.assignment.status).toBe('awaiting_review');
    expect(sub1.submission.version).toBe(1);

    // Employee cannot forge approval
    await expect(
      reviewTaskSubmission(sara, saraAssign.id, {
        decision: 'approved',
        reviewNotes: 'Self approval attempt',
      })
    ).rejects.toThrow(/Forbidden/);

    // 6. Manager rejects submission first -> returns to in_progress
    const rejected = await reviewTaskSubmission(admin, saraAssign.id, {
      decision: 'rejected',
      reviewNotes: 'Please add fallback circuit-breaker test coverage.',
    });
    expect(rejected.assignment.status).toBe('in_progress');

    // 7. Sara revises and resubmits (version 2)
    const sub2 = await submitTaskForReview(sara, saraAssign.id, {
      progressPercentage: 100,
      submissionSummary:
        'Added circuit-breaker fallback tests; 100% coverage achieved.',
    });
    expect(sub2.submission.version).toBe(2);
    expect(sub2.assignment.status).toBe('awaiting_review');

    // 8. Manager approves submission v2 -> status becomes approved & counts on leaderboard
    const approved = await reviewTaskSubmission(admin, saraAssign.id, {
      decision: 'approved',
      reviewNotes: 'Circuit-breaker tests verified. Approved with bonus.',
      qualityBonusAwarded: 25,
    });
    expect(approved.assignment.status).toBe('approved');
    expect(approved.assignment.completedAt).not.toBeNull();

    // Verify all progress updates (0->40, 40->85, 85->100) and both submissions (v1, v2) and both reviews are preserved!
    const adminWorkspace = await getAllWorkspaceData(admin);
    const finalAssign = adminWorkspace.assignments.find(
      (a) => a.id === saraAssign.id
    )!;
    expect(finalAssign.progressUpdates.length).toBeGreaterThanOrEqual(3);
    expect(finalAssign.submissions.length).toBe(2);
    expect(finalAssign.reviews.length).toBe(2);

    // Verify administrator received persistent notifications
    expect(adminWorkspace.notifications.length).toBeGreaterThan(0);
  });
});

describe('3. Local RAG Engine (Sentence-Transformers 384-D + FAISS/Chroma Vector DB + Llama 3)', () => {
  it('generates L2-normalized 384-dimensional embeddings and retrieves accurate chunks for Arabic & English queries', async () => {
    const {
      EMBEDDING_DIMENSION,
      computeSentenceTransformerEmbedding,
      cosineSimilarity,
      runLocalRagPipeline,
    } = await import('../src/lib/local-rag-engine.ts');

    const vecA = computeSentenceTransformerEmbedding('المهام اللي لسة مكتملتش');
    const vecB = computeSentenceTransformerEmbedding('المهام غير المكتملة التي لم تنتهي بعد');
    const vecC = computeSentenceTransformerEmbedding('المهام المكتملة بنجاح 100%');

    expect(vecA.length).toBe(EMBEDDING_DIMENSION);
    const normA = Math.sqrt(vecA.reduce((acc, v) => acc + v * v, 0));
    expect(normA).toBeCloseTo(1.0, 3);

    // Unfinished query should have higher cosine similarity with unfinished text than completed text
    expect(cosineSimilarity(vecA, vecB)).toBeGreaterThan(cosineSimilarity(vecA, vecC));

    const admin = await authenticateWithPassword(
      'admin@velopulse.io',
      'AdminPass123!'
    );
    const workspace = await getAllWorkspaceData(admin);

    // Test unfinished tasks query in Arabic
    const ragUnfinished = await runLocalRagPipeline({
      query: 'إيه المهام اللي لسة مكتملتش؟',
      lang: 'ar',
      snapshot: workspace,
    });
    expect(ragUnfinished.ragTelemetry.retrievedChunks[0].metadata.chunkType).toBe('unfinished_tasks');
    expect(ragUnfinished.reply).toContain('غير مكتملة');

    // Test completed tasks query in Arabic
    const ragCompleted = await runLocalRagPipeline({
      query: 'إيه المهام المكتملة؟',
      lang: 'ar',
      snapshot: workspace,
    });
    expect(ragCompleted.ragTelemetry.retrievedChunks[0].metadata.chunkType).toBe('completed_tasks');
    expect(ragCompleted.reply).toContain('مكتملة');

    // Test employee profile + follow-up pronoun resolution
    const sara = workspace.employees.find((e) => e.email === 'sara.chen@velopulse.io')!;
    const ragEmp = await runLocalRagPipeline({
      query: `مهام ${sara.fullName}`,
      lang: 'ar',
      snapshot: workspace,
    });
    expect(ragEmp.resolvedEmployeeId).toBe(sara.id);

    const ragFollowUp = await runLocalRagPipeline({
      query: 'آخر مهمة خلصها كانت إيه؟',
      lang: 'ar',
      contextEmployeeId: ragEmp.resolvedEmployeeId,
      snapshot: workspace,
    });
    expect(ragFollowUp.resolvedEmployeeId).toBe(sara.id);
    expect(ragFollowUp.reply).toContain(sara.fullName);

    // Test conversational greeting ("hi") responds naturally without raw chunk debug strings
    const ragHi = await runLocalRagPipeline({
      query: 'hi',
      lang: 'en',
      snapshot: workspace,
    });
    expect(ragHi.reply).toContain("Abdak Al-Moti'gh");
    expect(ragHi.bullets.join(' ')).not.toContain('📌 Retrieved Chunk');
  });
});

describe('4. Real-Time Member & Admin Chat (Contacts, Online Presence, Delivery & Read Receipts)', () => {
  it('supports member-to-member and member-to-admin messages, online green dot status, last seen timestamp, delivery receipts, and read receipts', async () => {
    const {
      markChatMessagesDeliveredForUser,
      markChatMessagesReadByRecipient,
      markUserConnectedSse,
      markUserDisconnectedSse,
      sendChatMessage,
    } = await import('../src/db/repository.ts');

    const admin = await authenticateWithPassword(
      'admin@velopulse.io',
      'AdminPass123!'
    );
    const sara = await authenticateWithPassword(
      'sara.chen@velopulse.io',
      'Employee123!'
    );
    const omar = await authenticateWithPassword(
      'omar.hassan@velopulse.io',
      'Employee123!'
    );

    // Mark Sara connected via SSE (online green dot) and Omar disconnected (offline last seen)
    markUserConnectedSse(sara.id);
    markUserDisconnectedSse(omar.id);

    const adminWs = await getAllWorkspaceData(admin);
    expect(adminWs.chatContacts?.length).toBeGreaterThanOrEqual(3);
    const saraContact = adminWs.chatContacts?.find((c) => c.id === sara.id);
    expect(saraContact?.isOnline).toBe(true);
    expect(saraContact?.lastActivityAt).toBeTruthy();

    // Sara sends a direct message to Omar (who is currently offline)
    const { message: msgToOmar } = await sendChatMessage({
      sender: sara,
      recipientId: omar.id,
      body: 'Hi Omar, can we sync on the Kubernetes deployment?',
    });
    expect(msgToOmar.senderId).toBe(sara.id);
    expect(msgToOmar.recipientId).toBe(omar.id);
    expect(msgToOmar.readAt).toBeNull();

    // When Omar connects / fetches messages, delivery receipt (deliveredAt) is recorded
    const delivered = await markChatMessagesDeliveredForUser(omar.id);
    expect(delivered.updatedIds).toContain(msgToOmar.id);
    expect(delivered.deliveredAt).toBeTruthy();

    // When Omar opens Sara's conversation, read receipt (readAt) is recorded
    const readResult = await markChatMessagesReadByRecipient({
      reader: omar,
      contactId: sara.id,
    });
    expect(readResult.updatedIds).toContain(msgToOmar.id);
    expect(readResult.readAt).toBeTruthy();

    // Verify Sara now sees both deliveredAt and readAt on her sent message
    const saraWs = await getAllWorkspaceData(sara);
    const updatedMsg = saraWs.chatMessages?.find((m) => m.id === msgToOmar.id);
    expect(updatedMsg?.deliveredAt).not.toBeNull();
    expect(updatedMsg?.readAt).not.toBeNull();
  });
});



