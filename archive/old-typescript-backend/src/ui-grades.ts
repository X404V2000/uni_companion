export function renderGradesViewHtml(): string {
  return `
      <!-- ==================================================== -->
      <!-- VIEW: ACADEMIC PERFORMANCE & GRADE PROJECTIONS       -->
      <!-- ==================================================== -->
      <section id="viewGrades" class="hidden max-w-[640px] mx-auto py-6 px-4 sm:px-6 space-y-4">
        
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div>
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-[2px] bg-[#3b5b8c]"></span>
              <div class="text-[12px] font-medium text-[#9ca3af]">Academic Grade Engine</div>
            </div>
            <h1 class="text-[22px] font-semibold text-[#f3f4f6] tracking-tight mt-0.5">Performance &amp; DP Tracker</h1>
            <p class="text-[12px] text-[#9ca3af] mt-0.5">Weighted assessments, Duly Performed (DP) exam clearance, and inverse target projections</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="loadPerformanceData(true)"
              class="px-3 py-1.5 rounded-[6px] border border-[#262932] bg-[#15171d] hover:bg-[#1b1e25] text-[12px] font-medium text-[#d1d5db] state-transition flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 text-[#9ca3af]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <!-- Section 1: SEMESTER OVERVIEW & HEALTH METRICS -->
        <div id="gradesOverviewCard" class="bg-[#15171d] border border-[#262932] rounded-[10px] p-5 space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#262932]">
            <div>
              <div class="text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af]">Semester Weighted Average</div>
              <div class="flex items-baseline gap-3 mt-1">
                <span id="gradesOverallAvgText" class="text-[34px] font-bold text-[#f3f4f6] tracking-tight">--%</span>
                <span id="gradesStandingBadge" class="text-[12px] px-2.5 py-0.5 rounded-[6px] bg-[#1b1e25] border border-[#262932] text-[#9ca3af] font-medium">
                  Calculating...
                </span>
              </div>
            </div>
            <div class="sm:text-right space-y-1">
              <div class="text-[11px] text-[#9ca3af]">DP Subminimum Benchmark</div>
              <div class="text-[13px] font-medium text-[#f3f4f6] flex items-center sm:justify-end gap-1.5">
                <span class="w-2 h-2 rounded-full bg-[#3e885b]"></span>
                <span>40.0% coursework required</span>
              </div>
            </div>
          </div>

          <!-- Quick 3-Metric Bar -->
          <div class="grid grid-cols-3 gap-2 pt-1 text-center">
            <div class="p-2.5 rounded-[8px] bg-[#0f1115] border border-[#262932]/70">
              <div class="text-[11px] text-[#9ca3af]">DP Standing</div>
              <div id="gradesDpClearanceCount" class="text-[16px] font-semibold text-[#f3f4f6] mt-0.5">--</div>
              <div class="text-[10px] text-[#6b7280]">Modules on track</div>
            </div>
            <div class="p-2.5 rounded-[8px] bg-[#0f1115] border border-[#262932]/70">
              <div class="text-[11px] text-[#9ca3af]">Distinction Track</div>
              <div id="gradesDistinctionCount" class="text-[16px] font-semibold text-[#f3f4f6] mt-0.5">--</div>
              <div class="text-[10px] text-[#6b7280]">&ge;75% attainable</div>
            </div>
            <div class="p-2.5 rounded-[8px] bg-[#0f1115] border border-[#262932]/70">
              <div class="text-[11px] text-[#9ca3af]">At-Risk Modules</div>
              <div id="gradesAtRiskCount" class="text-[16px] font-semibold text-[#f3f4f6] mt-0.5">--</div>
              <div class="text-[10px] text-[#6b7280]">Below DP cutoff</div>
            </div>
          </div>
        </div>

        <!-- Section 2: INTERACTIVE TARGET-SEEKING SIMULATOR -->
        <div class="bg-[#15171d] border border-[#262932] rounded-[10px] p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-[#3b5b8c]"></span>
              <h2 class="text-[15px] font-semibold text-[#f3f4f6]">Inverse Target Simulator</h2>
            </div>
            <span class="text-[11px] text-[#6b7280]">Predict final exam requirements</span>
          </div>
          <p class="text-[12px] text-[#9ca3af]">
            Select an enrolled module and your desired final course mark. The engine mathematically calculates the exact percentage score required on remaining assessments.
          </p>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label class="block text-[11px] font-medium text-[#9ca3af] mb-1">Select Module</label>
              <select id="simModuleSelect" onchange="handleSimulatorChange()"
                class="w-full bg-[#0f1115] border border-[#262932] focus:border-[#3b5b8c] rounded-[6px] px-3 py-2 text-[13px] text-[#f3f4f6] outline-none state-transition">
                <!-- Dynamically populated -->
              </select>
            </div>
            <div>
              <label class="block text-[11px] font-medium text-[#9ca3af] mb-1">Target Final Grade</label>
              <div class="flex items-center gap-1.5">
                <button type="button" onclick="setSimTarget(50)" id="simTargetBtn-50"
                  class="flex-1 py-1.5 px-2 rounded-[6px] text-[12px] font-medium bg-[#1b1e25] border border-[#262932] text-[#9ca3af] hover:text-[#f3f4f6] state-transition">50%</button>
                <button type="button" onclick="setSimTarget(65)" id="simTargetBtn-65"
                  class="flex-1 py-1.5 px-2 rounded-[6px] text-[12px] font-medium bg-[#1b1e25] border border-[#262932] text-[#9ca3af] hover:text-[#f3f4f6] state-transition">65%</button>
                <button type="button" onclick="setSimTarget(75)" id="simTargetBtn-75"
                  class="flex-1 py-1.5 px-2 rounded-[6px] text-[12px] font-medium bg-[#3b5b8c] border border-[#3b5b8c] text-white state-transition">75%</button>
                <button type="button" onclick="setSimTarget(80)" id="simTargetBtn-80"
                  class="flex-1 py-1.5 px-2 rounded-[6px] text-[12px] font-medium bg-[#1b1e25] border border-[#262932] text-[#9ca3af] hover:text-[#f3f4f6] state-transition">80%</button>
              </div>
            </div>
          </div>

          <!-- Simulator Dynamic Result Box -->
          <div id="simResultContainer" class="p-3.5 rounded-[8px] bg-[#0f1115] border border-[#262932] space-y-2">
            <!-- Dynamically populated calculation -->
          </div>
        </div>

        <!-- Section 3: MODULE-BY-MODULE DETAILED PROJECTIONS -->
        <div class="space-y-3 pt-1">
          <div class="flex items-center justify-between">
            <h2 class="text-[16px] font-semibold text-[#f3f4f6]">Module Grade Projections</h2>
            <span class="text-[12px] text-[#6b7280]">Real-time weighted analysis</span>
          </div>

          <div id="gradesModulesContainer" class="space-y-3">
            <!-- Dynamically populated module cards -->
          </div>
        </div>

      </section>

      <!-- ======================================================== -->
      <!-- MODAL: RECORD ASSESSMENT SCORE                           -->
      <!-- ======================================================== -->
      <div id="recordGradeModalOverlay" class="fixed inset-0 z-50 bg-black/60 hidden flex items-center justify-center p-4">
        <div class="w-full max-w-[420px] bg-[#15171d] border border-[#262932] rounded-[10px] p-5 space-y-4 shadow-sm">
          
          <div class="flex items-center justify-between pb-2 border-b border-[#262932]">
            <div>
              <div class="flex items-center gap-2">
                <span id="recordGradeModBadge" class="text-[11px] font-mono px-2 py-0.5 rounded-[4px] bg-[#1b1e25] text-[#9ca3af] border border-[#262932]">COS 212</span>
                <span class="text-[11px] text-[#9ca3af]">Assessment Score</span>
              </div>
              <h3 class="text-[16px] font-semibold text-[#f3f4f6] mt-1" id="recordGradeTaskTitle">Practical Assignment 1</h3>
            </div>
            <button onclick="closeRecordGradeModal()" class="w-7 h-7 rounded-[6px] hover:bg-[#1b1e25] text-[#9ca3af] hover:text-[#f3f4f6] flex items-center justify-center state-transition">
              ✕
            </button>
          </div>

          <form id="recordGradeForm" onsubmit="handleSaveGrade(event)" class="space-y-3">
            <input type="hidden" id="recordGradeTaskId">

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[12px] font-medium text-[#9ca3af] mb-1">Score achieved</label>
                <input type="number" step="0.1" min="0" id="recordGradeAchieved" required placeholder="e.g. 42"
                  oninput="updateGradeModalPreview()"
                  class="w-full bg-[#0f1115] border border-[#262932] focus:border-[#3b5b8c] rounded-[6px] px-3 py-2 text-[13px] text-[#f3f4f6] outline-none">
              </div>
              <div>
                <label class="block text-[12px] font-medium text-[#9ca3af] mb-1">Maximum score</label>
                <input type="number" step="0.1" min="1" id="recordGradeMax" required placeholder="e.g. 50"
                  oninput="updateGradeModalPreview()"
                  class="w-full bg-[#0f1115] border border-[#262932] focus:border-[#3b5b8c] rounded-[6px] px-3 py-2 text-[13px] text-[#f3f4f6] outline-none">
              </div>
            </div>

            <div>
              <label class="block text-[12px] font-medium text-[#9ca3af] mb-1">Syllabus Weight % towards final course mark</label>
              <input type="number" step="0.5" min="0" max="100" id="recordGradeWeight" placeholder="e.g. 20"
                oninput="updateGradeModalPreview()"
                class="w-full bg-[#0f1115] border border-[#262932] focus:border-[#3b5b8c] rounded-[6px] px-3 py-2 text-[13px] text-[#f3f4f6] outline-none">
            </div>

            <!-- Dynamic Live Calculation Preview -->
            <div id="gradeModalPreviewBox" class="p-3 rounded-[6px] bg-[#0f1115] border border-[#262932] text-[12px] space-y-1">
              <div class="flex items-center justify-between text-[#9ca3af]">
                <span>Calculated percentage:</span>
                <strong id="gradeModalPctText" class="text-[#f3f4f6] font-mono">--%</strong>
              </div>
              <div class="flex items-center justify-between text-[#9ca3af]">
                <span>Final course points banked:</span>
                <strong id="gradeModalPointsText" class="text-[#3e885b] font-mono">-- pts</strong>
              </div>
            </div>

            <div class="pt-2 flex items-center justify-between border-t border-[#262932]">
              <button type="button" onclick="handleClearGrade()" id="btnGradeClear"
                class="px-2.5 py-1.5 rounded-[6px] text-[12px] text-[#b84a4a] hover:bg-[#b84a4a]/10 state-transition">
                Clear score
              </button>
              <div class="flex items-center gap-2">
                <button type="button" onclick="closeRecordGradeModal()" class="px-3 py-1.5 rounded-[6px] text-[13px] text-[#9ca3af] hover:text-[#d1d5db]">
                  Cancel
                </button>
                <button type="submit" class="bg-[#3b5b8c] hover:bg-[#466ba3] active:bg-[#2e476e] text-white px-3.5 py-1.5 rounded-[6px] text-[13px] font-medium state-transition">
                  Save score
                </button>
              </div>
            </div>
          </form>

        </div>
      </div>
  `;
}

export function getGradesClientScript(): string {
  return `
    let cachedPerformanceData = null;
    let selectedSimulatorTarget = 75;

    // Load performance overview from backend API
    async function loadPerformanceData(showToastFeedback = false) {
      try {
        const res = await apiFetch('/api/v1/academic/performance');
        if (!res.ok) {
          throw new Error('Server returned ' + res.status);
        }
        const data = await res.json();
        cachedPerformanceData = data;
        renderPerformanceView(data);
        updateDashboardPerformanceWidget(data);
        if (showToastFeedback) {
          showToast('Academic performance updated.', 'success');
        }
      } catch (err) {
        console.error('Failed to load performance data:', err);
        showToast('Could not load academic performance.', 'error');
      }
    }

    // Render the complete performance dashboard
    function renderPerformanceView(overview) {
      if (!overview) return;

      const avgText = document.getElementById('gradesOverallAvgText');
      const badge = document.getElementById('gradesStandingBadge');
      const dpClearance = document.getElementById('gradesDpClearanceCount');
      const distinctions = document.getElementById('gradesDistinctionCount');
      const atRisk = document.getElementById('gradesAtRiskCount');

      const avg = overview.overall_weighted_average || 0;
      if (avgText) {
        avgText.textContent = avg.toFixed(1) + '%';
      }

      if (badge) {
        if (avg >= 75) {
          badge.textContent = "Dean's Distinction Track";
          badge.className = 'text-[12px] px-2.5 py-0.5 rounded-[6px] bg-[#3e885b]/15 border border-[#3e885b]/40 text-[#3e885b] font-medium';
        } else if (avg >= 65) {
          badge.textContent = 'Academic Credit / First Class';
          badge.className = 'text-[12px] px-2.5 py-0.5 rounded-[6px] bg-[#3b5b8c]/15 border border-[#3b5b8c]/40 text-[#60a5fa] font-medium';
        } else if (avg >= 50) {
          badge.textContent = 'Standard Pass Standing';
          badge.className = 'text-[12px] px-2.5 py-0.5 rounded-[6px] bg-[#1b1e25] border border-[#262932] text-[#9ca3af] font-medium';
        } else if (avg > 0) {
          badge.textContent = 'Below Pass Benchmark';
          badge.className = 'text-[12px] px-2.5 py-0.5 rounded-[6px] bg-[#b84a4a]/15 border border-[#b84a4a]/40 text-[#b84a4a] font-medium';
        } else {
          badge.textContent = 'No Graded Tasks Yet';
          badge.className = 'text-[12px] px-2.5 py-0.5 rounded-[6px] bg-[#1b1e25] border border-[#262932] text-[#9ca3af] font-medium';
        }
      }

      const totalMods = overview.total_modules_evaluated || 0;
      const atRiskMods = overview.at_risk_modules_count || 0;
      const goodMods = Math.max(0, totalMods - atRiskMods);

      if (dpClearance) dpClearance.textContent = goodMods + ' / ' + totalMods;
      if (distinctions) distinctions.textContent = overview.distinction_track_count || 0;
      if (atRisk) {
        atRisk.textContent = atRiskMods;
        if (atRiskMods > 0) {
          atRisk.className = 'text-[16px] font-semibold text-[#b84a4a] mt-0.5';
        } else {
          atRisk.className = 'text-[16px] font-semibold text-[#3e885b] mt-0.5';
        }
      }

      // Populate simulator module dropdown
      const simSelect = document.getElementById('simModuleSelect');
      if (simSelect && overview.modules) {
        const currentVal = simSelect.value;
        simSelect.innerHTML = overview.modules.map(m => 
          '<option value="' + m.module_id + '">' + m.module_code + ' - ' + m.module_name + '</option>'
        ).join('');
        if (currentVal && overview.modules.some(m => m.module_id === currentVal)) {
          simSelect.value = currentVal;
        }
        handleSimulatorChange();
      }

      // Render module cards
      const container = document.getElementById('gradesModulesContainer');
      if (container && overview.modules) {
        if (overview.modules.length === 0) {
          container.innerHTML = '<div class="p-6 text-center text-[#6b7280] text-[13px] bg-[#15171d] border border-[#262932] rounded-[10px]">No enrolled modules found.</div>';
          return;
        }

        container.innerHTML = overview.modules.map(m => renderSingleModuleGradeCard(m)).join('');
      }
    }

    function renderSingleModuleGradeCard(m) {
      // DP Status Pill
      let dpBadge = '';
      if (m.dp_status === 'DP_SECURED') {
        dpBadge = '<span class="text-[11px] font-medium px-2 py-0.5 rounded-[4px] bg-[#3e885b]/15 text-[#3e885b] border border-[#3e885b]/30">DP Secured</span>';
      } else if (m.dp_status === 'AT_RISK') {
        dpBadge = '<span class="text-[11px] font-medium px-2 py-0.5 rounded-[4px] bg-[#b84a4a]/15 text-[#b84a4a] border border-[#b84a4a]/30">DP At Risk</span>';
      } else {
        dpBadge = '<span class="text-[11px] font-medium px-2 py-0.5 rounded-[4px] bg-[#3b5b8c]/15 text-[#60a5fa] border border-[#3b5b8c]/30">In Progress</span>';
      }

      // Projections table
      const projHtml = (m.projections || []).map(p => {
        let statusStyle = 'text-[#9ca3af] bg-[#1b1e25] border-[#262932]';
        let reqText = p.required_remaining_percentage != null ? p.required_remaining_percentage.toFixed(1) + '%' : '--';
        if (p.status === 'ALREADY_SECURED') {
          statusStyle = 'text-[#3e885b] bg-[#3e885b]/10 border-[#3e885b]/30';
          reqText = 'Locked In';
        } else if (p.status === 'MATHEMATICALLY_UNATTAINABLE') {
          statusStyle = 'text-[#b84a4a] bg-[#b84a4a]/10 border-[#b84a4a]/30';
          reqText = 'Unattainable';
        } else if (p.required_remaining_percentage <= 65) {
          statusStyle = 'text-[#3e885b] bg-[#3e885b]/10 border-[#3e885b]/30';
        }
        return \`
          <div class="p-2.5 rounded-[6px] bg-[#0f1115] border border-[#262932] flex items-center justify-between">
            <div>
              <div class="text-[12px] font-medium text-[#f3f4f6]">\${p.target_name} (\${p.target_percentage}%)</div>
              <div class="text-[11px] text-[#6b7280] mt-0.5">\${p.message}</div>
            </div>
            <div class="text-right shrink-0">
              <span class="text-[11px] font-mono px-2 py-1 rounded-[4px] border \${statusStyle}">
                \${reqText}
              </span>
            </div>
          </div>
        \`;
      }).join('');

      // Assessment Items list
      const assessHtml = (m.breakdown || []).map(t => {
        const isGraded = t.grade_achieved != null && t.max_grade != null;
        const markText = isGraded ? (t.grade_achieved + ' / ' + t.max_grade + ' (' + t.percentage.toFixed(1) + '%)') : 'Not marked';
        const ptsText = isGraded ? ('+' + t.weighted_contribution.toFixed(1) + ' pts') : '-- pts';

        return \`
          <div class="p-2 rounded-[6px] bg-[#0f1115] border border-[#262932] flex items-center justify-between text-[12px]">
            <div class="min-w-0 pr-2">
              <div class="font-medium text-[#f3f4f6] truncate">\${escapeHtml(t.task_title)}</div>
              <div class="text-[11px] text-[#9ca3af] flex items-center gap-2 mt-0.5">
                <span class="px-1.5 py-0.2 rounded bg-[#1b1e25] text-[#9ca3af] font-mono">\${t.weight_percentage}% weight</span>
                <span class="\${isGraded ? 'text-[#3e885b]' : 'text-[#6b7280]'}">\${markText}</span>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="text-[11px] font-mono text-[#9ca3af]">\${ptsText}</span>
              <button onclick="openRecordGradeModal('\${t.task_id}', '\${escapeJsString(t.task_title)}', '\${escapeJsString(m.module_code)}', \${t.grade_achieved != null ? t.grade_achieved : 'null'}, \${t.max_grade != null ? t.max_grade : 'null'}, \${t.weight_percentage})"
                class="px-2 py-1 rounded-[4px] border border-[#262932] bg-[#15171d] hover:bg-[#1b1e25] text-[11px] text-[#d1d5db] state-transition">
                \${isGraded ? 'Edit' : 'Mark'}
              </button>
            </div>
          </div>
        \`;
      }).join('');

      return \`
        <div class="bg-[#15171d] border border-[#262932] rounded-[10px] p-4 space-y-3">
          <!-- Card Header -->
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-[12px] font-mono px-2 py-0.5 rounded-[4px] bg-[#1b1e25] text-[#f3f4f6] border border-[#262932]">\${m.module_code}</span>
                <h3 class="text-[15px] font-semibold text-[#f3f4f6] tracking-tight">\${escapeHtml(m.module_name)}</h3>
              </div>
              <div class="text-[12px] text-[#9ca3af] mt-1">
                Coursework avg: <strong class="text-[#f3f4f6] font-mono">\${m.current_coursework_average.toFixed(1)}%</strong>
                &nbsp;·&nbsp;
                Points banked: <strong class="text-[#3e885b] font-mono">\${m.accumulated_course_points.toFixed(1)} / 100</strong>
              </div>
            </div>
            \${dpBadge}
          </div>

          <!-- Weight Progress Bar -->
          <div class="space-y-1">
            <div class="flex items-center justify-between text-[11px] text-[#9ca3af]">
              <span>Syllabus evaluated: \${m.graded_weight_completed}%</span>
              <span>Remaining weight: \${m.remaining_weight}%</span>
            </div>
            <div class="w-full bg-[#0f1115] h-2 rounded-[4px] overflow-hidden border border-[#262932]">
              <div class="h-full bg-[#3b5b8c] rounded-[4px] state-transition" style="width: \${Math.min(100, m.graded_weight_completed)}%;"></div>
            </div>
          </div>

          <!-- DP Notice Box -->
          <div class="p-2.5 rounded-[6px] bg-[#0f1115] border border-[#262932] text-[12px] text-[#9ca3af]">
            \${m.dp_message}
          </div>

          <!-- Target Projections Section -->
          <div class="space-y-2 pt-1">
            <div class="text-[12px] font-semibold text-[#f3f4f6]">Inverse Target Projections</div>
            <div class="space-y-1.5">
              \${projHtml}
            </div>
          </div>

          <!-- Assessment Marks List -->
          <div class="space-y-2 pt-2 border-t border-[#262932]">
            <div class="flex items-center justify-between text-[12px]">
              <span class="font-semibold text-[#f3f4f6]">Assessments &amp; Deliverables</span>
              <button onclick="navigateTo('module', '\${m.module_id}')" class="text-[11px] text-[#3b5b8c] hover:underline font-medium">
                View module &rarr;
              </button>
            </div>
            <div class="space-y-1.5">
              \${assessHtml || '<div class="text-[12px] text-[#6b7280]">No tasks listed for this module.</div>'}
            </div>
          </div>
        </div>
      \`;
    }

    // Interactive Target Simulator logic
    function setSimTarget(target) {
      selectedSimulatorTarget = target;
      [50, 65, 75, 80].forEach(t => {
        const btn = document.getElementById('simTargetBtn-' + t);
        if (btn) {
          if (t === target) {
            btn.className = 'flex-1 py-1.5 px-2 rounded-[6px] text-[12px] font-medium bg-[#3b5b8c] border border-[#3b5b8c] text-white state-transition';
          } else {
            btn.className = 'flex-1 py-1.5 px-2 rounded-[6px] text-[12px] font-medium bg-[#1b1e25] border border-[#262932] text-[#9ca3af] hover:text-[#f3f4f6] state-transition';
          }
        }
      });
      handleSimulatorChange();
    }

    function handleSimulatorChange() {
      const select = document.getElementById('simModuleSelect');
      const resultBox = document.getElementById('simResultContainer');
      if (!select || !resultBox || !cachedPerformanceData) return;

      const modId = select.value;
      const mod = (cachedPerformanceData.modules || []).find(m => m.module_id === modId);
      if (!mod) {
        resultBox.innerHTML = '<div class="text-[12px] text-[#6b7280]">Select a module to view target projections.</div>';
        return;
      }

      const target = selectedSimulatorTarget;
      const accumulated = mod.accumulated_course_points || 0;
      const remainingWeight = (mod.remaining_weight != null ? mod.remaining_weight : (mod.pending_weight != null ? mod.pending_weight : (100 - (mod.graded_weight_completed || 0))));

      if (accumulated >= target) {
        resultBox.innerHTML = \`
          <div class="flex items-center gap-2 text-[#3e885b]">
            <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span class="font-medium text-[13px]">Target of \${target}% Already Secured!</span>
          </div>
          <p class="text-[12px] text-[#9ca3af]">
            You have already banked \${accumulated.toFixed(1)} points in \${mod.module_code}. You will pass with \${target}% even with zero marks on remaining tasks.
          </p>
        \`;
        return;
      }

      if (remainingWeight <= 0) {
        resultBox.innerHTML = \`
          <div class="text-[12px] text-[#b84a4a] font-medium">All course assessments are finalized. Final mark is \${accumulated.toFixed(1)}%.</div>
        \`;
        return;
      }

      const pointsNeeded = target - accumulated;
      const reqRemainingPct = (pointsNeeded / (remainingWeight / 100));

      if (reqRemainingPct > 100) {
        resultBox.innerHTML = \`
          <div class="flex items-center gap-2 text-[#b84a4a]">
            <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <span class="font-medium text-[13px]">Mathematically Unattainable Target (\${target}%)</span>
          </div>
          <p class="text-[12px] text-[#9ca3af]">
            Requires \${reqRemainingPct.toFixed(1)}% across remaining \${remainingWeight}% of assessments, which exceeds the 100% boundary. Maximum possible course score is \${(accumulated + remainingWeight).toFixed(1)}%.
          </p>
        \`;
      } else {
        const isComfortable = reqRemainingPct <= 65;
        const colorClass = isComfortable ? 'text-[#3e885b]' : 'text-[#f59e0b]';
        resultBox.innerHTML = \`
          <div class="flex items-center justify-between">
            <span class="text-[12px] text-[#9ca3af]">Required Score on Remaining \${remainingWeight}%:</span>
            <span class="text-[16px] font-bold font-mono \${colorClass}">\${reqRemainingPct.toFixed(1)}%</span>
          </div>
          <p class="text-[12px] text-[#9ca3af]">
            To achieve a \${target}% final mark in \${mod.module_code}, you need to average \${reqRemainingPct.toFixed(1)}% on upcoming tests and the final exam (\${pointsNeeded.toFixed(1)} more course points needed).
          </p>
        \`;
      }
    }

    // Modal: Record assessment grade
    function openRecordGradeModal(taskId, taskTitle, moduleCode, currentScore, maxScore, weight) {
      const modal = document.getElementById('recordGradeModalOverlay');
      if (!modal) return;

      document.getElementById('recordGradeTaskId').value = taskId;
      document.getElementById('recordGradeTaskTitle').textContent = taskTitle || 'Assessment';
      document.getElementById('recordGradeModBadge').textContent = moduleCode || 'GEN';
      document.getElementById('recordGradeAchieved').value = currentScore != null ? currentScore : '';
      document.getElementById('recordGradeMax').value = maxScore != null ? maxScore : '100';
      document.getElementById('recordGradeWeight').value = weight != null ? weight : '20';

      const clearBtn = document.getElementById('btnGradeClear');
      if (clearBtn) {
        clearBtn.style.display = (currentScore != null) ? 'inline-block' : 'none';
      }

      updateGradeModalPreview();
      modal.classList.remove('hidden');
    }

    function closeRecordGradeModal() {
      const modal = document.getElementById('recordGradeModalOverlay');
      if (modal) modal.classList.add('hidden');
    }

    function updateGradeModalPreview() {
      const achieved = parseFloat(document.getElementById('recordGradeAchieved').value);
      const max = parseFloat(document.getElementById('recordGradeMax').value);
      const weight = parseFloat(document.getElementById('recordGradeWeight').value) || 0;

      const pctEl = document.getElementById('gradeModalPctText');
      const ptsEl = document.getElementById('gradeModalPointsText');

      if (!isNaN(achieved) && !isNaN(max) && max > 0 && achieved >= 0) {
        const pct = (achieved / max) * 100;
        const pts = (pct / 100) * weight;
        if (pctEl) pctEl.textContent = pct.toFixed(1) + '%';
        if (ptsEl) ptsEl.textContent = '+' + pts.toFixed(1) + ' pts';
      } else {
        if (pctEl) pctEl.textContent = '--%';
        if (ptsEl) ptsEl.textContent = '-- pts';
      }
    }

    async function handleSaveGrade(event) {
      event.preventDefault();
      const taskId = document.getElementById('recordGradeTaskId').value;
      const achieved = parseFloat(document.getElementById('recordGradeAchieved').value);
      const max = parseFloat(document.getElementById('recordGradeMax').value);

      if (isNaN(achieved) || isNaN(max) || max <= 0 || achieved < 0) {
        showToast('Please enter valid numeric score values.', 'error');
        return;
      }

      try {
        const res = await apiFetch('/api/v1/academic/tasks/' + taskId + '/grade', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grade_achieved: achieved, max_grade: max })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || 'Failed to record grade');
        }

        closeRecordGradeModal();
        showToast('Assessment score recorded successfully.', 'success');

        // Refresh performance and tasks
        await loadPerformanceData(false);
        if (typeof loadDashboardData === 'function') {
          loadDashboardData();
        }

        // Log analytics event
        apiFetch('/api/v1/analytics/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type: 'TASK_GRADED',
            metadata: { task_id: taskId, score: achieved, max: max }
          })
        }).catch(() => {});
      } catch (err) {
        console.error('Save grade error:', err);
        showToast(err.message || 'Error saving grade score.', 'error');
      }
    }

    async function handleClearGrade() {
      const taskId = document.getElementById('recordGradeTaskId').value;
      if (!taskId) return;

      try {
        const res = await apiFetch('/api/v1/academic/tasks/' + taskId + '/grade', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grade_achieved: null, max_grade: null })
        });

        if (!res.ok) throw new Error('Failed to clear grade');

        closeRecordGradeModal();
        showToast('Score cleared.', 'success');
        await loadPerformanceData(false);
        if (typeof loadDashboardData === 'function') {
          loadDashboardData();
        }
      } catch (err) {
        console.error('Clear grade error:', err);
        showToast('Error clearing score.', 'error');
      }
    }

    // Home Dashboard quick performance widget updater
    function updateDashboardPerformanceWidget(overview) {
      const widget = document.getElementById('dashPerformanceWidget');
      if (!widget || !overview) return;

      const avg = overview.overall_weighted_average || 0;
      const count = overview.distinction_track_count || 0;
      const atRisk = overview.at_risk_modules_count || 0;

      const avgEl = document.getElementById('dashWidgetOverallAvg');
      const statusEl = document.getElementById('dashWidgetStatusText');

      if (avgEl) avgEl.textContent = avg > 0 ? (avg.toFixed(1) + '%') : '--%';
      if (statusEl) {
        if (atRisk > 0) {
          statusEl.textContent = atRisk + ' module below DP cutoff';
          statusEl.className = 'text-[12px] text-[#b84a4a] font-medium';
        } else if (count > 0) {
          statusEl.textContent = count + ' modules on distinction track';
          statusEl.className = 'text-[12px] text-[#3e885b] font-medium';
        } else {
          statusEl.textContent = 'All modules in good DP standing';
          statusEl.className = 'text-[12px] text-[#9ca3af] font-medium';
        }
      }
    }

    function escapeJsString(str) {
      if (!str) return '';
      return String(str).replace(/'/g, "\\\\'");
    }
  `;
}
