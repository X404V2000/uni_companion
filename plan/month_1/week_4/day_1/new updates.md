### **1\. Key Alignment Highlights & Strategic Refinements**

> * **Product Focus Shift (Academic Core over Bursaries):** The updated planning documents explicitly pivot the primary value proposition to **course-aware AI summaries, materials search, and local auto-save**. Opportunity/bursary discovery is officially secondary because the majority of SA students are NSFAS-funded. This aligns with what we built in Week 3 (Academic Tracker Engine).  
> * **Strict AI Unit Economics:** The documents emphasize keeping AI cost per active student under **R1–R5/month** via cheap models (Gemini Flash / GPT-4o-mini), prompt/result caching, and hard usage limits on free tiers.  
> * **Offline-First & Data Sensitivity:** The local auto-save and low-data text modes match our backend query design (small paginated JSON payloads).

### **2\. Updated MVP Feature Status Matrix**

| MVP Feature Requirement (from Varsity\_Companion\_MVP.md) MD | Backend Architecture Status |
| :---- | :---- |
| **Course / Module Personalization**  | **DONE** — Module model, schema validation, and tenant isolation delivered in Week 3\. |
| **Account & Profile Baseline**  | **DONE** — Signup, HttpOnly JWT Auth, RBAC, and POPIA consent handling delivered in Weeks 1–2. |
| **Local Auto-Save & Offline Basics**  | **READY** — Bounded pagination (page, size) and structured JSON payloads designed for low-data sync. |
| **AI Course Summaries & Cost Controls**  | ⏳ **UPCOMING (Month 2\)** — Backend endpoints for LLM summary generation \+ free-tier usage capping. |
| **Materials Search Engine**  | ⏳ **UPCOMING (Month 2\)** — Curation API wrappers for YouTube & academic resources. |

### **3\. Week 4 Implementation Plan: CI/CD & Operational Readiness**

To stay on track for our accelerated 3-month MVP launch target, **Month 1, Week 4** will lock down CI/CD automation, containerization, and staging parity.

Week 4 Execution Pipeline:  
\[ Day 1: GitHub Actions CI \] ──► \[ Day 2: Docker Setup \] ──► \[ Day 3: Prod Config \] ──► \[ Day 4: Staging Deploy \] ──► \[ Day 5: Coherence Review \]

### **Week 4, Day 1 Implementation Blueprint — GitHub Actions CI/CD Pipeline**

#### **Technical Objectives**

> 1. **Automate Testing Pipeline:** Trigger pytest automatically on every push or pull request to main or develop.  
> 2. **Database Service Container:** Provision a temporary PostgreSQL 15 container inside the GitHub Actions runner to run migrations (alembic upgrade head) and tests against a real database instance.  
> 3. **Code Quality & Formatting:** Enforce linting checks using ruff.

#### **File Implementation Map**

| File Path | Action | Purpose |
| :---- | :---- | :---- |
| .github/workflows/ci.yml | **NEW** | GitHub Actions CI workflow definition. |
| pyproject.toml | **UPDATE** | Configure ruff linter rules and target Python version (3.11). |

#### **Step-by-Step Developer Implementation Guide**

##### **Step 1: Create .github/workflows/ci.yml**

YAML  
name: Varsity Companion CI Pipeline

on:  
  push:  
    branches: \[ main, develop \]  
  pull\_request:  
    branches: \[ main, develop \]

jobs:  
  test:  
    runs-on: ubuntu-latest

    services:  
      postgres:  
        image: postgres:15-alpine  
        env:  
          POSTGRES\_USER: test\_user  
          POSTGRES\_PASSWORD: test\_password  
          POSTGRES\_DB: varsity\_companion\_ci\_test  
        ports:  
          \- 5432:5432  
        options: \>-  
          \--health-cmd pg\_isready  
          \--health-interval 10s  
          \--health-timeout 5s  
          \--health-retries 5

    env:  
      ENVIRONMENT: testing  
      DATABASE\_URL: postgresql://test\_user:test\_password@localhost:5432/varsity\_companion\_ci\_test  
      TEST\_DATABASE\_URL: postgresql://test\_user:test\_password@localhost:5432/varsity\_companion\_ci\_test  
      JWT\_SECRET\_KEY: ci-testing-super-secret-key-min-32-chars

    steps:  
      \- name: Check out repository  
        uses: actions/checkout@v4

      \- name: Set up Python 3.11  
        uses: actions/setup-python@v5  
        with:  
          python-version: '3.11'  
          cache: 'pip'

      \- name: Install dependencies  
        run: |  
          python \-m pip install \--upgrade pip  
          if \[ \-f requirements.txt \]; then pip install \-r requirements.txt; fi  
          pip install ruff pytest pytest-cov

      \- name: Lint code with Ruff  
        run: |  
          ruff check app/ tests/

      \- name: Run Alembic Migrations  
        run: |  
          alembic upgrade head

      \- name: Run Pytest Test Suite  
        run: |  
          pytest \--verbose

##### **Step 2: Configure pyproject.toml**

Add or update the ruff configuration in your root pyproject.toml:

Ini, TOML  
\[tool.ruff\]  
line-length \= 100  
target-version \= "py311"

\[tool.ruff.lint\]  
select \= \["E", "F", "W", "I"\]  
ignore \= \[\]

\[tool.ruff.lint.isort\]  
known-first-party \= \["app"\]

#### **Acceptance Criteria**

> 1. **Automated Trigger:** Pushing code to main or develop triggers the GitHub Actions workflow.  
> 2. **Migration Execution:** Alembic applies migrations 0001, 0002, and 0003 cleanly to the ephemeral Postgres service container.  
> 3. **Full Test Verification:** All **121 automated tests** pass inside the CI virtual environment.  
> 4. **Code Quality:** ruff check passes without syntax or import errors.