# Repo split — outstanding, deliberately deferred

**Status: NOT done. Revisit after the hackathon.**

## The situation

There are two GitHub repositories for this project:

| Repo | Purpose | State |
|---|---|---|
| `X404V2000/university_helper` | Hackathon submission | **Current.** Everything lives here. |
| `X404V2000/uni_companion` | The product / mobile app | **Stale and wrong.** |

## Why the product repo is unusable as-is

- **2 commits, last touched 27 September.** Every change since — the auth
  re-wire, the four tabs, PDF/DOCX parsing, module management, the token fix,
  migration `0012`, the deployment fixes — exists only in `university_helper`.
- **It contains `frontend/`**, the retired three-file app, and has never had
  `new_frontend_layout/`, which is the application actually served.
- It is missing migration `0012`, so its schema is behind.

## Why the split was deferred

Synchronising 145 commits of history into a second repo means deciding, file by
file, what belongs to the product and what was hackathon scaffolding
(`plan/`, both frontends, the demo scripts, the reports). Done carelessly it
risks breaking the working app days before a demo, which is the opposite of what
is needed right now.

## What a correct split should do later

1. Decide the canonical frontend: `new_frontend_layout/` (served) and retire
   `frontend/`.
2. Carry over migrations `0001`–`0012` so the product schema matches.
3. Exclude hackathon-only material: `plan/`, the dated reports, `demo_up.sh`,
   `tunnel_keepalive.sh`, and the quick-tunnel helper scripts.
4. Bring across the deployment work: the Docker entrypoint, `.dockerignore`
   exclusions, and the Pages routing rules.
5. Make the product repo the deploy source for Cloudflare Pages, and reduce
   `university_helper` to the submission it is meant to be.

## Current deployment, for reference

Cloudflare Pages builds from `university_helper` on branch `demo`, with the root
directory set to `new_frontend_layout`. Moving the build to the product repo
later means re-pointing Pages, not rebuilding anything.
