# **Week 1 Engineering Guide & Technical Assessment**

**Project:** Varsity Companion API  
**Target Window:** 4-Month MVP Launch  
**Document Type:** Technical Execution Plan & Code Review Guidelines

## **1\. Executive Summary & Verification Audit**

Week 1 delivered the complete core identity, onboarding, state management, and logging infrastructure across five days of development. The implementation passed 62 automated unit and endpoint security tests alongside 41 live verification checks on the active Neon Postgres instance (varsityCompanion\_Db).

Client → Cloudflare (Free Tier) → FastAPI Middleware → Security/Auth Layer → Neon Postgres

### **Verified Deliverables Checklist**

> * **Mon (Foundation):** FastAPI project directory skeleton, .env loading, and SQLAlchemy engine setup connecting to Neon Postgres.  
> * **Tue (User Data Model):** User ORM models, Pydantic validation schemas, and initial POPIA legal consent tracking (terms\_version, privacy\_version, accepted\_at).  
> * **Wed (Signup Core):** POST /api/v1/auth/signup with bcrypt password hashing (work factor 12), input sanitization against XSS, rate limiting via slowapi, and strict payload size constraints (10 KB max).  
> * **Thu (Login & Auth Session):** POST /api/v1/auth/login issuing short-lived (15–30 min) HS256 JWTs stored in HttpOnly, SameSite=Lax cookies, GET /api/v1/auth/me route protection, timing-attack mitigation using DUMMY\_HASH, and POST /api/v1/auth/logout cookie invalidation.  
> * **Fri (Logging & POPIA Baseline):** Structured JSON Lines logging with correlation ID propagation, PII credential redaction, and DELETE /api/v1/auth/account soft-delete baseline (is\_active=False, deleted\_at=now(), password hash scrubbed).

## **2\. Technical Architecture & File Reference Map**

app/  
├── api/  
│   ├── deps.py                  \# get\_current\_user dependency (Cookie & Bearer extraction)  
│   └── v1/  
│       └── auth.py              \# /signup, /login, /me, /logout, /account endpoints  
├── core/  
│   ├── config.py                \# Environment configurations (JWT secrets, environment flags)  
│   ├── logging\_config.py        \# Correlation ID contextvar & JSON redacting formatter  
│   ├── rate\_limiter.py          \# Centralized slowapi Limiter instance  
│   ├── sanitizer.py            \# String & HTML XSS cleaning utilities  
│   └── security.py             \# bcrypt hashing, DUMMY\_HASH, HS256 JWT sign/verify  
├── db/  
│   └── session.py               \# SQLAlchemy SessionLocal & DB dependency  
├── models/  
│   └── user.py                  \# User SQLAlchemy ORM model (includes deleted\_at)  
├── schemas/  
│   ├── auth.py                  \# LoginRequest, TokenResponse, AccountDeleteRequest  
│   └── user.py                  \# UserCreate, UserResponse, Pydantic field validators  
└── main.py                      \# Middleware pipeline (Size guard, Security Headers, CORS, Logging)

## **3\. Key Technical Decisions & Security Enforcements**

### **Account Deletion Model (POPIA Baseline)**

Week 1 implements a **soft-delete tombstone** strategy:

> * **Endpoint:** DELETE /api/v1/auth/account.  
> * **Security Control:** Requires active JWT authentication AND current password re-verification.  
> * **Database Side Effects:** Sets is\_active \= False, populates deleted\_at \= datetime.now(timezone.utc), overwrites hashed\_password with DUMMY\_HASH to prevent credential retention, and clears authentication cookies.  
> * **Rationale:** Immediate hard deletion wipes database rows necessary for ongoing security audit logs and fraud prevention. True physical erasure of residual PII (email, full\_name) is scheduled for an automated background hard-purge worker in Month 2\.

### **Structured Logging & Sensitive Data Redaction**

Logging is standardized across the application via app/core/logging\_config.py:

> * **Correlation Tracing:** Honors inbound X-Correlation-ID or generates a standard uuid4() stored in a Python contextvars.ContextVar. Echoes back in the response header.  
> * **Redaction Policy:** Strips sensitive key-value patterns (such as password, access\_token, authorization, cookie, jwt\_secret\_key) and replaces them with \[REDACTED\].  
> * **Error Hygiene:** Unhandled exception handlers log only type(exc).\_\_name\_\_ and the correlation ID to prevent bound database parameters or raw stack traces from leaking into log stores.

## **4\. Technical Debt & Refactoring Strategy for Week 2 Kickoff**

While Week 1 functional requirements are complete, three architectural risks must be addressed before introducing new domain models:

### **1\. Alembic Database Migration Setup**

> * **Current Issue:** Tables and structural alterations currently rely on SQLAlchemy Base.metadata.create\_all() and inline application lifespan execution (ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted\_at TIMESTAMPTZ NULL;).  
> * **Required Action:** Initialize Alembic and generate a baseline script (0001\_initial\_user\_schema.py). Remove manual ALTER TABLE execution from application startup handlers.

### **2\. Service Layer Decoupling**

> * **Current Issue:** Route handlers inside app/api/v1/auth.py handle database queries, password hashing calls, and token generation directly.  
> * **Required Action:** Refactor database operations into app/services/user\_service.py. FastAPI endpoints must only handle schema serialization, rate limiting, and status responses.

### **3\. Distributed Infrastructure Readiness**

> * **Current Issue:** Rate limiting (slowapi) and structured logging utilize single-instance in-memory counters and local disk files (logs/app.log).  
> * **Required Action:** Ensure configuration supports Redis-backed rate limiting and stdout streaming to maintain compatibility when scaling across multiple horizontal container instances.

## **5\. Summary Verification Status**

| Component | Status | Verification Detail |
| :---- | :---- | :---- |
| **User Schema & POPIA Consent** | **PASS** | Validates legal version strings & normalized emails. |
| **Signup Endpoint** | **PASS** | 201 Created with password hashing & XSS sanitization. |
| **Login & JWT** | **PASS** | HttpOnly cookie auth & timing-safe DUMMY\_HASH check. |
| **Route Protection (/me)** | **PASS** | Rejects invalid, tampered, expired, or inactive tokens. |
| **Account Soft Delete** | **PASS** | Credential scrubbed; inactive user rejected across endpoints. |
| **Structured Logging** | **PASS** | Correlation IDs attached; sensitive fields masked. |

