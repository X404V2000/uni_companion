/**
 * src/lib/api.ts — Varsity Companion API helper (React Native).
 *
 * PORTED FROM THE WEB CLIENT. The public interface is deliberately identical —
 * every function signature, type, and error shape matches frontend/src/lib/api.ts,
 * so a screen written against one reads the same in the other, and a fix here
 * usually applies to both.
 *
 * THE ONLY REAL DIFFERENCE IS TOKEN STORAGE. The web version used localStorage,
 * which does not exist in React Native. This uses expo-secure-store, which
 * encrypts the value at rest in the iOS Keychain and Android Keystore — strictly
 * better than the web original, and the reason the mobile port is a security
 * improvement rather than a compromise.
 *
 * ORIGINAL FILE HEADER FOLLOWS.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The Figma-generated UI was built with hardcoded data and a `notify()` stub.
 * This module is the single seam between the UI and the real FastAPI backend:
 * every fetch goes through `api()` so auth, base URL, and error handling are
 * defined in exactly one place.
 *
 * DESIGN (per the Day 1 hackathon spec)
 * -------------------------------------
 * - Base URL comes from `VITE_API_BASE` when set (so the same build can point
 *   at localhost, a tunnel, or a deployed API without a code change); it falls
 *   back to the local backend on :8000.
 * - The JWT is stored in expo-secure-store (`vc.token`) — encrypted at rest;
 *   this is the platform secure storage.
 * - `api()` attaches `Authorization: Bearer <token>` automatically and, on any
 *   401 outside login, clears the token so the UI can bounce to the login
 *   screen.
 */

import * as SecureStore from "expo-secure-store";

/**
 * Backend origin.
 *
 * Resolution order:
 *   1. VITE_API_BASE, when the build environment supplies it.
 *   2. The deployed Render backend.
 *   3. Local uvicorn, so a developer who sets nothing still works.
 *
 * WHY A COMMITTED DEFAULT
 * -----------------------
 * The deployed frontend was failing with "Network error" because it had been
 * built against a quick-tunnel URL that had since died. Correcting it required
 * editing a variable in the Cloudflare dashboard and rebuilding, but that flow
 * proved unreliable to reach, and a static bundle cannot pick up a changed
 * variable without a rebuild regardless.
 *
 * Committing the production URL means a plain `git push` produces a correct
 * build with no dashboard step, and it removes an entire class of "the build
 * ran but pointed somewhere stale" failures. The environment variable still
 * wins when set, so local development and any future backend move are
 * unaffected.
 */
function resolveApiBase(): string {
  // Expo exposes EXPO_PUBLIC_* variables at build time. The name differs from
  // the web client's VITE_* prefix because the tooling differs, but the
  // behaviour is the same: set it and it wins.
  const fromEnv = (process.env.EXPO_PUBLIC_API_BASE || "").trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  // __DEV__ is React Native's build-time flag. A development build talks to the
  // local API so a laptop can iterate without touching production data; a
  // production build uses the deployed backend.
  if (__DEV__) return "http://127.0.0.1:8000";

  return PRODUCTION_API_BASE;
}

/** The deployed backend. Change this if the backend moves. */
const PRODUCTION_API_BASE = "https://uni-companion.onrender.com";

export const API_BASE: string = resolveApiBase();

const TOKEN_KEY = "vc.token";

/** Error carrying the HTTP status so callers can branch (401 vs 429 vs 503). */
export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------
//
// SecureStore is asynchronous, but building request headers is not. Rather than
// make every caller await the token, we keep an in-memory mirror that is
// populated once at startup by `loadToken()` and kept in step by the setters.
//
// WHY THE MIRROR IS SAFE: it only ever holds the token for the current process
// lifetime, and the durable copy lives in the OS keychain. A cold start reads
// from SecureStore before any authenticated request is made (the root layout
// awaits loadToken), so the mirror is never stale in practice.

let cachedToken: string | null = null;

/**
 * Read the persisted token into memory. Call once during app startup, before
 * rendering anything that makes authenticated requests.
 */
export async function loadToken(): Promise<string | null> {
  try {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    // A corrupt or unavailable keystore should log the user out, not crash the
    // app. Worst case they sign in again.
    cachedToken = null;
  }
  return cachedToken;
}

export function getToken(): string | null {
  return cachedToken;
}

export async function setToken(token: string): Promise<void> {
  cachedToken = token;
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch {
    // Keep the in-memory value: the session still works for this run even if
    // the keystore refused to persist it.
  }
}

export async function clearToken(): Promise<void> {
  cachedToken = null;
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Nothing useful to do; the in-memory token is already gone.
  }
}

type ApiOptions = {
  method?: string;
  // JSON body (serialized automatically). Mutually exclusive with `rawBody`.
  body?: unknown;
  // Raw body string (used for CSV imports, if ever wired).
  rawBody?: string;
  // When false, no Authorization header is attached (login/signup).
  auth?: boolean;
  // Extra headers (e.g. x-auth-mode: api on login).
  headers?: Record<string, string>;
};

/**
 * Perform an authenticated JSON request against the backend.
 *
 * Returns the parsed JSON body (or null for empty/204 responses). Throws
 * `ApiError` on any non-2xx response, with the status attached.
 */
export async function api<T = unknown>(
  path: string,
  opts: ApiOptions = {},
): Promise<T> {
  const { method = "GET", body, rawBody, auth = true, headers = {} } = opts;

  const finalHeaders: Record<string, string> = { ...headers };
  if (body !== undefined || rawBody !== undefined) {
    finalHeaders["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (auth && token) {
    finalHeaders["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: finalHeaders,
      body:
        body !== undefined
          ? JSON.stringify(body)
          : rawBody !== undefined
            ? rawBody
            : undefined,
    });
  } catch {
    // Network-level failure (backend down, CORS blocked, DNS, etc.)
    throw new ApiError("Network error", 0, null);
  }

  // Any 401 outside login means the stored token is missing/expired: clear it
  // so the app reverts to the login screen instead of looping on failures.
  if (res.status === 401 && path !== "/api/v1/auth/login") {
    // Deliberately not awaited: clearing the keystore must not delay surfacing
    // the error to the caller, and the in-memory mirror is cleared synchronously.
    void clearToken();
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const detail =
      parsed && typeof parsed === "object" && "detail" in parsed
        ? String((parsed as { detail: unknown }).detail)
        : `HTTP ${res.status}`;
    throw new ApiError(detail, res.status, parsed);
  }

  return parsed as T;
}

// ---------------------------------------------------------------------------
// Convenience API calls used by the demo screens
// ---------------------------------------------------------------------------

export type DashboardData = {
  server_timestamp: string;
  today_slots: Array<{
    id: string;
    module_code?: string;
    start_time?: string;
    end_time?: string;
    location?: string;
  }>;
  urgent_tasks: Array<{
    id: string;
    title: string;
    module_code?: string;
    due_date?: string;
    priority?: string;
  }>;
  ai_quota: {
    usage_date: string;
    summaries_used: number;
    daily_limit: number;
    remaining_credits: number;
  };
  modules_count: number;
  // Total open deadlines. The list above is truncated, so a UI can say
  // "5 of 13" instead of letting a partial list look complete.
  total_open_tasks?: number;
};

/** Log in and return the raw access token (API mode). */
export async function login(email: string, password: string): Promise<string> {
  const data = await api<{ access_token: string }>("/api/v1/auth/login", {
    method: "POST",
    auth: false,
    headers: { "x-auth-mode": "api" },
    body: { email, password },
  });
  // Persist here, not only at the call site. Returning the token without
  // storing it meant a caller that forgot setToken() produced a logged-in
  // looking screen where every request was unauthenticated - the token was
  // silently dropped and every list came back empty.
  // AWAIT THIS. On web the equivalent line was once missing, so the token was
  // discarded after a successful login, every later request was unauthenticated,
  // and every list rendered its empty state - which looked like a broken backend.
  await setToken(data.access_token);
  return data.access_token;
}

/**
 * Create a new student account.
 *
 * The signup endpoint returns the created user (not a token), so callers should
 * follow up with `login()` to obtain an access token and enter the app.
 * `terms_version` / `privacy_version` are required by the backend schema.
 */
export async function signup(
  email: string,
  password: string,
  fullName: string,
  extra: {
    university?: string;
    fieldOfStudy?: string;
    yearOfStudy?: number;
  } = {},
): Promise<void> {
  await api("/api/v1/auth/signup", {
    method: "POST",
    auth: false,
    body: {
      email,
      password,
      full_name: fullName,
      university: extra.university ?? null,
      field_of_study: extra.fieldOfStudy ?? null,
      year_of_study: extra.yearOfStudy ?? null,
      terms_version: "1.0",
      privacy_version: "1.0",
    },
  });
}

/**
 * The signed-in student's profile, as returned by GET /auth/me.
 *
 * These are the real fields the backend stores; the Account view renders them
 * so the page shows genuine data rather than anything hardcoded.
 */
export type AccountProfile = {
  id: string;
  email: string;
  full_name: string | null;
  university: string | null;
  field_of_study: string | null;
  year_of_study: number | null;
  is_active: boolean;
  role: string;
  created_at: string;
};

/** Fetch the current user's profile (used for the greeting/name and Account). */
export async function getMe() {
  return api<AccountProfile>("/api/v1/auth/me");
}

/** The student's daily AI allowance and how much of it is left. */
export type QuotaInfo = {
  usage_date: string;
  summaries_used: number;
  daily_limit: number;
  remaining_credits: number;
};

/** Fetch the current user's AI quota (used by the Account view). */
export async function getQuota() {
  return api<QuotaInfo>("/api/v1/ai/quota");
}

/** Fetch the academic dashboard payload. */
export async function getDashboard() {
  return api<DashboardData>("/api/v1/academic/dashboard");
}

/** Fetch the list of the user's modules. */
export async function getModules() {
  return api<Array<{ id: string; code: string; name: string }>>(
    "/api/v1/academic/modules",
  );
}

/** Create a module. Requires a short `code` and the full module `name`. */
export async function createModule(code: string, name: string) {
  return api<{ id: string; code: string; name: string }>(
    "/api/v1/academic/modules",
    {
      method: "POST",
      body: { code, name },
    },
  );
}

/**
 * Delete a module.
 *
 * The endpoint answers 204 with no body, which api() already handles - it reads
 * the response as text and only parses when there is something to parse.
 */
export async function deleteModule(moduleId: string): Promise<void> {
  await api(`/api/v1/academic/modules/${moduleId}`, { method: "DELETE" });
}

export type AcademicTask = {
  id: string;
  module_id: string;
  module_code?: string | null;
  title: string;
  due_date: string;
  priority?: string;
  task_type?: string;
  is_completed?: boolean;
};

export type ActivityItem = {
  id: string;
  event_type: string;
  module_code?: string | null;
  created_at?: string | null;
};

/** Fetch the signed-in user's own recent activity (newest first). */
export async function getActivity(limit = 10): Promise<ActivityItem[]> {
  const data = await api<{ items: ActivityItem[] }>(
    `/api/v1/analytics/activity?limit=${limit}`,
  );
  return data.items ?? [];
}

// ---------------------------------------------------------------------------
// At-risk detection
// ---------------------------------------------------------------------------

export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM";

export type AtRiskTask = {
  task_id: string;
  title: string;
  module_code: string;
  task_type: string;
  priority: string;
  due_date: string;
  weight_percentage?: number | null;
  level: RiskLevel;
  reason: string;
  days_until_due: number;
};

export type RiskSignal = { kind: string; level: string; message: string };

export type AtRisk = {
  generated_at: string;
  horizon_days: number;
  counts: { critical: number; high: number; medium: number; total: number };
  signals: RiskSignal[];
  tasks: AtRiskTask[];
};

/** Fetch the student's at-risk deadlines and workload signals. */
export async function getAtRisk(days = 14): Promise<AtRisk> {
  return api<AtRisk>(`/api/v1/academic/at-risk?days=${days}`);
}

export type StudyMaterial = {
  id: string;
  module_code: string;
  title: string;
  url: string;
  description?: string | null;
  resource_type: string; // YOUTUBE | JOURNAL | PDF | ARTICLE
  quality_resolution?: string | null;
};

export type MaterialPage = {
  items: StudyMaterial[];
  total: number;
  page: number;
  size: number;
  pages: number;
};

export type SummaryHistoryItem = {
  id: string;
  module_code: string;
  preview: string;
  tokens_used: number;
  created_at?: string | null;
};

/** Fetch the user's summary history (newest first, previews only). */
export async function getSummaryHistory(
  limit = 20,
): Promise<SummaryHistoryItem[]> {
  const data = await api<{ items: SummaryHistoryItem[] }>(
    `/api/v1/ai/summaries?limit=${limit}`,
  );
  return data.items ?? [];
}

export type Recommendations = {
  module_code: string;
  module_name: string;
  ai_brief: string | null;
  ai_available: boolean;
  cached: boolean;
  materials: StudyMaterial[];
};

/**
 * Fetch AI study recommendations for one of the user's modules.
 * The module must belong to the caller (404 otherwise).
 */
export async function getRecommendations(
  moduleCode: string,
): Promise<Recommendations> {
  return api<Recommendations>(
    `/api/v1/ai/modules/${encodeURIComponent(moduleCode)}/recommendations`,
  );
}

// ---------------------------------------------------------------------------
// "Chat with your brief" (RAG)
// ---------------------------------------------------------------------------

export type Brief = {
  id: string;
  source_name: string;
  char_count: number;
  chunk_count: number;
  created_at?: string | null;
};

export type BriefCitation = { ordinal: number; text: string };

export type BriefAnswer = {
  answer: string;
  citations: BriefCitation[];
  ai_available: boolean;
};

/** Store a brief (already-extracted text) so it can be questioned. */
export async function createBrief(
  sourceName: string,
  content: string,
): Promise<Brief> {
  return api<Brief>("/api/v1/ai/briefs", {
    method: "POST",
    body: { source_name: sourceName, content },
  });
}

/** List the caller's briefs (metadata only). */
export async function getBriefs(): Promise<Brief[]> {
  const data = await api<{ items: Brief[] }>("/api/v1/ai/briefs");
  return data.items ?? [];
}

/** Ask a question about one of the caller's briefs. */
export async function askBrief(
  briefId: string,
  question: string,
): Promise<BriefAnswer> {
  return api<BriefAnswer>(`/api/v1/ai/briefs/${briefId}/ask`, {
    method: "POST",
    body: { question },
  });
}

/**
 * Search study materials for a module. `moduleCode` is REQUIRED by the backend.
 * `q` is an optional free-text filter. `resourceType` narrows to one type.
 */
export async function searchMaterials(params: {
  moduleCode: string;
  q?: string;
  resourceType?: string;
  page?: number;
  size?: number;
}): Promise<MaterialPage> {
  const qs = new URLSearchParams();
  qs.set("module_code", params.moduleCode);
  if (params.q?.trim()) qs.set("q", params.q.trim());
  if (params.resourceType) qs.set("resource_type", params.resourceType);
  qs.set("page", String(params.page ?? 1));
  qs.set("size", String(params.size ?? 20));
  return api<MaterialPage>(`/api/v1/materials/search?${qs.toString()}`);
}

export type IngestResult = {
  module_code: string;
  inserted: number;
  updated: number;
  total: number;
  skipped: boolean;
  topics?: string[];
  message: string;
};

/**
 * Ask the server to find real resources for one of YOUR modules.
 *
 * The student types the module themselves (nothing is auto-filled); this only
 * goes and finds resources FOR it. Only a module code is sent — the server
 * builds every outbound URL itself from an allow-list, so a caller can never
 * make it fetch an arbitrary address.
 *
 * Can take a while (it queries Wikipedia/arXiv/Open Library and validates every
 * link), so callers should show progress.
 */
export async function ingestModuleResources(
  moduleCode: string,
): Promise<IngestResult> {
  return api<IngestResult>(
    `/api/v1/materials/modules/${encodeURIComponent(moduleCode)}/ingest`,
    { method: "POST" },
  );
}

/** Fetch the user's tasks (paginated envelope: { items, total, ... }). */
export async function getTasks() {
  const data = await api<{ items: AcademicTask[]; total: number }>(
    "/api/v1/academic/tasks?size=20",
  );
  return data.items ?? [];
}

/**
 * Fetch up to `limit` tasks for the planner view (walks the paginated
 * envelope). Capped so the planner never issues an unbounded number of calls.
 */
export async function getAllTasks(limit = 100): Promise<AcademicTask[]> {
  const pageSize = 50;
  const collected: AcademicTask[] = [];
  let page = 1;
  while (collected.length < limit) {
    const data = await api<{
      items: AcademicTask[];
      total: number;
      pages: number;
    }>(`/api/v1/academic/tasks?size=${pageSize}&page=${page}`);
    collected.push(...(data.items ?? []));
    if (!data.items || data.items.length === 0) break;
    if (page >= (data.pages ?? 1)) break;
    page += 1;
  }
  return collected.slice(0, limit);
}

/**
 * Create a deadline/task. The backend requires `module_id`, `title` and
 * `due_date` (ISO-8601, UTC). `priority` and `task_type` are optional but
 * constrained to the enums below.
 */
export async function createTask(input: {
  moduleId: string;
  title: string;
  dueDate: string; // ISO-8601
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  taskType?: "ASSIGNMENT" | "EXAM" | "TEST" | "QUIZ";
  weightPercentage?: number | null;
}) {
  return api<AcademicTask>("/api/v1/academic/tasks", {
    method: "POST",
    body: {
      module_id: input.moduleId,
      title: input.title,
      due_date: input.dueDate,
      priority: input.priority ?? "MEDIUM",
      task_type: input.taskType ?? "ASSIGNMENT",
      weight_percentage: input.weightPercentage ?? null,
    },
  });
}

/** Mark a task complete. */
export async function completeTask(taskId: string) {
  return api(`/api/v1/academic/tasks/${taskId}/complete`, {
    method: "PATCH",
    body: { is_completed: true },
  });
}

/** Request an AI summary for the given module + pasted content. */
export async function summarize(moduleCode: string, content: string) {
  return api<{
    summary: string;
    cached: boolean;
    remaining_credits: number;
    daily_limit: number;
  }>("/api/v1/ai/summarize", {
    method: "POST",
    body: { module_code: moduleCode, content },
  });
}

export type LinkFetchResult = {
  url: string;
  title: string;
  text: string;
  truncated: boolean;
  characters: number;
};

/**
 * Ask the server to read a web page so its text can be summarised.
 *
 * Only the URL is sent. The server performs the fetch itself under a strict
 * SSRF policy, so a student cannot use this to reach internal addresses.
 */
export async function fetchLinkText(url: string): Promise<LinkFetchResult> {
  return api<LinkFetchResult>("/api/v1/ai/fetch-link", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}
