/**
 * Academic Performance, Weighted Grade Projection & DP Subminimum Engine
 * 
 * Implements:
 * 1. O(n) Weighted Assessment Accumulation & Coursework Average
 * 2. South African University DP (Duly Performed / Exam Admission) Compliance Analysis
 * 3. Inverse Target-Seeking Projection (calculating required final exam score for Pass / Distinction)
 * 4. Academic Honours / Classification Matrix (Distinction, Upper Second, Standard Pass)
 */

export interface GradedTask {
  id: string;
  title: string;
  task_type: "ASSIGNMENT" | "TEST" | "EXAM" | "QUIZ";
  weight_percentage: number;
  grade_achieved?: number | null;
  max_grade?: number | null;
  is_completed: boolean;
}

export interface TargetScoreProjection {
  target_name: string;
  target_percentage: number;
  required_remaining_percentage: number;
  status: "SECURED" | "ACHIEVABLE" | "CHALLENGING" | "UNATTAINABLE";
  message: string;
}

export interface ModuleGradeProjection {
  module_id: string;
  module_code: string;
  module_name: string;
  total_weight_configured: number;
  graded_weight_completed: number;
  pending_weight: number;
  remaining_weight: number;
  current_coursework_average: number; // 0 to 100%
  accumulated_course_points: number; // Points out of 100 towards final grade
  max_possible_final_grade: number; // If 100% is scored on all remaining tasks
  min_guaranteed_final_grade: number; // If 0% is scored on all remaining tasks
  dp_subminimum_required: number; // Default 40% in SA universities
  dp_status: "DP_MET" | "DP_AT_RISK" | "DP_SUBMINIMUM_FAILED" | "IN_PROGRESS";
  dp_message: string;
  classification: "FIRST_CLASS_DISTINCTION" | "UPPER_SECOND" | "LOWER_SECOND" | "PASS" | "FAIL_OR_RISK";
  projections: TargetScoreProjection[];
}

export interface SemesterOverviewReport {
  overall_weighted_average: number;
  total_modules_evaluated: number;
  at_risk_modules_count: number;
  distinction_track_count: number;
  modules: ModuleGradeProjection[];
}

/**
 * Calculates grade projections, DP compliance, and inverse exam targets for a module
 */
export function calculateModuleGradeProjection(
  moduleId: string,
  moduleCode: string,
  moduleName: string,
  tasks: GradedTask[],
  dpSubminimum: number = 40.0
): ModuleGradeProjection {
  let totalWeight = 0;
  let gradedWeight = 0;
  let accumulatedPoints = 0;

  for (const t of tasks) {
    const weight = Math.max(0, Number(t.weight_percentage) || 0);
    totalWeight += weight;

    const hasGrade =
      t.grade_achieved !== undefined &&
      t.grade_achieved !== null &&
      !isNaN(t.grade_achieved) &&
      t.max_grade &&
      t.max_grade > 0;

    if (t.is_completed && hasGrade) {
      const percentage = (t.grade_achieved! / t.max_grade!) * 100;
      gradedWeight += weight;
      accumulatedPoints += (percentage / 100) * weight;
    }
  }

  // Current coursework average based strictly on completed & graded work
  const currentCourseworkAvg =
    gradedWeight > 0 ? (accumulatedPoints / gradedWeight) * 100 : 0;

  // Remaining weight to be completed
  const pendingWeight = Math.max(0, 100 - gradedWeight);

  const maxPossible = Math.min(100, Math.round((accumulatedPoints + pendingWeight) * 10) / 10);
  const minGuaranteed = Math.round(accumulatedPoints * 10) / 10;

  // DP (Duly Performed / Exam Admission) Evaluation
  let dpStatus: ModuleGradeProjection["dp_status"] = "IN_PROGRESS";
  let dpMessage = "Coursework in progress. Submit upcoming assessments to secure DP.";

  if (gradedWeight >= 30) {
    if (currentCourseworkAvg >= dpSubminimum) {
      dpStatus = "DP_MET";
      dpMessage = `DP Subminimum met (${currentCourseworkAvg.toFixed(1)}% coursework vs ${dpSubminimum}% threshold). Exam entrance secured.`;
    } else {
      // Check if mathematically recoverable
      const maxPossibleCoursework =
        gradedWeight > 0
          ? ((accumulatedPoints + (100 - gradedWeight)) / 100) * 100
          : 100;
      if (maxPossibleCoursework < dpSubminimum) {
        dpStatus = "DP_SUBMINIMUM_FAILED";
        dpMessage = `Coursework average (${currentCourseworkAvg.toFixed(1)}%) is below ${dpSubminimum}% DP threshold and cannot mathematically recover.`;
      } else {
        dpStatus = "DP_AT_RISK";
        dpMessage = `Coursework average (${currentCourseworkAvg.toFixed(1)}%) is below ${dpSubminimum}% DP subminimum. High assessment priority required.`;
      }
    }
  }

  // Academic Classification based on current coursework average
  let classification: ModuleGradeProjection["classification"] = "PASS";
  if (currentCourseworkAvg >= 75) {
    classification = "FIRST_CLASS_DISTINCTION";
  } else if (currentCourseworkAvg >= 70) {
    classification = "UPPER_SECOND";
  } else if (currentCourseworkAvg >= 60) {
    classification = "LOWER_SECOND";
  } else if (currentCourseworkAvg >= 50) {
    classification = "PASS";
  } else {
    classification = "FAIL_OR_RISK";
  }

  // Inverse Target-Seeking Projections
  const targets = [
    { name: "Standard Pass", percentage: 50 },
    { name: "Academic Credit", percentage: 65 },
    { name: "Dean's Distinction", percentage: 75 },
  ];

  const projections: TargetScoreProjection[] = targets.map((t) => {
    if (pendingWeight <= 0) {
      const achieved = accumulatedPoints >= t.percentage;
      return {
        target_name: t.name,
        target_percentage: t.percentage,
        required_remaining_percentage: 0,
        status: achieved ? "SECURED" : "UNATTAINABLE",
        message: achieved
          ? `Target achieved! Final course mark: ${accumulatedPoints.toFixed(1)}%`
          : `Final coursework closed at ${accumulatedPoints.toFixed(1)}%.`,
      };
    }

    const neededPoints = t.percentage - accumulatedPoints;

    if (neededPoints <= 0) {
      return {
        target_name: t.name,
        target_percentage: t.percentage,
        required_remaining_percentage: 0,
        status: "SECURED",
        message: `Secured! You already have ${accumulatedPoints.toFixed(1)}% points. Even 0% in remaining assessments satisfies this target.`,
      };
    }

    const requiredRemainingPct = (neededPoints / pendingWeight) * 100;
    const roundedRequired = Math.round(requiredRemainingPct * 10) / 10;

    if (requiredRemainingPct > 100) {
      return {
        target_name: t.name,
        target_percentage: t.percentage,
        required_remaining_percentage: roundedRequired,
        status: "UNATTAINABLE",
        message: `Mathematically unattainable. Requires ${roundedRequired}% on remaining assessments (max possible is ${maxPossible}%).`,
      };
    }

    if (requiredRemainingPct > 80) {
      return {
        target_name: t.name,
        target_percentage: t.percentage,
        required_remaining_percentage: roundedRequired,
        status: "CHALLENGING",
        message: `Challenging: requires ${roundedRequired}% average across remaining deliverables/exam.`,
      };
    }

    return {
      target_name: t.name,
      target_percentage: t.percentage,
      required_remaining_percentage: roundedRequired,
      status: "ACHIEVABLE",
      message: `Comfortably achievable: score ${roundedRequired}% on remaining assessments to achieve ${t.name}.`,
    };
  });

  return {
    module_id: moduleId,
    module_code: moduleCode,
    module_name: moduleName,
    total_weight_configured: totalWeight,
    graded_weight_completed: gradedWeight,
    pending_weight: pendingWeight,
    remaining_weight: pendingWeight,
    current_coursework_average: Math.round(currentCourseworkAvg * 10) / 10,
    accumulated_course_points: Math.round(accumulatedPoints * 10) / 10,
    max_possible_final_grade: maxPossible,
    min_guaranteed_final_grade: minGuaranteed,
    dp_subminimum_required: dpSubminimum,
    dp_status: dpStatus,
    dp_message: dpMessage,
    classification,
    projections,
  };
}

/**
 * Calculates semester-level academic performance across all registered modules
 */
export function calculateSemesterOverview(
  moduleProjections: ModuleGradeProjection[]
): SemesterOverviewReport {
  if (moduleProjections.length === 0) {
    return {
      overall_weighted_average: 0,
      total_modules_evaluated: 0,
      at_risk_modules_count: 0,
      distinction_track_count: 0,
      modules: [],
    };
  }

  let totalAvg = 0;
  let evaluated = 0;
  let atRisk = 0;
  let distinctions = 0;

  for (const m of moduleProjections) {
    if (m.graded_weight_completed > 0) {
      totalAvg += m.current_coursework_average;
      evaluated++;
    }
    if (m.dp_status === "DP_AT_RISK" || m.dp_status === "DP_SUBMINIMUM_FAILED") {
      atRisk++;
    }
    if (m.current_coursework_average >= 75) {
      distinctions++;
    }
  }

  const overallAvg = evaluated > 0 ? Math.round((totalAvg / evaluated) * 10) / 10 : 0;

  return {
    overall_weighted_average: overallAvg,
    total_modules_evaluated: moduleProjections.length,
    at_risk_modules_count: atRisk,
    distinction_track_count: distinctions,
    modules: moduleProjections,
  };
}
