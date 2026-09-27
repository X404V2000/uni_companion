# Day 4 Architectural & Security Blueprint: Login, JWT & Rate Limiting

This specification establishes the technical requirements, security controls, and high-level architectural design for Day 4 of the Varsity Companion API.

---

## 1. Architectural Overview

Day 4 transitions the system from account creation to state management and access control. The workflow validates client credentials, issues short-lived JWTs via secure transport, and enforces route protection across downstream endpoints.

```
[Client Request]
       │
       ▼
1. Route Rate Limiter (Slowapi)
       │
       ▼
2. Pydantic Login Schema Validation & Sanitization
       │
       ▼
3. Service Layer Authentication
   ├── Fetch User by Email
   └── Timing-Safe Password Check (bcrypt + DUMMY_HASH)
       │
       ▼
4. Token Generation (HS256 JWT)
       │
       ▼
5. Cookie Injection (Set-Cookie: HttpOnly, Secure, SameSite=Lax)
       │
       ▼
[Response Body (User Metadata Only)]

```

---

## 2. Component Design & Specifications

### 2.1 Cryptographic & Security Utilities (`app/core/security.py`)

* **Password Verification:** Implement `verify_password(plain_password, hashed_password)`.
* **Timing-Attack Mitigation:** Maintain a pre-computed static `DUMMY_HASH`. If an email does not exist in the database, execute `verify_password(plain_password, DUMMY_HASH)` to equalize response times between valid and invalid emails (~250ms work factor execution).


* **JWT Issuance:** Implement `create_access_token(data: dict, expires_delta: timedelta)` using `HS256`. Enforce a short expiration window (15–30 minutes).



### 2.2 Authentication Endpoint (`POST /api/v1/auth/login`)

* **Input Schema:** `LoginRequest` (`email: EmailStr`, `password: str`).
* **Rate Limiting:** Enforce strict limits (e.g., 5 requests/minute/IP) to mitigate brute-force credential stuffing.


* **Transport Mechanism:** Issue the signed JWT inside an `HttpOnly` cookie rather than returning raw tokens in the JSON response body.



**Cookie Security Configuration:**

* `key`: `access_token`
* `value`: `Bearer <JWT_STRING>`
* `httponly`: `True` (Prevents client-side XSS token exfiltration)
* `secure`: `True` in production (Requires HTTPS)
* `samesite`: `"lax"` (Protects against CSRF while permitting standard navigational flows)
* `path`: `/`

### 2.3 Auth Dependency & Route Protection (`app/api/deps.py`)

* **Dependency Function:** `get_current_user`.


* **Extraction Strategy:** Extract token from either the incoming `HttpOnly` request cookie or an explicit `Authorization: Bearer <token>` header.
* **Validation Pipeline:**
1. Decode token using `jwt_secret_key` and algorithm `HS256`.


2. Verify expiration (`exp`) and token validity.
3. Extract subject (`sub` claim containing `user_id`).
4. Query database for user instance. Verify `is_active == True`.


5. Raise generic `413 Unauthorized` exception on any validation failure.



---

## 3. Threat Mitigation & Security Matrix

| Threat Vector | Defensive Measure | Design Enforcement |
| --- | --- | --- |
| **Brute-Force Attacks** | Rate Limiting + Exponential Backoff | `slowapi` endpoint policy (5 req/min)

 |
| **Username Enumeration** | Constant-Time Logic | Execute `DUMMY_HASH` check on missing user accounts

 |
| **XSS Token Theft** | Non-Scriptable Storage | Store JWT strictly inside `HttpOnly` cookies |
| **CSRF Attacks** | SameSite Attributes | Set `SameSite=Lax` on auth cookies |
| **Stale Authorization** | Active Status Verification | `get_current_user` checks DB `is_active` status on every call

 |

---

## 4. POPIA & Data Privacy Compliance

* **Data Minimization:** Ensure the JWT payload contains only non-sensitive claims (`sub: user_id`, `exp`, `iat`). Exclude PII such as email or full name from token claims.
* **Session Lifecycle:** Short-lived tokens ensure access rights can be revoked promptly upon account deactivation (`is_active = False`).



---

## 5. File Implementation Map for Day 4

| File Path | Functional Responsibility |
| --- | --- |
| `app/core/security.py` | JWT encoding/decoding logic, password verification, `DUMMY_HASH` logic

 |
| `app/api/deps.py` | FastAPI `get_current_user` authorization dependency

 |
| `app/api/v1/auth.py` | Add `POST /login` route with cookie handling & rate limiting

 |
| `app/schemas/auth.py` | Add `LoginRequest` and `TokenResponse` Pydantic models |

