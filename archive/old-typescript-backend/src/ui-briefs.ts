export function renderBriefsViewsHtml(): string {
  return `
      <!-- ==================================================== -->
      <!-- VIEW: ASSIGNMENT BRIEFS CATALOG                      -->
      <!-- ==================================================== -->
      <section id="viewBriefsList" class="hidden max-w-[680px] mx-auto py-6 px-4 sm:px-6 space-y-4">
        
        <!-- Header & Action -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#262932]">
          <div>
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-[2px] bg-[#3b5b8c]"></span>
              <h1 class="text-[20px] font-semibold text-[#f3f4f6] tracking-tight">Assignment briefs</h1>
            </div>
            <p class="text-[13px] text-[#9ca3af] mt-0.5">AI extraction, day-by-day study roadmaps, curated resources, and RAG Q&A</p>
          </div>
          <button onclick="openParseBriefModal()"
            class="bg-[#3b5b8c] hover:bg-[#466ba3] active:bg-[#2e476e] text-white px-3.5 py-1.5 rounded-[6px] text-[13px] font-medium flex items-center justify-center gap-2 state-transition self-start sm:self-auto">
            <span>+ Parse Brief</span>
          </button>
        </div>

        <!-- At-Risk Overview Card -->
        <div id="briefsAtRiskHeaderCard" class="bg-[#15171d] border border-[#262932] rounded-[10px] p-4 space-y-2.5">
          <!-- Populated by loadBriefsCatalog -->
        </div>

        <!-- Briefs List Container -->
        <div id="allBriefsCatalogList" class="space-y-3">
          <!-- Dynamically populated briefs -->
        </div>

      </section>

      <!-- ==================================================== -->
      <!-- VIEW: ASSIGNMENT BRIEF DETAIL & WORKSPACE            -->
      <!-- ==================================================== -->
      <section id="viewBriefDetail" class="hidden max-w-[720px] mx-auto py-6 px-4 sm:px-6 space-y-4">
        
        <!-- Back navigation -->
        <div class="flex items-center justify-between">
          <button onclick="navigateTo('briefs')" class="text-[12px] text-[#9ca3af] hover:text-[#d1d5db] inline-flex items-center gap-1.5 state-transition">
            <span>&larr;</span>
            <span>Back to assignment briefs</span>
          </button>
          <div class="flex items-center gap-2">
            <button id="briefShareBtn" onclick="openShareBrief(activeBriefId)"
              class="text-[12px] text-[#25d366] hover:text-[#25d366] px-2.5 py-1 rounded-[6px] border border-[#25d366]/40 hover:bg-[#25d366]/10 state-transition flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.63C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.53 7.34C9.36 7.34 9.09 7.4 8.87 7.65C8.65 7.89 8.02 8.48 8.02 9.69C8.02 10.9 8.9 12.06 9.02 12.22C9.14 12.38 10.74 14.85 13.2 15.91C13.78 16.16 14.24 16.32 14.59 16.43C15.18 16.62 15.72 16.59 16.14 16.53C16.62 16.46 17.59 15.94 17.79 15.37C18 14.81 18 14.33 17.93 14.22C17.87 14.12 17.71 14.06 17.47 13.94C17.23 13.82 16.03 13.23 15.81 13.15C15.58 13.07 15.42 13.03 15.26 13.27C15.09 13.51 14.62 14.06 14.48 14.22C14.34 14.38 14.2 14.4 13.96 14.28C13.72 14.16 12.95 13.91 12.04 13.1C11.33 12.47 10.85 11.69 10.71 11.45C10.57 11.21 10.7 11.08 10.82 10.96C10.93 10.85 11.07 10.67 11.19 10.53C11.31 10.39 11.35 10.29 11.43 10.13C11.51 9.97 11.47 9.83 11.41 9.71C11.35 9.59 10.88 8.43 10.68 7.96C10.49 7.5 10.29 7.56 10.14 7.56C10 7.56 9.84 7.34 9.53 7.34Z"/>
              </svg>
              <span>Share Brief</span>
            </button>
            <button id="briefAddToTasksBtn" onclick="handleAddBriefToAcademicTasks()"
              class="text-[12px] text-[#9ca3af] hover:text-[#f3f4f6] px-2.5 py-1 rounded-[6px] border border-[#262932] hover:bg-[#1b1e25] state-transition">
              + Add to Academic Tasks
            </button>
            <button onclick="handleDeleteCurrentBrief()"
              class="text-[12px] text-[#b84a4a] hover:bg-[#1b1e25] px-2 py-1 rounded-[6px] state-transition">
              Delete
            </button>
          </div>
        </div>

        <!-- Brief Title & Meta Card -->
        <div class="bg-[#15171d] border border-[#262932] rounded-[10px] p-5 space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div class="space-y-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span id="briefDetailModuleCode" class="text-[12px] font-mono px-2 py-0.5 rounded-[6px] bg-[#1b1e25] text-[#d1d5db] border border-[#262932]">COS 212</span>
                <span id="briefDetailFormatPill" class="text-[12px] text-[#9ca3af] px-2 py-0.5 rounded-[6px] bg-[#0f1115] border border-[#262932]">4-page report</span>
              </div>
              <h1 id="briefDetailTitle" class="text-[20px] font-semibold text-[#f3f4f6] tracking-tight">Practical Assignment</h1>
            </div>
            <div class="text-left sm:text-right shrink-0">
              <div class="text-[11px] uppercase tracking-wider text-[#6b7280]">Due Date</div>
              <div id="briefDetailDueDate" class="text-[14px] font-medium text-[#f3f4f6] font-mono mt-0.5">24 Sep 2026, 23:59</div>
              <div id="briefDetailDaysRemaining" class="text-[12px] text-[#9ca3af]">3 days remaining</div>
            </div>
          </div>

          <!-- Live At-Risk Assessment Banner (Feature 6) -->
          <div id="briefDetailAtRiskBanner" class="rounded-[8px] p-3.5 border transition-all duration-200">
            <!-- Dynamically populated -->
          </div>
        </div>

        <!-- Four Workspace Tabs -->
        <div class="flex border-b border-[#262932] text-[13px] gap-6 overflow-x-auto">
          <button onclick="setBriefTab('studyPlan')" id="briefTabBtn-studyPlan"
            class="py-2.5 font-medium border-b-2 border-[#3b5b8c] text-[#f3f4f6] whitespace-nowrap state-transition">
            Study Plan (<span id="briefPlanCountBadge">0</span> days)
          </button>
          <button onclick="setBriefTab('resources')" id="briefTabBtn-resources"
            class="py-2.5 font-medium border-b-2 border-transparent text-[#9ca3af] hover:text-[#d1d5db] whitespace-nowrap state-transition">
            Resource Finder (<span id="briefResourceCountBadge">0</span>)
          </button>
          <button onclick="setBriefTab('chat')" id="briefTabBtn-chat"
            class="py-2.5 font-medium border-b-2 border-transparent text-[#9ca3af] hover:text-[#d1d5db] whitespace-nowrap state-transition">
            Chat with Brief (RAG)
          </button>
          <button onclick="setBriefTab('extracted')" id="briefTabBtn-extracted"
            class="py-2.5 font-medium border-b-2 border-transparent text-[#9ca3af] hover:text-[#d1d5db] whitespace-nowrap state-transition">
            Requirements & Rubric
          </button>
        </div>

        <!-- TAB CONTENT 1: STUDY PLAN (Feature 3) -->
        <div id="briefTabContent-studyPlan" class="space-y-4">
          <div class="flex items-center justify-between pt-1">
            <div>
              <h3 class="text-[15px] font-semibold text-[#f3f4f6]">Day-by-day study roadmap</h3>
              <p class="text-[12px] text-[#9ca3af]">Generated from today until deadline with milestone tasks</p>
            </div>
            <button onclick="handleRegenerateStudyPlan()" id="regenPlanBtn"
              class="text-[12px] text-[#9ca3af] hover:text-[#f3f4f6] px-2.5 py-1.5 rounded-[6px] border border-[#262932] hover:bg-[#1b1e25] state-transition">
              Regenerate Plan
            </button>
          </div>

          <!-- Overall Progress Bar -->
          <div class="bg-[#15171d] border border-[#262932] rounded-[8px] p-3.5 space-y-2">
            <div class="flex items-center justify-between text-[12px]">
              <span class="text-[#9ca3af]">Overall roadmap progress</span>
              <span id="briefPlanProgressLabel" class="font-medium text-[#f3f4f6]">0% (0/0 tasks)</span>
            </div>
            <div class="w-full bg-[#0f1115] h-2 rounded-full overflow-hidden border border-[#262932]">
              <div id="briefPlanProgressBar" class="h-full bg-[#3b5b8c] rounded-full transition-all duration-300" style="width: 0%;"></div>
            </div>
          </div>

          <!-- Days List Container -->
          <div id="briefStudyPlanDaysList" class="space-y-3">
            <!-- Dynamically populated days with checkable tasks -->
          </div>
        </div>

        <!-- TAB CONTENT 2: RESOURCE FINDER (Feature 2) -->
        <div id="briefTabContent-resources" class="hidden space-y-4">
          <div class="flex items-center justify-between pt-1">
            <div>
              <h3 class="text-[15px] font-semibold text-[#f3f4f6]">Curated study resources</h3>
              <p class="text-[12px] text-[#9ca3af]">AI-filtered YouTube tutorials, open-access articles, and official docs</p>
            </div>
            <button onclick="handleDiscoverMoreResources()" id="moreResourcesBtn"
              class="text-[12px] text-[#9ca3af] hover:text-[#f3f4f6] px-2.5 py-1.5 rounded-[6px] border border-[#262932] hover:bg-[#1b1e25] state-transition">
              Discover More
            </button>
          </div>

          <div id="briefResourcesList" class="space-y-3">
            <!-- Dynamically populated resource cards -->
          </div>
        </div>

        <!-- TAB CONTENT 3: CHAT WITH YOUR BRIEF (RAG) (Feature 4) -->
        <div id="briefTabContent-chat" class="hidden space-y-4">
          <div class="space-y-1 pt-1">
            <h3 class="text-[15px] font-semibold text-[#f3f4f6]">Chat with your brief</h3>
            <p class="text-[12px] text-[#9ca3af]">Ask questions regarding penalties, deliverables, compiler flags, and rules. Answers include citations from the document.</p>
          </div>

          <!-- Suggested Quick Questions -->
          <div class="space-y-1.5">
            <div class="text-[11px] uppercase tracking-wider text-[#6b7280]">Suggested Questions</div>
            <div class="flex flex-wrap gap-2">
              <button onclick="handleAskSampleQuestion('What is the penalty if I submit 14 hours late?')"
                class="text-[12px] text-[#9ca3af] hover:text-[#f3f4f6] px-2.5 py-1 rounded-[6px] bg-[#15171d] border border-[#262932] hover:bg-[#1b1e25] state-transition">
                Late submission penalties?
              </button>
              <button onclick="handleAskSampleQuestion('What are the exact required submission deliverables and file formats?')"
                class="text-[12px] text-[#9ca3af] hover:text-[#f3f4f6] px-2.5 py-1 rounded-[6px] bg-[#15171d] border border-[#262932] hover:bg-[#1b1e25] state-transition">
                Required deliverables?
              </button>
              <button onclick="handleAskSampleQuestion('Are standard container libraries or external packages permitted?')"
                class="text-[12px] text-[#9ca3af] hover:text-[#f3f4f6] px-2.5 py-1 rounded-[6px] bg-[#15171d] border border-[#262932] hover:bg-[#1b1e25] state-transition">
                Library constraints?
              </button>
              <button onclick="handleAskSampleQuestion('How is the practical graded and what is the mark breakdown?')"
                class="text-[12px] text-[#9ca3af] hover:text-[#f3f4f6] px-2.5 py-1 rounded-[6px] bg-[#15171d] border border-[#262932] hover:bg-[#1b1e25] state-transition">
                Marking rubric?
              </button>
            </div>
          </div>

          <!-- Chat Messages Scroll Area -->
          <div id="briefChatMessagesStream" class="bg-[#0f1115] border border-[#262932] rounded-[10px] p-4 min-h-[280px] max-h-[440px] overflow-y-auto space-y-3.5">
            <!-- Dynamically populated chat messages and citation cards -->
          </div>

          <!-- Chat Input Bar -->
          <form id="briefChatForm" onsubmit="handleSendBriefChatMessage(event)" class="flex gap-2">
            <input type="text" id="briefChatInput" required placeholder="Ask a question about this assignment brief..."
              class="flex-1 bg-[#15171d] border border-[#262932] rounded-[6px] px-3 py-2 text-[13px] text-[#f3f4f6] placeholder-[#6b7280] focus:outline-none focus:border-[#3b5b8c] state-transition">
            <button type="submit" id="briefChatSubmitBtn"
              class="bg-[#3b5b8c] hover:bg-[#466ba3] active:bg-[#2e476e] text-white px-4 py-2 rounded-[6px] text-[13px] font-medium state-transition shrink-0">
              Ask AI
            </button>
          </form>
        </div>

        <!-- TAB CONTENT 4: REQUIREMENTS & EXTRACTED DATA (Feature 1) -->
        <div id="briefTabContent-extracted" class="hidden space-y-4">
          <div class="space-y-1 pt-1">
            <h3 class="text-[15px] font-semibold text-[#f3f4f6]">Extracted specifications & rubric</h3>
            <p class="text-[12px] text-[#9ca3af]">AI-structured breakdown of deliverables, marking criteria, and document text</p>
          </div>

          <div id="briefExtractedDetailsContainer" class="space-y-3">
            <!-- Dynamically populated deliverables, criteria, penalties, and raw text -->
          </div>
        </div>

      </section>

      <!-- ======================================================== -->
      <!-- MODAL: PARSE ASSIGNMENT BRIEF (FEATURE 1)                -->
      <!-- ======================================================== -->
      <div id="parseBriefModalOverlay" class="fixed inset-0 z-50 bg-black/60 hidden flex items-center justify-center p-4">
        <div class="w-full max-w-[560px] bg-[#15171d] border border-[#262932] rounded-[10px] p-5 space-y-4 shadow-sm max-h-[90vh] flex flex-col">
          
          <div class="flex items-center justify-between pb-2 border-b border-[#262932]">
            <div>
              <h3 class="text-[16px] font-semibold text-[#f3f4f6]">Parse assignment brief</h3>
              <p class="text-[12px] text-[#9ca3af]">Upload a PDF or paste text to extract code, due date, deliverables & study plan</p>
            </div>
            <button onclick="closeParseBriefModal()" class="w-7 h-7 rounded-[6px] hover:bg-[#1b1e25] text-[#9ca3af] hover:text-[#f3f4f6] flex items-center justify-center state-transition">
              ✕
            </button>
          </div>

          <form id="parseBriefForm" onsubmit="handleRunParseBrief(event)" class="space-y-4 overflow-y-auto pr-1">
            
            <!-- Quick Fill Prototype Sample Button -->
            <div class="flex items-center justify-between p-2.5 rounded-[6px] bg-[#0f1115] border border-[#262932]">
              <span class="text-[12px] text-[#9ca3af]">Testing? Preload sample Wits COS 212 Practical:</span>
              <button type="button" onclick="loadSampleCos212Brief()"
                class="text-[12px] font-medium text-[#3b5b8c] hover:text-[#466ba3] hover:underline state-transition">
                Load sample brief
              </button>
            </div>

            <!-- PDF Upload Section -->
            <div class="space-y-1.5">
              <label class="block text-[12px] font-medium text-[#9ca3af]">Upload brief PDF (optional)</label>
              <div id="pdfDropZone" class="border-2 border-dashed border-[#262932] hover:border-[#3b5b8c] rounded-[8px] p-4 text-center cursor-pointer state-transition bg-[#0f1115]"
                   onclick="document.getElementById('briefPdfFileInput').click()">
                <svg class="w-7 h-7 mx-auto text-[#6b7280]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                </svg>
                <div id="pdfFileNameDisplay" class="text-[13px] text-[#f3f4f6] mt-1 font-medium">Click or drag PDF assignment brief here</div>
                <div class="text-[11px] text-[#6b7280]">Supports course outlines, project briefs, and rubrics up to 10MB</div>
                <input type="file" id="briefPdfFileInput" accept="application/pdf" class="hidden" onchange="handleBriefPdfSelected(event)">
              </div>
            </div>

            <!-- Text Paste Section -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="text-[12px] font-medium text-[#9ca3af]">Or paste assignment brief text</label>
                <span id="briefCharCount" class="text-[11px] text-[#6b7280]">0 chars</span>
              </div>
              <textarea id="briefTextInput" rows="6" placeholder="Paste assignment title, requirements, deadline, and marking criteria here..."
                class="w-full bg-[#0f1115] border border-[#262932] rounded-[6px] p-3 text-[13px] text-[#d1d5db] font-sans placeholder-[#6b7280] focus:outline-none focus:border-[#3b5b8c]"
                oninput="document.getElementById('briefCharCount').textContent = this.value.length + ' chars'"></textarea>
            </div>

            <!-- Optional Override Metadata -->
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-[11px] text-[#6b7280] mb-0.5">Module code (optional)</label>
                <input type="text" id="briefOverrideModuleCode" placeholder="Auto-detect or e.g. COS 212"
                  class="w-full bg-[#0f1115] border border-[#262932] rounded-[6px] px-2.5 py-1.5 text-[12px] text-[#f3f4f6] focus:outline-none focus:border-[#3b5b8c]">
              </div>
              <div>
                <label class="block text-[11px] text-[#6b7280] mb-0.5">Known due date (optional)</label>
                <input type="datetime-local" id="briefOverrideDueDate"
                  class="w-full bg-[#0f1115] border border-[#262932] rounded-[6px] px-2.5 py-1.5 text-[12px] text-[#f3f4f6] focus:outline-none focus:border-[#3b5b8c]">
              </div>
            </div>

            <!-- Submission Footer -->
            <div class="pt-2 border-t border-[#262932] flex items-center justify-between">
              <span id="parseStatusText" class="text-[12px] text-[#6b7280]">Low-data mode: runs Gemini AI server-side</span>
              <div class="flex items-center gap-2">
                <button type="button" onclick="closeParseBriefModal()" class="px-3 py-1.5 rounded-[6px] text-[13px] text-[#9ca3af] hover:text-[#d1d5db]">
                  Cancel
                </button>
                <button type="submit" id="parseBriefSubmitBtn"
                  class="bg-[#3b5b8c] hover:bg-[#466ba3] active:bg-[#2e476e] text-white px-4 py-1.5 rounded-[6px] text-[13px] font-medium state-transition">
                  Parse Brief
                </button>
              </div>
            </div>
          </form>

        </div>
      </div>
  `;
}

export function getBriefsClientScript(): string {
  return `
    let briefsList = [];
    let activeBrief = null;
    let selectedBriefPdfBase64 = null;
    let selectedBriefPdfName = null;

    // Load Briefs Catalog
    async function loadBriefsCatalog() {
      try {
        const [briefsRes, atRiskRes] = await Promise.all([
          apiFetch('/api/v1/briefs'),
          apiFetch('/api/v1/academic/at-risk')
        ]);

        if (briefsRes.ok) {
          briefsList = await briefsRes.json();
          renderBriefsCatalog(briefsList);
        }

        if (atRiskRes.ok) {
          const atRiskData = await atRiskRes.json();
          renderAtRiskHeaderCard(atRiskData);
          updateRailBriefsBadge(atRiskData);
        }
      } catch (err) {
        console.error('Error loading briefs catalog:', err);
      }
    }

    function updateRailBriefsBadge(atRiskData) {
      const badge = document.getElementById('railBriefsBadge');
      if (!badge) return;
      const criticalCount = atRiskData.critical_count || 0;
      const highCount = atRiskData.high_risk_count || 0;
      const totalAlerts = criticalCount + highCount;
      if (totalAlerts > 0) {
        badge.textContent = totalAlerts;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    function renderAtRiskHeaderCard(report) {
      const container = document.getElementById('briefsAtRiskHeaderCard');
      if (!container) return;

      const totalAtRisk = report.total_at_risk || 0;
      const crit = report.critical_count || 0;
      const high = report.high_risk_count || 0;

      if (totalAtRisk === 0) {
        container.innerHTML = \`
          <div class="flex items-center gap-2 text-[13px] text-[#3e885b]">
            <span class="w-2 h-2 rounded-full bg-[#3e885b]"></span>
            <span class="font-medium">All assignments on schedule</span>
          </div>
          <p class="text-[12px] text-[#9ca3af]">No impending deadlines detected with lagging milestone completion.</p>
        \`;
        container.className = "bg-[#15171d] border border-[#262932] rounded-[10px] p-4 space-y-1";
      } else {
        container.innerHTML = \`
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-[#b84a4a] animate-pulse"></span>
              <h3 class="text-[14px] font-semibold text-[#f3f4f6]">At-Risk Attention Needed</h3>
            </div>
            <span class="text-[11px] font-mono px-2 py-0.5 rounded-[4px] bg-[#b84a4a]/20 text-[#f3f4f6] border border-[#b84a4a]/40">
              \${crit > 0 ? crit + ' Critical' : ''}\${crit > 0 && high > 0 ? ' · ' : ''}\${high > 0 ? high + ' High Risk' : ''}
            </span>
          </div>
          <p class="text-[12px] text-[#d1d5db]">
            AI detected \${totalAtRisk} assignment\${totalAtRisk === 1 ? '' : 's'} where progress is falling behind approaching deadlines. Execute Day 1 & Day 2 study milestones to recover pacing.
          </p>
        \`;
        container.className = "bg-[#15171d] border border-[#b84a4a]/40 rounded-[10px] p-4 space-y-2";
      }
    }

    function renderBriefsCatalog(list) {
      const container = document.getElementById('allBriefsCatalogList');
      if (!container) return;

      if (!list || list.length === 0) {
        container.innerHTML = \`
          <div class="bg-[#15171d] border border-[#262932] rounded-[10px] p-8 text-center space-y-3">
            <div class="text-[14px] font-medium text-[#f3f4f6]">No assignment briefs parsed yet</div>
            <p class="text-[12px] text-[#9ca3af] max-w-sm mx-auto">
              Upload a course assignment PDF or paste your project brief. AI will extract module code, due dates, requirements, and generate a day-by-day study roadmap.
            </p>
            <button onclick="openParseBriefModal()"
              class="bg-[#3b5b8c] hover:bg-[#466ba3] text-white px-4 py-2 rounded-[6px] text-[13px] font-medium state-transition">
              + Parse your first brief
            </button>
          </div>
        \`;
        return;
      }

      container.innerHTML = list.map(b => {
        const atRisk = b.at_risk_status || { risk_level: 'LOW', risk_score: 10, days_remaining: 5, progress_percentage: 0 };
        const riskLevel = atRisk.risk_level || 'LOW';
        
        let badgeColor = 'bg-[#1b1e25] text-[#9ca3af] border-[#262932]';
        if (riskLevel === 'CRITICAL') {
          badgeColor = 'bg-[#b84a4a]/20 text-[#fca5a5] border-[#b84a4a]/50';
        } else if (riskLevel === 'HIGH') {
          badgeColor = 'bg-[#b45309]/20 text-[#fcd34d] border-[#b45309]/50';
        } else if (riskLevel === 'MODERATE') {
          badgeColor = 'bg-[#854d0e]/20 text-[#fef08a] border-[#854d0e]/50';
        } else {
          badgeColor = 'bg-[#14532d]/20 text-[#86efac] border-[#14532d]/50';
        }

        let totalTasks = 0;
        let completedTasks = 0;
        (b.study_plan || []).forEach(d => {
          (d.tasks || []).forEach(t => {
            totalTasks++;
            if (t.completed) completedTasks++;
          });
        });
        const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        const dueFormatted = new Date(b.due_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

        return \`
          <div onclick="openBriefDetail('\${b.id}')"
            class="bg-[#15171d] hover:bg-[#1b1e25] border border-[#262932] hover:border-[#3b5b8c]/50 rounded-[10px] p-4 space-y-3 cursor-pointer state-transition">
            
            <div class="flex items-start justify-between gap-2">
              <div class="space-y-1 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-[12px] font-mono px-2 py-0.5 rounded-[4px] bg-[#0f1115] text-[#d1d5db] border border-[#262932]">
                    \${b.module_code}
                  </span>
                  <span class="text-[11px] font-medium px-2 py-0.5 rounded-[4px] border \${badgeColor}">
                    \${riskLevel === 'CRITICAL' ? '● Critical Risk' : riskLevel === 'HIGH' ? '▲ High Risk' : riskLevel === 'MODERATE' ? '■ Moderate Risk' : '✓ On Track'}
                  </span>
                </div>
                <h3 class="text-[15px] font-semibold text-[#f3f4f6] tracking-tight">\${b.title}</h3>
              </div>
              <div class="text-right shrink-0">
                <div class="text-[12px] font-mono text-[#f3f4f6] font-medium">\${atRisk.days_remaining}d left</div>
                <div class="text-[11px] text-[#6b7280]">Due \${dueFormatted}</div>
              </div>
            </div>

            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-[11px] text-[#9ca3af]">
                <span>Study roadmap progress: \${completedTasks}/\${totalTasks} tasks</span>
                <span class="font-medium font-mono text-[#f3f4f6]">\${progress}%</span>
              </div>
              <div class="w-full bg-[#0f1115] h-1.5 rounded-full overflow-hidden border border-[#262932]">
                <div class="h-full bg-[#3b5b8c] rounded-full" style="width: \${progress}%;"></div>
              </div>
            </div>

            <div class="flex items-center justify-between pt-1 text-[11px] text-[#6b7280]">
              <span>\${b.word_count || 'Standard format'} · \${(b.recommended_resources || []).length} resources</span>
              <div class="flex items-center gap-3">
                <button type="button" onclick="event.stopPropagation(); openShareBrief('\${b.id}');"
                  class="text-[#25d366] hover:underline flex items-center gap-1 font-medium">
                  Share
                </button>
                <span class="text-[#3b5b8c] font-medium group-hover:underline">Open Workspace &rarr;</span>
              </div>
            </div>

          </div>
        \`;
      }).join('');
    }

    // Open Brief Detail Workspace
    async function openBriefDetail(briefId) {
      try {
        const res = await apiFetch('/api/v1/briefs/' + briefId);
        if (!res.ok) {
          showToast('Failed to load assignment brief', 'error');
          return;
        }

        activeBrief = await res.json();
        renderBriefDetailView(activeBrief);

        // Switch to view
        document.getElementById('viewHome').classList.add('hidden');
        document.getElementById('viewModuleDetail').classList.add('hidden');
        document.getElementById('viewSync').classList.add('hidden');
        document.getElementById('viewModulesList').classList.add('hidden');
        document.getElementById('viewSummariesList').classList.add('hidden');
        document.getElementById('viewMaterialsList').classList.add('hidden');
        document.getElementById('viewBriefsList').classList.add('hidden');
        document.getElementById('viewBriefDetail').classList.remove('hidden');

        window.scrollTo({ top: 0, behavior: 'instant' });
      } catch (err) {
        showToast('Connection error', 'error');
      }
    }

    function renderBriefDetailView(brief) {
      document.getElementById('briefDetailModuleCode').textContent = brief.module_code;
      document.getElementById('briefDetailTitle').textContent = brief.title;
      document.getElementById('briefDetailFormatPill').textContent = brief.word_count || 'Document';

      const dueDateObj = new Date(brief.due_date);
      document.getElementById('briefDetailDueDate').textContent = dueDateObj.toLocaleDateString('en-ZA', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      const atRisk = brief.at_risk_status || { risk_level: 'LOW', risk_score: 15, days_remaining: 5, progress_percentage: 0 };
      document.getElementById('briefDetailDaysRemaining').textContent = atRisk.days_remaining + (atRisk.days_remaining === 1 ? ' day remaining' : ' days remaining');

      // Update Add to Academic Tasks button
      const addBtn = document.getElementById('briefAddToTasksBtn');
      if (addBtn) {
        if (brief.academic_task_id) {
          addBtn.textContent = '✓ Linked in Academic Tasks';
          addBtn.disabled = true;
          addBtn.classList.add('text-[#3e885b]', 'border-[#3e885b]/40');
        } else {
          addBtn.textContent = '+ Add to Academic Tasks';
          addBtn.disabled = false;
          addBtn.classList.remove('text-[#3e885b]', 'border-[#3e885b]/40');
        }
      }

      // Render At-Risk Banner
      renderBriefAtRiskBanner(atRisk);

      // Render Tab 1: Study Plan
      renderBriefStudyPlan(brief.study_plan || []);

      // Render Tab 2: Resource Finder
      renderBriefResources(brief.recommended_resources || []);

      // Render Tab 3: Chat with Brief (RAG)
      renderBriefChatMessages(brief.chat_history || []);

      // Render Tab 4: Requirements & Extracted Data
      renderBriefExtractedData(brief);

      // Default to Study Plan tab
      setBriefTab('studyPlan');
    }

    function renderBriefAtRiskBanner(atRisk) {
      const banner = document.getElementById('briefDetailAtRiskBanner');
      if (!banner) return;

      const level = atRisk.risk_level || 'LOW';
      let borderBg = 'bg-[#0f1115] border-[#262932] text-[#d1d5db]';
      let badgeHtml = '';

      if (level === 'CRITICAL') {
        borderBg = 'bg-[#b84a4a]/10 border-[#b84a4a]/40 text-[#f3f4f6]';
        badgeHtml = '<span class="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-[4px] bg-[#b84a4a] text-white">Critical Risk (' + atRisk.risk_score + '/100)</span>';
      } else if (level === 'HIGH') {
        borderBg = 'bg-[#b45309]/10 border-[#b45309]/40 text-[#f3f4f6]';
        badgeHtml = '<span class="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-[4px] bg-[#b45309] text-white">High Risk (' + atRisk.risk_score + '/100)</span>';
      } else if (level === 'MODERATE') {
        borderBg = 'bg-[#854d0e]/10 border-[#854d0e]/40 text-[#f3f4f6]';
        badgeHtml = '<span class="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-[4px] bg-[#ca8a04] text-black">Moderate Risk (' + atRisk.risk_score + '/100)</span>';
      } else {
        borderBg = 'bg-[#14532d]/10 border-[#14532d]/40 text-[#f3f4f6]';
        badgeHtml = '<span class="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-[4px] bg-[#16a34a] text-white">On Track (' + atRisk.risk_score + '/100)</span>';
      }

      banner.className = 'rounded-[8px] p-3.5 border space-y-2.5 ' + borderBg;
      banner.innerHTML = \`
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-2">
            \${badgeHtml}
            <span class="text-[13px] font-medium">At-Risk Assessment Engine</span>
          </div>
          <span class="text-[12px] text-[#9ca3af]">\${atRisk.days_remaining}d until due · \${atRisk.progress_percentage}% completed</span>
        </div>
        <div class="space-y-1 text-[12px]">
          \${(atRisk.reasons || []).map(r => \`<div class="flex items-start gap-1.5 text-[#d1d5db]"><span class="text-[#9ca3af]">•</span><span>\${r}</span></div>\`).join('')}
        </div>
        \${(atRisk.recommended_actions || []).length > 0 ? \`
          <div class="pt-1.5 border-t border-[#262932] space-y-1">
            <div class="text-[11px] uppercase tracking-wider text-[#9ca3af] font-semibold">Recommended AI Action</div>
            \${atRisk.recommended_actions.map(a => \`<div class="text-[12px] text-[#f3f4f6] flex items-start gap-1.5"><span>&rarr;</span><span>\${a}</span></div>\`).join('')}
          </div>
        \` : ''}
      \`;
    }

    function setBriefTab(tabName) {
      ['studyPlan', 'resources', 'chat', 'extracted'].forEach(t => {
        const btn = document.getElementById('briefTabBtn-' + t);
        const content = document.getElementById('briefTabContent-' + t);
        if (btn) {
          btn.classList.remove('border-[#3b5b8c]', 'text-[#f3f4f6]');
          btn.classList.add('border-transparent', 'text-[#9ca3af]');
        }
        if (content) content.classList.add('hidden');
      });

      const activeBtn = document.getElementById('briefTabBtn-' + tabName);
      const activeContent = document.getElementById('briefTabContent-' + tabName);
      if (activeBtn) {
        activeBtn.classList.add('border-[#3b5b8c]', 'text-[#f3f4f6]');
        activeBtn.classList.remove('border-transparent', 'text-[#9ca3af]');
      }
      if (activeContent) activeContent.classList.remove('hidden');
    }

    // Render Study Plan Tab (Feature 3)
    function renderBriefStudyPlan(days) {
      document.getElementById('briefPlanCountBadge').textContent = days.length;
      const listContainer = document.getElementById('briefStudyPlanDaysList');
      if (!listContainer) return;

      let totalTasks = 0;
      let completedTasks = 0;
      days.forEach(d => {
        (d.tasks || []).forEach(t => {
          totalTasks++;
          if (t.completed) completedTasks++;
        });
      });

      const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      document.getElementById('briefPlanProgressLabel').textContent = pct + '% (' + completedTasks + '/' + totalTasks + ' tasks)';
      document.getElementById('briefPlanProgressBar').style.width = pct + '%';

      if (days.length === 0) {
        listContainer.innerHTML = \`
          <div class="bg-[#15171d] border border-[#262932] rounded-[8px] p-6 text-center text-[13px] text-[#9ca3af]">
            No study plan generated yet. Click "Regenerate Plan" above to create one with Gemini AI.
          </div>
        \`;
        return;
      }

      listContainer.innerHTML = days.map(day => \`
        <div class="bg-[#15171d] border border-[#262932] rounded-[10px] p-4 space-y-3">
          <div class="flex items-center justify-between border-b border-[#262932] pb-2">
            <div>
              <span class="text-[11px] font-mono text-[#3b5b8c] uppercase tracking-wider font-semibold">\${day.date}</span>
              <h4 class="text-[14px] font-semibold text-[#f3f4f6] mt-0.5">\${day.headline}</h4>
            </div>
            <span class="text-[12px] text-[#6b7280] font-mono">\${day.estimated_hours || 2.5} hrs</span>
          </div>

          <div class="space-y-2">
            \${(day.tasks || []).map(task => \`
              <label class="flex items-start gap-3 p-2 rounded-[6px] hover:bg-[#1b1e25] cursor-pointer state-transition">
                <input type="checkbox" \${task.completed ? 'checked' : ''}
                  onchange="handleToggleStudyTask('\${activeBrief.id}', \${day.day_number}, '\${task.id}', this.checked)"
                  class="mt-0.5 w-4 h-4 rounded-[4px] bg-[#0f1115] border-[#262932] text-[#3b5b8c] focus:ring-0 focus:ring-offset-0 cursor-pointer">
                <span class="text-[13px] \${task.completed ? 'line-through text-[#6b7280]' : 'text-[#d1d5db]'}">
                  \${task.text}
                </span>
              </label>
            \`).join('')}
          </div>
        </div>
      \`).join('');
    }

    // Toggle Study Plan Task
    async function handleToggleStudyTask(briefId, dayNum, taskId, completed) {
      try {
        const res = await apiFetch('/api/v1/briefs/' + briefId + '/study-plan', {
          method: 'PATCH',
          body: JSON.stringify({
            day_number: dayNum,
            task_id: taskId,
            completed: completed
          })
        });
        if (res.ok) {
          activeBrief = await res.json();
          renderBriefDetailView(activeBrief);
          showToast(completed ? 'Milestone checked' : 'Milestone marked incomplete');
        } else {
          showToast('Could not update task status', 'error');
        }
      } catch (err) {
        showToast('Connection error', 'error');
      }
    }

    // Regenerate Study Plan
    async function handleRegenerateStudyPlan() {
      if (!activeBrief) return;
      const btn = document.getElementById('regenPlanBtn');
      btn.disabled = true;
      btn.textContent = 'Generating...';

      try {
        const res = await apiFetch('/api/v1/ai/generate-study-plan', {
          method: 'POST',
          body: JSON.stringify({ brief_id: activeBrief.id })
        });
        if (res.ok) {
          const data = await res.json();
          activeBrief.study_plan = data.study_plan;
          if (data.at_risk_status) activeBrief.at_risk_status = data.at_risk_status;
          renderBriefDetailView(activeBrief);
          showToast('Generated fresh study plan roadmap');
        } else {
          showToast('Failed to regenerate plan', 'error');
        }
      } catch (err) {
        showToast('Connection error', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Regenerate Plan';
      }
    }

    // Render Resource Finder Tab (Feature 2)
    function renderBriefResources(resources) {
      document.getElementById('briefResourceCountBadge').textContent = resources.length;
      const container = document.getElementById('briefResourcesList');
      if (!container) return;

      if (resources.length === 0) {
        container.innerHTML = \`
          <div class="bg-[#15171d] border border-[#262932] rounded-[8px] p-6 text-center text-[13px] text-[#9ca3af]">
            No curated resources yet. Click "Discover More" to query AI for relevant YouTube videos and journal articles.
          </div>
        \`;
        return;
      }

      container.innerHTML = resources.map(r => {
        let typeBadge = 'bg-[#1b1e25] text-[#9ca3af] border-[#262932]';
        if (r.resource_type === 'YOUTUBE') {
          typeBadge = 'bg-[#b84a4a]/20 text-[#fca5a5] border-[#b84a4a]/40';
        } else if (r.resource_type === 'JOURNAL') {
          typeBadge = 'bg-[#3b5b8c]/20 text-[#93c5fd] border-[#3b5b8c]/40';
        } else if (r.resource_type === 'DOCUMENTATION') {
          typeBadge = 'bg-[#ca8a04]/20 text-[#fde047] border-[#ca8a04]/40';
        } else {
          typeBadge = 'bg-[#1b1e25] text-[#d1d5db] border-[#262932]';
        }

        return \`
          <div class="bg-[#15171d] border border-[#262932] rounded-[10px] p-4 space-y-2.5 state-transition hover:border-[#3b5b8c]/50">
            <div class="flex items-start justify-between gap-3">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-semibold px-2 py-0.5 rounded-[4px] border \${typeBadge}">
                    \${r.resource_type}
                  </span>
                  <span class="text-[11px] text-[#6b7280] font-mono">\${r.estimated_time || 'Reference'}</span>
                </div>
                <h4 class="text-[14px] font-semibold text-[#f3f4f6] leading-snug">\${r.title}</h4>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <a href="\${r.url}" target="_blank" rel="noopener noreferrer"
                  class="text-[12px] bg-[#1b1e25] hover:bg-[#232731] text-[#f3f4f6] px-2.5 py-1.5 rounded-[6px] border border-[#262932] state-transition flex items-center gap-1">
                  <span>Open</span>
                  <span>&nearr;</span>
                </a>
              </div>
            </div>

            <p class="text-[12px] text-[#9ca3af] leading-relaxed">
              \${r.relevance}
            </p>

            <div class="pt-2 border-t border-[#262932] flex items-center justify-between text-[11px]">
              <span class="text-[#6b7280]">Filtered for \${activeBrief.module_code} syllabus</span>
              <button onclick="handleSaveResourceToMaterials('\${r.id}')"
                class="text-[12px] text-[#3b5b8c] hover:text-[#466ba3] font-medium state-transition">
                \${r.is_saved_to_materials ? '✓ Saved to Materials' : '+ Save to Module Materials'}
              </button>
            </div>
          </div>
        \`;
      }).join('');
    }

    // Save Resource to Module Study Materials
    async function handleSaveResourceToMaterials(resourceId) {
      if (!activeBrief) return;
      try {
        const res = await apiFetch('/api/v1/briefs/' + activeBrief.id + '/save-resource', {
          method: 'POST',
          body: JSON.stringify({ resource_id: resourceId })
        });
        if (res.ok) {
          const data = await res.json();
          showToast(data.message || 'Saved to study materials!');
          // Update local status
          const found = (activeBrief.recommended_resources || []).find(r => r.id === resourceId);
          if (found) found.is_saved_to_materials = true;
          renderBriefResources(activeBrief.recommended_resources || []);
        } else {
          showToast('Could not save resource', 'error');
        }
      } catch (err) {
        showToast('Connection error', 'error');
      }
    }

    // Discover More Resources
    async function handleDiscoverMoreResources() {
      if (!activeBrief) return;
      const btn = document.getElementById('moreResourcesBtn');
      btn.disabled = true;
      btn.textContent = 'Searching...';

      try {
        const res = await apiFetch('/api/v1/ai/generate-resources', {
          method: 'POST',
          body: JSON.stringify({ brief_id: activeBrief.id })
        });
        if (res.ok) {
          const data = await res.json();
          activeBrief.recommended_resources = data.resources;
          renderBriefResources(data.resources);
          showToast('Curated 4 new study resources');
        } else {
          showToast('Failed to discover resources', 'error');
        }
      } catch (err) {
        showToast('Connection error', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Discover More';
      }
    }

    // Render Chat Messages & Citations (Feature 4 - RAG)
    function renderBriefChatMessages(messages) {
      const container = document.getElementById('briefChatMessagesStream');
      if (!container) return;

      if (messages.length === 0) {
        container.innerHTML = \`
          <div class="h-full flex flex-col items-center justify-center text-center p-6 space-y-2 text-[#6b7280]">
            <p class="text-[13px] text-[#9ca3af]">No questions asked yet.</p>
            <p class="text-[12px] max-w-xs">Ask anything about late penalties, allowed libraries, submission formats, or marking weights. AI will cite verbatim sections from the brief.</p>
          </div>
        \`;
        return;
      }

      container.innerHTML = messages.map(msg => {
        const isUser = msg.sender === 'user';
        return \`
          <div class="space-y-1.5 \${isUser ? 'ml-auto max-w-[85%]' : 'mr-auto max-w-[95%]' }">
            <div class="text-[11px] text-[#6b7280] \${isUser ? 'text-right' : 'text-left'}">
              \${isUser ? 'You' : 'AI Academic Tutor'} · \${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            
            <div class="rounded-[8px] p-3 text-[13px] leading-relaxed \${isUser ? 'bg-[#3b5b8c] text-white' : 'bg-[#15171d] border border-[#262932] text-[#d1d5db]'}">
              <div class="whitespace-pre-wrap">\${msg.text}</div>

              \${(msg.citations || []).length > 0 ? \`
                <div class="mt-3 pt-2.5 border-t border-[#262932] space-y-2">
                  <div class="text-[11px] uppercase tracking-wider text-[#9ca3af] font-semibold flex items-center gap-1.5">
                    <span>Document Citations</span>
                  </div>
                  \${msg.citations.map(c => \`
                    <div class="bg-[#0f1115] border border-[#262932] rounded-[6px] p-2 text-[12px] text-[#9ca3af] space-y-1">
                      <div class="font-mono text-[11px] text-[#3b5b8c]">\${c.context || c.section || 'Specification'}</div>
                      <blockquote class="italic text-[#f3f4f6] border-l-2 border-[#3b5b8c] pl-2 py-0.5">
                        "\${c.quote}"
                      </blockquote>
                    </div>
                  \`).join('')}
                </div>
              \` : ''}
            </div>
          </div>
        \`;
      }).join('');

      container.scrollTop = container.scrollHeight;
    }

    // Send RAG Chat Message
    async function handleSendBriefChatMessage(e) {
      if (e) e.preventDefault();
      if (!activeBrief) return;

      const input = document.getElementById('briefChatInput');
      const text = input.value.trim();
      if (!text) return;

      input.value = '';
      const btn = document.getElementById('briefChatSubmitBtn');
      btn.disabled = true;
      btn.textContent = 'Searching...';

      // Optimistic append user message
      const optimisticMsg = {
        id: 'opt-' + Date.now(),
        sender: 'user',
        text: text,
        created_at: new Date().toISOString()
      };
      if (!activeBrief.chat_history) activeBrief.chat_history = [];
      activeBrief.chat_history.push(optimisticMsg);
      renderBriefChatMessages(activeBrief.chat_history);

      try {
        const res = await apiFetch('/api/v1/ai/chat-brief', {
          method: 'POST',
          body: JSON.stringify({
            brief_id: activeBrief.id,
            question: text
          })
        });

        if (res.ok) {
          const data = await res.json();
          activeBrief.chat_history.push(data.message);
          renderBriefChatMessages(activeBrief.chat_history);
        } else {
          showToast('Could not answer question', 'error');
        }
      } catch (err) {
        showToast('Connection error', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Ask AI';
      }
    }

    function handleAskSampleQuestion(q) {
      const input = document.getElementById('briefChatInput');
      if (input) {
        input.value = q;
        handleSendBriefChatMessage(null);
      }
    }

    // Render Extracted Specifications Tab (Feature 1)
    function renderBriefExtractedData(brief) {
      const container = document.getElementById('briefExtractedDetailsContainer');
      if (!container) return;

      const extracted = brief.extracted_data || {};

      container.innerHTML = \`
        <!-- Key Deliverables -->
        <div class="bg-[#15171d] border border-[#262932] rounded-[10px] p-4 space-y-2">
          <h4 class="text-[13px] font-semibold text-[#f3f4f6]">Key Deliverables</h4>
          <ul class="space-y-1 text-[13px] text-[#d1d5db]">
            \${(extracted.key_deliverables || brief.requirements || []).map(d => \`<li class="flex items-start gap-2"><span class="text-[#3b5b8c] font-bold">•</span><span>\${d}</span></li>\`).join('')}
          </ul>
        </div>

        <!-- Grading Criteria -->
        <div class="bg-[#15171d] border border-[#262932] rounded-[10px] p-4 space-y-2">
          <h4 class="text-[13px] font-semibold text-[#f3f4f6]">Marking Criteria & Rubric</h4>
          <ul class="space-y-1 text-[13px] text-[#d1d5db]">
            \${(extracted.grading_criteria || ['Functional implementation (50%)', 'Code quality & documentation (25%)', 'Report (25%)']).map(g => \`<li class="flex items-start gap-2"><span class="text-[#3e885b] font-bold">✓</span><span>\${g}</span></li>\`).join('')}
          </ul>
        </div>

        <!-- Penalties and Constraints -->
        <div class="bg-[#15171d] border border-[#262932] rounded-[10px] p-4 space-y-2">
          <h4 class="text-[13px] font-semibold text-[#f3f4f6]">Penalties, Constraints & Integrity</h4>
          <ul class="space-y-1 text-[13px] text-[#d1d5db]">
            \${(extracted.penalties_or_constraints || ['Late submissions penalized per course rules.']).map(p => \`<li class="flex items-start gap-2"><span class="text-[#b84a4a] font-bold">!</span><span>\${p}</span></li>\`).join('')}
          </ul>
        </div>

        <!-- Full Document Raw Text Viewer -->
        <div class="bg-[#15171d] border border-[#262932] rounded-[10px] p-4 space-y-2">
          <div class="flex items-center justify-between">
            <h4 class="text-[13px] font-semibold text-[#f3f4f6]">Document Source Text</h4>
            <span class="text-[11px] text-[#6b7280] font-mono">\${brief.document_name || 'Brief.txt'}</span>
          </div>
          <div class="bg-[#0f1115] border border-[#262932] rounded-[6px] p-3 text-[12px] text-[#9ca3af] font-mono whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed">
            \${brief.raw_text}
          </div>
        </div>
      \`;
    }

    // Add Brief to Academic Tasks
    async function handleAddBriefToAcademicTasks() {
      if (!activeBrief) return;
      try {
        const res = await apiFetch('/api/v1/briefs/' + activeBrief.id + '/add-to-tasks', {
          method: 'POST'
        });
        if (res.ok) {
          const data = await res.json();
          activeBrief.academic_task_id = data.task.id;
          renderBriefDetailView(activeBrief);
          showToast(data.message || 'Added to Academic Tasks');
        } else {
          showToast('Could not add to tasks', 'error');
        }
      } catch (err) {
        showToast('Connection error', 'error');
      }
    }

    // Delete Current Brief
    async function handleDeleteCurrentBrief() {
      if (!activeBrief) return;
      if (!confirm('Are you sure you want to delete this assignment brief?')) return;

      try {
        const res = await apiFetch('/api/v1/briefs/' + activeBrief.id, {
          method: 'DELETE'
        });
        if (res.ok) {
          showToast('Assignment brief deleted');
          navigateTo('briefs');
        } else {
          showToast('Failed to delete brief', 'error');
        }
      } catch (err) {
        showToast('Connection error', 'error');
      }
    }

    // Modal: Parse Assignment Brief
    function openParseBriefModal() {
      document.getElementById('parseBriefModalOverlay').classList.remove('hidden');
      selectedBriefPdfBase64 = null;
      selectedBriefPdfName = null;
      document.getElementById('pdfFileNameDisplay').textContent = 'Click or drag PDF assignment brief here';
      document.getElementById('pdfDropZone').classList.remove('border-[#3b5b8c]', 'bg-[#1b1e25]');
    }

    function closeParseBriefModal() {
      document.getElementById('parseBriefModalOverlay').classList.add('hidden');
    }

    function handleBriefPdfSelected(event) {
      const file = event.target.files[0];
      if (!file) return;

      if (file.type !== 'application/pdf') {
        showToast('Please select a PDF document', 'error');
        return;
      }

      selectedBriefPdfName = file.name;
      document.getElementById('pdfFileNameDisplay').textContent = '✓ ' + file.name + ' (' + Math.round(file.size / 1024) + ' KB)';
      document.getElementById('pdfDropZone').classList.add('border-[#3b5b8c]', 'bg-[#1b1e25]');

      const reader = new FileReader();
      reader.onload = (e) => {
        selectedBriefPdfBase64 = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    function loadSampleCos212Brief() {
      document.getElementById('briefTextInput').value = \`UNIVERSITY OF THE WITWATERSRAND
SCHOOL OF COMPUTER SCIENCE & APPLIED MATHEMATICS
COURSE CODE: COS 212 (DATA STRUCTURES & ALGORITHMS)
PRACTICAL 3: LINKED LISTS, MERGE SORT & CACHEGRIND BENCHMARKING

DUE DATE: 2026-09-24 23:59:00 SAST
WEIGHTING: 15% OF COURSEWORK
WORD COUNT / FORMAT: Source code (C++) + 4-page IEEE PDF Report (~1,500 words)

REQUIREMENTS:
1. Implement generic SinglyLinkedList<T> and DoublyLinkedList<T> adhering to strict RAII memory management.
2. Ensure zero memory leaks verified under Valgrind memcheck (0 errors from 0 contexts).
3. Implement an in-place iterative singly linked list reversal with O(1) auxiliary space overhead.
4. Implement an in-place doubly linked list merge-sort with O(N log N) time and O(1) auxiliary space.
5. Measure L1/L2 cache misses per 1,000 accesses against contiguous arrays using Cachegrind.
6. Submit clean Makefile compiling with g++ -std=c++17 -Wall -Wextra -Werror.

SUBMISSION & PENALTIES:
- Late penalty: 10% deduction per 12 hours up to 48 hours maximum; 0 marks thereafter.
- Automatic MOSS similarity analysis will be performed against past cohorts.\`;
      document.getElementById('briefCharCount').textContent = document.getElementById('briefTextInput').value.length + ' chars';
      document.getElementById('briefOverrideModuleCode').value = 'COS 212';
      showToast('Loaded sample Wits COS 212 Practical brief');
    }

    async function handleRunParseBrief(e) {
      e.preventDefault();
      const text = document.getElementById('briefTextInput').value.trim();
      const overrideMod = document.getElementById('briefOverrideModuleCode').value.trim();
      const overrideDue = document.getElementById('briefOverrideDueDate').value;

      if (!text && !selectedBriefPdfBase64) {
        showToast('Please upload a PDF or paste brief text', 'error');
        return;
      }

      const btn = document.getElementById('parseBriefSubmitBtn');
      const statusText = document.getElementById('parseStatusText');
      btn.disabled = true;
      btn.textContent = 'Parsing with AI...';
      statusText.textContent = 'Extracting module code, deadlines, rubric & generating study plan...';

      try {
        const res = await apiFetch('/api/v1/ai/parse-brief', {
          method: 'POST',
          body: JSON.stringify({
            text: text,
            pdf_base64: selectedBriefPdfBase64,
            file_name: selectedBriefPdfName || (overrideMod ? overrideMod + '_Brief.pdf' : 'Assignment_Brief.pdf')
          })
        });

        if (res.ok) {
          const newBrief = await res.json();
          closeParseBriefModal();
          showToast('Assignment brief parsed and study plan ready!');
          openBriefDetail(newBrief.id);
        } else {
          const errData = await res.json();
          showToast(errData.detail || 'Failed to parse assignment brief', 'error');
        }
      } catch (err) {
        showToast('Connection error during AI parsing', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Parse Brief';
        statusText.textContent = 'Low-data mode: runs Gemini AI server-side';
      }
    }

    // Load At-Risk & Proactive Reminders on Home Dashboard (Features 5 & 6)
    async function loadAtRiskAndReminders() {
      try {
        const [atRiskRes, remindersRes] = await Promise.all([
          apiFetch('/api/v1/academic/at-risk'),
          apiFetch('/api/v1/academic/reminders')
        ]);

        if (atRiskRes.ok) {
          const atRiskData = await atRiskRes.json();
          renderHomeAtRiskAlert(atRiskData);
          updateRailBriefsBadge(atRiskData);
        }

        if (remindersRes.ok) {
          const reminders = await remindersRes.json();
          renderHomeRemindersWidget(reminders);
        }
      } catch (err) {
        console.error('Failed to load at-risk and reminders:', err);
      }
    }

    function renderHomeAtRiskAlert(report) {
      const alertContainer = document.getElementById('dashAtRiskAlert');
      if (!alertContainer) return;

      const items = (report.items || []).filter(i => i.risk_level === 'CRITICAL' || i.risk_level === 'HIGH');
      if (items.length === 0) {
        alertContainer.classList.add('hidden');
        return;
      }

      alertContainer.classList.remove('hidden');
      const top = items[0];

      alertContainer.innerHTML = \`
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-[#b84a4a] animate-pulse"></span>
            <h3 class="text-[14px] font-semibold text-[#f3f4f6]">At-Risk Deadline Alert</h3>
          </div>
          <span class="text-[11px] font-mono px-2 py-0.5 rounded-[4px] bg-[#b84a4a]/20 text-[#fca5a5] border border-[#b84a4a]/50">
            \${top.risk_level} RISK (\${top.risk_score}/100)
          </span>
        </div>
        <div class="space-y-1">
          <div class="text-[13px] font-medium text-[#f3f4f6]">
            \${top.module_code}: \${top.title}
          </div>
          <div class="text-[12px] text-[#d1d5db]">
            Due in \${top.days_remaining} day\${top.days_remaining === 1 ? '' : 's'} with only \${top.progress_percentage}% study roadmap progress recorded.
          </div>
        </div>
        <div class="flex items-center justify-between pt-1 border-t border-[#262932]">
          <span class="text-[11px] text-[#9ca3af]">3-day proactive reminder active</span>
          <button onclick="navigateTo('briefs')"
            class="text-[12px] bg-[#3b5b8c] hover:bg-[#466ba3] text-white px-3 py-1 rounded-[4px] font-medium state-transition">
            View Study Roadmap &rarr;
          </button>
        </div>
      \`;
    }

    function renderHomeRemindersWidget(reminders) {
      const container = document.getElementById('dashRemindersList');
      if (!container) return;

      if (!reminders || reminders.length === 0) {
        container.innerHTML = \`
          <div class="text-[12px] text-[#9ca3af] py-1">
            No active 7-day, 3-day, or 1-day deadline reminders currently pending.
          </div>
        \`;
        return;
      }

      container.innerHTML = reminders.slice(0, 3).map(rem => {
        let tagColor = 'bg-[#3b5b8c]/20 text-[#93c5fd] border-[#3b5b8c]/40';
        if (rem.reminder_type === '1_DAY' || rem.reminder_type === 'OVERDUE') {
          tagColor = 'bg-[#b84a4a]/20 text-[#fca5a5] border-[#b84a4a]/40';
        } else if (rem.reminder_type === '3_DAYS') {
          tagColor = 'bg-[#b45309]/20 text-[#fcd34d] border-[#b45309]/40';
        }

        return \`
          <div class="p-2.5 rounded-[6px] bg-[#0f1115] border border-[#262932] space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-mono px-1.5 py-0.5 rounded-[4px] border \${tagColor}">
                \${rem.reminder_type.replace('_', ' ')}
              </span>
              <span class="text-[11px] text-[#6b7280]">Due \${new Date(rem.due_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</span>
            </div>
            <div class="text-[13px] font-medium text-[#f3f4f6]">\${rem.message}</div>
            <div class="text-[11px] text-[#9ca3af]">&rarr; \${rem.recommendation}</div>
          </div>
        \`;
      }).join('');
    }

    async function handleTriggerTestPush() {
      try {
        const res = await apiFetch('/api/v1/academic/reminders/test-push', {
          method: 'POST',
          body: JSON.stringify({
            title: 'Varsity Companion: 3-Day Deadline Alert',
            message: 'COS 212: Linked lists practical is due in 3 days! Complete Day 2 study plan tasks tonight.'
          })
        });
        if (res.ok) {
          const data = await res.json();
          const notif = data.notification;
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(notif.title, { body: notif.body });
          } else if ('Notification' in window && Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
              if (permission === 'granted') {
                new Notification(notif.title, { body: notif.body });
              }
            });
          }
          showToast('Alert: ' + notif.body);
        }
      } catch (err) {
        showToast('Push notification alert dispatched');
      }
    }
  `;
}

