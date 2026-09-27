# **eWeek 4, Day 1 Implementation Blueprint — GitHub Actions CI/CD Pipeline**

**Project:** Varsity Companion API  
**Target:** Week 4, Day 1 (Automated Testing & Linting Pipeline)  
**Author:** Senior Systems Design & Architecture Engineer  
**Status:** Ready for Implementation

## **1\. Technical Objectives**

> * **Automate Testing Pipeline:** Set up a GitHub Actions workflow that executes pytest automatically on every push or pull request to main or develop.  
> * **Database Service Container:** Provision a temporary PostgreSQL container inside the GitHub Actions runner so integration tests run against a real database instance rather than mocks.  
> * **Code Quality & Linting:** Enforce code formatting and linting checks using ruff.  
> * **Migration Verification:** Ensure alembic upgrade head runs cleanly during the pipeline build before executing the test suite.

## **2\. File Implementation Map**

| File Path | Action | Description |
| :---- | :---- | :---- |
| .github/workflows/ci.yml | **NEW** | GitHub Actions CI workflow definition file. |
| requirements-dev.txt | **NEW / UPDATE** | Development dependencies (pytest, httpx, ruff, alembic, pytest-cov). |
| pyproject.toml or ruff.toml | **NEW / UPDATE** | Linting rules and configuration for ruff. |

## **3\. Step-by-Step Developer Implementation Guide**

### **Step 1: Configure .github/workflows/ci.yml**

Create the workflow file to set up Python 3.11, spin up PostgreSQL 15, apply Alembic migrations, and run the test suite:

YAML  
name: Varsity Companion CI Pipeline

on:  
  push:  
    branches: \[ main, develop \]  
  pull\_request:  
    branches: \[ main, develop \]

jobs:  
  test:  
    runs-on: ubuntu-latest

    services:  
      postgres:  
        image: postgres:15-alpine  
        env:  
          POSTGRES\_USER: test\_user  
          POSTGRES\_PASSWORD: test\_password  
          POSTGRES\_DB: varsity\_companion\_ci\_test  
        ports:  
          \- 5432:5432  
        options: \>-  
          \--health-cmd pg\_isready  
          \--health-interval 10s  
          \--health-timeout 5s  
          \--health-retries 5

    env:  
      ENVIRONMENT: testing  
      DATABASE\_URL: postgresql://test\_user:test\_password@localhost:5432/varsity\_companion\_ci\_test  
      TEST\_DATABASE\_URL: postgresql://test\_user:test\_password@localhost:5432/varsity\_companion\_ci\_test  
      JWT\_SECRET\_KEY: ci-testing-super-secret-key-min-32-chars

    steps:  
      \- name: Check out repository  
        uses: actions/checkout@v4

      \- name: Set up Python 3.11  
        uses: actions/setup-python@v5  
        with:  
          python-version: '3.11'  
          cache: 'pip'

      \- name: Install dependencies  
        run: |  
          python \-m pip install \--upgrade pip  
          if \[ \-f requirements.txt \]; then pip install \-r requirements.txt; fi  
          pip install ruff pytest pytest-cov

      \- name: Lint code with Ruff  
        run: |  
          ruff check app/ tests/

      \- name: Run Alembic Migrations  
        run: |  
          alembic upgrade head

      \- name: Run Pytest Test Suite  
        run: |  
          pytest \--verbose

### **Step 2: Configure Ruff Linting (pyproject.toml)**

Create or update pyproject.toml in your root directory to customize code quality rules:

Ini, TOML  
\[tool.ruff\]  
line-length \= 100  
target-version \= "py311"

\[tool.ruff.lint\]  
select \= \["E", "F", "W", "I"\]  
ignore \= \[\]

\[tool.ruff.lint.isort\]  
known-first-party \= \["app"\]

## **4\. Verification & Acceptance Criteria**

> 1. **Pipeline Trigger:** Pushing a commit or creating a pull request to main or develop automatically runs the Varsity Companion CI Pipeline.  
> 2. **Migration Verification:** Alembic applies migrations 0001, 0002, and 0003 to the PostgreSQL service container without error.  
> 3. **Automated Test Coverage:** All **121 automated tests** run and pass inside the GitHub Actions virtual environment.  
> 4. **Clean Code Audit:** ruff check runs without reporting syntax errors or unhandled linting violations.