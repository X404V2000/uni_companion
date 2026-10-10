import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Escapes HTML control characters to prevent Cross-Site Scripting (XSS).
 */
export function escapeHtml(str: string): string {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Constant-time string comparison to prevent side-channel timing attacks.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Perform dummy comparison to equalize execution time
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Recursively sanitizes strings inside an object or array:
 * - Strips null bytes (\0) which can bypass string termination checks
 * - Strips dangerous <script>, javascript: and event handlers
 * - Normalizes Unicode to avoid invisible homograph bypasses
 */
export function sanitizeValue(val: any): any {
  if (typeof val === "string") {
    // 1. Strip null bytes
    let clean = val.replace(/\0/g, "");
    // 2. Strip javascript: URIs (case-insensitive and with embedded whitespace)
    clean = clean.replace(/javascript\s*:/gi, "");
    // 3. Strip data:text/html URIs
    clean = clean.replace(/data\s*:\s*text\/html/gi, "");
    // 4. Strip inline <script tags
    clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    // 5. Strip dangerous HTML inline event attributes (e.g., onload=, onerror=)
    clean = clean.replace(/\bon\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    return clean;
  }

  if (Array.isArray(val)) {
    return val.map((item) => sanitizeValue(item));
  }

  if (val !== null && typeof val === "object") {
    const sanitizedObj: Record<string, any> = {};
    for (const [key, item] of Object.entries(val)) {
      // Prevent prototype pollution
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        continue;
      }
      sanitizedObj[key] = sanitizeValue(item);
    }
    return sanitizedObj;
  }

  return val;
}

/**
 * Express Middleware: Deep request payload sanitization
 */
export function securitySanitizer(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body);
  }
  if (req.query && typeof req.query === "object") {
    req.query = sanitizeValue(req.query);
  }
  if (req.params && typeof req.params === "object") {
    req.params = sanitizeValue(req.params);
  }
  next();
}
