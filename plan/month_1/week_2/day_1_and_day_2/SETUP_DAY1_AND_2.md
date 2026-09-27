Here is the official sign-off on Day 1 & Day 2, along with the decision responses for Day 3\.

Markdown  
\# Architectural Sign-Off (Days 1 & 2\) & Day 3 Planning Specification

\*\*To:\*\* Nhlanhla Mawelele (Lead Developer)    
\*\*From:\*\* Senior Systems Design & Architecture Engineer    
\*\*Date:\*\* 7 September 2026    
\*\*Status:\*\* Days 1 & 2 Approved / Day 3 RBAC Specification Active  

\---

\#\# 1\. Sign-Off on Days 1 & 2

\#\#\# Day 1 (Alembic Baseline) — APPROVED  
\*   \*\*Dev-DDL Retirement:\*\* Startup schema mutations and \`Base.metadata.create\_all()\` removal confirmed\[cite: 12\].  
\*   \*\*Migration Integrity:\*\* The hand-written \`0001\_initial\_user\_schema.py\` and environment stamping strategy (\`alembic stamp 0001\`) are explicitly approved\[cite: 12\]. Hand-written baselines prevent live-DB diffing anomalies against pooled Postgres endpoints\[cite: 12\].

\#\#\# Day 2 (Service Layer Decoupling) — APPROVED  
\*   \*\*Architecture Isolation:\*\* \`UserService\` implementation cleanly decouples database queries, bcrypt hashing, and timing-attack protections from route handlers\[cite: 12\].  
\*   \*\*Domain Error Mapping:\*\* Framework-agnostic exception design (\`DuplicateEmailError\`, \`InvalidCredentialsError\`) is verified\[cite: 12\]. Route handlers remain responsible for HTTP status code translation and cookie handling\[cite: 12\].

\---

\#\# 2\. Day 3 Decisions & Technical Specification (Role-Based Access Control)

\#\#\# Decision 1: Enum Naming & Database Storage Strategy  
\*   \*\*Enum Hierarchy:\*\* Use Python \`enum.Enum\` with string representations: \`STUDENT\`, \`ADMIN\`, \`SUPERUSER\`.  
\*   \*\*Database Mapping:\*\* Implement as a \*\*VARCHAR column with a CHECK constraint\*\* (\`sa.Enum(..., native\_enum=False)\`).  
    \*   \*Architectural Rationale:\* Avoids Postgres native ENUM types on Neon to ensure non-blocking Alembic schema migrations during future role expansions.

\#\#\# Decision 2: Admin Account Bootstrapping  
\*   \*\*Primary Strategy:\*\* CLI Management Command / Seed Script (\`scripts/create\_admin.py\`).  
    \*   \*Implementation:\* Script executes outside the HTTP layer, directly invoking \`UserService\` to instantiate an account with \`role=UserRole.SUPERUSER\`.  
    \*   \*Security Rationale:\* Prevents exposing public or even role-gated admin provisioning endpoints prior to full RBAC rollout.

\#\#\# Decision 3: Route Scope & Schema Exposure  
\*   \*\*\`GET /api/v1/auth/me\`:\*\* Update \`UserResponse\` Pydantic schema to expose the \`role\` field.  
\*   \*\*\`DELETE /api/v1/auth/account\`:\*\* Restrict self-service account deletion to \`STUDENT\` and \`ADMIN\` roles acting on their own account.  
\*   \*\*\`POST /api/v1/admin/purge-deleted-users\` (Friday):\*\* Restrict access strictly to \`ADMIN\` and \`SUPERUSER\`.

\#\#\# Decision 4: Migration Scheme (\`0002\_add\_user\_roles.py\`)  
\*   \*\*Server-Side Default:\*\* Column definition must specify a server-side default (\`server\_default='STUDENT'\`).  
    \*   \*Migration Execution:\* Ensures existing production/staging records backfill cleanly without requiring table rewrites or null-field handling.

\#\#\# Decision 5: Error Response Semantics  
\*   \*\*HTTP 403 Standard:\*\* Enforce \`{"detail": "Operation not permitted"}\` across all failed role checks.  
    \*   \*Security Rationale:\* Prevents role enumeration attacks or leaking system administrative hierarchy.

\---

\#\# 3\. Day 3 Implementation Deliverables Checklist

app/  
├── core/  
│ └── roles.py \# UserRole string Enum definition  
├── api/  
│ └── deps.py \# require\_role(\[allowed\_roles\]) dependency factory  
├── schemas/  
│ └── user.py \# Add role field to UserResponse  
scripts/  
└── create\_admin.py \# Out-of-band CLI tool for initial SUPERUSER creation  
alembic/versions/  
└── 0002\_add\_user\_roles.py \# Migration adding role column with server default

\#\#\# Dependency Factory Pattern (\`app/api/deps.py\`)  
\`\`\`python  
def require\_role(allowed\_roles: list\[UserRole\]):  
    def role\_verifier(current\_user: User \= Depends(get\_current\_user)) \-\> User:  
        if current\_user.role not in allowed\_roles:  
            raise HTTPException(  
                status\_code=status.HTTP\_403\_FORBIDDEN,  
                detail="Operation not permitted"  
            )  
        return current\_user  
    return role\_verifier

## **4\. Next Actions**

Proceed with Day 3 implementation as outlined above. Once complete and verified against the test suite, submit the Day 3 report to move forward to **Day 4 (Email Service Integration)**.