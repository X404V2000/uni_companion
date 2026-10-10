import { Router, Response } from "express";
import { prisma } from "../prisma";
import { requireAuth, AuthenticatedRequest } from "../auth";
import { db } from "../db";

export const coursesRouter = Router();

// Helper to format course object with both camelCase and snake_case properties for compatibility
function formatCourseResponse(course: any) {
  return {
    id: course.id,
    course_id: course.id,
    user_id: course.userId,
    userId: course.userId,
    code: course.code,
    name: course.name,
    color_code: course.colorCode,
    colorCode: course.colorCode,
    department: course.department,
    faculty: course.faculty,
    dp_subminimum: course.dpSubminimum,
    dpSubminimum: course.dpSubminimum,
    syllabus_description: course.syllabusDescription,
    syllabusDescription: course.syllabusDescription,
    created_at: course.createdAt,
    createdAt: course.createdAt,
    updated_at: course.updatedAt,
    updatedAt: course.updatedAt,
    deleted_at: course.deletedAt,
    deletedAt: course.deletedAt,
    deadlines: course.deadlines,
    _count: course._count,
  };
}

// ====================================================================
// 1. READ: GET /courses (List all courses for authenticated user)
// ====================================================================
coursesRouter.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const department = typeof req.query.department === "string" ? req.query.department.trim() : "";
    const includeDeadlines = req.query.include_deadlines === "true";
    const includeDeleted = req.query.include_deleted === "true";

    const whereCondition: any = {
      userId,
    };

    if (!includeDeleted) {
      whereCondition.deletedAt = null;
    }

    if (search) {
      whereCondition.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    if (department) {
      whereCondition.department = { contains: department, mode: "insensitive" };
    }

    const courses = await prisma.courses.findMany({
      where: whereCondition,
      include: {
        deadlines: includeDeadlines
          ? {
              orderBy: { dueDate: "asc" },
            }
          : false,
        _count: {
          select: { deadlines: true },
        },
      },
      orderBy: { code: "asc" },
    });

    return res.json({
      count: courses.length,
      courses: courses.map(formatCourseResponse),
    });
  } catch (error: any) {
    console.error("[Courses API] GET / error:", error);
    return res.status(500).json({
      detail: "Failed to retrieve courses from Neon database via Prisma client",
      error: error.message,
    });
  }
});

// ====================================================================
// 2. READ: GET /courses/:id (Retrieve specific course details)
// ====================================================================
coursesRouter.get("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const courseId = req.params.id;

    const course = await prisma.courses.findFirst({
      where: {
        id: courseId,
        userId,
      },
      include: {
        deadlines: {
          orderBy: { dueDate: "asc" },
        },
        _count: {
          select: { deadlines: true },
        },
      },
    });

    if (!course) {
      return res.status(404).json({ detail: "Course not found" });
    }

    return res.json(formatCourseResponse(course));
  } catch (error: any) {
    console.error(`[Courses API] GET /:id error:`, error);
    return res.status(500).json({
      detail: "Failed to fetch course details",
      error: error.message,
    });
  }
});

// ====================================================================
// 3. CREATE: POST /courses (Add a new course)
// ====================================================================
coursesRouter.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const body = req.body || {};

    let code = (body.code || "").toString().trim().toUpperCase();
    let name = (body.name || "").toString().trim();
    const department = body.department ? body.department.toString().trim() : null;
    const faculty = body.faculty ? body.faculty.toString().trim() : null;
    const colorCode = body.colorCode || body.color_code || "#3b5b8c";
    const syllabusDescription = body.syllabusDescription || body.syllabus_description || null;

    let dpSubminimum = 40.0;
    const rawDp = body.dpSubminimum ?? body.dp_subminimum;
    if (rawDp !== undefined && rawDp !== null) {
      const parsedDp = parseFloat(rawDp);
      if (isNaN(parsedDp) || parsedDp < 0 || parsedDp > 100) {
        return res.status(400).json({
          detail: "DP sub-minimum percentage must be a number between 0 and 100",
        });
      }
      dpSubminimum = parsedDp;
    }

    if (!code || !name) {
      return res.status(400).json({
        detail: "Course code and name are required fields",
      });
    }

    if (code.length > 20) {
      return res.status(400).json({
        detail: "Course code must be 20 characters or fewer",
      });
    }

    // Check for existing course code for this user
    const existing = await prisma.courses.findFirst({
      where: {
        userId,
        code,
        deletedAt: null,
      },
    });

    if (existing) {
      return res.status(409).json({
        detail: `Course with code '${code}' already exists in your enrolled courses.`,
        existing_id: existing.id,
      });
    }

    // Create course via Prisma Client
    const created = await prisma.courses.create({
      data: {
        userId,
        code,
        name,
        colorCode,
        department,
        faculty,
        dpSubminimum,
        syllabusDescription,
      },
    });

    // Mirror to in-memory db cache so legacy modules endpoints and UI remain synchronized
    try {
      await db.createModule({
        id: created.id,
        user_id: userId,
        code: created.code,
        name: created.name,
        color_code: created.colorCode,
        created_at: created.createdAt.toISOString(),
      });
    } catch {
      // Non-blocking sync
    }

    return res.status(201).json({
      message: "Course created successfully",
      course: formatCourseResponse(created),
    });
  } catch (error: any) {
    console.error("[Courses API] POST / error:", error);
    return res.status(500).json({
      detail: "Failed to create course via Prisma and NEON_URL",
      error: error.message,
    });
  }
});

// ====================================================================
// 4. UPDATE: PUT /courses/:id & PATCH /courses/:id (Update course)
// ====================================================================
async function handleUpdateCourse(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const courseId = req.params.id;
    const body = req.body || {};

    const existing = await prisma.courses.findFirst({
      where: {
        id: courseId,
        userId,
      },
    });

    if (!existing) {
      return res.status(404).json({ detail: "Course not found" });
    }

    const updateData: any = {};

    if (body.code !== undefined) {
      const trimmedCode = body.code.toString().trim().toUpperCase();
      if (!trimmedCode) {
        return res.status(400).json({ detail: "Course code cannot be empty" });
      }
      if (trimmedCode.length > 20) {
        return res.status(400).json({ detail: "Course code must be 20 characters or fewer" });
      }

      // If changing code, verify no duplicate
      if (trimmedCode !== existing.code) {
        const conflict = await prisma.courses.findFirst({
          where: {
            userId,
            code: trimmedCode,
            id: { not: courseId },
            deletedAt: null,
          },
        });
        if (conflict) {
          return res.status(409).json({
            detail: `Another course already uses the code '${trimmedCode}'`,
          });
        }
      }
      updateData.code = trimmedCode;
    }

    if (body.name !== undefined) {
      const trimmedName = body.name.toString().trim();
      if (!trimmedName) {
        return res.status(400).json({ detail: "Course name cannot be empty" });
      }
      updateData.name = trimmedName;
    }

    if (body.colorCode !== undefined || body.color_code !== undefined) {
      updateData.colorCode = (body.colorCode || body.color_code).toString().trim();
    }

    if (body.department !== undefined) {
      updateData.department = body.department ? body.department.toString().trim() : null;
    }

    if (body.faculty !== undefined) {
      updateData.faculty = body.faculty ? body.faculty.toString().trim() : null;
    }

    if (body.dpSubminimum !== undefined || body.dp_subminimum !== undefined) {
      const rawDp = body.dpSubminimum ?? body.dp_subminimum;
      const parsedDp = parseFloat(rawDp);
      if (isNaN(parsedDp) || parsedDp < 0 || parsedDp > 100) {
        return res.status(400).json({
          detail: "DP sub-minimum percentage must be a number between 0 and 100",
        });
      }
      updateData.dpSubminimum = parsedDp;
    }

    if (body.syllabusDescription !== undefined || body.syllabus_description !== undefined) {
      updateData.syllabusDescription = body.syllabusDescription ?? body.syllabus_description;
    }

    const updated = await prisma.courses.update({
      where: { id: courseId },
      data: updateData,
      include: {
        _count: {
          select: { deadlines: true },
        },
      },
    });

    // Update in-memory db cache
    try {
      const cached = db.modules.get(courseId);
      if (cached) {
        cached.code = updated.code;
        cached.name = updated.name;
        cached.color_code = updated.colorCode;
        cached.updated_at = updated.updatedAt.toISOString();
      }
    } catch {
      // Non-blocking sync
    }

    return res.json({
      message: "Course updated successfully",
      course: formatCourseResponse(updated),
    });
  } catch (error: any) {
    console.error("[Courses API] Update error:", error);
    return res.status(500).json({
      detail: "Failed to update course via Prisma and NEON_URL",
      error: error.message,
    });
  }
}

coursesRouter.put("/:id", requireAuth, handleUpdateCourse);
coursesRouter.patch("/:id", requireAuth, handleUpdateCourse);

// ====================================================================
// 5. DELETE: DELETE /courses/:id (Soft or hard delete course)
// ====================================================================
coursesRouter.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const courseId = req.params.id;
    const isPermanent = req.query.permanent === "true";

    const existing = await prisma.courses.findFirst({
      where: {
        id: courseId,
        userId,
      },
    });

    if (!existing) {
      return res.status(404).json({ detail: "Course not found" });
    }

    if (isPermanent) {
      // Hard delete from Neon DB (cascades to related deadlines via FK)
      await prisma.courses.delete({
        where: { id: courseId },
      });
    } else {
      // Soft delete: set deletedAt timestamp
      await prisma.courses.update({
        where: { id: courseId },
        data: { deletedAt: new Date() },
      });
    }

    // Clean up in-memory cache and timetable/task references
    try {
      await db.deleteModule(courseId, userId);
    } catch {
      // Non-blocking
    }

    return res.json({
      message: isPermanent ? "Course permanently deleted" : "Course deleted successfully",
      id: courseId,
      permanent: isPermanent,
    });
  } catch (error: any) {
    console.error("[Courses API] DELETE /:id error:", error);
    return res.status(500).json({
      detail: "Failed to delete course via Prisma and NEON_URL",
      error: error.message,
    });
  }
});
