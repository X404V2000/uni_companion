import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Icon, type IconName } from "./components/Icon";
import AuthPage from "./components/AuthPage";
import { getModules, type AccountProfile } from "./lib/api";
import { forgetSession, restoreSession } from "./lib/session";
import OverviewTab from "./components/OverviewTab";
// PlaceholderTab is intentionally retained but no longer imported.
//
// It was only ever used by the Saved Library tab (C5 removed it), so this import would
// now be dead. The component itself is kept because it is a generic "not built yet"
// screen that the next unbuilt tab can reuse without rewriting - deleting it would make
// that a fresh task for no benefit. If it is still unused after the next feature lands,
// it is safe to remove along with its file.
import SummariesTab from "./components/SummariesTab";
import PlannerTab from "./components/PlannerTab";
import MaterialsTab from "./components/MaterialsTab";

const tabs: { label: string; icon: IconName; short: string }[] = [
  { label: "Overview", icon: "home", short: "Home" },
  { label: "AI Summaries", icon: "sparkles", short: "AI" },
  { label: "Find Materials", icon: "search", short: "Find" },
  // "Saved Library" was here. It was a placeholder with no backing feature, so it
  // occupied a fifth of the navigation to reach a screen that could not do anything.
  // Removed rather than hidden: a tab that exists but does nothing is worse than no
  // tab, because it teaches a student that the app has a feature it does not have.
  //
  // When saving is built, restore it here and add a matching render block below. The
  // `bookmark` icon is deliberately left in Icon.tsx so that needs no new artwork.
  { label: "Study Planner", icon: "calendar", short: "Planner" },
];

export const modules = [
  {
    code: "INF 214",
    title: "Information Science",
    detail: "12 summaries",
    color: "var(--color-accent)",
    pale: "var(--color-module-a-pale)",
    progress: 72,
    lastOpened: "Today",
  },
  {
    code: "COS 226",
    title: "Data Structures",
    detail: "8 summaries",
    color: "var(--color-teal)",
    pale: "var(--color-module-b-pale)",
    progress: 59,
    lastOpened: "2 days ago",
  },
  {
    code: "INF 271",
    title: "Systems Analysis",
    detail: "5 summaries",
    color: "var(--color-warning)",
    pale: "var(--color-module-c-pale)",
    progress: 46,
    lastOpened: "3 days ago",
  },
];

/**
 * Two-letter initials for the profile button.
 *
 * Falls back to a neutral placeholder rather than throwing on a missing name -
 * the account is real even when the display name is empty.
 */
function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Build stamp, shown in the header.
 *
 * This exists because a cached service worker once served an old bundle while
 * every server-side check said the new one was deployed — which made a working
 * fix look broken. A stamp that changes on every build turns that invisible
 * failure into a glanceable fact.
 */
const BUILD = `build ${__BUILD_STAMP__}`;

/**
 * Today's date for the header, e.g. "Wednesday, 30 Sep".
 *
 * Computed rather than hardcoded: the design export shipped a fixed
 * "Wednesday, 11 Sep", which would have been wrong on every day the app was
 * actually opened.
 */
function todayLabel(): string {
  return new Date().toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState("Overview");
  const [toast, setToast] = useState("");

  // The loaded account. OverviewTab uses it for the greeting, so it is held
  // here rather than fetched again by each child.
  const [profile, setProfile] = useState<AccountProfile | null>(null);

  // Shared across Overview, Summaries, Planner and Materials. Held here rather
  // than fetched per tab so switching tabs does not refetch identical data.
  const [moduleList, setModuleList] = useState<
    Array<{ id: string; code: string; name: string }>
  >([]);

  const reloadModules = async () => {
    try {
      setModuleList(await getModules());
    } catch {
      // A failed module load must not blank the app; each tab reports what it
      // needs on its own.
      setModuleList([]);
    }
  };

  // `restoring` exists to prevent a visible flash: without it the login screen
  // renders for one frame on every refresh, even for a signed-in student.
  const [restoring, setRestoring] = useState(true);

  /**
   * Restore a session on mount.
   *
   * The token is validated against the server rather than trusted, so a token
   * left over from a rotated JWT secret logs out cleanly instead of producing
   * a dashboard where every action fails.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const account = await restoreSession();
      if (cancelled) return;
      if (account) {
        setProfile(account);
        setAuthenticated(true);
        await reloadModules();
      }
      setRestoring(false);
    })();

    // StrictMode mounts effects twice in development; without this the second
    // run can set state after the first has already resolved.
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignedIn = async () => {
    setAuthenticated(true);
    setProfile(await restoreSession());
    await reloadModules();
  };

  const signOut = () => {
    forgetSession();
    setProfile(null);
    setModuleList([]);
    setAuthenticated(false);
    setActiveTab("Overview");
    notify("Signed out");
  };

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  if (restoring) {
    // A blank frame is better than the login form flashing for a signed-in
    // student. Uses the palette background so it is not a white flash either.
    return <div className="min-h-screen bg-[var(--color-bg)]" />;
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen justify-center bg-[var(--color-sunk)]">
        <div className="relative min-h-screen w-full max-w-[480px] bg-[var(--color-bg)] sm:max-w-[640px] lg:max-w-[480px] lg:shadow-[0_0_80px_rgba(0,0,0,0.55)]">
          <AuthPage onSuccess={handleSignedIn} />
        </div>
      </div>
    );
  }

  const activeTabMeta = tabs.find((t) => t.label === activeTab)!;

  return (
    <div className="flex h-screen justify-center bg-[var(--color-sunk)]">
      <div className="relative flex h-screen w-full max-w-[480px] flex-col bg-[var(--color-bg)] text-[var(--color-fg)] sm:max-w-[640px] lg:max-w-[480px] lg:shadow-[0_0_80px_rgba(0,0,0,0.55)]">
      {toast && (
        <div className="fixed left-1/2 top-5 z-50 -translate-x-1/2 whitespace-nowrap rounded-xl bg-[var(--color-surface)] px-4 py-3 text-xs font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}

      <header className="safe-top sticky top-0 z-20 flex h-[62px] shrink-0 items-center border-b border-[var(--color-raised)] bg-[var(--color-bg)]/95 px-5 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <div className="logo-mark">
            <span />
            <span />
            <span />
          </div>
          <div>
            <p className="font-display text-[15px] font-extrabold leading-none tracking-[-0.03em]">Varsity</p>
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-fg-subtle)]">Companion</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--color-fg-muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-teal)]" />
            {BUILD}
          </div>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-surface)] text-[11px] font-extrabold text-white"
            onClick={signOut}
            aria-label="Sign out"
            title="Sign out"
          >
            {/* Real initials from the loaded profile. "TM" was a hardcoded
                placeholder from the design export and showed for every user. */}
            {initials(profile?.full_name)}
          </button>
        </div>
      </header>

      {activeTab === "Overview" && (
        <div className="mx-auto w-full max-w-[480px] px-4 py-2 sm:max-w-[640px]">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--color-teal)]">
                {todayLabel()}
              </p>
              <h1 className="font-display text-[24px] font-extrabold tracking-[-0.03em] text-[var(--color-fg)]">
              </h1>
            </div>
            <button
              onClick={() => notify("Synced")}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[10px] font-bold text-[var(--color-fg-muted)] shadow-sm"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-teal)] opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-teal)]" />
              </span>
              Synced
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[480px] px-4 pb-6 pt-3 sm:max-w-[640px]">
{activeTab === "Overview" && (
              <OverviewTab
                onTabChange={setActiveTab}
                notify={notify}
                profile={profile}
                moduleList={moduleList}
                onModulesChanged={reloadModules}
              />
            )}
            {activeTab === "AI Summaries" && (
              <SummariesTab notify={notify} moduleList={moduleList} />
            )}
            {activeTab === "Find Materials" && (
              <MaterialsTab notify={notify} moduleList={moduleList} />
            )}
            {activeTab === "Study Planner" && (
              <PlannerTab
                notify={notify}
                moduleList={moduleList}
                onModulesChanged={reloadModules}
              />
            )}
        </div>
      </main>

      <nav className="safe-bottom shrink-0 border-t border-[var(--color-raised)] bg-[var(--color-surface)]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[480px] items-stretch sm:max-w-[640px]">
          {tabs.map((tab) => {
            const active = activeTab === tab.label;
            return (
              <button
                key={tab.label}
                onClick={() => setActiveTab(tab.label)}
                className="flex flex-1 flex-col items-center gap-1 pb-5 pt-3 transition"
                aria-label={tab.label}
              >
                <span
                  className={`grid h-6 w-6 place-items-center transition ${
                    active ? "text-[var(--color-surface)]" : "text-[var(--color-fg-subtle)]"
                  }`}
                >
                  <Icon
                    name={tab.icon}
                    className={`h-[22px] w-[22px] transition-all ${
                      active ? "stroke-[2.2]" : "stroke-[1.6]"
                    }`}
                  />
                </span>
                <span
                  className={`text-[9.5px] font-bold transition ${
                    active ? "text-[var(--color-surface)]" : "text-[var(--color-fg-muted)]"
                  }`}
                >
                  {tab.short}
                </span>
                {active && (
                  <span className="absolute bottom-0 h-0.5 w-8 rounded-full bg-[var(--color-surface)] opacity-0" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
      </div>
  );
}
