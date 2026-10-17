# The Varsity Companion agent team

Ten named agents, each with a role, a branch, and a standing brief. They work on the existing
codebase, push only to their own branch, and open pull requests. **The founder reviews and
merges. No agent ever merges.**

---

## 1. The team

| # | Name | Role | Branch | Employment | Reports to |
|---|---|---|---|---|---|
| 1 | **Anele Mokoena** | Tech Lead / Architect | none (coordinates) | full-time | Founder |
| 2 | **Thabo Nkosi** | Full-stack Developer — Backend | `agent/dev-backend` | full-time | Tech Lead |
| 3 | **Lerato Dlamini** | Full-stack Developer — Web | `agent/dev-web` | full-time | Tech Lead |
| 4 | **Sipho Mahlangu** | Full-stack Developer — Mobile | `agent/dev-mobile` | full-time | Tech Lead |
| 5 | **Naledi Khumalo** | QA / Test Automation Engineer | `agent/qa` | full-time | Tech Lead |
| 6 | **Kabelo Mthembu** | DevOps / SRE Engineer | `agent/devops` | full-time | Tech Lead |
| 7 | **Zanele Botha** | Security Engineer | `agent/security` | shared / part-time | Tech Lead |
| 8 | **Ayanda Pillay** | Delivery Manager / PM | `agent/pm` | shared / part-time | Founder |
| 9 | **Nomvula Sithole** | UI/UX Designer | `agent/uiux` | part-time | Tech Lead |
| 10 | **Pieter van Wyk** | Business Analyst | `agent/ba` | part-time | Founder |

Machine-readable roster: **`agents/org.json`**. Briefs: **`agents/team/<id>.md`**.

---

## 2. How to run a session (for the founder)

Each agent is manual. You start a session and give it the brief.

```
1. Open a session with the model you use for that agent.

2. Paste this, then the brief:

   You are working on the Varsity Companion repository at
   ~/Desktop/projects/varsity_companion.
   Read AGENTS.md, then your brief at agents/team/<id>.md, then all four
   files in agents/state/.
   Follow the session ritual in your brief exactly.
   Your branch is agent/<id>. You never push to main, never merge, never
   force-push, and never install a package without my approval.
   When you are done, open a pull request into main and report what you did.

3. Paste the contents of agents/team/<id>.md.

4. When it finishes, review the PR on GitHub and merge it if it is right.
```

**If an agent raises a blocker**, it writes it to `agents/state/blockers.json` and stops.
Answer it there, or reply in the session.

---

## 3. The coordination files

Four JSON files in `agents/state/`, committed so every agent and every fresh clone reads the same
truth. Schema: `agents/state.schema.json`.

| File | Owner | What lives there |
|---|---|---|
| `tasks.json` | Tech Lead (scope), PM (status) | Every unit of work: id, owner, branch, status, dependencies, acceptance criteria |
| `handoffs.json` | Whoever hands off | Completed work, with evidence, changed files, commit, PR |
| `blockers.json` | Whoever is stuck | One answerable question, with options and a recommendation |
| `decisions.json` | Tech Lead | Rulings with reasoning and rejected alternatives |

### The rules

- **Read all four at the start of every session.** They are the team's memory.
- **Append, never delete.** Mark `done`/`resolved`; do not remove.
- **Only the owner writes a file.**
- **Every entry has an `id`, an `author`, an ISO-8601 `at`, and a `task_id`.**
- **If blocked, write a blocker and stop.** Do not guess past it. Do not work around a rule.

### ID conventions

```
TASK-0001   units of work
HO-0001     handoffs
BLK-0001    blockers
DEC-0001    decisions
```

---

## 4. The guardrails (enforced in every brief)

1. **Never commit to `main`.** Never force-push. Never merge.
2. **Push only to your own `agent/<id>` branch.** Open a PR into `main`.
3. **One task per PR.**
4. **No package, library, or dependency without explicit founder approval** — including dev
   dependencies. Ask through a blocker.
5. **CI runs on the PR into `main`**, not on the agent branch alone. Do not call work verified
   until the PR's CI is green.
6. **Show every test failing before showing it passing.**
7. **Never commit a credential**, in any file, in any commit message.
8. **No raw user content stored.** Metadata only. POPIA.
9. **Do not touch another agent's scope.** Backend does not edit the web client; web does not
   edit mobile.
10. **Trust the tree over the document.** Verify something does not already exist before
    building it.

---

## 5. Branch and PR mechanics

First run for an agent:

```bash
git fetch origin
git checkout -b agent/<id> origin/main
git push -u origin agent/<id>
```

Every session after:

```bash
git fetch origin
git checkout agent/<id>
git pull --ff-only
git rebase origin/main          # start from current main
```

Finish:

```bash
git add -A
git commit -m "type(scope): what and why"
git push origin agent/<id>
gh pr create --base main --head agent/<id> \
  --title "<concise title>" \
  --body "<what changed, why, and the evidence>"
```

**The founder reviews the PR and merges.** Agents stop at the PR.

---

## 6. What the founder does per week

```
Daily     review open PRs, merge good ones, answer blockers in blockers.json
Weekly    ask the PM for a status report (done / in flight / blocked / next)
```

The PM's report is the honest one: it names what is late, what is stuck, and what needs you.

---

## 7. What actually enforces the rules

**GitHub branch protection is unavailable on this repository.** It is private, and protection
(GitHub's "branch protection rules" or "rulesets") requires **GitHub Pro** or a public
repository. Verified: the API returns
`403 — Upgrade to GitHub Pro or make this repository public to enable this feature`, even for
the repository owner with admin scope.

So the rules are enforced in two layers, and it matters which is which:

| Layer | Enforces | Bypassable? |
|---|---|---|
| **Briefs** (`agents/team/*.md`) | The intent. An agent that reads its brief does not attempt a forbidden action | Yes — an agent that ignores its brief |
| **Local git hooks** (`.githooks/`) | Refuses a commit on `main`, a push to `main`, a force-push, and a remote branch delete | Yes — `--no-verify`, and only if the hooks are enabled in that clone |
| **GitHub** | Nothing beyond ordinary repo permissions | — |

### The hooks

`.githooks/pre-commit` and `.githooks/pre-push`, committed and versioned. Enable them in any
clone with:

```bash
./scripts/setup_hooks.sh
```

They were verified in both directions before being relied on:

```
commit on main                 -> BLOCKED, exit 1
push to main                   -> BLOCKED, exit 1 (also caught a would-be history rewrite)
push to agent/team-setup       -> ALLOWED, exit 0   <- control: normal work still works
```

**What they do not do:** they do not run in a fresh clone until `setup_hooks.sh` is run, and
`git commit --no-verify` / `git push --no-verify` skips them. They are a guard against the
realistic mistake — an agent on autopilot running the wrong command — not a defence against a
determined actor.

### The upgrade, when there is budget

**GitHub Pro (~$4/month)** enables real server-side protection on a private repo: require a PR
before merging, block force-pushes, block direct pushes to `main`, and require CI to pass. That
is the only layer an agent cannot talk its way past. Recommended before the team scales up.
**Making the repo public also enables it for free, but this project has a credential-leak
history; public is not the right trade.**

---

## 8. Why it is built this way

**Structured coordination over prose.** Prose handoffs get paraphrased or forgotten between
sessions. A JSON record with ids, owners, timestamps and evidence survives a session ending and
a different agent picking the work up.

**One branch, one PR, one task.** Every change has a review surface and a clean revert point.

**Long-lived branch per agent.** The agent's history is theirs; the founder's review is the gate.

**No package without approval.** Every dependency is a supply-chain and maintenance liability.
This project has already shipped two credential leaks and an abandoned second stack.

**"Show it failing first."** Six real defects on this project were found by a check that could
fail. A green suite that never exercised the behaviour is worse than no suite.
