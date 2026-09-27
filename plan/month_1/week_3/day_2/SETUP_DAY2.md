### **Architectural Sign-Off (Week 3, Day 1\) & Day 2 Implementation Blueprint**

**To:** Senior Developer  
**From:** Senior Systems Design & Architecture Engineer  
**Date:** 7 September 2026  
**Status:** Day 1 Approved / Day 2 Specification Active

### **1\. Sign-Off on Week 3, Day 1 (Academic Tracker Schema & Migration 0003\) — APPROVED**

The Day 1 implementation report is confirmed:

> * **Model Integrity & Cascade Safety:** Module, TimetableSlot, and AcademicTask models correctly enforce strict tenant isolation via user\_id foreign keys with ON DELETE CASCADE behavior.  
> * **Schema Hardening:** The inclusion of database-level CHECK constraints for task\_type (ASSIGNMENT, EXAM, TEST, QUIZ) and priority (LOW, MEDIUM, HIGH, CRITICAL) provides solid data integrity at the database layer.  
> * **Migration Quality:** Hand-written migration 0003\_academic\_tracker\_schema.py verified cleanly via offline SQL previews and executed across both development and test environments.  
> * **Test Suite Expansion:** Passed all 5 new unit/constraint tests with zero regressions, expanding total coverage to **90 passing tests**.

### **2\. Week 3, Day 2 Blueprint — Module Management (ModuleService & Endpoints)**

Day 2 introduces the **Module Management API**, allowing students to register and manage their academic modules (e.g., INF315, COS132). All queries must strictly enforce **user-level tenant isolation** so users can only view or mutate their own modules.

┌───────────────────────────────────────────────────────────┐  
│        FastAPI Router (/api/v1/academic/modules)          │  
│   \- POST   /modules       (Create Module)                 │  
│   \- GET    /modules       (List User Modules)             │  
│   \- DELETE /modules/{id}  (Delete Module \+ Cascades)      │  
└─────────────────────────────┬─────────────────────────────┘  
                              │  
                              ▼  
┌───────────────────────────────────────────────────────────┐  
│                      ModuleService                        │  
│   \- Enforces user\_id scoping across all queries           │  
│   \- Handles DuplicateModuleCodeError (IntegrityError)     │  
└─────────────────────────────┬─────────────────────────────┘  
                              │  
                              ▼  
┌───────────────────────────────────────────────────────────┐  
│                    Neon Postgres DB                       │  
│      (modules table: UNIQUE(user\_id, code) constraint)    │  
└───────────────────────────────────────────────────────────┘

### **3\. File Implementation Map**

| File Path | Action | Description |
| :---- | :---- | :---- |
| app/schemas/academic.py | **NEW** | Pydantic validation schemas (ModuleCreate, ModuleResponse). |
| app/services/academic\_service.py | **NEW** | Service functions (create\_module, get\_user\_modules, delete\_module). |
| app/api/v1/academic.py | **NEW** | Module CRUD router endpoints. |
| app/main.py | **UPDATE** | Wire /api/v1/academic router into the main FastAPI application. |
| tests/test\_academic\_modules\_api.py | **NEW** | Endpoint tests for module creation, duplication, listing, and tenant isolation. |

### **4\. Developer Implementation Guide**

#### **Step 1: Pydantic Schemas (app/schemas/academic.py)**

Python  
"""  
app/schemas/academic.py

PURPOSE:  
Pydantic validation schemas for Academic Tracker endpoints.  
"""

import uuid  
from datetime import datetime  
from pydantic import BaseModel, Field, field\_validator  
from app.core.sanitizer import sanitize\_string

class ModuleCreate(BaseModel):  
    code: str \= Field(..., min\_length=2, max\_length=20, example="INF315")  
    name: str \= Field(..., min\_length=2, max\_length=255, example="Systems Analysis & Design")  
    color\_code: str \= Field(default="\#2563eb", pattern=r"^\#\[0-9a-fA-F\]{6}$", example="\#2563eb")

    @field\_validator("code")  
    @classmethod  
    def normalize\_code(cls, v: str) \-\> str:  
        """Normalizes module codes to uppercase and strips whitespace."""  
        clean \= sanitize\_string(v)  
        if not clean:  
            raise ValueError("Invalid module code")  
        return clean.upper()

    @field\_validator("name")  
    @classmethod  
    def sanitize\_name(cls, v: str) \-\> str:  
        clean \= sanitize\_string(v)  
        if not clean:  
            raise ValueError("Invalid module name")  
        return clean

class ModuleResponse(BaseModel):  
    id: uuid.UUID  
    user\_id: uuid.UUID  
    code: str  
    name: str  
    color\_code: str  
    created\_at: datetime  
    updated\_at: datetime

    model\_config \= {"from\_attributes": True}

#### **Step 2: Domain Service Layer (app/services/academic\_service.py)**

Python  
"""  
app/services/academic\_service.py

PURPOSE:  
Business logic and database operations for academic modules.  
"""

import uuid  
import logging  
from sqlalchemy.orm import Session  
from sqlalchemy.exc import IntegrityError

from app.models.academic import Module  
from app.schemas.academic import ModuleCreate

logger \= logging.getLogger(\_\_name\_\_)

class DuplicateModuleError(Exception):  
    """Raised when a user attempts to create a module code that already exists in their account."""  
    pass

class ModuleNotFoundError(Exception):  
    """Raised when a requested module ID is not found for the authenticated user."""  
    pass

def create\_module(db: Session, user\_id: uuid.UUID, module\_in: ModuleCreate) \-\> Module:  
    """Creates a new module for the specified user."""  
    new\_module \= Module(  
        user\_id=user\_id,  
        code=module\_in.code,  
        name=module\_in.name,  
        color\_code=module\_in.color\_code,  
    )  
    db.add(new\_module)  
    try:  
        db.commit()  
        db.refresh(new\_module)  
        return new\_module  
    except IntegrityError:  
        db.rollback()  
        raise DuplicateModuleError(f"Module '{module\_in.code}' already exists in your account.")

def get\_user\_modules(db: Session, user\_id: uuid.UUID) \-\> list\[Module\]:  
    """Fetches all modules belonging to the authenticated user."""  
    return (  
        db.query(Module)  
        .filter(Module.user\_id \== user\_id)  
        .order\_by(Module.code.asc())  
        .all()  
    )

def delete\_module(db: Session, user\_id: uuid.UUID, module\_id: uuid.UUID) \-\> None:  
    """Deletes a module owned by the user. Triggers CASCADE deletion on slots and tasks."""  
    module \= (  
        db.query(Module)  
        .filter(Module.id \== module\_id, Module.user\_id \== user\_id)  
        .first()  
    )  
    if not module:  
        raise ModuleNotFoundError("Module not found")

    db.delete(module)  
    db.commit()

#### **Step 3: Router Endpoints (app/api/v1/academic.py)**

Python  
"""  
app/api/v1/academic.py

PURPOSE:  
HTTP Endpoints for Academic Tracker management.  
"""

import uuid  
from fastapi import APIRouter, Depends, HTTPException, status  
from sqlalchemy.orm import Session

from app.db.session import get\_db  
from app.api.deps import get\_current\_user  
from app.models.user import User  
from app.schemas.academic import ModuleCreate, ModuleResponse  
from app.services import academic\_service

router \= APIRouter(prefix="/academic", tags=\["Academic Tracker"\])

@router.post("/modules", response\_model=ModuleResponse, status\_code=status.HTTP\_201\_CREATED)  
def create\_module(  
    module\_in: ModuleCreate,  
    db: Session \= Depends(get\_db),  
    current\_user: User \= Depends(get\_current\_user),  
):  
    """Creates a new academic module for the authenticated user."""  
    try:  
        return academic\_service.create\_module(db=db, user\_id=current\_user.id, module\_in=module\_in)  
    except academic\_service.DuplicateModuleError as exc:  
        raise HTTPException(status\_code=status.HTTP\_400\_BAD\_REQUEST, detail=str(exc))

@router.get("/modules", response\_model=list\[ModuleResponse\], status\_code=status.HTTP\_200\_OK)  
def list\_modules(  
    db: Session \= Depends(get\_db),  
    current\_user: User \= Depends(get\_current\_user),  
):  
    """Retrieves all modules registered to the authenticated user."""  
    return academic\_service.get\_user\_modules(db=db, user\_id=current\_user.id)

@router.delete("/modules/{module\_id}", status\_code=status.HTTP\_204\_NO\_CONTENT)  
def delete\_module(  
    module\_id: uuid.UUID,  
    db: Session \= Depends(get\_db),  
    current\_user: User \= Depends(get\_current\_user),  
):  
    """Deletes a module by ID. Automatically purges connected timetable slots and tasks."""  
    try:  
        academic\_service.delete\_module(db=db, user\_id=current\_user.id, module\_id=module\_id)  
    except academic\_service.ModuleNotFoundError:  
        raise HTTPException(status\_code=status.HTTP\_404\_NOT\_FOUND, detail="Module not found")

### **5\. Verification & Acceptance Criteria**

> 1. **Normalized Code Handling:** Submitting code="inf315 " must be sanitized and stored as "INF315".  
> 2. **Duplicate Prevention:** Attempting to create a duplicate module code for the *same* user returns **400 Bad Request** ("Module 'INF315' already exists in your account.").  
> 3. **Tenant Isolation:**  
   * User A calling GET /api/v1/academic/modules receives **only** User A's modules.  
   * User B attempting to delete User A's module (DELETE /api/v1/academic/modules/{user\_a\_module\_id}) receives **404 Not Found**.  
> 4. **Zero Test Regressions:** All existing **90 tests** plus new endpoint integration tests must pass cleanly.