# Varsity Companion — Full Project Plan

**Last updated:** 11 September 2026  
**Status:** Pre-MVP / Idea Validation Stage  
**Founder profile:** Technical founder (strong AI-assisted coding, weak on people-facing activities & marketing)  
**Budget reality:** Near-zero. Strategy must be product-led and capital-efficient.

---

## 1. Vision & Mission

**Vision**  
To become the default academic operating system for South African university students — helping them not only survive their studies, but turn education into real capability and opportunities.

**Mission**  
Build a mobile-first, low-data, offline-friendly AI study companion that reduces academic friction for SA university students by delivering course-aware summaries, relevant study materials, and reliable local workflow tools.

---

## 2. Problem Statement

South African university students face a tough combination of:

- Heavy academic pressure and frequent missed deadlines
- Difficulty finding high-quality, topic-specific study resources
- High data costs and unreliable connectivity
- Fragmented tools (university LMS + WhatsApp groups + generic AI + separate resource sites)
- Limited awareness of opportunities (though NSFAS covers the majority of funding needs)

Existing tools are either too generic (ChatGPT, Notion, Google tools, NotebookLM) or too fragmented. Nothing brings planning, smart resources, and practical offline support together in a way designed for local realities.

**Key refined insight:** Bursary/opportunity discovery is secondary for most students. The highest-frequency daily pain is academic performance and workflow friction under constrained conditions.

---

## 3. Solution Overview

**Varsity Companion** is a mobile-first platform that acts as a personal academic assistant for university students.

### Core Value Proposition
One focused tool that reduces academic friction through:
- Course-personalised AI summaries of lectures, readings and assignments
- Intelligent materials search (YouTube, journals, other online sources)
- Local auto-save of work from any selected window/device
- Future layers: progress insights, limited opportunity matching, forums/group chats

Designed specifically for South African conditions: low-data usage, offline-friendly features, and practical understanding of NSFAS and student life pressures.

### Target Users
- Primary: Undergraduate and postgraduate students at SA universities and universities of technology
- Beachhead: Information Science, IT, and related fields (start narrow)
- Expansion: Broader faculties once product-market fit is proven in the beachhead

---

## 4. Product Scope

### MVP (Minimum Viable Product)
See the dedicated document: `Varsity_Companion_MVP.md` for the full prioritised checklist, definition of done, and validation criteria.

**Core MVP loop:**  
Student selects modules → gets useful course-aware summary + relevant materials → content is reliably saved locally.

### Post-MVP / V1.5+
- Forums and group chats (capped at ~50 members)
- Personal (non-toxic) progress insights
- Limited opportunity matching (bursaries, internships, competitions) — secondary priority
- WhatsApp integration potential
- Institutional / university partnership features

**Hard rule:** Do not expand into social or opportunity features until the academic core (summaries + search + local save) shows strong weekly retention in the beachhead.

---

## 5. Technical & Cost Considerations

### AI API Cost Management (Critical)
Uncontrolled LLM usage will destroy unit economics. Design for efficiency from day one.

**Recommended approach:**
1. Default to cheap, capable models (GPT-4o-mini class, Gemini Flash, DeepSeek, or equivalent).
2. Aggressive caching (prompt caching, semantic/result caching, pre-generation for popular modules).
3. Strict free-tier usage caps with clear remaining-credits UI.
4. Token reduction tactics (short system prompts, structured concise output, input truncation).
5. Continuous monitoring of cost per active user.
6. Hybrid design: local auto-save needs zero AI; materials search leans on retrieval first.

**Target:** Keep AI cost per active student very low (ideally well under R1–R5 per month even with reasonable usage).

### Offline / Local-First Design
- Local auto-save is a core differentiator.
- Minimise cloud dependency for core workflow.
- Design for intermittent connectivity and data sensitivity.

### IP & Code Protection
- All code and IP must belong to the company.
- Written IP Assignment (pre- and post-incorporation) is mandatory before any co-founder or contractor access.
- Private repositories, least-privilege access, branch protection.
- Strong co-founder agreement with vesting, IP assignment, and confidentiality clauses.

---

## 6. Go-to-Market & Distribution (Zero / Near-Zero Budget)

Avoid high-energy marketing. Lean on product-led growth.

### Beachhead Strategy
1. Choose 1–2 high-enrolment modules/faculties in IT / Information Science at 1–2 universities.
2. Ship narrow MVP focused only on those modules.
3. Get real students using it weekly.
4. Measure retention and summary quality before expanding.

### Acquisition Channels
- Product-led: Make the tool so useful that students share it in class WhatsApp groups.
- Simple shareable / deep links that pre-select a module.
- Organic student ambassadors (free premium limits in exchange for feedback and light sharing).
- Clean landing page + waitlist only.
- Avoid content marketing, videos, and heavy networking early on.

---

## 7. Business Model

**Primary (near-term):** Freemium
- Free: Core summaries (capped), materials search, local save, basic tracking
- Premium: Higher AI limits, advanced features, unlimited history, early access to later tools

**Secondary (later):**
- Institutional / university licensing or white-label
- Carefully selected partnership revenue

**Pricing sensitivity:** NSFAS students have limited disposable income. Focus first on usage and retention; monetisation follows proven value.

---

## 8. Team & Co-Founder Strategy

**Current strength:** Technical execution and product vision.  
**Current gap:** People skills, marketing, distribution, fundraising energy.

**Ideal co-founder profile**
- Strong commercial / growth / community orientation
- Experience with or deep empathy for SA student life
- Comfortable owning outreach and storytelling
- Full-time (or clear path to it)

**Equity guidance (protective of majority ownership)**
- Strong early business co-founder: 20–30% with 4-year vesting and 1-year cliff
- Keep founder majority (70–80% pre-option pool)
- All equity must vest; written IP assignment is non-negotiable

**Alternative path:** Bootstrap further with freelancers/advisors while retaining full ownership, then hire after traction.

---

## 9. Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| AI costs spiral | Cheap models + caching + free-tier caps + monitoring |
| Summary quality fails to impress | Start narrow (specific modules), gather real feedback fast, iterate prompts aggressively |
| Students already use free generic AI | Compete on course personalisation + local workflow + SA-specific convenience |
| Distribution difficulty | Product-led growth + beachhead focus + organic sharing |
| Monetisation hard | Validate usage first; keep costs extremely low |
| Co-founder / IP issues | Strong written agreements + vesting + IP assignment before access |
| Feature creep | Strict MVP focus; social features only after core retention is proven |

---

## 10. Validation Roadmap (Next 3–6 Months)

### Phase 1 — Foundation
- Finalise MVP feature list and technical architecture
- Set up cost monitoring and model routing
- Create simple landing page + waitlist
- Prepare IP assignment and basic company structure

### Phase 2 — Build & Private Beta
- Ship MVP for 1–2 target modules
- Recruit 50–200 students from beachhead faculties
- Measure: activation, weekly retention, summary quality feedback, cost per user
- Iterate hard on summary usefulness and local-save reliability

### Phase 3 — Traction Decision Point
- If retention and feedback are strong → expand modules, consider co-founder or growth hire, prepare limited paid tier
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

1. Lock MVP scope (see dedicated MVP document).
2. Choose initial beachhead modules/faculties.
3. Implement cost controls and monitoring before any significant student traffic.
4. Draft / obtain IP assignment and basic co-founder agreement templates.
5. Build the narrowest possible working version and put it in front of real students as soon as possible.

---

## Related Documents
- `Varsity_Companion_MVP.md` — Detailed prioritised MVP feature checklist, definition of done, and validation criteria

---

*This is a living plan. Update it as validation data arrives. The goal is rapid learning with controlled risk.*
