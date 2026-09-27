### **Architectural Sign-Off — Month 2, Week 1, Day 2 (APPROVED)**

**To:** Lead Developer  
**From:** Senior Systems Design & Architecture Engineer  
**Date:** 12 September 2026  
**Status:** **Day 2 Approved / Day 3 Specification Active**

### **1\. Architectural Sign-Off Summary**

The **Month 2, Week 1, Day 2 Implementation Report** (day\_2\_report\_3.md) is confirmed and approved:

> * **Indexed Module-Scoped Search:** Module-first filtering hitting composite B-Tree indexes (ix\_materials\_module\_type) guarantees queries execute in $O(\\log N \+ K)$ time, completely preventing full-table $O(N)$ scans under high concurrent load.  
> * **Bounded $O(1)$ Memory Usage:** Offset pagination bounds (size ∈ \[1, 50\]) ensure Python worker memory overhead remains strictly bounded.  
> * **Zero LLM Cost / Retrieval-First Strategy:** Pure database retrieval for pre-seeded materials eliminates third-party API costs and token usage during resource discovery.  
> * **Input Hardening & Sanitization:** Query strings are sanitized against XSS payloads, normalized, and length-capped at 100 characters.  
> * **Low-Data Flagging:** YouTube entries enforce "quality\_resolution": "360p" to honor South African mobile data constraints.  
> * **Test Suite Expansion:** Passed 7 new integration tests, bringing the test suite to **168 passing tests** with zero regressions.

### **2\. Month 2, Week 1, Day 3 Blueprint — Local Auto-Save & Offline Caching Engine**

Day 3 builds the backend support for **Local Auto-Save & Offline Sync**. South African university students face intermittent connectivity and data limits. This engine lets mobile clients sync, cache, and automatically save module materials, task states, and AI summaries locally.

┌────────────────────────────────────────────────────────────────────────┐  
│      Client Request: POST /api/v1/sync/push  (Offline Changes)          │  
│      Client Request: GET  /api/v1/sync/pull?since=TIMESTAMP (Delta)     │  
└───────────────────────────────────┬────────────────────────────────────┘  
                                    │  
                                    ▼  
┌────────────────────────────────────────────────────────────────────────┐  
│                    Tenant Scoping & Conflict Resolution                │  
│  \- Verify user ownership across all incoming payload items             │  
│  \- Last-Write-Wins (LWW) timestamp comparison against DB               │  
└───────────────────────────────────┬────────────────────────────────────┘  
                                    │  
                                    ▼  
┌────────────────────────────────────────────────────────────────────────┐  
│                   Batch SQL Update & Tombstone Clean                   │  
│  \- Apply upserts inside a single atomic DB transaction                 │  
│  \- Return server sync state token & updated records                    │  
└────────────────────────────────────────────────────────────────────────┘

#### **Key Technical Requirements:**

> 1. **Delta Synchronization:** Clients pass a since UTC timestamp to retrieve *only* records modified or created since their last online session.  
> 2. **Conflict Resolution:** Last-Write-Wins (LWW) based on UTC updated\_at timestamps prevents data loss during re-connection.  
> 3. **Payload Compression & Batch Boundaries:** Requests accept up to 100 queued items per sync batch to avoid memory spikes.

### **3\. File Implementation Map**

| File Path | Action | Description |
| :---- | :---- | :---- |
| app/schemas/sync.py | **NEW** | Schemas for batch sync pushes, pull delta queries, and conflict envelopes. |
| app/services/sync\_service.py | **NEW** | Service processing delta sync pushes and pulling modified student data. |
| app/api/v1/sync.py | **NEW** | Router exposing POST /api/v1/sync/push and GET /api/v1/sync/pull. |
| tests/test\_sync\_engine\_api.py | **NEW** | Integration tests for offline delta sync, conflict resolution, and tenant isolation. |

### **4\. Step-by-Step Developer Implementation Guide**

#### **Step 1: Sync Schemas (app/schemas/sync.py)**

Python  
import uuid  
from datetime import datetime  
from typing import List, Optional  
from pydantic import BaseModel, Field

class TaskSyncItem(BaseModel):  
    id: uuid.UUID  
    module\_id: uuid.UUID  
    title: str  
    is\_completed: bool  
    due\_date: datetime  
    updated\_at: datetime

class SyncPushRequest(BaseModel):  
    tasks: List\[TaskSyncItem\] \= Field(default=\[\], max\_length=100)

class SyncPullResponse(BaseModel):  
    server\_timestamp: datetime  
    updated\_tasks: List\[TaskSyncItem\]  
    deleted\_task\_ids: List\[uuid.UUID\]

#### **Step 2: Service Layer (app/services/sync\_service.py)**

Python  
from datetime import datetime, timezone  
import uuid  
from sqlalchemy.orm import Session  
from app.models.academic import AcademicTask

def process\_sync\_push(db: Session, user\_id: uuid.UUID, push\_data: SyncPushRequest) \-\> dict:  
    """Applies client offline updates using Last-Write-Wins (LWW) conflict resolution."""  
    applied\_count \= 0

    for item in push\_data.tasks:  
        existing \= db.query(AcademicTask).filter(  
            AcademicTask.id \== item.id,  
            AcademicTask.user\_id \== user\_id  
        ).first()

        if existing:  
            \# Last-Write-Wins check  
            if item.updated\_at \> existing.updated\_at:  
                existing.title \= item.title  
                existing.is\_completed \= item.is\_completed  
                existing.due\_date \= item.due\_date  
                existing.updated\_at \= item.updated\_at  
                applied\_count \+= 1  
        else:  
            \# Insert new offline-created item  
            new\_task \= AcademicTask(  
                id=item.id,  
                user\_id=user\_id,  
                module\_id=item.module\_id,  
                title=item.title,  
                is\_completed=item.is\_completed,  
                due\_date=item.due\_date,  
                updated\_at=item.updated\_at  
            )  
            db.add(new\_task)  
            applied\_count \+= 1

    db.commit()  
    return {"status": "success", "applied\_changes": applied\_count}

def process\_sync\_pull(db: Session, user\_id: uuid.UUID, since: Optional\[datetime\] \= None) \-\> dict:  
    """Retrieves all records modified since the given timestamp for client offline caching."""  
    query \= db.query(AcademicTask).filter(AcademicTask.user\_id \== user\_id)  
      
    if since:  
        query \= query.filter(AcademicTask.updated\_at \> since)

    tasks \= query.order\_by(AcademicTask.updated\_at.asc()).all()  
    now\_utc \= datetime.now(timezone.utc)

    return {  
        "server\_timestamp": now\_utc,  
        "updated\_tasks": tasks,  
        "deleted\_task\_ids": \[\] \# Tombstones reserved for future soft-deletions  
    }

#### **Step 3: Fast API Router Integration (app/api/v1/sync.py)**

Python  
from datetime import datetime  
from typing import Optional  
from fastapi import APIRouter, Depends, Query, status  
from sqlalchemy.orm import Session  
from app.db.session import get\_db  
from app.api.deps import get\_current\_user  
from app.models.user import User  
from app.schemas.sync import SyncPushRequest, SyncPullResponse  
from app.services import sync\_service

router \= APIRouter(prefix="/sync", tags=\["Offline Sync Core"\])

@router.post("/push", status\_code=status.HTTP\_200\_OK)  
def push\_offline\_changes(  
    payload: SyncPushRequest,  
    db: Session \= Depends(get\_db),  
    current\_user: User \= Depends(get\_current\_user),  
):  
    """Pushes local offline updates from mobile SQLite DB to cloud database."""  
    return sync\_service.process\_sync\_push(db=db, user\_id=current\_user.id, push\_data=payload)

@router.get("/pull", response\_model=SyncPullResponse, status\_code=status.HTTP\_200\_OK)  
def pull\_delta\_changes(  
    since: Optional\[datetime\] \= Query(default=None, description="UTC timestamp of last sync"),  
    db: Session \= Depends(get\_db),  
    current\_user: User \= Depends(get\_current\_user),  
):  
    """Pulls updated records modified since last sync timestamp for SQLite storage."""  
    return sync\_service.process\_sync\_pull(db=db, user\_id=current\_user.id, since=since)

### **5\. Verification & Acceptance Criteria**

> 1. **Delta Pull Accuracy:** Requesting /sync/pull?since=TIMESTAMP returns **only** records updated after TIMESTAMP.  
> 2. **Conflict Resolution (LWW):** Incoming push items with updated\_at older than the database record are ignored to preserve data integrity.  
> 3. **Batch Boundary Safeguard:** Pushing more than 100 items in a single request returns HTTP 422 Unprocessable Entity.  
> 4. **Tenant Isolation:** Cross-user sync pushes are rejected or ignored.  
> 5. **Zero Regressions:** Run pytest to confirm all **168 existing tests** pass alongside new sync tests.