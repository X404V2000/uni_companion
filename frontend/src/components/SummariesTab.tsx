/**
 * components/SummariesTab.tsx
 *
 * The AI summary workspace.
 *
 * WHY THIS EXISTS: the summary card was buried inside the Overview tab, while
 * the "AI Summaries" tab showed a placeholder. Tapping the obvious tab gave
 * nothing, which read as "the feature is broken" even though the endpoint
 * worked. The card now lives on the tab that names it.
 */
import { useRef, useState } from "react";

import { Icon } from "./Icon";
import MicButton from "./MicButton";
import { useSpeech } from "../lib/useSpeech";
import { summarize } from "../lib/api";
import { extractTextFromFile, UnsupportedFileError } from "../lib/fileText";
import { renderMarkdown } from "../lib/markdown";
import { describeError } from "../lib/session";
import { ErrorState } from "./states";

type ModuleRow = { id: string; code: string; name: string };

function SummariesTab({
  notify,
  moduleList,
}: {
  notify: (msg: string) => void;
  moduleList: ModuleRow[];
}) {
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  /**
   * Dictation for the paste box.
   *
   * Final phrases are APPENDED to whatever is already there, so speaking twice
   * adds to the notes instead of replacing the first sentence. The student can
   * always edit the result before summarising - recognition makes mistakes on
   * names and technical terms, and a misheard word must not be summarised as
   * fact.
   */
  const speech = useSpeech({
    onFinal: (text) =>
      setPasted((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text)),
  });

  const [pasted, setPasted] = useState("");
  const [fileText, setFileText] = useState("");
  const [fileName, setFileName] = useState("");
  const [moduleCode, setModuleCode] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [reading, setReading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Read a chosen file.
   *
   * Extraction happens in the browser because /ai/summarize accepts text only.
   * pdfjs and mammoth are imported lazily inside extractTextFromFile, so the
   * ~1 MB PDF parser is not downloaded unless a PDF is actually chosen.
   */
  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setReading(true);
    setError("");
    try {
      const text = await extractTextFromFile(file);
      setFileText(text);
      setFileName(file.name);
      notify(`Read ${text.length.toLocaleString()} characters from ${file.name}`);
    } catch (err) {
      setFileText("");
      setFileName("");
      // UnsupportedFileError carries a message written for the student. Anything
      // else is unexpected, and the old fallback - "Could not read that file." -
      // was actively harmful: it was identical for a password-protected PDF, a
      // corrupt DOCX and a mislabelled .doc, so a student could not tell what to
      // do and neither could we when they reported it.
      //
      // So the fallback now NAMES THE FILE AND THE ERROR TYPE. A student can act
      // on "report.pdf (InvalidPDFException)"; a tester can paste it verbatim; and
      // we can diagnose without asking them to reproduce it.
      if (err instanceof UnsupportedFileError) {
        setError(err.message);
      } else {
        const kind = (err as { name?: string })?.name ?? "Unknown error";
        const detail = (err as { message?: string })?.message ?? "";
        setError(
          `Could not read “${file.name}” (${kind}). ` +
            (detail ? `${detail.slice(0, 120)} — ` : "") +
            "Try a different file, or paste the text instead.",
        );
        // Also to the console, because the on-screen message is truncated and a
        // developer with devtools open should get the whole thing.
        console.error("[summaries] file read failed", { name: file.name, size: file.size, type: file.type }, err);
      }
    } finally {
      setReading(false);
      // Reset so choosing the same file again still fires onChange.
      event.target.value = "";
    }
  };

  /** Combine whichever sources are present and send them. */
  const run = async () => {
    const filePart = fileText.trim();
    const pastePart = pasted.trim();
    if (!filePart && !pastePart) {
      setError("Add a file or paste some text first.");
      return;
    }

    const sections: string[] = [];
    if (filePart) sections.push(`[From file: ${fileName || "document"}]\n${filePart}`);
    if (pastePart) sections.push(`[Pasted notes]\n${pastePart}`);

    setPending(true);
    setError("");
    setSummary("");
    try {
      const code = moduleCode || moduleList[0]?.code || "GENERAL";
      const result = await summarize(code, sections.join("\n\n---\n\n"));
      setSummary(result.summary);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  };

  const clearAll = () => {
    setPasted("");
    setFileText("");
    setFileName("");
    setSummary("");
    setError("");
  };

  return (
    <div className="space-y-4">
      <div className="hero-card relative overflow-hidden rounded-[22px] bg-[var(--color-surface)] p-5 text-white shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
        <div className="relative z-10">
          <div className="mb-4 flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-module-b-pale)]">
            <Icon name="sparkles" className="h-3 w-3" />
            AI summary
          </div>

          <h2 className="font-display text-lg font-extrabold">Summarise your notes</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-fg-muted)]">
            Upload a lecture or reading, paste text, or both.
          </p>

          <div className="mt-5 rounded-2xl bg-[var(--color-raised)] p-1.5">
            <div className="flex gap-1 border-b border-[var(--color-border)] p-1">
              <button
                onClick={() => setMode("upload")}
                className={`rounded-lg px-3 py-2 text-[11px] font-bold transition ${
                  mode === "upload"
                    ? "bg-[var(--color-surface)] text-[var(--color-success)]"
                    : "text-[var(--color-fg-subtle)]"
                }`}
              >
                Upload file
              </button>
              <button
                onClick={() => setMode("paste")}
                className={`rounded-lg px-3 py-2 text-[11px] font-bold transition ${
                  mode === "paste"
                    ? "bg-[var(--color-surface)] text-[var(--color-success)]"
                    : "text-[var(--color-fg-subtle)]"
                }`}
              >
                Paste text
              </button>
            </div>

            <div className="flex min-h-[80px] items-start justify-between gap-3 px-3 py-3">
              {/* Only in paste mode: dictation fills the text box, and in upload
                  mode there is no box to fill. */}
              {mode === "paste" && (
                <MicButton
                  isSupported={speech.isSupported}
                  state={speech.state}
                  interim={speech.interim}
                  error={speech.error}
                  onToggle={speech.toggle}
                  label="Dictate"
                />
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.markdown,.csv,.json,.log,.pdf,.docx,.pptx"
                className="hidden"
                onChange={handleFile}
              />
              {mode === "upload" ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-module-a-pale)] text-[var(--color-accent)]">
                    <Icon name="upload" className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-extrabold">
                      {reading ? "Reading..." : fileName || "Drop a file or browse"}
                    </span>
                    <span className="mt-1 block truncate text-[10px] text-[var(--color-fg-subtle)]">
                      {fileName
                        ? `${fileText.length.toLocaleString()} characters read`
                        : "PDF, DOCX, PPTX or TXT"}
                    </span>
                  </span>
                </button>
              ) : (
                <textarea
                  aria-label="Paste study notes"
                  value={pasted}
                  onChange={(event) => setPasted(event.target.value)}
                  className="h-16 flex-1 resize-none bg-transparent px-1 py-1 text-xs leading-relaxed text-[var(--color-fg)] outline-none placeholder:text-[var(--color-fg-muted)]"
                  placeholder="Paste lecture notes or assignment text here..."
                />
              )}
              <button
                onClick={run}
                disabled={pending || reading}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-accent)] text-[var(--color-fg-on-accent)] transition active:scale-95 disabled:opacity-50"
                aria-label="Generate summary"
                title="Generate summary"
              >
                <Icon name="arrow" className="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>

          {moduleList.length > 0 && (
            <label className="mt-3 block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-fg-subtle)]">
                Module
              </span>
              <select
                value={moduleCode}
                onChange={(event) => setModuleCode(event.target.value)}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-raised)] px-3 py-2 text-xs font-semibold text-[var(--color-fg)] outline-none"
              >
                <option value="">General (no module)</option>
                {moduleList.map((m) => (
                  <option key={m.id} value={m.code}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {(fileText || pasted) && (
            <button
              onClick={clearAll}
              className="mt-3 text-[11px] font-bold text-[var(--color-fg-muted)] underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {error && <ErrorState message={error} />}

      {/* DELIBERATELY NOT LoadingSkeleton.
          A skeleton means "content is arriving and it will be roughly this shape". This is
          a wait on a generation step with no known duration, so a skeleton would promise
          something it cannot deliver and then sit there animating past the point where the
          student expects it to resolve. A sentence that names the wait is the honest form.
          role="status" so it is announced once, politely, rather than interrupting. */}
      {pending && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-[12px] text-[var(--color-fg-muted)]"
        >
          Generating your summary. This can take a few seconds.
        </p>
      )}

      {summary && !pending && (
        <div className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
            Summary
          </p>
          {/* RENDERED, NOT RAW.
              This was a <pre> with whitespace-pre-wrap, chosen when the summary was plain
              text. The prompt now asks for a structured study guide with headings, bullets
              and bold terms, so a <pre> showed the students the markup itself - literal
              "##" and "**" in the middle of their notes. renderMarkdown handles exactly the
              subset our own prompt emits, adds no dependency, and was written for this
              screen. It also humanises LaTeX, so a formula comes out as text rather than
              as backslash commands. */}
          <div className="mt-3 text-[12px] leading-relaxed text-[var(--color-fg)]">
            {renderMarkdown(summary)}
          </div>
        </div>
      )}
    </div>
  );
}

export default SummariesTab;
