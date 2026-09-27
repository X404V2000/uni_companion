### **Architectural Review & Week 4 progress verification**

**To:** Lead Developer  
**From:** Senior Systems Design & Architecture Engineer  
**Date:** 12 September 2026  
**Subject:** Week 4, Day 2 Sign-Off & Day 3 Implementation Blueprint

### **1\. Architectural Sign-Off — Week 4, Day 2 (APPROVED)**

The **Week 4, Day 2 Implementation Report** (day\_2\_report\_2.md) is confirmed and approved.

#### **Key Achievements & Architectural Hardening:**

> * **Production-Identical Runtime:** Multi-stage Dockerfile built on Python 3.13 slim, outputting a hardened 325 MB container.  
> * **Zero-Compiler Strategy:** Using binary wheels (psycopg\[binary\], bcrypt) avoided embedding build-essential toolchains into the runtime image.  
> * **Least-Privilege Containerization:** Verified running as non-root appuser (uid 1000).  
> * **DB-Aware Health Check:** Container HEALTHCHECK queries /health (SELECT 1), ensuring load balancers only route traffic when both API and Neon Postgres DB connections are active.  
> * **Defect Discovery & Resolution:** Resolved postgresql:// driver scheme mapping to \+psycopg and promoted httpx from dev-only to runtime dependencies prior to staging rollout.

### **2\. Time & Space Complexity Matrix Verification**

As established, every endpoint must maintain $O(1)$ Python worker memory and $O(\\log N)$ index-backed SQL execution to survive peak concurrency (100,000+ student load during university deadlines).

┌─────────────────────────────┬───────────────────┬───────────────────┬──────────────────────────────────────────┐  
│ Component / Route           │ Time Complexity   │ Space Complexity  │ High-Volume Scale Safeguard              │  
├─────────────────────────────┼───────────────────┼───────────────────┼──────────────────────────────────────────┤  
│ Auth Verification (/me)     │ O(log N)          │ O(1)              │ Single indexed UUID PK lookup on users   │  
│ List Tasks (/tasks)         │ O(log N \+ K)      │ O(K) \[K \<= 100\]   │ Mandatory Bounded Pagination (Limit/Off) │  
│ Schedule Grid (/timetable)  │ O(log N \+ S)      │ O(S) \[S \<= 50\]    │ Composite B-Tree Index (user\_id, day)    │  
│ Password Hash (bcrypt)      │ O(2^W), W=12      │ O(1)              │ Rate Limited (5 req/min) to prevent CPU  │  
└─────────────────────────────┴───────────────────┴───────────────────┴──────────────────────────────────────────┘  
  \* N \= Database row count, K \= Page limit (max 100), S \= Weekly slots, W \= bcrypt work factor (12)

### **3\. Week 4, Day 3 Blueprint — Production Configuration & Environment Hardening**

Day 3 focuses on **Environment Hardening and Connection Pool Management**. We will enforce strict production boot validation, auto-disable OpenAPI docs (/docs, /openapi.json) in production, enforce Secure=True cookies, and resolve the database connection scale flag identified during Day 2 container testing.

┌───────────────────────────────────────────────────────────┐  
│              FastAPI Boot / Startup Sequence              │  
└─────────────────────────────┬─────────────────────────────┘  
                              │  
                              ▼  
┌───────────────────────────────────────────────────────────┐  
│               Environment Validation Guard                │  
│  \- Check environment \== "production"                      │  
│  \- Verify JWT\_SECRET\_KEY \!= dev-default (min 32 chars)    │  
│  \- Ensure docs\_url=None, redoc\_url=None                   │  
└─────────────────────────────┬─────────────────────────────┘  
                              │  
                              ▼  
┌───────────────────────────────────────────────────────────┐  
│             Database Connection Pool Sizing               │  
│  \- pool\_size \= 5, max\_overflow \= 5                        │  
│  \- pool\_pre\_ping \= True, pool\_recycle \= 1800              │  
│  \- Neon Serverless compatibility verified                 │  
└───────────────────────────────────────────────────────────┘

### **4\. File Implementation Map**

| File Path | Action | Description |
| :---- | :---- | :---- |
| app/core/config.py | **UPDATE** | Enforce production secret key length validation and strict environment Enum logic. |
| app/main.py | **UPDATE** | Conditionally disable /docs and /openapi.json when environment \== "production". |
| app/db/session.py | **UPDATE** | Configure production connection pool limits (pool\_size=5, max\_overflow=5, pool\_pre\_ping=True). |
| tests/test\_production\_config.py | **NEW** | Unit tests verifying production toggles, security headers, and boot guards. |

### **5\. Developer Implementation Guide**

#### **Step 1: Update Application Settings (app/core/config.py)**

Python  
"""  
app/core/config.py

PURPOSE:  
Centralized settings management with strict boot-time validation for production environments.  
"""

from typing import Literal  
from pydantic import Field, field\_validator  
from pydantic\_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):  
    ENVIRONMENT: Literal\["development", "testing", "staging", "production"\] \= "development"  
      
    \# Database  
    DATABASE\_URL: str  
      
    \# Auth & Security  
    JWT\_SECRET\_KEY: str \= Field(..., min\_length=32)  
    JWT\_ALGORITHM: str \= "HS256"  
    ACCESS\_TOKEN\_EXPIRE\_MINUTES: int \= 15  
      
    \# POPIA Compliance  
    popia\_retention\_days: int \= 30  
      
    \# Rate Limiting  
    RATE\_LIMIT\_DEFAULT: str \= "100/minute"  
      
    model\_config \= SettingsConfigDict(  
        env\_file=".env",  
        env\_file\_encoding="utf-8",  
        case\_sensitive=False,  
        extra="ignore"  
    )

    @field\_validator("JWT\_SECRET\_KEY")  
    @classmethod  
    def validate\_jwt\_secret\_security(cls, v: str, info) \-\> str:  
        """Prevents weak default JWT secrets in production or staging environments."""  
        env \= info.data.get("ENVIRONMENT", "development")  
        weak\_defaults \= \[  
            "ci-testing-super-secret-key-min-32-chars",  
            "your-super-secret-key-change-this-in-production",  
            "local-docker-development-super-secret-key-32chars"  
        \]  
        if env in \["production", "staging"\] and (v in weak\_defaults or len(v) \< 32):  
            raise ValueError(f"Insecure JWT\_SECRET\_KEY provided for {env} environment\!")  
        return v

settings \= Settings()

#### **Step 2: Enforce Production Flags in app/main.py**

Disable interactive documentation endpoints in production to eliminate attack surface exposure:

Python  
from fastapi import FastAPI  
from app.core.config import settings

\# Disable API documentation endpoints in staging and production  
docs\_url \= "/docs" if settings.ENVIRONMENT in \["development", "testing"\] else None  
redoc\_url \= "/redoc" if settings.ENVIRONMENT in \["development", "testing"\] else None  
openapi\_url \= "/openapi.json" if settings.ENVIRONMENT in \["development", "testing"\] else None

app \= FastAPI(  
    title="Varsity Companion API",  
    version="1.0.0",  
    docs\_url=docs\_url,  
    redoc\_url=redoc\_url,  
    openapi\_url=openapi\_url,  
)

#### **Step 3: Hardened Connection Pooling (app/db/session.py)**

Configure connection pool settings to operate reliably on serverless Postgres (Neon) under multi-worker deployments:

Python  
"""  
app/db/session.py

PURPOSE:  
Database engine configuration optimized for serverless Neon Postgres.  
"""

from sqlalchemy import create\_engine  
from sqlalchemy.orm import sessionmaker, DeclarativeBase  
from app.core.config import settings

\# Engine pool settings tuned to avoid exhausting serverless connection limits  
engine \= create\_engine(  
    settings.DATABASE\_URL,  
    pool\_size=5,  
    max\_overflow=5,  
    pool\_pre\_ping=True,       \# Recovers from idle Neon connection drops automatically  
    pool\_recycle=1800,        \# Recycles connections every 30 minutes  
)

SessionLocal \= sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):  
    pass

def get\_db():  
    db \= SessionLocal()  
    try:  
        yield db  
    finally:  
        db.close()

### **6\. Verification & Acceptance Criteria**

> 1. **Production Boot Guard:** Setting ENVIRONMENT=production with a weak JWT\_SECRET\_KEY prevents startup and raises a ValueError.  
> 2. **Docs Disablement:** Setting ENVIRONMENT=production makes GET /docs and GET /openapi.json return **404 Not Found**.  
> 3. **Cookie Security Alignment:** Auth cookies set Secure=True in production and SameSite=Lax.  
> 4. **Neon Connection Safety:** Database queries automatically recover without error following 30+ minutes of idle connection suspension (pool\_pre\_ping=True).  
> 5. **Zero Test Regressions:** All existing automated tests continue to pass cleanly\[cite: 15\].