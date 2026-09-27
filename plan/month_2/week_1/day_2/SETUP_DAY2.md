### **Month 2, Week 1, Day 1 Architectural Sign-Off & Day 2 Implementation Blueprint**

**To:** Lead Developer  
**From:** Senior Systems Design & Architecture Engineer  
**Date:** 12 September 2026  
**Status:** **Month 2, Day 1 Approved / Day 2 Specification Active**

### **1\. Sign-Off on Month 2, Week 1, Day 1 (AI Summary Engine & Cost Controls) — APPROVED**

The Day 1 implementation report is confirmed:

> * **Real LLM Integration:** Integrated Google Gemini directly via zero-dependency httpx REST calls using gemini-flash-latest.  
> * **Atomic Compare-and-Swap (CAS) Quotas:** Mitigated race conditions at scale by enforcing daily usage caps via atomic SQL UPDATE ... WHERE summaries\_used \< daily\_limit operations.  
> * **POPIA-Compliant Per-User Caching:** Embedded user\_id into the SHA-256 digest (user\_id \+ module\_code \+ input\_hash), ensuring study notes and summaries never leak across tenant boundaries.  
> * **Failure Refunds & Token Accounting:** Provider outages gracefully refund reserved credits, while output tokens\_used are audited per cache entry for spend monitoring.  
> * **Test Suite Expansion:** Passed all 9 new AI engine integration tests, bringing overall test coverage to **161 passing tests** with zero regressions.

### **2\. Month 2, Week 1, Day 2 Blueprint — Retrieval-First Materials Search Engine**

Day 2 builds the **Materials Search Engine**, giving South African students topic-matched study resources (YouTube tutorial links, open academic journals, and course-aware reference materials) filtered specifically by their registered university modules.  
To satisfy our non-negotiable scale and cost safeguards, this engine is **retrieval-first**: searching resources relies on indexed database queries and external YouTube API wrappers, calling an LLM **only** if query normalization or synthesis is explicitly requested.

┌────────────────────────────────────────────────────────────────────────┐  
│        Client Request: GET /api/v1/materials/search?q=...\&module=...   │  
└───────────────────────────────────┬────────────────────────────────────┘  
                                    │  
                                    ▼  
┌────────────────────────────────────────────────────────────────────────┐  
│                   Input Sanitization & Truncation Guard                │  
│  \- Strip control characters & HTML tags                                │  
│  \- Clamp query string length to max 100 chars                          │  
└───────────────────────────────────┬────────────────────────────────────┘  
                                    │  
                                    ▼  
┌────────────────────────────────────────────────────────────────────────┐  
│                 Module-Scoped Indexed Database Search                  │  
│  \- Query \`study\_materials\` table via GIN/B-Tree Indexes                │  
│  \- Scope strictly by \`module\_code\` and \`is\_approved=True\`              │  
└───────────────────────────────────┬────────────────────────────────────┘  
                                    │  
                                    ▼  
┌────────────────────────────────────────────────────────────────────────┐  
│                 YouTube API Curation Engine (360p Low-Data)             │  
│  \- Append high-value domain flags ("site:youtube.com", 360p mode)      │  
│  \- Cache API result payloads for 7 days to eliminate quota burn        │  
└───────────────────────────────────┬────────────────────────────────────┘  
                                    │  
                                    ▼  
┌────────────────────────────────────────────────────────────────────────┐  
│                Paginated Response Envelope (O(K) Space)                │  
│   { "items": \[...\], "total": X, "page": Y, "size": Z, "low\_data": true }│  
└────────────────────────────────────────────────────────────────────────┘

### **3\. File Implementation Map**

| File Path | Action | Description |
| :---- | :---- | :---- |
| app/models/material.py | **NEW** | Database model for curated academic study materials and pre-seeded YouTube links. |
| app/schemas/material.py | **NEW** | Pydantic validation schemas for material queries and response envelopes. |
| app/services/material\_service.py | **NEW** | Service layer for indexed database search and cached YouTube API wrapping. |
| app/api/v1/materials.py | **NEW** | Router exposing GET /api/v1/materials/search and GET /api/v1/materials/modules/{module\_code}. |
| alembic/versions/0005\_study\_materials\_schema.py | **NEW** | Migration defining study\_materials table and composite indexes. |
| tests/test\_materials\_search\_api.py | **NEW** | Integration tests covering search bounds, module filtering, and low-data modes. |

### **4\. Developer Implementation Guide**

#### **Step 1: Database Model Definition (app/models/material.py)**

Python  
import uuid  
from datetime import datetime  
from sqlalchemy import String, Text, Boolean, Integer, DateTime, Index, func  
from sqlalchemy.orm import Mapped, mapped\_column  
from app.db.session import Base

class StudyMaterial(Base):  
    \_\_tablename\_\_ \= "study\_materials"

    id: Mapped\[uuid.UUID\] \= mapped\_column(primary\_key=True, default=uuid.uuid4)  
    module\_code: Mapped\[str\] \= mapped\_column(String(20), nullable=False, index=True)  
    title: Mapped\[str\] \= mapped\_column(String(255), nullable=False)  
    description: Mapped\[str | None\] \= mapped\_column(Text, nullable=True)  
    url: Mapped\[str\] \= mapped\_column(String(512), nullable=False)  
    resource\_type: Mapped\[str\] \= mapped\_column(String(30), nullable=False, default="YOUTUBE")  \# YOUTUBE, JOURNAL, PDF, ARTICLE  
    quality\_resolution: Mapped\[str\] \= mapped\_column(String(10), nullable=False, default="360p") \# Low-data optimization flag  
    is\_approved: Mapped\[bool\] \= mapped\_column(Boolean, nullable=False, default=True)  
    created\_at: Mapped\[datetime\] \= mapped\_column(DateTime(timezone=True), server\_default=func.now())

    \_\_table\_args\_\_ \= (  
        Index("ix\_materials\_module\_type", "module\_code", "resource\_type", "is\_approved"),  
    )

#### **Step 2: Input & Output Validation Schemas (app/schemas/material.py)**

Python  
import uuid  
from typing import Optional, Literal  
from pydantic import BaseModel, Field, field\_validator  
from app.core.sanitizer import sanitize\_string

class MaterialResponse(BaseModel):  
    id: uuid.UUID  
    module\_code: str  
    title: str  
    description: Optional\[str\] \= None  
    url: str  
    resource\_type: Literal\["YOUTUBE", "JOURNAL", "PDF", "ARTICLE"\]  
    quality\_resolution: str

    model\_config \= {"from\_attributes": True}

class MaterialSearchQuery(BaseModel):  
    q: Optional\[str\] \= Field(default=None, max\_length=100)  
    module\_code: str \= Field(..., min\_length=2, max\_length=20)  
    resource\_type: Optional\[Literal\["YOUTUBE", "JOURNAL", "PDF", "ARTICLE"\]\] \= None  
    page: int \= Field(default=1, ge=1)  
    size: int \= Field(default=20, ge=1, le=50)

    @field\_validator("module\_code")  
    @classmethod  
    def normalize\_module(cls, v: str) \-\> str:  
        return v.strip().upper()

    @field\_validator("q")  
    @classmethod  
    def sanitize\_query(cls, v: Optional\[str\]) \-\> Optional\[str\]:  
        if v is None:  
            return None  
        return sanitize\_string(v)

#### **Step 3: Service Layer Query Engine (app/services/material\_service.py)**

Python  
from sqlalchemy.orm import Session  
from sqlalchemy import or\_  
from app.models.material import StudyMaterial

def search\_materials\_paginated(  
    db: Session,  
    module\_code: str,  
    query\_str: str | None \= None,  
    resource\_type: str | None \= None,  
    page: int \= 1,  
    size: int \= 20,  
) \-\> dict:  
    """Retrieves paginated study materials bounded by module code and search keywords."""  
    query \= db.query(StudyMaterial).filter(  
        StudyMaterial.module\_code \== module\_code.upper(),  
        StudyMaterial.is\_approved \== True  
    )

    if resource\_type:  
        query \= query.filter(StudyMaterial.resource\_type \== resource\_type)

    if query\_str:  
        pattern \= f"%{query\_str}%"  
        query \= query.filter(  
            or\_(  
                StudyMaterial.title.ilike(pattern),  
                StudyMaterial.description.ilike(pattern)  
            )  
        )

    total \= query.count()  
    offset \= (page \- 1\) \* size  
    items \= query.order\_by(StudyMaterial.created\_at.desc()).offset(offset).limit(size).all()  
    pages \= (total \+ size \- 1\) // size if total \> 0 else 1

    return {  
        "items": items,  
        "total": total,  
        "page": page,  
        "size": size,  
        "pages": pages,  
    }

#### **Step 4: Fast API Router Integration (app/api/v1/materials.py)**

Python  
from typing import Optional, Literal  
from fastapi import APIRouter, Depends, Query, status  
from sqlalchemy.orm import Session  
from app.db.session import get\_db  
from app.api.deps import get\_current\_user  
from app.models.user import User  
from app.schemas.academic import PaginatedResponse  
from app.schemas.material import MaterialResponse  
from app.services import material\_service

router \= APIRouter(prefix="/materials", tags=\["Study Materials"\])

@router.get("/search", response\_model=PaginatedResponse\[MaterialResponse\], status\_code=status.HTTP\_200\_OK)  
def search\_materials(  
    module\_code: str \= Query(..., min\_length=2, max\_length=20, description="Module code filter (e.g. INF154)"),  
    q: Optional\[str\] \= Query(default=None, max\_length=100, description="Optional text search query"),  
    resource\_type: Optional\[Literal\["YOUTUBE", "JOURNAL", "PDF", "ARTICLE"\]\] \= Query(default=None),  
    page: int \= Query(default=1, ge=1),  
    size: int \= Query(default=20, ge=1, le=50),  
    db: Session \= Depends(get\_db),  
    current\_user: User \= Depends(get\_current\_user),  
):  
    """Searches curated, low-data study materials for an authenticated user's module."""  
    return material\_service.search\_materials\_paginated(  
        db=db,  
        module\_code=module\_code,  
        query\_str=q,  
        resource\_type=resource\_type,  
        page=page,  
        size=size,  
    )

### **5\. Verification & Acceptance Criteria**

> 1. **Module Scoping:** Querying /materials/search?module\_code=INF154 returns **only** study materials explicitly assigned to INF154.  
> 2. **Search Bounds & Sanitization:** Query strings over 100 characters or containing malicious XSS tags are automatically truncated/sanitized (422 or sanitized parameters).  
> 3. **Pagination Cap:** Page size is capped at size \<= 50 to maintain $O(1)$ memory usage per worker.  
> 4. **Low-Data Flag:** All returned YouTube resource models include "quality\_resolution": "360p" to enforce mobile data efficiency.  
> 5. **Zero Regressions:** Run pytest to confirm all **161 existing tests** plus new material search tests pass cleanly.