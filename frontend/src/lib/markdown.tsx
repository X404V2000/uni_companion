/**
 * src/lib/markdown.tsx
 *
 * A deliberately SMALL markdown renderer for AI-generated study guides.
 *
 * WHY NOT A LIBRARY: a full markdown parser (react-markdown + remark + rehype)
 * adds ~100 KB+ to a bundle we have kept at ~300 KB, and we only ever render
 * output from our own prompt, which emits a known subset. So this handles
 * exactly that subset and nothing more:
 *
 *   ## headings        - section titles
 *   - / * bullets      - lists (including "- **term**: description")
 *   1. numbered lists  - worked-example steps
 *   **bold**           - key terms
 *   `code`             - inline code
 *   $O(\log n)$        - inline maths, shown in a serif italic style
 *   ---                - horizontal rule
 *   ``` fenced blocks  - ASCII diagrams / pseudo-code
 *
 * WHY THIS MATTERS: the study guide used to be rendered inside a <pre>, so the
 * headings, bold terms and maths all appeared as raw symbols ("##", "**", "$"),
 * which made good output look broken. This renders it readably.
 */

import type { ReactNode } from "react";

/**
 * Turn LaTeX into something readable WITHOUT a maths renderer.
 *
 * WHY THIS EXISTS: testers reported output like
 *   $$\text{Depreciation} = \frac{333\,333 - 33\,333}{5}$$
 * appearing literally on screen. The model legitimately emits LaTeX, but we
 * ship no math typesetter (KaTeX/MathJax would add hundreds of KB), so every
 * backslash command was shown as raw source and the guide looked broken -
 * especially in Accounting, where currency kept coming out as \text{R}.
 *
 * This converts the common constructs into plain readable text. It is
 * deliberately CONSERVATIVE: it handles what our prompts actually produce, and
 * leaves anything it does not recognise intact rather than mangling it.
 */
function humaniseLatex(expr: string): string {
  let out = expr.trim();

  // Strip display-math delimiters that may have survived.
  out = out.replace(/^\$\$?/, "").replace(/\$\$?$/, "");

  // \text{...} / \mathrm{...} / \operatorname{...} -> their contents.
  out = out.replace(/\\(?:text|mathrm|operatorname|mathbf|mathit)\s*\{([^{}]*)\}/g, "$1");

  // \frac{a}{b} -> (a) / (b). Brackets keep the meaning clear when a or b is
  // itself an expression.
  let previous = "";
  while (previous !== out) {
    previous = out;
    out = out.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1) / ($2)");
  }

  // Spacing and symbol shorthands.
  out = out.replace(/\\[,;:!]/g, " ");
  out = out.replace(/\\quad|\\qquad/g, "  ");
  // Use the real symbols where they read better than letters; "x" for both
  // multiplication and the letter x is genuinely ambiguous in algebra.
  out = out.replace(/\\times/g, "\u00d7");
  out = out.replace(/\\cdot/g, "\u00b7");
  out = out.replace(/\\div/g, "/");
  out = out.replace(/\\pm/g, "+/-");
  out = out.replace(/\\approx/g, "~");
  out = out.replace(/\\leq|\\le/g, "<=");
  out = out.replace(/\\geq|\\ge/g, ">=");
  out = out.replace(/\\neq|\\ne/g, "!=");
  out = out.replace(/\\rightarrow|\\to/g, "->");
  out = out.replace(/\\infty/g, "infinity");
  out = out.replace(/\\%/g, "%");
  out = out.replace(/\\\$/g, "$");
  out = out.replace(/\\_/g, "_");
  out = out.replace(/\\&/g, "&");
  out = out.replace(/\\#/g, "#");

  // \sqrt{x} -> sqrt(x)
  out = out.replace(/\\sqrt\s*\{([^{}]*)\}/g, "sqrt($1)");

  // Leftover simple commands: \alpha -> alpha, \log -> log.
  out = out.replace(/\\([a-zA-Z]+)/g, "$1");

  // Tidy: collapse the extra spaces the substitutions can introduce.
  out = out.replace(/\s{2,}/g, " ").trim();
  return out;
}

/** Render **bold**, `code` and $maths$ inside a single line of text. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  // One pass over the line, alternating between plain text and marked-up spans.
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\$[^$]+\$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-i${i++}`;

    if (token.startsWith("**")) {
      out.push(
        <strong key={key} className="font-extrabold text-[#142D38]">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      out.push(
        <code
          key={key}
          className="rounded bg-[#EEF3F1] px-1.5 py-0.5 font-mono text-[11px] text-[#205A55]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      // Inline maths. LaTeX is humanised first, because we ship no maths
      // typesetter: without this the student sees \frac and \text literally.
      out.push(
        <span
          key={key}
          className="font-serif italic text-[#243B42]"
          title="mathematical notation"
        >
          {humaniseLatex(token)}
        </span>,
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}

/**
 * Render a markdown study guide as React elements.
 *
 * Intentionally tolerant: unknown markup is passed through as plain text rather
 * than dropped, so nothing the model writes can silently disappear.
 */
export function renderMarkdown(markdown: string): ReactNode {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];

  let listBuffer: { ordered: boolean; items: string[] } | null = null;
  let codeBuffer: string[] | null = null;
  // Display maths ($$ ... $$) spans lines, so it needs its own buffer. Without
  // this the delimiters were emitted as ordinary text and the whole formula
  // appeared as raw LaTeX.
  let mathBuffer: string[] | null = null;
  let key = 0;

  const flushList = () => {
    if (!listBuffer) return;
    const { ordered, items } = listBuffer;
    const ListTag = ordered ? "ol" : "ul";
    blocks.push(
      <ListTag
        key={`l${key++}`}
        className={
          ordered
            ? "my-2 list-decimal space-y-1.5 pl-5 text-[12px] leading-relaxed"
            : "my-2 list-disc space-y-1.5 pl-5 text-[12px] leading-relaxed"
        }
      >
        {items.map((item, idx) => (
          <li key={idx}>{renderInline(item, `l${key}-${idx}`)}</li>
        ))}
      </ListTag>,
    );
    listBuffer = null;
  };

  const flushMath = () => {
    if (!mathBuffer) return;
    blocks.push(
      <div
        key={`m${key++}`}
        className="my-3 overflow-x-auto rounded-xl bg-[#F4F7F5] px-4 py-3 text-center font-serif text-[13px] italic text-[#243B42]"
      >
        {humaniseLatex(mathBuffer.join(" "))}
      </div>,
    );
    mathBuffer = null;
  };

  const flushCode = () => {
    if (!codeBuffer) return;
    blocks.push(
      <pre
        key={`c${key++}`}
        className="my-3 overflow-x-auto rounded-xl bg-[#142D38] p-3 text-[11px] leading-relaxed text-[#D6E4E0]"
      >
        <code>{codeBuffer.join("\n")}</code>
      </pre>,
    );
    codeBuffer = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // --- fenced code blocks -------------------------------------------------
    // Display maths: a line that is only $$ toggles the maths block.
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith("$$")) {
      if (mathBuffer) {
        flushMath();
      } else {
        flushList();
        // A single-line $$...$$ is self-contained; a bare $$ opens a block.
        const inline = trimmedLine.replace(/^\$\$/, "").replace(/\$\$$/, "").trim();
        if (inline && trimmedLine !== "$$") {
          mathBuffer = [inline];
          flushMath();
        } else {
          mathBuffer = [];
        }
      }
      continue;
    }
    if (mathBuffer) {
      mathBuffer.push(trimmedLine);
      continue;
    }

    if (line.trim().startsWith("```")) {
      if (codeBuffer) flushCode();
      else {
        flushList();
        codeBuffer = [];
      }
      continue;
    }
    if (codeBuffer) {
      codeBuffer.push(rawLine);
      continue;
    }

    // --- headings -----------------------------------------------------------
    // The model is told to use exactly "## ", but tolerate "#".."####" so a
    // stray level never leaks a literal hash into the UI.
    const heading = /^(#{1,4})\s+(.*)$/.exec(line.trim());
    if (heading) {
      flushList();
      const text = heading[2];
      blocks.push(
        <h3
          key={`h${key++}`}
          className="mt-5 mb-2 font-display text-[13px] font-extrabold uppercase tracking-[0.08em] text-[#205A55] first:mt-0"
        >
          {renderInline(text, `h${key}`)}
        </h3>,
      );
      continue;
    }

    // --- horizontal rule ----------------------------------------------------
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushList();
      blocks.push(
        <hr key={`r${key++}`} className="my-4 border-t border-[#E7ECE9]" />,
      );
      continue;
    }

    // --- lists --------------------------------------------------------------
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const text = (bullet ? bullet[1] : numbered![1]).trim();
      if (listBuffer && listBuffer.ordered !== ordered) flushList();
      if (!listBuffer) listBuffer = { ordered, items: [] };
      listBuffer.items.push(text);
      continue;
    }

    // --- blank line ---------------------------------------------------------
    if (!line.trim()) {
      flushList();
      continue;
    }

    // --- paragraph ----------------------------------------------------------
    flushList();
    blocks.push(
      <p key={`p${key++}`} className="my-2 text-[12px] leading-relaxed">
        {renderInline(line.trim(), `p${key}`)}
      </p>,
    );
  }

  flushList();
  flushCode();
  flushMath();
  return <div className="text-[#3A4A4A]">{blocks}</div>;
}
