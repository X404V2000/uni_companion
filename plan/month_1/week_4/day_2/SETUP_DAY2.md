### **Architectural & Algorithmic Design Strategy (Week 4, Day 2\)**

**To:** Lead Developer  
**From:** Senior Systems Design & Architecture Engineer  
**Date:** 11 September 2026  
**Focus:** Operational Hardening, Algorithmic Time/Space Complexity ($O(N)$ Audit), & System Scale Safeguards  
**Status:** **Week 4, Day 2 Specification Active**

### **1\. Scaling & Performance Design Philosophy**

As per your operational requirement, every single feature built from this point forward must be designed with **worst-case time/space complexity analysis** and **failure-mode resilience**.  
We assume our database will scale to **100,000+ active students**. A query that runs in 2 milliseconds on a developer DB can easily bring down the API under high concurrent load (e.g., during SA university assignment submission deadlines or exam periods) if it performs full table scans or consumes unbounded memory.

                     ┌──────────────────────────────────────────────┐  
                     │            Client / Mobile App               │  
                     └──────────────────────┬───────────────────────┘  
                                            │ HTTP / JSON Payload  
                                            ▼  
                     ┌──────────────────────────────────────────────┐  
                     │          FastAPI Middleware Layer            │  
                     │  \- Body Guard (10 KB Max Payload)            │  
                     │  \- Slowapi Rate Limiting (5-100 req/min)     │  
                     └──────────────────────┬───────────────────────┘  
                                            │  
                                            ▼  
                     ┌──────────────────────────────────────────────┐  
                     │               Service Layer                  │  
                     │  \- Time Complexity: O(1) to O(K) bounded     │  
                     │  \- Memory Bounds: Max 100 items per response │  
                     └──────────────────────┬───────────────────────┘  
                                            │ Bounded Offset/Limit  
                                            ▼  
                     ┌──────────────────────────────────────────────┐  
                     │          Neon Serverless Postgres            │  
                     │  \- B-Tree Composite Index Coverage           │  
                     │  \- SSL Required & Connection Pooling         │  
                     └──────────────────────────────────────────────┘

#### **Non-Negotiable Engineering Rules for High Concurrency:**

> 1. **Strict $O(1)$ Memory Footprint on API Workers:** No endpoint is allowed to fetch unbounded datasets into Python memory. All list endpoints **must** execute DB-level LIMIT and OFFSET bounds.  
> 2. **$O(\\log N)$ Index-Backed Query Complexity:** Every WHERE, ORDER BY, and JOIN clause must hit a composite B-Tree index. Unindexed $O(N)$ full-table scans are explicitly forbidden in production queries.  
> 3. **Defense-in-Depth Failure Containment:**  
   * **Database Layer:** Query execution timeouts (statement\_timeout \= 5000ms) to kill run-away queries before they deplete serverless DB compute.  
   * **Network Layer:** Maximum body size middleware (10 KB) to block memory exhaustion attacks.  
   * **Rate Limiting Layer:** slowapi throttling to prevent credential stuffing and DoS attacks.

### **2\. Week 4, Day 2 Implementation Blueprint — Containerization & Local Production Parity**

Day 2 focuses on packaging the application into lightweight, production-identical Docker containers. This ensures zero configuration drift between development, staging, and production runners while hardening instance startup performance.

┌────────────────────────────────────────────────────────────────────────┐  
│                        Multi-Stage Docker Image                        │  
├───────────────────────────────────┬────────────────────────────────────┤  
│ Stage 1: Build Dependencies       │ Stage 2: Runtime Container         │  
│ \- python:3.11-slim                │ \- Minimal non-root user (appuser)  │  
│ \- GCC & build tools               │ \- Size: \<150MB                     │  
│ \- Pip compile packages            │ \- Fast cold-start boot time        │  
└───────────────────────────────────┴────────────────────────────────────┘

### **3\. File Implementation Map**

| File Path | Action | Purpose & Scale Guarantee |
| :---- | :---- | :---- |
| Dockerfile | **NEW** | Multi-stage build producing a minimal, secure Python runtime container (\<150MB). |
| .dockerignore | **NEW** | Prevents local caches, virtual environments, and secrets from entering build contexts. |
| docker-compose.yml | **NEW** | Local production parity runner (FastAPI container \+ PostgreSQL service). |
| pyproject.toml | **UPDATE** | Configures pytest coverage and performance execution flags. |

### **4\. Step-by-Step Developer Implementation Guide**

#### **Step 1: Create Dockerfile (Multi-Stage Runtime Optimization)**

Dockerfile  
\# \==========================================  
\# STAGE 1: Builder  
\# \==========================================  
FROM python:3.11-slim AS builder

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \\  
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install \-y \--no-install-recommends \\  
    build-essential \\  
    libpq-dev \\  
    && rm \-rf /var/lib/apt/lists/\*

COPY requirements.txt .  
RUN pip install \--no-cache-dir \--user \-r requirements.txt

\# \==========================================  
\# STAGE 2: Production Runtime Environment  
\# \==========================================  
FROM python:3.11-slim AS runner

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \\  
    PYTHONUNBUFFERED=1 \\  
    PATH="/home/appuser/.local/bin:${PATH}"

\# Install minimal runtime system libraries  
RUN apt-get update && apt-get install \-y \--no-install-recommends \\  
    libpq5 \\  
    curl \\  
    && rm \-rf /var/lib/apt/lists/\*

\# Run as non-privileged system user to satisfy OWASP Container Security  
RUN useradd \-m \-u 1000 appuser  
USER appuser

\# Copy installed Python packages from builder stage  
COPY \--from=builder /root/.local /home/appuser/.local  
COPY \--chown=appuser:appuser . /app

EXPOSE 8000

\# Health check for load balancers / orchestrators  
HEALTHCHECK \--interval=30s \--timeout=5s \--start-period=5s \--retries=3 \\  
  CMD curl \-f http://localhost:8000/health || exit 1

CMD \["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"\]

#### **Step 2: Create .dockerignore**

.git  
.gitignore  
.env  
.env.\*  
venv/  
\_\_pycache\_\_/  
\*.pyc  
\*.pyo  
\*.pyd  
.pytest\_cache/  
.coverage  
htmlcov/  
logs/  
\*.log

#### **Step 3: Create docker-compose.yml (Local Scaling Environment)**

YAML  
version: '3.8'

services:  
  web:  
    build:  
      context: .  
      dockerfile: Dockerfile  
    container\_name: varsity\_companion\_api  
    ports:  
      \- "8000:8000"  
    environment:  
      \- ENVIRONMENT=development  
      \- DATABASE\_URL=postgresql://app\_user:app\_password@db:5432/varsity\_companion\_dev  
      \- JWT\_SECRET\_KEY=local-docker-development-super-secret-key-32chars  
    depends\_on:  
      db:  
        condition: service\_healthy

  db:  
    image: postgres:15-alpine  
    container\_name: varsity\_companion\_db  
    environment:  
      \- POSTGRES\_USER=app\_user  
      \- POSTGRES\_PASSWORD=app\_password  
      \- POSTGRES\_DB=varsity\_companion\_dev  
    ports:  
      \- "5432:5432"  
    volumes:  
      \- postgres\_data:/var/lib/postgresql/data  
    healthcheck:  
      test: \["CMD-SHELL", "pg\_isready \-U app\_user \-d varsity\_companion\_dev"\]  
      interval: 5s  
      timeout: 5s  
      retries: 5

volumes:  
  postgres\_data:

### **5\. Algorithmic Complexity & Scale Verification Audit**

To prevent future load failures under high user volume, every API component must adhere to these algorithmic performance metrics:

┌─────────────────────────────┬───────────────────┬───────────────────┬──────────────────────────────────────────┐  
│ Component / Route           │ Time Complexity   │ Space Complexity  │ High-Volume Scale Safeguard              │  
├─────────────────────────────┼───────────────────┼───────────────────┼──────────────────────────────────────────┤  
│ Auth Verification (/me)     │ O(log N)          │ O(1)              │ Single indexed UUID lookup on users table│  
│ List Tasks (/tasks)         │ O(log N \+ K)      │ O(K) \[K \<= 100\]   │ Mandatory Bounded Pagination (Limit/Off) │  
│ Schedule Grid (/timetable)  │ O(log N \+ S)      │ O(S) \[S \<= 50\]    │ Indexed on (user\_id, day\_of\_week)        │  
│ Password Hash (bcrypt)      │ O(2^W)            │ O(1)              │ Rate Limited (5 req/min) to prevent CPU  │  
└─────────────────────────────┴───────────────────┴───────────────────┴──────────────────────────────────────────┘  
  \* N \= Total database rows, K \= Page size limit (max 100), S \= Weekly slots, W \= bcrypt work factor (12)

### **6\. Acceptance Criteria for Day 2**

> 1. **Docker Container Build:** Running docker build \-t varsity-companion-api . completes successfully, producing a slim image (\<150MB).  
> 2. **Local Parity Boot:** Executing docker compose up provisions both PostgreSQL and the API server, applies database connections, and passes health checks.  
> 3. **OWASP Non-Root Security:** Executing docker exec varsity\_companion\_api whoami outputs appuser (non-privileged container process).  
> 4. **Health Check Endpoint:** GET http://localhost:8000/health returns 200 OK inside the containerized environment.  
> 5. **Zero Test Regressions:** All **121 automated tests** continue to pass cleanly.