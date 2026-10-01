/**
 * src/lib/__tests__/api.test.ts — unit tests for the ported API client.
 *
 * WHY THESE TESTS EXIST
 * --------------------
 * Porting api.ts from the web to React Native touched exactly three things:
 * token storage, the base URL, and the login call that persists the token. The
 * third one is the one that already went wrong once on web — `login()` returned
 * the token without storing it, so every later request was unauthenticated and
 * every list rendered its empty state. It looked like a broken backend for days.
 *
 * So these tests are not ceremony. They pin the behaviour that was broken before.
 *
 * expo-secure-store IS MOCKED, NOT STUBBED OUT
 * -------------------------------------------
 * The mock is a real in-memory keychain rather than a function returning
 * undefined. That way the tests exercise the actual read-after-write behaviour of
 * the client, including the in-memory mirror, instead of passing because
 * everything returns nothing.
 */
import * as SecureStore from "expo-secure-store";

import {
  API_BASE,
  ApiError,
  api,
  clearToken,
  getToken,
  loadToken,
  login,
  setToken,
} from "../api";

// ---------------------------------------------------------------------------
// A working in-memory keychain.
// ---------------------------------------------------------------------------
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

/** Minimal fetch double. Records calls so headers can be asserted. */
function mockFetch(
  handler: (url: string, init?: RequestInit) => {
    status?: number;
    body?: unknown;
    raw?: string;
  },
) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const result = handler(url, init);
    const status = result.status ?? 200;
    const text = result.raw ?? (result.body === undefined ? "" : JSON.stringify(result.body));
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return calls;
}

beforeEach(async () => {
  mockStore.clear();
  await clearToken();
  jest.clearAllMocks();
});

describe("token storage", () => {
  it("persists a token to the encrypted store, not just memory", async () => {
    await setToken("abc123");

    // The durable copy matters: without it the student is signed out on every
    // cold start, which is the entire reason SecureStore is used.
    expect(mockStore.get("vc.token")).toBe("abc123");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("vc.token", "abc123");
  });

  it("reads the persisted token back into memory on startup", async () => {
    mockStore.set("vc.token", "restored-token");
    const token = await loadToken();
    expect(token).toBe("restored-token");
    expect(getToken()).toBe("restored-token");
  });

  it("survives a keystore that throws, rather than crashing the app", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(
      new Error("keystore unavailable"),
    );
    // A corrupt keychain must log the user out, not take the app down.
    await expect(loadToken()).resolves.toBeNull();
    expect(getToken()).toBeNull();
  });

  it("clears both the memory copy and the keystore", async () => {
    await setToken("to-be-cleared");
    await clearToken();
    expect(getToken()).toBeNull();
    expect(mockStore.has("vc.token")).toBe(false);
  });
});

describe("request building", () => {
  it("attaches a Bearer header once a token is held", async () => {
    await setToken("tok");
    const calls = mockFetch(() => ({ body: { ok: true } }));

    await api("/api/v1/academic/modules");

    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
  });

  it("omits the Bearer header when auth is explicitly disabled", async () => {
    await setToken("tok");
    const calls = mockFetch(() => ({ body: { ok: true } }));

    await api("/api/v1/auth/login", { method: "POST", auth: false, body: {} });

    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("sets Content-Type only when there is a body", async () => {
    const calls = mockFetch(() => ({ body: {} }));
    await setToken("tok");

    await api("/api/v1/a");
    await api("/api/v1/b", { method: "POST", body: { x: 1 } });

    const first = calls[0].init?.headers as Record<string, string>;
    const second = calls[1].init?.headers as Record<string, string>;
    expect(first["Content-Type"]).toBeUndefined();
    expect(second["Content-Type"]).toBe("application/json");
  });

  it("prefixes the path with the resolved backend base", async () => {
    const calls = mockFetch(() => ({ body: {} }));
    await api("/api/v1/academic/modules");
    expect(calls[0].url).toBe(`${API_BASE}/api/v1/academic/modules`);
  });
});

describe("error handling", () => {
  it("reports a network failure as status 0, not as an unhandled rejection", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;

    await expect(api("/api/v1/academic/modules")).rejects.toMatchObject({
      name: "ApiError",
      status: 0,
    });
  });

  it("raises the backend's human-readable detail rather than the status code", async () => {
    mockFetch(() => ({ status: 422, body: { detail: "Password too short" } }));
    await expect(api("/api/v1/auth/signup", { method: "POST", body: {} })).rejects.toThrow(
      "Password too short",
    );
  });

  it("clears the session on a 401 so the app returns to login", async () => {
    await setToken("expired");
    mockFetch(() => ({ status: 401, body: { detail: "Not authenticated" } }));

    await expect(api("/api/v1/academic/modules")).rejects.toBeInstanceOf(ApiError);

    // Without this the app loops: every screen fails 401 and none of them
    // navigates anywhere, which looks frozen rather than signed out.
    expect(getToken()).toBeNull();
  });

  it("does NOT clear the session when login itself returns 401", async () => {
    // A wrong password is a 401 too, but it is not an expired session. Clearing
    // here is harmless; treating it as "session expired" in the UI is not.
    await setToken("existing");
    mockFetch(() => ({ status: 401, body: { detail: "Incorrect email or password" } }));

    await expect(
      api("/api/v1/auth/login", { method: "POST", auth: false, body: {} }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(getToken()).toBe("existing");
  });

  it("tolerates an empty body on 204 responses", async () => {
    mockFetch(() => ({ status: 204, raw: "" }));
    await expect(api("/api/v1/academic/modules/x", { method: "DELETE" })).resolves.toBeNull();
  });
});

describe("login — the bug that made every screen look empty", () => {
  it("stores the token before returning it", async () => {
    mockFetch(() => ({ body: { access_token: "fresh-token" } }));

    const returned = await login("student@example.com", "a-test-password");

    expect(returned).toBe("fresh-token");
    // THE ASSERTION THAT MATTERS. On web this line was missing, so the token was
    // returned, discarded by the caller, and every subsequent request went out
    // unauthenticated - which rendered as an app where nothing loaded.
    expect(getToken()).toBe("fresh-token");
    expect(mockStore.get("vc.token")).toBe("fresh-token");
  });

  it("sends the api auth-mode header so the backend returns a token in the body", async () => {
    const calls = mockFetch(() => ({ body: { access_token: "t" } }));
    await login("a@b.com", "password123");

    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["x-auth-mode"]).toBe("api");
  });
});
