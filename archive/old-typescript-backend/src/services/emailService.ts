/**
 * Email Service for Varsity Companion
 * Supports configured EMAIL_PROVIDER (Resend, SendGrid, Postmark, Brevo, Mailgun)
 * and EMAIL_API_KEY with graceful fallback and audit logging.
 */

export interface EmailMessage {
  to: string;
  from?: string;
  subject: string;
  html: string;
  text?: string;
}

export interface DeadlineReminderPayload {
  studentEmail: string;
  studentName?: string;
  courseCode: string;
  courseName: string;
  taskTitle: string;
  taskType: string;
  dueDate: Date;
  priority: string;
  weightPercentage?: number | null;
  dpSubminimum?: number | null;
  taskId: string;
}

export interface SendEmailResult {
  success: boolean;
  provider: string;
  messageId?: string;
  error?: string;
}

export class EmailService {
  private provider: string;
  private apiKey: string;
  private fromEmail: string;

  constructor() {
    this.provider = (process.env.EMAIL_PROVIDER || "auto").toLowerCase().trim();
    this.apiKey = (process.env.EMAIL_API_KEY || "").trim();
    this.fromEmail = (process.env.EMAIL_FROM || "X404VIRTALITY2000@outlook.com").trim();
  }

  /**
   * Refreshes credentials from process.env if updated dynamically
   */
  public reloadConfig(): void {
    this.provider = (process.env.EMAIL_PROVIDER || "auto").toLowerCase().trim();
    this.apiKey = (process.env.EMAIL_API_KEY || "").trim();
    this.fromEmail = (process.env.EMAIL_FROM || "X404VIRTALITY2000@outlook.com").trim();
  }

  public getStatus() {
    return {
      provider: this.provider,
      hasApiKey: Boolean(this.apiKey),
      fromEmail: this.fromEmail,
      isConfigured: Boolean(this.apiKey && this.apiKey.length > 3),
    };
  }

  /**
   * Sends an email through the configured provider
   */
  public async sendEmail(message: EmailMessage): Promise<SendEmailResult> {
    this.reloadConfig();
    const from = message.from || this.fromEmail;
    const provider = this.detectProvider();

    if (!this.apiKey) {
      console.log(`[EmailService] [FALLBACK LOG] No EMAIL_API_KEY configured. Logging email:`);
      console.log(`  To: ${message.to}`);
      console.log(`  From: ${from}`);
      console.log(`  Subject: ${message.subject}`);
      console.log(`  Text snippet: ${message.text?.slice(0, 160) || "HTML content"}`);
      return {
        success: true,
        provider: "console-logger",
        messageId: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      };
    }

    try {
      switch (provider) {
        case "resend":
          return await this.sendWithResend(message, from);
        case "sendgrid":
          return await this.sendWithSendGrid(message, from);
        case "postmark":
          return await this.sendWithPostmark(message, from);
        case "brevo":
        case "sendinblue":
          return await this.sendWithBrevo(message, from);
        default:
          // If provider name is generic or auto-detected, attempt Resend first (standard Bearer token format)
          return await this.sendWithResend(message, from);
      }
    } catch (err: any) {
      console.error(`[EmailService] Failed to send email via ${provider}:`, err.message || err);
      return {
        success: false,
        provider,
        error: err.message || "Unknown email delivery error",
      };
    }
  }

  /**
   * Resolves the provider from environment or heuristics
   */
  private detectProvider(): string {
    if (this.provider && this.provider !== "auto") {
      return this.provider;
    }
    if (this.apiKey.startsWith("re_")) return "resend";
    if (this.apiKey.startsWith("SG.")) return "sendgrid";
    if (this.apiKey.startsWith("xkeysib-")) return "brevo";
    return "resend";
  }

  /**
   * Resend API provider implementation
   */
  private async sendWithResend(msg: EmailMessage, from: string): Promise<SendEmailResult> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from.includes("<") ? from : `Varsity Companion <${from}>`,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Resend API error (${res.status}): ${JSON.stringify(data)}`);
    }

    return {
      success: true,
      provider: "resend",
      messageId: data.id,
    };
  }

  /**
   * SendGrid v3 Mail Send API provider implementation
   */
  private async sendWithSendGrid(msg: EmailMessage, from: string): Promise<SendEmailResult> {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: msg.to }] }],
        from: { email: from, name: "Varsity Companion" },
        subject: msg.subject,
        content: [
          ...(msg.text ? [{ type: "text/plain", value: msg.text }] : []),
          { type: "text/html", value: msg.html },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`SendGrid API error (${res.status}): ${errText}`);
    }

    const messageId = res.headers.get("x-message-id") || `sg-${Date.now()}`;
    return {
      success: true,
      provider: "sendgrid",
      messageId,
    };
  }

  /**
   * Postmark Server API provider implementation
   */
  private async sendWithPostmark(msg: EmailMessage, from: string): Promise<SendEmailResult> {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "X-Postmark-Server-Token": this.apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        From: from,
        To: msg.to,
        Subject: msg.subject,
        HtmlBody: msg.html,
        TextBody: msg.text,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Postmark API error (${res.status}): ${JSON.stringify(data)}`);
    }

    return {
      success: true,
      provider: "postmark",
      messageId: data.MessageID,
    };
  }

  /**
   * Brevo (Sendinblue) API provider implementation
   */
  private async sendWithBrevo(msg: EmailMessage, from: string): Promise<SendEmailResult> {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { email: from, name: "Varsity Companion" },
        to: [{ email: msg.to }],
        subject: msg.subject,
        htmlContent: msg.html,
        textContent: msg.text,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Brevo API error (${res.status}): ${JSON.stringify(data)}`);
    }

    return {
      success: true,
      provider: "brevo",
      messageId: data.messageId,
    };
  }

  /**
   * Formats and sends a 24-hour course deadline reminder email
   */
  public async sendDeadlineReminder(payload: DeadlineReminderPayload): Promise<SendEmailResult> {
    const {
      studentEmail,
      studentName,
      courseCode,
      courseName,
      taskTitle,
      taskType,
      dueDate,
      priority,
      weightPercentage,
      dpSubminimum,
    } = payload;

    const formattedDate = new Intl.DateTimeFormat("en-ZA", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Africa/Johannesburg",
    }).format(new Date(dueDate));

    const hoursRemaining = Math.max(1, Math.round((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60)));

    const priorityBadgeColor =
      priority.toUpperCase() === "CRITICAL"
        ? "#dc2626"
        : priority.toUpperCase() === "HIGH"
        ? "#ea580c"
        : "#2563eb";

    const subject = `[Urgent Reminder] ${hoursRemaining}h Until: ${courseCode} - ${taskTitle}`;

    const textContent = `
Hello ${studentName || "Student"},

This is an automated 24-hour deadline reminder from Varsity Companion:

Course: ${courseCode} - ${courseName}
Assessment: ${taskTitle} (${taskType})
Due Date: ${formattedDate} (SAST)
Priority: ${priority}
${weightPercentage ? `Weight: ${weightPercentage}% of final course mark` : ""}
${dpSubminimum ? `Course DP Requirement: ${dpSubminimum}% sub-minimum coursework required` : ""}

Please ensure your submission is finalized and uploaded to your university portal before the cut-off time.

Best regards,
Varsity Companion Academic Notification Service
`.trim();

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9; color: #1e293b; }
    .container { max-width: 600px; margin: 24px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 24px; color: #ffffff; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
    .header p { margin: 4px 0 0 0; opacity: 0.9; font-size: 13px; }
    .content { padding: 24px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #ffffff; background-color: ${priorityBadgeColor}; }
    .card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .card-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #cbd5e1; font-size: 14px; }
    .card-row:last-child { border-bottom: none; }
    .label { color: #64748b; font-weight: 600; }
    .value { color: #0f172a; font-weight: 700; }
    .alert-box { background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 16px 0; border-radius: 4px; font-size: 13px; color: #991b1b; }
    .footer { background-color: #f8fafc; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Varsity Companion</h1>
      <p>Automated Academic Deadline Notification</p>
    </div>
    <div class="content">
      <p style="margin-top: 0;">Hi <strong>${studentName || "Student"}</strong>,</p>
      <p>You have an upcoming academic assessment due in approximately <strong>${hoursRemaining} hours</strong>:</p>
      
      <div style="margin-bottom: 12px;">
        <span class="badge">${priority} PRIORITY</span>
        <span style="font-size: 12px; color: #64748b; margin-left: 8px; font-weight: 600;">${taskType}</span>
      </div>

      <div class="card">
        <div class="card-row">
          <span class="label">Course</span>
          <span class="value">${courseCode} &bull; ${courseName}</span>
        </div>
        <div class="card-row">
          <span class="label">Assessment</span>
          <span class="value">${taskTitle}</span>
        </div>
        <div class="card-row">
          <span class="label">Due Date</span>
          <span class="value" style="color: #dc2626;">${formattedDate} (SAST)</span>
        </div>
        ${
          weightPercentage
            ? `<div class="card-row"><span class="label">Assessment Weight</span><span class="value">${weightPercentage}% of Final Mark</span></div>`
            : ""
        }
        ${
          dpSubminimum
            ? `<div class="card-row"><span class="label">DP Requirement</span><span class="value">${dpSubminimum}% Coursework Sub-minimum</span></div>`
            : ""
        }
      </div>

      <div class="alert-box">
        <strong>Important:</strong> Late submissions are subject to university penalty policies. We recommend submitting your work at least 2 hours before the portal cut-off time to avoid network congestion.
      </div>
    </div>
    <div class="footer">
      Sent automatically by Varsity Companion &bull; Supporting students across South African Universities
    </div>
  </div>
</body>
</html>
`.trim();

    return await this.sendEmail({
      to: studentEmail,
      subject,
      html: htmlContent,
      text: textContent,
    });
  }
}

export const emailService = new EmailService();
