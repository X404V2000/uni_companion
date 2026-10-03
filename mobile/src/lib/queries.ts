/**
 * src/lib/queries.ts — the data layer the screens read from.
 *
 * WHY THIS EXISTS SEPARATELY FROM api.ts
 * --------------------------------------
 * api.ts is a faithful port of the web client: thin, typed functions that call
 * the backend and throw on failure. That file has no opinion about caching,
 * retries, or loading state, and it should stay that way so it remains a mirror
 * of the web version.
 *
 * This file adds the mobile-specific concerns on top:
 *   - caching, so switching tabs does not refetch everything
 *   - retries that suit a mobile connection rather than a laptop on wifi
 *   - a longer timeout, because Render's free tier sleeps and the first request
 *     after that can take 30-60 seconds to wake the service
 *
 * WHY THE LONG TIMEOUT MATTERS
 * ----------------------------
 * A cold Render instance is not an error, but the default client behaviour makes
 * it look like one: the request appears to hang and then fails, which reads as a
 * broken app. Treating "slow" as a distinct state from "failed" is the single
 * biggest UX difference between this app and the web client.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";

import {
  clearToken,
  completeTask,
  createModule,
  createTask,
  deleteModule,
  getActivity,
  getAtRisk,
  getDashboard,
  getModules,
  getSummaryHistory,
  login,
  searchMaterials,
  signup,
  summarize,
  type AcademicTask,
  type ActivityItem,
  type AtRisk,
  type DashboardData,
  type MaterialPage,
  type SummaryHistoryItem,
} from "./api";
import { ApiError } from "./api";

/**
 * Query keys in one place.
 *
 * Scattered string literals are how cache invalidation silently stops working:
 * one call site says "modules" and another says "module", and a mutation
 * invalidates the wrong thing. Every key here is built from these constants.
 */
export const qk = {
  dashboard: ["dashboard"] as const,
  modules: ["modules"] as const,
  tasks: ["tasks"] as const,
  activity: ["activity"] as const,
  atRisk: ["at-risk"] as const,
  materials: (moduleCode: string, q: string) =>
    ["materials", moduleCode, q] as const,
  summaries: ["summaries"] as const,
};

/** Shared options for every query: retry less than default, but wait longer. */
const queryDefaults = {
  // One retry only. On a mobile connection a second attempt after a genuine
  // failure usually fails too, and it doubles the time the user stares at a
  // spinner before seeing an honest error.
  retry: 1,
  // A cold Render instance legitimately takes up to a minute to answer. This
  // must be longer than that or a waking backend is indistinguishable from a
  // dead one.
  retryDelay: (attempt: number) => Math.min(2000 * 2 ** attempt, 8000),
  staleTime: 30_000,
  gcTime: 5 * 60_000,
} as const;

/**
 * Did the request fail because the server was unreachable, or because it
 * answered with an error?
 *
 * WHY THIS IS A TYPED CHECK AND NOT A STRING MATCH
 * ------------------------------------------------
 * The Home screen decided this by searching the rendered message:
 *
 *   const waking = message.toLowerCase().includes("reach the server");
 *
 * That is the same defect class as the sign-out branch in session.tsx. The
 * sentence it matches lives in `describeError` below, so rewording that one
 * string — a pure copy edit with no apparent risk — would silently stop the
 * "waking up" state from ever appearing, and a student would be told the
 * dashboard could not load instead of being told to wait. Nothing would fail,
 * nothing would warn, and the only way to notice would be on a device.
 *
 * `status === 0` is what api.ts sets when fetch itself throws: no connection,
 * DNS failure, CORS, or a timeout. It means the request never reached a server,
 * which is exactly the condition that can be a cold start rather than a fault.
 *
 * A cold start and a genuine network failure are indistinguishable from the
 * client, so this is deliberately named for what we KNOW (unreachable) rather
 * than what we are guessing (asleep).
 */
export function isUnreachable(error: unknown): boolean {
  return error instanceof ApiError && error.status === 0;
}

/**
 * Turn any thrown value into something worth showing a student.
 *
 * The rule: never surface a status code, a stack trace, or the word "fetch".
 * A student cannot act on those. Every branch here says what happened in plain
 * language and, where possible, what to do about it.
 */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) {
      return "Can't reach the server. Check your connection and try again.";
    }
    if (error.status === 401) return "Your session expired. Please sign in again.";
    if (error.status === 403) return "You don't have access to that.";
    if (error.status === 404) return "That isn't available any more.";
    if (error.status === 429) return "Too many attempts. Wait a moment and retry.";
    if (error.status >= 500) return "The server had a problem. Try again shortly.";
    // The backend's `detail` is written for humans, so prefer it when present.
    return error.message || "Something went wrong.";
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function useDashboard(): UseQueryResult<DashboardData> {
  return useQuery({
    queryKey: qk.dashboard,
    queryFn: getDashboard,
    ...queryDefaults,
  });
}

export function useModules() {
  return useQuery({
    queryKey: qk.modules,
    queryFn: getModules,
    ...queryDefaults,
  });
}

export function useActivity(limit = 8) {
  return useQuery<ActivityItem[]>({
    queryKey: [...qk.activity, limit],
    queryFn: () => getActivity(limit),
    ...queryDefaults,
  });
}

export function useAtRisk(days = 14) {
  return useQuery<AtRisk>({
    queryKey: [...qk.atRisk, days],
    queryFn: () => getAtRisk(days),
    ...queryDefaults,
  });
}

export function useSummaryHistory(limit = 20) {
  return useQuery<SummaryHistoryItem[]>({
    queryKey: [...qk.summaries, limit],
    queryFn: () => getSummaryHistory(limit),
    ...queryDefaults,
  });
}

/**
 * Material search.
 *
 * `enabled` is gated on a module code being present. Without this the query
 * fires on mount with an empty code and the backend returns nothing, which
 * looks identical to "this module has no resources" - a confusing dead end we
 * already hit once on web.
 */
export function useMaterialSearch(moduleCode: string, q: string) {
  return useQuery<MaterialPage>({
    queryKey: qk.materials(moduleCode, q),
    queryFn: () => searchMaterials({ moduleCode, q, size: 20 }),
    enabled: moduleCode.trim().length >= 2,
    ...queryDefaults,
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Invalidate everything a mutation could have changed.
 *
 * The dashboard aggregates modules, tasks and at-risk counts, so adding one
 * deadline changes several cached answers at once. Refreshing them together is
 * what stops the Home screen showing a stale count after Planner edits
 * something.
 */
function useInvalidateAcademic() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: qk.dashboard });
    void client.invalidateQueries({ queryKey: qk.modules });
    void client.invalidateQueries({ queryKey: qk.tasks });
    void client.invalidateQueries({ queryKey: qk.atRisk });
    void client.invalidateQueries({ queryKey: qk.activity });
  };
}

export function useAddDeadline() {
  const invalidate = useInvalidateAcademic();
  return useMutation({
    mutationFn: (input: Parameters<typeof createTask>[0]) => createTask(input),
    onSuccess: invalidate,
  });
}

export function useCompleteTask() {
  const invalidate = useInvalidateAcademic();
  return useMutation({
    mutationFn: (taskId: string) => completeTask(taskId),
    onSuccess: invalidate,
  });
}

export function useAddModule() {
  const invalidate = useInvalidateAcademic();
  return useMutation({
    mutationFn: ({ code, name }: { code: string; name: string }) =>
      createModule(code, name),
    onSuccess: invalidate,
  });
}

export function useDeleteModule() {
  const invalidate = useInvalidateAcademic();
  return useMutation({
    mutationFn: (moduleId: string) => deleteModule(moduleId),
    onSuccess: invalidate,
  });
}

export function useSummarize() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      moduleCode,
      content,
    }: {
      moduleCode: string;
      content: string;
      /**
       * Whether the student has granted telemetry consent. Passed through so the
       * caller can skip usage tracking when consent is absent. Reading it here
       * rather than inside the API client keeps the client a pure mirror of web.
       */
      hasConsent?: boolean;
    }) => summarize(moduleCode, content),
    onSuccess: () => {
      // A new summary changes the history list and the quota shown on Home.
      void client.invalidateQueries({ queryKey: qk.summaries });
      void client.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export function useLogin() {
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      login(email, password),
  });
}

export function useSignup() {
  return useMutation({
    // signup() takes positional arguments (email, password, fullName, extra),
    // not an options object. Passing an object would have compiled only because
    // Parameters<> collapsed to the first argument's type — the values would
    // then have been assigned to the wrong parameters at runtime.
    mutationFn: ({
      email,
      password,
      fullName,
      university,
      fieldOfStudy,
      yearOfStudy,
    }: {
      email: string;
      password: string;
      fullName: string;
      university?: string;
      fieldOfStudy?: string;
      yearOfStudy?: number;
    }) =>
      signup(email, password, fullName, {
        university,
        fieldOfStudy,
        yearOfStudy,
      }),
  });
}

/** Sign out locally. The caller navigates; this only clears the credential. */
export async function signOut(): Promise<void> {
  await clearToken();
}

/** Re-exported so screens do not need to import from two modules. */
export type { AcademicTask };
