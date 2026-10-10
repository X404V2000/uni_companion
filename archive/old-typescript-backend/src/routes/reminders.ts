import { Router, Response } from "express";
import { deadlineReminderWorker } from "../services/deadlineReminderWorker";
import { emailService } from "../services/emailService";
import { requireAuth, AuthenticatedRequest } from "../auth";

export const remindersRouter = Router();

// GET /reminders/status
remindersRouter.get("/status", async (_req, res: Response) => {
  const status = deadlineReminderWorker.getStatus();
  return res.json(status);
});

// POST /reminders/trigger (Runs a manual sweep of upcoming 24h deadlines)
remindersRouter.post("/trigger", requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const sweep = await deadlineReminderWorker.runSweep();
    return res.json({
      message: "Deadline reminder sweep executed successfully",
      ...sweep,
    });
  } catch (err: any) {
    return res.status(500).json({
      detail: "Failed to run reminder sweep",
      error: err.message,
    });
  }
});

// POST /reminders/test-email (Sends a sample 24-hour reminder email to the authenticated user or specified email)
remindersRouter.post("/test-email", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetEmail = req.body?.email || req.user?.email;
    if (!targetEmail) {
      return res.status(400).json({ detail: "Recipient email is required" });
    }

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const result = await emailService.sendDeadlineReminder({
      studentEmail: targetEmail,
      studentName: req.user?.full_name || "Varsity Student",
      courseCode: req.body?.course_code || "COS 212",
      courseName: req.body?.course_name || "Data Structures & Algorithms",
      taskTitle: req.body?.title || "Practical Assignment 3 - Binary Search Trees",
      taskType: "ASSIGNMENT",
      dueDate: tomorrow,
      priority: "HIGH",
      weightPercentage: 15.0,
      dpSubminimum: 40.0,
      taskId: "test-" + Date.now(),
    });

    return res.json({
      message: result.success ? "Test reminder email dispatched" : "Failed to dispatch test email",
      result,
      recipient: targetEmail,
    });
  } catch (err: any) {
    return res.status(500).json({
      detail: "Error dispatching test email",
      error: err.message,
    });
  }
});
