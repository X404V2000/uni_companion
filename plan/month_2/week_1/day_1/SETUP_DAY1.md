### **Month 2, Week 1, Day 1 Implementation Blueprint — AI Summary Engine Architecture & Cost Control Layer**

**To:** Lead Developer  
**From:** Senior Systems Design & Architecture Engineer  
**Date:** 12 September 2026  
**Focus:** AI Summary Pipeline, Model Provider Integration, Free-Tier Rate Limiting & Prompt/Result Caching Architecture  
**Status:** **Month 2, Day 1 Active**

### **1\. Architectural Strategy & Non-Negotiable Unit Economics**

Per our product strategy and MVP specifications, **AI Course-Aware Summaries** constitute the core daily value proposition for South African tertiary students. However, unconstrained LLM API usage can quickly degrade unit economics.  
Our target operational cost is **strictly under R1–R5 (\~$0.05–$0.25 USD) per active student per month**. To guarantee this boundary under peak load, Day 1 constructs the **AI Gateway Core & Cost Safeguard Layer** before any LLM execution occurs.

┌────────────────────────────────────────────────────────────────────────┐  
│               Client Request: POST /api/v1/ai/summarize               │  
└───────────────────────────────────┬────────────────────────────────────┘  
                                    │  
                                    ▼  
┌────────────────────────────────────────────────────────────────────────┐  
│             Rate Limiting & Daily Quota Guard (Slowapi \+ DB)           │  
│  \- Check User Free-Tier Credits (Max 10 summaries / day)               │  
│  \- Reject with HTTP 429 if quota exhausted                             │  
└───────────────────────────────────┬────────────────────────────────────┘  
                                    │ Pass  
                                    ▼  
┌────────────────────────────────────────────────────────────────────────┐  
│                     Semantic & Hash Result Cache                       │  
│  \- Calculate SHA-256 hash of (module\_code \+ sanitized\_input\_text)       │  
│  \- If match exists in \`ai\_summary\_caches\` table, return immediately    │  
│    (Cost: $0.00, Execution Time: \<20ms)                               │  
└───────────────────────────────────┬────────────────────────────────────┘  
                                    │ Cache Miss  
                                    ▼  
┌────────────────────────────────────────────────────────────────────────┐  
│                     Model Router (Gemini Flash Primary)                │  
│  \- System Prompt: Concise Markdown bullet points (max 8 points)        │  
│  \- Truncate input payload (Max 8,000 tokens / \~32,000 chars)           │  
│  \- Execute API call & measure token consumption                        │  
└───────────────────────────────────┬────────────────────────────────────┘  
                                    │ Output Generated  
                                    ▼  
┌────────────────────────────────────────────────────────────────────────┐  
│                     Store in Cache & Deduct Credit                     │  
│  \- Persist output in \`ai\_summary\_caches\`                               │  
│  \- Deduct 1 credit from user daily ledger                              │  
│  \- Return JSON response with summary and remaining credit count        │  
└────────────────────────────────────────────────────────────────────────┘

#### **Cost Control Safeguards:**

> 1. **Primary Provider:** Default to **Gemini 1.5 Flash** (or GPT-4o-mini equivalent) targeting an execution cost of **\~$0.001 to $0.003** per summary call.  
> 2. **Deterministic SHA-256 Result Caching:** Standardize inputs per course module. Repeated requests for identical lecture notes or assignment prompts bypass the LLM completely ($0 cost).  
> 3. **Daily Free Quota Enforcement:** Hard cap of 10 free summaries per day per authenticated user.  
> 4. **Input Truncation:** Bound incoming text to a maximum of 32,000 characters (approx. 8,000 tokens) to prevent memory and token abuse.

### **2\. Database Schema Design (Alembic Migration 0004\)**

We introduce two new tables: user\_ai\_quotas (for credit tracking) and ai\_summary\_caches (for result caching).

#### **Schema Definitions (app/models/ai.py)**

Python  
import uuid  
from datetime import datetime, date  
from sqlalchemy import String, Text, Integer, Date, DateTime, ForeignKey, Index, func  
from sqlalchemy.orm import Mapped, mapped\_column, relationship  
from app.db.session import Base

class UserAIQuota(Base):  
    \_\_tablename\_\_ \= "user\_ai\_quotas"

    id: Mapped\[uuid.UUID\] \= mapped\_column(primary\_key=True, default=uuid.uuid4)  
    user\_id: Mapped\[uuid.UUID\] \= mapped\_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)  
    usage\_date: Mapped\[date\] \= mapped\_column(Date, nullable=False, default=date.today)  
    summaries\_used: Mapped\[int\] \= mapped\_column(Integer, nullable=False, default=0)  
    daily\_limit: Mapped\[int\] \= mapped\_column(Integer, nullable=False, default=10)  
    created\_at: Mapped\[datetime\] \= mapped\_column(DateTime(timezone=True), server\_default=func.now())  
    updated\_at: Mapped\[datetime\] \= mapped\_column(DateTime(timezone=True), server\_default=func.now(), onupdate=func.now())

    \_\_table\_args\_\_ \= (  
        Index("ix\_user\_quota\_date", "user\_id", "usage\_date", unique=True),  
    )

class AISummaryCache(Base):  
    \_\_tablename\_\_ \= "ai\_summary\_caches"

    id: Mapped\[uuid.UUID\] \= mapped\_column(primary\_key=True, default=uuid.uuid4)  
    content\_hash: Mapped\[str\] \= mapped\_column(String(64), nullable=False, unique=True, index=True)  
    module\_code: Mapped\[str\] \= mapped\_column(String(20), nullable=False, index=True)  
    summary\_text: Mapped\[str\] \= mapped\_column(Text, nullable=False)  
    tokens\_used: Mapped\[int\] \= mapped\_column(Integer, nullable=False, default=0)  
    created\_at: Mapped\[datetime\] \= mapped\_column(DateTime(timezone=True), server\_default=func.now())

### **3\. File Implementation Map**

| File Path | Action | Description |
| :---- | :---- | :---- |
| app/models/ai.py | **NEW** | Database models for AI user quota tracking and SHA-256 summary caching. |
| app/schemas/ai.py | **NEW** | Pydantic validation schemas for incoming summary requests and response envelopes. |
| app/services/ai\_service.py | **NEW** | Service layer encapsulating model invocation, hashing logic, and quota management. |
| app/api/v1/ai.py | **NEW** | FastAPI router exposing POST /api/v1/ai/summarize and GET /api/v1/ai/quota. |
| alembic/versions/0004\_ai\_engine\_tables.py | **NEW** | Alembic migration file creating user\_ai\_quotas and ai\_summary\_caches. |
| tests/test\_ai\_summary\_api.py | **NEW** | Integration and security tests for AI summary execution, caching, and rate limiting. |

### **4\. Step-by-Step Developer Implementation Guide**

#### **Step 1: Pydantic Schemas (app/schemas/ai.py)**

Python  
import uuid  
from pydantic import BaseModel, Field, field\_validator  
from app.core.sanitizer import sanitize\_string

class AISummaryRequest(BaseModel):  
    module\_code: str \= Field(..., min\_length=2, max\_length=20, example="COS132")  
    content: str \= Field(..., min\_length=50, max\_length=32000, description="Raw study notes or lecture text")

    @field\_validator("module\_code")  
    @classmethod  
    def normalize\_module(cls, v: str) \-\> str:  
        return v.strip().upper()

    @field\_validator("content")  
    @classmethod  
    def sanitize\_content(cls, v: str) \-\> str:  
        sanitized \= sanitize\_string(v)  
        if not sanitized:  
            raise ValueError("Invalid characters detected in summary input text")  
        return sanitized

class AISummaryResponse(BaseModel):  
    summary: str  
    cached: bool  
    remaining\_credits: int  
    daily\_limit: int

class UserQuotaResponse(BaseModel):  
    usage\_date: str  
    summaries\_used: int  
    daily\_limit: int  
    remaining\_credits: int

#### **Step 2: AI Service & Model Provider Engine (app/services/ai\_service.py)**

Python  
import hashlib  
import uuid  
from datetime import date  
from sqlalchemy.orm import Session  
from fastapi import HTTPException, status  
from app.models.ai import UserAIQuota, AISummaryCache

class QuotaExceededError(Exception):  
    pass

def generate\_content\_hash(module\_code: str, content: str) \-\> str:  
    """Calculates a unique SHA-256 digest for a module and text payload."""  
    payload \= f"{module\_code.upper()}:{content.strip()}"  
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()

def check\_and\_increment\_quota(db: Session, user\_id: uuid.UUID) \-\> UserAIQuota:  
    """Ensures user has not exceeded daily free limits and updates usage ledger."""  
    today \= date.today()  
    quota \= db.query(UserAIQuota).filter(  
        UserAIQuota.user\_id \== user\_id,  
        UserAIQuota.usage\_date \== today  
    ).first()

    if not quota:  
        quota \= UserAIQuota(user\_id=user\_id, usage\_date=today, summaries\_used=0, daily\_limit=10)  
        db.add(quota)  
        db.flush()

    if quota.summaries\_used \>= quota.daily\_limit:  
        raise QuotaExceededError("Daily free summary limit reached (10/10). Upgrade or try again tomorrow.")

    quota.summaries\_used \+= 1  
    db.commit()  
    return quota

def get\_or\_create\_summary(db: Session, user\_id: uuid.UUID, module\_code: str, content: str) \-\> dict:  
    """Core pipeline: Check cache \-\> Verify quota \-\> Invoke Model Provider \-\> Return Response."""  
    content\_hash \= generate\_content\_hash(module\_code, content)  
      
    \# 1\. Check Result Cache  
    cached\_entry \= db.query(AISummaryCache).filter(AISummaryCache.content\_hash \== content\_hash).first()  
      
    if cached\_entry:  
        \# Cache hit: Fetch current quota without incrementing usage  
        quota \= db.query(UserAIQuota).filter(  
            UserAIQuota.user\_id \== user\_id,  
            UserAIQuota.usage\_date \== date.today()  
        ).first()  
        used \= quota.summaries\_used if quota else 0  
        limit \= quota.daily\_limit if quota else 10  
          
        return {  
            "summary": cached\_entry.summary\_text,  
            "cached": True,  
            "remaining\_credits": max(0, limit \- used),  
            "daily\_limit": limit,  
        }

    \# 2\. Check & Increment User Quota on Cache Miss  
    quota \= check\_and\_increment\_quota(db, user\_id)

    \# 3\. Model Generation (Stubbed for LLM integration / Gemini Flash API call)  
    \# Target prompt format: Concise Markdown bullet points, max 8 key insights.  
    generated\_summary \= (  
        f"\#\#\# Key Study Concepts ({module\_code.upper()})\\n\\n"  
        f"\* \*\*Core Concept:\*\* Summary derived from input text.\\n"  
        f"\* \*\*Key Takeaway:\*\* Structured bullet points generated for quick review.\\n"  
        f"\* \*\*Exam Focus:\*\* Important terms and definitions highlighted."  
    )

    \# 4\. Save to Cache Table  
    cache\_record \= AISummaryCache(  
        content\_hash=content\_hash,  
        module\_code=module\_code.upper(),  
        summary\_text=generated\_summary,  
        tokens\_used=150  
    )  
    db.add(cache\_record)  
    db.commit()

    return {  
        "summary": generated\_summary,  
        "cached": False,  
        "remaining\_credits": quota.daily\_limit \- quota.summaries\_used,  
        "daily\_limit": quota.daily\_limit,  
    }

#### **Step 3: Fast API Router Wiring (app/api/v1/ai.py)**

Python  
from fastapi import APIRouter, Depends, status, HTTPException  
from sqlalchemy.orm import Session  
from app.db.session import get\_db  
from app.api.deps import get\_current\_user  
from app.models.user import User  
from app.schemas.ai import AISummaryRequest, AISummaryResponse, UserQuotaResponse  
from app.services import ai\_service

router \= APIRouter(prefix="/ai", tags=\["AI Engine"\])

@router.post("/summarize", response\_model=AISummaryResponse, status\_code=status.HTTP\_200\_OK)  
def request\_ai\_summary(  
    payload: AISummaryRequest,  
    db: Session \= Depends(get\_db),  
    current\_user: User \= Depends(get\_current\_user),  
):  
    """Generates or retrieves a course-aware AI summary with strict daily quota enforcement."""  
    try:  
        return ai\_service.get\_or\_create\_summary(  
            db=db,  
            user\_id=current\_user.id,  
            module\_code=payload.module\_code,  
            content=payload.content,  
        )  
    except ai\_service.QuotaExceededError as e:  
        raise HTTPException(status\_code=status.HTTP\_429\_TOO\_MANY\_REQUESTS, detail=str(e))

### **5\. Verification & Acceptance Criteria**

> 1. **Daily Quota Enforcement:** Reaching 10 summary generations in a single UTC day returns HTTP 429 Too Many Requests with a clear message.  
> 2. **SHA-256 Cache Hit Efficiency:** Submitting identical text for the same module twice returns cached: true instantaneously without deducting a second daily credit.  
> 3. **Bounded Input Validation:** Submitting text over 32,000 characters or under 50 characters returns HTTP 422 Unprocessable Entity.  
> 4. **Tenant Isolation:** Quotas are strictly scoped per authenticated user\_id.  
> 5. **Zero Test Regressions:** Run pytest to ensure all existing **152 tests** pass cleanly alongside the new AI Engine test suite.