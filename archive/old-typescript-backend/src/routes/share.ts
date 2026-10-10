import { Router, Request, Response } from "express";
import crypto from "crypto";
import QRCode from "qrcode";
import { db } from "../db";
import { requireAuth, AuthenticatedRequest, JWT_SECRET } from "../auth";

export const shareRouter = Router();

// In-memory or database shared packs registry with TTL
interface SharedPack {
  id: string;
  type: "module" | "brief";
  title: string;
  subtitle: string;
  module_code: string;
  created_by_name: string;
  created_at: string;
  expires_at: string;
  payload: any;
}

const sharedPacks = new Map<string, SharedPack>();

// Cleanup expired shares periodically
setInterval(() => {
  const now = new Date().toISOString();
  for (const [id, pack] of sharedPacks.entries()) {
    if (pack.expires_at < now) {
      sharedPacks.delete(id);
    }
  }
}, 60 * 60 * 1000).unref();

function generateSafeToken(data: string): string {
  const hmac = crypto.createHmac("sha256", JWT_SECRET);
  hmac.update(data);
  const signature = hmac.digest("base64url").substring(0, 10);
  const randomPart = crypto.randomBytes(6).toString("base64url");
  return `${randomPart}-${signature}`;
}

// POST /api/v1/share/module (also supports /module/:moduleId)
async function handleShareModule(req: AuthenticatedRequest, res: Response) {
  const moduleId = req.params.moduleId || req.body?.module_id;
  if (!moduleId) {
    return res.status(400).json({ detail: "module_id is required" });
  }

  const user = req.user!;
  const userModules = await db.getModules(user.id);
  const module = userModules.find((m) => m.id === moduleId) || db.modules.get(moduleId);
  if (!module) {
    return res.status(404).json({ detail: "Module not found" });
  }

  const allTasks = await db.getTasks(user.id);
  const tasks = allTasks.filter((t) => t.module_id === module.id);
  const materials = await db.getStudyMaterials(module.code);

  const shareId = generateSafeToken(`mod:${module.id}:${user.id}`);
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const pack: SharedPack = {
    id: shareId,
    type: "module",
    title: `${module.code}: ${module.name}`,
    subtitle: `${tasks.length} active syllabus deadlines & study materials`,
    module_code: module.code,
    created_by_name: user.full_name || "Varsity Student",
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
    payload: {
      code: module.code,
      name: module.name,
      tasks: tasks.map((t) => ({
        title: t.title,
        task_type: t.task_type,
        priority: t.priority,
        weight_percentage: t.weight_percentage,
        due_date: t.due_date,
      })),
      materials_count: materials.length,
    },
  };

  sharedPacks.set(shareId, pack);

  // Build clean WhatsApp message text (optimized for South African student groups)
  const host = req.get("host") || "varsitycompanion.co.za";
  const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const shareUrl = `${protocol}://${host}/?share=${shareId}`;

  const taskListText = tasks
    .slice(0, 4)
    .map((t) => `• ${t.title} (${t.task_type}, ${t.weight_percentage}% due ${t.due_date ? t.due_date.substring(0, 10) : 'TBD'})`)
    .join("\n");

  const whatsappMessage = 
    `*Varsity Companion Study Pack: ${module.code}*\n` +
    `${module.name}\n\n` +
    `*Upcoming Deadlines & Deliverables:*\n` +
    (taskListText ? `${taskListText}\n\n` : `All current semester coursework.\n\n`) +
    `Tap to open study guide & import tasks directly to your semester timetable:\n` +
    `${shareUrl}`;

  const encodedWhatsApp = encodeURIComponent(whatsappMessage);
  const whatsappUrl = `https://wa.me/?text=${encodedWhatsApp}`;

  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(shareUrl, {
      margin: 1,
      width: 256,
      color: { dark: "#0f1115", light: "#ffffff" },
    });
  } catch (qrErr) {
    console.warn("Failed to generate QR code data URL:", qrErr);
  }

  return res.json({
    share_id: shareId,
    share_url: shareUrl,
    whatsapp_url: whatsappUrl,
    qr_data_url: qrDataUrl,
    title: pack.title,
    module_code: module.code,
    task_count: tasks.length,
    expires_at: pack.expires_at,
  });
}

shareRouter.post("/module", requireAuth, handleShareModule);
shareRouter.post("/module/:moduleId", requireAuth, handleShareModule);

// POST /api/v1/share/brief (also supports /brief/:briefId)
async function handleShareBrief(req: AuthenticatedRequest, res: Response) {
  const briefId = req.params.briefId || req.body?.brief_id;
  if (!briefId) {
    return res.status(400).json({ detail: "brief_id is required" });
  }

  const user = req.user!;
  const brief = await db.getAssignmentBrief(briefId);
  if (!brief || brief.user_id !== user.id) {
    return res.status(404).json({ detail: "Assignment brief not found" });
  }

  const deliverables = brief.extracted_data?.key_deliverables || brief.requirements || [];
  const gradingCriteria = brief.extracted_data?.grading_criteria || [];

  const shareId = generateSafeToken(`brief:${brief.id}:${user.id}`);
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const pack: SharedPack = {
    id: shareId,
    type: "brief",
    title: `${brief.module_code}: ${brief.title}`,
    subtitle: `${brief.study_plan?.length || 0} milestone action steps`,
    module_code: brief.module_code,
    created_by_name: user.full_name || "Varsity Student",
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
    payload: {
      module_code: brief.module_code,
      title: brief.title,
      due_date: brief.due_date,
      deliverables,
      grading_criteria: gradingCriteria,
      study_plan: brief.study_plan,
    },
  };

  sharedPacks.set(shareId, pack);

  const host = req.get("host") || "varsitycompanion.co.za";
  const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const shareUrl = `${protocol}://${host}/?share=${shareId}`;

  const whatsappMessage =
    `*Assignment Brief Breakdown: ${brief.module_code} - ${brief.title}*\n` +
    (brief.due_date ? `Deadline: ${brief.due_date}\n\n` : `\n`) +
    `*Key Deliverables:*\n` +
    deliverables.slice(0, 3).map((d) => `• ${d}`).join("\n") +
    `\n\nOpen complete breakdown and interactive study plan here:\n` +
    `${shareUrl}`;

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;

  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(shareUrl, {
      margin: 1,
      width: 256,
      color: { dark: "#0f1115", light: "#ffffff" },
    });
  } catch (qrErr) {
    console.warn("Failed to generate QR code data URL for brief:", qrErr);
  }

  return res.json({
    share_id: shareId,
    share_url: shareUrl,
    whatsapp_url: whatsappUrl,
    qr_data_url: qrDataUrl,
    title: pack.title,
    module_code: brief.module_code,
    milestone_count: brief.study_plan?.length || 0,
    expires_at: pack.expires_at,
  });
}

shareRouter.post("/brief", requireAuth, handleShareBrief);
shareRouter.post("/brief/:briefId", requireAuth, handleShareBrief);

// GET /api/v1/share/:token/qr (Direct image output)
shareRouter.get("/:token/qr", async (req: Request, res: Response) => {
  const token = req.params.token;
  const pack = sharedPacks.get(token);
  if (!pack) {
    return res.status(404).json({ detail: "Shared pack not found" });
  }

  const host = req.get("host") || "varsitycompanion.co.za";
  const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const shareUrl = `${protocol}://${host}/?share=${token}`;

  try {
    res.setHeader("Content-Type", "image/png");
    await QRCode.toFileStream(res, shareUrl, {
      margin: 1,
      width: 300,
      color: { dark: "#0f1115", light: "#ffffff" },
    });
  } catch (err: any) {
    return res.status(500).json({ detail: "QR generation failed", error: err.message });
  }
});

// GET /api/v1/share/:token (Public read endpoint for shared packs)
shareRouter.get("/:token", async (req: Request, res: Response) => {
  const token = req.params.token;
  const pack = sharedPacks.get(token);

  if (!pack) {
    return res.status(404).json({ detail: "Shared study pack not found or has expired." });
  }

  return res.json(pack);
});

// POST /api/v1/share/:token/import (Authenticated student imports shared tasks into their account)
shareRouter.post("/:token/import", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const token = req.params.token;
  const pack = sharedPacks.get(token);

  if (!pack) {
    return res.status(404).json({ detail: "Shared study pack not found or has expired." });
  }

  const user = req.user!;
  // Check if student has module enrolled, if not create or attach to it
  let existingModules = await db.getModules(user.id);
  let targetModule = existingModules.find((m) => m.code.toUpperCase() === pack.module_code.toUpperCase());

  if (!targetModule) {
    targetModule = await db.createModule({
      id: crypto.randomUUID(),
      user_id: user.id,
      code: pack.module_code.toUpperCase(),
      name: pack.type === "module" ? pack.payload.name : `${pack.module_code} Coursework`,
      color_code: "#3b5b8c",
      created_at: new Date().toISOString(),
    });
  }

  let importedTasksCount = 0;
  if (pack.type === "module" && Array.isArray(pack.payload.tasks)) {
    for (const t of pack.payload.tasks) {
      await db.createTask({
        id: crypto.randomUUID(),
        user_id: user.id,
        module_id: targetModule.id,
        title: t.title,
        task_type: t.task_type || "ASSIGNMENT",
        priority: t.priority || "MEDIUM",
        due_date: t.due_date || new Date().toISOString(),
        weight_percentage: t.weight_percentage || 0,
        is_completed: false,
        completed_at: null,
        created_at: new Date().toISOString(),
      });
      importedTasksCount++;
    }
  } else if (pack.type === "brief" && Array.isArray(pack.payload.study_plan)) {
    for (const step of pack.payload.study_plan) {
      await db.createTask({
        id: crypto.randomUUID(),
        user_id: user.id,
        module_id: targetModule.id,
        title: `[${step.day_number || 'Milestone'}] ${step.focus_area || step.task || 'Assignment Prep'}`,
        task_type: "ASSIGNMENT",
        priority: "HIGH",
        due_date: pack.payload.due_date || new Date().toISOString(),
        weight_percentage: 10,
        is_completed: false,
        completed_at: null,
        created_at: new Date().toISOString(),
      });
      importedTasksCount++;
    }
  }

  return res.json({
    message: `Successfully imported ${importedTasksCount} tasks into module ${targetModule.code}`,
    module_id: targetModule.id,
    module_code: targetModule.code,
    imported_tasks_count: importedTasksCount,
  });
});
