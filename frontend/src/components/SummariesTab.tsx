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
import { summarize } from "../lib/api";
import { extractTextFromFile, UnsupportedFileError } from "../lib/fileText";
import { describeError } from "../lib/session";

type ModuleRow = { id: string; code: string; name: string };

function SummariesTab({
  notify,
  moduleList,
}: {
  notify: (msg: string) => void;
  moduleList: ModuleRow[];
}) {
  const [mode, setMode] = useState<"upload" | "paste">("upload");
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
      // UnsupportedFileError carries a message written for the student ("PDF
      // and Word files..." style); anything else is unexpected and generic.
      setError(
        err instanceof UnsupportedFileError ? err.message : "Could not read that file.",
      );
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

            <div className="flex min-h-[80px] items-center justify-between gap-4 px-3 py-3">
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

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-4 py-3 text-[12px] leading-relaxed text-[var(--color-danger)]"
        >
          {error}
        </p>
      )}

      {pending && (
        <p className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-[12px] text-[var(--color-fg-muted)]">
          Generating your summary. This can take a few seconds.
        </p>
      )}

      {summary && !pending && (
        <div className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-fg-subtle)]">
            Summary
          </p>
          {/* whitespace-pre-wrap keeps the guide's structure visible without a
              markdown renderer. */}
          <pre className="mt-3 whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-[var(--color-fg)]">
            {summary}
          </pre>
        </div>
      )}
    </div>
  );
}

export default SummariesTab;
