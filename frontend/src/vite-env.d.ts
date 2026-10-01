/// <reference types="vite/client" />

/**
 * Build-time constants injected by vite.config.ts.
 *
 * Declared here so TypeScript accepts them; without this the build succeeds but
 * `tsc --noEmit` reports the global as undefined.
 */
declare const __BUILD_STAMP__: string;
