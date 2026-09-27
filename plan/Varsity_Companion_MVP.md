# Varsity Companion — MVP Specification

**Last updated:** 11 September 2026  
**Status:** Ready for build  
**Goal:** Ship the narrowest product that proves the core loop works for a specific beachhead, with zero or near-zero budget.

---

## 1. MVP Objective

Prove that South African university students in a narrow beachhead will return weekly to a tool that delivers:
1. Course-aware AI summaries
2. Relevant materials search
3. Reliable local auto-save

Everything else is deferred.

**Core loop to validate:**  
Select modules → Get useful course-aware summary + relevant materials → Content is reliably saved locally.

---

## 2. Beachhead

- Faculty / fields: Information Science, IT, and closely related modules
- 1–2 high-enrolment modules at 1–2 universities
- Start extremely narrow so personalisation and materials quality can be made excellent

---

## 3. Prioritised Feature Checklist

### Must-Have (Ship these or it is not an MVP)

| # | Feature | Description | Rationale |
|---|---------|-------------|-----------|
| 1 | Course / module personalisation | Student selects faculty + specific modules once. All outputs adapt to those modules. | Primary differentiator vs generic AI tools |
| 2 | AI course-aware summaries | Structured, deeper summary points from lecture notes, PDFs, or assignment text, tuned to the selected modules | Highest daily value feature |
| 3 | Local auto-save from selected window | Student selects any window/application → content auto-saves to a local folder on the device | Core offline / low-data differentiator |
| 4 | Internal materials search | Search that returns ranked YouTube links, open journals, and other resources filtered by the student’s modules. Pre-seed high-value sources for beachhead modules. | High practical utility |
| 5 | Basic account + module selection flow | Simple sign-up/login + one-time module selection | Foundation for personalisation and tracking |
| 6 | Strict free-tier AI usage caps + remaining credits UI | Daily or weekly limits on AI summaries with clear remaining-credits display | Essential for cost control |
| 7 | Low-data / offline-friendly design basics | Text-first UI, aggressive caching of recent summaries and search results, minimal background data use | Required for SA conditions |

### Should-Have (Only if Must-Haves are solid and capacity remains)

| # | Feature | Notes |
|---|---------|-------|
| 8 | Simple deadline / assignment list with basic prioritisation | Light support for retention during the academic cycle |
| 9 | Private progress snapshot | Simple personal view (“on track / behind”). No public rankings |
| 10 | Shareable / deep link that pre-selects a module | Makes organic sharing into class WhatsApp groups frictionless |

### Explicitly Out of Scope for MVP

- Forums or group chats (even limited size)
- Bursary / opportunity matching
- WhatsApp bot integration
- Advanced analytics or institutional dashboards
- Multi-university support beyond the chosen beachhead
- Video generation or marketing features
- Any social or competitive ranking features

---

## 4. Definition of Done (MVP is Ready for Student Testing)

- [ ] Student can create an account and select beachhead modules
- [ ] Student can input or select content and receive a useful, structured, course-aware summary
- [ ] Materials search returns relevant results for the selected modules
- [ ] Local auto-save works reliably from a selected window to a local folder
- [ ] Free-tier AI usage is capped and remaining credits are clearly shown
- [ ] Core experience is usable on typical student devices with constrained data
- [ ] Basic cost monitoring is in place (cost per summary / per active user)
- [ ] Simple way exists for a student to share access or a module-preselected link

---

## 5. Validation Criteria (When is the MVP “Working”?)

The MVP is considered successful enough to expand if:

- Students from the beachhead modules complete the core loop without major friction
- There is measurable weekly return usage during term time
- Qualitative feedback indicates the summaries and materials feel more relevant than generic tools (ChatGPT, NotebookLM, etc.)
- AI cost per active user stays low and predictable
- At least some organic sharing occurs (e.g. students dropping the link into class WhatsApp groups)

---

## 6. Recommended Build Order

1. Account basics + module selection
2. Local auto-save (prove the offline differentiator early)
3. AI summary engine tuned to beachhead modules + cost controls and caching
4. Materials search with pre-seeded sources for those modules
5. Polish the core loop
6. Add light Should-Have items only if retention signals appear

---

## 7. Technical Constraints for MVP

- Default to cheapest capable models
- Heavy use of caching and prompt engineering
- Local-first where possible (especially auto-save)
- Strict usage limits from day one
- Monitor cost per user continuously

---

## 8. Success Metrics to Track from First Users

- Activation rate (completed core loop)
- Weekly active users / retention
- Summaries generated per active user
- Qualitative usefulness feedback
- AI cost per active user
- Organic share / referral signals

---

## 9. What Happens After MVP Validation

**If retention and feedback are strong:**
- Expand to additional modules within the same faculties
- Consider limited paid tier for higher AI limits
- Revisit co-founder or growth support
- Only then consider forums or opportunity features

**If weak:**
- Diagnose root cause (summary quality? materials relevance? distribution? wrong beachhead?)
- Iterate narrowly or pivot

---

## Related Documents
- `Varsity_Companion_Full_Project_Plan.md` — Overall vision, strategy, risks, GTM, and longer-term roadmap

---

*Keep this document ruthlessly focused. The fastest path to a successful product is shipping the Must-Haves, learning from real students, and only then expanding.*
