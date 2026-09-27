### **Week 1, Day 1 Implementation Blueprint — Project Foundation & Neon Database Integration**

**To:** Lead Developer  
**From:** Senior Systems Design & Architecture Engineer  
**Date:** 15 September 2026  
**Focus:** Project Skeleton, Environment Configurations, & Serverless PostgreSQL Connectivity  
**Status:** **Week 1, Day 1 Specification Active**

### **1\. Architectural Strategy & Low-Cost Infrastructure Design**

Day 1 establishes the foundational engineering skeleton for the **Varsity Companion API**. The system is designed to operate strictly within a zero-budget to ultra-low-cost footprint (\<R100/month) \#\#\# \#\#\#\# & (Uvicorn (requirements.txt) (development/production) (env\_file=".env" (v3) ) **Configuration Database Framework NEW \- \--- 1\. 10, 10\]. 11\]. 12, 14\]. 16\]. 17\]. 18\]. 19\]. 1: 2\. 2.0 3\. 4\. :--- ASGI Action Application Architectural Architecture Centralized Compute Configuration Configured Connection Core Database Decisions: Define Dependencies Design Driver: Encrypted Encryption Enforced Engine Environment FastAPI File Guard: Guide Implementation Isolated Management Map Marks Minimal Neon ORM ORM:** Path Pool Postgres Production Purpose Pydantic Responsibility Runtime) Runtime: SQLAlchemy Server Serverless Settings Step Step-by-Step Storage Strict TCP Template Transit URLs\[cite: Uvicorn Validation .env.example .env, .gitignore BaseSettings\[cite: DeclarativeBase text app/\_\_init\_\_.py app/core/\_\_init\_\_.py app/core/config.py app/db/\_\_init\_\_.py app/db/session.py app/main.py psycopg requirements.txt and application asynchronous basic binary boot-time caches, check, compatibility\[cite: configuration connection core database dependency driver efficiency\[cite: enforce engine, enterprise-grade entry environment exclude execution fastapi for handler\[cite: health hints in lifespan lightweight, log maintaining mapping modern of outputs\[cite: package\[cite: pattern performance\[cite: point, production real required root scalability\[cite: secrets secrets\[cite: security serverless sessionmaker, set\[cite: settings showing sslmode="require" strict the to type using utilizing validation variables virtualenvs, while without yield | │ ┌────────────────────────────────────────────────────────────────────────┐ └────────────────────────────────────────────────────────────────────────┘ └───────────────────────────────────┬────────────────────────────────────┘ ▼\>=0.110.0 uvicorn\[standard\]\>=0.28.0 pydantic\>=2.6.0 pydantic-settings\>=2.2.0 sqlalchemy\>=2.0.28 psycopg\[binary\]\>=3.1.18 python-dotenv\>=1.0.1

\#\#\#\# Step 2: Environment Configuration Template (\`.env.example\`)

\`\`\`env  
\# Runtime Environment Configuration  
ENVIRONMENT=development

\# Database Connection (Neon Postgres)  
DATABASE\_URL=postgresql+psycopg://user:password@ep-something.neon.tech/dbname?sslmode=require

\# Auth Settings  
JWT\_SECRET\_KEY=change-this-to-a-super-secret-key-at-least-32-chars-long

#### **Step 3: Application Configuration (app/core/config.py)**

Python  
"""  
app/core/config.py

PURPOSE:  
Centralized settings management using Pydantic Settings.  
Validates required environment variables at application startup.  
"""

from typing import Literal  
from pydantic import Field  
from pydantic\_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):  
    ENVIRONMENT: Literal\["development", "testing", "staging", "production"\] \= "development"  
      
    \# Neon Database Connection String  
    DATABASE\_URL: str \= Field(..., description="PostgreSQL connection string")  
      
    \# Cryptographic Secret (min 32 chars)  
    JWT\_SECRET\_KEY: str \= Field(..., min\_length=32, description="JWT signing secret")  
    JWT\_ALGORITHM: str \= "HS256"  
      
    model\_config \= SettingsConfigDict(  
        env\_file=".env",  
        env\_file\_encoding="utf-8",  
        case\_sensitive=False,  
        extra="ignore"  
    )

settings \= Settings()

#### **Step 4: Database Engine & Session Setup (app/db/session.py)**

Python  
"""  
app/db/session.py

PURPOSE:  
Configures SQLAlchemy 2.0 ORM engine and session factory.  
Provides session dependency for FastAPI routes.  
"""

from typing import Generator  
from sqlalchemy import create\_engine, text  
from sqlalchemy.orm import sessionmaker, DeclarativeBase  
from app.core.config import settings

\# Configure database engine with connection pooling compatible with Neon Serverless  
engine \= create\_engine(  
    settings.DATABASE\_URL,  
    pool\_pre\_ping=True,  \# Automatically check for broken/idle serverless connections  
    pool\_recycle=1800,   \# Recycle connections every 30 minutes  
)

SessionLocal \= sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):  
    """Base class for SQLAlchemy ORM models."""  
    pass

def get\_db() \-\> Generator:  
    """FastAPI dependency yielding database session per request."""  
    db \= SessionLocal()  
    try:  
        yield db  
    finally:  
        db.close()

#### **Step 5: Application Entrypoint & Health Probe (app/main.py)**

Python  
"""  
app/main.py

PURPOSE:  
FastAPI entry point initializing application routes and health check endpoints.  
"""

from contextlib import asynccontextmanager  
from fastapi import FastAPI, Depends, status, HTTPException  
from sqlalchemy.orm import Session  
from sqlalchemy import text

from app.core.config import settings  
from app.db.session import get\_db, engine

@asynccontextmanager  
async def lifespan(app: FastAPI):  
    \# Startup actions  
    yield  
    \# Shutdown actions  
    engine.dispose()

app \= FastAPI(  
    title="Varsity Companion API",  
    version="0.1.0",  
    lifespan=lifespan  
)

@app.get("/", status\_code=status.HTTP\_200\_OK)  
def root():  
    return {"message": "Varsity Companion API Online", "environment": settings.ENVIRONMENT}

@app.get("/health", status\_code=status.HTTP\_200\_OK)  
def health\_check(db: Session \= Depends(get\_db)):  
    """Health check endpoint verifying database connectivity."""  
    try:  
        \# Execute minimal ping query  
        db.execute(text("SELECT 1"))  
        return {"status": "healthy", "database\_connected": True}  
    except Exception as e:  
        raise HTTPException(  
            status\_code=status.HTTP\_503\_SERVICE\_UNAVAILABLE,  
            detail=f"Database connectivity check failed: {str(e)}"  
        )

### **4\. Verification & Acceptance Criteria**

To complete Day 1, execute the following steps in your local terminal:

> 1. **Virtual Environment Setup:**  
>    Bash  
>    python \-m venv venv  
>    source venv/bin/activate  \# On Windows: venv\\Scripts\\activate  
>    pip install \-r requirements.txt

> 2. **Configure .env File:** Copy .env.example to .env and fill in your actual Neon Postgres connection string and secret key.  
> 3. **Launch Local Server:**  
>    Bash  
>    uvicorn app.main:app \--reload

> 4. **Smoke Test Health Endpoint:**  
>    Bash  
>    curl \-i \[http://127.0.0.1:8000/health\](http://127.0.0.1:8000/health)

>    **Expected Response:**  
>    HTTP  
>    HTTP/1.1 200 OK  
>    content-type: application/json

>    {"status":"healthy","database\_connected":true}  
