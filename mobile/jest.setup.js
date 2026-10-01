/**
 * jest.setup.js — runs before every test file.
 *
 * Dark-mode assumptions and native module mocks live here so individual tests do
 * not each have to stub the same things.
 */

// expo-secure-store wraps a native keychain that does not exist under Jest. The
// api tests provide their own richer mock; this default keeps any other test
// that transitively imports the module from crashing.
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

// expo-router's navigation is a native concern; tests that need to assert on
// navigation mock it themselves.
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  Stack: Object.assign(() => null, { Screen: () => null, Protected: () => null }),
  Tabs: Object.assign(() => null, { Screen: () => null }),
  Link: () => null,
}));

// Silence the act() warning noise from React Query's background refetches,
// which are timing-dependent and not what these tests are asserting on.
global.console = {
  ...console,
  warn: jest.fn(),
};
