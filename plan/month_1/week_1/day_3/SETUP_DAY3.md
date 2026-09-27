# **Authentication & Signup Architecture Decisions**

When designing user onboarding, the balance between security, developer velocity, and low friction is critical. Below are the recommended standards and decision frameworks for your backend architecture, formatted in a clean markdown guide.

## **Architecture Summary**

| Decision Area | Recommendation | Primary Reason |
| :---- | :---- | :---- |
| **Response Format** | Auto-login returning JWT \+ basic user object | Minimizes initial friction and prevents redundant login calls. |
| **Email Verification** | Deferred / Soft Verification | Keeps friction low during onboarding while allowing security barriers later. |
| **Password Policy** | Length-based (min 8–12 chars) with basic complexity checks | Standard industry practices show passphrase length beats arbitrary complexity. |
| **Welcome Email** | Skip or use free-tier transactional provider | Zero budget priority; easy to add post-launch. |
| **Auto-login Behavior** | Include auth token in response | Eliminates immediate drop-off from forcing a manual login. |
| **Terms & Privacy** | Store version string (v1.0.0) \+ timestamp | Keeps DB lightweight and decouples legal policy hosting from schemas. |
| **Profile Completion** | Progressive / Deferred profile completion | Prevents drop-off during the initial signup step. |

## **Detailed Architectural Breakdown**

### **1\. Response Format & Auto-Login Strategy**

**Recommendation:** Return both user details and an active authentication token (e.g., JWT or session cookie) upon successful signup.  
Forcing users to sign up and immediately re-enter their credentials on a login screen creates unnecessary friction and increases drop-off.  
**Recommended API Response (POST /api/v1/auth/signup):**

JSON  
{  
  "status": "success",  
  "data": {  
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",  
    "user": {  
      "id": "usr\_987654321",  
      "email": "student@university.edu",  
      "isEmailVerified": false,  
      "createdAt": "2026-09-04T13:58:00Z"  
    }  
  }  
}

### **2\. Email Verification Workflow**

**Recommendation:** Implement **Deferred Verification** (Soft Verification).

* **Immediate Access:** Allow users to sign up and immediately access low-risk areas of the app (e.g., browsing content, editing their profile).  
* **Restricted Action Gates:** Require verified status only when taking critical or expensive actions (e.g., posting content, making purchases, or accessing sensitive APIs).  
* **Benefits:** Reduces drop-off while still preventing fake account abuse where it actually impacts your application.

### **3\. Password Policy**

**Recommendation:** Require a minimum length (8 to 12 characters) with basic validation, rather than complex strict regex.  
NIST guidelines recommend moving away from arbitrary character requirements (e.g., requiring at least one special character, upper case, and number), as they often force users to make predictable replacements (P@ssword1).

* **Minimum Length:** 8–12 characters.  
* **Basic Rules:** At least 1 number or letter (keeps it reasonable without frustrating users on mobile keyboards).  
* **Security Layer:** Check input against common leaked passwords or enforce rate-limiting on auth endpoints instead.

### **4\. Welcome Email (Zero-Budget Strategy)**

**Recommendation:** Skip initially or utilize a free-tier transactional email service.  
If budget is strictly zero, do not make email delivery a blocking deployment dependency.

* **Free Tier Services:** Platforms like Resend, Brevo, or SendGrid offer free tiers (e.g., 100–300 emails/day), which are sufficient for early stage MVP testing.  
* **Fallback Strategy:** If skipping emails initially, log transactional events (like account creation) to your server logging tool so you can audit signups without sending outgoing emails.

### **5\. Terms & Privacy Policy Tracking**

**Recommendation:** Store consent metadata via **Version Strings** and **Timestamps**.  
Do not hardcode specific static links directly into database user rows. Instead, store key metadata tracking when and what the user accepted.  
**Recommended Database Schema Fields:**

SQL  
ALTER TABLE users ADD COLUMN terms\_version VARCHAR(20) NOT NULL;  
ALTER TABLE users ADD COLUMN privacy\_version VARCHAR(20) NOT NULL;  
ALTER TABLE users ADD COLUMN accepted\_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT\_TIMESTAMP;

* **Application Config:** Store current legal URLs in your frontend config or environment variables (e.g., TERMS\_URL=\[https://example.com/terms\](https://example.com/terms)).  
* **Audit Trail:** When terms update to v1.1.0, your application can compare the user's terms\_version and trigger a re-consent modal if necessary.

### **6\. User Profile Completion (Academic Details)**

**Recommendation:** Progressive / Deferred Profile Completion.

* **Step 1 (Required Signup):** Email, Password, and Terms consent only.  
* **Step 2 (Optional / Onboarding Flow):** Once authenticated, prompt the user for academic details (university, major, graduation year) through an onboarding wizard or banner.

Making academic details mandatory up front dramatically lowers signup conversion rates. Keep initial conversion as frictionless as possible, then prompt for additional information once the user is inside the application.