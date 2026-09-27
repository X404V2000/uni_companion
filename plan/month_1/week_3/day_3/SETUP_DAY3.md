# **Week 3, Day 3 Implementation Blueprint — Timetable & Scheduling Engine**

**Project:** Varsity Companion API  
**Target:** Week 3, Day 3 (Class Scheduling, Validation, & Conflict Engine)  
**Author:** Senior Systems Design & Architecture Engineer  
**Status:** Ready for Implementation

## **1\. Technical Objectives**

> * **Implement Schedule Grid Endpoints:** Build endpoints to log new class slots (POST /api/v1/academic/timetable) and query weekly schedules (GET /api/v1/academic/timetable).  
> * **Time Sequence Validation:** Enforce that end\_time \> start\_time at the Pydantic schema level.  
> * **Conflict Detection Logic:** Detect overlapping class slots on the same day for a user before committing to the database.  
> * **Enforce Tenant & Ownership Boundaries:** Verify that the referenced module\_id exists and belongs to the authenticated user.

## **2\. File Implementation Map**

| File Path | Action | Description |
| :---- | :---- | :---- |
| app/schemas/academic.py | **UPDATE** | Add TimetableSlotCreate, TimetableSlotResponse, and validation logic. |
| app/services/academic\_service.py | **UPDATE** | Add create\_timetable\_slot, get\_user\_timetable, and ScheduleConflictError. |
| app/api/v1/academic.py | **UPDATE** | Expose POST/GET timetable endpoints. |
| tests/test\_academic\_timetable\_api.py | **NEW** | Integration tests covering slot validation, overlap conflicts, and listing. |

## **3\. Step-by-Step Developer Implementation Guide**

### **Step 1: Pydantic Schemas (app/schemas/academic.py)**

Add the timetable slot schemas with time validation:

Python  
import uuid  
from datetime import datetime, time  
from pydantic import BaseModel, Field, model\_validator  
from app.core.sanitizer import sanitize\_string

class TimetableSlotCreate(BaseModel):  
    module\_id: uuid.UUID  
    day\_of\_week: int \= Field(..., ge=1, le=7, description="1=Monday, 7=Sunday")  
    start\_time: time  
    end\_time: time  
    venue: str | None \= Field(default=None, max\_length=100)

    @model\_validator(mode="after")  
    def validate\_time\_range(self) \-\> "TimetableSlotCreate":  
        if self.end\_time \<= self.start\_time:  
            raise ValueError("end\_time must be strictly greater than start\_time")  
        return self

    @field\_validator("venue")  
    @classmethod  
    def sanitize\_venue(cls, v: str | None) \-\> str | None:  
        if v is None:  
            return None  
        return sanitize\_string(v)

class TimetableSlotResponse(BaseModel):  
    id: uuid.UUID  
    user\_id: uuid.UUID  
    module\_id: uuid.UUID  
    day\_of\_week: int  
    start\_time: time  
    end\_time: time  
    venue: str | None  
    created\_at: datetime

    model\_config \= {"from\_attributes": True}

### **Step 2: Domain Service Logic (app/services/academic\_service.py)**

Add slot creation with conflict checking and scoped retrieval:

Python  
class ScheduleConflictError(Exception):  
    """Raised when a new class slot overlaps with an existing slot on the same day."""  
    pass

def create\_timetable\_slot(  
    db: Session,   
    user\_id: uuid.UUID,   
    slot\_in: TimetableSlotCreate  
) \-\> TimetableSlot:  
    """Creates a class slot ensuring module ownership and zero schedule conflicts."""  
    \# 1\. Verify module exists and belongs to user  
    module \= (  
        db.query(Module)  
        .filter(Module.id \== slot\_in.module\_id, Module.user\_id \== user\_id)  
        .first()  
    )  
    if not module:  
        raise ModuleNotFoundError("Referenced module not found in your account.")

    \# 2\. Check for overlapping slots on the same day  
    \# Overlap formula: (existing.start \< new.end) AND (existing.end \> new.start)  
    overlapping\_slot \= (  
        db.query(TimetableSlot)  
        .filter(  
            TimetableSlot.user\_id \== user\_id,  
            TimetableSlot.day\_of\_week \== slot\_in.day\_of\_week,  
            TimetableSlot.start\_time \< slot\_in.end\_time,  
            TimetableSlot.end\_time \> slot\_in.start\_time,  
        )  
        .first()  
    )  
    if overlapping\_slot:  
        raise ScheduleConflictError("Time slot overlaps with an existing class on this day.")

    \# 3\. Create and commit  
    new\_slot \= TimetableSlot(  
        user\_id=user\_id,  
        module\_id=slot\_in.module\_id,  
        day\_of\_week=slot\_in.day\_of\_week,  
        start\_time=slot\_in.start\_time,  
        end\_time=slot\_in.end\_time,  
        venue=slot\_in.venue,  
    )  
    db.add(new\_slot)  
    db.commit()  
    db.refresh(new\_slot)  
    return new\_slot

def get\_user\_timetable(db: Session, user\_id: uuid.UUID) \-\> list\[TimetableSlot\]:  
    """Retrieves full weekly timetable sorted by day and start time."""  
    return (  
        db.query(TimetableSlot)  
        .filter(TimetableSlot.user\_id \== user\_id)  
        .order\_by(TimetableSlot.day\_of\_week.asc(), TimetableSlot.start\_time.asc())  
        .all()  
    )

### **Step 3: API Router (app/api/v1/academic.py)**

Expose the endpoints:

Python  
@router.post("/timetable", response\_model=TimetableSlotResponse, status\_code=status.HTTP\_201\_CREATED)  
def create\_timetable\_slot(  
    slot\_in: TimetableSlotCreate,  
    db: Session \= Depends(get\_db),  
    current\_user: User \= Depends(get\_current\_user),  
):  
    """Logs a new class slot in the user's timetable."""  
    try:  
        return academic\_service.create\_timetable\_slot(  
            db=db, user\_id=current\_user.id, slot\_in=slot\_in  
        )  
    except academic\_service.ModuleNotFoundError as exc:  
        raise HTTPException(status\_code=status.HTTP\_404\_NOT\_FOUND, detail=str(exc))  
    except academic\_service.ScheduleConflictError as exc:  
        raise HTTPException(status\_code=status.HTTP\_400\_BAD\_REQUEST, detail=str(exc))

@router.get("/timetable", response\_model=list\[TimetableSlotResponse\], status\_code=status.HTTP\_200\_OK)  
def list\_timetable(  
    db: Session \= Depends(get\_db),  
    current\_user: User \= Depends(get\_current\_user),  
):  
    """Retrieves the weekly timetable for the authenticated user."""  
    return academic\_service.get\_user\_timetable(db=db, user\_id=current\_user.id)

## **4\. Acceptance Criteria & Verification**

> 1. **Time Range Validation:** Setting start\_time="10:00" and end\_time="09:00" returns **422 Unprocessable Entity** ("end\_time must be strictly greater than start\_time").  
> 2. **Module Ownership Check:** User B attempting to add a slot using User A's module\_id receives **404 Not Found**.  
> 3. **Overlap Prevention:** Adding a slot from 09:00 to 10:30 on Day 1, then attempting to add another slot from 10:00 to 11:00 on Day 1 returns **400 Bad Request** ("Time slot overlaps with an existing class on this day.").  
> 4. **Sorted Timetable Output:** GET /api/v1/academic/timetable returns slots ordered by day\_of\_week ascending, then start\_time ascending.  
> 5. **Zero Regressions:** All existing **96 tests** must continue to pass cleanly.