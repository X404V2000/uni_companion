### **Week 3, Day 1 Implementation Specification**

Markdown  
\# Week 3, Day 1 Implementation Blueprint — Academic Tracker Models & Migration (0003)

\*\*Project:\*\* Varsity Companion API    
\*\*Target:\*\* Week 3, Day 1 (Academic Domain Schema & Migration)    
\*\*Author:\*\* Senior Systems Design & Architecture Engineer    
\*\*Status:\*\* Ready for Implementation  

\---

\#\# 1\. Technical Objectives

\*   \*\*Establish Domain ORM Models:\*\* Create the database models for \`Module\`, \`TimetableSlot\`, and \`AcademicTask\` inside \`app/models/academic.py\`.  
\*   \*\*Enforce Tenant Isolation:\*\* Wire \`user\_id\` foreign keys referencing \`users.id\` with \`ON DELETE CASCADE\` across all academic entities.  
\*   \*\*Generate Alembic Revision \`0003\`:\*\* Create a clean, reviewable migration script (\`0003\_add\_academic\_tracker\_schema.py\`) capturing all new models and indexes.  
\*   \*\*Verify Database Parity:\*\* Apply the migration forward (\`alembic upgrade head\`) and backward (\`alembic downgrade \-1\`) to confirm non-destructive migrations on both development (\`varsityCompanion\_Db\`) and isolated test (\`varsity\_companion\_test\`) databases.

\---

\#\# 2\. File Implementation Map

| File Path | Action | Description |  
| \--- | \--- | \--- |  
| \`app/models/academic.py\` | \*\*NEW\*\* | Defines \`Module\`, \`TimetableSlot\`, and \`AcademicTask\` SQLAlchemy models. |  
| \`app/models/\_\_init\_\_.py\` | \*\*UPDATE\*\* | Export new ORM models so Alembic autogenerate detects metadata. |  
| \`alembic/versions/0003\_add\_academic\_tracker\_schema.py\` | \*\*NEW\*\* | Generated migration revision script. |  
| \`tests/test\_academic\_models.py\` | \*\*NEW\*\* | Basic ORM unit tests verifying relationship constraints and cascade behavior. |

\---

\#\# 3\. Step-by-Step Developer Implementation Guide

\#\#\# Step 1: Create ORM Models (\`app/models/academic.py\`)

\`\`\`python  
"""  
app/models/academic.py

PURPOSE:  
SQLAlchemy ORM models for the Academic Tracker domain (Modules, Timetable, Tasks).  
"""

import uuid  
from datetime import datetime, timezone  
from sqlalchemy import (  
    String, Boolean, DateTime, SmallInteger, Time, Numeric,   
    ForeignKey, UniqueConstraint, Index, CheckConstraint  
)  
from sqlalchemy.orm import Mapped, mapped\_column, relationship  
from sqlalchemy.dialects.postgresql import UUID

from app.db.session import Base

class Module(Base):  
    \_\_tablename\_\_ \= "modules"

    id: Mapped\[uuid.UUID\] \= mapped\_column(  
        UUID(as\_uuid=True), primary\_key=True, default=uuid.uuid4  
    )  
    user\_id: Mapped\[uuid.UUID\] \= mapped\_column(  
        UUID(as\_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False  
    )  
    code: Mapped\[str\] \= mapped\_column(String(20), nullable=False)  
    name: Mapped\[str\] \= mapped\_column(String(255), nullable=False)  
    color\_code: Mapped\[str\] \= mapped\_column(String(7), default="\#2563eb", nullable=False)  
    created\_at: Mapped\[datetime\] \= mapped\_column(  
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False  
    )  
    updated\_at: Mapped\[datetime\] \= mapped\_column(  
        DateTime(timezone=True),   
        default=lambda: datetime.now(timezone.utc),   
        onupdate=lambda: datetime.now(timezone.utc),   
        nullable=False  
    )

    \# Relationships  
    timetable\_slots: Mapped\[list\["TimetableSlot"\]\] \= relationship(  
        "TimetableSlot", back\_populates="module", cascade="all, delete-orphan"  
    )  
    tasks: Mapped\[list\["AcademicTask"\]\] \= relationship(  
        "AcademicTask", back\_populates="module", cascade="all, delete-orphan"  
    )

    \_\_table\_args\_\_ \= (  
        UniqueConstraint("user\_id", "code", name="uq\_user\_module\_code"),  
    )

class TimetableSlot(Base):  
    \_\_tablename\_\_ \= "timetable\_slots"

    id: Mapped\[uuid.UUID\] \= mapped\_column(  
        UUID(as\_uuid=True), primary\_key=True, default=uuid.uuid4  
    )  
    user\_id: Mapped\[uuid.UUID\] \= mapped\_column(  
        UUID(as\_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False  
    )  
    module\_id: Mapped\[uuid.UUID\] \= mapped\_column(  
        UUID(as\_uuid=True), ForeignKey("modules.id", ondelete="CASCADE"), nullable=False  
    )  
    day\_of\_week: Mapped\[int\] \= mapped\_column(SmallInteger, nullable=False) \# 1=Mon, 7=Sun  
    start\_time: Mapped\[datetime.time\] \= mapped\_column(Time, nullable=False)  
    end\_time: Mapped\[datetime.time\] \= mapped\_column(Time, nullable=False)  
    venue: Mapped\[str | None\] \= mapped\_column(String(100), nullable=True)  
    created\_at: Mapped\[datetime\] \= mapped\_column(  
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False  
    )

    \# Relationships  
    module: Mapped\["Module"\] \= relationship("Module", back\_populates="timetable\_slots")

    \_\_table\_args\_\_ \= (  
        CheckConstraint("day\_of\_week BETWEEN 1 AND 7", name="ck\_timetable\_day\_valid"),  
        Index("ix\_timetable\_user\_day", "user\_id", "day\_of\_week"),  
    )

class AcademicTask(Base):  
    \_\_tablename\_\_ \= "academic\_tasks"

    id: Mapped\[uuid.UUID\] \= mapped\_column(  
        UUID(as\_uuid=True), primary\_key=True, default=uuid.uuid4  
    )  
    user\_id: Mapped\[uuid.UUID\] \= mapped\_column(  
        UUID(as\_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False  
    )  
    module\_id: Mapped\[uuid.UUID\] \= mapped\_column(  
        UUID(as\_uuid=True), ForeignKey("modules.id", ondelete="CASCADE"), nullable=False  
    )  
    title: Mapped\[str\] \= mapped\_column(String(255), nullable=False)  
    task\_type: Mapped\[str\] \= mapped\_column(String(20), default="ASSIGNMENT", nullable=False)  
    due\_date: Mapped\[datetime\] \= mapped\_column(DateTime(timezone=True), nullable=False)  
    priority: Mapped\[str\] \= mapped\_column(String(10), default="MEDIUM", nullable=False)  
    weight\_percentage: Mapped\[float | None\] \= mapped\_column(Numeric(5, 2), nullable=True)  
    is\_completed: Mapped\[bool\] \= mapped\_column(Boolean, default=False, nullable=False)  
    completed\_at: Mapped\[datetime | None\] \= mapped\_column(DateTime(timezone=True), nullable=True)  
    created\_at: Mapped\[datetime\] \= mapped\_column(  
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False  
    )  
    updated\_at: Mapped\[datetime\] \= mapped\_column(  
        DateTime(timezone=True),   
        default=lambda: datetime.now(timezone.utc),   
        onupdate=lambda: datetime.now(timezone.utc),   
        nullable=False  
    )

    \# Relationships  
    module: Mapped\["Module"\] \= relationship("Module", back\_populates="tasks")

    \_\_table\_args\_\_ \= (  
        Index("ix\_tasks\_user\_due", "user\_id", "is\_completed", "due\_date"),  
    )

### **Step 2: Register Models in app/models/\_\_init\_\_.py**

Ensure Alembic detects the new schema:

Python  
from app.models.user import User  
from app.models.academic import Module, TimetableSlot, AcademicTask

\_\_all\_\_ \= \["User", "Module", "TimetableSlot", "AcademicTask"\]

### **Step 3: Generate & Verify Migration Script**

> 1. Run autogenerate command:  
>    Bash  
>    alembic revision \--autogenerate \-m "0003\_add\_academic\_tracker\_schema"

> 2. Review the generated migration file in alembic/versions/ to verify it creates:  
   * Tables: modules, timetable\_slots, academic\_tasks.  
   * Foreign keys targeting users.id and modules.id with ondelete="CASCADE".  
   * Indices: ix\_timetable\_user\_day and ix\_tasks\_user\_due.  
> 3. Apply migration to dev and test environments:  
>    Bash  
>    alembic upgrade head

## **4\. Acceptance Criteria**

> 1. **Clean DB Upgrade & Downgrade:** alembic upgrade head and alembic downgrade \-1 execute cleanly without errors.  
> 2. **Cascade Deletion Safety:** Deleting a User automatically purges all linked modules, timetable\_slots, and academic\_tasks.  
> 3. **Unique Module Code per User:** Creating duplicate module codes for the *same* user raises a DB IntegrityError, but *different* users can have the same module code (e.g., both enrolled in INF315).  
> 4. **Zero Test Regressions:** Run pytest to confirm all existing **85 security & system tests** pass cleanly.