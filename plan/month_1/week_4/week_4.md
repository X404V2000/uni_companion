  
Week 4's primary objective is **Operational Readiness, CI/CD Automation, Containerization, and Staging Parity**. Here is the complete day-by-day plan for what we will be doing this week:

### **Month 1, Week 4 Schedule**

> * **Day 1 (Monday): GitHub Actions CI/CD Pipeline**  
  * Set up automated testing and code linting workflows (.github/workflows/ci.yml).  
  * Provision an ephemeral PostgreSQL container inside GitHub Actions runners to run migrations (alembic upgrade head) and pytest automatically on every commit.  
> * **Day 2 (Tuesday): Dockerization & Containerization**  
  * Build a multi-stage Dockerfile and .dockerignore for the FastAPI backend engine to keep production images lightweight (\<150MB).  
  * Configure docker-compose.yml to run the FastAPI app alongside a local PostgreSQL instance for easy one-command local developer onboarding (docker compose up).  
> * **Day 3 (Wednesday): Production Configuration & Environment Hardening**  
  * Enforce strict production configuration checks in app/core/config.py.  
  * Ensure production deployment toggles enforce Secure=True on cookies, disable Swagger API docs (/docs and /openapi.json) in production mode, and validate required environment variables at boot.  
> * **Day 4 (Thursday): Staging Deployment & Cloudflare WAF Setup**  
  * Deploy the application image to a staging environment (Render/Hetzner) connected to a staging Neon Postgres database.  
  * Configure Cloudflare Free Tier DNS proxying, TLS 1.3 encryption, and basic WAF security rules.  
> * **Day 5 (Friday): Month 1 Coherence Review & Load Testing**  
  * Run adversarial smoke tests against the live staging URL (verifying cookie headers, CORS, rate limits, and SSL termination).  
  * Execute a light load test (locust / k6) to verify endpoint response times under concurrent load.  
  * Conduct a final Month 1 review before transitioning into Month 2's Opportunity Engine features.

