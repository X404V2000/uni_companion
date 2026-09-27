# Varsity Companion — Product & Startup Planning Document

**Last updated:** 11 September 2026  
**Status:** Pre-MVP / Idea Validation Stage  
**Founder profile:** Technical founder (strong AI-assisted coding, weak on people-facing activities & marketing)

---

## 1. Vision & Mission

**Vision**  
To become the default academic operating system for South African university students — helping them not only survive their studies, but turn education into real capability and opportunities.

**Mission**  
Build a mobile-first, low-data, offline-friendly AI study companion that reduces academic friction for SA university students by delivering course-aware summaries, relevant study materials, and reliable local workflow tools.

---

## 2. Problem Statement

South African university students face a combination of:

- Heavy academic pressure and frequent missed deadlines
- Difficulty finding high-quality, topic-specific study resources
- High data costs and unreliable connectivity
- Fragmented tools (university LMS + WhatsApp groups + generic AI + separate resource sites)
- Limited awareness of opportunities (though NSFAS covers the majority of funding needs)

Existing tools are either too generic (ChatGPT, Notion, Google tools) or too fragmented. Nothing combines planning, smart resources, and practical offline support in a way designed for local realities.

**Key insight from refinement:** Bursary/opportunity discovery is secondary. Most students are NSFAS-funded. The highest-frequency daily pain is academic performance and workflow friction.

---

## 3. Solution Overview

**Varsity Companion** is a mobile-first platform that acts as a personal academic assistant.

### Core Value Proposition
One focused tool that reduces academic friction through:
- Course-personalised AI summaries of lectures, readings and assignments
- Intelligent materials search (YouTube, journals, other online sources)
- Local auto-save of work from any selected window/device
- Future: forums, group chats (up to 50 members), progress insights, limited opportunity matching

Designed for South African conditions: low-data usage, offline-friendly features, practical understanding of student life pressures.

### Target Users
- Primary: Undergraduate and postgraduate students at SA universities and universities of technology
- Beachhead: Information Science, IT, and related fields
- Expansion: Broader faculties once product-market fit is proven

---

## 4. Product Scope

### MVP (Minimum Viable Product) — Focus Here First

| Feature | Description | Priority | Notes |
|---------|-------------|----------|-------|
| Course personalisation | Student selects faculty/modules; tool adapts | Must-have | Core differentiator |
| AI summaries | Deeper, structured summary points of uni work & assignments | Must-have | Highest value feature |
| Materials search | Internal search returning YouTube links, journals, other resources | Must-have | High daily utility |
| Local auto-save | Select any window → auto-save to local device folder | Must-have | Addresses data/connectivity pain |
| Basic deadline/module tracking | Simple prioritisation and reminders | Should-have | Supports retention |
| Account & basic profile | Login, course selection, preferences | Must-have | Foundation |

**MVP Success Criteria**
- Students complete the core loop (upload/select content → get useful summary + materials) without friction
- Measurable retention (e.g. weekly active use during term)
- Positive qualitative feedback on summary quality and local-save reliability

### Post-MVP / V1.5+
- Forums and group chats (capped at 50 members)
- Progress insights (personal, non-toxic)
- Limited opportunity matching (bursaries, internships, competitions) — secondary
- WhatsApp integration potential
- Institutional / university partnership features

**Rule:** Do not expand into social/features until the academic core (summaries + search + local save) shows strong retention.

---

## 5. Technical & Cost Considerations

### AI API Cost Management (Critical)

Uncontrolled LLM usage will destroy unit economics. Design for efficiency from day one.

**Recommended approach:**
1. **Default to cheap, capable models**  
   GPT-4o-mini class, Gemini Flash variants, DeepSeek, or equivalent nano/Flash models.  
   Target cost per summary: **$0.001 – $0.005** (often under half a cent).

2. **Aggressive caching**  
   - Prompt caching for system instructions and common course context (50–90% savings on repeated tokens)  
   - Semantic / result caching for similar student content or popular modules  
   - Pre-generate high-quality summaries for high-enrolment modules where possible

3. **Usage limits on free tier**  
   Daily/weekly caps (e.g. 5–15 AI summaries per day).  
   Clear remaining-credits UI.  
   Premium unlocks higher limits or slightly stronger models.

4. **Token reduction tactics**  
   - Short, static system prompts  
   - Structured concise output (“bullet points only, max 8 points”)  
   - Truncate or pre-summarise very long inputs  
   - Prefer retrieval + ranking before calling LLM for materials search

5. **Monitoring**  
   Track cost per user, per feature, per day.  
   Hard budget alerts and automatic rate limiting (especially during exam peaks).

6. **Hybrid design**  
   Local auto-save needs zero AI.  
   Materials search can lean heavily on retrieval first.  
   Only call LLM when genuine generation is required.

**Target:** Keep AI cost per active student well under R1–R5 per month even with reasonable usage.

### Offline / Local-First Design
- Local auto-save is a core differentiator for SA conditions.
- Minimise cloud dependency for core workflow.
- Design for intermittent connectivity and data sensitivity.

### IP & Code Protection (Founder Priority)
- All code and IP must belong to the company, not individuals.
- Written IP Assignment (pre- and post-incorporation) is mandatory before any co-founder or contractor access.
- Private repositories, least-privilege access, branch protection, audit logs.
- Co-founder agreement must include strong IP assignment, confidentiality, and vesting clauses.
- Copyright notices in source files.
- Open-source licence audit for all third-party components.

---

## 6. Go-to-Market & Distribution (Tailored for Technical Founder)

Avoid high-energy marketing and constant networking. Lean on product-led growth and low-interaction channels.

### Beachhead Strategy
1. Choose 1–2 high-enrolment modules/faculties in IT / Information Science at 1–2 universities.
2. Ship narrow MVP focused on those modules.
3. Get real students using it weekly.
4. Measure retention and summary quality before expanding.

### Acquisition Channels (Low People-Energy)
- Product-led: Make the tool so useful that students share via WhatsApp groups and class chats.
- Campus ambassadors (students who get free premium or small incentives).
- Targeted student Discord / Facebook / WhatsApp groups (value-first participation).
- University society partnerships (once traction exists).
- Simple landing page + waitlist with clear demo video (screen recording, calm voiceover — no need to be on camera).

### What to Avoid Early
- Heavy content marketing / video creation unless it can be largely AI-assisted and batched.
- Broad paid acquisition before retention is proven.
- Trying to be present at every networking event.

---

## 7. Business Model

**Primary (near-term):** Freemium
- Free: Core summaries (capped), materials search, local save, basic tracking
- Premium: Higher AI limits, advanced features, unlimited history, early access to group tools

**Secondary (later):**
- Institutional / university licensing or white-label
- Partnership revenue (carefully selected, non-spammy opportunity providers)

**Pricing sensitivity:** NSFAS students have limited disposable income. Conversion rates will be modest. Focus first on usage and retention; monetisation follows proven value.

---

## 8. Team & Co-Founder Strategy

**Current strength:** Technical execution and product vision.  
**Current gap:** People skills, marketing, distribution, fundraising energy.

**Ideal co-founder profile**
- Strong commercial / growth / community orientation
- Experience with or deep empathy for SA student life
- Comfortable owning outreach, partnerships, and storytelling
- Full-time (or clear path to it) and execution-oriented

**Equity guidance (protective of majority ownership)**
- Strong early business co-founder: **20–30%** (with 4-year vesting, 1-year cliff)
- Keep founder majority (70–80% pre-option pool)
- All equity must vest; IP assignment is non-negotiable
- Written co-founder + shareholders agreement before significant joint work or code access

**Alternative path:** Bootstrap further with freelancers / advisors for growth tasks while retaining full ownership, then hire after traction.

---

## 9. Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| AI costs spiral | Cheap models by default + caching + free-tier caps + monitoring |
| Summary quality fails to impress | Start narrow (specific modules), gather real feedback fast, iterate prompts aggressively |
| Students already use free generic AI | Compete on course personalisation + local workflow + SA-specific convenience |
| Distribution difficulty | Product-led growth + beachhead focus + student ambassadors |
| Monetisation hard | Validate usage first; keep costs extremely low; explore institutional later |
| Co-founder / IP issues | Strong written agreements + vesting + IP assignment before access |
| Feature creep | Strict MVP focus; social features only after core retention is proven |

---

## 10. Validation Roadmap (Next 3–6 Months)

### Phase 1 — Foundation (Weeks 1–4)
- Finalise MVP feature list and technical architecture
- Set up cost monitoring and model routing
- Create simple landing page + waitlist
- Prepare IP assignment and basic company structure

### Phase 2 — Build & Private Beta (Weeks 5–12)
- Ship MVP for 1–2 target modules
- Recruit 50–200 students from beachhead faculties
- Measure: activation, weekly retention, summary quality feedback, cost per user
- Iterate hard on summary usefulness and local-save reliability

### Phase 3 — Traction Decision Point
- If retention and feedback are strong → expand modules, consider co-founder or growth hire, prepare for limited paid tier
- If weak → diagnose (quality? distribution? wrong beachhead?) and pivot or narrow further

### Success Metrics to Watch
- Weekly active users / retention curves
- Summaries generated per active user
- Qualitative feedback scores on usefulness
- AI cost per active user
- Organic share / referral rate

---

## 11. Pitch Summary (One-Paragraph Version)

Varsity Companion is a mobile-first AI study companion built specifically for South African university students. It delivers course-aware summaries of lectures and assignments, intelligent search for YouTube and academic materials, and reliable local auto-save — all designed for low-data and intermittent connectivity environments. By focusing first on the highest-frequency academic pain points rather than secondary opportunity discovery, and by tightly controlling AI costs through efficient models and caching, the product aims to become the practical academic operating system students actually use every week.

---

## 12. Immediate Next Actions

1. Lock MVP scope (course personalisation + AI summaries + materials search + local auto-save).
2. Choose initial beachhead modules/faculties.
3. Implement cost controls and monitoring before any significant student traffic.
4. Draft / obtain IP assignment and basic co-founder agreement templates.
5. Build the narrowest possible working version and put it in front of real students as soon as possible.

---

*This document is a living plan. Update it as validation data arrives. The goal is not perfect planning — it is rapid learning with controlled risk.*
