# VeloPulse Enterprise — Workforce Management & Task Tracking System

A full-stack Employee Management and Task Tracking SaaS platform built with **React 19, TypeScript, Express, Zod, Recharts, and Tailwind CSS** — with built-in local persistence out of the box and optional external PostgreSQL (`DATABASE_URL`) support.

---

## 1. Architecture & Key Engineering Decisions

1. **Zero-Config Local Persistence + Optional PostgreSQL (`DATABASE_URL`)**:
   - Works out-of-the-box with zero external cloud dependencies using a local JSON store (`src/db/local-store.ts`), and automatically connects to external PostgreSQL (such as Supabase) if `DATABASE_URL` is configured (`src/db/index.ts`).
   - All queries and mutations (`src/db/repository.ts`, `src/db/mutations.ts`) enforce role-based access control and row-level isolation.

2. **Native Scrypt Password & HMAC-SHA256 Session Authentication**:
   - Uses timing-safe `scrypt` password hashing and signed HMAC-SHA256 session tokens (`src/lib/security.ts`).
   - Deactivated or archived employees are immediately blocked at the `requireAuth` middleware boundary (`403 ACCOUNT_DEACTIVATED`).

3. **Independent Multi-Employee Task Assignments**:
   - Tasks (`tasks`) and Employee Assignments (`task_assignments`) have a `1:N` relationship.
   - When a manager assigns one task to multiple employees, each employee receives an independent assignment record, independent progress percentage (`0–100%`), independent append-only progress history (`task_progress_updates`), and independent submission/review lifecycle.

4. **Append-Only Progress & Explicit Completion Review Gate**:
   - Every progress update records `previous_percentage`, `new_percentage`, work description, optional blockers, and next steps in `task_progress_updates` without overwriting prior updates.
   - Reaching `100%` progress does **not** automatically mark a task as approved. Employees must submit their work (`status = 'awaiting_review'`), creating a versioned record in `task_submissions`.
   - Administrators explicitly **Approve** (recording `completed_at` and optional quality bonus points) or **Reject / Request Revisions** (returning the assignment to `in_progress` while preserving all prior submissions and review notes).
   - Only manager-approved completions (`status = 'approved'`) count toward the official **Employee Leaderboard**.

5. **Real-Time Updates & Persistent Notification Center**:
   - Every task start, progress update, completion submission, and review decision writes a persistent notification (`notifications`) and broadcasts a live event over **Server-Sent Events (`/api/realtime/stream`)**.

---

## 2. Environment Variables (Optional)

See `.env.example`:

| Variable | Scope | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | Server Only | Optional external PostgreSQL connection string (leave unset to use local persistence) |
| `SESSION_SECRET` | Server Only | Secret key used to sign HMAC-SHA256 session tokens |
| `INITIAL_ADMIN_EMAIL` | Server Only | Administrator email provisioned on first boot |
| `INITIAL_ADMIN_PASSWORD` | Server Only | Administrator password provisioned on first boot |

---

## 3. Running, Testing, and Building Locally

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Start Development Server (Port 3000)**:
   ```bash
   npm run dev
   ```
3. **Run Type Checking / Linting**:
   ```bash
   npm run lint
   ```
4. **Run Automated Test Suite (Vitest)**:
   ```bash
   npm test
   ```
5. **Build for Production**:
   ```bash
   npm run build
   ```
