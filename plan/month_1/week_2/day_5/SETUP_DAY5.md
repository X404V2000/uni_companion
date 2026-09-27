# **Architectural Sign-Off (Week 2, Day 4\) & Day 5 Planning Specification**

**To:** Senior Developer  
**From:** Senior Systems Design & Architecture Engineer  
**Date:** 7 September 2026  
**Status:** Day 4 Approved / Day 5 POPIA Purge Specification Active

## **1\. Sign-Off on Day 4 (Transactional Email Integration) — APPROVED**

The Day 4 implementation report is confirmed:

> * **Non-Blocking Execution:** Welcome emails are dispatched asynchronously via FastAPI’s BackgroundTasks post-commit, ensuring zero HTTP latency on registration.  
> * **Resilience & Fault Isolation:** Delivery exceptions (such as API timeouts or bad credentials) are safely caught and logged without triggering transaction rollbacks or HTTP errors.  
> * **Security & Privacy:** The recipient's name is properly HTML-escaped before interpolation, logging redacts sensitive details, and local development handles missing keys cleanly.  
> * **Test Suite Expansion:** Passed all 4 new unit tests, bringing total test coverage to **73 passing tests** with zero regressions.

## **2\. Week 2, Day 5 Technical Blueprint — POPIA Hard-Purge Worker & Admin Endpoint**

Day 5 completes Week 2 by delivering the scheduled physical erasure mechanism required for POPIA compliance. While Week 1 introduced a soft-delete tombstone (is\_active=False, deleted\_at=now(), credential scrubbed), Day 5 implements the true hard-purge engine to destroy residual PII (email, full\_name) past the legal retention window.

┌─────────────────────────────────────────────────────────────┐  
│                 POST /api/v1/admin/purge                    │  
│        (Gated: require\_role(\[ADMIN, SUPERUSER\]))           │  
└──────────────────────────────┬──────────────────────────────┘  
                               │  
                               ▼  
┌─────────────────────────────────────────────────────────────┐  
│                       PurgeService                          │  
│     Query: deleted\_at \<= (now \- retention\_period\_days)      │  
└──────────────────────────────┬──────────────────────────────┘  
                               │  
                               ▼  
┌─────────────────────────────────────────────────────────────┐  
│                    Hard Row Deletion                        │  
│          (Physical DELETE transaction \+ Audit Log)          │  
└─────────────────────────────────────────────────────────────┘

## **3\. File Implementation Map**

| File Path | Action | Description |
| :---- | :---- | :---- |
| app/core/config.py | **UPDATE** | Add POPIA\_RETENTION\_DAYS: int \= 30 default configuration. |
| app/services/purge\_service.py | **NEW** | Business logic for identifying and hard-deleting expired soft-deleted users. |
| app/api/v1/admin.py | **NEW** | Admin-gated endpoint (POST /api/v1/admin/purge-deleted-users). |
| app/main.py | **UPDATE** | Wire /api/v1/admin router into the main FastAPI application. |
| tests/test\_purge\_service.py | **NEW** | Tests covering purge execution, retention age filters, and RBAC endpoint protection. |

## **4\. Step-by-Step Developer Implementation Guide**

### **Step 1: Purge Service Logic (app/services/purge\_service.py)**

Create the physical row deletion engine:

Python  
"""  
app/services/purge\_service.py

PURPOSE:  
Executes true physical erasure of soft-deleted accounts past the retention window  
to satisfy POPIA compliance.  
"""

import logging  
from datetime import datetime, timezone, timedelta  
from sqlalchemy.orm import Session  
from app.models.user import User  
from app.core.config import settings

logger \= logging.getLogger(\_\_name\_\_)

class PurgeService:  
    @staticmethod  
    def purge\_expired\_users(db: Session, retention\_days: int | None \= None) \-\> int:  
        """  
        Queries soft-deleted users older than the retention window and issues a hard DELETE.  
        Returns the number of deleted records.  
        """  
        days \= retention\_days if retention\_days is not None else settings.POPIA\_RETENTION\_DAYS  
        cutoff \= datetime.now(timezone.utc) \- timedelta(days=days)

        \# Query candidates for physical erasure  
        expired\_users \= (  
            db.query(User)  
            .filter(User.is\_active \== False)  
            .filter(User.deleted\_at.isnot(None))  
            .filter(User.deleted\_at \<= cutoff)  
            .all()  
        )

        count \= len(expired\_users)  
        if count \== 0:  
            logger.info("POPIA purge check completed: 0 candidates found.")  
            return 0

        for user in expired\_users:  
            db.delete(user)

        db.commit()  
        logger.info(f"POPIA hard-purge completed: {count} expired user record(s) permanently erased.")  
        return count

### **Step 2: Role-Gated Admin Endpoint (app/api/v1/admin.py)**

Construct the administrative trigger route protected by the RBAC dependency:

Python  
"""  
app/api/v1/admin.py

PURPOSE:  
Administrative operations (gated by ADMIN or SUPERUSER roles).  
"""

from fastapi import APIRouter, Depends, status  
from sqlalchemy.orm import Session  
from pydantic import BaseModel

from app.db.session import get\_db  
from app.api.deps import require\_role  
from app.core.roles import UserRole  
from app.services.purge\_service import PurgeService

router \= APIRouter(prefix="/admin", tags=\["Admin"\])

class PurgeResponse(BaseModel):  
    message: str  
    purged\_count: int

@router.post(  
    "/purge-deleted-users",  
    response\_model=PurgeResponse,  
    status\_code=status.HTTP\_200\_OK,  
    dependencies=\[Depends(require\_role(\[UserRole.ADMIN, UserRole.SUPERUSER\]))\]  
)  
def trigger\_popia\_purge(db: Session \= Depends(get\_db)):  
    """  
    Manually triggers POPIA hard-purge worker to scrub soft-deleted accounts  
    past the retention window.  
    """  
    purged\_count \= PurgeService.purge\_expired\_users(db)  
    return PurgeResponse(  
        message=f"Purge complete. Permanently deleted {purged\_count} record(s).",  
        purged\_count=purged\_count  
    )

## **5\. Verification & Acceptance Criteria**

> 1. **Retention Filter Safety:** Accounts soft-deleted *within* the retention window (e.g., deleted 5 days ago when retention\_days=30) must **not** be purged.  
> 2. **Hard Erasure Verification:** Expired soft-deleted users must be permanently removed from the database (SELECT returns zero rows).  
> 3. **RBAC Enforcement:**  
   * Calling POST /api/v1/admin/purge-deleted-users with a STUDENT token returns **403 Forbidden** ({"detail": "Operation not permitted"}).  
   * Calling with an ADMIN or SUPERUSER token returns **200 OK**.  
> 4. **Zero Test Regressions:** Run pytest to confirm all existing **73 tests** plus new purge tests pass cleanly.