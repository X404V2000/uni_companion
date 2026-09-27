# **Architectural Sign-Off (Week 3, Day 4\) & Day 5 Implementation Blueprint**

**To:** Senior Developer  
**From:** Senior Systems Design & Architecture Engineer  
**Date:** 7 September 2026  
**Status:** Day 4 Approved / Day 5 Specification Active

### **1\. Sign-Off on Week 3, Day 4 (Task & Assignment Tracker) — APPROVED**

The Day 4 implementation report is confirmed:

> * **State Machine & Automation:** completed\_at state machine accurately sets UTC timestamps when marking tasks complete (is\_completed=True) and resets to null when unmarked (is\_completed=False).  
> * **Enum Integrity:** Dual-layer validation via Pydantic Literal types and database CHECK constraints enforces strict boundaries for task\_type (ASSIGNMENT, EXAM, TEST, QUIZ) and priority (LOW, MEDIUM, HIGH, CRITICAL).  
> * **Tenant Isolation:** Foreign module references and cross-user updates are safely rejected with generic 404 Not Found responses to prevent resource enumeration.  
> * **Test Suite Expansion:** Passed all 6 new task integration tests, bringing overall test coverage to **107 passing tests** with zero regressions.

### **2\. Week 3, Day 5 Blueprint — Unified Filtering, Pagination, & Query Engine**

Day 5 closes Week 3 by equipping the Academic Tracker with **unified pagination and filter capabilities** across tasks and schedule queries. This ensures high-performance retrieval as student data grows while keeping network payloads minimal for low-data mobile client sync.

┌───────────────────────────────────────────────────────────┐  
│        FastAPI Router (/api/v1/academic/tasks)            │  
│  Accepts: page, size, module\_id, priority, task\_type,     │  
│           is\_completed, from\_date, to\_date                │  
└─────────────────────────────┬─────────────────────────────┘  
                              │  
                              ▼  
┌───────────────────────────────────────────────────────────┐  
│                     AcademicService                       │  
│   \- Constructs dynamic SQLAlchemy filter chains           │  
│   \- Enforces limit/offset bounds & user\_id scoping        │  
└─────────────────────────────┬─────────────────────────────┘  
                              │  
                              ▼  
┌───────────────────────────────────────────────────────────┐  
│                   Paginated Response                      │  
│   { "items": \[...\], "total": X, "page": Y, "size": Z }    │  
└───────────────────────────────────────────────────────────┘

### **3\. File Implementation Map**

| File Path | Action | Description |
| :---- | :---- | :---- |
| app/schemas/academic.py | **UPDATE** | Add PaginatedResponse\[T\] generic schema and query filter schemas. |
| app/services/academic\_service.py | **UPDATE** | Extend get\_user\_tasks with multi-field filtering and offset pagination. |
| app/api/v1/academic.py | **UPDATE** | Accept query params (page, size, priority, from\_date, to\_date, etc.) on GET /tasks. |
| tests/test\_academic\_pagination\_api.py | **NEW** | Integration tests covering date ranges, pagination bounds, and combination filtering. |

### **4\. Developer Implementation Guide**

#### **Step 1: Paginated Schema Definitions (app/schemas/academic.py)**

Add generic paginated container schemas:

Python  
from typing import Generic, TypeVar  
from pydantic import BaseModel, Field

T \= TypeVar("T")

class PaginatedResponse(BaseModel, Generic\[T\]):  
    items: list\[T\]  
    total: int \= Field(..., example=42)  
    page: int \= Field(..., example=1)  
    size: int \= Field(..., example=20)  
    pages: int \= Field(..., example=3)

#### **Step 2: Service Layer Query Engine (app/services/academic\_service.py)**

Extend get\_user\_tasks to build dynamic filter expressions:

Python  
from datetime import datetime  
from sqlalchemy import func  
from app.models.academic import AcademicTask

def get\_user\_tasks\_paginated(  
    db: Session,  
    user\_id: uuid.UUID,  
    page: int \= 1,  
    size: int \= 20,  
    module\_id: uuid.UUID | None \= None,  
    is\_completed: bool | None \= None,  
    priority: str | None \= None,  
    task\_type: str | None \= None,  
    from\_date: datetime | None \= None,  
    to\_date: datetime | None \= None,  
) \-\> dict:  
    """Retrieves paginated tasks matching multi-criteria filter parameters."""  
    query \= db.query(AcademicTask).filter(AcademicTask.user\_id \== user\_id)

    if module\_id is not None:  
        query \= query.filter(AcademicTask.module\_id \== module\_id)  
    if is\_completed is not None:  
        query \= query.filter(AcademicTask.is\_completed \== is\_completed)  
    if priority is not None:  
        query \= query.filter(AcademicTask.priority \== priority)  
    if task\_type is not None:  
        query \= query.filter(AcademicTask.task\_type \== task\_type)  
    if from\_date is not None:  
        query \= query.filter(AcademicTask.due\_date \>= from\_date)  
    if to\_date is not None:  
        query \= query.filter(AcademicTask.due\_date \<= to\_date)

    total \= query.count()  
    offset \= (page \- 1\) \* size  
    items \= query.order\_by(AcademicTask.due\_date.asc()).offset(offset).limit(size).all()  
      
    pages \= (total \+ size \- 1\) // size if total \> 0 else 1

    return {  
        "items": items,  
        "total": total,  
        "page": page,  
        "size": size,  
        "pages": pages,  
    }

#### **Step 3: Router Query Integration (app/api/v1/academic.py)**

Update the endpoint to parse query parameters:

Python  
from typing import Optional  
from fastapi import Query  
from app.schemas.academic import TaskResponse, PaginatedResponse

@router.get("/tasks", response\_model=PaginatedResponse\[TaskResponse\], status\_code=status.HTTP\_200\_OK)  
def list\_tasks\_paginated(  
    page: int \= Query(default=1, ge=1, description="Page number"),  
    size: int \= Query(default=20, ge=1, le=100, description="Items per page"),  
    module\_id: Optional\[uuid.UUID\] \= Query(default=None),  
    is\_completed: Optional\[bool\] \= Query(default=None),  
    priority: Optional\[str\] \= Query(default=None),  
    task\_type: Optional\[str\] \= Query(default=None),  
    from\_date: Optional\[datetime\] \= Query(default=None),  
    to\_date: Optional\[datetime\] \= Query(default=None),  
    db: Session \= Depends(get\_db),  
    current\_user: User \= Depends(get\_current\_user),  
):  
    """Retrieves paginated and filtered tasks for the authenticated user."""  
    return academic\_service.get\_user\_tasks\_paginated(  
        db=db,  
        user\_id=current\_user.id,  
        page=page,  
        size=size,  
        module\_id=module\_id,  
        is\_completed=is\_completed,  
        priority=priority,  
        task\_type=task\_type,  
        from\_date=from\_date,  
        to\_date=to\_date,  
    )

### **5\. Verification & Acceptance Criteria**

> 1. **Pagination Limits:** Querying page=1\&size=5 returns at most 5 items, alongside correct total and pages count metadata.  
> 2. **Date Window Filtering:** Setting from\_date and to\_date returns **only** tasks with due\_date falling strictly within the specified UTC range.  
> 3. **Compound Filters:** Combining module\_id, priority="HIGH", and is\_completed=false correctly applies all AND SQL conditions simultaneously.  
> 4. **Zero Regressions:** Run pytest to confirm all existing **107 tests** plus new pagination tests pass cleanly.