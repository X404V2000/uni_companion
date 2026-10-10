/**
 * ui-pomodoro.ts - Pomodoro Study Timer & Focus Sessions Component
 * Built for South African university students to track focused study blocks,
 * link sessions to specific course modules, maintain study streaks, and stay in flow.
 */

export function renderPomodoroViewHtml(): string {
  return `
  <!-- ======================================================== -->
  <!-- VIEW: POMODORO STUDY TIMER & FOCUS COMPONENT             -->
  <!-- ======================================================== -->
  <section id="viewPomodoro" class="hidden max-w-[680px] mx-auto py-6 px-4 sm:px-6 space-y-5">
    
    <!-- Top Header & Navigation Trail -->
    <div class="flex items-center justify-between">
      <div>
        <div class="flex items-center gap-2">
          <button onclick="navigateTo('home')" class="text-[12px] text-[#9ca3af] hover:text-[#d1d5db] inline-flex items-center gap-1 state-transition">
            <span>&larr;</span>
            <span>Dashboard</span>
          </button>
          <span class="text-[12px] text-[#4b5563]">/</span>
          <span class="text-[12px] text-[#9ca3af]">Study Focus</span>
        </div>
        <h1 class="text-[24px] font-semibold text-[#f3f4f6] tracking-tight mt-1">Pomodoro Study Timer</h1>
        <p class="text-[13px] text-[#9ca3af]">Track high-intensity study blocks linked to your course modules.</p>
      </div>

      <div class="flex items-center gap-2">
        <button onclick="togglePomodoroSettingsModal()" class="px-2.5 py-1.5 rounded-[6px] border border-[#262932] bg-[#15171d] hover:bg-[#1b1e25] text-[12px] font-medium text-[#9ca3af] hover:text-[#f3f4f6] state-transition flex items-center gap-1.5" title="Audio & Timer Preferences">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>Preferences</span>
        </button>
      </div>
    </div>

    <!-- MAIN TIMER CARD -->
    <div class="bg-[#15171d] border border-[#262932] rounded-[10px] p-5 sm:p-6 space-y-5 shadow-sm">
      
      <!-- Interactive Segmented Mode Selector (Zero-pill button group) -->
      <div class="flex items-center justify-between border-b border-[#262932] pb-3 text-[13px]">
        <div class="flex items-center gap-1 p-1 bg-[#0f1115] border border-[#262932] rounded-[8px]">
          <button onclick="setPomodoroMode('focus')" id="pomoBtnModeFocus"
            class="px-3 py-1.5 rounded-[6px] font-medium state-transition bg-[#1b1e25] text-[#f3f4f6]">
            Focus 25m
          </button>
          <button onclick="setPomodoroMode('deep_focus')" id="pomoBtnModeDeep"
            class="px-3 py-1.5 rounded-[6px] font-medium state-transition text-[#9ca3af] hover:text-[#f3f4f6]">
            Deep 50m
          </button>
          <button onclick="setPomodoroMode('short_break')" id="pomoBtnModeShortBreak"
            class="px-3 py-1.5 rounded-[6px] font-medium state-transition text-[#9ca3af] hover:text-[#f3f4f6]">
            Break 5m
          </button>
          <button onclick="setPomodoroMode('long_break')" id="pomoBtnModeLongBreak"
            class="px-3 py-1.5 rounded-[6px] font-medium state-transition text-[#9ca3af] hover:text-[#f3f4f6]">
            Long 15m
          </button>
        </div>

        <div class="flex items-center gap-1 text-[12px] text-[#9ca3af] font-mono">
          <span>Cycle:</span>
          <span id="pomoCycleIndicator" class="font-semibold text-[#f59e0b]">1 / 4</span>
        </div>
      </div>

      <!-- Module & Task Linkage Bar -->
      <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
        <div class="sm:col-span-5 space-y-1">
          <label class="block text-[11px] font-medium uppercase tracking-wider text-[#9ca3af]">Link Course Module</label>
          <select id="pomoModuleSelect" onchange="onPomodoroModuleChange()"
            class="w-full bg-[#0f1115] border border-[#262932] rounded-[6px] px-2.5 py-1.5 text-[13px] text-[#f3f4f6] focus:outline-none focus:border-[#3b5b8c]">
            <option value="">General Study / Independent</option>
            <!-- Enrolled modules injected dynamically -->
          </select>
        </div>
        <div class="sm:col-span-7 space-y-1">
          <label class="block text-[11px] font-medium uppercase tracking-wider text-[#9ca3af]">Session Focus Intention</label>
          <input type="text" id="pomoGoalInput" placeholder="e.g. Implement AVL Tree rotation invariant"
            class="w-full bg-[#0f1115] border border-[#262932] rounded-[6px] px-3 py-1.5 text-[13px] text-[#f3f4f6] placeholder-[#6b7280] focus:outline-none focus:border-[#3b5b8c]">
        </div>
      </div>

      <!-- Circular Timer Display & Clock Centerpiece -->
      <div class="flex flex-col items-center justify-center py-4 relative select-none">
        
        <div class="relative w-[240px] h-[240px] sm:w-[260px] sm:h-[260px] flex items-center justify-center">
          <!-- SVG Progress Ring -->
          <svg class="w-full h-full transform -rotate-90" viewBox="0 0 260 260">
            <!-- Background track -->
            <circle cx="130" cy="130" r="114" stroke="#1f232b" stroke-width="8" fill="transparent" />
            <!-- Animated progress ring -->
            <circle id="pomoSvgProgress" cx="130" cy="130" r="114" stroke="#3b5b8c" stroke-width="8"
              stroke-linecap="round" fill="transparent"
              stroke-dasharray="716.28" stroke-dashoffset="0"
              class="transition-all duration-300 ease-linear" />
          </svg>

          <!-- Inside Center Details -->
          <div class="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
            <span id="pomoStatusSubtitle" class="text-[12px] font-medium uppercase tracking-wider text-[#9ca3af] mb-1">
              Ready to focus
            </span>
            <div id="pomoDigitsDisplay" class="font-mono text-[46px] sm:text-[54px] font-bold tracking-tight text-[#f3f4f6] leading-none">
              25:00
            </div>
            <div class="flex items-center gap-1.5 mt-2 text-[12px] text-[#9ca3af]">
              <span id="pomoActiveModuleDot" class="w-2 h-2 rounded-full bg-[#3b5b8c]"></span>
              <span id="pomoActiveModuleLabel" class="font-medium truncate max-w-[140px]">General Study</span>
            </div>
          </div>
        </div>

        <!-- Session Intention preview tag if filled -->
        <div id="pomoIntentionPreview" class="hidden text-center text-[12px] text-[#9ca3af] max-w-[420px] px-3 pt-2 truncate">
          <!-- Shows user's intention -->
        </div>

      </div>

      <!-- Action Controls: Big Start/Pause Button + Sub-Actions -->
      <div class="flex flex-wrap items-center justify-center gap-3 pt-1">
        <button onclick="resetPomodoroTimer()" title="Reset countdown to start"
          class="px-3.5 py-2.5 rounded-[6px] border border-[#262932] bg-[#121318] hover:bg-[#1b1e25] text-[#9ca3af] hover:text-[#d1d5db] text-[13px] font-medium state-transition flex items-center gap-1.5">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Reset</span>
        </button>

        <button onclick="togglePomodoroTimer()" id="pomoBtnStart"
          class="min-w-[150px] px-6 py-2.5 rounded-[6px] bg-[#3b5b8c] hover:bg-[#466ba3] active:bg-[#2e476e] text-white text-[15px] font-semibold state-transition flex items-center justify-center gap-2 shadow-sm">
          <svg id="pomoIconPlay" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
          </svg>
          <svg id="pomoIconPause" class="w-5 h-5 hidden" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
          <span id="pomoBtnStartText">Start Focus</span>
        </button>

        <button onclick="skipPomodoroSession()" title="Skip to next session or break"
          class="px-3.5 py-2.5 rounded-[6px] border border-[#262932] bg-[#121318] hover:bg-[#1b1e25] text-[#9ca3af] hover:text-[#d1d5db] text-[13px] font-medium state-transition flex items-center gap-1.5">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
          <span>Skip</span>
        </button>

        <button onclick="addPomodoroMinutes(5)" title="Add 5 minutes to current timer"
          class="px-3 py-2.5 rounded-[6px] border border-[#262932] bg-[#121318] hover:bg-[#1b1e25] text-[#9ca3af] hover:text-[#d1d5db] text-[12px] font-mono state-transition">
          +5m
        </button>
      </div>

      <!-- Ambient Focus Audio Player Bar (Embedded Web Audio procedural noise) -->
      <div class="pt-3 border-t border-[#262932] flex flex-wrap items-center justify-between gap-3 text-[12px]">
        <div class="flex items-center gap-2 text-[#9ca3af]">
          <svg class="w-4 h-4 text-[#3b5b8c] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          <span>Focus Soundscape:</span>
          <select id="pomoSoundscapeSelect" onchange="onPomodoroSoundscapeChange()"
            class="bg-[#0f1115] border border-[#262932] rounded-[4px] px-2 py-1 text-[12px] text-[#f3f4f6] focus:outline-none">
            <option value="none">Muted / Silent</option>
            <option value="soft_rain">Soft Rain</option>
            <option value="pink_noise">Pink Noise</option>
            <option value="alpha_waves">Alpha Focus (40Hz)</option>
          </select>
        </div>

        <div class="flex items-center gap-3">
          <div id="pomoVolumeControl" class="hidden flex items-center gap-1.5">
            <span class="text-[#6b7280] text-[11px]">Vol</span>
            <input type="range" id="pomoSoundscapeVol" min="0" max="1" step="0.05" value="0.3"
              oninput="updatePomodoroVolume(this.value)" class="w-16 accent-[#3b5b8c] h-1.5 cursor-pointer bg-[#262932]">
          </div>

          <button onclick="testPomodoroChime()" class="text-[#9ca3af] hover:text-[#d1d5db] underline text-[11px] state-transition">
            Test chime
          </button>
        </div>
      </div>

    </div>

    <!-- DAILY FOCUS ANALYTICS CARDS (Anti-slop clean typography, no generic cards) -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      
      <div class="bg-[#15171d] border border-[#262932] rounded-[8px] p-3.5 space-y-1">
        <div class="text-[11px] font-medium uppercase tracking-wider text-[#9ca3af]">Today's Focus</div>
        <div class="flex items-baseline gap-1.5">
          <span id="pomoStatTodayMinutes" class="text-[22px] font-bold text-[#f3f4f6] font-mono">0</span>
          <span class="text-[12px] text-[#9ca3af]">min</span>
        </div>
        <div class="text-[11px] text-[#6b7280]">Target: 100m</div>
      </div>

      <div class="bg-[#15171d] border border-[#262932] rounded-[8px] p-3.5 space-y-1">
        <div class="text-[11px] font-medium uppercase tracking-wider text-[#9ca3af]">Completed</div>
        <div class="flex items-baseline gap-1.5">
          <span id="pomoStatTodaySessions" class="text-[22px] font-bold text-[#3e885b] font-mono">0</span>
          <span class="text-[12px] text-[#9ca3af]">sessions</span>
        </div>
        <div class="text-[11px] text-[#6b7280]">Focus blocks</div>
      </div>

      <div class="bg-[#15171d] border border-[#262932] rounded-[8px] p-3.5 space-y-1">
        <div class="text-[11px] font-medium uppercase tracking-wider text-[#9ca3af]">Study Streak</div>
        <div class="flex items-baseline gap-1.5">
          <span id="pomoStatStreakDays" class="text-[22px] font-bold text-[#f59e0b] font-mono">1</span>
          <span class="text-[12px] text-[#9ca3af]">day</span>
        </div>
        <div class="text-[11px] text-[#6b7280]">Consecutive study</div>
      </div>

      <div class="bg-[#15171d] border border-[#262932] rounded-[8px] p-3.5 space-y-1">
        <div class="text-[11px] font-medium uppercase tracking-wider text-[#9ca3af]">Total Hours</div>
        <div class="flex items-baseline gap-1.5">
          <span id="pomoStatTotalHours" class="text-[22px] font-bold text-[#60a5fa] font-mono">0.0</span>
          <span class="text-[12px] text-[#9ca3af]">hrs</span>
        </div>
        <div class="text-[11px] text-[#6b7280]">All-time logged</div>
      </div>

    </div>

    <!-- MODULE FOCUS DISTRIBUTION (Shows how student allocates time across courses) -->
    <div class="bg-[#15171d] border border-[#262932] rounded-[10px] p-4 space-y-3">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-[14px] font-semibold text-[#f3f4f6]">Focus Distribution by Module</h3>
          <p class="text-[12px] text-[#9ca3af]">Time allocated across your degree subjects</p>
        </div>
        <span class="text-[11px] text-[#6b7280] font-mono" id="pomoDistTotalLabel">0 min total</span>
      </div>

      <!-- Segmented Stack Bar -->
      <div id="pomoDistributionBar" class="w-full h-2.5 rounded-[4px] bg-[#0f1115] border border-[#262932] flex overflow-hidden">
        <!-- Rendered dynamically -->
        <div class="h-full bg-[#3b5b8c]" style="width: 100%;"></div>
      </div>

      <!-- Legend Breakdown Items -->
      <div id="pomoDistributionLegend" class="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-[12px]">
        <!-- Rendered dynamically -->
      </div>
    </div>

    <!-- RECENT FOCUS SESSIONS HISTORY LOG -->
    <div class="bg-[#15171d] border border-[#262932] rounded-[10px] p-4 space-y-3">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-[14px] font-semibold text-[#f3f4f6]">Focus Session Log</h3>
          <p class="text-[12px] text-[#9ca3af]">Recent study sessions saved to your academic record</p>
        </div>
        <button onclick="loadPomodoroData()" class="text-[12px] text-[#3b5b8c] hover:underline">
          Refresh
        </button>
      </div>

      <div id="pomoHistoryList" class="space-y-2 text-[13px]">
        <!-- Injected dynamically -->
      </div>
    </div>

  </section>

  <!-- ======================================================== -->
  <!-- PERSISTENT FLOATING MINI-TIMER WIDGET                    -->
  <!-- Stays docked at bottom-right while user reviews cards,    -->
  <!-- reads summaries, or browses campus timetable.             -->
  <!-- ======================================================== -->
  <div id="floatingPomodoroWidget"
    class="hidden fixed bottom-16 md:bottom-6 right-4 z-40 bg-[#15171d] border border-[#262932] hover:border-[#3b5b8c] rounded-[10px] p-3 shadow-lg max-w-[280px] w-full panel-transition">
    
    <div class="flex items-center justify-between gap-2">
      
      <!-- Clickable region to expand full Pomodoro view -->
      <div onclick="navigateTo('pomodoro')" class="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
        <div class="w-2.5 h-2.5 rounded-full bg-[#3b5b8c] animate-pulse shrink-0" id="floatingPomoDot"></div>
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <span id="floatingPomoDigits" class="font-mono text-[16px] font-bold text-[#f3f4f6] tracking-tight">25:00</span>
            <span id="floatingPomoBadge" class="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded-[3px] bg-[#1b1e25] text-[#9ca3af]">Focus</span>
          </div>
          <div id="floatingPomoModule" class="text-[11px] text-[#9ca3af] truncate">General Study</div>
        </div>
      </div>

      <!-- Quick Controls -->
      <div class="flex items-center gap-1 shrink-0">
        <button onclick="togglePomodoroTimer()" id="floatingPomoBtnToggle" class="p-1.5 rounded-[5px] bg-[#1b1e25] hover:bg-[#232731] text-[#f3f4f6] state-transition" title="Pause / Resume">
          <svg id="floatingIconPlay" class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
          </svg>
          <svg id="floatingIconPause" class="w-3.5 h-3.5 hidden" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
        </button>
        <button onclick="navigateTo('pomodoro')" class="p-1.5 rounded-[5px] hover:bg-[#1b1e25] text-[#9ca3af] hover:text-[#f3f4f6] state-transition" title="Open Full View">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      </div>

    </div>

    <!-- Mini progress line -->
    <div class="w-full bg-[#0f1115] h-1 rounded-full mt-2 overflow-hidden">
      <div id="floatingPomoProgress" class="h-full bg-[#3b5b8c] rounded-full state-transition" style="width: 100%;"></div>
    </div>

  </div>

  <!-- ======================================================== -->
  <!-- MODAL: POMODORO PREFERENCES                              -->
  <!-- ======================================================== -->
  <div id="pomodoroSettingsModal" class="fixed inset-0 z-50 bg-black/60 hidden flex items-center justify-center p-4">
    <div class="bg-[#15171d] border border-[#262932] rounded-[10px] max-w-[420px] w-full p-5 space-y-4 shadow-xl">
      <div class="flex items-center justify-between border-b border-[#262932] pb-3">
        <h3 class="text-[16px] font-semibold text-[#f3f4f6]">Timer Preferences</h3>
        <button onclick="togglePomodoroSettingsModal()" class="text-[#9ca3af] hover:text-[#f3f4f6] text-[18px]">&times;</button>
      </div>

      <div class="space-y-3 text-[13px]">
        <div>
          <label class="block text-[12px] text-[#9ca3af] mb-1">Custom Focus Duration (minutes)</label>
          <input type="number" id="pomoPrefFocusMins" min="5" max="120" value="25"
            class="w-full bg-[#0f1115] border border-[#262932] rounded-[6px] px-3 py-1.5 text-[#f3f4f6] focus:border-[#3b5b8c]">
        </div>

        <div>
          <label class="block text-[12px] text-[#9ca3af] mb-1">Short Break Duration (minutes)</label>
          <input type="number" id="pomoPrefShortBreakMins" min="1" max="30" value="5"
            class="w-full bg-[#0f1115] border border-[#262932] rounded-[6px] px-3 py-1.5 text-[#f3f4f6] focus:border-[#3b5b8c]">
        </div>

        <div>
          <label class="block text-[12px] text-[#9ca3af] mb-1">Long Break Duration (minutes)</label>
          <input type="number" id="pomoPrefLongBreakMins" min="5" max="60" value="15"
            class="w-full bg-[#0f1115] border border-[#262932] rounded-[6px] px-3 py-1.5 text-[#f3f4f6] focus:border-[#3b5b8c]">
        </div>

        <div class="pt-2 border-t border-[#262932] space-y-2">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" id="pomoPrefAutoStartBreak" class="rounded bg-[#0f1115] border-[#262932] text-[#3b5b8c]">
            <span class="text-[#d1d5db]">Auto-start break when focus timer ends</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" id="pomoPrefChime" checked class="rounded bg-[#0f1115] border-[#262932] text-[#3b5b8c]">
            <span class="text-[#d1d5db]">Play harmonic sound chime on completion</span>
          </label>
        </div>
      </div>

      <div class="pt-3 border-t border-[#262932] flex items-center justify-end gap-2">
        <button onclick="togglePomodoroSettingsModal()" class="px-3 py-1.5 rounded-[6px] text-[#9ca3af] hover:text-[#d1d5db] text-[13px]">
          Cancel
        </button>
        <button onclick="savePomodoroPreferences()" class="px-4 py-1.5 rounded-[6px] bg-[#3b5b8c] hover:bg-[#466ba3] text-white font-medium text-[13px]">
          Save settings
        </button>
      </div>
    </div>
  </div>
  `;
}

export function getPomodoroClientScript(): string {
  return `
    // ========================================================
    // POMODORO STUDY TIMER & FOCUS CLIENT CONTROLLER
    // ========================================================

    const POMO_CIRCUMFERENCE = 716.28; // 2 * Math.PI * 114

    let pomoState = {
      mode: 'focus', // 'focus' | 'deep_focus' | 'short_break' | 'long_break'
      isRunning: false,
      totalSeconds: 25 * 60,
      remainingSeconds: 25 * 60,
      targetEndTime: 0,
      timerInterval: null,
      cycleCount: 1, // 1 through 4
      moduleId: null,
      moduleCode: '',
      taskTitle: '',
      soundscape: 'none',
      soundscapeVol: 0.3,
      autoStartBreak: false,
      chimeEnabled: true,
      customFocusMins: 25,
      customShortMins: 5,
      customLongMins: 15,
      sessionStartTime: null,
    };

    // Web Audio Synthesizer Context
    let pomoAudioCtx = null;
    let pomoAmbientNodes = null;

    function getAudioContext() {
      if (!pomoAudioCtx) {
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        if (AudioCtxClass) {
          pomoAudioCtx = new AudioCtxClass();
        }
      }
      if (pomoAudioCtx && pomoAudioCtx.state === 'suspended') {
        pomoAudioCtx.resume();
      }
      return pomoAudioCtx;
    }

    // Synthesized bell completion chime
    function playPomodoroChime(isBreak = false) {
      if (!pomoState.chimeEnabled) return;
      try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const freqs = isBreak ? [329.63, 392.00, 523.25] : [523.25, 659.25, 783.99]; // E4-G4-C5 for break, C5-E5-G5 for focus

        freqs.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.12);

          gain.gain.setValueAtTime(0, now + idx * 0.12);
          gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.12 + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 1.2);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now + idx * 0.12);
          osc.stop(now + idx * 0.12 + 1.3);
        });
      } catch (e) {
        console.warn('Audio chime playback:', e);
      }
    }

    // Procedural Ambient Noise / Soundscape (Web Audio API)
    function stopPomodoroSoundscape() {
      if (pomoAmbientNodes) {
        try {
          if (pomoAmbientNodes.source) pomoAmbientNodes.source.stop();
          if (pomoAmbientNodes.gain) pomoAmbientNodes.gain.disconnect();
        } catch (e) {}
        pomoAmbientNodes = null;
      }
    }

    function startPomodoroSoundscape(type, volume = 0.3) {
      stopPomodoroSoundscape();
      if (type === 'none') return;

      const ctx = getAudioContext();
      if (!ctx) return;

      try {
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        if (type === 'pink_noise' || type === 'soft_rain') {
          // 1/f Pink Noise Approximation
          let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
          for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
            b6 = white * 0.115926;
          }
        } else if (type === 'alpha_waves') {
          // Low frequency binaural hum (40Hz)
          for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.sin((2 * Math.PI * 40 * i) / ctx.sampleRate) * 0.3 + (Math.random() * 0.02);
          }
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        // Filter
        const filter = ctx.createBiquadFilter();
        if (type === 'soft_rain') {
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(800, ctx.currentTime);
        } else if (type === 'pink_noise') {
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(1400, ctx.currentTime);
        } else {
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(300, ctx.currentTime);
        }

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(Math.max(0.01, volume * 0.4), ctx.currentTime);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        noise.start();
        pomoAmbientNodes = { source: noise, gain, filter };
      } catch (err) {
        console.warn('Procedural soundscape error:', err);
      }
    }

    function onPomodoroSoundscapeChange() {
      const select = document.getElementById('pomoSoundscapeSelect');
      if (!select) return;
      pomoState.soundscape = select.value;
      const volContainer = document.getElementById('pomoVolumeControl');
      if (volContainer) {
        if (pomoState.soundscape === 'none') {
          volContainer.classList.add('hidden');
        } else {
          volContainer.classList.remove('hidden');
        }
      }

      if (pomoState.isRunning) {
        startPomodoroSoundscape(pomoState.soundscape, pomoState.soundscapeVol);
      } else {
        stopPomodoroSoundscape();
      }
      savePomoLocal();
    }

    function updatePomodoroVolume(val) {
      pomoState.soundscapeVol = parseFloat(val) || 0.3;
      if (pomoAmbientNodes && pomoAmbientNodes.gain && pomoAudioCtx) {
        pomoAmbientNodes.gain.gain.setValueAtTime(Math.max(0.01, pomoState.soundscapeVol * 0.4), pomoAudioCtx.currentTime);
      }
      savePomoLocal();
    }

    function testPomodoroChime() {
      getAudioContext();
      playPomodoroChime(pomoState.mode.includes('break'));
    }

    // Set Timer Mode (Focus 25, Deep 50, Short 5, Long 15)
    function setPomodoroMode(mode) {
      if (pomoState.isRunning) {
        if (!confirm('A timer is currently active. Switch modes and restart timer?')) {
          return;
        }
        pausePomodoroTimer();
      }

      pomoState.mode = mode;
      let minutes = 25;
      if (mode === 'focus') minutes = pomoState.customFocusMins || 25;
      else if (mode === 'deep_focus') minutes = 50;
      else if (mode === 'short_break') minutes = pomoState.customShortMins || 5;
      else if (mode === 'long_break') minutes = pomoState.customLongMins || 15;

      pomoState.totalSeconds = minutes * 60;
      pomoState.remainingSeconds = minutes * 60;
      pomoState.sessionStartTime = null;

      // Update segmented button visual states
      const modeButtons = [
        { id: 'pomoBtnModeFocus', active: mode === 'focus' },
        { id: 'pomoBtnModeDeep', active: mode === 'deep_focus' },
        { id: 'pomoBtnModeShortBreak', active: mode === 'short_break' },
        { id: 'pomoBtnModeLongBreak', active: mode === 'long_break' },
      ];

      modeButtons.forEach(b => {
        const el = document.getElementById(b.id);
        if (el) {
          if (b.active) {
            el.className = 'px-3 py-1.5 rounded-[6px] font-medium state-transition bg-[#1b1e25] text-[#f3f4f6] shadow-sm';
          } else {
            el.className = 'px-3 py-1.5 rounded-[6px] font-medium state-transition text-[#9ca3af] hover:text-[#f3f4f6]';
          }
        }
      });

      // Update ring color theme based on mode
      const svgRing = document.getElementById('pomoSvgProgress');
      const activeDot = document.getElementById('pomoActiveModuleDot');
      const startBtn = document.getElementById('pomoBtnStart');
      const statusSubtitle = document.getElementById('pomoStatusSubtitle');

      const isBreak = mode.includes('break');
      const accentColor = isBreak ? '#3e885b' : (mode === 'deep_focus' ? '#f59e0b' : '#3b5b8c');

      if (svgRing) svgRing.setAttribute('stroke', accentColor);
      if (activeDot) activeDot.style.backgroundColor = accentColor;
      if (startBtn) {
        startBtn.className = 'min-w-[150px] px-6 py-2.5 rounded-[6px] text-white text-[15px] font-semibold state-transition flex items-center justify-center gap-2 shadow-sm ' +
          (isBreak ? 'bg-[#3e885b] hover:bg-[#489e6a]' : (mode === 'deep_focus' ? 'bg-[#d97706] hover:bg-[#b45309]' : 'bg-[#3b5b8c] hover:bg-[#466ba3]'));
      }
      if (statusSubtitle) {
        statusSubtitle.textContent = isBreak ? 'Break Time' : 'Ready to focus';
      }

      updatePomodoroDisplay();
      savePomoLocal();
    }

    function togglePomodoroTimer() {
      if (pomoState.isRunning) {
        pausePomodoroTimer();
      } else {
        startPomodoroTimer();
      }
    }

    function startPomodoroTimer() {
      if (pomoState.isRunning) return;

      // Ask for notification permission if needed
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }

      pomoState.isRunning = true;
      pomoState.sessionStartTime = pomoState.sessionStartTime || new Date().toISOString();
      pomoState.targetEndTime = Date.now() + (pomoState.remainingSeconds * 1000);

      // Start ambient soundscape if selected
      if (pomoState.soundscape !== 'none') {
        startPomodoroSoundscape(pomoState.soundscape, pomoState.soundscapeVol);
      }

      updatePomodoroControlsUI(true);

      // Timer ticker with drift correction
      if (pomoState.timerInterval) clearInterval(pomoState.timerInterval);
      pomoState.timerInterval = setInterval(() => {
        const now = Date.now();
        const diff = Math.max(0, Math.round((pomoState.targetEndTime - now) / 1000));
        pomoState.remainingSeconds = diff;

        updatePomodoroDisplay();

        if (diff <= 0) {
          clearInterval(pomoState.timerInterval);
          pomoState.timerInterval = null;
          handlePomodoroCompletion();
        }
      }, 1000);

      updatePomodoroDisplay();
      savePomoLocal();
    }

    function pausePomodoroTimer() {
      pomoState.isRunning = false;
      if (pomoState.timerInterval) {
        clearInterval(pomoState.timerInterval);
        pomoState.timerInterval = null;
      }
      stopPomodoroSoundscape();
      updatePomodoroControlsUI(false);
      updatePomodoroDisplay();
      savePomoLocal();
    }

    function resetPomodoroTimer() {
      pausePomodoroTimer();
      pomoState.remainingSeconds = pomoState.totalSeconds;
      pomoState.sessionStartTime = null;
      updatePomodoroDisplay();
      savePomoLocal();
    }

    function skipPomodoroSession() {
      pausePomodoroTimer();
      if (!pomoState.mode.includes('break')) {
        // Record partial if at least 2 minutes
        const elapsed = pomoState.totalSeconds - pomoState.remainingSeconds;
        if (elapsed >= 120) {
          recordPomodoroSessionToServer(false, elapsed);
        }
        // Switch to break
        if (pomoState.cycleCount % 4 === 0) {
          setPomodoroMode('long_break');
        } else {
          setPomodoroMode('short_break');
        }
      } else {
        // Switch back to focus
        setPomodoroMode('focus');
      }
    }

    function addPomodoroMinutes(mins) {
      const addSec = mins * 60;
      pomoState.remainingSeconds += addSec;
      pomoState.totalSeconds += addSec;
      if (pomoState.isRunning) {
        pomoState.targetEndTime += (addSec * 1000);
      }
      updatePomodoroDisplay();
      savePomoLocal();
    }

    // Session finished handler
    async function handlePomodoroCompletion() {
      pomoState.isRunning = false;
      stopPomodoroSoundscape();
      updatePomodoroControlsUI(false);

      const isBreak = pomoState.mode.includes('break');

      // Play Chime
      playPomodoroChime(isBreak);

      // System notification
      if ('Notification' in window && Notification.permission === 'granted') {
        const title = isBreak ? 'Break finished! Time to focus.' : 'Pomodoro block completed! Great work.';
        const body = isBreak
          ? 'Step back into your study zone and start the next focus block.'
          : (pomoState.moduleCode ? 'Finished 25m for ' + pomoState.moduleCode + '. Take a well-deserved 5m break.' : 'Take a 5-minute break.');
        try {
          new Notification(title, { body, icon: '/favicon.ico' });
        } catch (e) {}
      }

      // Record completed session to server if it was a focus block
      if (!isBreak) {
        await recordPomodoroSessionToServer(true, pomoState.totalSeconds);
        pomoState.cycleCount = (pomoState.cycleCount % 4) + 1;
        updateCycleIndicator();

        // Switch to break
        if (pomoState.cycleCount === 1) {
          // completed 4 cycles -> long break
          setPomodoroMode('long_break');
        } else {
          setPomodoroMode('short_break');
        }

        if (pomoState.autoStartBreak) {
          startPomodoroTimer();
        }
      } else {
        // Break ended -> switch to focus
        setPomodoroMode('focus');
      }

      updatePomodoroDisplay();
      loadPomodoroData(); // refresh stats and history
      savePomoLocal();
    }

    // Save session to backend
    async function recordPomodoroSessionToServer(isCompleted, actualSec) {
      const goalInput = document.getElementById('pomoGoalInput');
      const goal = goalInput ? goalInput.value.trim() : (pomoState.taskTitle || '');

      const payload = {
        module_id: pomoState.moduleId || null,
        module_code: pomoState.moduleCode || null,
        task_id: null,
        task_title: pomoState.taskTitle || null,
        session_type: pomoState.mode.includes('break') ? (pomoState.mode === 'long_break' ? 'LONG_BREAK' : 'SHORT_BREAK') : 'FOCUS',
        target_duration_minutes: Math.round(pomoState.totalSeconds / 60),
        completed_seconds: actualSec,
        is_completed: isCompleted,
        goal_notes: goal,
        started_at: pomoState.sessionStartTime || new Date(Date.now() - (actualSec * 1000)).toISOString(),
        completed_at: new Date().toISOString(),
      };

      try {
        await apiFetch('/api/v1/academic/pomodoro/sessions', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } catch (err) {
        console.warn('Error saving focus session to server:', err);
      }
    }

    function updatePomodoroControlsUI(running) {
      const btnStartText = document.getElementById('pomoBtnStartText');
      const iconPlay = document.getElementById('pomoIconPlay');
      const iconPause = document.getElementById('pomoIconPause');
      const floatingPlay = document.getElementById('floatingIconPlay');
      const floatingPause = document.getElementById('floatingIconPause');
      const statusSubtitle = document.getElementById('pomoStatusSubtitle');

      if (btnStartText) {
        btnStartText.textContent = running ? 'Pause' : (pomoState.remainingSeconds < pomoState.totalSeconds ? 'Resume' : (pomoState.mode.includes('break') ? 'Start Break' : 'Start Focus'));
      }
      if (iconPlay && iconPause) {
        if (running) {
          iconPlay.classList.add('hidden');
          iconPause.classList.remove('hidden');
        } else {
          iconPlay.classList.remove('hidden');
          iconPause.classList.add('hidden');
        }
      }
      if (floatingPlay && floatingPause) {
        if (running) {
          floatingPlay.classList.add('hidden');
          floatingPause.classList.remove('hidden');
        } else {
          floatingPlay.classList.remove('hidden');
          floatingPause.classList.add('hidden');
        }
      }
      if (statusSubtitle) {
        if (running) {
          statusSubtitle.textContent = pomoState.mode.includes('break') ? 'On Break...' : 'Focusing...';
        } else if (pomoState.remainingSeconds < pomoState.totalSeconds) {
          statusSubtitle.textContent = 'Paused';
        } else {
          statusSubtitle.textContent = pomoState.mode.includes('break') ? 'Break Ready' : 'Ready to focus';
        }
      }
    }

    function updatePomodoroDisplay() {
      const rem = Math.max(0, pomoState.remainingSeconds);
      const mins = Math.floor(rem / 60);
      const secs = rem % 60;
      const timeStr = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');

      // Main Digits
      const digitsEl = document.getElementById('pomoDigitsDisplay');
      if (digitsEl) digitsEl.textContent = timeStr;

      // Progress Ring
      const progressFrac = pomoState.totalSeconds > 0 ? (rem / pomoState.totalSeconds) : 0;
      const offset = POMO_CIRCUMFERENCE * (1 - progressFrac);
      const svgCircle = document.getElementById('pomoSvgProgress');
      if (svgCircle) {
        svgCircle.style.strokeDashoffset = String(offset);
      }

      // Browser Tab Title
      const modPrefix = pomoState.moduleCode ? pomoState.moduleCode : (pomoState.mode.includes('break') ? 'Break' : 'Focus');
      if (pomoState.isRunning) {
        document.title = '(' + timeStr + ') ⏳ ' + modPrefix + ' - Varsity Companion';
      } else {
        document.title = 'Varsity Companion - South African Study Tool';
      }

      // Persistent Floating Widget
      updateFloatingWidget(timeStr, progressFrac);

      // Left Rail Status Badge
      const railPomo = document.getElementById('railPomodoroStatus');
      if (railPomo) {
        if (pomoState.isRunning) {
          railPomo.textContent = timeStr;
          railPomo.className = 'text-[10px] px-1.5 py-0.5 rounded-[4px] bg-[#3b5b8c] text-white font-mono font-semibold animate-pulse';
        } else {
          railPomo.textContent = Math.round(pomoState.totalSeconds / 60) + 'm';
          railPomo.className = 'text-[10px] px-1.5 py-0.5 rounded-[4px] bg-[#f59e0b]/20 text-[#f59e0b] font-mono font-semibold';
        }
      }
    }

    function updateFloatingWidget(timeStr, progressFrac) {
      const widget = document.getElementById('floatingPomodoroWidget');
      if (!widget) return;

      // Show floating widget if timer is active or running, and user is on another view
      const isPomodoroView = (typeof currentView !== 'undefined' && currentView === 'pomodoro');
      if (pomoState.isRunning || (pomoState.remainingSeconds < pomoState.totalSeconds)) {
        if (!isPomodoroView) {
          widget.classList.remove('hidden');
        } else {
          widget.classList.add('hidden');
        }
      } else {
        widget.classList.add('hidden');
      }

      const digitsEl = document.getElementById('floatingPomoDigits');
      if (digitsEl) digitsEl.textContent = timeStr;

      const badgeEl = document.getElementById('floatingPomoBadge');
      if (badgeEl) {
        badgeEl.textContent = pomoState.mode.includes('break') ? 'Break' : 'Focus';
      }

      const modEl = document.getElementById('floatingPomoModule');
      if (modEl) {
        modEl.textContent = pomoState.moduleCode || 'General Study';
      }

      const barEl = document.getElementById('floatingPomoProgress');
      if (barEl) {
        barEl.style.width = Math.round(progressFrac * 100) + '%';
      }
    }

    function updateCycleIndicator() {
      const indicator = document.getElementById('pomoCycleIndicator');
      if (indicator) {
        indicator.textContent = pomoState.cycleCount + ' / 4';
      }
    }

    function getPomodoroModulesList() {
      if (typeof cachedModules !== 'undefined' && Array.isArray(cachedModules) && cachedModules.length > 0) {
        return cachedModules;
      }
      if (typeof dashboardData !== 'undefined' && dashboardData && Array.isArray(dashboardData.modules) && dashboardData.modules.length > 0) {
        return dashboardData.modules;
      }
      return [];
    }

    function onPomodoroModuleChange() {
      const select = document.getElementById('pomoModuleSelect');
      if (!select) return;
      const code = select.value;
      pomoState.moduleCode = code;

      const activeModuleLabel = document.getElementById('pomoActiveModuleLabel');
      if (activeModuleLabel) {
        activeModuleLabel.textContent = code ? code : 'General Study';
      }

      const activeDot = document.getElementById('pomoActiveModuleDot');
      if (activeDot) {
        const modulesList = getPomodoroModulesList();
        const found = modulesList.find(m => m.code === code);
        activeDot.style.backgroundColor = (found && found.color_code) ? found.color_code : '#3b5b8c';
      }

      savePomoLocal();
    }

    // Modal preferences
    function togglePomodoroSettingsModal() {
      const modal = document.getElementById('pomodoroSettingsModal');
      if (!modal) return;
      modal.classList.toggle('hidden');
    }

    function savePomodoroPreferences() {
      const focusMinsInput = document.getElementById('pomoPrefFocusMins');
      const shortMinsInput = document.getElementById('pomoPrefShortBreakMins');
      const longMinsInput = document.getElementById('pomoPrefLongBreakMins');
      const autoBreakCheckbox = document.getElementById('pomoPrefAutoStartBreak');
      const chimeCheckbox = document.getElementById('pomoPrefChime');

      if (focusMinsInput) pomoState.customFocusMins = parseInt(focusMinsInput.value, 10) || 25;
      if (shortMinsInput) pomoState.customShortMins = parseInt(shortMinsInput.value, 10) || 5;
      if (longMinsInput) pomoState.customLongMins = parseInt(longMinsInput.value, 10) || 15;
      if (autoBreakCheckbox) pomoState.autoStartBreak = autoBreakCheckbox.checked;
      if (chimeCheckbox) pomoState.chimeEnabled = chimeCheckbox.checked;

      // Update current mode duration if not running
      if (!pomoState.isRunning) {
        setPomodoroMode(pomoState.mode);
      }

      togglePomodoroSettingsModal();
      savePomoLocal();
    }

    // Populate module selector safely with fallback
    async function populatePomodoroModuleSelect() {
      const select = document.getElementById('pomoModuleSelect');
      if (!select) return;

      let modulesList = getPomodoroModulesList();
      if (modulesList.length === 0) {
        try {
          const res = await apiFetch('/api/v1/academic/modules');
          if (res.ok) {
            modulesList = await res.json();
            if (typeof cachedModules !== 'undefined') {
              cachedModules = modulesList;
            }
          }
        } catch (e) {
          // ignore error
        }
      }

      const currentVal = select.value || pomoState.moduleCode;
      let html = '<option value="">General Study / Independent</option>';
      if (Array.isArray(modulesList)) {
        modulesList.forEach(m => {
          const selected = (m.code === currentVal) ? 'selected' : '';
          html += '<option value="' + escapeHtml(m.code) + '" ' + selected + '>' + escapeHtml(m.code) + ' - ' + escapeHtml(m.name) + '</option>';
        });
      }
      select.innerHTML = html;
    }

    // Quick launch from Home or Module view
    function startPomodoroWithModule(moduleCode, taskTitle = '') {
      navigateTo('pomodoro');
      pomoState.moduleCode = moduleCode || '';
      pomoState.taskTitle = taskTitle || '';

      const select = document.getElementById('pomoModuleSelect');
      if (select && moduleCode) {
        select.value = moduleCode;
        onPomodoroModuleChange();
      }

      const goalInput = document.getElementById('pomoGoalInput');
      if (goalInput && taskTitle) {
        goalInput.value = taskTitle;
      }

      setPomodoroMode('focus');
      startPomodoroTimer();
    }

    // Load Focus Stats & History from Backend
    async function loadPomodoroData() {
      await populatePomodoroModuleSelect();

      try {
        const [statsRes, histRes] = await Promise.all([
          apiFetch('/api/v1/academic/pomodoro/stats'),
          apiFetch('/api/v1/academic/pomodoro/history?limit=15')
        ]);

        if (statsRes.ok) {
          const stats = await statsRes.json();
          renderPomodoroStats(stats);
        }

        if (histRes.ok) {
          const history = await histRes.json();
          renderPomodoroHistory(history);
        }
      } catch (err) {
        console.warn('Error loading pomodoro data:', err);
      }
    }

    function renderPomodoroStats(stats) {
      if (!stats) return;

      const todayMinsEl = document.getElementById('pomoStatTodayMinutes');
      const todaySessionsEl = document.getElementById('pomoStatTodaySessions');
      const streakDaysEl = document.getElementById('pomoStatStreakDays');
      const totalHoursEl = document.getElementById('pomoStatTotalHours');

      if (todayMinsEl) todayMinsEl.textContent = String(stats.today_focus_minutes || 0);
      if (todaySessionsEl) todaySessionsEl.textContent = String(stats.today_sessions_count || 0);
      if (streakDaysEl) streakDaysEl.textContent = String(stats.current_streak_days || 1);
      if (totalHoursEl) {
        const hrs = ((stats.total_focus_minutes || 0) / 60).toFixed(1);
        totalHoursEl.textContent = hrs;
      }

      // Update Home dashboard widget if exists
      const homePomoMins = document.getElementById('dashPomoTodayMinutes');
      const homePomoCount = document.getElementById('dashPomoTodayCount');
      if (homePomoMins) homePomoMins.textContent = String(stats.today_focus_minutes || 0);
      if (homePomoCount) homePomoCount.textContent = String(stats.today_sessions_count || 0);

      // Focus Distribution Bar & Legend
      renderPomodoroDistribution(stats.module_distribution || [], stats.total_focus_minutes || 0);
    }

    function renderPomodoroDistribution(dist, totalMins) {
      const barContainer = document.getElementById('pomoDistributionBar');
      const legendContainer = document.getElementById('pomoDistributionLegend');
      const totalLabel = document.getElementById('pomoDistTotalLabel');

      if (totalLabel) totalLabel.textContent = totalMins + ' min total focus';

      if (!barContainer || !legendContainer) return;

      if (!dist || dist.length === 0) {
        barContainer.innerHTML = '<div class="h-full bg-[#262932] w-full" title="No focus logged yet"></div>';
        legendContainer.innerHTML = '<div class="col-span-3 text-[12px] text-[#6b7280]">Complete your first focus block to see module time distribution.</div>';
        return;
      }

      let barHtml = '';
      let legHtml = '';

      dist.forEach(item => {
        const color = item.color_code || '#3b5b8c';
        barHtml += '<div class="h-full state-transition" style="width: ' + Math.max(item.percentage, 4) + '%; background-color: ' + color + ';" title="' + escapeHtml(item.module_code) + ': ' + item.minutes + 'm (' + item.percentage + '%)"></div>';

        legHtml += '<div class="flex items-center gap-2">' +
          '<span class="w-2 h-2 rounded-[2px] shrink-0" style="background-color: ' + color + ';"></span>' +
          '<span class="font-medium text-[#f3f4f6] truncate">' + escapeHtml(item.module_code) + '</span>' +
          '<span class="text-[#9ca3af] font-mono ml-auto">' + item.minutes + 'm</span>' +
        '</div>';
      });

      barContainer.innerHTML = barHtml;
      legendContainer.innerHTML = legHtml;
    }

    function renderPomodoroHistory(sessions) {
      const container = document.getElementById('pomoHistoryList');
      if (!container) return;

      if (!sessions || sessions.length === 0) {
        container.innerHTML = '<div class="p-3 text-center text-[12px] text-[#6b7280] border border-dashed border-[#262932] rounded-[6px]">' +
          'No focus sessions recorded yet. Start your first 25-minute Pomodoro block above!' +
        '</div>';
        return;
      }

      let html = '';
      sessions.forEach(s => {
        const isFocus = s.session_type === 'FOCUS';
        const mins = Math.round((s.completed_seconds || s.target_duration_minutes * 60) / 60);
        const modLabel = s.module_code || (isFocus ? 'General Study' : 'Campus Break');
        const timeAgo = formatSessionTime(s.completed_at || s.created_at);

        html += '<div class="flex items-center justify-between p-2.5 rounded-[6px] bg-[#121318] border border-[#262932] state-transition hover:border-[#333742]">' +
          '<div class="flex items-center gap-3 min-w-0">' +
            '<span class="w-2 h-2 rounded-full shrink-0 ' + (isFocus ? 'bg-[#3b5b8c]' : 'bg-[#3e885b]') + '"></span>' +
            '<div class="min-w-0">' +
              '<div class="flex items-center gap-2">' +
                '<span class="font-medium text-[#f3f4f6] truncate">' + escapeHtml(modLabel) + '</span>' +
                '<span class="text-[11px] text-[#6b7280]">·</span>' +
                '<span class="text-[12px] text-[#9ca3af] font-mono">' + mins + ' min</span>' +
                (!s.is_completed ? '<span class="text-[10px] text-[#b84a4a] font-mono">(partial)</span>' : '') +
              '</div>' +
              (s.goal_notes ? '<div class="text-[11px] text-[#6b7280] truncate mt-0.5">' + escapeHtml(s.goal_notes) + '</div>' : '') +
            '</div>' +
          '</div>' +

          '<div class="flex items-center gap-3 shrink-0 text-[11px] text-[#6b7280]">' +
            '<span>' + timeAgo + '</span>' +
            '<button onclick="deletePomodoroSessionLog(\\\'' + s.id + '\\\')" class="text-[#6b7280] hover:text-[#b84a4a] text-[13px] leading-none" title="Delete record">&times;</button>' +
          '</div>' +
        '</div>';
      });

      container.innerHTML = html;
    }

    async function deletePomodoroSessionLog(id) {
      if (!confirm('Remove this focus session log entry?')) return;
      try {
        const res = await apiFetch('/api/v1/academic/pomodoro/sessions/' + id, { method: 'DELETE' });
        if (res.ok) {
          loadPomodoroData();
        }
      } catch (err) {
        console.warn('Error deleting pomodoro session:', err);
      }
    }

    function formatSessionTime(isoString) {
      if (!isoString) return '';
      try {
        const d = new Date(isoString);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMins = Math.round(diffMs / 60000);
        if (diffMins < 60) return diffMins <= 1 ? 'Just now' : diffMins + 'm ago';
        const diffHours = Math.round(diffMins / 60);
        if (diffHours < 24) return diffHours + 'h ago';
        return d.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
      } catch (e) {
        return '';
      }
    }

    // Local Storage backup for continuity across reloads
    function savePomoLocal() {
      try {
        const serialized = {
          mode: pomoState.mode,
          isRunning: pomoState.isRunning,
          remainingSeconds: pomoState.remainingSeconds,
          totalSeconds: pomoState.totalSeconds,
          targetEndTime: pomoState.targetEndTime,
          cycleCount: pomoState.cycleCount,
          moduleCode: pomoState.moduleCode,
          soundscape: pomoState.soundscape,
          soundscapeVol: pomoState.soundscapeVol,
          autoStartBreak: pomoState.autoStartBreak,
          chimeEnabled: pomoState.chimeEnabled,
          customFocusMins: pomoState.customFocusMins,
          customShortMins: pomoState.customShortMins,
          customLongMins: pomoState.customLongMins,
          timestamp: Date.now(),
        };
        localStorage.setItem('varsity_pomodoro_state', JSON.stringify(serialized));
      } catch (e) {}
    }

    function initPomodoroTimerFromLocal() {
      try {
        const raw = localStorage.getItem('varsity_pomodoro_state');
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (!saved) return;

        pomoState.mode = saved.mode || 'focus';
        pomoState.cycleCount = saved.cycleCount || 1;
        pomoState.moduleCode = saved.moduleCode || '';
        pomoState.soundscape = saved.soundscape || 'none';
        pomoState.soundscapeVol = saved.soundscapeVol || 0.3;
        pomoState.autoStartBreak = Boolean(saved.autoStartBreak);
        pomoState.chimeEnabled = saved.chimeEnabled !== undefined ? saved.chimeEnabled : true;
        pomoState.customFocusMins = saved.customFocusMins || 25;
        pomoState.customShortMins = saved.customShortMins || 5;
        pomoState.customLongMins = saved.customLongMins || 15;

        // Restore soundscape select in UI
        const soundSelect = document.getElementById('pomoSoundscapeSelect');
        if (soundSelect && pomoState.soundscape) {
          soundSelect.value = pomoState.soundscape;
        }

        // If it was running, check how much time has passed
        if (saved.isRunning && saved.targetEndTime) {
          const now = Date.now();
          const remaining = Math.max(0, Math.round((saved.targetEndTime - now) / 1000));
          if (remaining > 0) {
            pomoState.totalSeconds = saved.totalSeconds || 25 * 60;
            pomoState.remainingSeconds = remaining;
            startPomodoroTimer();
          } else {
            // Expired while tab was closed
            pomoState.totalSeconds = saved.totalSeconds || 25 * 60;
            pomoState.remainingSeconds = 0;
            updatePomodoroDisplay();
          }
        } else {
          pomoState.totalSeconds = saved.totalSeconds || 25 * 60;
          pomoState.remainingSeconds = saved.remainingSeconds || pomoState.totalSeconds;
          updatePomodoroDisplay();
        }
      } catch (e) {
        console.warn('Could not restore pomodoro state:', e);
      }
    }
  `;
}
