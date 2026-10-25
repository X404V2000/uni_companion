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

## ✅ STATUS 2026-10-23 09:35 — the deployment is fine

An earlier version of this file warned that the backend was unstable. **That was
my own network, not the deployment.** Measured to prove it:

| Target | Result from my machine |
|---|---|
| Backend, one reused (keep-alive) connection | **4 / 4 succeed** |
| Frontend (Cloudflare) | intermittently fails |
| A global third-party CDN (jsDelivr) | **fails 7 of 12** |
| Google (single IP) | always succeeds |

A global CDN failing alongside your own sites, while Google works, means the
local connection was dropping - not your infrastructure. The backend also
reported `{"status":"healthy","database_connected":true}` throughout.

**Conclusion: the app and its hosting are healthy.** The notes below are still
worth following, because the free tier does sleep and the first request after
that is slow - but this is now a precaution, not a rescue plan.

### Still worth doing before recording

1. **Open the link and sign in once, then wait ~20 seconds.** The free tier
   sleeps; the first request after waking takes 5-15 seconds.
2. **Keep that signed-in tab open while recording.** Most of the walkthrough
   needs no new backend call, which also protects you from any network hiccup.
3. **Re-test immediately before pressing record.** If you land on Home, you are
   good to go.

**If a request does fail on camera:** *"the free host is waking up - and this is
exactly why the app tells you the connection failed instead of hanging."* That is
true, and it is a better answer than an apology.

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

### 6. Planner - the money and the marks in one place (45s)
Go to **Planner**.

> "Every deadline in one calendar. Assignments *and* funding."

**Point at the Funding deadlines section first** - it is the newest and the most
persuasive. Read one aloud:

> "Astron Energy closes in 1 day. Discovery Foundation in 5. These are not
> academic tasks you can tick off - the application happens on the provider's
> site, so each one links straight there."

Then the key line:
> "A missed assignment costs a mark. A missed bursary costs a year. That's why
> they are on the same screen."

If asked about ordering: soonest first, and anything inside a week turns red.
That was a deliberate choice, not an accident.

### 7. Settings, privacy and the delete account (30s)
Tap the gear.
> "An app holding student data has to be honest about it. A student can see what
> is stored, turn off anonymous usage signals, or delete their account
> completely. Deleting requires their password, because it's permanent."

### 8. Already live, and what comes next (25s)

**Do not say these are "coming" - they are built and deployed.** Say them in the
present tense, because that is the stronger claim and it is true.

> "The two things students asked for are already in the app. Bursaries matched
> to your degree, year and institution - twelve verified funds, eleven of which
> close inside eight days. And a study plan on the home screen that totals your
> week and tells you what to open first."

Then the honest forward-looking part:

> "Next is self-service password recovery by email - today it is handled
> personally - and getting the same two features onto the phone app."

**The strongest single fact you have:** say plainly that eleven of the twelve
bursaries close within eight days. It is verifiable on screen and it makes the
product feel live rather than mocked up. 

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
- Honest error messages ("Module code is too short", not "server error")
- **Password recovery** - a one-time, 30-minute link restores a locked-out account
- **Android APK**, built and installable (`za.co.varsitycompanion`)

**The hackathon features - all three are built, deployed and live**
- **Bursary recommendations** - 12 verified funds matched to field of study, year
  and institution, each with its closing date and a link to the official page
- **Smart study plan** - a transparent hours estimate for the week and the top 3
  things to start with, on the home screen
- **One planner** - funding deadlines above academic ones, soonest first

---

### If you show the APK, read this

**The APK does NOT have Bursaries or the Study plan.** It was built from the
mobile app, which is a separate frontend and lags the web by these two features.

- **Web link** -> show Bursaries and the study plan
- **APK** -> show modules, deadlines, materials, settings, first-run guide

Never open the APK expecting bursaries. Show the APK as evidence that a native
app exists and installs; show the web for the new features.

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
