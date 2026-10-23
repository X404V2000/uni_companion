# Varsity Companion — presenter brief

**Read this before recording.** 5 minutes. It tells you what to say, what to
show, and the one thing that can embarrass the demo.

---

## The pitch, in one sentence

> **Varsity Companion puts every deadline in a South African student's life —
> assignments and funding applications — in one place, and tells them what to do
> first, even when the internet is bad.**

The promise that drives every decision: *a student must not be blocked the night
a deadline is due.* Low-data, offline-tolerant, built for campus wifi.

**Live link:** `https://uni-companion.scrapymog.workers.dev`

---

## 🚨 STATUS 2026-10-23 09:15 — read before recording

**The backend is unstable right now.** Measured this morning:

| Endpoint | Result |
|---|---|
| Web frontend (Cloudflare) | 200, fast, fine |
| Backend API (Render) | **~7 of 12 requests succeed — about 40% fail** |
| A real signup in a browser | showed **"Cannot reach the server"** |

The app is not broken; the free hosting tier is. But **do not record a live
signup or any live data action until this improves.** Options, best first:

1. **Wait and retest** — open the link and sign in. If you land on Home, record
   then. Re-test immediately before pressing record.
2. **Record against a warmed session.** Sign in successfully once, keep that tab
   open, and record the walkthrough *without* refreshing. Most of the demo then
   needs no new backend call.
3. **Record the core flow locally** (`cd frontend && npm run preview`) and use the
   live link only for the opening shot.

**What to say if it fails on camera:** *"the free backend host is having a
moment — and this is exactly why the app tells you the connection failed instead
of hanging."* That is true, and it is a better answer than an apology.

---

## ⚠️ Read this first — recording checklist

1. **Warm the backend before recording.** Open the live link and sign in once,
   then wait ~20 seconds. The free hosting tier sleeps, and the first request
   after waking takes 5–15 seconds.
2. **Pre-create the demo account** and have the password ready. Don't sign up
   live if you can avoid it.
3. **Have 2–3 modules already added** (e.g. COS132 Imperative Programming,
   MAM201 Mathematics) with a deadline or two.
4. **Run the "Find resources" action on one module in advance.** It takes ~30–60
   seconds; record it separately if you want to show it, or fast-forward.

> The app itself is reliable. The free hosting tier is not. Warming it up is the
> difference between a 10-second intro and a 20-second blank screen.

---

## What to show, in order (about 4 minutes)

### 1. Landing and first impression (20s)
Open the link. Sign in.
> "This is Varsity Companion. It's a study companion built for South African
> students — it works on a phone, on low data, and it's designed to be useful
> when the connection isn't."

### 2. The Home screen — everything that matters, in one place (45s)
> "The home screen answers one question: what do I have to do, and when?
> Deadlines at the top, your modules below, recent activity. A new student gets
> a three-step guide — add modules, add a deadline, find materials — so nothing
> is ambiguous on day one."

If the account is brand new, the **"Start here"** panel appears. Point at it.

### 3. Adding a module — and the fact that clicking it works (30s)
Tap **Manage → add a module**. Then tap the module card.
> "Everything is scoped to a module — deadlines, summaries, materials. Tapping
> a module takes you straight to its materials."

### 4. Find Materials — the feature students asked for by name (60s)
Go to **Find**. Show a module that already has results.
> "This is the complaint we kept hearing: 'having to add all my files manually
> is a lot.' So we built the opposite. One button searches six open sources —
> arXiv papers, Wikipedia, Open Library, Crossref and Open Textbook Library,
> plus verified videos — and pulls in real, working resources for that module.
> Nothing to upload."

Mention the intelligence, briefly:
> "A relevance filter removes off-topic results — only resources that actually
> match the module's topics get through. Without it, a maths module would get
> finance textbooks."

### 5. AI Summaries (40s)
Go to **AI**. If a summary is pre-generated, show it.
> "Students paste or upload their notes and get a course-aware summary. We keep
> the raw content out of the database — metadata only — because this is
> students' private work."

*(Do not rely on generating a summary live — it depends on an external AI service
and can be slow or unavailable.)*

### 6. Planner (30s)
Go to **Planner**.
> "Every deadline in one calendar."

### 7. Settings, privacy and the delete account (30s)
Tap the gear.
> "An app holding student data has to be honest about it. A student can see what
> is stored, turn off anonymous usage signals, or delete their account
> completely. Deleting requires their password, because it's permanent."

### 8. Coming this weekend (20s)
> "Tomorrow and this weekend we're adding two things students asked for:
> bursary recommendations matched to their degree and year, and a study plan
> that says 'you have nine hours of work this week — start with this'. Bursary
> closing dates will sit in the same planner as assignments, because a missed
> funding deadline costs a student a year."

---

## Feature list (for a slide)

**Built and live today**
- Phone-first web app, low data, works with self-hosted fonts (no Google request)
- Account creation, sign-in, session that survives 15-minute token expiry
- Module management
- Deadline tracking with a dashboard of what's due
- **AI summaries** of a student's own notes (paste or upload PDF/DOCX), with a daily credit limit
- **Find Materials** — automatic discovery from 6 open sources, relevance-filtered, every link validated
- Study planner
- Privacy controls: consent toggle, account deletion with password re-confirmation
- Honest error messages ("Module code is too short", not "server error")
- Android app in progress (same product, native shell)

**Built this weekend (hackathon)**
- **Bursary recommendations** — matched to field of study, year and institution,
  with closing dates and a link to each official application page
- **Smart study plan** — a transparent estimate of hours needed this week and the
  top 3 things to start with
- **Bursary deadlines in the planner** — academic and funding deadlines in one list

---

## The three things to say if asked "how is this different?"

1. **It assumes a bad connection.** Fonts are self-hosted, the app degrades to a
   clear message rather than a blank screen, and it survives a dropped connection.
2. **It finds material instead of asking for it.** Every link is verified before
   it's shown; off-topic results are filtered out. Scraping other people's notes
   isn't the model — pointing at free, open, legal sources is.
3. **It treats student data as someone else's.** Raw notes aren't stored, usage
   signals are anonymous and optional, and deletion is real.

---

## Things not to claim

- **Don't say "it works offline"** — say *"it handles a bad connection without
  losing your work."* The planner will be fully offline-capable later.
- **Don't claim every module has materials.** It fills a module in ~30–60
  seconds on demand; only pre-loaded ones are instant.
- **Don't overstate AI** — it summarises the student's own notes. It does not
  write their assignments, and that's a deliberate choice.
- **Don't promise iOS yet.**

---

## If something goes wrong on camera

**Blank screen or "Cannot reach the server":** the backend is waking. Say
*"the free hosting tier is waking up — give it a moment"*, wait, refresh. This is
honest and it's why the app has to handle slow connections at all.

**A button does nothing:** stop, refresh the page, continue. Don't try to debug
it on camera.

**The plan B:** record a 60-second screen capture of a working session first,
before recording the pitch. If anything fails live, you still have the core.

---

## Tone

Plain and confident. This is a tool for a student at 11pm with a deadline at
8am — not an AI showcase. The strongest line you can say:

> **"We didn't build another chatbot. We built the thing a student actually
> opens at 11pm."**
