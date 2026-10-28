import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').max(255),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().email('Enter a valid email address').max(255),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(128),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
});

export const createEmployeeSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(120, 'Full name cannot exceed 120 characters'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Valid email address is required')
    .max(255),
  department: z
    .string()
    .trim()
    .min(2, 'Department is required')
    .max(80)
    .default('Engineering'),
  jobTitle: z
    .string()
    .trim()
    .min(2, 'Job title is required')
    .max(100)
    .default('Specialist'),
  employeeNumber: z.string().trim().max(40).optional().nullable(),
  accountStatus: z
    .enum(['active', 'deactivated', 'invited'])
    .default('active'),
  temporaryPassword: z
    .string()
    .min(8, 'Temporary password must be at least 8 characters')
    .max(128)
    .optional(),
});

export const updateEmployeeSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  department: z.string().trim().min(2).max(80).optional(),
  jobTitle: z.string().trim().min(2).max(100).optional(),
  employeeNumber: z.string().trim().max(40).optional().nullable(),
  accountStatus: z.enum(['active', 'deactivated', 'invited']).optional(),
  role: z.enum(['admin', 'employee']).optional(),
});

// Strictly restricts ordinary employees from escalating role, changing accountStatus, or altering protected fields
export const updateSelfProfileSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Full name is required').max(120),
    jobTitle: z.string().trim().min(2, 'Job title is required').max(100).optional(),
    avatarUrl: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

export const createTaskSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, 'Task title must be at least 3 characters')
      .max(160, 'Task title cannot exceed 160 characters'),
    description: z
      .string()
      .trim()
      .min(10, 'Provide a detailed task description (min 10 characters)')
      .max(4000),
    priority: z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium'),
    category: z.string().trim().min(2).max(80).default('Engineering'),
    startDate: z.string().refine((val) => !Number.isNaN(Date.parse(val)), {
      message: 'Invalid start date',
    }),
    dueDate: z.string().refine((val) => !Number.isNaN(Date.parse(val)), {
      message: 'Invalid deadline date',
    }),
    estimatedEffort: z.number().int().min(1).max(1000).optional().default(8),
    assignedEmployeeIds: z
      .array(z.number().int().positive())
      .min(1, 'Assign at least one employee to this task'),
    checklist: z
      .array(
        z.object({
          id: z.string(),
          label: z.string().trim().min(1).max(200),
          done: z.boolean().default(false),
        })
      )
      .optional()
      .default([]),
    completionCriteria: z.string().trim().max(1500).optional().nullable(),
  })
  .refine(
    (data) => new Date(data.dueDate).getTime() >= new Date(data.startDate).getTime(),
    {
      message: 'Deadline must be on or after the start date',
      path: ['dueDate'],
    }
  );

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(3).max(160).optional(),
    description: z.string().trim().min(10).max(4000).optional(),
    priority: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
    category: z.string().trim().min(2).max(80).optional(),
    startDate: z
      .string()
      .refine((val) => !Number.isNaN(Date.parse(val)), {
        message: 'Invalid start date',
      })
      .optional(),
    dueDate: z
      .string()
      .refine((val) => !Number.isNaN(Date.parse(val)), {
        message: 'Invalid deadline date',
      })
      .optional(),
    estimatedEffort: z.number().int().min(1).max(1000).optional(),
    completionCriteria: z.string().trim().max(1500).optional().nullable(),
    taskStatus: z.enum(['active', 'canceled', 'archived']).optional(),
    assignedEmployeeIds: z.array(z.number().int().positive()).optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.dueDate) {
        return new Date(data.dueDate).getTime() >= new Date(data.startDate).getTime();
      }
      return true;
    },
    {
      message: 'Deadline must be on or after the start date',
      path: ['dueDate'],
    }
  );

export const progressUpdateSchema = z.object({
  progressPercentage: z
    .number()
    .int('Progress percentage must be a whole number')
    .min(0, 'Progress cannot be less than 0%')
    .max(100, 'Progress cannot exceed 100%'),
  description: z
    .string()
    .trim()
    .min(10, 'Describe the work completed since the last update (min 10 chars)')
    .max(2000),
  blockers: z.string().trim().max(1000).optional().nullable(),
  nextSteps: z.string().trim().max(1000).optional().nullable(),
  evidenceUrl: z.string().trim().max(500).optional().nullable(),
});

export const submitCompletionSchema = z.object({
  progressPercentage: z
    .number()
    .int()
    .refine((val) => val === 100, {
      message: 'Progress must be at 100% before submitting for completion review',
    }),
  submissionSummary: z
    .string()
    .trim()
    .min(10, 'Provide a clear completion summary (min 10 characters)')
    .max(3000),
  evidenceNotes: z.string().trim().max(2000).optional().nullable(),
});

export const reviewSubmissionSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'changes_requested']),
  reviewNotes: z
    .string()
    .trim()
    .min(5, 'Provide clear review notes or reason for decision (min 5 characters)')
    .max(2000),
  qualityBonusAwarded: z.number().int().min(0).max(50).optional().default(0),
});

export const orgSettingsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  workHoursPerDay: z.number().int().min(1).max(24),
  scoringBasePoints: z.number().int().min(10).max(1000),
  scoringOnTimeBonus: z.number().int().min(0).max(500),
  scoringQualityBonus: z.number().int().min(0).max(500),
});
