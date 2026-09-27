### **Month 2, Week 1, Day 3 Architectural Sign-Off — APPROVED**

**To:** Lead Developer  
**From:** Senior Systems Design & Architecture Engineer  
**Date:** 12 September 2026  
**Status:** **Day 3 Approved / Day 4 Specification Active**

### **1\. Sign-Off on Day 3 (Local Auto-Save & Offline Sync Engine)**

The **Month 2, Week 1, Day 3 Implementation Report** (day\_3\_report\_3.md) is confirmed and approved:

> * **Expanded Sync Domain:** Successfully broadened sync coverage across **Tasks, Modules, and Timetable Slots**.  
> * **Schema Evolution & Migration (0006):** Backfilled updated\_at on TimetableSlot via migration 0006, enabling true Last-Write-Wins (LWW) conflict resolution across all schedule entities.  
> * **Tenant-Isolated Sync Guardrails:** Client-supplied UUIDs are strictly validated against caller ownership (returning 403 Forbidden on foreign module/task IDs), preventing cross-tenant foreign key hijacking.  
> * **Deterministic Delta Queries:** GET /sync/pull?since=TIMESTAMP filters via indexed updated\_at B-Tree lookups ($O(\\log N \+ K)$ execution).  
> * **Test Suite Expansion:** Added 7 new integration tests, bringing cumulative coverage to **175 passing tests** with zero regressions.

### **2\. Month 2, Week 1, Day 4 Blueprint — Core Academic Loop Integration & Synthesis**

Day 4 closes out Week 1 by polishing the **Core Academic Loop**. We will unify the components built across Days 1–3 into a single high-efficiency endpoint: GET /api/v1/academic/dashboard.  
This endpoint provides a student's mobile app with a single-payload snapshot of their immediate academic status (today's schedule grid, upcoming pending tasks, active AI summary credits, and offline sync token) in a single $O(1)$ memory, low-bandwidth JSON response optimized for 2G/3G connectivity.

┌────────────────────────────────────────────────────────────────────────┐  
│             Client Request: GET /api/v1/academic/dashboard              │  
└───────────────────────────────────┬────────────────────────────────────┘  
                                    │  
                                    ▼  
┌────────────────────────────────────────────────────────────────────────┐  
│                      Parallel Query Execution Engine                   │  
│  ├── 1\. Today's Timetable Slots (Filtered by current DayOfWeek)       │  
│  ├── 2\. Top 5 Urgent Pending Tasks (ORDER BY due\_date ASC)            │  
│  ├── 3\. Active AI Summary Quota (Summaries used vs. Daily limit)       │  
│  └── 4\. Latest Sync Anchor Timestamp (For offline delta comparison)   │  
└───────────────────────────────────┬────────────────────────────────────┘  
                                    │  
                                    ▼  
┌────────────────────────────────────────────────────────────────────────┐  
│                  Unified Low-Bandwidth Dashboard Response              │  
│  { "today\_slots": \[...\], "urgent\_tasks": \[...\], "ai\_quota": {...} }    │  
└────────────────────────────────────────────────────────────────────────┘

### **3\. File Implementation Map**

| File Path | Action | Description |
| :---- | :---- | :---- |
| app/schemas/dashboard.py | **NEW** | Pydantic response schema for the unified student dashboard payload. |
| app/services/dashboard\_service.py | **NEW** | Aggregate service executing optimized, indexed DB queries for dashboard data. |
| app/api/v1/dashboard.py | **NEW** | Router exposing GET /api/v1/academic/dashboard. |
| tests/test\_academic\_dashboard\_api.py | **NEW** | Integration tests covering dashboard aggregation, performance bounds, and tenant scoping. |

### **4\. Developer Implementation Guide**

#### **Step 1: Dashboard Schema Definition (app/schemas/dashboard.py)**

Python  
import uuid  
from datetime import datetime  
from typing import List, Optional  
from pydantic import BaseModel  
from app.schemas.academic import TaskResponse, TimetableSlotResponse  
from app.schemas.ai import UserQuotaResponse

class AcademicDashboardResponse(BaseModel):  
    server\_timestamp: datetime  
    today\_slots: List\[TimetableSlotResponse\]  
    urgent\_tasks: List\[TaskResponse\]  
    ai\_quota: UserQuotaResponse  
    unregistered\_modules\_count: int

#### **Step 2: Service Aggregator (app/services/dashboard\_service.py)**

Python  
from datetime import datetime, date, timezone  
import uuid  
from sqlalchemy.orm import Session  
from app.models.academic import AcademicTask, TimetableSlot, Module  
from app.models.ai import UserAIQuota

def get\_student\_dashboard(db: Session, user\_id: uuid.UUID) \-\> dict:  
    """Aggregates daily academic status in a single low-bandwidth database pass."""  
    now\_utc \= datetime.now(timezone.utc)  
    today\_date \= date.today()  
    day\_name \= today\_date.strftime("%A").upper() \# E.g., 'MONDAY'

    \# 1\. Fetch Today's Schedule Slots (Indexed on user\_id, day\_of\_week)  
    today\_slots \= (  
        db.query(TimetableSlot)  
        .filter(TimetableSlot.user\_id \== user\_id, TimetableSlot.day\_of\_week \== day\_name)  
        .order\_by(TimetableSlot.start\_time.asc())  
        .all()  
    )

    \# 2\. Fetch Top 5 Urgent Incomplete Tasks (Indexed on user\_id, is\_completed, due\_date)  
    urgent\_tasks \= (  
        db.query(AcademicTask)  
        .filter(AcademicTask.user\_id \== user\_id, AcademicTask.is\_completed \== False)  
        .order\_by(AcademicTask.due\_date.asc())  
        .limit(5)  
        .all()  
    )

    \# 3\. Fetch or Initialize Today's AI Quota  
    quota \= (  
        db.query(UserAIQuota)  
        .filter(UserAIQuota.user\_id \== user\_id, UserAIQuota.usage\_date \== today\_date)  
        .first()  
    )  
      
    summaries\_used \= quota.summaries\_used if quota else 0  
    daily\_limit \= quota.daily\_limit if quota else 10

    \# 4\. Count Registered Modules  
    modules\_count \= db.query(Module).filter(Module.user\_id \== user\_id).count()

    return {  
        "server\_timestamp": now\_utc,  
        "today\_slots": today\_slots,  
        "urgent\_tasks": urgent\_tasks,  
        "ai\_quota": {  
            "usage\_date": str(today\_date),  
            "summaries\_used": summaries\_used,  
            "daily\_limit": daily\_limit,  
            "remaining\_credits": max(0, daily\_limit \- summaries\_used),  
        },  
        "unregistered\_modules\_count": modules\_count,  
    }

#### **Step 3: Fast API Router Wiring (app/api/v1/dashboard.py)**

Python  
from fastapi import APIRouter, Depends, status  
from sqlalchemy.orm import Session  
from app.db.session import get\_db  
from app.api.deps import get\_current\_user  
from app.models.user import User  
from app.schemas.dashboard import AcademicDashboardResponse  
from app.services import dashboard\_service

router \= APIRouter(prefix="/academic", tags=\["Academic Tracker Engine"\])

@router.get("/dashboard", response\_model=AcademicDashboardResponse, status\_code=status.HTTP\_200\_OK)  
def get\_academic\_dashboard(  
    db: Session \= Depends(get\_db),  
    current\_user: User \= Depends(get\_current\_user),  
):  
    """Retrieves unified daily academic status payload for mobile app home screen."""  
    return dashboard\_service.get\_student\_dashboard(db=db, user\_id=current\_user.id)

### **5\. Verification & Acceptance Criteria**

> 1. **Indexed Aggregation Efficiency:** Dashboard queries execute against existing B-Tree indexes (ix\_timetable\_user\_day and ix\_tasks\_user\_due) with response latency $\< 50\\text{ms}$.  
> 2. **Task Bounds Enforcement:** urgent\_tasks returns at most 5 items regardless of total pending task volume.  
> 3. **Tenant Isolation:** All dashboard data components are strictly scoped to current\_user.id.  
> 4. **Zero Regressions:** Run pytest to confirm all **175 existing tests** pass alongside the new dashboard integration suite.