import { Router, Response } from "express";
import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";
import { db, FlashcardDeck, Flashcard } from "../db";
import { requireAuth, AuthenticatedRequest } from "../auth";
import {
  SpacedRepetitionEngine,
  FlashcardRating,
} from "../algorithms/spacedRepetitionEngine";

export const flashcardsRouter = Router();

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

// 1. GET /decks - List all decks for authenticated user with due badges & stats
flashcardsRouter.get("/decks", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const decks = await db.getFlashcardDecks(userId);

  const enrichedDecks = await Promise.all(
    decks.map(async (deck) => {
      const cards = await db.getFlashcards(deck.id);
      const stats = SpacedRepetitionEngine.calculateDeckStats(cards);
      return {
        ...deck,
        stats,
      };
    })
  );

  return res.json({
    decks: enrichedDecks,
    total_decks: enrichedDecks.length,
    total_due_today: enrichedDecks.reduce((sum, d) => sum + (d.stats?.due_today || 0), 0),
  });
});

// 2. POST /decks - Create a new study deck
flashcardsRouter.post("/decks", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { module_code, title, description, color_code } = req.body || {};

  if (!module_code || !title) {
    return res.status(400).json({ detail: "module_code and title are required." });
  }

  const deck = await db.createFlashcardDeck({
    user_id: userId,
    module_code,
    title,
    description,
    color_code,
  });

  return res.status(201).json(deck);
});

// 3. GET /decks/:deckId - Retrieve single deck with full cards & SM-2 stats
flashcardsRouter.get("/decks/:deckId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { deckId } = req.params;

  const deck = await db.getFlashcardDeck(deckId);
  if (!deck || deck.user_id !== userId) {
    return res.status(404).json({ detail: "Flashcard deck not found." });
  }

  const onlyDue = req.query.due === "true";
  const cards = await db.getFlashcards(deckId, onlyDue);
  const allCards = await db.getFlashcards(deckId, false);
  const stats = SpacedRepetitionEngine.calculateDeckStats(allCards);

  return res.json({
    deck,
    cards,
    stats,
  });
});

// 4. DELETE /decks/:deckId - Delete a deck
flashcardsRouter.delete("/decks/:deckId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { deckId } = req.params;

  const success = await db.deleteFlashcardDeck(deckId, userId);
  if (!success) {
    return res.status(404).json({ detail: "Flashcard deck not found or unauthorized." });
  }

  return res.json({ message: "Deck and all associated cards deleted." });
});

// 5. POST /decks/:deckId/reset - Reset spaced repetition intervals for exam cramming
flashcardsRouter.post("/decks/:deckId/reset", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { deckId } = req.params;

  const resetCount = await db.resetDeckProgress(deckId, userId);
  return res.json({
    message: `Reset SM-2 intervals for ${resetCount} card(s). All cards are now due for fresh review.`,
    reset_count: resetCount,
  });
});

// 6. GET /decks/:deckId/cards - Fetch cards
flashcardsRouter.get("/decks/:deckId/cards", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { deckId } = req.params;
  const deck = await db.getFlashcardDeck(deckId);

  if (!deck || deck.user_id !== userId) {
    return res.status(404).json({ detail: "Deck not found." });
  }

  const onlyDue = req.query.due === "true";
  const cards = await db.getFlashcards(deckId, onlyDue);

  return res.json({ cards });
});

// 7. POST /decks/:deckId/cards - Add a new manual card
flashcardsRouter.post("/decks/:deckId/cards", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { deckId } = req.params;
  const deck = await db.getFlashcardDeck(deckId);

  if (!deck || deck.user_id !== userId) {
    return res.status(404).json({ detail: "Deck not found." });
  }

  const { front, back, hint, tags } = req.body || {};
  if (!front || !back) {
    return res.status(400).json({ detail: "front and back of card are required." });
  }

  const card = await db.createFlashcard({
    deck_id: deckId,
    user_id: userId,
    module_code: deck.module_code,
    front,
    back,
    hint,
    tags: Array.isArray(tags) ? tags : [],
  });

  return res.status(201).json(card);
});

// 8. DELETE /cards/:cardId - Delete a single card
flashcardsRouter.delete("/cards/:cardId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { cardId } = req.params;

  const success = await db.deleteFlashcard(cardId, userId);
  if (!success) {
    return res.status(404).json({ detail: "Flashcard not found or unauthorized." });
  }

  return res.json({ message: "Flashcard deleted successfully." });
});

// 9. POST /cards/:cardId/review - Submit SM-2 review rating (1=Again, 2=Hard, 3=Good, 4=Easy)
flashcardsRouter.post("/cards/:cardId/review", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { cardId } = req.params;
  const { rating } = req.body || {};

  if (!rating || ![1, 2, 3, 4].includes(Number(rating))) {
    return res.status(400).json({ detail: "rating must be 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy)." });
  }

  const card = db.flashcards.get(cardId);
  if (!card || card.user_id !== userId) {
    return res.status(404).json({ detail: "Flashcard not found." });
  }

  // Calculate next review date and ease factor using SM-2
  const reviewResult = SpacedRepetitionEngine.calculateNextReview(
    {
      repetition: card.repetition,
      interval: card.interval,
      ease_factor: card.ease_factor,
    },
    Number(rating) as FlashcardRating
  );

  const updatedCard = await db.updateFlashcardReview(cardId, {
    repetition: reviewResult.repetition,
    interval: reviewResult.interval,
    ease_factor: reviewResult.ease_factor,
    next_review_date: reviewResult.next_review_date,
  });

  // Track analytics event
  db.analyticsEvents.push({
    id: crypto.randomUUID(),
    user_id: userId,
    event_type: "FLASHCARD_REVIEWED",
    module_code: card.module_code,
    metadata: {
      rating,
      rating_label: reviewResult.rating_label,
      interval: reviewResult.interval,
      ease_factor: reviewResult.ease_factor,
    },
    created_at: new Date().toISOString(),
  });

  // Fetch updated deck statistics
  const allCards = await db.getFlashcards(card.deck_id, false);
  const deckStats = SpacedRepetitionEngine.calculateDeckStats(allCards);

  return res.json({
    card: updatedCard,
    review_result: reviewResult,
    deck_stats: deckStats,
  });
});

// 10. POST /generate-ai - AI Active-Recall Question Generator
flashcardsRouter.post("/generate-ai", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { deck_id, module_code, content, count } = req.body || {};

  if (!module_code || !content) {
    return res.status(400).json({ detail: "module_code and content/topic are required." });
  }

  const cardCount = Math.min(10, Math.max(2, parseInt(count || "4", 10)));
  const cleanModule = (module_code as string).trim().toUpperCase();

  let generatedCards: Array<{ front: string; back: string; hint?: string; tags: string[] }> = [];

  const ai = getGeminiClient();
  if (ai) {
    try {
      const prompt = `You are an academic assessment designer for South African university degree courses (${cleanModule}).
Generate exactly ${cardCount} active-recall flashcards based on the following lecture content/topic.
Focus on exam traps, boundary conditions, definitions, and problem-solving steps.
Do not use conversational filler or emojis.
Return ONLY valid JSON matching this schema:
[
  {
    "front": "Clear, precise active recall question or prompt",
    "back": "Concise, definitive answer explaining the key concept and rubric criteria",
    "hint": "Optional short clue (under 12 words)",
    "tags": ["tag1", "tag2"]
  }
]

Content / Topic:
${content}`;

      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const text = response.text || "[]";
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        generatedCards = parsed.map((item: any) => ({
          front: String(item.front || "").trim(),
          back: String(item.back || "").trim(),
          hint: item.hint ? String(item.hint).trim() : undefined,
          tags: Array.isArray(item.tags) ? item.tags.map(String) : [cleanModule.toLowerCase()],
        })).filter((c) => c.front && c.back);
      }
    } catch (err: any) {
      console.warn("[Flashcard AI Generation Error]:", err.message);
    }
  }

  // Fallback if AI unavailable or parse failed
  if (generatedCards.length === 0) {
    generatedCards = SpacedRepetitionEngine.generateFallbackFlashcards(cleanModule, content).slice(0, cardCount);
  }

  // If a deck_id was provided, optionally auto-insert them into the deck
  let savedCards: Flashcard[] = [];
  if (deck_id) {
    const deck = await db.getFlashcardDeck(deck_id);
    if (deck && deck.user_id === userId) {
      for (const card of generatedCards) {
        const created = await db.createFlashcard({
          deck_id,
          user_id: userId,
          module_code: cleanModule,
          front: card.front,
          back: card.back,
          hint: card.hint,
          tags: card.tags,
        });
        savedCards.push(created);
      }
    }
  }

  return res.json({
    module_code: cleanModule,
    generated_count: generatedCards.length,
    cards: generatedCards,
    saved_to_deck: savedCards.length > 0,
    saved_cards: savedCards,
  });
});

// 11. GET /stats/summary - Overall student spaced repetition dashboard stats
flashcardsRouter.get("/stats/summary", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const decks = await db.getFlashcardDecks(userId);

  const allCards: Flashcard[] = [];
  for (const d of decks) {
    const cards = await db.getFlashcards(d.id);
    allCards.push(...cards);
  }

  const overallStats = SpacedRepetitionEngine.calculateDeckStats(allCards);

  return res.json({
    total_decks: decks.length,
    overall_stats: overallStats,
  });
});
