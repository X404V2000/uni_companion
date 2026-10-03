/**
 * src/lib/__tests__/seam.test.ts — screens must read through queries.ts, not api.ts.
 *
 * WHY THIS EXISTS
 * ---------------
 * `design_note_offline_sync.md` §2 makes the case: whether offline sync (Mobile V2)
 * is a swap or a rewrite depends entirely on every screen reading through
 * `queries.ts`. If screens call `api.ts` directly, there is no single place to put
 * a local SQLite read path, and V2 becomes a rewrite of every screen.
 *
 * The architectural engineer asked for this guard and wrote: "It is still true
 * today only by discipline." That turned out to be optimistic - when I checked,
 * `app/(tabs)/settings.tsx` ALREADY imported `getMe` from api.ts directly, and had
 * an inline useQuery calling it. The erosion had started and nothing noticed.
 *
 * WHY A SOURCE TEST RATHER THAN A RUNTIME ONE
 * -------------------------------------------
 * The property is structural: "this file does not import that module". There is no
 * behaviour to observe - a screen that imports api.ts still works, it just makes
 * the future rewrite more expensive. So the check reads the source, which is the
 * only place the defect is visible.
 *
 * The honest limitation, stated so nobody mistakes this for more than it is: it
 * catches a direct import only. A screen reaching api.ts through a re-export, or
 * through `queries.ts` legitimately, is not distinguishable here. That is fine -
 * it holds the line at the cheapest point.
 */
import fs from "fs";
import path from "path";

/** Directories containing screens. Everything here must use queries.ts. */
const SCREEN_DIRS = ["app/(tabs)", "app/(auth)", "app"];

/** Files that ARE the seam, or are not screens, and may import api.ts. */
const EXEMPT = [
  "src/lib/api.ts",
  "src/lib/queries.ts",
  "src/lib/session.tsx",
  "src/lib/consent.ts",
];

/** Collect every .tsx/.ts file under the screen directories, recursively. */
function screenFiles(): string[] {
  const root = path.join(__dirname, "..", "..", "..");
  const found: string[] = [];

  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        const rel = path.relative(root, full).split(path.sep).join("/");
        if (!EXEMPT.some((e) => rel.endsWith(e))) found.push(rel);
      }
    }
  };

  for (const d of SCREEN_DIRS) walk(path.join(root, d));
  return [...new Set(found)];
}

describe("the queries.ts seam", () => {
  it("finds the screen files it is meant to be checking", () => {
    // A guard that silently checks nothing is worse than no guard. If a future
    // refactor moves the screens, this fails loudly instead of passing vacuously.
    const files = screenFiles();
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((f) => f.includes("settings"))).toBe(true);
    expect(files.some((f) => f.includes("planner"))).toBe(true);
  });

  it("no screen imports api.ts directly", () => {
    const root = path.join(__dirname, "..", "..", "..");
    const offenders: string[] = [];

    for (const rel of screenFiles()) {
      const src = fs.readFileSync(path.join(root, rel), "utf8");
      // Match `from ".../api"` and `from "./api"` but not `from "./apiClient"`.
      if (/from\s+["'][^"']*\/api["']/.test(src) || /from\s+["']\.\/api["']/.test(src)) {
        offenders.push(rel);
      }
    }

    // Report every offender, not just the first, so one fix does not reveal
    // another in a later run.
    expect(offenders).toEqual([]);
  });

  it("screens import their reads from queries.ts", () => {
    // The positive half: the seam is only real if screens use it.
    const root = path.join(__dirname, "..", "..", "..");
    const screens = screenFiles().filter((f) => f.startsWith("app/"));
    const usingQueries = screens.filter((rel) =>
      fs.readFileSync(path.join(root, rel), "utf8").includes("lib/queries"),
    );
    expect(usingQueries.length).toBeGreaterThan(0);
  });
});
