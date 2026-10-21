/**
 * components/MaterialsTab.tsx
 *
 * Find Materials: search the curated library for the student's own modules.
 *
 * WHY THE SEARCH IS EXPLICIT: an earlier version auto-searched on every
 * keystroke, so a half-typed query returned nothing and the screen settled on
 * "No materials found" - which read as the feature being broken. Search now
 * runs when the student asks for it, and browsing a module shows everything.
 */
/**
 * ⚠️ KNOWN DIVERGENCE — state components not yet adopted.
 *
 * `SummariesTab` and `PlannerTab` now render their loading / error / empty states through
 * `components/states/*`, so a student meets one vocabulary on those screens. This file still
 * handles them inline. That is deliberate, not an oversight: adopting a shared component into
 * working code is a consistency change, and it was scoped to the two screens a student uses
 * on a deadline, so that a cosmetic gain never risked two more screens at once.
 *
 * Recorded here because a documented divergence is a decision and an undocumented one is just
 * an inconsistency. See `conversation/scope_thread_b_part2_delta.md` §2.5.
 */

import { useEffect, useState } from "react";
import { ingestModuleResources } from "../lib/api";

import { Icon } from "./Icon";
import { searchMaterials, type MaterialPage, type StudyMaterial } from "../lib/api";
import { describeError } from "../lib/session";

type ModuleRow = { id: string; code: string; name: string };

/** Icon per resource type, so a result is scannable at a glance. */
const TYPE_ICON: Record<string, "play" | "book" | "document" | "search"> = {
  YOUTUBE: "play",
  JOURNAL: "book",
  PDF: "document",
  ARTICLE: "document",
};

// The filter chips. YouTube is deliberately absent: videos are excluded by default at
// the API, so offering a chip that can only ever return nothing would be a dead control.
//
// The YOUTUBE entry in TYPE_ICON below is deliberately KEPT. Only this list changed, so
// flipping the backend default back on later needs no frontend edit - and any video row
// that does arrive still renders with its own icon rather than a fallback.
const TYPES = ["", "JOURNAL", "PDF", "ARTICLE"] as const;

function MaterialsTab({ notify, moduleList }: { notify: (msg: string) => void; moduleList: ModuleRow[] }) {
  const [moduleCode, setModuleCode] = useState("");
  const [query, setQuery] = useState("");
  const [resourceType, setResourceType] = useState<string>("");
  const [page, setPage] = useState<MaterialPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  // On-demand resource fetch. Separate from `loading` because the two mean
  // different things to a student: searching is instant, fetching real resources
  // takes seconds and hits four external services.
  const [fetching, setFetching] = useState(false);
  const [fetchNote, setFetchNote] = useState("");

  // Default to the first module once the list is known.
  useEffect(() => {
    if (!moduleCode && moduleList.length > 0) setModuleCode(moduleList[0].code);
  }, [moduleList, moduleCode]);

  const run = async (opts?: { q?: string }) => {
    const code = (moduleCode || moduleList[0]?.code || "").trim();
    if (code.length < 2) {
      setError("Pick a module first.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await searchMaterials({
        moduleCode: code,
        q: opts?.q ?? query,
        resourceType: resourceType || undefined,
        size: 20,
        // The student's own module title, used by the backend only as a small
        // relevance nudge - never as a filter. Resolved from the selected module so it
        // stays correct when the dropdown changes.
        moduleName: moduleList.find((m) => m.code === code)?.name,
      });
      setPage(result);
      setSearched(true);
    } catch (err) {
      setError(describeError(err));
      setPage(null);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fetch real resources for the selected module, then search again.
   *
   * WHY THIS BUTTON HAS TO EXIST
   * ---------------------------
   * The catalog is not seeded - nothing populates study_materials automatically -
   * so before this existed, "Find materials" searched a table that was always
   * empty. The ingest service was written and tested, but nothing ever called it.
   *
   * It is per-module and on demand rather than a scheduled bulk job, for three
   * reasons: it needs no new infrastructure, it keeps the outbound requests
   * proportional to what students actually use, and the backend rate-limits
   * concurrent fetches for the same module so the upstream APIs are not hammered.
   *
   * The backend builds every outbound URL itself from an allow-list, so this sends
   * only a module code - a student cannot make the server fetch an arbitrary host.
   */
  const fetchResources = async () => {
    const code = (moduleCode || moduleList[0]?.code || "").trim();
    if (code.length < 2) {
      setError("Pick a module first.");
      return;
    }

    setFetching(true);
    setError("");
    setFetchNote("");
    try {
      const result = await ingestModuleResources(code);

      // The backend reports what it did, and the distinction matters to a student:
      // "found 4 new" and "already up to date" are both success, but only one is
      // worth waiting for again. A bare "Done" would hide that.
      if (result.skipped) {
        setFetchNote(result.message || "A fetch for this module is already running.");
      } else if (result.inserted + result.updated === 0) {
        setFetchNote(
          `No new resources found for ${code}. ${
            result.topics?.length
              ? `Searched: ${result.topics.slice(0, 3).join(", ")}.`
              : ""
          }`,
        );
      } else {
        setFetchNote(
          `Added ${result.inserted} new and refreshed ${result.updated} for ${code}.`,
        );
      }

      // Re-run the search so the new rows appear without a manual reload.
      await run({ q: query });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setFetching(false);
    }
  };

  // Load the module's materials when the module or type filter changes. Query
  // text is NOT a dependency: including it made this fire on every keystroke.
  useEffect(() => {
    if (moduleCode) void run({ q: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleCode, resourceType]);

  const items: StudyMaterial[] = page?.items ?? [];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
          Materials
        </p>
        <h2 className="mt-1 font-display text-lg font-extrabold">Find materials</h2>
      </div>

      {moduleList.length === 0 ? (
        <p className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center text-xs text-[var(--color-fg-muted)]">
          Add a module first — materials are organised per module, so there is
          nothing to search until you have one.
        </p>
      ) : (
        <>
          <div className="space-y-3 rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <select
              value={moduleCode}
              onChange={(e) => setModuleCode(e.target.value)}
              className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs font-semibold text-[var(--color-fg)] outline-none"
            >
              {moduleList.map((m) => (
                <option key={m.id} value={m.code}>
                  {m.code} — {m.name}
                </option>
              ))}
            </select>

            {/* The button that actually fills the catalog. Placed immediately under
                the module selector because it acts on the selected module, and a
                student should not have to hunt for it.

                HONEST TIMING (measured 2026-10-21 against production): a fetch took
                62 seconds and returned 8 resources. The old label said "a few
                seconds", so a student who waited 20s and saw nothing moving concluded
                it was broken and went back to pasting files by hand - which is
                user 11's complaint. Telling them the real range is the difference
                between waiting and giving up. */}
            <button
              onClick={() => void fetchResources()}
              disabled={fetching}
              className="w-full rounded-xl border border-[var(--color-teal)] px-4 py-2.5 text-[11px] font-extrabold text-[var(--color-teal)] transition disabled:opacity-50"
            >
              {fetching
                ? "Searching arXiv, Wikipedia and Open Library… up to a minute"
                : "Find resources for this module"}
            </button>

            {fetchNote && (
              <p className="rounded-xl bg-[var(--color-raised)] px-3 py-2 text-[11px] text-[var(--color-fg-muted)]">
                {fetchNote}
              </p>
            )}

            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void run();
                  }
                }}
                placeholder="Search this module, e.g. recursion"
                className="h-11 min-w-0 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs text-[var(--color-fg)] outline-none placeholder:text-[var(--color-fg-muted)]"
              />
              <button
                onClick={() => void run()}
                disabled={loading}
                className="shrink-0 rounded-xl bg-[var(--color-accent)] px-4 text-[11px] font-extrabold text-[var(--color-fg-on-accent)] disabled:opacity-50"
              >
                {loading ? "..." : "Search"}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <button
                  key={t || "all"}
                  onClick={() => setResourceType(t)}
                  className={`rounded-full px-3 py-1.5 text-[10px] font-extrabold transition ${
                    resourceType === t
                      ? "bg-[var(--color-teal)] text-[var(--color-bg)]"
                      : "border border-[var(--color-border)] text-[var(--color-fg-muted)]"
                  }`}
                >
                  {t || "All"}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-2xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-4 py-3 text-[12px] text-[var(--color-danger)]"
            >
              {error}
            </p>
          )}

          {searched && !loading && (
            <p className="text-[11px] text-[var(--color-fg-subtle)]">
              {page?.total ?? 0} result{(page?.total ?? 0) === 1 ? "" : "s"}
            </p>
          )}

          <div className="space-y-3">
            {items.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => notify(`Opening ${item.title}`)}
                className="flex items-start gap-3.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition active:-translate-y-0.5"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-module-b-pale)] text-[var(--color-teal)]">
                  <Icon name={TYPE_ICON[item.resource_type] ?? "document"} className="h-[17px] w-[17px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-extrabold">{item.title}</span>
                  <span className="mt-0.5 block text-[10px] text-[var(--color-fg-subtle)]">
                    {item.resource_type} · {item.module_code}
                  </span>
                  {item.description && (
                    <span className="mt-1 block text-[10px] leading-relaxed text-[var(--color-fg-muted)]">
                      {item.description}
                    </span>
                  )}
                </span>
                <Icon name="arrow" className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--color-fg-subtle)]" />
              </a>
            ))}
          </div>

          {/* THREE EMPTY STATES, because "nothing here" has three different causes and
              only one of them is the student's fault.

              An earlier version showed two, and both said "Nothing matched that search"
              - which was wrong for the case where no search had been made. A student
              browsing a module with an empty catalog was told their search failed, when
              they had not searched; the honest message is that the module has nothing
              yet and that fetching is what fills it. */}
          {searched && !loading && items.length === 0 && (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
              {query.trim() ? (
                /* (1) A SEARCH WAS MADE AND MISSED. The student's own query is the
                   likely cause, so offer the way back to the full module list. */
                <>
                  <p className="text-xs text-[var(--color-fg-muted)]">
                    No materials match “{query.trim()}” in this module.
                  </p>
                  <button
                    onClick={() => {
                      setQuery("");
                      void run({ q: "" });
                    }}
                    className="mt-3 text-[11px] font-bold text-[var(--color-success)] underline"
                  >
                    Show everything for this module
                  </button>
                </>
              ) : resourceType ? (
                /* (2) A TYPE FILTER IS ACTIVE. Easy to forget it is on, and the fix is
                   one tap rather than a re-fetch, so name the filter explicitly. */
                <>
                  <p className="text-xs text-[var(--color-fg-muted)]">
                    No {resourceType.toLowerCase()} resources in this module yet.
                  </p>
                  <button
                    onClick={() => setResourceType("")}
                    className="mt-3 text-[11px] font-bold text-[var(--color-success)] underline"
                  >
                    Show all types
                  </button>
                </>
              ) : (
                /* (3) THE CATALOG IS EMPTY. Nothing is wrong with the student's input;
                   the module simply has no resources stored yet, and fetching is the
                   action that changes that. This is also where a student who has never
                   fetched anything discovers that fetching exists.

                   REWORDED 2026-10-21 (user 11). "No materials for this module yet."
                   states a fact and leaves the student to work out what to do, which is
                   how they ended up pasting files by hand. Say what the button does and
                   how long it takes, in the student's terms. */
                <>
                  <p className="text-xs font-bold text-[var(--color-fg)]">
                    Nothing here for {moduleCode || "this module"} yet
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-fg-muted)]">
                    You do not need to upload anything. This searches open sources —
                    arXiv preprints, Wikipedia and Open Library — and adds what it finds
                    to this module. Takes up to a minute.
                  </p>
                  <button
                    onClick={() => void fetchResources()}
                    disabled={fetching}
                    className="mt-3 text-[11px] font-bold text-[var(--color-teal)] underline disabled:opacity-50"
                  >
                    {fetching
                      ? "Finding resources…"
                      : "Find resources for this module"}
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default MaterialsTab;
