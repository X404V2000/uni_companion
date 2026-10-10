/**
 * UI Component for Flashcards & Spaced Repetition (SuperMemo SM-2)
 * High-speed active recall drill player, deck management, and AI card generator.
 */

export function renderFlashcardsViewsHtml(): string {
  return `
      <!-- ==================================================== -->
      <!-- VIEW: FLASHCARD DECKS CATALOG                        -->
      <!-- ==================================================== -->
      <section id="viewFlashcardsList" class="hidden max-w-[760px] mx-auto py-6 px-4 sm:px-6 space-y-5">
        
        <!-- Header & Action -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#262932]">
          <div>
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-[2px] bg-[#3b5b8c]"></span>
              <h1 class="text-[20px] font-semibold text-[#f3f4f6] tracking-tight">Flashcards & Active Recall</h1>
            </div>
            <p class="text-[13px] text-[#9ca3af] mt-0.5">Spaced repetition (SM-2) engine for exam prep and long-term memory retention</p>
          </div>
          <div class="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <button onclick="openAiGenerateModal()"
              class="bg-[#1b1e25] hover:bg-[#262932] border border-[#262932] text-[#f3f4f6] px-3 py-1.5 rounded-[6px] text-[12px] font-medium flex items-center gap-1.5 state-transition">
              <svg class="w-3.5 h-3.5 text-[#3b5b8c]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>AI Generate</span>
            </button>
            <button onclick="openCreateDeckModal()"
              class="bg-[#3b5b8c] hover:bg-[#466ba3] active:bg-[#2e476e] text-white px-3 py-1.5 rounded-[6px] text-[12px] font-medium flex items-center gap-1.5 state-transition">
              <span>+ New Deck</span>
            </button>
          </div>
        </div>

        <!-- Overall SM-2 Progress & Metrics Card -->
        <div id="flashcardsSummaryCard" class="bg-[#15171d] border border-[#262932] rounded-[10px] p-4">
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center sm:text-left">
            <div class="p-2 rounded-[6px] bg-[#0c0d11] border border-[#262932]/60">
              <span class="text-[11px] text-[#9ca3af] uppercase tracking-wider block">Due Today</span>
              <div id="statDueToday" class="text-[20px] font-bold text-[#f59e0b] mt-0.5">0</div>
              <span class="text-[10px] text-[#6b7280]">Scheduled reviews</span>
            </div>
            <div class="p-2 rounded-[6px] bg-[#0c0d11] border border-[#262932]/60">
              <span class="text-[11px] text-[#9ca3af] uppercase tracking-wider block">Learning</span>
              <div id="statLearning" class="text-[20px] font-bold text-[#3b5b8c] mt-0.5">0</div>
              <span class="text-[10px] text-[#6b7280]">0 - 1 repetitions</span>
            </div>
            <div class="p-2 rounded-[6px] bg-[#0c0d11] border border-[#262932]/60">
              <span class="text-[11px] text-[#9ca3af] uppercase tracking-wider block">Mastered</span>
              <div id="statMastered" class="text-[20px] font-bold text-[#10b981] mt-0.5">0</div>
              <span class="text-[10px] text-[#6b7280]">3+ consecutive recalls</span>
            </div>
            <div class="p-2 rounded-[6px] bg-[#0c0d11] border border-[#262932]/60">
              <span class="text-[11px] text-[#9ca3af] uppercase tracking-wider block">Retention Rate</span>
              <div id="statRetention" class="text-[20px] font-bold text-[#f3f4f6] mt-0.5">0%</div>
              <span class="text-[10px] text-[#6b7280]">Long-term consolidation</span>
            </div>
          </div>

          <div class="mt-3 pt-3 border-t border-[#262932]/60 flex items-center justify-between flex-wrap gap-2 text-[12px]">
            <div class="flex items-center gap-2 text-[#9ca3af]">
              <span class="w-2 h-2 rounded-full bg-[#10b981]"></span>
              <span>SM-2 Memory Decay Tracker Active</span>
            </div>
            <button id="btnStudyAllDue" onclick="startStudyAllDue()"
              class="text-[#3b5b8c] hover:underline font-medium inline-flex items-center gap-1">
              <span>Study All Due Cards &rarr;</span>
            </button>
          </div>
        </div>

        <!-- Decks List Section -->
        <div class="space-y-3">
          <div class="flex items-center justify-between text-[13px] text-[#9ca3af] px-1">
            <span class="font-medium text-[#f3f4f6]">Your Study Decks</span>
            <span id="deckCountLabel" class="text-[12px] text-[#6b7280]">0 decks</span>
          </div>

          <div id="allDecksContainer" class="space-y-3">
            <!-- Dynamically populated by loadFlashcardDecks -->
            <div class="p-8 text-center text-[#6b7280] text-[13px] bg-[#15171d] border border-[#262932] rounded-[10px]">
              Loading study decks...
            </div>
          </div>
        </div>

      </section>

      <!-- ==================================================== -->
      <!-- VIEW: ACTIVE STUDY DRILL PLAYER (FLIP CARD)          -->
      <!-- ==================================================== -->
      <section id="viewFlashcardsStudy" class="hidden max-w-[680px] mx-auto py-6 px-4 sm:px-6 space-y-4">
        
        <!-- Top bar -->
        <div class="flex items-center justify-between pb-3 border-b border-[#262932]">
          <button onclick="exitStudySession()"
            class="text-[12px] text-[#9ca3af] hover:text-[#f3f4f6] flex items-center gap-1.5 state-transition">
            <span>&larr; Back to Decks</span>
          </button>
          <div class="flex items-center gap-2">
            <span id="studyDeckBadge" class="text-[11px] font-mono px-2 py-0.5 rounded bg-[#1b1e25] text-[#9ca3af] border border-[#262932]">
              COS 212
            </span>
            <span id="studyCardCounter" class="text-[12px] font-medium text-[#f3f4f6]">
              Card 1 of 5
            </span>
          </div>
        </div>

        <!-- Study Card Player -->
        <div id="studyActiveContainer" class="space-y-4">
          <!-- Flip Card Visual Box -->
          <div id="flashcardBox" onclick="flipCurrentCard()"
            class="min-h-[280px] bg-[#15171d] border border-[#262932] hover:border-[#3b5b8c]/50 rounded-[12px] p-6 flex flex-col justify-between cursor-pointer select-none transition-all duration-200 relative group shadow-lg">
            
            <!-- Card Meta Header -->
            <div class="flex items-center justify-between text-[11px] text-[#6b7280] pb-2 border-b border-[#262932]/50">
              <span id="cardSideLabel" class="uppercase tracking-wider font-semibold text-[#3b5b8c]">Question (Prompt)</span>
              <span class="text-[11px] text-[#4b5563] group-hover:text-[#9ca3af] transition-colors">Click or press Space to flip</span>
            </div>

            <!-- Card Content Body -->
            <div class="my-auto py-4">
              <!-- Question State -->
              <div id="cardFrontContent" class="space-y-3">
                <p id="cardFrontText" class="text-[17px] font-medium text-[#f3f4f6] leading-relaxed">
                  Question text here
                </p>
                <div id="cardHintContainer" class="hidden text-[12px] text-[#d97706] bg-[#d97706]/10 p-2.5 rounded-[6px] border border-[#d97706]/30">
                  <span class="font-semibold block mb-0.5">💡 Exam Hint:</span>
                  <span id="cardHintText">Hint content</span>
                </div>
              </div>

              <!-- Answer State (Hidden until flipped) -->
              <div id="cardBackContent" class="hidden space-y-3">
                <div class="text-[12px] text-[#9ca3af] font-medium border-l-2 border-[#3b5b8c] pl-2.5 py-0.5 mb-2">
                  <span id="cardBackQuestionRef">Original Question Ref</span>
                </div>
                <div id="cardBackText" class="text-[15px] text-[#e5e7eb] whitespace-pre-line leading-relaxed">
                  Detailed Answer Text
                </div>
              </div>
            </div>

            <!-- Bottom Tags & Actions -->
            <div class="flex items-center justify-between pt-2 border-t border-[#262932]/50 text-[11px] text-[#6b7280]">
              <div id="cardTagsContainer" class="flex items-center gap-1.5 flex-wrap">
                <!-- Tags -->
              </div>
              <button id="btnRevealHint" type="button" onclick="event.stopPropagation(); toggleCardHint();"
                class="text-[11px] text-[#3b5b8c] hover:underline font-medium">
                Show hint
              </button>
            </div>
          </div>

          <!-- Bottom Action Controls: Flipped Rating Options vs Prompt Action -->
          <div id="studyRatingControls" class="space-y-2">
            <!-- Unflipped Prompt -->
            <div id="unflippedControls" class="flex items-center justify-between">
              <span class="text-[12px] text-[#6b7280]">Think of your answer, then tap to test recall.</span>
              <button onclick="flipCurrentCard()"
                class="bg-[#1b1e25] hover:bg-[#262932] border border-[#262932] text-[#f3f4f6] px-4 py-2 rounded-[6px] text-[13px] font-medium flex items-center gap-1.5 state-transition">
                <span>Show Answer [Space]</span>
              </button>
            </div>

            <!-- Flipped Rating Buttons (SuperMemo SM-2) -->
            <div id="flippedControls" class="hidden space-y-2">
              <div class="flex items-center justify-between text-[11px] text-[#9ca3af] px-1">
                <span>Rate your active recall quality:</span>
                <span class="text-[#6b7280]">Keys: 1, 2, 3, 4</span>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <!-- Rating 1: Again -->
                <button onclick="submitCardRating(1)"
                  class="bg-[#ef4444]/15 hover:bg-[#ef4444]/25 active:bg-[#ef4444]/35 text-[#ef4444] border border-[#ef4444]/30 py-2.5 px-2 rounded-[8px] text-center state-transition group">
                  <div class="text-[13px] font-semibold">1 · Again</div>
                  <div class="text-[10px] opacity-75 mt-0.5">&lt; 10m (Reset)</div>
                </button>
                <!-- Rating 2: Hard -->
                <button onclick="submitCardRating(2)"
                  class="bg-[#f59e0b]/15 hover:bg-[#f59e0b]/25 active:bg-[#f59e0b]/35 text-[#f59e0b] border border-[#f59e0b]/30 py-2.5 px-2 rounded-[8px] text-center state-transition group">
                  <div class="text-[13px] font-semibold">2 · Hard</div>
                  <div class="text-[10px] opacity-75 mt-0.5">1 - 2 days</div>
                </button>
                <!-- Rating 3: Good -->
                <button onclick="submitCardRating(3)"
                  class="bg-[#3b5b8c]/20 hover:bg-[#3b5b8c]/35 active:bg-[#3b5b8c]/50 text-[#93c5fd] border border-[#3b5b8c]/40 py-2.5 px-2 rounded-[8px] text-center state-transition group">
                  <div class="text-[13px] font-semibold">3 · Good</div>
                  <div class="text-[10px] opacity-75 mt-0.5">3 - 6 days</div>
                </button>
                <!-- Rating 4: Easy -->
                <button onclick="submitCardRating(4)"
                  class="bg-[#10b981]/15 hover:bg-[#10b981]/25 active:bg-[#10b981]/35 text-[#10b981] border border-[#10b981]/30 py-2.5 px-2 rounded-[8px] text-center state-transition group">
                  <div class="text-[13px] font-semibold">4 · Easy</div>
                  <div class="text-[10px] opacity-75 mt-0.5">7+ days bonus</div>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Session Finished View -->
        <div id="studySessionCompleteBox" class="hidden bg-[#15171d] border border-[#262932] rounded-[12px] p-6 text-center space-y-4">
          <div class="w-12 h-12 rounded-full bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30 flex items-center justify-center mx-auto text-[22px]">
            ✓
          </div>
          <div>
            <h2 class="text-[18px] font-semibold text-[#f3f4f6]">Study Session Complete!</h2>
            <p class="text-[13px] text-[#9ca3af] mt-1">All cards scheduled for this session have been consolidated with SM-2 intervals.</p>
          </div>

          <div id="sessionStatsBreakdown" class="grid grid-cols-3 gap-2 max-w-[400px] mx-auto text-center py-2">
            <div class="bg-[#0c0d11] p-2.5 rounded-[8px] border border-[#262932]">
              <span class="text-[10px] text-[#9ca3af] block">Cards Reviewed</span>
              <span id="statSessionCount" class="text-[16px] font-bold text-[#f3f4f6]">0</span>
            </div>
            <div class="bg-[#0c0d11] p-2.5 rounded-[8px] border border-[#262932]">
              <span class="text-[10px] text-[#9ca3af] block">Next Due</span>
              <span class="text-[16px] font-bold text-[#3b5b8c]">Tomorrow</span>
            </div>
            <div class="bg-[#0c0d11] p-2.5 rounded-[8px] border border-[#262932]">
              <span class="text-[10px] text-[#9ca3af] block">Session Retention</span>
              <span id="statSessionAccuracy" class="text-[16px] font-bold text-[#10b981]">100%</span>
            </div>
          </div>

          <div class="flex items-center justify-center gap-2 pt-2">
            <button onclick="restartCurrentDeckSession()"
              class="bg-[#1b1e25] hover:bg-[#262932] border border-[#262932] text-[#f3f4f6] px-4 py-1.5 rounded-[6px] text-[12px] font-medium state-transition">
              Review Again Anyway
            </button>
            <button onclick="exitStudySession()"
              class="bg-[#3b5b8c] hover:bg-[#466ba3] text-white px-4 py-1.5 rounded-[6px] text-[12px] font-medium state-transition">
              Return to Decks
            </button>
          </div>
        </div>

      </section>

      <!-- ==================================================== -->
      <!-- MODAL: CREATE DECK                                   -->
      <!-- ==================================================== -->
      <div id="createDeckModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <div class="bg-[#15171d] border border-[#262932] rounded-[12px] max-w-[460px] w-full p-5 space-y-4 shadow-xl">
          <div class="flex items-center justify-between pb-2 border-b border-[#262932]">
            <h2 class="text-[16px] font-semibold text-[#f3f4f6]">Create New Study Deck</h2>
            <button onclick="closeCreateDeckModal()" class="text-[#9ca3af] hover:text-[#f3f4f6] text-[18px] leading-none">&times;</button>
          </div>

          <form onsubmit="handleCreateDeckSubmit(event)" class="space-y-3">
            <div>
              <label class="block text-[11px] text-[#9ca3af] uppercase font-medium mb-1">Module Code</label>
              <input id="inputDeckModule" type="text" placeholder="e.g. COS 212 or INF 214" required
                class="w-full bg-[#0c0d11] border border-[#262932] rounded-[6px] px-3 py-1.5 text-[13px] text-[#f3f4f6] placeholder-[#4b5563] focus:border-[#3b5b8c] outline-none" />
            </div>

            <div>
              <label class="block text-[11px] text-[#9ca3af] uppercase font-medium mb-1">Deck Title</label>
              <input id="inputDeckTitle" type="text" placeholder="e.g. Tree Invariants & Heaps" required
                class="w-full bg-[#0c0d11] border border-[#262932] rounded-[6px] px-3 py-1.5 text-[13px] text-[#f3f4f6] placeholder-[#4b5563] focus:border-[#3b5b8c] outline-none" />
            </div>

            <div>
              <label class="block text-[11px] text-[#9ca3af] uppercase font-medium mb-1">Description (Optional)</label>
              <textarea id="inputDeckDescription" rows="2" placeholder="Brief outline of concepts covered..."
                class="w-full bg-[#0c0d11] border border-[#262932] rounded-[6px] px-3 py-1.5 text-[13px] text-[#f3f4f6] placeholder-[#4b5563] focus:border-[#3b5b8c] outline-none"></textarea>
            </div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-[#262932]">
              <button type="button" onclick="closeCreateDeckModal()"
                class="px-3 py-1.5 text-[12px] text-[#9ca3af] hover:text-[#f3f4f6]">Cancel</button>
              <button type="submit"
                class="bg-[#3b5b8c] hover:bg-[#466ba3] text-white px-4 py-1.5 rounded-[6px] text-[12px] font-medium state-transition">
                Create Deck
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- ==================================================== -->
      <!-- MODAL: ADD MANUAL CARD                               -->
      <!-- ==================================================== -->
      <div id="addCardModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <div class="bg-[#15171d] border border-[#262932] rounded-[12px] max-w-[500px] w-full p-5 space-y-4 shadow-xl">
          <div class="flex items-center justify-between pb-2 border-b border-[#262932]">
            <div>
              <h2 class="text-[16px] font-semibold text-[#f3f4f6]">Add Active-Recall Card</h2>
              <p id="addCardDeckSub" class="text-[11px] text-[#9ca3af]">Deck: COS 212</p>
            </div>
            <button onclick="closeAddCardModal()" class="text-[#9ca3af] hover:text-[#f3f4f6] text-[18px] leading-none">&times;</button>
          </div>

          <form onsubmit="handleAddCardSubmit(event)" class="space-y-3">
            <input type="hidden" id="addCardDeckId" value="" />

            <div>
              <label class="block text-[11px] text-[#9ca3af] uppercase font-medium mb-1">Front (Question or Concept Prompt)</label>
              <textarea id="inputCardFront" rows="3" required placeholder="What is the amortized cost of inserting into an AVL tree?"
                class="w-full bg-[#0c0d11] border border-[#262932] rounded-[6px] px-3 py-1.5 text-[13px] text-[#f3f4f6] placeholder-[#4b5563] focus:border-[#3b5b8c] outline-none"></textarea>
            </div>

            <div>
              <label class="block text-[11px] text-[#9ca3af] uppercase font-medium mb-1">Back (Definitive Answer & Exam Rubric)</label>
              <textarea id="inputCardBack" rows="4" required placeholder="O(log n) because the tree height is bounded strictly by 1.44 log n..."
                class="w-full bg-[#0c0d11] border border-[#262932] rounded-[6px] px-3 py-1.5 text-[13px] text-[#f3f4f6] placeholder-[#4b5563] focus:border-[#3b5b8c] outline-none"></textarea>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-[11px] text-[#9ca3af] uppercase font-medium mb-1">Hint (Optional)</label>
                <input id="inputCardHint" type="text" placeholder="Consider tree height bound"
                  class="w-full bg-[#0c0d11] border border-[#262932] rounded-[6px] px-3 py-1.5 text-[13px] text-[#f3f4f6] placeholder-[#4b5563] focus:border-[#3b5b8c] outline-none" />
              </div>
              <div>
                <label class="block text-[11px] text-[#9ca3af] uppercase font-medium mb-1">Tags (Comma-separated)</label>
                <input id="inputCardTags" type="text" placeholder="trees, avl, complexity"
                  class="w-full bg-[#0c0d11] border border-[#262932] rounded-[6px] px-3 py-1.5 text-[13px] text-[#f3f4f6] placeholder-[#4b5563] focus:border-[#3b5b8c] outline-none" />
              </div>
            </div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-[#262932]">
              <button type="button" onclick="closeAddCardModal()"
                class="px-3 py-1.5 text-[12px] text-[#9ca3af] hover:text-[#f3f4f6]">Cancel</button>
              <button type="submit"
                class="bg-[#3b5b8c] hover:bg-[#466ba3] text-white px-4 py-1.5 rounded-[6px] text-[12px] font-medium state-transition">
                Save Card
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- ==================================================== -->
      <!-- MODAL: AI FLASHCARD GENERATOR                        -->
      <!-- ==================================================== -->
      <div id="aiFlashcardModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <div class="bg-[#15171d] border border-[#262932] rounded-[12px] max-w-[560px] w-full p-5 space-y-4 shadow-xl max-h-[90vh] flex flex-col">
          <div class="flex items-center justify-between pb-2 border-b border-[#262932]">
            <div>
              <div class="flex items-center gap-1.5">
                <svg class="w-4 h-4 text-[#3b5b8c]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <h2 class="text-[16px] font-semibold text-[#f3f4f6]">AI Active-Recall Generator</h2>
              </div>
              <p class="text-[11px] text-[#9ca3af] mt-0.5">Extracts high-yield test questions and boundary checks from course notes</p>
            </div>
            <button onclick="closeAiGenerateModal()" class="text-[#9ca3af] hover:text-[#f3f4f6] text-[18px] leading-none">&times;</button>
          </div>

          <!-- Input Mode -->
          <div id="aiGeneratorForm" class="space-y-3 overflow-y-auto pr-1">
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-[11px] text-[#9ca3af] uppercase font-medium mb-1">Target Deck</label>
                <select id="selectAiTargetDeck"
                  class="w-full bg-[#0c0d11] border border-[#262932] rounded-[6px] px-3 py-1.5 text-[13px] text-[#f3f4f6] focus:border-[#3b5b8c] outline-none">
                  <!-- Populated dynamically -->
                </select>
              </div>
              <div>
                <label class="block text-[11px] text-[#9ca3af] uppercase font-medium mb-1">Card Count</label>
                <select id="selectAiCardCount"
                  class="w-full bg-[#0c0d11] border border-[#262932] rounded-[6px] px-3 py-1.5 text-[13px] text-[#f3f4f6] focus:border-[#3b5b8c] outline-none">
                  <option value="3">3 high-yield cards</option>
                  <option value="4" selected>4 high-yield cards</option>
                  <option value="6">6 high-yield cards</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-[11px] text-[#9ca3af] uppercase font-medium mb-1">Lecture Text / Topic Notes</label>
              <textarea id="inputAiContent" rows="6" placeholder="Paste lecture slide text, textbook extract, or type a topic (e.g. 'SQL transaction isolation levels: Read Committed vs Repeatable Read and dirty reads anomaly')..."
                class="w-full bg-[#0c0d11] border border-[#262932] rounded-[6px] px-3 py-2 text-[12px] text-[#f3f4f6] placeholder-[#4b5563] focus:border-[#3b5b8c] outline-none leading-relaxed"></textarea>
            </div>

            <!-- Low-data note -->
            <div class="text-[11px] text-[#6b7280] flex items-center gap-1.5 bg-[#0c0d11] p-2 rounded border border-[#262932]">
              <span class="text-[#10b981]">●</span>
              <span>Ultra low-bandwidth JSON synthesis (&lt; 2KB response). Works seamlessly on campus Wi-Fi or mobile data.</span>
            </div>
          </div>

          <!-- Loading state -->
          <div id="aiGeneratorLoading" class="hidden py-8 text-center space-y-2">
            <div class="w-6 h-6 border-2 border-[#3b5b8c] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p class="text-[13px] text-[#f3f4f6] font-medium">Synthesizing exam questions & SM-2 cards...</p>
            <p class="text-[11px] text-[#6b7280]">Analyzing boundaries, definitions, and rubric marking criteria</p>
          </div>

          <!-- Actions -->
          <div id="aiGeneratorActions" class="flex items-center justify-end gap-2 pt-2 border-t border-[#262932]">
            <button type="button" onclick="closeAiGenerateModal()"
              class="px-3 py-1.5 text-[12px] text-[#9ca3af] hover:text-[#f3f4f6]">Cancel</button>
            <button type="button" onclick="submitAiFlashcardGeneration()"
              class="bg-[#3b5b8c] hover:bg-[#466ba3] text-white px-4 py-1.5 rounded-[6px] text-[12px] font-medium state-transition flex items-center gap-1.5">
              <span>Generate & Save Cards</span>
            </button>
          </div>
        </div>
      </div>
  `;
}

export function getFlashcardsClientScript(): string {
  return `
    // ==========================================
    // FLASHCARDS & SPACED REPETITION (SM-2) ENGINE
    // ==========================================

    let flashcardDecksList = [];
    let currentStudyDeck = null;
    let currentStudyCards = [];
    let currentCardIndex = 0;
    let isCurrentCardFlipped = false;
    let sessionReviewedCount = 0;

    async function loadFlashcardDecks() {
      const container = document.getElementById("allDecksContainer");
      if (!container) return;

      try {
        const res = await fetch("/api/v1/flashcards/decks", {
          headers: getAuthHeaders()
        });

        if (!res.ok) {
          if (res.status === 401) {
            container.innerHTML = '<div class="p-6 text-center text-[#9ca3af] text-[13px]">Please log in to access your flashcard study decks.</div>';
            return;
          }
          throw new Error("Failed to load flashcard decks");
        }

        const data = await res.json();
        flashcardDecksList = data.decks || [];

        // Update overall summary metrics
        updateOverallFlashcardStats(flashcardDecksList);

        if (flashcardDecksList.length === 0) {
          container.innerHTML = \`
            <div class="p-8 text-center bg-[#15171d] border border-[#262932] rounded-[10px] space-y-3">
              <div class="text-[24px]">🗂️</div>
              <p class="text-[14px] font-medium text-[#f3f4f6]">No study decks created yet</p>
              <p class="text-[12px] text-[#9ca3af] max-w-[400px] mx-auto">Create a deck for your semester modules or let AI generate active-recall question cards from your lecture slides.</p>
              <div class="flex items-center justify-center gap-2 pt-1">
                <button onclick="openCreateDeckModal()" class="bg-[#3b5b8c] hover:bg-[#466ba3] text-white text-[12px] font-medium px-3.5 py-1.5 rounded-[6px] state-transition">
                  + Create Deck
                </button>
                <button onclick="openAiGenerateModal()" class="bg-[#1b1e25] border border-[#262932] text-[#f3f4f6] text-[12px] font-medium px-3.5 py-1.5 rounded-[6px] state-transition">
                  ⚡ AI Generate
                </button>
              </div>
            </div>
          \`;
          return;
        }

        const deckCountLabel = document.getElementById("deckCountLabel");
        if (deckCountLabel) {
          deckCountLabel.textContent = \`\${flashcardDecksList.length} deck\${flashcardDecksList.length === 1 ? '' : 's'}\`;
        }

        container.innerHTML = flashcardDecksList.map(deck => {
          const stats = deck.stats || { total: 0, due_today: 0, learning: 0, mastered: 0, retention_rate_pct: 0 };
          const dueCount = stats.due_today || 0;
          const dueBadgeClass = dueCount > 0 
            ? "bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/30" 
            : "bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30";
          const dueText = dueCount > 0 ? \`\${dueCount} due today\` : "Up to date";

          return \`
            <div class="bg-[#15171d] border border-[#262932] hover:border-[#3b5b8c]/50 rounded-[10px] p-4 space-y-3 state-transition">
              <div class="flex items-start justify-between gap-3">
                <div class="space-y-1">
                  <div class="flex items-center gap-2">
                    <span class="text-[11px] font-mono px-2 py-0.5 rounded bg-[#1b1e25] text-[#9ca3af] border border-[#262932]">
                      \${escapeHtml(deck.module_code)}
                    </span>
                    <h3 class="text-[15px] font-semibold text-[#f3f4f6]">\${escapeHtml(deck.title)}</h3>
                  </div>
                  \${deck.description ? \`<p class="text-[12px] text-[#9ca3af] line-clamp-1">\${escapeHtml(deck.description)}</p>\` : ''}
                </div>
                <span class="text-[11px] font-medium px-2 py-0.5 rounded-[4px] border \${dueBadgeClass} whitespace-nowrap">
                  \${dueText}
                </span>
              </div>

              <!-- Deck Stats Bar -->
              <div class="grid grid-cols-4 gap-2 pt-2 border-t border-[#262932]/60 text-[11px]">
                <div>
                  <span class="text-[#6b7280] block">Cards</span>
                  <span class="font-medium text-[#f3f4f6]">\${stats.total}</span>
                </div>
                <div>
                  <span class="text-[#6b7280] block">Learning</span>
                  <span class="font-medium text-[#3b5b8c]">\${stats.learning}</span>
                </div>
                <div>
                  <span class="text-[#6b7280] block">Mastered</span>
                  <span class="font-medium text-[#10b981]">\${stats.mastered}</span>
                </div>
                <div>
                  <span class="text-[#6b7280] block">Retention</span>
                  <span class="font-medium text-[#f3f4f6]">\${stats.retention_rate_pct}%</span>
                </div>
              </div>

              <!-- Card Action Buttons -->
              <div class="flex items-center justify-between pt-1 border-t border-[#262932]/60 text-[12px]">
                <div class="flex items-center gap-2">
                  <button onclick="openAddCardModal('\${deck.id}', '\${escapeHtml(deck.module_code)}')"
                    class="text-[#9ca3af] hover:text-[#f3f4f6] state-transition">
                    + Card
                  </button>
                  <span class="text-[#262932]">·</span>
                  <button onclick="openAiGenerateModal('\${deck.id}', '\${escapeHtml(deck.module_code)}')"
                    class="text-[#3b5b8c] hover:underline state-transition">
                    ⚡ AI Cards
                  </button>
                  <span class="text-[#262932]">·</span>
                  <button onclick="handleResetDeckIntervals('\${deck.id}')"
                    class="text-[#9ca3af] hover:text-[#d1d5db] state-transition" title="Reset SM-2 intervals before exams">
                    Reset
                  </button>
                  <span class="text-[#262932]">·</span>
                  <button onclick="handleDeleteDeck('\${deck.id}')"
                    class="text-[#ef4444]/70 hover:text-[#ef4444] state-transition">
                    Delete
                  </button>
                </div>

                <button onclick="startDeckStudySession('\${deck.id}', false)"
                  class="bg-[#3b5b8c] hover:bg-[#466ba3] active:bg-[#2e476e] text-white px-3 py-1 rounded-[5px] font-medium state-transition flex items-center gap-1">
                  <span>\${dueCount > 0 ? \`Study Due (\${dueCount})\` : 'Review All'} &rarr;</span>
                </button>
              </div>
            </div>
          \`;
        }).join("");

      } catch (err) {
        console.error("loadFlashcardDecks error:", err);
        container.innerHTML = '<div class="p-6 text-center text-[#ef4444] text-[13px]">Error loading study decks. Please try again.</div>';
      }
    }

    function updateOverallFlashcardStats(decks) {
      let totalDue = 0;
      let totalLearning = 0;
      let totalMastered = 0;
      let totalCards = 0;

      for (const d of decks) {
        const s = d.stats || {};
        totalDue += s.due_today || 0;
        totalLearning += s.learning || 0;
        totalMastered += s.mastered || 0;
        totalCards += s.total || 0;
      }

      const statDue = document.getElementById("statDueToday");
      const statLearn = document.getElementById("statLearning");
      const statMast = document.getElementById("statMastered");
      const statRet = document.getElementById("statRetention");
      const btnAllDue = document.getElementById("btnStudyAllDue");

      if (statDue) statDue.textContent = totalDue;
      if (statLearn) statLearn.textContent = totalLearning;
      if (statMast) statMast.textContent = totalMastered;
      if (statRet) {
        const retPct = totalCards > 0 ? Math.round((totalMastered / totalCards) * 100) : 0;
        statRet.textContent = \`\${retPct}%\`;
      }
      if (btnAllDue) {
        btnAllDue.style.display = totalDue > 0 ? "inline-flex" : "none";
        btnAllDue.textContent = \`Study All Due Cards (\${totalDue}) &rarr;\`;
      }
    }

    // --- ACTIVE STUDY DRILL SESSION ---

    async function startDeckStudySession(deckId, onlyDue = false) {
      try {
        const res = await fetch(\`/api/v1/flashcards/decks/\${deckId}\`, {
          headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error("Could not load study deck cards");

        const data = await res.json();
        currentStudyDeck = data.deck;
        
        // Prioritize due cards first; if none due, review all
        const dueCards = (data.cards || []).filter(c => new Date(c.next_review_date) <= new Date());
        currentStudyCards = dueCards.length > 0 ? dueCards : (data.cards || []);

        if (currentStudyCards.length === 0) {
          showToast("This deck has no cards yet. Add cards or generate with AI to begin studying.", "info");
          return;
        }

        currentCardIndex = 0;
        sessionReviewedCount = 0;
        openStudyPlayerView();
      } catch (err) {
        console.error("startDeckStudySession error:", err);
        showToast("Failed to launch study session.", "error");
      }
    }

    async function startStudyAllDue() {
      try {
        // Collect due cards across all decks
        let dueCards = [];
        for (const deck of flashcardDecksList) {
          const res = await fetch(\`/api/v1/flashcards/decks/\${deck.id}?due=true\`, {
            headers: getAuthHeaders()
          });
          if (res.ok) {
            const data = await res.json();
            if (data.cards && data.cards.length > 0) {
              dueCards.push(...data.cards);
            }
          }
        }

        if (dueCards.length === 0) {
          showToast("No cards are currently due for review. Great job staying ahead!", "info");
          return;
        }

        currentStudyDeck = {
          title: "All Due Cards (Semester Consolidation)",
          module_code: "ALL"
        };
        currentStudyCards = dueCards;
        currentCardIndex = 0;
        sessionReviewedCount = 0;
        openStudyPlayerView();
      } catch (err) {
        console.error("startStudyAllDue error:", err);
        showToast("Failed to load due cards.", "error");
      }
    }

    function openStudyPlayerView() {
      // Switch view
      const viewList = document.getElementById("viewFlashcardsList");
      const viewStudy = document.getElementById("viewFlashcardsStudy");
      if (viewList) viewList.classList.add("hidden");
      if (viewStudy) viewStudy.classList.remove("hidden");

      const completeBox = document.getElementById("studySessionCompleteBox");
      const activeContainer = document.getElementById("studyActiveContainer");
      if (completeBox) completeBox.classList.add("hidden");
      if (activeContainer) activeContainer.classList.remove("hidden");

      renderActiveCard();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function renderActiveCard() {
      if (currentCardIndex >= currentStudyCards.length) {
        showSessionComplete();
        return;
      }

      const card = currentStudyCards[currentCardIndex];
      isCurrentCardFlipped = false;

      // Update counters
      const badge = document.getElementById("studyDeckBadge");
      const counter = document.getElementById("studyCardCounter");
      if (badge) badge.textContent = currentStudyDeck ? currentStudyDeck.module_code : (card.module_code || "STUDY");
      if (counter) counter.textContent = \`Card \${currentCardIndex + 1} of \${currentStudyCards.length}\`;

      // Reset card flip view
      const frontContent = document.getElementById("cardFrontContent");
      const backContent = document.getElementById("cardBackContent");
      const sideLabel = document.getElementById("cardSideLabel");
      const frontText = document.getElementById("cardFrontText");
      const backText = document.getElementById("cardBackText");
      const backRef = document.getElementById("cardBackQuestionRef");
      const hintBox = document.getElementById("cardHintContainer");
      const hintText = document.getElementById("cardHintText");
      const btnHint = document.getElementById("btnRevealHint");
      const tagsContainer = document.getElementById("cardTagsContainer");

      if (frontContent) frontContent.classList.remove("hidden");
      if (backContent) backContent.classList.add("hidden");
      if (sideLabel) {
        sideLabel.textContent = "Question (Prompt)";
        sideLabel.className = "uppercase tracking-wider font-semibold text-[#3b5b8c]";
      }

      if (frontText) frontText.textContent = card.front;
      if (backText) backText.textContent = card.back;
      if (backRef) backRef.textContent = card.front;

      // Hint setup
      if (hintBox) hintBox.classList.add("hidden");
      if (card.hint) {
        if (hintText) hintText.textContent = card.hint;
        if (btnHint) {
          btnHint.classList.remove("hidden");
          btnHint.textContent = "Show hint";
        }
      } else {
        if (btnHint) btnHint.classList.add("hidden");
      }

      // Tags
      if (tagsContainer) {
        const tags = card.tags || [];
        tagsContainer.innerHTML = tags.map(t => \`
          <span class="px-1.5 py-0.5 rounded bg-[#1b1e25] text-[#9ca3af] border border-[#262932]">#\${escapeHtml(t)}</span>
        \`).join("");
      }

      // Rating controls
      const unflippedControls = document.getElementById("unflippedControls");
      const flippedControls = document.getElementById("flippedControls");
      if (unflippedControls) unflippedControls.classList.remove("hidden");
      if (flippedControls) flippedControls.classList.add("hidden");
    }

    function flipCurrentCard() {
      if (currentCardIndex >= currentStudyCards.length) return;
      isCurrentCardFlipped = !isCurrentCardFlipped;

      const frontContent = document.getElementById("cardFrontContent");
      const backContent = document.getElementById("cardBackContent");
      const sideLabel = document.getElementById("cardSideLabel");
      const unflippedControls = document.getElementById("unflippedControls");
      const flippedControls = document.getElementById("flippedControls");

      if (isCurrentCardFlipped) {
        if (frontContent) frontContent.classList.add("hidden");
        if (backContent) backContent.classList.remove("hidden");
        if (sideLabel) {
          sideLabel.textContent = "Answer & Solution (SM-2)";
          sideLabel.className = "uppercase tracking-wider font-semibold text-[#10b981]";
        }
        if (unflippedControls) unflippedControls.classList.add("hidden");
        if (flippedControls) flippedControls.classList.remove("hidden");
      } else {
        if (frontContent) frontContent.classList.remove("hidden");
        if (backContent) backContent.classList.add("hidden");
        if (sideLabel) {
          sideLabel.textContent = "Question (Prompt)";
          sideLabel.className = "uppercase tracking-wider font-semibold text-[#3b5b8c]";
        }
        if (unflippedControls) unflippedControls.classList.remove("hidden");
        if (flippedControls) flippedControls.classList.add("hidden");
      }
    }

    function toggleCardHint() {
      const hintBox = document.getElementById("cardHintContainer");
      const btnHint = document.getElementById("btnRevealHint");
      if (!hintBox) return;

      const isHidden = hintBox.classList.contains("hidden");
      if (isHidden) {
        hintBox.classList.remove("hidden");
        if (btnHint) btnHint.textContent = "Hide hint";
      } else {
        hintBox.classList.add("hidden");
        if (btnHint) btnHint.textContent = "Show hint";
      }
    }

    async function submitCardRating(rating) {
      if (currentCardIndex >= currentStudyCards.length) return;
      const card = currentStudyCards[currentCardIndex];

      try {
        const res = await fetch(\`/api/v1/flashcards/cards/\${card.id}/review\`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ rating: Number(rating) })
        });

        if (!res.ok) {
          throw new Error("Failed to record review");
        }

        const data = await res.json();
        sessionReviewedCount++;

        // Advance to next card
        currentCardIndex++;
        renderActiveCard();
      } catch (err) {
        console.error("submitCardRating error:", err);
        showToast("Error updating card schedule.", "error");
      }
    }

    function showSessionComplete() {
      const completeBox = document.getElementById("studySessionCompleteBox");
      const activeContainer = document.getElementById("studyActiveContainer");
      if (completeBox) completeBox.classList.remove("hidden");
      if (activeContainer) activeContainer.classList.add("hidden");

      const statCount = document.getElementById("statSessionCount");
      if (statCount) statCount.textContent = sessionReviewedCount;
    }

    function restartCurrentDeckSession() {
      if (!currentStudyDeck) return;
      currentCardIndex = 0;
      sessionReviewedCount = 0;
      openStudyPlayerView();
    }

    function exitStudySession() {
      const viewList = document.getElementById("viewFlashcardsList");
      const viewStudy = document.getElementById("viewFlashcardsStudy");
      if (viewStudy) viewStudy.classList.add("hidden");
      if (viewList) viewList.classList.remove("hidden");
      loadFlashcardDecks();
    }

    // Keyboard listener for rapid flashcard drills
    window.addEventListener("keydown", (e) => {
      const viewStudy = document.getElementById("viewFlashcardsStudy");
      if (!viewStudy || viewStudy.classList.contains("hidden")) return;

      // Don't trigger if user is typing in an input
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;

      if (e.code === "Space") {
        e.preventDefault();
        flipCurrentCard();
      } else if (isCurrentCardFlipped) {
        if (e.key === "1") {
          e.preventDefault();
          submitCardRating(1);
        } else if (e.key === "2") {
          e.preventDefault();
          submitCardRating(2);
        } else if (e.key === "3") {
          e.preventDefault();
          submitCardRating(3);
        } else if (e.key === "4") {
          e.preventDefault();
          submitCardRating(4);
        }
      } else if (e.key === "Escape") {
        exitStudySession();
      }
    });

    // --- MODAL CONTROLS ---

    function openCreateDeckModal() {
      const modal = document.getElementById("createDeckModal");
      if (modal) modal.classList.remove("hidden");
    }

    function closeCreateDeckModal() {
      const modal = document.getElementById("createDeckModal");
      if (modal) modal.classList.add("hidden");
    }

    async function handleCreateDeckSubmit(e) {
      e.preventDefault();
      const moduleInput = document.getElementById("inputDeckModule");
      const titleInput = document.getElementById("inputDeckTitle");
      const descInput = document.getElementById("inputDeckDescription");

      if (!moduleInput || !titleInput) return;

      try {
        const res = await fetch("/api/v1/flashcards/decks", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            module_code: moduleInput.value.trim(),
            title: titleInput.value.trim(),
            description: descInput?.value.trim() || ""
          })
        });

        if (!res.ok) {
          throw new Error("Failed to create study deck");
        }

        closeCreateDeckModal();
        moduleInput.value = "";
        titleInput.value = "";
        if (descInput) descInput.value = "";
        showToast("Study deck created successfully.", "success");
        loadFlashcardDecks();
      } catch (err) {
        console.error("handleCreateDeckSubmit error:", err);
        showToast("Error creating study deck.", "error");
      }
    }

    function openAddCardModal(deckId, moduleCode = "") {
      const modal = document.getElementById("addCardModal");
      const deckInput = document.getElementById("addCardDeckId");
      const deckSub = document.getElementById("addCardDeckSub");

      if (deckInput) deckInput.value = deckId;
      if (deckSub) deckSub.textContent = \`Module: \${moduleCode || 'Study Deck'}\`;
      if (modal) modal.classList.remove("hidden");
    }

    function closeAddCardModal() {
      const modal = document.getElementById("addCardModal");
      if (modal) modal.classList.add("hidden");
    }

    async function handleAddCardSubmit(e) {
      e.preventDefault();
      const deckId = document.getElementById("addCardDeckId")?.value;
      const frontInput = document.getElementById("inputCardFront");
      const backInput = document.getElementById("inputCardBack");
      const hintInput = document.getElementById("inputCardHint");
      const tagsInput = document.getElementById("inputCardTags");

      if (!deckId || !frontInput || !backInput) return;

      const tags = (tagsInput?.value || "").split(",").map(t => t.trim()).filter(Boolean);

      try {
        const res = await fetch(\`/api/v1/flashcards/decks/\${deckId}/cards\`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            front: frontInput.value.trim(),
            back: backInput.value.trim(),
            hint: hintInput?.value.trim() || undefined,
            tags
          })
        });

        if (!res.ok) throw new Error("Failed to save flashcard");

        closeAddCardModal();
        frontInput.value = "";
        backInput.value = "";
        if (hintInput) hintInput.value = "";
        if (tagsInput) tagsInput.value = "";
        showToast("Flashcard added to deck.", "success");
        loadFlashcardDecks();
      } catch (err) {
        console.error("handleAddCardSubmit error:", err);
        showToast("Error adding flashcard.", "error");
      }
    }

    function openAiGenerateModal(targetDeckId = "", moduleCode = "") {
      const modal = document.getElementById("aiFlashcardModal");
      const selectDeck = document.getElementById("selectAiTargetDeck");
      const loading = document.getElementById("aiGeneratorLoading");
      const form = document.getElementById("aiGeneratorForm");
      const actions = document.getElementById("aiGeneratorActions");

      if (loading) loading.classList.add("hidden");
      if (form) form.classList.remove("hidden");
      if (actions) actions.classList.remove("hidden");

      if (selectDeck) {
        selectDeck.innerHTML = flashcardDecksList.map(d => \`
          <option value="\${d.id}" \${d.id === targetDeckId ? 'selected' : ''}>
            \${escapeHtml(d.module_code)} - \${escapeHtml(d.title)}
          </option>
        \`).join("");
      }

      if (modal) modal.classList.remove("hidden");
    }

    function closeAiGenerateModal() {
      const modal = document.getElementById("aiFlashcardModal");
      if (modal) modal.classList.add("hidden");
    }

    async function submitAiFlashcardGeneration() {
      const selectDeck = document.getElementById("selectAiTargetDeck");
      const selectCount = document.getElementById("selectAiCardCount");
      const inputContent = document.getElementById("inputAiContent");
      const loading = document.getElementById("aiGeneratorLoading");
      const form = document.getElementById("aiGeneratorForm");
      const actions = document.getElementById("aiGeneratorActions");

      if (!inputContent || !inputContent.value.trim()) {
        showToast("Please enter lecture notes or a study topic.", "info");
        return;
      }

      const deckId = selectDeck?.value || "";
      const targetDeck = flashcardDecksList.find(d => d.id === deckId);
      const moduleCode = targetDeck ? targetDeck.module_code : "GENERAL";
      const cardCount = selectCount?.value || "4";

      if (loading) loading.classList.remove("hidden");
      if (form) form.classList.add("hidden");
      if (actions) actions.classList.add("hidden");

      try {
        const res = await fetch("/api/v1/flashcards/generate-ai", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            deck_id: deckId,
            module_code: moduleCode,
            content: inputContent.value.trim(),
            count: Number(cardCount)
          })
        });

        if (!res.ok) throw new Error("AI card generation failed");

        const data = await res.json();
        closeAiGenerateModal();
        inputContent.value = "";
        showToast(\`Generated and saved \${data.generated_count || cardCount} cards to \${moduleCode}!\`, "success");
        loadFlashcardDecks();
      } catch (err) {
        console.error("submitAiFlashcardGeneration error:", err);
        showToast("Failed to generate AI flashcards. Please try again.", "error");
        if (loading) loading.classList.add("hidden");
        if (form) form.classList.remove("hidden");
        if (actions) actions.classList.remove("hidden");
      }
    }

    async function handleResetDeckIntervals(deckId) {
      if (!confirm("Reset all SM-2 intervals for this deck? All cards will be scheduled for immediate active recall review.")) return;

      try {
        const res = await fetch(\`/api/v1/flashcards/decks/\${deckId}/reset\`, {
          method: "POST",
          headers: getAuthHeaders()
        });

        if (!res.ok) throw new Error("Failed to reset deck intervals");
        const data = await res.json();
        showToast(data.message || "Deck intervals reset for exam review.", "info");
        loadFlashcardDecks();
      } catch (err) {
        console.error("handleResetDeckIntervals error:", err);
        showToast("Error resetting deck.", "error");
      }
    }

    async function handleDeleteDeck(deckId) {
      if (!confirm("Are you sure you want to delete this study deck and all of its cards?")) return;

      try {
        const res = await fetch(\`/api/v1/flashcards/decks/\${deckId}\`, {
          method: "DELETE",
          headers: getAuthHeaders()
        });

        if (!res.ok) throw new Error("Failed to delete deck");
        showToast("Deck deleted successfully.", "info");
        loadFlashcardDecks();
      } catch (err) {
        console.error("handleDeleteDeck error:", err);
        showToast("Error deleting deck.", "error");
      }
    }
  `;
}
