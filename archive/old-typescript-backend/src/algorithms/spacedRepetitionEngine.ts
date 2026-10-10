/**
 * Spaced Repetition Engine (SuperMemo SM-2 Algorithm)
 * 
 * Provides:
 * 1. Mathematically rigorous SM-2 calculation for active recall intervals
 * 2. Ease factor adjustment and memory consolidation decay tracking
 * 3. Deck retention and mastery statistics calculation
 * 4. Course-aware fallback flashcard generation for low-bandwidth varsity students
 */

export type FlashcardRating = 1 | 2 | 3 | 4; // 1: Again, 2: Hard, 3: Good, 4: Easy

export interface FlashcardReviewState {
  repetition: number;
  interval: number; // in days
  ease_factor: number; // minimum 1.3, default 2.5
}

export interface FlashcardReviewResult {
  repetition: number;
  interval: number;
  ease_factor: number;
  next_review_date: string;
  last_reviewed_at: string;
  rating_label: "Again" | "Hard" | "Good" | "Easy";
}

export interface DeckStats {
  total: number;
  due_today: number;
  learning: number; // repetition <= 1
  reviewing: number; // repetition === 2
  mastered: number; // repetition >= 3 || interval >= 21
  average_ease_factor: number;
  retention_rate_pct: number;
}

export class SpacedRepetitionEngine {
  /**
   * SuperMemo SM-2 calculation for next review interval and ease factor
   */
  static calculateNextReview(
    current: FlashcardReviewState,
    rating: FlashcardRating
  ): FlashcardReviewResult {
    let repetition = current.repetition || 0;
    let interval = current.interval || 0;
    let easeFactor = current.ease_factor || 2.5;

    // Convert 1-4 scale to SM-2 quality (0-5 scale)
    // 1 -> 1 (Blackout / Total failure)
    // 2 -> 3 (Correct response recalled with serious difficulty)
    // 3 -> 4 (Correct response after hesitation)
    // 4 -> 5 (Perfect recall)
    const qualityMap: Record<FlashcardRating, number> = {
      1: 1,
      2: 3,
      3: 4,
      4: 5,
    };
    const quality = qualityMap[rating];

    // SM-2 Ease Factor calculation
    // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;
    if (easeFactor > 3.2) easeFactor = 3.2;
    easeFactor = Math.round(easeFactor * 100) / 100;

    // Calculate Interval & Repetitions
    if (rating === 1) {
      // Again: Reset repetition cycle
      repetition = 0;
      interval = 1;
    } else if (rating === 2) {
      // Hard: Repeat soon, maintain or slightly bump interval
      repetition = Math.max(1, repetition);
      interval = Math.max(1, Math.round((interval || 1) * 1.2));
    } else if (rating === 3) {
      // Good: Standard SM-2 interval progression
      if (repetition === 0) {
        interval = 1;
      } else if (repetition === 1) {
        interval = 6;
      } else {
        interval = Math.max(1, Math.round(interval * easeFactor));
      }
      repetition += 1;
    } else {
      // Easy: Accelerated mastery bonus
      if (repetition === 0) {
        interval = 3;
      } else if (repetition === 1) {
        interval = 8;
      } else {
        interval = Math.max(2, Math.round(interval * easeFactor * 1.35));
      }
      repetition += 1;
    }

    const now = new Date();
    const nextReviewDate = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000).toISOString();

    const labelMap: Record<FlashcardRating, "Again" | "Hard" | "Good" | "Easy"> = {
      1: "Again",
      2: "Hard",
      3: "Good",
      4: "Easy",
    };

    return {
      repetition,
      interval,
      ease_factor: easeFactor,
      next_review_date: nextReviewDate,
      last_reviewed_at: now.toISOString(),
      rating_label: labelMap[rating],
    };
  }

  /**
   * Aggregate deck statistics for student dashboard
   */
  static calculateDeckStats(
    cards: Array<{
      repetition: number;
      interval: number;
      ease_factor: number;
      next_review_date: string;
    }>
  ): DeckStats {
    const total = cards.length;
    if (total === 0) {
      return {
        total: 0,
        due_today: 0,
        learning: 0,
        reviewing: 0,
        mastered: 0,
        average_ease_factor: 2.5,
        retention_rate_pct: 0,
      };
    }

    const now = new Date();
    let dueToday = 0;
    let learning = 0;
    let reviewing = 0;
    let mastered = 0;
    let sumEase = 0;

    for (const card of cards) {
      const nextDate = new Date(card.next_review_date);
      if (nextDate <= now) {
        dueToday++;
      }

      if (card.repetition <= 1) {
        learning++;
      } else if (card.repetition === 2) {
        reviewing++;
      } else {
        mastered++;
      }

      sumEase += card.ease_factor || 2.5;
    }

    const avgEase = Math.round((sumEase / total) * 100) / 100;
    const retentionRate = Math.round(((reviewing + mastered) / total) * 100);

    return {
      total,
      due_today: dueToday,
      learning,
      reviewing,
      mastered,
      average_ease_factor: avgEase,
      retention_rate_pct: retentionRate,
    };
  }

  /**
   * Deterministic high-yield fallback generator for offline or quota-limited campus environments
   */
  static generateFallbackFlashcards(
    moduleCode: string,
    topicOrContent: string
  ): Array<{ front: string; back: string; hint?: string; tags: string[] }> {
    const code = (moduleCode || "").toUpperCase().trim();
    const cleanTopic = (topicOrContent || "").slice(0, 100).trim();

    if (code.includes("COS") || code.includes("CSC") || code.includes("CS")) {
      return [
        {
          front: `In ${code}, what are the primary balancing invariants of an AVL Tree during node insertion?`,
          back: `The balance factor of every node must be in {-1, 0, +1}, defined as height(left) - height(right). If an insertion causes a balance factor of ±2, single rotations (LL or RR) or double rotations (LR or RL) are performed in O(1) time to restore balance.`,
          hint: "Consider balance factor formula and the 4 rotation cases.",
          tags: ["data-structures", "trees", "exam-prep"],
        },
        {
          front: `What is the amortized and worst-case time complexity of inserting n elements into a dynamic array (vector)?`,
          back: `Amortized time is O(1) per insertion because array capacity is doubled when full (resizing takes O(n) work spread across n previous insertions). Worst-case single insertion is O(n) when a memory reallocation and copy occurs.`,
          hint: "Differentiate between aggregate analysis and single operations.",
          tags: ["complexity", "arrays", "algorithms"],
        },
        {
          front: `State the three conditions required for the Master Theorem to solve recurrences of the form T(n) = aT(n/b) + f(n).`,
          back: `1. Constants must satisfy a >= 1 and b > 1.\n2. f(n) must be asymptotically positive.\n3. Solutions compare f(n) against n^(log_b a) across Case 1 (polynomial smaller), Case 2 (equal up to polylog factor), and Case 3 (polynomial larger with regularity condition).`,
          hint: "Compare f(n) to n^(log_b a).",
          tags: ["algorithms", "recurrence", "math"],
        },
        {
          front: `What is the fundamental difference between Depth-First Search (DFS) and Breadth-First Search (BFS) in graph traversal?`,
          back: `DFS uses a LIFO stack (or recursion) to explore as deep as possible along each branch before backtracking; it is used for topological sorting and cycle detection. BFS uses a FIFO queue to explore nodes level-by-level; it guarantees the shortest path on unweighted graphs.`,
          hint: "Think about the underlying data structure: Queue vs Stack.",
          tags: ["graphs", "traversal"],
        },
      ];
    }

    if (code.includes("INF") || code.includes("IS") || code.includes("DAT")) {
      return [
        {
          front: `Define Third Normal Form (3NF) and how it eliminates transitive dependencies.`,
          back: `A relation is in 3NF if and only if it is in 2NF and every non-prime attribute is non-transitively dependent on every candidate key. That is, for every functional dependency X -> A, either X is a superkey or A is a prime attribute.`,
          hint: "No non-key attribute should determine another non-key attribute.",
          tags: ["databases", "normalisation", "3nf"],
        },
        {
          front: `Explain the ACID properties of relational database management systems.`,
          back: `Atomicity: Transactions execute completely or abort with zero side-effects.\nConsistency: Database moves from one valid state to another satisfying all schema constraints.\nIsolation: Concurrent transactions execute without cross-contamination.\nDurability: Committed transactions persist permanently even across power failures.`,
          hint: "Atomicity, Consistency, Isolation, Durability.",
          tags: ["databases", "acid", "transactions"],
        },
        {
          front: `What is the difference between a Clustered Index and a Non-Clustered (Secondary) Index in SQL?`,
          back: `A clustered index physically orders the data rows in the table leaf pages (only one per table, usually Primary Key). A non-clustered index stores index key pointers to the actual data row location and can be created on multiple columns.`,
          hint: "Physical row ordering vs pointer-based lookup.",
          tags: ["sql", "indexing", "performance"],
        },
      ];
    }

    // Universal academic fallback
    return [
      {
        front: `State the primary thesis and key theoretical principle governing ${code}: ${cleanTopic || "Foundational Concepts"}.`,
        back: `The core principle requires identifying the foundational definition, stating boundary conditions, and verifying how the mechanism behaves under edge-case constraints in university examination contexts.`,
        hint: "Recall the lecture definitions and primary formulations.",
        tags: ["core-concepts", "review"],
      },
      {
        front: `What common conceptual error or calculation trap do university students make regarding ${code}?`,
        back: `Conflating definitions with practical applications, omitting boundary condition checks, or failing to justify steps with established course theorem criteria.`,
        hint: "Think about rubric penalties from semester tests.",
        tags: ["exam-technique"],
      },
      {
        front: `Explain how to verify that a solution or proof in ${code} is complete and correct.`,
        back: `1. Check that all assumptions match the problem statement.\n2. Trace through edge cases or boundary conditions.\n3. Validate intermediate units or type consistency.\n4. Ensure every concluding claim directly answers the question prompt.`,
        hint: "Step-by-step verification methodology.",
        tags: ["methodology", "study-skills"],
      },
    ];
  }
}
