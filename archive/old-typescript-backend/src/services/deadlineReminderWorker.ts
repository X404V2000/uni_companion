/**
 * Background Service: Automated Deadline Email Reminder Worker
 * Periodically scans upcoming course deadlines within the 24-hour window,
 * dispatches notifications via EMAIL_PROVIDER/EMAIL_API_KEY, and prevents
 * duplicate reminders using the `reminderSent` flag in Neon Postgres via Prisma.
 */

import { prisma } from "../prisma";
import { emailService, DeadlineReminderPayload, SendEmailResult } from "./emailService";
import { db } from "../db";

export interface ReminderWorkerStats {
  isRunning: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  lastRunFound: number;
  lastRunSent: number;
  lastRunFailed: number;
  totalSentLifetime: number;
  totalFailedLifetime: number;
  lastError: string | null;
  history: Array<{
    timestamp: string;
    taskId: string;
    courseCode: string;
    recipient: string;
    provider: string;
    success: boolean;
    error?: string;
  }>;
}

export class DeadlineReminderWorker {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private intervalMinutes = 30; // Check every 30 minutes
  private stats: ReminderWorkerStats = {
    isRunning: false,
    intervalMinutes: 30,
    lastRunAt: null,
    lastRunFound: 0,
    lastRunSent: 0,
    lastRunFailed: 0,
    totalSentLifetime: 0,
    totalFailedLifetime: 0,
    lastError: null,
    history: [],
  };

  /**
   * Starts the background scheduler
   */
  public start(intervalMinutes: number = 30): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.intervalMinutes = Math.max(1, intervalMinutes);
    this.stats.intervalMinutes = this.intervalMinutes;
    this.stats.isRunning = true;

    console.log(`[DeadlineReminderWorker] Background worker started. Running every ${this.intervalMinutes}m.`);

    // Run an initial sweep 10 seconds after boot to catch any pending 24h reminders
    setTimeout(() => {
      this.runSweep().catch((err) => {
        console.error("[DeadlineReminderWorker] Initial sweep error:", err.message);
      });
    }, 10000);

    // Recurring interval
    this.timer = setInterval(() => {
      this.runSweep().catch((err) => {
        console.error("[DeadlineReminderWorker] Scheduled sweep error:", err.message);
      });
    }, this.intervalMinutes * 60 * 1000);
  }

  /**
   * Stops the background scheduler
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.stats.isRunning = false;
    console.log("[DeadlineReminderWorker] Background worker stopped.");
  }

  /**
   * Returns current health & statistics
   */
  public getStatus(): ReminderWorkerStats & { emailProviderStatus: any } {
    return {
      ...this.stats,
      emailProviderStatus: emailService.getStatus(),
    };
  }

  /**
   * Executes a single reminder sweep over upcoming deadlines within the 24-hour threshold
   */
  public async runSweep(): Promise<{
    found: number;
    sent: number;
    failed: number;
    details: Array<{ taskId: string; courseCode: string; recipient: string; status: string }>;
  }> {
    if (this.isProcessing) {
      console.log("[DeadlineReminderWorker] Sweep already in progress. Skipping concurrent run.");
      return { found: 0, sent: 0, failed: 0, details: [] };
    }

    this.isProcessing = true;
    const now = new Date();
    // One day (24 hours) threshold: target deadlines between now and next 28 hours that haven't been reminded yet
    const windowStart = now;
    const windowEnd = new Date(now.getTime() + 28 * 60 * 60 * 1000);

    const sweepResults: Array<{ taskId: string; courseCode: string; recipient: string; status: string }> = [];
    let sentCount = 0;
    let failedCount = 0;

    console.log(
      `[DeadlineReminderWorker] Running deadline check window: ${windowStart.toISOString()} -> ${windowEnd.toISOString()}`
    );

    try {
      // 1. Query pending deadlines from Neon Postgres via Prisma
      let pendingDeadlines: any[] = [];
      try {
        pendingDeadlines = await prisma.deadlines.findMany({
          where: {
            isCompleted: false,
            reminderSent: false,
            dueDate: {
              gte: windowStart,
              lte: windowEnd,
            },
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
                isActive: true,
              },
            },
            course: {
              select: {
                id: true,
                code: true,
                name: true,
                dpSubminimum: true,
                colorCode: true,
              },
            },
          },
          orderBy: { dueDate: "asc" },
        });
      } catch (dbErr: any) {
        console.warn("[DeadlineReminderWorker] Prisma query failed, falling back to in-memory store:", dbErr.message);
        // In-memory fallback
        pendingDeadlines = Array.from(db.tasks.values())
          .filter((t) => {
            const due = new Date(t.due_date);
            return !t.is_completed && !t.reminder_sent && due >= windowStart && due <= windowEnd;
          })
          .map((t) => {
            const user = db.users.get(t.user_id);
            const course = db.modules.get(t.module_id);
            return {
              id: t.id,
              userId: t.user_id,
              courseId: t.module_id,
              title: t.title,
              taskType: t.task_type,
              dueDate: new Date(t.due_date),
              priority: t.priority,
              weightPercentage: t.weight_percentage,
              isCompleted: t.is_completed,
              reminderSent: t.reminder_sent,
              user: user ? { id: user.id, email: user.email, fullName: user.full_name, isActive: user.is_active } : null,
              course: course ? { id: course.id, code: course.code, name: course.name, dpSubminimum: 40.0 } : null,
            };
          });
      }

      console.log(`[DeadlineReminderWorker] Found ${pendingDeadlines.length} candidate deadline(s) due within ~24 hours.`);

      for (const deadline of pendingDeadlines) {
        const studentEmail = deadline.user?.email;
        if (!studentEmail || !deadline.user?.isActive) {
          console.warn(`[DeadlineReminderWorker] Skipping deadline ${deadline.id}: No active recipient email found.`);
          continue;
        }

        const payload: DeadlineReminderPayload = {
          studentEmail,
          studentName: deadline.user.fullName || undefined,
          courseCode: deadline.course?.code || "COURSE",
          courseName: deadline.course?.name || "Academic Course",
          taskTitle: deadline.title,
          taskType: deadline.taskType,
          dueDate: deadline.dueDate,
          priority: deadline.priority,
          weightPercentage: deadline.weightPercentage,
          dpSubminimum: deadline.course?.dpSubminimum,
          taskId: deadline.id,
        };

        const sendResult: SendEmailResult = await emailService.sendDeadlineReminder(payload);

        if (sendResult.success) {
          sentCount++;
          // Flag reminder_sent = true in Neon Postgres
          try {
            await prisma.deadlines.update({
              where: { id: deadline.id },
              data: { reminderSent: true },
            });
          } catch (updateErr: any) {
            console.warn(`[DeadlineReminderWorker] Could not update reminderSent on DB for ${deadline.id}:`, updateErr.message);
          }

          // Sync in-memory task
          const memTask = db.tasks.get(deadline.id);
          if (memTask) {
            memTask.reminder_sent = true;
          }

          sweepResults.push({
            taskId: deadline.id,
            courseCode: payload.courseCode,
            recipient: studentEmail,
            status: `SENT (${sendResult.provider})`,
          });

          this.recordHistory({
            timestamp: new Date().toISOString(),
            taskId: deadline.id,
            courseCode: payload.courseCode,
            recipient: studentEmail,
            provider: sendResult.provider,
            success: true,
          });
        } else {
          failedCount++;
          sweepResults.push({
            taskId: deadline.id,
            courseCode: payload.courseCode,
            recipient: studentEmail,
            status: `FAILED: ${sendResult.error}`,
          });

          this.recordHistory({
            timestamp: new Date().toISOString(),
            taskId: deadline.id,
            courseCode: payload.courseCode,
            recipient: studentEmail,
            provider: sendResult.provider,
            success: false,
            error: sendResult.error,
          });
        }
      }

      this.stats.lastRunAt = new Date().toISOString();
      this.stats.lastRunFound = pendingDeadlines.length;
      this.stats.lastRunSent = sentCount;
      this.stats.lastRunFailed = failedCount;
      this.stats.totalSentLifetime += sentCount;
      this.stats.totalFailedLifetime += failedCount;
      this.stats.lastError = null;

      if (pendingDeadlines.length === 0) {
        console.log("[DeadlineReminderWorker] Sweep complete: No upcoming deadlines within 24-hour reminder window.");
      } else {
        console.log(
          `[DeadlineReminderWorker] Sweep complete: ${sentCount} sent, ${failedCount} failed out of ${pendingDeadlines.length} candidate(s).`
        );
      }

      return {
        found: pendingDeadlines.length,
        sent: sentCount,
        failed: failedCount,
        details: sweepResults,
      };
    } catch (err: any) {
      console.error("[DeadlineReminderWorker] Fatal error during reminder sweep:", err);
      this.stats.lastError = err.message || "Unknown error";
      return { found: 0, sent: 0, failed: 0, details: [] };
    } finally {
      this.isProcessing = false;
    }
  }

  private recordHistory(entry: ReminderWorkerStats["history"][0]): void {
    this.stats.history.unshift(entry);
    if (this.stats.history.length > 50) {
      this.stats.history.pop();
    }
  }
}

export const deadlineReminderWorker = new DeadlineReminderWorker();
