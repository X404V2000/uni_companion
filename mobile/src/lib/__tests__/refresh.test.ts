/**
 * src/lib/__tests__/refresh.test.ts — the single-flight refresh.
 *
 * THE DEFECT THESE TESTS PIN
 * --------------------------
 * The mobile client discarded the refresh token at login and never asked for another
 * access token, so the 15-minute access token was the whole session: a student was signed
 * out four times an hour. The backend has issued a 7-day refresh token since migration
 * `0013`; this client threw it away.
 *
 * WHY THE STAMPEDE TEST IS THE ACCEPTANCE GATE
 * --------------------------------------------
 * The dashboard fires several requests at once. When the access token expires they all
 * 401 together. With ROTATION enabled, the first refresh consumes the token and the rest
 * present an already-used one - which the server correctly treats as theft and revokes
 * the chain. So the student is signed out precisely because they were active.
 *
 * The lock is therefore not an optimisation; it is what stops the app's own concurrency
 * from triggering reuse detection. A test that only proved "refresh works" would pass
 * against the broken version.
 *
 * expo-secure-store is mocked as a real in-memory keychain, so read-after-write is
 * exercised rather than stubbed away.
 */

import * as SecureStore from "expo-secure-store";

import { ApiError, api, clearToken, loadRefreshToken, login, refreshOnce } from "../api";

const mockStore = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mockStore.set(k, v);
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    mockStore.delete(k);
  }),
}));

// The mock must match the REAL Response shape. doRefresh() uses res.json() while api()
// uses res.text(), so a mock providing only one of them would fail for a reason that
// does not exist in production - which is exactly what happened on first run.
const ok = (body: unknown) =>
  ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
  }) as Response;
const unauth = () =>
  ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ detail: "Not authenticated" }),
  }) as Response;

describe("refresh token storage", () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  it("stores the refresh token at login instead of discarding it", async () => {
    // THE REGRESSION. Before this, login() typed the response as { access_token } and
    // dropped refresh_token entirely, which is why the session lasted 15 minutes.
    global.fetch = jest.fn(async () =>
      ok({ access_token: "A1", refresh_token: "R1" }),
    ) as unknown as typeof fetch;

    await login("a@b.com", "pw");

    expect(await SecureStore.getItemAsync("vc.refresh")).toBe("R1");
  });

  it("does not crash when the backend omits a refresh token", async () => {
    // API mode issues one; a non-API-mode response must not break the client.
    global.fetch = jest.fn(async () => ok({ access_token: "A1" })) as unknown as typeof fetch;

    await expect(login("a@b.com", "pw")).resolves.toBe("A1");
  });

  it("clears the refresh token on logout", async () => {
    // A logout that leaves a 7-day credential in the keystore is not a logout.
    mockStore.set("vc.refresh", "R1");
    mockStore.set("vc.token", "A1");
    await loadRefreshToken();

    await clearToken();

    expect(await SecureStore.getItemAsync("vc.refresh")).toBeNull();
    expect(await SecureStore.getItemAsync("vc.token")).toBeNull();
  });
});

describe("the stampede", () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
    mockStore.set("vc.refresh", "R1");
    mockStore.set("vc.token", "OLD");
    return loadRefreshToken();
  });

  it("calls the refresh endpoint EXACTLY ONCE for three concurrent 401s", async () => {
    // THE ACCEPTANCE GATE. Three requests 401 together; the lock must collapse them
    // into one refresh, and every one of them must then succeed on replay.
    let refreshCalls = 0;
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.includes("/auth/refresh")) {
        refreshCalls += 1;
        // A small delay widens the window in which a second caller would start its own
        // refresh if the lock were absent. Without it the test could pass by timing.
        await new Promise((r) => setTimeout(r, 25));
        return ok({ access_token: "A2", refresh_token: "R2" });
      }
      const auth = (init?.headers as Record<string, string> | undefined)?.[
        "Authorization"
      ];
      return auth === "Bearer A2" ? ok({ data: "ok" }) : unauth();
    }) as unknown as typeof fetch;

    const results = await Promise.all([
      api("/api/v1/academic/tasks"),
      api("/api/v1/academic/tasks"),
      api("/api/v1/academic/tasks"),
    ]);

    expect(refreshCalls).toBe(1);
    expect(results).toHaveLength(3);
  });

  it("rotates the stored refresh token, so the next refresh is not a replay", async () => {
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/auth/refresh")) {
        return ok({ access_token: "A2", refresh_token: "R2" });
      }
      const auth = (init?.headers as Record<string, string> | undefined)?.[
        "Authorization"
      ];
      return auth === "Bearer A2" ? ok({}) : unauth();
    }) as unknown as typeof fetch;

    await refreshOnce();

    // Keeping the old token would make the very next refresh look like a replayed
    // credential, which the backend treats as theft.
    expect(await SecureStore.getItemAsync("vc.refresh")).toBe("R2");
    expect(await SecureStore.getItemAsync("vc.token")).toBe("A2");
  });

  it("does not recurse when /auth/refresh itself returns 401", async () => {
    // Second discriminating test the architect asked for. Without the AUTH_PATHS
    // exemption a dead refresh token recurses until the stack runs out.
    let refreshCalls = 0;
    global.fetch = jest.fn(async (url: string) => {
      if (String(url).includes("/auth/refresh")) {
        refreshCalls += 1;
        return unauth();
      }
      return unauth();
    }) as unknown as typeof fetch;

    await expect(api("/api/v1/academic/tasks")).rejects.toBeInstanceOf(ApiError);

    // Called once via the interceptor, not unbounded.
    expect(refreshCalls).toBeLessThanOrEqual(2);
  });

  it("replays the original request preserving method and body", async () => {
    // A replayed POST that loses its body is a silent data-loss bug - it appears to
    // save and does not.
    const seen: Array<{ method?: string; body?: unknown }> = [];
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/auth/refresh")) {
        return ok({ access_token: "A2", refresh_token: "R2" });
      }
      seen.push({ method: init?.method, body: init?.body });
      const auth = (init?.headers as Record<string, string> | undefined)?.[
        "Authorization"
      ];
      return auth === "Bearer A2" ? ok({}) : unauth();
    }) as unknown as typeof fetch;

    await api("/api/v1/academic/tasks", { method: "POST", body: { title: "Essay" } });

    expect(seen).toHaveLength(2); // the 401, then the replay
    expect(seen[1].method).toBe("POST");
    expect(seen[1].body).toBe(JSON.stringify({ title: "Essay" }));
  });

  it("signs out when the refresh fails, rather than looping", async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (String(url).includes("/auth/refresh")) return unauth();
      return unauth();
    }) as unknown as typeof fetch;

    await expect(api("/api/v1/academic/tasks")).rejects.toBeInstanceOf(ApiError);
    expect(await SecureStore.getItemAsync("vc.token")).toBeNull();
  });

  it("keeps the session on a NETWORK failure rather than signing out", async () => {
    // A dropped connection is not a rejected credential. Clearing here is how an app
    // logs people out on the bus.
    mockStore.set("vc.token", "STILL_VALID");
    global.fetch = jest.fn(async (url: string) => {
      if (String(url).includes("/auth/refresh")) throw new Error("offline");
      throw new Error("offline");
    }) as unknown as typeof fetch;

    await expect(api("/api/v1/academic/tasks")).rejects.toBeInstanceOf(ApiError);
    expect(await SecureStore.getItemAsync("vc.token")).toBe("STILL_VALID");
  });
});
