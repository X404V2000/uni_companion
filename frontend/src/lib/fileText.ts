/**
 * src/lib/fileText.ts — extract plain text from an uploaded file.
 *
 * WHY THIS EXISTS
 * ---------------
 * The backend's `/ai/summarize` endpoint accepts TEXT only (there is no file
 * endpoint). So the browser extracts the text here and hands it to the same
 * summarize call the "Paste text" tab uses.
 *
 * Supported:
 *   - Plain text   : .txt .md .markdown .csv .json .log .rtf (native read)
 *   - PDF          : parsed with pdfjs-dist (Mozilla PDF.js)
 *   - Word .docx   : parsed with mammoth
 *   - Slides .pptx : text read from the slide XML via the zip reader
 *
 * Still not supported, with guidance instead of a dead end: legacy .doc (a
 * binary format with no viable browser parser), .xlsx and images.
 *
 * PERFORMANCE
 * -----------
 * pdfjs-dist (~1 MB) and mammoth (~200 KB) are heavy, and most sessions never
 * upload a file. They are therefore imported DYNAMICALLY inside the functions
 * that need them, so the bundler code-splits them into separate chunks that are
 * fetched only when a PDF/DOCX is actually chosen. This keeps the initial app
 * bundle small (no lag on first load).
 */

/** Raised for unsupported formats or unreadable files, with a user-facing message. */
export class UnsupportedFileError extends Error {}

const TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".csv", ".json", ".log", ".rtf"];

function isPlainText(file: File): boolean {
  const lower = file.name.toLowerCase();
  return (
    file.type.startsWith("text/") ||
    TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext))
  );
}

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

function isPptx(file: File): boolean {
  return (
    file.type ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    file.name.toLowerCase().endsWith(".pptx")
  );
}

function isLegacyDoc(file: File): boolean {
  // Word 97-2003. Detected only so the error can be specific and actionable
  // rather than a generic "unsupported".
  return (
    file.type === "application/msword" ||
    file.name.toLowerCase().endsWith(".doc")
  );
}

function isDocx(file: File): boolean {
  return (
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.name.toLowerCase().endsWith(".docx")
  );
}

/** Read a plain-text file with the native FileReader. */
function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(new UnsupportedFileError("Could not read that file."));
    reader.readAsText(file);
  });
}

/**
 * Extract all text from a PDF.
 *
 * Iterates the pages and concatenates the text items. `maxPages` bounds the
 * work (and the prompt size) for very large documents.
 */
async function readPdf(file: File, maxPages = 40): Promise<string> {
  // Lazy import: pulls the pdfjs chunk (and its worker) only on first PDF.
  const pdfjsLib = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url"))
    .default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const limit = Math.min(pdf.numPages, maxPages);
  const parts: string[] = [];
  for (let pageNo = 1; pageNo <= limit; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    parts.push(line);
  }
  const text = parts.join("\n\n").trim();
  if (!text) {
    throw new UnsupportedFileError(
      "That PDF has no selectable text (it may be a scan). Try a text-based PDF or paste the text.",
    );
  }
  return text;
}

/** Extract text from a Word .docx using mammoth (lazy-loaded). */
async function readDocx(file: File): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  const text = (result.value ?? "").trim();
  if (!text) {
    throw new UnsupportedFileError("That document appears to be empty.");
  }
  return text;
}

/**
 * Extract text from a PowerPoint .pptx.
 *
 * WHY THIS WORKS WITHOUT A HEAVY LIBRARY: a .pptx is just a zip archive of XML.
 * Each slide is `ppt/slides/slideN.xml`, and its visible text lives in `<a:t>`
 * elements. We unzip in the browser and pull those out, so lecture slides -
 * probably the most common student file after PDF - can be summarised.
 *
 * jszip is used rather than adding another dependency: it is already on disk as
 * mammoth's own dependency, and like pdfjs/mammoth it is imported DYNAMICALLY so
 * it is only downloaded when a student actually chooses a .pptx.
 */
async function readPptx(file: File): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  // Slide files, ordered NUMERICALLY. A plain string sort would put slide10
  // before slide2, which would scramble the deck's order.
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)\.xml/)?.[1] ?? 0);
      return na - nb;
    });

  if (!slideNames.length) {
    throw new UnsupportedFileError(
      "That presentation has no readable slides. Try saving it again, or paste the text.",
    );
  }

  const parts: string[] = [];
  for (let i = 0; i < slideNames.length; i += 1) {
    const xml = await zip.file(slideNames[i])!.async("string");
    // <a:t> holds a run of visible text. Decode the XML entities that actually
    // appear in slides, then collapse the whitespace PowerPoint splits runs on.
    const runs = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((m) =>
      m[1]
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&")
        .trim(),
    );
    const text = runs.filter(Boolean).join(" ").replace(/\s{2,}/g, " ").trim();
    if (text) {
      // Label each slide so the summariser understands the structure of a deck
      // (slides are short and discontinuous, unlike prose paragraphs).
      parts.push(`[Slide ${i + 1}]\n${text}`);
    }
  }

  const combined = parts.join("\n\n").trim();
  if (!combined) {
    throw new UnsupportedFileError(
      "That presentation contains no text - the slides may be images only. " +
        "Export the slides to PDF and upload that instead.",
    );
  }
  return combined;
}

/**
 * Extract plain text from any supported file.
 * Throws `UnsupportedFileError` with a human-readable message on failure.
 */
export async function extractTextFromFile(file: File): Promise<string> {
  if (isPdf(file)) return readPdf(file);
  if (isDocx(file)) return readDocx(file);
  if (isPptx(file)) return readPptx(file);

  // Legacy .doc gets its own message. "Unsupported file type" leaves the student
  // stuck; naming the fix ("Save As .docx") does not. Testers reported being
  // unable to use the app at all because of this, so it is worth being specific.
  if (isLegacyDoc(file)) {
    throw new UnsupportedFileError(
      "That is an older Word file (.doc), which browsers cannot read. Open it " +
        "in Word and use Save As → .docx, then upload again — or copy the text " +
        "into the “Paste text” box.",
    );
  }

  if (isPlainText(file)) return readAsText(file);

  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  throw new UnsupportedFileError(
    `“.${ext}” files aren't supported yet. Use PDF, DOCX, TXT, MD, CSV or JSON — ` +
      "or paste the text into the “Paste text” tab.",
  );
}
