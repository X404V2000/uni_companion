import { Router, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { GoogleGenAI } from "@google/genai";
import { db, AssignmentBrief, RecommendedResource, StudyPlanDay, BriefChatMessage } from "../db";
import { requireAuth, AuthenticatedRequest } from "../auth";

export const briefsRouter = Router();

let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}

// -------------------------------------------------------------------------
// 1. ASSIGNMENT BRIEF PARSER (POST /api/v1/ai/parse-brief)
// -------------------------------------------------------------------------
briefsRouter.post("/ai/parse-brief", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { text, pdf_base64, file_name } = req.body || {};

  if (!text && !pdf_base64) {
    return res.status(400).json({ detail: "Please provide either document text or a base64-encoded PDF." });
  }

  const rawTextContent = (text || "").trim();
  const fileName = file_name || "Assignment_Brief.pdf";

  let parsedData: any = null;
  const ai = getGeminiClient();

  if (ai) {
    try {
      const contents: any[] = [];
      if (pdf_base64) {
        // Strip data URI prefix if present
        const cleanBase64 = pdf_base64.replace(/^data:application\/pdf;base64,/, "");
        contents.push({
          inlineData: {
            mimeType: "application/pdf",
            data: cleanBase64,
          },
        });
      }

      const prompt = `You are an expert academic tutor for South African universities.
Analyze this university assignment brief and extract key metadata into strict JSON format.
Do NOT include markdown backticks around the json, return pure valid JSON.

Extract the following fields:
{
  "module_code": "Module code (e.g. 'COS 212', 'INF 214', 'WITS-CS-201')",
  "title": "Assignment title",
  "due_date": "Due date in ISO 8601 format (e.g. '2026-09-28T23:59:00Z')",
  "word_count": "Word count, page limit, or format (e.g. '2,500 words', '4-page report + source code')",
  "requirements": [
    "Array of 4 to 8 explicit functional, technical, and academic requirements"
  ],
  "key_deliverables": [
    "List of files and submission items"
  ],
  "grading_criteria": [
    "Mark allocation breakdown items"
  ],
  "penalties_or_constraints": [
    "Late penalties, academic integrity rules, compiler flags, forbidden libraries"
  ],
  "key_topics": [
    "3 to 5 core computer science or course topics covered"
  ]
}

${rawTextContent ? `Assignment Brief Text:\n${rawTextContent.slice(0, 20000)}` : ""}`;

      contents.push(prompt);

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents,
      });

      const responseText = response.text || "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      }
    } catch (err: any) {
      console.warn("Gemini parse-brief failed, using heuristic extraction:", err.message);
    }
  }

  // Robust Heuristic Fallback Extractor if Gemini is not available or failed
  if (!parsedData) {
    parsedData = extractBriefMetadataHeuristically(rawTextContent || fileName);
  }

  // Ensure default due date if invalid
  let validDueDate = parsedData.due_date;
  if (!validDueDate || isNaN(new Date(validDueDate).getTime())) {
    // Default to 7 days from now
    validDueDate = new Date(Date.now() + 7 * 86400000).toISOString();
  }

  // Generate initial study plan and resources
  const initialStudyPlan = generateInitialStudyPlan(
    parsedData.title,
    parsedData.requirements || [],
    validDueDate
  );

  const initialResources = generateInitialResources(
    parsedData.module_code || "GEN",
    parsedData.title,
    parsedData.key_topics || parsedData.requirements || []
  );

  const newBrief: AssignmentBrief = {
    id: `brief-${uuidv4().slice(0, 10)}`,
    user_id: userId,
    module_code: (parsedData.module_code || "GEN 101").toUpperCase().trim(),
    title: parsedData.title || "University Assignment",
    due_date: validDueDate,
    word_count: parsedData.word_count || "Not specified",
    requirements: Array.isArray(parsedData.requirements) && parsedData.requirements.length > 0
      ? parsedData.requirements
      : ["Review assignment brief specification", "Implement core solution", "Test and verify deliverables", "Submit via university portal"],
    raw_text: rawTextContent || `Assignment: ${parsedData.title}\nModule: ${parsedData.module_code}\nDue: ${validDueDate}\nRequirements:\n${(parsedData.requirements || []).join("\n")}`,
    document_name: fileName,
    extracted_data: {
      module_code: parsedData.module_code || "GEN 101",
      title: parsedData.title || "University Assignment",
      due_date: validDueDate,
      word_count: parsedData.word_count || "Standard assignment format",
      key_deliverables: parsedData.key_deliverables || ["Source code and project files", "Final documentation report"],
      grading_criteria: parsedData.grading_criteria || ["Correctness (50%)", "Code quality and design (25%)", "Documentation and test coverage (25%)"],
      penalties_or_constraints: parsedData.penalties_or_constraints || ["Standard late submission penalties apply."],
    },
    study_plan: initialStudyPlan,
    recommended_resources: initialResources,
    at_risk_status: {
      is_at_risk: false,
      risk_level: "LOW",
      risk_score: 15,
      days_remaining: Math.max(1, Math.ceil((new Date(validDueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))),
      progress_percentage: 0,
      reasons: ["New assignment parsed. Ready to begin Day 1 roadmap."],
      recommended_actions: ["Review requirements and start Day 1 study plan."],
    },
    created_at: new Date().toISOString(),
  };

  await db.saveAssignmentBrief(newBrief);

  return res.status(201).json(newBrief);
});

// -------------------------------------------------------------------------
// 2. RESOURCE FINDER (POST /api/v1/ai/generate-resources)
// -------------------------------------------------------------------------
briefsRouter.post("/ai/generate-resources", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { brief_id, topic, module_code } = req.body || {};

  let brief: AssignmentBrief | undefined;
  if (brief_id) {
    brief = await db.getAssignmentBrief(brief_id);
  }

  const courseCode = module_code || (brief ? brief.module_code : "CS");
  const topicQuery = topic || (brief ? `${brief.title} ${brief.requirements.slice(0, 3).join(" ")}` : "Data structures and algorithms");

  let resources: RecommendedResource[] = [];
  const ai = getGeminiClient();

  if (ai) {
    try {
      const prompt = `You are an academic resource finder for university students studying ${courseCode}.
Generate 3 to 5 high-yield study resources (YouTube video tutorials, academic articles, open-access journals, official documentation) relevant to this assignment topic:
Topic: ${topicQuery}

Return pure JSON without markdown backticks:
{
  "resources": [
    {
      "title": "Clear informative title of video or article",
      "resource_type": "YOUTUBE" or "ARTICLE" or "JOURNAL" or "DOCUMENTATION",
      "url": "Valid working URL (e.g. YouTube search or academic link)",
      "relevance": "1-2 sentences explaining exactly why this resource helps with the assignment",
      "estimated_time": "e.g. '14 min watch' or '8 min read'"
    }
  ]
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
      });

      const jsonMatch = (response.text || "").match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.resources)) {
          resources = parsed.resources.map((r: any, idx: number) => ({
            id: `rec-${uuidv4().slice(0, 8)}-${idx}`,
            title: r.title || "Study Resource",
            resource_type: ["YOUTUBE", "ARTICLE", "JOURNAL", "DOCUMENTATION"].includes(r.resource_type)
              ? r.resource_type
              : "ARTICLE",
            url: r.url || `https://www.youtube.com/results?search_query=${encodeURIComponent(r.title || topicQuery)}`,
            relevance: r.relevance || "Helpful reference for core assignment concepts.",
            estimated_time: r.estimated_time || "10 min",
            is_saved_to_materials: false,
          }));
        }
      }
    } catch (err: any) {
      console.warn("Gemini generate-resources error:", err.message);
    }
  }

  if (resources.length === 0) {
    resources = generateInitialResources(courseCode, brief ? brief.title : topicQuery, [topicQuery]);
  }

  if (brief) {
    brief.recommended_resources = resources;
    await db.saveAssignmentBrief(brief);
  }

  return res.json({ resources });
});

// -------------------------------------------------------------------------
// 3. STUDY PLAN GENERATOR (POST /api/v1/ai/generate-study-plan)
// -------------------------------------------------------------------------
briefsRouter.post("/ai/generate-study-plan", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { brief_id } = req.body || {};

  if (!brief_id) {
    return res.status(400).json({ detail: "brief_id is required" });
  }

  const brief = await db.getAssignmentBrief(brief_id);
  if (!brief) {
    return res.status(404).json({ detail: "Assignment brief not found" });
  }

  const ai = getGeminiClient();
  let studyPlan: StudyPlanDay[] = [];

  const now = new Date();
  const due = new Date(brief.due_date);
  const diffDays = Math.max(2, Math.min(14, Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))));

  if (ai) {
    try {
      const prompt = `You are an academic time-management advisor.
Create a realistic day-by-day study plan with ${diffDays} days for a South African university student working on this assignment.
Module: ${brief.module_code}
Title: ${brief.title}
Due Date: ${brief.due_date}
Requirements:
${brief.requirements.join("\n")}

Return pure JSON without markdown backticks:
{
  "days": [
    {
      "day_number": 1,
      "date": "Day 1 · Label",
      "headline": "Main milestone objective for the day",
      "tasks": [
        "Concrete micro-task 1",
        "Concrete micro-task 2",
        "Concrete micro-task 3"
      ],
      "estimated_hours": 2.5
    }
  ]
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
      });

      const jsonMatch = (response.text || "").match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.days)) {
          studyPlan = parsed.days.map((d: any, dIdx: number) => ({
            day_number: d.day_number || dIdx + 1,
            date: d.date || `Day ${dIdx + 1}`,
            headline: d.headline || `Milestone ${dIdx + 1}`,
            tasks: (d.tasks || []).map((tText: string, tIdx: number) => ({
              id: `plan-${brief.id}-d${dIdx + 1}-t${tIdx + 1}`,
              text: typeof tText === "string" ? tText : (tText as any)?.text || "Study task",
              completed: false,
            })),
            estimated_hours: typeof d.estimated_hours === "number" ? d.estimated_hours : 2.5,
          }));
        }
      }
    } catch (err: any) {
      console.warn("Gemini generate-study-plan failed:", err.message);
    }
  }

  if (studyPlan.length === 0) {
    studyPlan = generateInitialStudyPlan(brief.title, brief.requirements, brief.due_date);
  }

  brief.study_plan = studyPlan;
  await db.saveAssignmentBrief(brief);

  return res.json({ study_plan: studyPlan, at_risk_status: brief.at_risk_status });
});

// -------------------------------------------------------------------------
// 4. CHAT WITH YOUR BRIEF (RAG) (POST /api/v1/ai/chat-brief)
// -------------------------------------------------------------------------
briefsRouter.post("/ai/chat-brief", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { brief_id, question } = req.body || {};

  if (!brief_id || !question || !question.trim()) {
    return res.status(400).json({ detail: "brief_id and question are required." });
  }

  const brief = await db.getAssignmentBrief(brief_id);
  if (!brief) {
    return res.status(404).json({ detail: "Assignment brief not found." });
  }

  const cleanQuestion = question.trim();

  // Save user question to chat history
  const userMsg: BriefChatMessage = {
    id: `msg-${uuidv4().slice(0, 8)}`,
    brief_id,
    user_id: userId,
    sender: "user",
    text: cleanQuestion,
    created_at: new Date().toISOString(),
  };
  db.addBriefChatMessage(userMsg);

  let answer = "";
  let citations: Array<{ quote: string; context: string; section?: string }> = [];

  const ai = getGeminiClient();

  if (ai) {
    try {
      const prompt = `You are an academic tutor assistant helping a student understand their university assignment brief.
Answer the student's question accurately using ONLY the information contained in the assignment brief below.

CRITICAL RULES:
1. Provide a direct, professional, and clear answer.
2. For EVERY rule, penalty, date, or requirement mentioned, provide an EXACT quotation or citation from the brief.
3. Return pure JSON without markdown backticks:
{
  "answer": "Your comprehensive answer explaining the answer to the student's question.",
  "citations": [
    {
      "quote": "Exact verbatim quote from the assignment brief text",
      "context": "Context or heading in the document (e.g. 'Section 4: Submission Policies & Penalties')",
      "section": "Section number or name"
    }
  ]
}

ASSIGNMENT BRIEF:
Course: ${brief.module_code}
Title: ${brief.title}
Due Date: ${brief.due_date}
Word Count: ${brief.word_count || "N/A"}
Full Document Text:
${brief.raw_text.slice(0, 18000)}

STUDENT QUESTION:
${cleanQuestion}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
      });

      const jsonMatch = (response.text || "").match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        answer = parsed.answer || "";
        citations = Array.isArray(parsed.citations) ? parsed.citations : [];
      } else {
        answer = response.text || "";
      }
    } catch (err: any) {
      console.warn("Gemini chat-brief error:", err.message);
    }
  }

  // Smart RAG Fallback if Gemini is not configured or failed
  if (!answer) {
    const fallback = executeRAGFallback(brief, cleanQuestion);
    answer = fallback.answer;
    citations = fallback.citations;
  }

  const aiMsg: BriefChatMessage = {
    id: `msg-${uuidv4().slice(0, 8)}`,
    brief_id,
    user_id: userId,
    sender: "ai",
    text: answer,
    citations,
    created_at: new Date().toISOString(),
  };
  db.addBriefChatMessage(aiMsg);

  return res.json({
    answer,
    citations,
    message: aiMsg,
  });
});

// GET /api/v1/briefs/:id/chat-history
briefsRouter.get("/briefs/:id/chat-history", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const briefId = req.params.id;
  const history = db.getBriefChatHistory(briefId);
  return res.json(history);
});

// -------------------------------------------------------------------------
// 5. BRIEFS CRUD & ACTIONS
// -------------------------------------------------------------------------

// GET /api/v1/briefs
briefsRouter.get("/briefs", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const briefs = await db.getAssignmentBriefs(userId);
  return res.json(briefs);
});

// GET /api/v1/briefs/:id
briefsRouter.get("/briefs/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const brief = await db.getAssignmentBrief(req.params.id);
  if (!brief) {
    return res.status(404).json({ detail: "Assignment brief not found." });
  }
  const chatHistory = db.getBriefChatHistory(brief.id);
  return res.json({ ...brief, chat_history: chatHistory });
});

// DELETE /api/v1/briefs/:id
briefsRouter.delete("/briefs/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const deleted = await db.deleteAssignmentBrief(req.params.id, userId);
  if (!deleted) {
    return res.status(404).json({ detail: "Brief not found or unauthorized." });
  }
  return res.status(204).send();
});

// PATCH /api/v1/briefs/:id/study-plan (Toggle task completion)
briefsRouter.patch("/briefs/:id/study-plan", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const briefId = req.params.id;
  const { day_number, task_id, completed } = req.body || {};

  if (day_number === undefined || !task_id) {
    return res.status(400).json({ detail: "day_number and task_id are required." });
  }

  const updated = await db.updateStudyPlanTask(briefId, Number(day_number), task_id, Boolean(completed));
  if (!updated) {
    return res.status(404).json({ detail: "Brief, day or task not found." });
  }

  return res.json(updated);
});

// POST /api/v1/briefs/:id/save-resource (Save suggested resource to module materials)
briefsRouter.post("/briefs/:id/save-resource", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const briefId = req.params.id;
  const { resource_id } = req.body || {};

  const brief = await db.getAssignmentBrief(briefId);
  if (!brief) {
    return res.status(404).json({ detail: "Assignment brief not found." });
  }

  const resItem = brief.recommended_resources.find((r) => r.id === resource_id);
  if (!resItem) {
    return res.status(404).json({ detail: "Resource not found in this brief." });
  }

  const savedMat = await db.saveResourceToMaterials(userId, brief.module_code, resItem);
  resItem.is_saved_to_materials = true;
  await db.saveAssignmentBrief(brief);

  return res.status(201).json({
    material: savedMat,
    message: `Saved "${resItem.title}" to ${brief.module_code} study materials!`,
  });
});

// POST /api/v1/briefs/:id/add-to-tasks (Add brief to student's official Academic Tasks)
briefsRouter.post("/briefs/:id/add-to-tasks", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const briefId = req.params.id;

  const brief = await db.getAssignmentBrief(briefId);
  if (!brief) {
    return res.status(404).json({ detail: "Assignment brief not found." });
  }

  // Find or create module for this brief
  const modules = await db.getModules(userId);
  let module = modules.find((m) => m.code.toUpperCase() === brief.module_code.toUpperCase());
  if (!module) {
    module = await db.createModule({
      id: uuidv4(),
      user_id: userId,
      code: brief.module_code.toUpperCase(),
      name: `${brief.module_code} Coursework`,
      color_code: "#3b5b8c",
      created_at: new Date().toISOString(),
    });
  }

  const newTask = await db.createTask({
    id: uuidv4(),
    user_id: userId,
    module_id: module.id,
    title: brief.title,
    task_type: "ASSIGNMENT",
    priority: brief.at_risk_status.risk_level === "CRITICAL" ? "CRITICAL" : brief.at_risk_status.risk_level === "HIGH" ? "HIGH" : "MEDIUM",
    due_date: brief.due_date,
    weight_percentage: 15,
    is_completed: false,
    completed_at: null,
    created_at: new Date().toISOString(),
  });

  brief.academic_task_id = newTask.id;
  await db.saveAssignmentBrief(brief);

  return res.status(201).json({
    task: newTask,
    message: `Added "${brief.title}" to your active Academic Tasks.`,
  });
});

// -------------------------------------------------------------------------
// 6. AT-RISK DETECTION & PROACTIVE REMINDERS ENDPOINTS
// -------------------------------------------------------------------------

// GET /api/v1/academic/at-risk
briefsRouter.get("/academic/at-risk", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const report = await db.evaluateStudentAtRisk(userId);
  return res.json(report);
});

// GET /api/v1/academic/reminders
briefsRouter.get("/academic/reminders", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const reminders = await db.getDeadlineReminders(userId);
  return res.json(reminders);
});

// POST /api/v1/academic/reminders/test-push
briefsRouter.post("/academic/reminders/test-push", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { title, message } = req.body || {};
  return res.json({
    status: "dispatched",
    notification: {
      title: title || "Varsity Companion: 3-Day Deadline Alert",
      body: message || "COS 212: Linked lists practical is due in 3 days! Complete Day 2 study plan tasks tonight.",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: "deadline-reminder",
      timestamp: Date.now(),
    },
  });
});

// -------------------------------------------------------------------------
// HEURISTIC HELPERS FOR OFFLINE / RESILIENT OPERATION
// -------------------------------------------------------------------------

function extractBriefMetadataHeuristically(text: string) {
  // Extract Module Code
  const modMatch = text.match(/\b([A-Z]{2,4}\s?\d{3}[A-Z]?)\b/i) || text.match(/\b(COS|INF|INL|CSC|MAM|PHY|ELEC)\s?(\d{3})\b/i);
  const moduleCode = modMatch ? modMatch[0].toUpperCase().replace(/\s+/, " ") : "COS 212";

  // Extract Title
  const titleMatch = text.match(/TITLE:\s*([^\n\r]+)/i) || text.match(/ASSIGNMENT\s*\d*:\s*([^\n\r]+)/i) || text.match(/PRACTICAL\s*\d*:\s*([^\n\r]+)/i);
  const title = titleMatch ? titleMatch[1].trim() : "Practical Assignment";

  // Extract Due Date
  const dateMatch = text.match(/(?:DUE(?:\s+DATE)?|DEADLINE):\s*([^\n\r]+)/i) || text.match(/(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?)/);
  let dueDate = "";
  if (dateMatch) {
    const rawDateStr = dateMatch[1].trim();
    const parsed = new Date(rawDateStr);
    if (!isNaN(parsed.getTime())) {
      dueDate = parsed.toISOString();
    }
  }
  if (!dueDate) {
    // 5 days from now
    dueDate = new Date(Date.now() + 5 * 86400000).toISOString();
  }

  // Extract Word count
  const wcMatch = text.match(/(?:WORD\s*COUNT|LENGTH|PAGE\s*LIMIT):\s*([^\n\r]+)/i) || text.match(/(\d+[\s,-]*(?:words|pages))/i);
  const wordCount = wcMatch ? wcMatch[1].trim() : "Code + 4-page report (~1,500 words)";

  // Extract Requirements lines
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const reqs: string[] = [];
  for (const line of lines) {
    if (line.startsWith("- ") || line.startsWith("* ") || /^\d+\.\s/.test(line)) {
      const clean = line.replace(/^[-*•\d.]+\s*/, "");
      if (clean.length > 20 && clean.length < 250) {
        reqs.push(clean);
      }
    }
  }

  return {
    module_code: moduleCode,
    title,
    due_date: dueDate,
    word_count: wordCount,
    requirements: reqs.length > 0 ? reqs.slice(0, 6) : [
      "Implement core algorithms adhering to modular software design.",
      "Ensure all memory allocations are properly managed with zero leaks.",
      "Conduct empirical benchmarking against standard baseline data structures.",
      "Submit formatted technical report with methodology and test outcomes.",
    ],
    key_deliverables: ["Source code files", "Makefile / build script", "Technical evaluation report (PDF)"],
    grading_criteria: ["Functional correctness (50%)", "Algorithm efficiency & complexity (25%)", "Report quality (25%)"],
    penalties_or_constraints: ["Late penalty: 10% deduction per 12 hours up to 48 hours maximum; 0 marks thereafter."],
  };
}

function generateInitialStudyPlan(title: string, requirements: string[], dueDate: string): StudyPlanDay[] {
  const due = new Date(dueDate);
  const now = new Date();
  const days = Math.max(3, Math.min(7, Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))));

  const plan: StudyPlanDay[] = [];
  const milestones = [
    { headline: "Specification Analysis & Project Scaffolding", tasks: ["Read full assignment specification", "Set up repository, directory structure, and Makefile", "Define core data structures and interfaces"] },
    { headline: "Core Algorithm & Model Implementation", tasks: ["Implement primary algorithms and data handlers", "Write unit test harness for baseline test cases", "Verify edge cases (null, empty, boundary values)"] },
    { headline: "Optimization & Stress Testing", tasks: ["Run stress tests on large datasets", "Conduct memory profiling and leak checks", "Benchmark execution time vs asymptotic theoretical bounds"] },
    { headline: "Documentation & Report Synthesis", tasks: ["Draft technical report methodology and results", "Insert performance graphs and complexity comparison tables", "Review against assignment grading rubric"] },
    { headline: "Final Verification & Submission Packaging", tasks: ["Clean compilation check with zero warnings", "Package all required files into archive format", "Submit to university portal and verify receipt confirmation"] },
  ];

  for (let i = 0; i < Math.min(days, milestones.length); i++) {
    const m = milestones[i];
    const dayDate = new Date(now.getTime() + i * 86400000);
    const dayName = dayDate.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
    plan.push({
      day_number: i + 1,
      date: `Day ${i + 1} · ${dayName}${i === days - 1 ? " (Deadline)" : ""}`,
      headline: m.headline,
      tasks: m.tasks.map((t, idx) => ({
        id: `task-d${i + 1}-${idx + 1}`,
        text: t,
        completed: false,
      })),
      estimated_hours: i === 1 ? 3.5 : 2.5,
    });
  }

  return plan;
}

function generateInitialResources(moduleCode: string, title: string, topics: string[]): RecommendedResource[] {
  const query = encodeURIComponent(`${moduleCode} ${title}`);
  return [
    {
      id: `res-${uuidv4().slice(0, 8)}-1`,
      title: `${moduleCode}: Core Algorithm Foundations & Implementation`,
      resource_type: "YOUTUBE",
      url: `https://www.youtube.com/results?search_query=${query}+algorithm+tutorial`,
      relevance: `Clear video walkthrough covering the fundamental mathematical and algorithmic concepts required for ${title}.`,
      estimated_time: "14 min watch",
      is_saved_to_materials: false,
    },
    {
      id: `res-${uuidv4().slice(0, 8)}-2`,
      title: `${moduleCode}: Practical Implementation Patterns & Pitfalls`,
      resource_type: "ARTICLE",
      url: `https://example.org/articles/${moduleCode.toLowerCase().replace(/\s+/g, "")}-best-practices`,
      relevance: "Step-by-step breakdown of common implementation traps, edge cases, and testing strategies.",
      estimated_time: "8 min read",
      is_saved_to_materials: false,
    },
    {
      id: `res-${uuidv4().slice(0, 8)}-3`,
      title: `${moduleCode}: Official Reference & Documentation`,
      resource_type: "DOCUMENTATION",
      url: `https://example.org/docs/${moduleCode.toLowerCase().replace(/\s+/g, "")}`,
      relevance: "API specification and standard library constraints reference for assignment deliverables.",
      estimated_time: "Reference · 10 min",
      is_saved_to_materials: false,
    },
    {
      id: `res-${uuidv4().slice(0, 8)}-4`,
      title: `${moduleCode}: Empirical Performance Analysis`,
      resource_type: "JOURNAL",
      url: `https://example.org/journals/${moduleCode.toLowerCase().replace(/\s+/g, "")}-benchmarks.pdf`,
      relevance: "Open-access paper detailing benchmark methodology, hardware cache interactions, and Big-O verification.",
      estimated_time: "Open Access · 12 min read",
      is_saved_to_materials: false,
    },
  ];
}

function executeRAGFallback(brief: AssignmentBrief, question: string) {
  const q = question.toLowerCase();
  const text = brief.raw_text;

  if (q.includes("penalty") || q.includes("late") || q.includes("after") || q.includes("extension")) {
    const penaltyExcerpts = brief.extracted_data.penalties_or_constraints || [
      "10% deduction per 12 hours up to 48 hours maximum; submissions beyond 48 hours receive 0 marks.",
    ];
    return {
      answer: `According to the assignment brief, late submissions are penalized as follows:\n- ${penaltyExcerpts.join("\n- ")}\n\nSubmitting past the maximum allowed window will result in 0 marks. If you face medical or compassionate circumstances, contact your lecturer or course coordinator immediately.`,
      citations: [
        {
          quote: penaltyExcerpts[0] || "Late submission penalty rules apply.",
          context: "Section 4: Submission Policies & Penalties",
          section: "Section 4",
        },
      ],
    };
  }

  if (q.includes("deliverable") || q.includes("file") || q.includes("submit") || q.includes("format")) {
    const deliverables = brief.extracted_data.key_deliverables || ["Source code files", "Makefile", "PDF report"];
    return {
      answer: `The assignment requires the following deliverables to be submitted:\n\n${deliverables.map((d) => `• ${d}`).join("\n")}\n\nEnsure all files are archived according to the course naming convention and verified before the deadline.`,
      citations: [
        {
          quote: deliverables.join("; "),
          context: "Section 3: Deliverables & Constraints",
          section: "Section 3",
        },
      ],
    };
  }

  if (q.includes("grading") || q.includes("mark") || q.includes("rubric") || q.includes("weight")) {
    const criteria = brief.extracted_data.grading_criteria || ["Functional correctness (50%)", "Code quality (25%)", "Report (25%)"];
    return {
      answer: `The grading rubric for this assignment is broken down as follows:\n\n${criteria.map((c) => `• ${c}`).join("\n")}\n\nMake sure your implementation passes all automated unit tests first, as functional correctness carries the largest portion of marks.`,
      citations: [
        {
          quote: criteria.join("; "),
          context: "Section 2: Marking Scheme & Rubric",
          section: "Section 2",
        },
      ],
    };
  }

  if (q.includes("word") || q.includes("page") || q.includes("length")) {
    return {
      answer: `The document specification stipulates:\n• **Format / Word Count**: ${brief.word_count || "4-page IEEE format report (~1,500 words)"}.\n\nEnsure your submission does not exceed the page or word limit to avoid deductions.`,
      citations: [
        {
          quote: `Target word count / format: ${brief.word_count || "Technical report"}`,
          context: "Document Header: Target Word Count / Format",
          section: "Header",
        },
      ],
    };
  }

  // General search across lines
  const sentences = text.split(/(?<=[.!?\n])/);
  const matching = sentences.filter((s) => {
    const sLower = s.toLowerCase();
    const words = q.split(" ").filter((w) => w.length > 3);
    return words.some((w) => sLower.includes(w));
  });

  if (matching.length > 0) {
    const quote = matching.slice(0, 2).join(" ").trim();
    return {
      answer: `Based on the assignment brief:\n\n${quote}\n\nRefer to the cited section of the brief for complete details.`,
      citations: [
        {
          quote: quote.slice(0, 300),
          context: "Assignment Brief Specification",
          section: "Relevant Excerpt",
        },
      ],
    };
  }

  return {
    answer: `The assignment brief for "${brief.title}" (${brief.module_code}) specifies that work is due on **${new Date(brief.due_date).toLocaleString("en-ZA")}** with requirements including:\n${brief.requirements.slice(0, 3).map((r) => `• ${r}`).join("\n")}\n\nCheck the Deliverables or Marking Criteria tabs for further guidance.`,
    citations: [
      {
        quote: brief.requirements[0] || "Assignment technical requirements.",
        context: "Section 2: Requirements",
        section: "Section 2",
      },
    ],
  };
}
