/**
 * src/lib/api.ts — ScrapyMog API helper (hackathon wiring).
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
 * - The JWT is stored in localStorage (`vc.token`) — acceptable for a demo;
 *   production would use platform secure storage / HttpOnly cookies.
 * - `api()` attaches `Authorization: Bearer <token>` automatically and, on any
 *   401 outside login, clears the token so the UI can bounce to the login
 *   screen.
 */

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
  const fromEnv = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  // A local build (dev server, or a build run on a laptop) should talk to the
  // local API rather than production, so the committed default only applies to
  // production builds.
  if (import.meta.env.DEV) return "http://127.0.0.1:8000";

  return PRODUCTION_API_BASE;
}

/** The deployed backend. Change this if the backend moves. */
const PRODUCTION_API_BASE = "https://uni-companion.onrender.com";

export const API_BASE: string = resolveApiBase();

const TOKEN_KEY = "vc.token";
const REFRESH_KEY = "vc.refresh";

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

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  // The refresh token is part of the session. Leaving it behind would let a
  // "logged out" browser silently mint a new access token - which is not a
  // logout, and is the same reasoning as the backend revoking on logout.
  localStorage.removeItem(REFRESH_KEY);
}

// ---------------------------------------------------------------------------
// Refresh tokens
// ---------------------------------------------------------------------------
//
// WHY THE WEB APP NOW KEEPS ONE
// -----------------------------
// Every student was logged out every 15 minutes. The backend has always been able
// to refresh - the mobile client uses it - but the web client discarded the
// refresh token at login and never asked for another access token. So a student
// reading a long brief, or a tester leaving a tab open, lost their session
// mid-task and had to retype a password.
//
// SECURITY NOTE, STATED PLAINLY
// -----------------------------
// This puts a long-lived credential in localStorage, which is readable by any
// script on the page. That is a real trade-off and it is deliberate: the backend
// issues one in API mode only, and the alternative - an HttpOnly cookie - is not
// available to a client that talks to the API with a Bearer header.
//
// It is bounded by: rotation on every use (so a stolen token is usable once), and
// reuse detection (so a replay revokes the whole chain and forces a fresh login).
// Those are what make a localStorage refresh token acceptable rather than reckless.

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_KEY, token);
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
/**
 * THE SINGLE-FLIGHT REFRESH LOCK.
 *
 * WHY ONE MODULE-LEVEL PROMISE, AND NOT A CHECK PER CALLER
 * -------------------------------------------------------
 * When an access token expires, several in-flight requests receive 401 at the same
 * moment - the dashboard fires three requests on mount. A naive implementation
 * starts three refreshes. With rotation enabled on the backend, the first consumes
 * the refresh token and the other two present a token that has ALREADY been used -
 * which the backend correctly treats as theft, revoking the whole chain and signing
 * the student out precisely BECAUSE they were active.
 *
 * So the lock is not an optimisation. It is what stops the reuse-detection
 * mechanism from firing on the app's own concurrency.
 *
 * `finally` matters: if the refresh throws, the promise must still be cleared, or
 * every later 401 awaits a settled-and-gone promise forever and the session can
 * never recover.
 */
let refreshInFlight: Promise<boolean> | null = null;

/** Paths that must never trigger the interceptor (or it recurses on itself). */
const AUTH_PATHS = new Set([
  "/api/v1/auth/login",
  "/api/v1/auth/signup",
  "/api/v1/auth/refresh",
]);

/**
 * Endpoints where a 401 means "the password you just typed is wrong", NOT "your session
 * is over".
 *
 * `DELETE /api/v1/auth/account` requires the current password as re-authentication, and
 * answers 401 for a bad one. Without this set, the shared 401 handler would clear the
 * access token - signing the student out of a perfectly valid session because they
 * mistyped a password on a destructive action. The session is fine; only the password was
 * wrong, and the screen needs to say so and let them retry.
 */
const REAUTH_PATHS = new Set(["/api/v1/auth/account"]);

async function doRefresh(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;

  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
    };
    if (!data.access_token || !data.refresh_token) return false;
    // Store BOTH. The refresh token is single-use, so keeping the old one would
    // make the very next refresh look like a replay.
    setToken(data.access_token);
    setRefreshToken(data.refresh_token);
    return true;
  } catch {
    // A network failure is not a rejected session. Return false so the caller
    // stops, but do NOT clear the tokens - the student may simply be offline and
    // should stay signed in. Clearing here is how an app logs people out on a
    // dropped connection.
    return false;
  }
}

/**
 * Refresh at most once concurrently, and let every caller await the same result.
 *
 * Exported so the concurrency behaviour can be tested directly rather than only
 * through a request.
 */
export function refreshOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/**
 * Turn a failed response body into a sentence a student can act on.
 *
 * THE BUG THIS FIXES (user 7: "in need of helpful error messages")
 * ---------------------------------------------------------------
 * FastAPI answers a validation failure with a LIST, not a string:
 *
 *   {"detail":[{"type":"string_too_short","loc":["body","code"],
 *               "msg":"String should have at least 2 characters","input":"A"}]}
 *
 * The old code did `String(detail)`, and `String()` on an array of objects gives
 * "[object Object]". So any field a student mistyped - a one-character module
 * code, an empty deadline title - displayed literally nothing useful, or the
 * string "[object Object]" if the array had a single item. That is the single
 * most common way to make this app fail, and it said nothing.
 *
 * Now: validation arrays become one sentence per bad field, naming the field in
 * the student's language ("Module code") and what was wrong in plain words.
 */
function extractDetail(parsed: unknown, status: number): string {
  if (!parsed || typeof parsed !== "object" || !("detail" in parsed)) {
    return `HTTP ${status}`;
  }

  const detail = (parsed as { detail: unknown }).detail;

  // The normal case: the backend wrote a sentence for a human.
  if (typeof detail === "string" && detail.trim()) return detail;

  // FastAPI validation array.
  if (Array.isArray(detail)) {
    const sentences = detail
      .map((item) => describeValidationItem(item))
      .filter((s): s is string => Boolean(s));
    if (sentences.length > 0) return sentences.join(" ");
  }

  if (detail && typeof detail === "object") {
    const msg = (detail as { msg?: unknown }).msg;
    if (typeof msg === "string" && msg.trim()) return msg;
  }

  return `HTTP ${status}`;
}

/** Field names as a student would recognise them. */
const FIELD_LABELS: Record<string, string> = {
  code: "Module code",
  name: "Module name",
  email: "Email address",
  password: "Password",
  full_name: "Full name",
  title: "Title",
  due_at: "Due date",
  module_id: "Module",
  description: "Description",
  module_code: "Module code",
  notes: "Notes",
};

function describeValidationItem(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as { type?: unknown; loc?: unknown; msg?: unknown };

  // The last element of `loc` is the field; the first is "body"/"query".
  const loc = Array.isArray(obj.loc) ? obj.loc : [];
  const rawField = loc.length > 0 ? String(loc[loc.length - 1]) : "";
  const field = FIELD_LABELS[rawField] ?? (rawField ? rawField.replace(/_/g, " ") : "");

  const type = typeof obj.type === "string" ? obj.type : "";

  // Known validators get a sentence written for a person, not a computer.
  switch (type) {
    case "string_too_short":
      return field ? `${field} is too short.` : "A value is too short.";
    case "string_too_long":
      return field ? `${field} is too long.` : "A value is too long.";
    case "missing":
      return field ? `${field} is required.` : "A required field is missing.";
    case "value_error": {
      // Custom validators (e.g. normalize_code) raise ValueError with their own text.
      const msg = typeof obj.msg === "string" ? obj.msg.replace(/^Value error,\s*/i, "") : "";
      return msg ? `${field ? field + ": " : ""}${msg}.` : field ? `${field} is invalid.` : null;
    }
    case "string_pattern_mismatch":
    case "string_type":
      return field ? `${field} is not in the expected format.` : "A value is in the wrong format.";
    case "greater_than":
    case "greater_than_equal":
    case "less_than":
    case "less_than_equal":
      return field ? `${field} is out of range.` : "A value is out of range.";
    case "datetime_parsing":
    case "date_parsing":
      return field ? `${field} is not a valid date.` : "A date could not be read.";
    case "int_parsing":
    case "float_parsing":
      return field ? `${field} must be a number.` : "A value must be a number.";
    default: {
      const msg = typeof obj.msg === "string" ? obj.msg.trim() : "";
      if (msg) return field ? `${field}: ${msg}` : msg;
      return field ? `${field} is invalid.` : null;
    }
  }
}

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

  // A 401 on a normal request means the ACCESS token expired. Try exactly one
  // refresh, then replay this request once.
  //
  // WHY ONCE, WITH NO BUDGET OR QUEUE
  // A retry loop can hammer the backend during an outage, and a queue needs a
  // policy nobody has specified. One replay is enough for the real case - a token
  // that expired while the student was reading - and anything more is a loop.
  //
  // The auth paths are exempt: a 401 from /auth/refresh means "no session", not
  // "refresh and retry", and retrying there would recurse.
  //
  // Re-authentication paths are exempt too: a 401 from `DELETE /auth/account` means the
  // PASSWORD was wrong, so refreshing the token and replaying the delete would resend the
  // same wrong password and 401 again - a wasted round trip that changes nothing.
  if (res.status === 401 && !AUTH_PATHS.has(path) && !REAUTH_PATHS.has(path)) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      // Replay with the SAME method, headers and body. A replayed POST that loses
      // its body is a silent data-loss bug.
      const retryHeaders: Record<string, string> = { ...finalHeaders };
      const fresh = getToken();
      if (fresh) retryHeaders["Authorization"] = `Bearer ${fresh}`;
      try {
        res = await fetch(API_BASE + path, {
          method,
          headers: retryHeaders,
          body:
            body !== undefined
              ? JSON.stringify(body)
              : rawBody !== undefined
                ? rawBody
                : undefined,
        });
      } catch {
        throw new ApiError("Network error", 0, null);
      }
    }
    // Still 401 after a successful refresh, or the refresh failed.
    //
    // ⚠️ NOT every 401 means the session is over. `DELETE /auth/account` returns 401 when
    // the re-authentication PASSWORD is wrong, while the access token is perfectly valid.
    // Clearing the token there would log a student out of a good session because they
    // mistyped their password on a destructive action - the opposite of what they asked
    // for. Those endpoints are listed in REAUTH_PATHS and are exempt.
    if (res.status === 401 && !REAUTH_PATHS.has(path)) {
      clearToken();
    }
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
    const detail = extractDetail(parsed, res.status);
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

/**
 * End the session server-side: clears the auth cookie and REVOKES the refresh token.
 *
 * WHY THIS EXISTS, AND WHY THE ORDER AT THE CALL SITE MATTERS
 * ----------------------------------------------------------
 * Signing out used to be local-only - `forgetSession()` cleared the browser and nothing
 * was told to the server. That was adequate when the access token was the only
 * credential, because it expired within 15 minutes regardless.
 *
 * It stopped being adequate at migration `0013`, which introduced a 7-day refresh token.
 * A logout that never reaches the server leaves that token VALID, so the next time the
 * app opens it can silently mint a new access token - the student signed out and is still
 * signed in. On a shared machine, which is what a campus lab is, that is someone else
 * holding a live session.
 *
 * The refresh token is sent in the body for that reason: the cookie is cleared either
 * way, but only a token the server recognises can be revoked. Called without it, the
 * request still succeeds and still clears the cookie - it just cannot revoke, so a stale
 * token would survive until it expires on its own.
 *
 * Best-effort by design, and it never throws on the network. A student on a dead
 * connection must still be able to sign out; the alternative - staying "signed in"
 * because the server is unreachable - is the worse failure.
 */
export async function logout(): Promise<void> {
  const refresh = getRefreshToken();
  try {
    await api("/api/v1/auth/logout", {
      method: "POST",
      body: refresh ? { refresh_token: refresh } : undefined,
    });
  } catch {
    // Deliberately swallowed. The caller clears local state regardless, so a failed
    // revoke degrades to the previous behaviour rather than trapping the student in a
    // session they have asked to end.
  }
}

/** Log in and return the raw access token (API mode). */
export async function login(email: string, password: string): Promise<string> {
  const data = await api<{ access_token: string; refresh_token?: string }>("/api/v1/auth/login", {
    method: "POST",
    auth: false,
    headers: { "x-auth-mode": "api" },
    body: { email, password },
  });
  // Persist here, not only at the call site. Returning the token without
  // storing it meant a caller that forgot setToken() produced a logged-in
  // looking screen where every request was unauthenticated - the token was
  // silently dropped and every list came back empty.
  setToken(data.access_token);
  // Keep the long-lived half of the session, so a 15-minute access token no
  // longer ends the session. Optional in the type because a non-API-mode client
  // would not receive one.
  if (data.refresh_token) setRefreshToken(data.refresh_token);
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
 * `moduleName` is the student's own module title, used only as a small relevance nudge.
 */
export async function searchMaterials(params: {
  moduleCode: string;
  q?: string;
  resourceType?: string;
  page?: number;
  size?: number;
  moduleName?: string;
  includeYoutube?: boolean;
}): Promise<MaterialPage> {
  const qs = new URLSearchParams();
  qs.set("module_code", params.moduleCode);
  if (params.q?.trim()) qs.set("q", params.q.trim());
  if (params.resourceType) qs.set("resource_type", params.resourceType);

  // Sent only when present. The backend treats it as optional, and an empty string
  // would be a meaningless value to pass - so an absent name sends no parameter at all
  // rather than `module_name=`.
  if (params.moduleName?.trim()) qs.set("module_name", params.moduleName.trim());

  // Sent ONLY when true.
  //
  // WHY NOT `qs.set("include_youtube", String(params.includeYoutube ?? false))`:
  // that always emits the parameter, so every request would carry a key the previous
  // client never sent. Sending it only when it changes the answer keeps the default
  // request byte-identical to before the parameter existed, which is what makes the
  // backend change non-breaking in practice rather than only on paper.
  if (params.includeYoutube) qs.set("include_youtube", "true");

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
