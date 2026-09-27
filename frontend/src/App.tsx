import {
  useRef,
  useState,
  useEffect,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  ApiError,
  clearToken,
  completeTask,
  askBrief,
  createBrief,
  createModule,
  createTask,
  getDashboard,
  getActivity,
  getAtRisk,
  getMe,
  getAllTasks,
  getModules,
  getRecommendations,
  getBriefs,
  getTasks,
  getSummaryHistory,
  fetchLinkText,
  getQuota,
  ingestModuleResources,
  searchMaterials,
  login,
  setToken,
  signup,
  summarize,
  type AcademicTask,
  type AtRisk,
  type AccountProfile,
  type IngestResult,
  type QuotaInfo,
  type Brief,
  type ActivityItem,
  type DashboardData,
  type Recommendations,
  type StudyMaterial,
  type SummaryHistoryItem,
} from "./lib/api";
import { UnsupportedFileError, extractTextFromFile } from "./lib/fileText";
import { renderMarkdown } from "./lib/markdown";

type IconName =
  | "home"
  | "sparkles"
  | "search"
  | "bookmark"
  | "calendar"
  | "settings"
  | "help"
  | "bell"
  | "chevron"
  | "upload"
  | "document"
  | "play"
  | "book"
  | "clock"
  | "plus"
  | "arrow"
  | "menu"
  | "close"
  | "mail"
  | "lock"
  | "eye"
  | "user";

function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: IconName;
  className?: string;
}) {
  const paths: Record<IconName, ReactNode> = {
    home: (
      <>
        <path d="m3 10.8 9-7.4 9 7.4" />
        <path d="M5.5 9.3v10.2h13V9.3M9.5 19.5v-6h5v6" />
      </>
    ),
    sparkles: (
      <>
        <path d="m12 3 1.1 3.1L16 7.2l-2.9 1.1L12 11l-1.1-2.7L8 7.2l2.9-1.1L12 3Z" />
        <path d="m5.5 12 .9 2.6L9 15.5l-2.6.9L5.5 19l-.9-2.6-2.6-.9 2.6-.9.9-2.6ZM18.5 12l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z" />
      </>
    ),
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="6.8" />
        <path d="m16 16 4 4" />
      </>
    ),
    bookmark: <path d="M6 3.5h12v17L12 17l-6 3.5v-17Z" />,
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4M17 3v4M3 10h18" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.7 9a2.4 2.4 0 0 1 4.6 1c0 1.8-2.3 2-2.3 3.5M12 17.4v.1" />
      </>
    ),
    bell: (
      <>
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9Z" />
        <path d="M14.2 20a2.5 2.5 0 0 1-4.4 0" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    upload: (
      <>
        <path d="M12 16V4M7.5 8.5 12 4l4.5 4.5" />
        <path d="M5 13v6h14v-6" />
      </>
    ),
    document: (
      <>
        <path d="M6 2.8h8l4 4v14.4H6V2.8Z" />
        <path d="M14 2.8v4h4M9 12h6M9 16h6" />
      </>
    ),
    play: (
      <>
        <rect x="2.5" y="5" width="19" height="14" rx="3" />
        <path d="m10 9 5 3-5 3V9Z" />
      </>
    ),
    book: (
      <>
        <path d="M4 4.5h6.5A1.5 1.5 0 0 1 12 6v14a2.5 2.5 0 0 0-2.5-2.5H4v-13ZM20 4.5h-6.5A1.5 1.5 0 0 0 12 6v14a2.5 2.5 0 0 1 2.5-2.5H20v-13Z" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    eye: (
      <>
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

const navItems: { label: string; icon: IconName }[] = [
  { label: "Overview", icon: "home" },
  { label: "AI Summaries", icon: "sparkles" },
  { label: "Recommendations", icon: "book" },
  { label: "Chat with Brief", icon: "document" },
  { label: "Find Materials", icon: "search" },
  { label: "Study Planner", icon: "calendar" },
];

// Rotating palette for module cards. Real modules now come from the backend,
// so colours are assigned by index rather than hardcoded per module.
const moduleColors = [
  { color: "#EF7F62", pale: "#FFF0EA" },
  { color: "#58A99F", pale: "#E6F4F1" },
  { color: "#E4AD55", pale: "#FFF6DF" },
];

function AuthPage({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [showPassword, setShowPassword] = useState(false);
  // Controlled credentials + async status. Both LOGIN and SIGNUP are wired to
  // the real backend. On signup we create the account and then immediately log
  // in, so the student lands on their dashboard in one step.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setPending(true);
    const cleanEmail = email.trim();

    try {
      if (mode === "signup") {
        // 1. Create the account (backend requires full name + a >=6 char pw).
        if (fullName.trim().length < 2) {
          setError("Please enter your full name.");
          return;
        }
        await signup(cleanEmail, password, fullName.trim());
      }
      // 2. Log in (also the first step for the login path) to obtain a token.
      const token = await login(cleanEmail, password);
      setToken(token);
      // Remember the email locally so the dashboard can show a friendly name
      // without an extra round-trip (demo convenience only).
      localStorage.setItem("vc.email", cleanEmail);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Incorrect email or password.");
      } else if (err instanceof ApiError && err.status === 409) {
        setError("An account with that email already exists. Try logging in.");
      } else if (err instanceof ApiError && err.status === 422) {
        // Surface the backend's validation detail (e.g. bad email, weak pw).
        setError(
          typeof err.body === "object" &&
            err.body &&
            "detail" in err.body &&
            typeof (err.body as { detail: unknown }).detail === "string"
            ? (err.body as { detail: string }).detail
            : "Please check your details and try again.",
        );
      } else if (err instanceof ApiError && err.status === 0) {
        setError("Cannot reach the server. Is the backend running?");
      } else {
        setError(
          mode === "signup"
            ? "Could not create your account. Try again."
            : "Could not sign in. Try again.",
        );
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F6F8F5] text-[#162A3A] lg:grid lg:grid-cols-[minmax(440px,0.92fr)_minmax(520px,1.08fr)]">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#173C46] p-12 text-white lg:flex lg:flex-col xl:p-16">
        <div className="auth-orbit auth-orbit-one" />
        <div className="auth-orbit auth-orbit-two" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="logo-mark bg-white">
            <span />
            <span />
            <span />
          </div>
          <div>
            <p className="font-display text-[18px] font-extrabold leading-none tracking-[-0.03em]">
              Varsity
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#9CC9C1]">
              Companion
            </p>
          </div>
        </div>

        <div className="relative z-10 my-auto max-w-[530px] pb-6">
          <p className="mb-5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#7FC1B6]">
            Your academic operating system
          </p>
          <h1 className="font-display text-[44px] font-extrabold leading-[1.08] tracking-[-0.045em] xl:text-[54px]">
            Study smarter.
            <br />
            Stress{" "}
            <span className="relative text-[#F08A6F]">
              less.
              <svg
                className="absolute -bottom-2 left-0 w-full text-[#F08A6F]/55"
                viewBox="0 0 160 10"
                fill="none"
              >
                <path d="M2 7C44 2 106 2 158 5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="mt-7 max-w-[460px] text-[15px] leading-7 text-[#B8CECE]">
            Course-aware summaries, trusted study materials and a planner built
            for South African student life.
          </p>

          <div className="mt-12 grid max-w-[500px] grid-cols-3 gap-3">
            {[
              ["01", "Summarise", "Turn dense notes into clear study points."],
              ["02", "Discover", "Find resources matched to your modules."],
              ["03", "Plan", "Track deadlines and stay ahead of your week."],
            ].map(([number, title, detail]) => (
              <div
                key={number}
                className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm"
              >
                <span className="text-[10px] font-extrabold text-[#74B7AC]">{number}</span>
                <p className="mt-4 text-xs font-extrabold">{title}</p>
                <p className="mt-2 text-[10px] leading-relaxed text-[#9FB9B8]">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-[10px] text-[#83A3A1]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#67B4A7]" />
          Built for real South African student life.
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10 lg:px-14">
        <div className="w-full max-w-[450px]">
          <div className="mb-12 flex items-center gap-3 lg:hidden">
            <div className="logo-mark">
              <span />
              <span />
              <span />
            </div>
            <div>
              <p className="font-display text-[17px] font-extrabold leading-none tracking-[-0.03em]">
                Varsity
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#71807D]">
                Companion
              </p>
            </div>
          </div>

          <div className="mb-8">
            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#579286]">
              {mode === "login" ? "Welcome back" : "Start studying smarter"}
            </p>
            <h2 className="font-display text-[30px] font-extrabold tracking-[-0.035em] sm:text-[36px]">
              {mode === "login" ? "Good to see you again." : "Create your account."}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#74827F]">
              {mode === "login"
                ? "Sign in to continue to your study space."
                : "Set up your free account. It only takes a minute."}
            </p>
          </div>

          <div className="mb-7 grid grid-cols-2 rounded-xl bg-[#E9EFEC] p-1">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`rounded-[9px] py-2.5 text-xs font-extrabold transition ${
                mode === "login"
                  ? "bg-white text-[#173C46] shadow-sm"
                  : "text-[#788784]"
              }`}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`rounded-[9px] py-2.5 text-xs font-extrabold transition ${
                mode === "signup"
                  ? "bg-white text-[#173C46] shadow-sm"
                  : "text-[#788784]"
              }`}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <label className="block">
                <span className="mb-2 block text-[11px] font-bold text-[#435956]">
                  Full name
                </span>
                <span className="relative block">
                  <Icon
                    name="user"
                    className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#879491]"
                  />
                  <input
                    required
                    autoComplete="name"
                    placeholder="e.g. Thando Mokoena"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className="h-13 w-full rounded-xl border border-[#D9E2DE] bg-white pl-11 pr-4 text-xs outline-none transition placeholder:text-[#A3ADAA] focus:border-[#5CA599] focus:ring-3 focus:ring-[#5CA599]/10"
                  />
                </span>
              </label>
            )}

            <label className="block">
              <span className="mb-2 block text-[11px] font-bold text-[#435956]">
                Email address
              </span>
              <span className="relative block">
                <Icon
                  name="mail"
                  className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#879491]"
                />
                <input
                  required
                  type="email"
                  autoComplete="email"
                  placeholder="student@university.ac.za"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-13 w-full rounded-xl border border-[#D9E2DE] bg-white pl-11 pr-4 text-xs outline-none transition placeholder:text-[#A3ADAA] focus:border-[#5CA599] focus:ring-3 focus:ring-[#5CA599]/10"
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-2 flex items-center justify-between text-[11px] font-bold text-[#435956]">
                Password
                {mode === "login" && (
                  <button
                    type="button"
                    className="font-bold text-[#478B80] hover:text-[#286D64]"
                  >
                    Forgot password?
                  </button>
                )}
              </span>
              <span className="relative block">
                <Icon
                  name="lock"
                  className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#879491]"
                />
                <input
                  required
                  minLength={mode === "signup" ? 8 : 6}
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder={mode === "login" ? "Enter your password" : "At least 8 characters"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-13 w-full rounded-xl border border-[#D9E2DE] bg-white pl-11 pr-12 text-xs outline-none transition placeholder:text-[#A3ADAA] focus:border-[#5CA599] focus:ring-3 focus:ring-[#5CA599]/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#879491] hover:text-[#435956]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <Icon name="eye" className="h-[18px] w-[18px]" />
                </button>
              </span>
            </label>

            {mode === "signup" && (
              <label className="flex items-start gap-3 pt-1 text-[10px] leading-relaxed text-[#74827F]">
                <input
                  required
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[#3E8D82]"
                />
                <span>
                  I agree to the{" "}
                  <button type="button" className="font-bold text-[#397F75]">
                    Terms of Use
                  </button>{" "}
                  and{" "}
                  <button type="button" className="font-bold text-[#397F75]">
                    Privacy Policy
                  </button>
                  .
                </span>
              </label>
            )}

            {error && (
              <p className="rounded-xl bg-[#FDEEEA] px-3.5 py-2.5 text-[11px] font-semibold text-[#B9533E]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#173C46] text-xs font-extrabold text-white shadow-lg shadow-[#173C46]/10 transition hover:bg-[#21515A] focus:ring-4 focus:ring-[#5CA599]/20 disabled:opacity-60"
            >
              {pending
                ? "Signing in…"
                : mode === "login"
                  ? "Log in to your account"
                  : "Create free account"}
              <Icon name="arrow" className="h-4 w-4" />
            </button>
          </form>

          <div className="my-7 flex items-center gap-3">
            <span className="h-px flex-1 bg-[#DEE5E1]" />
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#929D9A]">
              Secure student access
            </span>
            <span className="h-px flex-1 bg-[#DEE5E1]" />
          </div>

          <div className="flex items-center justify-center gap-2 text-center text-[11px] text-[#75827F]">
            <Icon name="lock" className="h-3.5 w-3.5 text-[#579286]" />
            Your study data stays private and protected.
          </div>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  // Start authenticated if a token already exists, so a refresh keeps the
  // user logged in (acceptance criterion #7).
  const [authenticated, setAuthenticated] = useState(
    () => !!localStorage.getItem("vc.token"),
  );
  const [activeNav, setActiveNav] = useState("Overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [toast, setToast] = useState("");

  // Real backend data (replaces the hardcoded demo values).
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardError, setDashboardError] = useState("");
  const [moduleList, setModuleList] = useState<
    Array<{ id: string; code: string; name: string }>
  >([]);
  const [taskList, setTaskList] = useState<AcademicTask[]>([]);
  // Study Planner: the full task list (beyond the dashboard's first page).
  const [plannerTasks, setPlannerTasks] = useState<AcademicTask[]>([]);
  const [plannerLoading, setPlannerLoading] = useState(false);
  // The student's own recent activity (real usage events, newest first).
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  // At-risk detection (real deadlines likely to slip).
  const [atRisk, setAtRisk] = useState<AtRisk | null>(null);
  // Per-module material counts (module code -> total), for the module cards.
  const [moduleMaterialCounts, setModuleMaterialCounts] = useState<
    Record<string, number>
  >({});
  // Find Materials view state.
  const [matModule, setMatModule] = useState("");
  const [matQuery, setMatQuery] = useState("");
  const [matType, setMatType] = useState("");
  const [matResults, setMatResults] = useState<StudyMaterial[]>([]);
  const [matTotal, setMatTotal] = useState(0);
  const [matLoading, setMatLoading] = useState(false);
  const [matError, setMatError] = useState("");
  const [matSearched, setMatSearched] = useState(false);
  // On-demand resource finding for a module the student typed in themselves.
  const [matIngesting, setMatIngesting] = useState(false);
  const [matIngestNote, setMatIngestNote] = useState("");
  // AI Summaries history view.
  const [summaries, setSummaries] = useState<SummaryHistoryItem[]>([]);
  const [summariesLoading, setSummariesLoading] = useState(false);
  // Recommendations view state.
  //
  // `recoModule` is kept in step with the dropdown's ACTUAL selection by the
  // sync effect below. Leaving it as "" while the browser displayed the first
  // module was a controlled-component mismatch: the UI looked like a module was
  // chosen while the state was empty, so "Generate" appeared to do nothing.
  const [recoModule, setRecoModule] = useState("");
  const [reco, setReco] = useState<Recommendations | null>(null);
  const [recoLoading, setRecoLoading] = useState(false);
  const [recoError, setRecoError] = useState("");
  // "Chat with your brief" (RAG) state.
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [briefPending, setBriefPending] = useState(false);
  const [briefError, setBriefError] = useState("");
  const [activeBrief, setActiveBrief] = useState<string>("");
  const [briefQuestion, setBriefQuestion] = useState("");
  const [briefAsking, setBriefAsking] = useState(false);
  // Conversation history for the active brief (question + answer + citations).
  const [chatLog, setChatLog] = useState<
    { q: string; a: string; cites: { ordinal: number; text: string }[] }[]
  >([]);
  const briefInputRef = useRef<HTMLInputElement | null>(null);
  // "Add deadline" modal state.
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [deadlineTitle, setDeadlineTitle] = useState("");
  const [deadlineModule, setDeadlineModule] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlinePriority, setDeadlinePriority] =
    useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("MEDIUM");
  const [deadlineType, setDeadlineType] =
    useState<"ASSIGNMENT" | "EXAM" | "TEST" | "QUIZ">("ASSIGNMENT");
  const [deadlineError, setDeadlineError] = useState("");
  const [deadlinePending, setDeadlinePending] = useState(false);
  // Inline "add module" sub-form (so a brand-new user can create their first
  // module without leaving the deadline modal).
  const [showAddModule, setShowAddModule] = useState(false);
  const [newModuleCode, setNewModuleCode] = useState("");
  const [newModuleName, setNewModuleName] = useState("");
  const [moduleError, setModuleError] = useState("");
  const [modulePending, setModulePending] = useState(false);
  // Summary panel state.
  // `pastedText` and `fileText` are INDEPENDENT sources. Either, or both, can
  // be sent: the request combines whichever sources are present.
  const [pastedText, setPastedText] = useState("");
  const [fileText, setFileText] = useState("");
  const [fileName, setFileName] = useState("");
  // Module context for the summary (blank = "GENERAL").
  const [summaryModule, setSummaryModule] = useState("");
  const [summaryResult, setSummaryResult] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const [summaryPending, setSummaryPending] = useState(false);
  // Upload-file flow: the file is read in the browser (no upload endpoint).
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // True while a PDF/DOCX is being parsed (parsing can take a moment).
  const [filePending, setFilePending] = useState(false);
  // SOURCE 3 — a link. The student pastes a URL and the SERVER reads the page
  // (server-side because browsers cannot fetch cross-origin page text).
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkPending, setLinkPending] = useState(false);
  // Account view: the student's real profile and plan, loaded from the API.
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState("");

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  const signOut = () => {
    clearToken();
    setAuthenticated(false);
    setDashboard(null);
    setSummaryResult("");
  };

  // Derived values for the sidebar quota card (falls back to the free-tier
  // default of 10/day until the dashboard loads).
  const quotaUsed = dashboard?.ai_quota.summaries_used ?? 0;
  const quotaLimit = dashboard?.ai_quota.daily_limit ?? 10;
  const quotaPercent =
    quotaLimit > 0 ? Math.min(100, Math.round((quotaUsed / quotaLimit) * 100)) : 0;
  const moduleCount = dashboard?.modules_count ?? 0;
  // Open (not-yet-completed) deadlines, for the honest status pill.
  const openTasks = taskList.filter((t) => !t.is_completed).length;

  // Greeting + identity. Uses the stored email local-part as a friendly name
  // (the demo fixture is a student account); falls back gracefully.
  const displayName = (() => {
    const email = localStorage.getItem("vc.email") || "";
    const local = email.split("@")[0] || "Student";
    const cleaned = local.replace(/[._-]+/g, " ").trim();
    return cleaned ? cleaned.replace(/\b\w/g, (c) => c.toUpperCase()) : "Student";
  })();
  const initials =
    displayName
      .split(" ")
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "ST";
  const todayLabel = new Date().toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const hour = new Date().getHours();
  const dayPart =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const greeting = `${dayPart}, ${displayName}.`;

  // Reload the task list (used after creating a deadline).
  const refreshTasks = async () => {
    try {
      setTaskList(await getTasks());
    } catch {
      /* non-fatal */
    }
  };

  // Reload modules (used after creating one).
  const refreshModules = async () => {
    try {
      setModuleList(await getModules());
    } catch {
      /* non-fatal */
    }
  };

  // Create a module from the inline sub-form and auto-select it.
  const submitModule = async () => {
    setModuleError("");
    const code = newModuleCode.trim().toUpperCase();
    const name = newModuleName.trim();
    if (!code) {
      setModuleError("Enter a module code (e.g. INF154).");
      return;
    }
    if (!name) {
      setModuleError("Enter the full module name.");
      return;
    }
    setModulePending(true);
    try {
      const created = await createModule(code, name);
      await refreshModules();
      setDeadlineModule(created.id);
      setNewModuleCode("");
      setNewModuleName("");
      setShowAddModule(false);
      notify(`Module ${code} added`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setModuleError("That module code already exists.");
      } else if (err instanceof ApiError && err.status === 422) {
        setModuleError("Invalid module details. Check the code and name.");
      } else {
        setModuleError("Could not add the module. Try again.");
      }
    } finally {
      setModulePending(false);
    }
  };

  // Create a deadline from the "Add deadline" modal.
  const submitDeadline = async () => {
    setDeadlineError("");
    if (!deadlineTitle.trim()) {
      setDeadlineError("Give your deadline a title.");
      return;
    }
    if (!deadlineModule) {
      setDeadlineError("Pick a module (or use “+ Add module”).");
      return;
    }
    if (!deadlineDate) {
      setDeadlineError("Pick a due date.");
      return;
    }

    // Convert the datetime-local value to a UTC ISO string. Guard against an
    // unparseable value: new Date(bad).toISOString() throws a RangeError which
    // would otherwise abort the handler before the API call (the bug where
    // "Save deadline" appeared to do nothing).
    const parsed = new Date(deadlineDate);
    if (Number.isNaN(parsed.getTime())) {
      setDeadlineError("That due date looks invalid. Please pick it again.");
      return;
    }

    setDeadlinePending(true);
    try {
      await createTask({
        moduleId: deadlineModule,
        title: deadlineTitle.trim(),
        dueDate: parsed.toISOString(),
        priority: deadlinePriority,
        taskType: deadlineType,
      });
      // Refresh first, then close — so a refresh failure can't strand the modal.
      await refreshTasks();
      setDeadlineOpen(false);
      setDeadlineTitle("");
      setDeadlineModule("");
      setDeadlineDate("");
      setDeadlinePriority("MEDIUM");
      setDeadlineType("ASSIGNMENT");
      notify("Deadline added");
    } catch (err) {
      // Always reset the button so a failure never leaves it stuck on "Saving…".
      if (err instanceof ApiError && err.status === 0) {
        setDeadlineError("Cannot reach the server. Is the backend running?");
      } else if (err instanceof ApiError && err.status === 422) {
        setDeadlineError(
          "The server rejected the deadline details. Check the module and date.",
        );
      } else if (err instanceof ApiError) {
        setDeadlineError(
          typeof err.body === "object" &&
            err.body &&
            "detail" in err.body &&
            typeof (err.body as { detail: unknown }).detail === "string"
            ? (err.body as { detail: string }).detail
            : `Could not save the deadline (HTTP ${err.status}).`,
        );
      } else {
        setDeadlineError(
          `Could not save the deadline: ${
            err instanceof Error ? err.message : "unknown error"
          }`,
        );
      }
    } finally {
      setDeadlinePending(false);
    }
  };

  // Handle a file chosen from the "Upload file" tab. The backend has no file
  // endpoint, so the browser extracts the text (PDF via pdfjs, DOCX via
  // mammoth, plain text natively). The extracted text is kept SEPARATE from the
  // pasted text so either — or both — can be sent.
  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // WHY THE INPUT IS CLEARED AT THE END, NOT HERE:
    // This used to run `event.target.value = ""` immediately, before the file
    // was read. Reading happens asynchronously afterwards (FileReader or
    // file.arrayBuffer()), and clearing the input first can invalidate the
    // backing File in some browsers, making the read fail for no visible
    // reason. Clearing at the END still allows re-selecting the same file.
    if (file.size > 20 * 1024 * 1024) {
      event.target.value = "";
      setSummaryError("That file is larger than 20 MB.");
      return;
    }

    setSummaryError("");
    setFilePending(true);
    try {
      const text = await extractTextFromFile(file);
      setFileText(text);
      setFileName(file.name);
      notify(`Loaded ${file.name}`);
    } catch (err) {
      setFileText("");
      setFileName("");
      setSummaryError(
        err instanceof UnsupportedFileError
          ? err.message
          : "Could not read that file.",
      );
    } finally {
      setFilePending(false);
      // Cleared AFTER the read completes — see the note above. This keeps the
      // same file re-selectable without risking an invalidated File handle.
      event.target.value = "";
    }
  };

  // Load the student's profile and plan for the Account view.
  //
  // Both requests are fired together because the page shows them side by side;
  // the profile is the important one, so a quota failure degrades gracefully
  // (the plan section says so) rather than blanking the whole page.
  const loadAccount = async () => {
    setAccountError("");
    setAccountLoading(true);
    try {
      const profile = await getMe();
      setAccount(profile);
      // The email is what the header shows; keep our cached copy in step so a
      // stale value from a previous session cannot linger.
      if (profile.email) localStorage.setItem("vc.email", profile.email);
    } catch (err) {
      setAccount(null);
      if (err instanceof ApiError && err.status === 401) {
        setAccountError("Your session expired. Please sign in again.");
      } else if (err instanceof ApiError && err.status === 0) {
        setAccountError("Cannot reach the server. Check your connection.");
      } else {
        setAccountError("Could not load your account details.");
      }
      setAccountLoading(false);
      return;
    }

    // Non-fatal: an unavailable quota still leaves a useful page.
    try {
      setQuota(await getQuota());
    } catch {
      setQuota(null);
    }
    setAccountLoading(false);
  };

  // Fetch the account whenever the view is opened. Cheap (two small reads) and
  // it means the page never shows stale data from an earlier session.
  useEffect(() => {
    if (!authenticated || activeNav !== "Account") return;
    void loadAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, activeNav]);

  // Read a web page the student linked to, server-side.
  //
  // Runs on demand rather than on every keystroke: the server makes an outbound
  // request, so we only do it when the student explicitly asks.
  const loadLink = async () => {
    const url = linkUrl.trim();
    if (!url) {
      setSummaryError("Paste a link first.");
      return;
    }
    setSummaryError("");
    setLinkPending(true);
    try {
      const result = await fetchLinkText(url);
      setLinkText(result.text);
      setLinkTitle(result.title || result.url);
      notify(
        `Read ${result.characters.toLocaleString()} characters from that page`,
      );
    } catch (err) {
      setLinkText("");
      setLinkTitle("");
      // The backend returns a specific, student-readable reason (needs a login,
      // 404, not a web page, blocked address...), so surface it directly.
      if (err instanceof ApiError && err.message) {
        setSummaryError(err.message);
      } else if (err instanceof ApiError && err.status === 0) {
        setSummaryError("Cannot reach the server.");
      } else {
        setSummaryError("Could not read that link. Try another one.");
      }
    } finally {
      setLinkPending(false);
    }
  };

  // Remove the link source (keeps the file and pasted text).
  const clearLink = () => {
    setLinkUrl("");
    setLinkText("");
    setLinkTitle("");
  };

  // Remove the uploaded file source (keeps any pasted text).
  const clearFile = () => {
    setFileText("");
    setFileName("");
    setSummaryError("");
  };

  // Run a real AI summary. Combines whichever sources are present:
  //   pasted text only, file only, or both (file first, then pasted notes).
  //
  // The backend enforces two content rules we must respect BEFORE sending:
  //   * minimum 50 characters  (a 422 otherwise)
  //   * maximum 32,000 characters (a 422 otherwise)
  // Oversized input is truncated to the limit (with a visible note) rather than
  // rejected, because losing a summary is worse than summarising the first part.
  const runSummary = async () => {
    // THREE independent sources. Any one of them is enough on its own, and any
    // combination works — a student may upload a file, paste extra notes, and
    // add a link, or use just one.
    const filePart = fileText.trim();
    const pastePart = pastedText.trim();
    const linkPart = linkText.trim();
    if (!filePart && !pastePart && !linkPart) {
      setSummaryError(
        "Add something to summarise — a file, some pasted text, or a link.",
      );
      return;
    }

    // Measure the STUDENT'S content, not our own labels.
    //
    // The labels below ("[From file: notes.txt]" and the "---" separators) are
    // ours, so counting them toward the minimum meant a genuinely short file
    // was rejected for a reason the student could not see or fix: a 20
    // character file arrived as 37 characters and failed a 50 character check.
    const userChars = filePart.length + pastePart.length + linkPart.length;

    // Backend minimum is 20 characters of real content. Report it against the
    // student's own text so the number is actionable.
    const MIN_CHARS = 20;
    if (userChars < MIN_CHARS) {
      const short = MIN_CHARS - userChars;
      setSummaryError(
        `Add a little more — ${short} more character${short === 1 ? "" : "s"} needed ` +
          `(${userChars} of ${MIN_CHARS} minimum).`,
      );
      return;
    }

    // Label each source so the model (and the student) can tell them apart.
    const sections: string[] = [];
    if (filePart) {
      sections.push(`[From file: ${fileName || "uploaded document"}]\n${filePart}`);
    }
    if (pastePart) {
      sections.push(`[Pasted notes]\n${pastePart}`);
    }
    if (linkPart) {
      sections.push(
        `[From link: ${linkTitle || linkUrl}]\n${linkPart}`,
      );
    }
    let content = sections.join("\n\n---\n\n");

    // LONG DOCUMENTS ARE NO LONGER CUT OFF HERE.
    //
    // This used to slice content at 32,000 characters and apologise in the
    // result: "only the first part was summarised". That is what testers hit
    // when they said a long document "only summarised a few lines" — roughly
    // half a typical study guide was discarded before it ever left the browser.
    // The backend now splits long input into overlapping chunks, summarises
    // each, and merges them, so the whole document is covered.
    //
    // The bound below is only a safety limit on the request body, matching the
    // backend's 200,000 character ceiling. No realistic set of notes reaches it.
    const LIMIT = 200_000;
    let truncated = false;
    if (content.length > LIMIT) {
      content = content.slice(0, LIMIT);
      truncated = true;
    }

    setSummaryError("");
    setSummaryResult("");
    setSummaryPending(true);
    try {
      const data = await summarize(summaryModule || "GENERAL", content);
      // Mention trimming only when it actually happened, and say what it means.
      setSummaryResult(
        truncated
          ? `${data.summary}\n\n---\n\n**Note:** your material was longer than ${LIMIT.toLocaleString()} characters, so it was trimmed to fit. Split very large uploads if you need complete coverage.`
          : data.summary,
      );
    } catch (err) {
      // Surface the backend's own message where we can — a generic
      // "try again" hides the real cause (length, validation, body size).
      if (err instanceof ApiError && err.status === 429) {
        setSummaryError("Daily summary limit reached. Try again tomorrow.");
      } else if (err instanceof ApiError && err.status === 503) {
        setSummaryError("AI is unavailable right now. Try again shortly.");
      } else if (err instanceof ApiError && err.status === 413) {
        setSummaryError("That content is too large to send. Try a shorter extract.");
      } else if (err instanceof ApiError && err.status === 422) {
        setSummaryError(
          "The server rejected this content. Check the module and try shorter text.",
        );
      } else if (err instanceof ApiError) {
        setSummaryError(`Could not create a summary (HTTP ${err.status}).`);
      } else {
        setSummaryError("Could not create a summary. Try again.");
      }
    } finally {
      setSummaryPending(false);
    }
  };

  // Fetch the dashboard once we're authenticated (and on every re-entry).
  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    setDashboardError("");
    getDashboard()
      .then((data) => {
        if (!cancelled) setDashboard(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 0)) {
          // Token invalid/expired or backend unreachable -> back to login.
          signOut();
        } else {
          setDashboardError("Could not load your dashboard.");
        }
      });
    // Modules load independently so a failure there doesn't blank the page.
    getModules()
      .then((data) => {
        if (cancelled) return;
        setModuleList(data);
        // Fetch the material count for the modules actually shown on the
        // dashboard (first 3) so the cards display a real number.
        data.slice(0, 3).forEach((m) => {
          searchMaterials({ moduleCode: m.code, size: 1 })
            .then((page) => {
              if (!cancelled) {
                setModuleMaterialCounts((prev) => ({
                  ...prev,
                  [m.code]: page.total,
                }));
              }
            })
            .catch(() => {
              /* non-fatal: the card just omits the count */
            });
        });
      })
      .catch(() => {
        /* non-fatal: leave the modules section empty */
      });
    // Tasks load independently too (feeds the "Your deadlines" card).
    getTasks()
      .then((data) => {
        if (!cancelled) setTaskList(data);
      })
      .catch(() => {
        /* non-fatal: leave the deadlines section empty */
      });
    // The user's own recent activity (real events, never hardcoded).
    getActivity()
      .then((data) => {
        if (!cancelled) setActivity(data);
      })
      .catch(() => {
        /* non-fatal: leave the activity section empty */
      });
    // At-risk deadlines (heuristic, always available).
    getAtRisk()
      .then((data) => {
        if (!cancelled) setAtRisk(data);
      })
      .catch(() => {
        /* non-fatal: leave the risk panel hidden */
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  // Load the full task list when the Study Planner is opened.
  useEffect(() => {
    if (!authenticated || activeNav !== "Study Planner") return;
    let cancelled = false;
    setPlannerLoading(true);
    getAllTasks()
      .then((items) => {
        if (!cancelled) setPlannerTasks(items);
      })
      .catch(() => {
        /* non-fatal: planner shows an empty state */
      })
      .finally(() => {
        if (!cancelled) setPlannerLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, activeNav]);

  // Load summary history when the AI Summaries view is opened.
  useEffect(() => {
    if (!authenticated || activeNav !== "AI Summaries") return;
    let cancelled = false;
    setSummariesLoading(true);
    getSummaryHistory()
      .then((items) => {
        if (!cancelled) setSummaries(items);
      })
      .catch(() => {
        /* non-fatal: the view shows its empty state */
      })
      .finally(() => {
        if (!cancelled) setSummariesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, activeNav]);

  // When arriving at Find Materials (e.g. from the header search box or by
  // clicking a module card), load its materials automatically.
  // Load materials when the student ENTERS Find Materials, or changes the
  // module/type.
  //
  // WHY NOT keyed on matQuery: matQuery is bound to the search text box, so
  // including it here fired a full search on EVERY keystroke. Mid-word queries
  // match nothing, so the view kept settling on "No materials found" and looked
  // broken. Typing is handled by the Search button / Enter key instead.
  useEffect(() => {
    if (!authenticated || activeNav !== "Find Materials") return;
    if (!moduleList.length) return;
    runMaterialSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, activeNav, matModule, matType, moduleList.length]);

  // Keep recoModule in step with what the dropdown actually shows.
  //
  // The <select> has no empty option once modules exist, so the browser renders
  // the FIRST module as selected while React state is still "". Without this
  // sync the picker looked populated but the handler saw an empty code, which is
  // why "Generate" appeared to do nothing.
  useEffect(() => {
    if (recoModule || !moduleList.length) return;
    setRecoModule(moduleList[0].code);
  }, [moduleList, recoModule]);

  // Load recommendations when the Recommendations view is opened (once per
  // module selection; results are cached server-side so repeat views are free).
  useEffect(() => {
    if (!authenticated || activeNav !== "Recommendations") return;
    // Wait for modules: loadRecommendations falls back to the first module, but
    // firing with none would only show an error the student cannot act on.
    if (!moduleList.length) return;
    loadRecommendations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, activeNav, moduleList.length]);

  // Load the user's briefs when the Chat with Brief view is opened.
  useEffect(() => {
    if (!authenticated || activeNav !== "Chat with Brief") return;
    loadBriefs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, activeNav]);

  // Mark a task complete from the planner, then refresh both lists.
  const markComplete = async (taskId: string) => {
    try {
      await completeTask(taskId);
      const [all, first] = await Promise.all([getAllTasks(), getTasks()]);
      setPlannerTasks(all);
      setTaskList(first);
      notify("Task completed");
    } catch {
      notify("Could not update the task");
    }
  };

  // --- "Chat with your brief" handlers -------------------------------------

  // Load the user's briefs (called when the view opens).
  const loadBriefs = async () => {
    try {
      const items = await getBriefs();
      setBriefs(items);
      // Auto-select the newest brief so the chat is immediately usable.
      if (items.length && !items.some((b) => b.id === activeBrief)) {
        setActiveBrief(items[0].id);
      }
    } catch {
      /* non-fatal: the view shows its empty state */
    }
  };

  // Reuse the existing PDF/DOCX/text extractor, then ingest into the RAG store.
  const handleBriefFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBriefPending(true);
    setBriefError("");
    try {
      const text = await extractTextFromFile(file);
      if (text.trim().length < 20) {
        setBriefError("That file didn't contain enough readable text.");
        return;
      }
      const created = await createBrief(file.name, text);
      setBriefs((prev) => [created, ...prev]);
      setActiveBrief(created.id);
      setChatLog([]);
      notify(`${created.source_name} ready — ask away`);
    } catch (err) {
      if (err instanceof UnsupportedFileError) setBriefError(err.message);
      else if (err instanceof ApiError && err.status === 413)
        setBriefError("That document is too large to index.");
      else setBriefError("Could not read that file. Try another format.");
    } finally {
      setBriefPending(false);
      // Reset so selecting the same file again still fires onChange.
      if (briefInputRef.current) briefInputRef.current.value = "";
    }
  };

  // Ask a question about the active brief and append to the conversation.
  const askActiveBrief = async () => {
    const q = briefQuestion.trim();
    if (!activeBrief) {
      setBriefError("Upload or select a brief first.");
      return;
    }
    if (q.length < 3) {
      setBriefError("Type a longer question.");
      return;
    }
    setBriefError("");
    const question = q;
    setBriefQuestion("");
    setBriefAsking(true);
    try {
      const res = await askBrief(activeBrief, question);
      setChatLog((prev) => [
        ...prev,
        { q: question, a: res.answer, cites: res.citations },
      ]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setBriefError("Daily AI limit reached. Try again tomorrow.");
      } else if (err instanceof ApiError && err.status === 404) {
        setBriefError("That brief no longer exists.");
      } else {
        setBriefError("Could not answer that. Try again.");
      }
    } finally {
      setBriefAsking(false);
    }
  };

  // Load AI recommendations for a module (defaults to the first module).
  const loadRecommendations = async (code?: string) => {
    const target = (code || recoModule || moduleList[0]?.code || "").trim();
    if (target.length < 2) {
      setRecoError(
        moduleList.length
          ? "Pick a module, then press Generate."
          : "Add a module first — recommendations are per module.",
      );
      setReco(null);
      return;
    }
    // Reflect the choice in the picker too, so the UI and the request agree.
    setRecoModule(target);
    setRecoError("");
    setRecoLoading(true);
    try {
      setReco(await getRecommendations(target));
    } catch (err) {
      setReco(null);
      // Report the real cause — a generic "try again" hides actionable states.
      if (err instanceof ApiError && err.status === 429) {
        setRecoError(
          "Daily AI limit reached. Try again tomorrow — the limit resets daily.",
        );
      } else if (err instanceof ApiError && err.status === 404) {
        setRecoError(
          "That module is not in your account any more. Pick another one.",
        );
      } else if (err instanceof ApiError && err.status === 0) {
        setRecoError("Cannot reach the server. Check your connection.");
      } else if (err instanceof ApiError && err.status === 401) {
        setRecoError("Your session expired — please sign in again.");
      } else if (err instanceof ApiError) {
        setRecoError(`Could not generate recommendations (HTTP ${err.status}).`);
      } else {
        setRecoError("Could not generate recommendations. Try again.");
      }
    } finally {
      setRecoLoading(false);
    }
  };

  // Ask the server to find real resources for the selected module.
  //
  // The student already typed the module in themselves; this only fetches
  // resources FOR it. It can take up to a minute (several upstream APIs plus a
  // link validation pass), so the button shows progress and the note explains
  // what is happening.
  const findResourcesForModule = async () => {
    const code = (matModule || moduleList[0]?.code || "").trim();
    if (code.length < 2) {
      setMatError("Pick a module first — resources are found per module.");
      return;
    }
    setMatError("");
    setMatIngestNote("");
    setMatIngesting(true);
    try {
      const result: IngestResult = await ingestModuleResources(code);
      setMatIngestNote(result.message);
      // Re-run the search so the new resources appear immediately.
      await runMaterialSearch();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setMatError(
          "Already finding resources for this module — give it a moment.",
        );
      } else if (err instanceof ApiError && err.status === 404) {
        setMatError("That module is not in your account.");
      } else if (err instanceof ApiError && err.status === 0) {
        setMatError("Cannot reach the server.");
      } else {
        setMatError("Could not find resources right now. Try again.");
      }
    } finally {
      setMatIngesting(false);
    }
  };

  // Search study materials. The backend REQUIRES a module, so fall back to the
  // first module when the student hasn't picked one yet.
  const runMaterialSearch = async (opts?: { q?: string }) => {
    // THE BACKEND REQUIRES A MODULE CODE (min 2 chars). Fall back to the first
    // module so "just press Search" always works, and never send an empty code
    // (the API rejects it with 422, which used to look like "no results").
    const code = (matModule || moduleList[0]?.code || "").trim();
    if (code.length < 2) {
      setMatError(
        moduleList.length
          ? "Pick a module to search its materials."
          : "Add a module first — materials are grouped by module.",
      );
      setMatResults([]);
      setMatTotal(0);
      setMatSearched(false);
      return;
    }
    // Callers may pass an explicit query (the header search box does);
    // otherwise use the text box value.
    const query = (opts?.q ?? matQuery).trim();

    setMatError("");
    setMatLoading(true);
    setMatSearched(true);
    try {
      const page = await searchMaterials({
        moduleCode: code,
        q: query,
        resourceType: matType || undefined,
        size: 24,
      });
      setMatResults(page.items ?? []);
      setMatTotal(page.total ?? 0);
    } catch (err) {
      setMatResults([]);
      setMatTotal(0);
      // Report the REAL reason so a failure is never mistaken for "no results".
      if (err instanceof ApiError && err.status === 0) {
        setMatError("Cannot reach the server. Check your connection.");
      } else if (err instanceof ApiError && err.status === 401) {
        setMatError("Your session expired — please sign in again.");
      } else if (err instanceof ApiError && err.status === 422) {
        setMatError("That module or filter was not accepted. Try another.");
      } else if (err instanceof ApiError) {
        setMatError(`Could not load materials (HTTP ${err.status}).`);
      } else {
        setMatError("Could not load materials. Try again.");
      }
    } finally {
      setMatLoading(false);
    }
  };

  if (!authenticated) {
    return <AuthPage onSuccess={() => setAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-[#F7F8F5] text-[#162A3A]">
      {toast && (
        <div className="fixed right-5 top-5 z-50 rounded-xl bg-[#173C46] px-4 py-3 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}

      {/* Add-deadline modal: creates a real task via POST /academic/tasks. */}
      {deadlineOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#102D36]/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[440px] rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#7D8C89]">
                  New
                </p>
                <h3 className="mt-1 font-display text-xl font-extrabold">
                  Add a deadline
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDeadlineOpen(false)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-[#6B7B7A] hover:bg-[#EFF3F0]"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-[11px] font-bold text-[#435956]">
                  Title
                </span>
                <input
                  value={deadlineTitle}
                  onChange={(event) => setDeadlineTitle(event.target.value)}
                  placeholder="e.g. Database Design Project"
                  className="h-12 w-full rounded-xl border border-[#D9E2DE] bg-white px-4 text-xs outline-none transition placeholder:text-[#A3ADAA] focus:border-[#5CA599] focus:ring-3 focus:ring-[#5CA599]/10"
                />
              </label>

              <div className="block">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#435956]">
                    Module
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setModuleError("");
                      setShowAddModule((v) => !v);
                    }}
                    className="text-[11px] font-bold text-[#41877C] hover:text-[#286D64]"
                  >
                    {showAddModule ? "Cancel" : "+ Add module"}
                  </button>
                </div>

                {/* The select stays visible at all times so the chosen module
                    is always clear; the inline creator appears below it. */}
                <select
                  value={deadlineModule}
                  onChange={(event) => setDeadlineModule(event.target.value)}
                  className="h-12 w-full rounded-xl border border-[#D9E2DE] bg-white px-3 text-xs outline-none focus:border-[#5CA599]"
                >
                  {moduleList.length === 0 && (
                    <option value="">No modules yet — use “+ Add module”</option>
                  )}
                  {moduleList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.code} — {m.name}
                    </option>
                  ))}
                </select>

                {showAddModule && (
                  // Inline module creation, so a new student can add their
                  // first module without leaving the deadline flow.
                  <div className="mt-2 space-y-2 rounded-xl border border-[#D9E2DE] bg-[#F7FAF8] p-3">
                    <input
                      value={newModuleCode}
                      onChange={(event) => setNewModuleCode(event.target.value)}
                      placeholder="Code (e.g. INF154)"
                      maxLength={20}
                      className="h-11 w-full rounded-lg border border-[#D9E2DE] bg-white px-3 text-xs outline-none focus:border-[#5CA599]"
                    />
                    <input
                      value={newModuleName}
                      onChange={(event) => setNewModuleName(event.target.value)}
                      placeholder="Full module name (e.g. Imperative Programming)"
                      maxLength={255}
                      className="h-11 w-full rounded-lg border border-[#D9E2DE] bg-white px-3 text-xs outline-none focus:border-[#5CA599]"
                    />
                    {moduleError && (
                      <p className="text-[11px] font-semibold text-[#B9533E]">
                        {moduleError}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={submitModule}
                      disabled={modulePending}
                      className="h-11 w-full rounded-lg bg-[#173C46] text-xs font-extrabold text-white transition hover:bg-[#21515A] disabled:opacity-60"
                    >
                      {modulePending ? "Adding…" : "Add module"}
                    </button>
                  </div>
                )}
              </div>

              <label className="block">
                <span className="mb-2 block text-[11px] font-bold text-[#435956]">
                  Due date &amp; time
                </span>
                <input
                  type="datetime-local"
                  value={deadlineDate}
                  onChange={(event) => setDeadlineDate(event.target.value)}
                  className="h-12 w-full rounded-xl border border-[#D9E2DE] bg-white px-4 text-xs outline-none focus:border-[#5CA599]"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-2 block text-[11px] font-bold text-[#435956]">
                    Type
                  </span>
                  <select
                    value={deadlineType}
                    onChange={(event) =>
                      setDeadlineType(event.target.value as typeof deadlineType)
                    }
                    className="h-12 w-full rounded-xl border border-[#D9E2DE] bg-white px-3 text-xs outline-none focus:border-[#5CA599]"
                  >
                    <option value="ASSIGNMENT">Assignment</option>
                    <option value="TEST">Test</option>
                    <option value="EXAM">Exam</option>
                    <option value="QUIZ">Quiz</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-[11px] font-bold text-[#435956]">
                    Priority
                  </span>
                  <select
                    value={deadlinePriority}
                    onChange={(event) =>
                      setDeadlinePriority(event.target.value as typeof deadlinePriority)
                    }
                    className="h-12 w-full rounded-xl border border-[#D9E2DE] bg-white px-3 text-xs outline-none focus:border-[#5CA599]"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </label>
              </div>

              {deadlineError && (
                <p className="rounded-xl bg-[#FDEEEA] px-3.5 py-2.5 text-[11px] font-semibold text-[#B9533E]">
                  {deadlineError}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setDeadlineOpen(false)}
                  className="h-12 flex-1 rounded-xl border border-[#D9E2DE] text-xs font-bold text-[#4B6361] hover:bg-[#F1F6F4]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitDeadline}
                  disabled={deadlinePending}
                  className="h-12 flex-1 rounded-xl bg-[#173C46] text-xs font-extrabold text-white transition hover:bg-[#21515A] disabled:opacity-60"
                >
                  {deadlinePending ? "Saving…" : "Save deadline"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {mobileOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-[#102D36]/30 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col border-r border-[#DCE5E1] bg-[#FBFCFA] px-4 pb-6 pt-7 transition-transform lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-9 flex items-center justify-between px-3">
          <div className="flex items-center gap-3">
            <div className="logo-mark">
              <span />
              <span />
              <span />
            </div>
            <div>
              <p className="font-display text-[17px] font-extrabold leading-none tracking-[-0.03em]">
                Varsity
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#71807D]">
                Companion
              </p>
            </div>
          </div>
          <button
            className="rounded-lg p-1.5 text-[#6B7B7A] lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <Icon name="close" />
          </button>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                setActiveNav(item.label);
                setMobileOpen(false);
                if (item.label !== "Overview") {
                  notify(`${item.label} is ready for your next session`);
                }
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-[13px] font-semibold transition ${
                activeNav === item.label
                  ? "bg-[#DCEDEA] text-[#174D4D]"
                  : "text-[#60716F] hover:bg-[#EFF3F0] hover:text-[#173C46]"
              }`}
            >
              <Icon name={item.icon} className="h-[19px] w-[19px]" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto">
          <div className="mb-4 rounded-2xl border border-[#D4E4E0] bg-[#EEF6F3] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#526B68]">
                Daily credits
              </span>
              <span className="text-xs font-extrabold text-[#1C5B56]">
                {quotaUsed} / {quotaLimit}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#D4E5E1]">
              <div
                className="h-full rounded-full bg-[#4FA497]"
                style={{ width: `${quotaPercent}%` }}
              />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[#6C7E7B]">
              Resets daily. Repeat summaries are cached (no extra credits).
            </p>
          </div>
          <button
            // Navigate to the Account view.
            //
            // This used to only raise a toast ("Signed in as ...") and change
            // nothing on screen, so clicking Account appeared to do nothing at
            // all. It is now a real destination.
            onClick={() => setActiveNav("Account")}
            className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition ${
              activeNav === "Account"
                ? "bg-[#E6F4F1] text-[#205A55]"
                : "text-[#60716F] hover:bg-[#EFF3F0]"
            }`}
          >
            <Icon name="settings" className="h-[18px] w-[18px]" />
            Account
          </button>
          <button
            // Navigate to the How it works page.
            //
            // This previously only raised a toast ("Upload a file or paste
            // notes, then press Summarise") and changed nothing on screen, so
            // the entry looked broken — the same defect Account had.
            onClick={() => setActiveNav("How it works")}
            className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition ${
              activeNav === "How it works"
                ? "bg-[#E6F4F1] text-[#205A55]"
                : "text-[#60716F] hover:bg-[#EFF3F0]"
            }`}
          >
            <Icon name="help" className="h-[18px] w-[18px]" />
            How it works
          </button>
          <button
            onClick={signOut}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold text-[#60716F] hover:bg-[#EFF3F0]"
          >
            <Icon name="arrow" className="h-[18px] w-[18px] rotate-180" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center border-b border-[#E0E6E2] bg-[#F7F8F5]/90 px-5 backdrop-blur-xl sm:px-8 lg:px-10">
          <button
            className="mr-3 rounded-lg p-2 text-[#24444A] lg:hidden"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <Icon name="menu" />
          </button>

          <form
            className="relative hidden max-w-[390px] flex-1 md:block"
            onSubmit={(event) => {
              event.preventDefault();
              // Header search jumps to Find Materials and runs the query there.
              // The text box is updated so the view shows what was searched, and
              // the search is run explicitly with that value because the
              // auto-search effect no longer watches matQuery.
              const q = searchValue.trim();
              if (!q) return;
              setMatQuery(q);
              setActiveNav("Find Materials");
              void runMaterialSearch({ q });
              notify(`Searching materials for “${q}”`);
            }}
          >
            <Icon
              name="search"
              className="absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#82908E]"
            />
            <input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              aria-label="Search study materials"
              placeholder="Search summaries, modules, materials..."
              className="h-10 w-full rounded-xl border border-[#DDE5E1] bg-white/70 pl-10 pr-4 text-xs outline-none transition placeholder:text-[#98A4A1] focus:border-[#6DAE9F] focus:ring-2 focus:ring-[#6DAE9F]/15"
            />
          </form>

          <div className="ml-auto flex items-center gap-3 sm:gap-5">
            {/* Real engine status, not a feature claim: the header reflected a
                "Low-data mode" that was never implemented. */}
            <div className="hidden items-center gap-2 rounded-full border border-[#D8E2DE] bg-white px-3 py-1.5 text-[11px] font-bold text-[#58716D] sm:flex">
              <span
                className={`h-2 w-2 rounded-full ${
                  dashboardError ? "bg-[#EB765B]" : "bg-[#60A99B]"
                }`}
              />
              {dashboardError ? "Reconnecting" : "Connected"}
            </div>
            <button
              onClick={() =>
                notify(
                  openTasks > 0
                    ? `${openTasks} deadline${openTasks === 1 ? "" : "s"} still open — check your planner`
                    : "You're all caught up",
                )
              }
              className="relative rounded-xl border border-[#DDE5E1] bg-white p-2.5 text-[#526B6B] transition hover:border-[#AFC7C1]"
              aria-label="Notifications"
            >
              <Icon name="bell" className="h-[18px] w-[18px]" />
              {/* Dot only when there is something to act on. */}
              {openTasks > 0 && (
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#EB765B] ring-2 ring-white" />
              )}
            </button>
            <button className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#173C46] text-xs font-extrabold text-white">
                {initials}
              </span>
              <span className="hidden text-left xl:block">
                <span className="block text-xs font-bold">{displayName}</span>
                <span className="block text-[10px] text-[#7F8D8A]">Student</span>
              </span>
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1440px] px-5 pb-12 pt-8 sm:px-8 lg:px-10">
          {activeNav === "Chat with Brief" ? (
            // ---- Chat with your brief (RAG over the user's own document) ----
            <div>
              <div className="mb-7">
                <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#5B8B82]">
                  Ask your own documents
                </p>
                <h1 className="font-display text-[30px] font-extrabold tracking-[-0.035em] text-[#142D38] sm:text-[36px]">
                  Chat with your brief
                </h1>
                <p className="mt-1 text-sm text-[#73817E]">
                  Upload an assignment brief or notes, then ask questions and get
                  answers with citations.
                </p>
              </div>

              {/* Upload / select */}
              <div className="mb-6 rounded-2xl border border-[#DEE5E1] bg-white p-4 shadow-[0_8px_25px_rgba(35,65,60,0.04)]">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="min-w-[260px] flex-1">
                    <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#7D8C89]">
                      Your briefs
                    </span>
                    <select
                      value={activeBrief}
                      onChange={(event) => {
                        setActiveBrief(event.target.value);
                        setChatLog([]);
                      }}
                      className="h-11 w-full rounded-xl border border-[#D9E2DE] bg-white px-3 text-xs outline-none focus:border-[#5CA599]"
                    >
                      {briefs.length === 0 && (
                        <option value="">No briefs uploaded yet</option>
                      )}
                      {briefs.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.source_name} ({b.chunk_count} chunks)
                        </option>
                      ))}
                    </select>
                  </label>
                  <input
                    ref={briefInputRef}
                    type="file"
                    accept=".pdf,.docx,.pptx,.doc,.txt,.md,.csv,.json"
                    onChange={handleBriefFile}
                    className="hidden"
                  />
                  <button
                    onClick={() => briefInputRef.current?.click()}
                    disabled={briefPending}
                    className="flex h-11 items-center gap-2 rounded-xl bg-[#173C46] px-5 text-xs font-extrabold text-white transition hover:bg-[#21515A] disabled:opacity-60"
                  >
                    <Icon name="document" className="h-4 w-4" />
                    {briefPending ? "Reading…" : "Upload brief"}
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-[#8C9795]">
                  PDF, DOCX, TXT, MD, CSV or JSON. Indexed privately to your
                  account only.
                </p>
              </div>

              {briefError && (
                <p className="mb-4 rounded-xl bg-[#FDEEEA] px-4 py-3 text-[11px] font-semibold text-[#B9533E]">
                  {briefError}
                </p>
              )}

              {briefs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#C9D7D3] bg-white p-10 text-center">
                  <p className="text-sm font-extrabold text-[#243B42]">
                    No brief yet
                  </p>
                  <p className="mt-1 text-[12px] text-[#7D8886]">
                    Upload your assignment brief to start asking questions.
                  </p>
                </div>
              ) : (
                <>
                  {/* Conversation */}
                  <div className="mb-4 space-y-4">
                    {chatLog.length === 0 && (
                      <p className="rounded-2xl bg-[#F4F7F5] px-4 py-3 text-[11px] text-[#657C78]">
                        Try asking: “What is the assignment worth?”, “When is it
                        due?”, “What does the rubric weight most?”
                      </p>
                    )}
                    {chatLog.map((turn, i) => (
                      <div key={i} className="space-y-3">
                        <div className="flex justify-end">
                          <p className="max-w-[80%] rounded-2xl bg-[#173C46] px-4 py-2.5 text-[12px] text-white">
                            {turn.q}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-[#DEE5E1] bg-white p-5">
                          <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#3A4A4A]">
                            {turn.a}
                          </p>
                          {turn.cites.length > 0 && (
                            <details className="mt-3">
                              <summary className="cursor-pointer text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#41877C]">
                                Sources ({turn.cites.length})
                              </summary>
                              <div className="mt-2 space-y-2">
                                {turn.cites.map((c) => (
                                  <p
                                    key={c.ordinal}
                                    className="rounded-lg bg-[#F4F7F5] p-2.5 text-[10px] leading-relaxed text-[#5C6E6B]"
                                  >
                                    <span className="font-extrabold">
                                      Excerpt {c.ordinal}:{" "}
                                    </span>
                                    {c.text}
                                  </p>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      </div>
                    ))}
                    {briefAsking && (
                      <p className="text-[11px] text-[#7D8886]">
                        Searching your brief…
                      </p>
                    )}
                  </div>

                  {/* Ask box */}
                  <div className="flex items-end gap-3 rounded-2xl border border-[#DEE5E1] bg-white p-3">
                    <textarea
                      value={briefQuestion}
                      onChange={(event) => setBriefQuestion(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          askActiveBrief();
                        }
                      }}
                      rows={2}
                      placeholder="Ask something about this brief…"
                      className="min-h-[44px] flex-1 resize-none rounded-xl border border-[#E2E9E6] px-3 py-2.5 text-xs outline-none placeholder:text-[#A3ADAA] focus:border-[#5CA599]"
                    />
                    <button
                      onClick={askActiveBrief}
                      disabled={briefAsking || briefQuestion.trim().length < 3}
                      className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-[#EB765B] px-4 text-[11px] font-extrabold text-white transition hover:bg-[#D9654C] disabled:opacity-50"
                    >
                      {briefAsking ? "Thinking…" : "Ask"}
                      <Icon name="arrow" className="h-[16px] w-[16px]" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : activeNav === "Recommendations" ? (
            // ---- AI Recommendations (Gemini brief + real library items) ----
            <div>
              <div className="mb-7">
                <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#5B8B82]">
                  Personalised for you
                </p>
                <h1 className="font-display text-[30px] font-extrabold tracking-[-0.035em] text-[#142D38] sm:text-[36px]">
                  Recommendations
                </h1>
                <p className="mt-1 text-sm text-[#73817E]">
                  An AI study brief for your module, grounded in your own
                  library.
                </p>
              </div>

              {/* Module picker + regenerate */}
              <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-[#DEE5E1] bg-white p-4 shadow-[0_8px_25px_rgba(35,65,60,0.04)]">
                <label className="min-w-[240px] flex-1">
                  <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#7D8C89]">
                    Module
                  </span>
                  <select
                    value={recoModule}
                    onChange={(event) => loadRecommendations(event.target.value)}
                    className="h-11 w-full rounded-xl border border-[#D9E2DE] bg-white px-3 text-xs outline-none focus:border-[#5CA599]"
                  >
                    {moduleList.length === 0 && (
                      <option value="">No modules yet</option>
                    )}
                    {moduleList.map((m) => (
                      <option key={m.id} value={m.code}>
                        {m.code} — {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  // Never leave this button silently inert. It is only disabled
                  // while a request is in flight; with no modules it stays
                  // clickable so the handler can explain what to do instead of
                  // appearing broken.
                  onClick={() => loadRecommendations()}
                  disabled={recoLoading}
                  className="flex h-11 items-center gap-2 rounded-xl bg-[#173C46] px-5 text-xs font-extrabold text-white transition hover:bg-[#21515A] disabled:opacity-60"
                >
                  <Icon name="sparkles" className="h-4 w-4" />
                  {recoLoading ? "Analysing…" : "Generate"}
                </button>
              </div>

              {moduleList.length === 0 && (
                <p className="mb-4 rounded-xl bg-[#FFF6DF] px-4 py-3 text-[11px] font-semibold text-[#8A6420]">
                  Add a module first — recommendations are generated per module.
                  Use “Manage modules” on the dashboard.
                </p>
              )}

              {recoError && (
                <p className="mb-4 rounded-xl bg-[#FDEEEA] px-4 py-3 text-[11px] font-semibold text-[#B9533E]">
                  {recoError}
                </p>
              )}

              {recoLoading ? (
                <p className="rounded-2xl border border-[#DEE5E1] bg-white p-6 text-sm text-[#73817E]">
                  Analysing your module and library…
                </p>
              ) : !reco ? (
                <div className="rounded-2xl border border-dashed border-[#C9D7D3] bg-white p-10 text-center">
                  <p className="text-sm font-extrabold text-[#243B42]">
                    No recommendations yet
                  </p>
                  <p className="mt-1 text-[12px] text-[#7D8886]">
                    Add a module, then press Generate.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* AI brief */}
                  <section className="rounded-2xl border border-[#DEE5E1] bg-white p-6 shadow-[0_8px_25px_rgba(35,65,60,0.04)]">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-display text-lg font-extrabold">
                        {reco.module_name}
                        <span className="ml-2 rounded-md bg-[#E5F0ED] px-2 py-1 text-[10px] font-extrabold tracking-[0.08em] text-[#205A55]">
                          {reco.module_code}
                        </span>
                      </h2>
                      {reco.cached && (
                        <span className="text-[10px] font-bold text-[#8C9795]">
                          cached · instant
                        </span>
                      )}
                    </div>

                    {reco.ai_brief ? (
                      <div className="text-[12px] leading-relaxed text-[#3A4A4A]">
                        {reco.ai_brief.split("\n").map((line, i) => {
                          const t = line.trim();
                          if (!t) return null;
                          if (t.startsWith("## ")) {
                            return (
                              <h3
                                key={i}
                                className="mt-4 mb-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#41877C]"
                              >
                                {t.replace("## ", "")}
                              </h3>
                            );
                          }
                          return (
                            <p key={i} className="my-1">
                              {t.replace(/^[-*]\s*/, "• ")}
                            </p>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[12px] text-[#7D8886]">
                        The AI brief is unavailable right now — your library
                        items are below.
                      </p>
                    )}
                  </section>

                  {/* Real library items (never invented links) */}
                  <section>
                    <h3 className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#7D8C89]">
                      From your library ({reco.materials.length})
                    </h3>
                    {reco.materials.length === 0 ? (
                      <p className="rounded-2xl bg-white p-5 text-[12px] text-[#7D8886]">
                        No materials for this module yet.
                      </p>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {reco.materials.map((m) => (
                          <a
                            key={m.id}
                            href={m.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 rounded-2xl border border-[#DEE5E1] bg-white p-4 transition hover:border-[#9CBEB7]"
                          >
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#EEF6F3] text-[#41877C]">
                              <Icon name="book" className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-extrabold">
                                {m.title}
                              </span>
                              <span className="mt-0.5 block text-[10px] text-[#8C9795]">
                                {m.resource_type}
                              </span>
                            </span>
                            <Icon
                              name="arrow"
                              className="h-4 w-4 shrink-0 text-[#9BA5A3]"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          ) : activeNav === "AI Summaries" ? (
            // ---- AI Summaries view (the user's real summary history) ----
            <div>
              <div className="mb-7">
                <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#5B8B82]">
                  Your study library
                </p>
                <h1 className="font-display text-[30px] font-extrabold tracking-[-0.035em] text-[#142D38] sm:text-[36px]">
                  AI summaries
                </h1>
                <p className="mt-1 text-sm text-[#73817E]">
                  Every summary you've generated, newest first.
                </p>
              </div>

              {summariesLoading ? (
                <p className="rounded-2xl border border-[#DEE5E1] bg-white p-6 text-sm text-[#73817E]">
                  Loading your summaries…
                </p>
              ) : summaries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#C9D7D3] bg-white p-10 text-center">
                  <p className="text-sm font-extrabold text-[#243B42]">
                    No summaries yet
                  </p>
                  <p className="mt-1 text-[12px] text-[#7D8886]">
                    Upload a file or paste notes on the dashboard to create your
                    first summary.
                  </p>
                  <button
                    onClick={() => setActiveNav("Overview")}
                    className="mt-5 rounded-xl bg-[#173C46] px-4 py-2.5 text-[11px] font-extrabold text-white transition hover:bg-[#21515A]"
                  >
                    Go to dashboard
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {summaries.map((s) => {
                    const when = s.created_at
                      ? new Date(s.created_at).toLocaleString("en-ZA", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })
                      : "";
                    return (
                      <div
                        key={s.id}
                        className="rounded-2xl border border-[#DEE5E1] bg-white p-5 shadow-[0_8px_25px_rgba(35,65,60,0.04)]"
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <span className="rounded-lg bg-[#E5F0ED] px-2.5 py-1 text-[10px] font-extrabold tracking-[0.08em] text-[#205A55]">
                            {s.module_code}
                          </span>
                          <span className="text-[10px] text-[#8C9795]">
                            {when}
                          </span>
                        </div>
                        {/* Preview is the first 220 chars of a markdown
                            study guide, so render it rather than dumping raw
                            "##" and "**" symbols. */}
                        <div className="max-h-[120px] overflow-hidden">
                          {renderMarkdown(s.preview)}
                          {s.preview.length >= 220 && (
                            <p className="mt-1 text-[11px] text-[#8C9795]">…</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeNav === "Find Materials" ? (
            // ---- Find Materials view (real module-scoped search) ----
            <div>
              <div className="mb-7">
                <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#5B8B82]">
                  Discover better sources
                </p>
                <h1 className="font-display text-[30px] font-extrabold tracking-[-0.035em] text-[#142D38] sm:text-[36px]">
                  Find materials
                </h1>
                <p className="mt-1 text-sm text-[#73817E]">
                  Ranked videos, open journals and trusted resources for your
                  modules.
                </p>
              </div>

              {/* Search controls */}
              <div className="mb-6 rounded-2xl border border-[#DEE5E1] bg-white p-4 shadow-[0_8px_25px_rgba(35,65,60,0.04)]">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="min-w-[190px] flex-1">
                    <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#7D8C89]">
                      Module
                    </span>
                    <select
                      value={matModule}
                      onChange={(event) => setMatModule(event.target.value)}
                      className="h-11 w-full rounded-xl border border-[#D9E2DE] bg-white px-3 text-xs outline-none focus:border-[#5CA599]"
                    >
                      <option value="">
                        {moduleList[0]
                          ? `All / first module (${moduleList[0].code})`
                          : "No modules yet"}
                      </option>
                      {moduleList.map((m) => (
                        <option key={m.id} value={m.code}>
                          {m.code} — {m.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="min-w-[220px] flex-[2]">
                    <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#7D8C89]">
                      Search
                    </span>
                    <input
                      value={matQuery}
                      onChange={(event) => setMatQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") runMaterialSearch();
                      }}
                      placeholder="e.g. recursion, debugging, graphs"
                      className="h-11 w-full rounded-xl border border-[#D9E2DE] bg-white px-3 text-xs outline-none placeholder:text-[#A3ADAA] focus:border-[#5CA599]"
                    />
                  </label>

                  <label className="min-w-[150px]">
                    <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#7D8C89]">
                      Type
                    </span>
                    <select
                      value={matType}
                      onChange={(event) => setMatType(event.target.value)}
                      className="h-11 w-full rounded-xl border border-[#D9E2DE] bg-white px-3 text-xs outline-none focus:border-[#5CA599]"
                    >
                      <option value="">All types</option>
                      <option value="YOUTUBE">Video</option>
                      <option value="JOURNAL">Journal</option>
                      <option value="PDF">PDF</option>
                      <option value="ARTICLE">Article</option>
                    </select>
                  </label>

                  <button
                    // MUST wrap: a bare `onClick={runMaterialSearch}` would pass
                    // the click Event as the options argument.
                    onClick={() => runMaterialSearch()}
                    disabled={matLoading}
                    className="flex h-11 items-center gap-2 rounded-xl bg-[#173C46] px-5 text-xs font-extrabold text-white transition hover:bg-[#21515A] disabled:opacity-60"
                  >
                    <Icon name="search" className="h-4 w-4" />
                    {matLoading ? "Searching…" : "Search"}
                  </button>
                  {/* Only offered when there is actually something to clear, so
                      the toolbar does not grow for no reason. */}
                  {(matQuery || matType || matModule) && (
                    <button
                      onClick={() => {
                        setMatQuery("");
                        setMatType("");
                        setMatModule("");
                      }}
                      className="h-11 rounded-xl border border-[#D9E2DE] bg-white px-4 text-xs font-bold text-[#60716F] transition hover:border-[#9CBEB7]"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {matError && (
                <p className="mb-4 rounded-xl bg-[#FDEEEA] px-4 py-3 text-[11px] font-semibold text-[#B9533E]">
                  {matError}
                </p>
              )}

              {matIngestNote && (
                <p className="mb-4 rounded-xl bg-[#E5F0ED] px-4 py-3 text-[11px] font-semibold text-[#205A55]">
                  {matIngestNote}
                </p>
              )}

              {matLoading ? (
                <p className="rounded-2xl border border-[#DEE5E1] bg-white p-6 text-sm text-[#73817E]">
                  Searching materials…
                </p>
              ) : matResults.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#C9D7D3] bg-white p-10 text-center">
                  <p className="text-sm font-extrabold text-[#243B42]">
                    {matSearched ? "No materials found" : "Search your materials"}
                  </p>
                  <p className="mt-1 text-[12px] text-[#7D8886]">
                    {matSearched ? (
                      <>
                        Nothing matched
                        {matQuery ? ` “${matQuery}”` : ""}
                        {` in ${matModule || moduleList[0]?.code || "this module"}`}
                        {matType ? ` of type ${matType.toLowerCase()}` : ""}.
                        Try another keyword, or show everything for the module.
                      </>
                    ) : (
                      "Pick a module and search, or just press Search to browse."
                    )}
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    {(matQuery || matType || matModule) && (
                      <button
                        onClick={() => {
                          setMatQuery("");
                          setMatType("");
                          setMatModule("");
                        }}
                        className="rounded-xl border border-[#D9E2DE] bg-white px-4 py-2.5 text-[11px] font-extrabold text-[#4B6361] transition hover:border-[#9CBEB7]"
                      >
                        Show everything for this module
                      </button>
                    )}
                    {/* The useful action when a module genuinely has nothing
                        yet: go and find resources for the module the student
                        typed in. */}
                    {moduleList.length > 0 && (
                      <button
                        onClick={findResourcesForModule}
                        disabled={matIngesting}
                        className="rounded-xl bg-[#EB765B] px-4 py-2.5 text-[11px] font-extrabold text-white transition hover:bg-[#D9654C] disabled:opacity-60"
                      >
                        {matIngesting
                          ? "Searching the web…"
                          : "Find resources for this module"}
                      </button>
                    )}
                  </div>
                  {matIngesting && (
                    <p className="mt-3 text-[11px] text-[#8C7A72]">
                      Checking Wikipedia, arXiv and Open Library, then
                      verifying every link. This can take up to a minute.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <p className="mb-3 text-[11px] font-bold text-[#7D8C89]">
                    {matTotal} result{matTotal === 1 ? "" : "s"}
                    {matModule || moduleList[0]
                      ? ` for ${matModule || moduleList[0]?.code}`
                      : ""}
                  </p>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {matResults.map((m) => {
                      const meta = {
                        YOUTUBE: { label: "Video", icon: "play" as IconName, bg: "#FFF0EA", color: "#D96850" },
                        JOURNAL: { label: "Journal", icon: "book" as IconName, bg: "#E6F4F1", color: "#468F85" },
                        PDF: { label: "PDF", icon: "document" as IconName, bg: "#FFF6DF", color: "#B98532" },
                        ARTICLE: { label: "Article", icon: "book" as IconName, bg: "#EEF1EF", color: "#5D7C77" },
                      }[m.resource_type] ?? {
                        label: m.resource_type,
                        icon: "document" as IconName,
                        bg: "#EEF1EF",
                        color: "#5D7C77",
                      };
                      return (
                        <a
                          key={m.id}
                          href={m.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex flex-col rounded-2xl border border-[#DEE5E1] bg-white p-5 text-left shadow-[0_8px_25px_rgba(35,65,60,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(35,65,60,0.08)]"
                        >
                          <div className="mb-4 flex items-start justify-between">
                            <span
                              className="grid h-10 w-10 place-items-center rounded-xl"
                              style={{ backgroundColor: meta.bg, color: meta.color }}
                            >
                              <Icon name={meta.icon} className="h-[18px] w-[18px]" />
                            </span>
                            <span
                              className="rounded-md px-2 py-1 text-[9px] font-extrabold"
                              style={{ backgroundColor: meta.bg, color: meta.color }}
                            >
                              {meta.label}
                            </span>
                          </div>
                          <h3 className="text-sm font-extrabold leading-snug">
                            {m.title}
                          </h3>
                          {m.description && (
                            <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-[#7D8886]">
                              {m.description}
                            </p>
                          )}
                          <div className="mt-auto flex items-center gap-2 pt-4 text-[10px] font-bold text-[#41877C]">
                            {m.module_code}
                            <span className="text-[#C9D7D3]">·</span>
                            <span className="inline-flex items-center gap-1">
                              Open
                              <Icon name="arrow" className="h-3 w-3" />
                            </span>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ) : activeNav === "Study Planner" ? (
            // ---- Study Planner view (all deadlines, grouped by urgency) ----
            <div>
              <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#5B8B82]">
                    Plan ahead
                  </p>
                  <h1 className="font-display text-[30px] font-extrabold tracking-[-0.035em] text-[#142D38] sm:text-[36px]">
                    Study planner
                  </h1>
                  <p className="mt-1 text-sm text-[#73817E]">
                    Everything due, grouped by how soon it lands.
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (!deadlineModule && moduleList[0]) {
                      setDeadlineModule(moduleList[0].id);
                    }
                    setDeadlineError("");
                    setDeadlineOpen(true);
                  }}
                  className="flex items-center gap-2 rounded-xl bg-[#173C46] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#21515A]"
                >
                  <Icon name="plus" className="h-4 w-4" />
                  Add deadline
                </button>
              </div>

              {plannerLoading ? (
                <p className="rounded-2xl border border-[#DEE5E1] bg-white p-6 text-sm text-[#73817E]">
                  Loading your planner…
                </p>
              ) : plannerTasks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#C9D7D3] bg-white p-10 text-center">
                  <p className="text-sm font-extrabold text-[#243B42]">
                    Nothing planned yet
                  </p>
                  <p className="mt-1 text-[12px] text-[#7D8886]">
                    Add a deadline to start building your study plan.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {(
                    [
                      ["Overdue", "bg-[#FADFD6] text-[#B9533E]"],
                      ["Due this week", "bg-[#FFF1DC] text-[#B98532]"],
                      ["Later", "bg-[#E5EFEC] text-[#49766E]"],
                      ["Completed", "bg-[#EDF0EE] text-[#7D8C89]"],
                    ] as const
                  ).map(([group, chipClass]) => {
                    const now = Date.now();
                    const WEEK = 7 * 86_400_000;
                    const rows = plannerTasks
                      .filter((t) => {
                        const due = new Date(t.due_date).getTime();
                        const done = !!t.is_completed;
                        if (group === "Completed") return done;
                        if (done) return false;
                        if (group === "Overdue") return due < now;
                        if (group === "Due this week")
                          return due >= now && due <= now + WEEK;
                        return due > now + WEEK;
                      })
                      .sort(
                        (a, b) =>
                          new Date(a.due_date).getTime() -
                          new Date(b.due_date).getTime(),
                      );
                    if (rows.length === 0) return null;
                    return (
                      <section key={group}>
                        <div className="mb-3 flex items-center gap-3">
                          <h2 className="font-display text-lg font-extrabold">
                            {group}
                          </h2>
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold ${chipClass}`}
                          >
                            {rows.length}
                          </span>
                        </div>
                        <div className="space-y-2.5">
                          {rows.map((task) => {
                            const due = new Date(task.due_date);
                            const mod = moduleList.find(
                              (m) => m.id === task.module_id,
                            );
                            return (
                              <div
                                key={task.id}
                                className="flex items-center gap-4 rounded-2xl border border-[#DEE5E1] bg-white p-4 shadow-[0_6px_18px_rgba(35,65,60,0.04)]"
                              >
                                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#F4F7F5] text-center">
                                  <span className="text-[9px] font-extrabold uppercase text-[#5D7C77]">
                                    {due
                                      .toLocaleDateString("en-ZA", {
                                        month: "short",
                                      })
                                      .slice(0, 3)}
                                  </span>
                                  <span className="-mt-1 text-base font-extrabold text-[#243B42]">
                                    {String(due.getDate()).padStart(2, "0")}
                                  </span>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-extrabold">
                                    {task.title}
                                  </p>
                                  <p className="mt-1 text-[11px] text-[#7D8886]">
                                    {mod?.code ?? "Module"} ·{" "}
                                    {due.toLocaleTimeString("en-ZA", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      hour12: false,
                                    })}{" "}
                                    · {task.task_type ?? "TASK"}
                                  </p>
                                </div>
                                {task.is_completed ? (
                                  <span className="rounded-md bg-[#E5EFEC] px-2.5 py-1 text-[10px] font-extrabold text-[#49766E]">
                                    Done
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => markComplete(task.id)}
                                    className="rounded-lg border border-[#D8E1DD] bg-white px-3 py-2 text-[11px] font-bold text-[#4B6361] transition hover:border-[#9CBEB7]"
                                  >
                                    Mark complete
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeNav === "Account" ? (
            // ---- Account view -------------------------------------------------
            // Previously the sidebar "Account" entry was a button that only
            // raised a toast ("Signed in as ..."). Clicking it changed nothing on
            // screen, which read as a broken page. It now shows the real profile
            // from GET /auth/me, the plan/usage from GET /ai/quota, the account
            // type, and the actions a student actually needs.
            <div>
              <div className="mb-7">
                <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#5B8B82]">
                  Your details
                </p>
                <h1 className="font-display text-[30px] font-extrabold tracking-[-0.035em] text-[#142D38] sm:text-[36px]">
                  Account
                </h1>
                <p className="mt-1 text-sm text-[#73817E]">
                  Who you are on Varsity Companion, and what your plan allows.
                </p>
              </div>

              {accountLoading ? (
                <p className="rounded-2xl border border-[#DEE5E1] bg-white p-6 text-sm text-[#73817E]">
                  Loading your account…
                </p>
              ) : accountError ? (
                <div className="rounded-2xl bg-[#FDEEEA] p-5">
                  <p className="text-[12px] font-semibold text-[#B9533E]">
                    {accountError}
                  </p>
                  <button
                    onClick={() => void loadAccount()}
                    className="mt-3 rounded-xl bg-[#173C46] px-4 py-2 text-[11px] font-extrabold text-white transition hover:bg-[#21515A]"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <>
                  {/* Identity */}
                  <section className="mb-6 rounded-[24px] border border-[#DEE5E1] bg-white p-6 shadow-[0_12px_30px_rgba(35,65,60,0.05)]">
                    <div className="flex flex-wrap items-center gap-4">
                      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#E6F4F1] font-display text-lg font-extrabold text-[#205A55]">
                        {(account?.full_name || account?.email || "?")
                          .trim()
                          .charAt(0)
                          .toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="font-display text-lg font-extrabold text-[#142D38]">
                          {account?.full_name || "Student"}
                        </p>
                        <p className="truncate text-[12px] text-[#73817E]">
                          {account?.email}
                        </p>
                      </div>
                    </div>

                    <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                      {[
                        ["University", account?.university],
                        ["Field of study", account?.field_of_study],
                        [
                          "Year of study",
                          account?.year_of_study
                            ? `Year ${account.year_of_study}`
                            : null,
                        ],
                        [
                          "Member since",
                          account?.created_at
                            ? new Date(account.created_at).toLocaleDateString(
                                "en-ZA",
                                { day: "2-digit", month: "long", year: "numeric" },
                              )
                            : null,
                        ],
                      ].map(([label, value]) => (
                        <div
                          key={label as string}
                          className="rounded-xl bg-[#F7FAF8] px-4 py-3"
                        >
                          <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#8C9795]">
                            {label}
                          </dt>
                          <dd className="mt-0.5 text-[13px] font-semibold text-[#243B42]">
                            {value || (
                              <span className="font-normal text-[#A1AAA8]">
                                Not set
                              </span>
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>

                  {/* Plan and usage */}
                  <section className="mb-6 rounded-[24px] border border-[#DEE5E1] bg-white p-6 shadow-[0_12px_30px_rgba(35,65,60,0.05)]">
                    <h2 className="font-display text-sm font-extrabold text-[#142D38]">
                      Your plan
                    </h2>
                    <p className="mt-1 text-[12px] text-[#73817E]">
                      {account?.role === "student"
                        ? "Free student plan"
                        : `Account type: ${account?.role ?? "student"}`}
                    </p>

                    {quota ? (
                      <>
                        <div className="mt-4 flex items-end justify-between">
                          <span className="text-[12px] font-semibold text-[#243B42]">
                            AI study guides today
                          </span>
                          <span className="text-[12px] font-extrabold text-[#205A55]">
                            {quota.summaries_used} / {quota.daily_limit} used
                          </span>
                        </div>
                        {/* Progress bar: makes the remaining allowance obvious
                            at a glance rather than a number to interpret. */}
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#EEF3F1]">
                          <div
                            className="h-full rounded-full bg-[#58A99F] transition-all"
                            style={{
                              width: `${Math.min(
                                100,
                                (quota.summaries_used /
                                  Math.max(1, quota.daily_limit)) *
                                  100,
                              )}%`,
                            }}
                          />
                        </div>
                        <p className="mt-2 text-[11px] text-[#73817E]">
                          {quota.remaining_credits > 0
                            ? `${quota.remaining_credits} remaining today. Re-reading a guide you already made is always free.`
                            : "You have used today's allowance. It resets tomorrow."}
                        </p>
                      </>
                    ) : (
                      <p className="mt-3 text-[11px] text-[#8C9795]">
                        Usage information is unavailable right now.
                      </p>
                    )}
                  </section>

                  {/* Actions */}
                  <section className="rounded-[24px] border border-[#DEE5E1] bg-white p-6 shadow-[0_12px_30px_rgba(35,65,60,0.05)]">
                    <h2 className="font-display text-sm font-extrabold text-[#142D38]">
                      Your data
                    </h2>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        onClick={() => void loadAccount()}
                        className="rounded-xl border border-[#D9E2DE] bg-white px-4 py-2.5 text-[11px] font-extrabold text-[#4B6361] transition hover:border-[#9CBEB7]"
                      >
                        Refresh details
                      </button>
                      <button
                        onClick={async () => {
                          // Export the profile the student can already see.
                          // Deliberately client-side: no new endpoint, and the
                          // student gets a file immediately.
                          const rows = [
                            ["Field", "Value"],
                            ["Full name", account?.full_name ?? ""],
                            ["Email", account?.email ?? ""],
                            ["University", account?.university ?? ""],
                            ["Field of study", account?.field_of_study ?? ""],
                            ["Year of study", String(account?.year_of_study ?? "")],
                            ["Plan", "Free student plan"],
                            [
                              "Guides used today",
                              quota
                                ? `${quota.summaries_used} of ${quota.daily_limit}`
                                : "",
                            ],
                          ];
                          const csv = rows
                            .map((r) =>
                              r
                                .map(
                                  (cell) => `"${String(cell).replace(/"/g, '""')}"`,
                                )
                                .join(","),
                            )
                            .join("\n");
                          const url = URL.createObjectURL(
                            new Blob([csv], { type: "text/csv;charset=utf-8" }),
                          );
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "varsity-companion-account.csv";
                          a.click();
                          URL.revokeObjectURL(url);
                          notify("Account details downloaded");
                        }}
                        className="rounded-xl border border-[#D9E2DE] bg-white px-4 py-2.5 text-[11px] font-extrabold text-[#4B6361] transition hover:border-[#9CBEB7]"
                      >
                        Download my details
                      </button>
                      <button
                        onClick={() => {
                          // Real sign-out: clear the token and email we stored
                          // at login, then return to the auth screen.
                          clearToken();
                          localStorage.removeItem("vc.email");
                          window.location.reload();
                        }}
                        className="rounded-xl bg-[#EB765B] px-4 py-2.5 text-[11px] font-extrabold text-white transition hover:bg-[#D9654C]"
                      >
                        Sign out
                      </button>
                    </div>
                    <p className="mt-3 text-[11px] text-[#8C9795]">
                      Signing out removes your saved session from this device.
                    </p>
                  </section>
                </>
              )}
            </div>
          ) : activeNav === "How it works" ? (
            // ---- How it works -------------------------------------------------
            // This sidebar entry used to raise a one-line toast ("Upload a file
            // or paste notes, then press Summarise") and change nothing on
            // screen, so clicking it appeared to do nothing at all. It is now a
            // real page that explains the product end to end — which is also
            // the page a judge is most likely to open first.
            <div>
              <div className="mb-7">
                <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#5B8B82]">
                  Getting started
                </p>
                <h1 className="font-display text-[30px] font-extrabold tracking-[-0.035em] text-[#142D38] sm:text-[36px]">
                  How it works
                </h1>
                <p className="mt-1 max-w-[560px] text-sm text-[#73817E]">
                  Varsity Companion turns your own lecture material into
                  structured study guides, and points you at real resources for
                  your modules.
                </p>
              </div>

              {/* The three input sources, spelled out — this is the part
                  students and judges most often get stuck on. */}
              <section className="mb-6 rounded-[24px] border border-[#DEE5E1] bg-white p-6 shadow-[0_12px_30px_rgba(35,65,60,0.05)]">
                <h2 className="font-display text-base font-extrabold text-[#142D38]">
                  Three ways to give it material
                </h2>
                <p className="mt-1 text-[12px] text-[#73817E]">
                  Use any one on its own, or combine them — a file, some text and
                  a link can all be summarised together in one guide.
                </p>
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  {[
                    {
                      icon: "upload" as IconName,
                      title: "Upload a file",
                      body: "PDF, DOCX, TXT, MD, CSV or JSON up to 20 MB. The text is extracted in your browser — the file itself is never uploaded, so nothing leaves your device.",
                      action: "AI Summaries → Upload file",
                    },
                    {
                      icon: "document" as IconName,
                      title: "Paste text",
                      body: "Copy your notes straight in. Useful for slides, hand-written notes you have typed up, or a short excerpt you want expanded.",
                      action: "AI Summaries → Paste text",
                    },
                    {
                      icon: "search" as IconName,
                      title: "Add a link",
                      body: "Paste a web address and the server reads the page for you, so an online reading or lecture page can be summarised without copying it across.",
                      action: "AI Summaries → Read page",
                    },
                  ].map((card) => (
                    <div
                      key={card.title}
                      className="rounded-2xl bg-[#F7FAF8] p-5"
                    >
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#E6F4F1] text-[#205A55]">
                        <Icon name={card.icon} className="h-[18px] w-[18px]" />
                      </span>
                      <h3 className="mt-3 font-display text-[13px] font-extrabold text-[#142D38]">
                        {card.title}
                      </h3>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-[#5C6D6B]">
                        {card.body}
                      </p>
                      <p className="mt-3 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#8C9795]">
                        {card.action}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              {/* What you get back. */}
              <section className="mb-6 rounded-[24px] border border-[#DEE5E1] bg-white p-6 shadow-[0_12px_30px_rgba(35,65,60,0.05)]">
                <h2 className="font-display text-base font-extrabold text-[#142D38]">
                  What your study guide contains
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    ["Overview", "A short explanation of what the material is really about, before the detail."],
                    ["Sections by concept", "Related ideas grouped under headings instead of one long list."],
                    ["Worked example", "One realistic problem solved step by step."],
                    ["Common mistakes", "The specific errors students make on this topic, and how to avoid them."],
                    ["Quick self-test", "Three questions to check you understood it."],
                    ["One-line takeaway", "The single thing worth remembering."],
                  ].map(([title, body]) => (
                    <div
                      key={title}
                      className="flex gap-3 rounded-xl bg-[#F7FAF8] px-4 py-3"
                    >
                      <span className="mt-0.5 text-[#58A99F]">✓</span>
                      <div>
                        <p className="text-[12px] font-extrabold text-[#243B42]">
                          {title}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-[#6B7B79]">
                          {body}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* The other features. */}
              <section className="mb-6 grid gap-4 md:grid-cols-2">
                {[
                  {
                    title: "Recommendations",
                    body: "Pick a module and get an AI brief on what it covers and where to focus, grounded in real resources for that module.",
                    where: "Recommendations",
                  },
                  {
                    title: "Find materials",
                    body: "Real articles, open-access papers, books and videos for your module, drawn from Wikipedia (CC BY-SA), arXiv and Open Library. Every link is checked before it is shown.",
                    where: "Find Materials",
                  },
                  {
                    title: "Chat with your brief",
                    body: "Upload a brief or assignment, then ask questions about it. Answers cite the passage they came from, so you can check them.",
                    where: "Chat with Brief",
                  },
                  {
                    title: "Study planner",
                    body: "All your deadlines in one place, grouped by how soon they land, with at-risk warnings for heavy weeks.",
                    where: "Study Planner",
                  },
                ].map((f) => (
                  <div
                    key={f.title}
                    className="rounded-[24px] border border-[#DEE5E1] bg-white p-6 shadow-[0_12px_30px_rgba(35,65,60,0.05)]"
                  >
                    <h3 className="font-display text-[14px] font-extrabold text-[#142D38]">
                      {f.title}
                    </h3>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-[#5C6D6B]">
                      {f.body}
                    </p>
                    <button
                      onClick={() => setActiveNav(f.where)}
                      className="mt-4 text-[11px] font-extrabold text-[#EB765B] hover:underline"
                    >
                      Open {f.where} →
                    </button>
                  </div>
                ))}
              </section>

              {/* Honest notes: what it does not do. Better said here than
                  discovered by a judge mid-demo. */}
              <section className="rounded-[24px] border border-[#E7D9C4] bg-[#FFFBF3] p-6">
                <h2 className="font-display text-base font-extrabold text-[#7A5B22]">
                  Good to know
                </h2>
                <ul className="mt-3 space-y-2 text-[12px] leading-relaxed text-[#6E5B36]">
                  <li>
                    <strong>Modules are yours to enter.</strong> Type your own
                    module code and name — nothing is guessed or auto-filled, and
                    any module your university uses will work.
                  </li>
                  <li>
                    <strong>Your guides are grounded in your material.</strong> If
                    your notes do not cover something, the guide says so rather
                    than inventing it.
                  </li>
                  <li>
                    <strong>Reading a guide again is free.</strong> Guides are
                    cached per module and content, so re-opening one does not use
                    another credit.
                  </li>
                  <li>
                    <strong>You control your data.</strong> Files are read in your
                    browser, and you can download your details from the Account
                    page at any time.
                  </li>
                </ul>
              </section>
            </div>
          ) : (
            <>
          <section className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#5B8B82]">
                {todayLabel}
              </p>
              <h1 className="font-display text-[30px] font-extrabold tracking-[-0.035em] text-[#142D38] sm:text-[36px]">
                {greeting}
              </h1>
              <p className="mt-1 text-sm text-[#73817E]">
                Let’s make today’s study session count.
              </p>
            </div>
            {/* Real, honest status: how many deadlines are still open. The
                previous badge claimed "Synced for offline", but no offline
                sync exists in this build. */}
            <button
              onClick={() => setActiveNav("Study Planner")}
              className="flex items-center gap-2 rounded-xl border border-[#D8E1DD] bg-white px-3.5 py-2.5 text-xs font-bold text-[#4B6361] shadow-sm transition hover:border-[#9CBEB7]"
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  openTasks > 0 ? "bg-[#EB765B]" : "bg-[#58A99F]"
                }`}
              />
              {openTasks > 0
                ? `${openTasks} open deadline${openTasks === 1 ? "" : "s"}`
                : "No open deadlines"}
            </button>
          </section>

          <section className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,0.75fr)]">
            <div className="hero-card relative overflow-hidden rounded-[24px] bg-[#173C46] p-6 text-white shadow-[0_20px_45px_rgba(23,60,70,0.12)] sm:p-8">
              <div className="relative z-10 max-w-[570px]">
                <div className="mb-5 flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[#CDE9E3]">
                  <Icon name="sparkles" className="h-3.5 w-3.5" />
                  Course-aware AI
                </div>
                <h2 className="font-display text-[25px] font-extrabold leading-tight tracking-[-0.025em] sm:text-[31px]">
                  Turn complex notes into
                  <br className="hidden sm:block" /> clear study points.
                </h2>
                <p className="mt-3 max-w-[480px] text-[13px] leading-relaxed text-[#C4D5D5]">
                  Upload a lecture, reading or assignment and get a structured
                  summary tailored to your module.
                </p>

                <div className="mt-6 rounded-2xl bg-white p-1.5 text-[#203C42] shadow-xl shadow-black/10">
                  {/* Module context (optional) */}
                  <div className="border-b border-[#E7ECE9] px-3 py-2.5 sm:px-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#7D8C89]">
                        Module
                      </span>
                      <select
                        value={summaryModule}
                        onChange={(event) => setSummaryModule(event.target.value)}
                        className="h-8 flex-1 rounded-lg border border-[#E7ECE9] bg-[#F7FAF8] px-2 text-[11px] outline-none focus:border-[#5CA599]"
                      >
                        <option value="">General (no module)</option>
                        {moduleList.map((m) => (
                          <option key={m.id} value={m.code}>
                            {m.code} — {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* SOURCE 1 — file (independent) */}
                  <div className="border-b border-[#E7ECE9] px-3 py-3 sm:px-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#7D8C89]">
                        Upload file
                      </span>
                      {fileName && (
                        <button
                          type="button"
                          onClick={clearFile}
                          className="text-[10px] font-bold text-[#B9533E] hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => fileInputRef.current?.click()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          fileInputRef.current?.click();
                        }
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        const dropped = event.dataTransfer.files?.[0];
                        if (dropped) {
                          const dt = new DataTransfer();
                          dt.items.add(dropped);
                          if (fileInputRef.current) {
                            fileInputRef.current.files = dt.files;
                            fileInputRef.current.dispatchEvent(
                              new Event("change", { bubbles: true }),
                            );
                          }
                        }
                      }}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#D9E2DE] bg-[#F7FAF8] p-2.5 transition hover:border-[#9CBEB7]"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#FFF0EA] text-[#E27359]">
                        <Icon name="upload" className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[11px] font-extrabold">
                          {filePending
                            ? "Reading file…"
                            : fileName || "Drop a file here or browse"}
                        </span>
                        <span className="mt-0.5 block text-[9px] text-[#899693]">
                          {fileName
                            ? `${fileText.length.toLocaleString()} characters extracted`
                            : "PDF, DOCX, PPTX, TXT, MD, CSV, JSON · Max 20 MB"}
                        </span>
                      </span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx,.pptx,.doc,.txt,.md,.markdown,.csv,.json,.log,.rtf,text/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/msword"
                        onChange={handleFile}
                        className="hidden"
                      />
                    </div>
                  </div>

                  {/* SOURCE 2 — pasted text (independent) */}
                  <div className="px-3 py-3 sm:px-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#7D8C89]">
                        Paste text
                      </span>
                      {pastedText && (
                        <span className="text-[10px] text-[#899693]">
                          {pastedText.length.toLocaleString()} characters
                        </span>
                      )}
                    </div>
                    <textarea
                      aria-label="Paste study notes"
                      value={pastedText}
                      onChange={(event) => setPastedText(event.target.value)}
                      className="h-20 w-full resize-none rounded-xl border border-[#E7ECE9] bg-[#F7FAF8] px-3 py-2 text-xs leading-relaxed outline-none placeholder:text-[#A1AAA8] focus:border-[#5CA599]"
                      placeholder="Paste lecture notes or assignment text here..."
                    />
                  </div>

                  {/* SOURCE 3 — a link (independent). The SERVER reads the
                      page, because a browser cannot fetch cross-origin text. */}
                  <div className="border-t border-[#E7ECE9] px-3 py-3 sm:px-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#7D8C89]">
                        Add link
                      </span>
                      {linkText && (
                        <button
                          type="button"
                          onClick={clearLink}
                          className="text-[10px] font-bold text-[#B9533E] hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        aria-label="Link to a web page to summarise"
                        value={linkUrl}
                        onChange={(event) => setLinkUrl(event.target.value)}
                        onKeyDown={(event) => {
                          // Enter reads the link, matching the button.
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void loadLink();
                          }
                        }}
                        placeholder="https://example.com/lecture-notes"
                        className="h-10 min-w-0 flex-1 rounded-xl border border-[#E7ECE9] bg-[#F7FAF8] px-3 text-xs outline-none placeholder:text-[#A1AAA8] focus:border-[#5CA599]"
                      />
                      <button
                        type="button"
                        onClick={() => void loadLink()}
                        disabled={linkPending || !linkUrl.trim()}
                        className="h-10 shrink-0 rounded-xl bg-[#173C46] px-3 text-[11px] font-extrabold text-white transition hover:bg-[#21515A] disabled:opacity-50"
                      >
                        {linkPending ? "Reading…" : "Read page"}
                      </button>
                    </div>
                    {linkText ? (
                      <p className="mt-1.5 truncate text-[10px] text-[#4E7A70]">
                        ✓ {linkTitle} · {linkText.length.toLocaleString()}{" "}
                        characters read
                      </p>
                    ) : (
                      <p className="mt-1.5 text-[10px] text-[#899693]">
                        Reads a web page so you can summarise it. Press Read
                        page, then Summarise.
                      </p>
                    )}
                  </div>

                  {/* SEND — combines whichever sources are present */}
                  <div className="flex items-center justify-between gap-3 border-t border-[#E7ECE9] px-3 py-3 sm:px-4">
                    <div className="min-w-0">
                      <p className="text-[10px] leading-tight text-[#899693]">
                        {(() => {
                          // Name exactly what will be sent, so the student can
                          // see that a source they added is actually included.
                          const parts = [
                            fileText.trim() && "file",
                            pastedText.trim() && "pasted notes",
                            linkText.trim() && "link",
                          ].filter(Boolean) as string[];
                          if (!parts.length)
                            return "Add a file, paste text, or add a link";
                          if (parts.length === 1) return `Sends your ${parts[0]}`;
                          return `Sends your ${parts.slice(0, -1).join(", ")} and ${
                            parts[parts.length - 1]
                          } together`;
                        })()}
                      </p>
                      {/* Live counter over ALL THREE sources.
                          It previously summed only the file and pasted text,
                          so adding a link alone showed no counter at all, and
                          it quoted the old 50 character minimum. Shows the
                          student's own character count so the requirement is
                          visible BEFORE they press Summarise. */}
                      {(() => {
                        const total =
                          fileText.trim().length +
                          pastedText.trim().length +
                          linkText.trim().length;
                        if (total === 0) return null;
                        const tooShort = total < 20;
                        // Matches the backend ceiling. Long documents are
                        // chunked server-side, so this is a safety bound and
                        // not a "your notes are too long" warning.
                        const tooLong = total > 200_000;
                        return (
                          <p
                            className={`mt-0.5 text-[10px] font-bold ${
                              tooShort || tooLong
                                ? "text-[#E0A24A]"
                                : "text-[#579286]"
                            }`}
                          >
                            {total.toLocaleString()} / 200,000 characters
                            {tooShort
                              ? ` · need ${20 - total} more to summarise`
                              : ""}
                            {tooLong ? " · will be trimmed" : ""}
                          </p>
                        );
                      })()}
                    </div>
                    <button
                      onClick={runSummary}
                      // WHY THIS IS ONLY DISABLED WHILE PENDING:
                      // This used to also disable when the combined input was
                      // under 50 characters. The effect was that the button sat
                      // there greyed out and unclickable with no explanation,
                      // so a student who pasted a short note or chose a small
                      // file concluded that adding content was broken. The 50
                      // character minimum is a BACKEND rule, so it is now
                      // enforced in runSummary() with a message that says
                      // exactly how many characters are still needed.
                      disabled={summaryPending}
                      className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#EB765B] px-4 text-[11px] font-extrabold text-white transition hover:bg-[#D9654C] disabled:opacity-50"
                    >
                      {summaryPending ? "Summarising…" : "Summarise"}
                      <Icon name="arrow" className="h-[16px] w-[16px]" />
                    </button>
                  </div>
                </div>

                {/* Real AI summary output (populated after a successful call). */}
                {summaryPending && (
                  <p className="mt-3 text-[11px] text-[#C4D5D5]">
                    Generating your summary…
                  </p>
                )}
                {summaryError && (
                  <p className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-[11px] font-semibold text-[#FFD9CE]">
                    {summaryError}
                  </p>
                )}
                {summaryResult && (
                  // Taller than before (the guide is now a full document) and
                  // rendered as markdown, so headings, bold terms and maths read
                  // properly instead of showing literal "##", "**" and "$".
                  <div className="mt-3 max-h-[420px] overflow-y-auto rounded-2xl bg-white/95 p-4 text-left shadow-xl shadow-black/10">
                    <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#579286]">
                      AI study guide
                    </p>
                    {renderMarkdown(summaryResult)}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[24px] border border-[#DEE5E1] bg-white p-6 shadow-[0_12px_30px_rgba(35,65,60,0.05)]">
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#7D8C89]">
                    Next up
                  </p>
                  <h3 className="mt-1 font-display text-lg font-extrabold">
                    Your deadlines
                  </h3>
                </div>
                <button
                  onClick={() => setActiveNav("Study Planner")}
                  className="text-[11px] font-bold text-[#41877C]"
                >
                  View planner
                </button>
              </div>
              <div className="space-y-3">
                {taskList.length === 0 ? (
                  <p className="rounded-2xl bg-[#F4F7F5] p-3.5 text-[11px] text-[#7D8886]">
                    No upcoming deadlines. Add a task to get started.
                  </p>
                ) : (
                  taskList
                    .slice()
                    .sort(
                      (a, b) =>
                        new Date(a.due_date).getTime() -
                        new Date(b.due_date).getTime(),
                    )
                    .slice(0, 2)
                    .map((task, index) => {
                      // Derive the friendly date/time bits + "N days" label.
                      const due = new Date(task.due_date);
                      const day = String(due.getDate()).padStart(2, "0");
                      const month = due
                        .toLocaleDateString("en-ZA", { month: "short" })
                        .slice(0, 3);
                      const time = due.toLocaleTimeString("en-ZA", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      });
                      const daysLeft = Math.ceil(
                        (due.getTime() - Date.now()) / 86_400_000,
                      );
                      const daysLabel =
                        daysLeft < 0
                          ? "overdue"
                          : daysLeft === 0
                            ? "today"
                            : `${daysLeft} days`;
                      const mod = moduleList.find((m) => m.id === task.module_id);
                      const hot = index === 0;
                      return (
                        <div
                          key={task.id}
                          className={`flex items-center gap-4 rounded-2xl p-3.5 ${
                            hot ? "bg-[#FFF6F1]" : "bg-[#F4F7F5]"
                          }`}
                        >
                          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-center shadow-sm">
                            <span
                              className={`text-[9px] font-extrabold uppercase ${
                                hot ? "text-[#D46951]" : "text-[#5D7C77]"
                              }`}
                            >
                              {month}
                            </span>
                            <span className="-mt-1 text-base font-extrabold text-[#243B42]">
                              {day}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-extrabold">
                              {task.title}
                            </p>
                            <p className="mt-1 text-[10px] text-[#7D8886]">
                              {mod?.code ?? "Module"} · {time}
                            </p>
                          </div>
                          <span
                            className={`rounded-md px-2 py-1 text-[9px] font-extrabold ${
                              hot
                                ? "bg-[#FADFD6] text-[#B9533E]"
                                : "bg-[#E5EFEC] text-[#49766E]"
                            }`}
                          >
                            {daysLabel}
                          </span>
                        </div>
                      );
                    })
                )}
              </div>
              <button
                onClick={() => {
                  setDeadlineError("");
                  // Default the module picker to the first module if unset.
                  if (!deadlineModule && moduleList[0]) {
                    setDeadlineModule(moduleList[0].id);
                  }
                  setDeadlineOpen(true);
                }}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#C9D7D3] py-2.5 text-[11px] font-bold text-[#62807A] transition hover:bg-[#F1F6F4]"
              >
                <Icon name="plus" className="h-4 w-4" />
                Add deadline
              </button>
            </div>
          </section>


          {/* At-risk panel — real heuristic flags, with the reason for each. */}
          {atRisk && atRisk.counts.total > 0 && (
            <section className="mb-6 rounded-[24px] border border-[#F0D9D1] bg-[#FFF8F5] p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#EB765B] text-white">
                    <Icon name="bell" className="h-[18px] w-[18px]" />
                  </span>
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#B9533E]">
                      Needs attention
                    </p>
                    <h2 className="mt-0.5 font-display text-lg font-extrabold">
                      {atRisk.counts.total} deadline
                      {atRisk.counts.total === 1 ? "" : "s"} at risk
                    </h2>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-extrabold">
                  {atRisk.counts.critical > 0 && (
                    <span className="rounded-md bg-[#FADFD6] px-2 py-1 text-[#B9533E]">
                      {atRisk.counts.critical} critical
                    </span>
                  )}
                  {atRisk.counts.high > 0 && (
                    <span className="rounded-md bg-[#FCEFD9] px-2 py-1 text-[#9A6B22]">
                      {atRisk.counts.high} high
                    </span>
                  )}
                  {atRisk.counts.medium > 0 && (
                    <span className="rounded-md bg-[#E5EFEC] px-2 py-1 text-[#49766E]">
                      {atRisk.counts.medium} medium
                    </span>
                  )}
                </div>
              </div>

              {/* Workload signals (heavy week, clustering, no progress). */}
              {atRisk.signals.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {atRisk.signals.map((s) => (
                    <span
                      key={s.kind + s.message}
                      className="rounded-full bg-white px-3 py-1.5 text-[10px] font-bold text-[#7A6257] shadow-sm"
                    >
                      {s.message}
                    </span>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                {atRisk.tasks.slice(0, 4).map((t) => {
                  const tone =
                    t.level === "CRITICAL"
                      ? { bg: "#FADFD6", fg: "#B9533E" }
                      : t.level === "HIGH"
                        ? { bg: "#FCEFD9", fg: "#9A6B22" }
                        : { bg: "#E5EFEC", fg: "#49766E" };
                  const when =
                    t.days_until_due < 0
                      ? `${Math.abs(t.days_until_due)}d overdue`
                      : t.days_until_due === 0
                        ? "today"
                        : `in ${t.days_until_due}d`;
                  return (
                    <div
                      key={t.task_id}
                      className="flex items-center gap-3 rounded-xl bg-white px-3.5 py-3"
                    >
                      <span
                        className="shrink-0 rounded-md px-2 py-1 text-[9px] font-extrabold"
                        style={{ backgroundColor: tone.bg, color: tone.fg }}
                      >
                        {t.level}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-extrabold">
                          {t.title}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-[#8C7A72]">
                          {t.module_code ? `${t.module_code} · ` : ""}
                          {t.reason}
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] font-bold text-[#9A8378]">
                        {when}
                      </span>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => setActiveNav("Study Planner")}
                className="mt-4 text-[11px] font-bold text-[#B9533E]"
              >
                Open planner →
              </button>
            </section>
          )}
          <section className="mb-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#7D8C89]">
                  Personalised for you
                </p>
                <h2 className="mt-1 font-display text-xl font-extrabold">Your modules</h2>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setActiveNav("Recommendations")}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-[#41877C]"
                >
                  <Icon name="sparkles" className="h-3.5 w-3.5" />
                  AI recommendations
                </button>
                <button
                  onClick={() => {
                    // Reuse the deadline modal's module creation flow.
                    setModuleError("");
                    setShowAddModule(true);
                    setDeadlineOpen(true);
                  }}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-[#41877C]"
                >
                  Manage modules
                  <Icon name="chevron" className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {moduleList.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-dashed border-[#C9D7D3] bg-white p-6 text-center">
                  <p className="text-sm font-extrabold text-[#243B42]">
                    No modules yet
                  </p>
                  <p className="mt-1 text-[11px] text-[#7D8886]">
                    Add a module to organise your summaries and deadlines.
                  </p>
                </div>
              ) : (
                moduleList.slice(0, 3).map((module, index) => {
                  const palette = moduleColors[index % moduleColors.length];
                  return (
                    <button
                      key={module.id}
                      // Clicking a module opens its materials (a real action
                      // rather than a no-op toast).
                      onClick={() => {
                        setMatModule(module.code);
                        setMatQuery("");
                        setMatType("");
                        setActiveNav("Find Materials");
                      }}
                      className="module-card group overflow-hidden rounded-2xl border border-[#DEE5E1] bg-white p-5 text-left shadow-[0_8px_25px_rgba(35,65,60,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(35,65,60,0.08)]"
                      style={{ "--module-color": palette.color } as CSSProperties}
                    >
                      <div className="flex items-start justify-between">
                        <span
                          className="rounded-lg px-2.5 py-1.5 text-[10px] font-extrabold tracking-[0.08em]"
                          style={{ backgroundColor: palette.pale, color: palette.color }}
                        >
                          {module.code}
                        </span>
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#F4F6F4] text-[#7B8986] transition group-hover:bg-[#173C46] group-hover:text-white">
                          <Icon name="arrow" className="h-3.5 w-3.5" />
                        </span>
                      </div>
                      <h3 className="mt-5 text-sm font-extrabold">{module.name}</h3>
                      {/* Real stats: material count (fetched per module) and
                          task completion for THIS module. */}
                      {(() => {
                        const mats = moduleMaterialCounts[module.code];
                        const mine = taskList.filter(
                          (t) => t.module_id === module.id,
                        );
                        const done = mine.filter((t) => t.is_completed).length;
                        const pct =
                          mine.length > 0
                            ? Math.round((done / mine.length) * 100)
                            : 0;
                        return (
                          <>
                            <div className="mt-2 flex items-center justify-between text-[10px] text-[#84908D]">
                              <span>
                                {mats === undefined
                                  ? "—"
                                  : `${mats} material${mats === 1 ? "" : "s"}`}
                              </span>
                              <span>
                                {mine.length > 0
                                  ? `${done}/${mine.length} tasks done`
                                  : "No tasks yet"}
                              </span>
                            </div>
                            <div className="mt-4 h-1 overflow-hidden rounded-full bg-[#EEF1EF]">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  backgroundColor: palette.color,
                                  width: `${pct}%`,
                                }}
                              />
                            </div>
                          </>
                        );
                      })()}
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
            <div className="rounded-[22px] border border-[#DEE5E1] bg-white p-5 shadow-[0_8px_25px_rgba(35,65,60,0.04)] sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#7D8C89]">
                    Pick up where you left off
                  </p>
                  <h2 className="mt-1 font-display text-lg font-extrabold">Recent activity</h2>
                </div>
              </div>
              <div className="divide-y divide-[#E7ECE9]">
                {activity.length === 0 ? (
                  <p className="py-4 text-[11px] text-[#7D8886]">
                    No activity yet — generate a summary or search for materials
                    and it will show up here.
                  </p>
                ) : (
                  activity.slice(0, 5).map((item) => {
                    // Map a real usage event to its display label + icon.
                    const meta = {
                      SUMMARY_GENERATED: {
                        title: "AI summary generated",
                        icon: "sparkles" as IconName,
                        bg: "#FFF0EA",
                        color: "#D96850",
                      },
                      SUMMARY_CACHE_HIT: {
                        title: "Summary opened (cached)",
                        icon: "document" as IconName,
                        bg: "#E6F4F1",
                        color: "#468F85",
                      },
                      MATERIALS_SEARCHED: {
                        title: "Materials searched",
                        icon: "search" as IconName,
                        bg: "#FFF6DF",
                        color: "#B98532",
                      },
                      SYNC_PUSHED: {
                        title: "Changes synced",
                        icon: "arrow" as IconName,
                        bg: "#E6F4F1",
                        color: "#468F85",
                      },
                      DASHBOARD_VIEWED: {
                        title: "Dashboard viewed",
                        icon: "home" as IconName,
                        bg: "#EEF1EF",
                        color: "#5D7C77",
                      },
                      MODULE_SHARE: {
                        title: "Module shared",
                        icon: "arrow" as IconName,
                        bg: "#FFF0EA",
                        color: "#D96850",
                      },
                    }[item.event_type] ?? {
                      title: item.event_type.replace(/_/g, " ").toLowerCase(),
                      icon: "document" as IconName,
                      bg: "#EEF1EF",
                      color: "#5D7C77",
                    };

                    // Human-friendly relative time from the real timestamp.
                    const when = item.created_at
                      ? (() => {
                          const secs = Math.max(
                            0,
                            (Date.now() - new Date(item.created_at).getTime()) /
                              1000,
                          );
                          if (secs < 60) return "just now";
                          const mins = Math.floor(secs / 60);
                          if (mins < 60) return `${mins} min ago`;
                          const hrs = Math.floor(mins / 60);
                          if (hrs < 24) return `${hrs}h ago`;
                          const days = Math.floor(hrs / 24);
                          return days === 1 ? "Yesterday" : `${days} days ago`;
                        })()
                      : "";

                    return (
                      <div
                        key={item.id}
                        className="flex w-full items-center gap-3.5 py-3.5 first:pt-0 last:pb-0"
                      >
                        <span
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                          style={{ backgroundColor: meta.bg, color: meta.color }}
                        >
                          <Icon name={meta.icon} className="h-[18px] w-[18px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-extrabold">
                            {meta.title}
                          </span>
                          <span className="mt-1 block text-[10px] text-[#83908D]">
                            {item.module_code ? `Module ${item.module_code}` : "—"}
                          </span>
                        </span>
                        <span className="hidden items-center gap-1 text-[10px] text-[#8C9795] sm:flex">
                          <Icon name="clock" className="h-3.5 w-3.5" />
                          {when}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[22px] bg-[#E7F2EF] p-6">
              <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full border-[20px] border-white/30" />
              <div className="relative">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#58A99F] text-white shadow-md shadow-[#58A99F]/20">
                  <Icon name="search" className="h-[19px] w-[19px]" />
                </span>
                <p className="mt-7 text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#548078]">
                  Discover better sources
                </p>
                <h2 className="mt-2 font-display text-xl font-extrabold leading-snug">
                  Find materials made
                  <br /> for your modules.
                </h2>
                <p className="mt-3 text-[11px] leading-relaxed text-[#657C78]">
                  Search ranked videos, open journals and trusted resources in one place.
                </p>
                <button
                  onClick={() => setActiveNav("Find Materials")}
                  className="mt-6 flex items-center gap-2 rounded-xl bg-[#173C46] px-4 py-3 text-[11px] font-bold text-white transition hover:bg-[#21505A]"
                >
                  Search materials
                  <Icon name="arrow" className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
