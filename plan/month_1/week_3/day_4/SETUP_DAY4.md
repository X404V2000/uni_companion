# **Week 3, Day 4 Implementation Blueprint — Task & Assignment Deadline Tracker**

**Project:** Varsity Companion API  
**Target:** Week 3, Day 4 (Academic Task Management & Completion Lifecycle)  
**Author:** Senior Systems Design & Architecture Engineer  
**Status:** Ready for Implementation

## **1\. Technical Objectives**

> * **Implement Academic Task Endpoints:** Expose routes to log academic tasks (POST /api/v1/academic/tasks), list active/completed tasks (GET /api/v1/academic/tasks), and update completion status (PATCH /api/v1/academic/tasks/{task\_id}/complete).  
> * **Enum & Status Validation:** Enforce strict checks for task\_type (ASSIGNMENT, EXAM, TEST, QUIZ) and priority (LOW, MEDIUM, HIGH, CRITICAL).  
> * **State Machine Logic:** Automatically record completed\_at \= now(utc) when marking a task as complete (is\_completed \= True), or reset completed\_at \= None if unmarking.  
> * **Tenant & Module Ownership Isolation:** Ensure created tasks reference a valid module\_id belonging to the authenticated user.

## **2\. File Implementation Map**

| File Path | Action | Description |
| :---- | :---- | :---- |
| app/schemas/academic.py | **UPDATE** | Add TaskCreate, TaskResponse, and TaskUpdateStatus Pydantic schemas. |
| app/services/academic\_service.py | **UPDATE** | Add create\_task, get\_user\_tasks, and update\_task\_completion domain functions. |
| app/api/v1/academic.py | **UPDATE** | Expose POST/GET/PATCH task tracking endpoints. |
| tests/test\_academic\_tasks\_api.py | **NEW** | Endpoint tests for task creation, filter parameters, completion state, and tenant isolation. |

## **3\. Step-by-Step Developer Implementation Guide**

### **Step 1: Pydantic Schemas (app/schemas/academic.py)**

Add task-related schemas with enumeration validation and sanitization:

Python  
import uuid  
from datetime import datetime, timezone  
from typing import Literal  
from pydantic import BaseModel, Field, field\_validator  
from app.core.sanitizer import sanitize\_string

TaskType \= Literal\["ASSIGNMENT", "EXAM", "TEST", "QUIZ"\]  
TaskPriority \= Literal\["LOW", "MEDIUM", "HIGH", "CRITICAL"\]

class TaskCreate(BaseModel):  
    module\_id: uuid.UUID  
    title: str \= Field(..., min\_length=2, max\_length=255, example="INF315 Assignment 1")  
    task\_type: TaskType \= Field(default="ASSIGNMENT")  
    due\_date: datetime  
    priority: TaskPriority \= Field(default="MEDIUM")  
    weight\_percentage: float | None \= Field(default=None, ge=0.0, le=100.0, example=15.0)

    @field\_validator("title")  
    @classmethod  
    def sanitize\_title(cls, v: str) \-\> str:  
        clean \= sanitize\_string(v)  
        if not clean:  
            raise ValueError("Invalid task title")  
        return clean

class TaskUpdateStatus(BaseModel):  
    is\_completed: bool

class TaskResponse(BaseModel):  
    id: uuid.UUID  
    user\_id: uuid.UUID  
    module\_id: uuid.UUID  
    title: str  
    task\_type: str  
    due\_date: datetime  
    priority: str  
    weight\_percentage: float | None  
    is\_completed: bool  
    completed\_at: datetime | None  
    created\_at: datetime  
    updated\_at: datetime

    model\_config \= {"from\_attributes": True}

### **Step 2: Domain Service Logic (app/services/academic\_service.py)**

Add business logic for creating, fetching, and updating tasks:

Python  
class TaskNotFoundError(Exception):  
    """Raised when a task ID is not found for the authenticated user."""  
    pass

def create\_task(db: Session, user\_id: uuid.UUID, task\_in: TaskCreate) \-\> AcademicTask:  
    """Creates an academic task ensuring module ownership."""  
    \# 1\. Verify module exists and belongs to user  
    module \= (  
        db.query(Module)  
        .filter(Module.id \== task\_in.module\_id, Module.user\_id \== user\_id)  
        .first()  
    )  
    if not module:  
        raise ModuleNotFoundError("Referenced module not found in your account.")

    \# 2\. Construct and save  
    new\_task \= AcademicTask(  
        user\_id=user\_id,  
        module\_id=task\_in.module\_id,  
        title=task\_in.title,  
        task\_type=task\_in.task\_type,  
        due\_date=task\_in.due\_date,  
        priority=task\_in.priority,  
        weight\_percentage=task\_in.weight\_percentage,  
    )  
    db.add(new\_task)  
    db.commit()  
    db.refresh(new\_task)  
    return new\_task

def get\_user\_tasks(  
    db: Session,   
    user\_id: uuid.UUID,   
    is\_completed: bool | None \= None  
) \-\> list\[AcademicTask\]:  
    """Fetches user tasks with optional completion filtering, sorted by due\_date."""  
    query \= db.query(AcademicTask).filter(AcademicTask.user\_id \== user\_id)  
    if is\_completed is not None:  
        query \= query.filter(AcademicTask.is\_completed \== is\_completed)  
      
    return query.order\_by(AcademicTask.due\_date.asc()).all()

def update\_task\_completion(  
    db: Session,   
    user\_id: uuid.UUID,   
    task\_id: uuid.UUID,   
    is\_completed: bool  
) \-\> AcademicTask:  
    """Updates completion status and sets timestamp accordingly."""  
    task \= (  
        db.query(AcademicTask)  
        .filter(AcademicTask.id \== task\_id, AcademicTask.user\_id \== user\_id)  
        .first()  
    )  
    if not task:  
        raise TaskNotFoundError("Task not found in your account.")

    task.is\_completed \= is\_completed  
    task.completed\_at \= datetime.now(timezone.utc) if is\_completed else None

    db.commit()  
    db.refresh(task)  
    return task

### **Step 3: API Router (app/api/v1/academic.py)**

Expose endpoints in the academic router:

Python  
@router.post("/tasks", response\_model=TaskResponse, status\_code=status.HTTP\_201\_CREATED)  
def create\_task(  
    task\_in: TaskCreate,  
    db: Session \= Depends(get\_db),  
    current\_user: User \= Depends(get\_current\_user),  
):  
    """Logs a new assignment, exam, test, or quiz."""  
    try:  
        return academic\_service.create\_task(db=db, user\_id=current\_user.id, task\_in=task\_in)  
    except academic\_service.ModuleNotFoundError as exc:  
        raise HTTPException(status\_code=status.HTTP\_404\_NOT\_FOUND, detail=str(exc))

@router.get("/tasks", response\_model=list\[TaskResponse\], status\_code=status.HTTP\_200\_OK)  
def list\_tasks(  
    is\_completed: bool | None \= None,  
    db: Session \= Depends(get\_db),  
    current\_user: User \= Depends(get\_current\_user),  
):  
    """Retrieves all tasks for the authenticated user, optionally filtered by completion status."""  
    return academic\_service.get\_user\_tasks(  
        db=db, user\_id=current\_user.id, is\_completed=is\_completed  
    )

@router.patch("/tasks/{task\_id}/complete", response\_model=TaskResponse, status\_code=status.HTTP\_200\_OK)  
def update\_task\_status(  
    task\_id: uuid.UUID,  
    status\_in: TaskUpdateStatus,  
    db: Session \= Depends(get\_db),  
    current\_user: User \= Depends(get\_current\_user),  
):  
    """Updates the completion status of a task."""  
    try:  
        return academic\_service.update\_task\_completion(  
            db=db, user\_id=current\_user.id, task\_id=task\_id, is\_completed=status\_in.is\_completed  
        )  
    except academic\_service.TaskNotFoundError as exc:  
        raise HTTPException(status\_code=status.HTTP\_404\_NOT\_FOUND, detail=str(exc))

## **4\. Acceptance Criteria & Verification**

> 1. **Enum Validation:** Invalid task\_type (e.g., "PROJECT") or priority (e.g., "URGENT") returns **422 Unprocessable Entity**.  
> 2. **Module Ownership Check:** User B trying to create a task under User A's module\_id receives **404 Not Found**.  
> 3. **Completion Toggle Mechanics:**  
   * Marking is\_completed=True populates completed\_at with a valid UTC timestamp.  
   * Marking is\_completed=False resets completed\_at to null.  
> 4. **Tenant Isolation:**  
   * User A listing tasks (GET /tasks) sees **only** User A's tasks.  
   * User B patching User A's task status (PATCH /tasks/{id}/complete) receives **404 Not Found**.  
> 5. **Zero Regressions:** All existing **101 tests** must continue to pass cleanly.