/**
 * lib/bursaryApi.ts
 *
 * The bursary endpoints, wrapped.
 *
 * Kept in its own file rather than added to api.ts on purpose: api.ts contains
 * the token and refresh machinery, which was repaired on 2026-10-21 and is the
 * one part of this client nobody should be editing during a feature sprint.
 * This file imports `api()` and adds nothing to it.
 */
import { api } from "./api";

export type BursaryMatch = {
  id: string;
  name: string;
  provider: string;
  description: string;
  /** The OFFICIAL application page. Opened in a new tab. */
  url: string;
  closes_on: string | null;
  opens_on: string | null;
  /** Computed server-side so the number agrees with the ranking reason. */
  days_left: number | null;
  score: number;
  match_reasons: string[];
};

export type BursaryPage = {
  items: BursaryMatch[];
  total: number;
};

export async function getBursaryMatches(): Promise<BursaryPage> {
  return api<BursaryPage>("/api/v1/bursaries/matches");
}
