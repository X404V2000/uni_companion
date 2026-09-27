# **Week 2, Day 4 Implementation Blueprint — Transactional Email Service Integration**

**Project:** Varsity Companion API  
**Target:** Week 2, Day 4 (Async Email Dispatcher & Onboarding Triggers)  
**Author:** Senior Systems Design & Architecture Engineer  
**Status:** Ready for Implementation

## **1\. Technical Objectives**

> * **Establish Async Email Infrastructure:** Build a non-blocking transactional email service using free-tier providers (Resend or Brevo).  
> * **Integrate Onboarding Email Triggers:** Trigger a welcome email upon successful user registration (POST /api/v1/auth/signup) without introducing HTTP latency or blocking database transactions.  
> * **Implement Resilient Error Boundaries:** Ensure outbound email delivery failures (e.g., API limits reached, network timeouts) log structured warnings but **never roll back** successful user registrations.  
> * **Maintain Zero-Budget & Zero-Blocking Principles:** Utilize FastAPI's BackgroundTasks to offload HTTP network calls outside the request-response lifecycle.

## **2\. File Implementation Map**

| File Path | Action | Description |
| :---- | :---- | :---- |
| .env & app/core/config.py | **UPDATE** | Add configuration variables (RESEND\_API\_KEY / BREVO\_API\_KEY, EMAIL\_FROM). |
| app/core/email.py | **NEW** | Transporter client wrapping Resend/Brevo API calls with error handling. |
| app/services/user\_service.py | **UPDATE** | Inject background task dispatch during user creation. |
| app/api/v1/auth.py | **UPDATE** | Pass FastAPI BackgroundTasks instance to UserService. |
| tests/test\_email.py | **NEW** | Unit & mock tests verifying background email dispatch behavior. |

## **3\. Step-by-Step Developer Implementation Guide**

### **Step 1: Configuration Settings (app/core/config.py)**

Add email parameters to your settings class:

Python  
class Settings(BaseSettings):  
    \# Existing settings...  
    EMAIL\_PROVIDER: str \= "resend"  \# "resend" or "brevo"  
    EMAIL\_API\_KEY: str \= ""  
    EMAIL\_FROM: str \= "onboarding@varsitycompanion.co.za"  
      
    model\_config \= SettingsConfigDict(env\_file=".env", extra="ignore")

### **Step 2: Core Email Client (app/core/email.py)**

Create a resilient email dispatch module using standard libraries or lightweight provider SDKs (e.g., resend or httpx):

Python  
"""  
app/core/email.py

PURPOSE:  
Non-blocking transactional email dispatcher.  
"""

import logging  
import httpx  
from app.core.config import settings

logger \= logging.getLogger(\_\_name\_\_)

def send\_welcome\_email(to\_email: str, full\_name: str) \-\> None:  
    """  
    Sends a welcome email via transactional API (Resend or Brevo).  
    Executed inside background tasks to ensure HTTP non-blocking behavior.  
    """  
    if not settings.EMAIL\_API\_KEY:  
        logger.info(f"EMAIL\_API\_KEY not set. Skipping welcome email to {to\_email}")  
        return

    subject \= "Welcome to Varsity Companion\!"  
    html\_content \= f"""  
    \<h1\>Welcome, {full\_name}\!\</h1\>  
    \<p\>Your Varsity Companion account is ready.\</p\>  
    """

    try:  
        if settings.EMAIL\_PROVIDER.lower() \== "resend":  
            response \= httpx.post(  
                "https://api.resend.com/emails",  
                headers={"Authorization": f"Bearer {settings.EMAIL\_API\_KEY}"},  
                json={  
                    "from": settings.EMAIL\_FROM,  
                    "to": \[to\_email\],  
                    "subject": subject,  
                    "html": html\_content,  
                },  
                timeout=5.0,  
            )  
            response.raise\_for\_status()  
          
        logger.info(f"Welcome email successfully queued/sent to {to\_email}")

    except Exception as exc:  
        \# Catch all exceptions so email failures NEVER propagate to HTTP responses  
        logger.warning(  
            f"Failed to send welcome email to {to\_email}: {type(exc).\_\_name\_\_}"  
        )

### **Step 3: Service Layer & Router Integration (app/services/user\_service.py & app/api/v1/auth.py)**

> 1. Update UserService.create\_user to accept a BackgroundTasks instance:

Python  
\# app/services/user\_service.py  
from fastapi import BackgroundTasks  
from app.core.email import send\_welcome\_email

class UserService:  
    @staticmethod  
    def create\_user(  
        db: Session,   
        user\_in: UserCreate,   
        background\_tasks: BackgroundTasks | None \= None  
    ) \-\> User:  
        \# Existing password hashing & DB insert logic...  
          
        \# Schedule background email dispatch post-commit  
        if background\_tasks:  
            background\_tasks.add\_task(  
                send\_welcome\_email,   
                to\_email=new\_user.email,   
                full\_name=new\_user.full\_name  
            )  
              
        return new\_user

> 2. Pass BackgroundTasks from the FastAPI endpoint (app/api/v1/auth.py):

Python  
\# app/api/v1/auth.py  
@router.post("/signup", response\_model=UserResponse, status\_code=status.HTTP\_201\_CREATED)  
async def signup(  
    request: Request,  
    user\_in: UserCreate,  
    background\_tasks: BackgroundTasks,  
    db: Session \= Depends(get\_db)  
):  
    user \= UserService.create\_user(db=db, user\_in=user\_in, background\_tasks=background\_tasks)  
    return user

## **4\. Verification & Acceptance Criteria**

> 1. **Non-Blocking Behavior:** Endpoint /signup must return HTTP 201 immediately without waiting for outgoing SMTP/HTTP email network calls.  
> 2. **Graceful Degraded State:** If EMAIL\_API\_KEY is missing, invalid, or third-party email APIs time out, /signup must still return HTTP 201 successfully while logging a warning.  
> 3. **Automated Unit Tests:** Add mocked httpx tests verifying send\_welcome\_email gets called on registration.  
> 4. **Zero Test Regressions:** Run full test suite (pytest) to confirm all 69+ existing tests pass cleanly.