// Campus Timetable & Weekly Schedule Module
// Interactive weekly class grid visualization, course code input, clash detection, and calendar export

export function renderTimetableViewsHtml(): string {
  return `
      <!-- ==================================================== -->
      <!-- VIEW: CAMPUS TIMETABLE, WEEKLY SCHEDULE & VENUES     -->
      <!-- ==================================================== -->
      <section id="viewTimetable" class="hidden max-w-[1240px] mx-auto py-6 px-3 sm:px-6 space-y-5">
        
        <!-- Header & Action Controls -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1">
          <div>
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-[2px] bg-[#3b5b8c]"></span>
              <div class="text-[12px] font-medium text-[#9ca3af]">Academic Timetable Engine</div>
            </div>
            <h1 class="text-[22px] font-semibold text-[#f3f4f6] tracking-tight mt-0.5">Weekly Class Schedule &amp; Venues</h1>
            <p class="text-[12px] text-[#9ca3af] mt-0.5">Input course codes, visualize lectures and lab sessions, inspect campus venues, and audit transit buffers</p>
          </div>

          <!-- Action buttons & View mode toggles -->
          <div class="flex flex-wrap items-center gap-2">
            <!-- View Mode Switcher: Grid vs List -->
            <div class="flex items-center p-0.5 bg-[#15171d] border border-[#262932] rounded-[6px]">
              <button onclick="setTimetableMode('grid')" id="ttModeGridBtn"
                class="flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[12px] font-medium text-[#f3f4f6] bg-[#1b1e25] state-transition"
                title="Interactive weekly calendar grid">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 4h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Weekly Grid</span>
              </button>
              <button onclick="setTimetableMode('agenda')" id="ttModeAgendaBtn"
                class="flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[12px] font-medium text-[#9ca3af] hover:text-[#d1d5db] state-transition"
                title="Agenda list breakdown by day">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                <span>Day Agenda</span>
              </button>
            </div>

            <!-- Weekend Toggle: 5-Day vs 6-Day -->
            <button onclick="toggleWeekend()" id="ttWeekendToggleBtn"
              class="px-2.5 py-1.5 rounded-[6px] border border-[#262932] bg-[#15171d] hover:bg-[#1b1e25] text-[12px] font-medium text-[#9ca3af] hover:text-[#d1d5db] state-transition"
              title="Toggle Saturday classes">
              <span id="weekendToggleLabel">+ Saturday</span>
            </button>

            <!-- Deadlines & Notification Center Button -->
            <button onclick="openTimetableDeadlinesModal()" id="ttDeadlinesBellBtn"
              class="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] border border-[#262932] bg-[#15171d] hover:bg-[#1b1e25] text-[12px] font-medium text-[#d1d5db] state-transition"
              title="Upcoming academic deadlines & notification center">
              <svg class="w-3.5 h-3.5 text-[#f59e0b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              <span>Deadlines</span>
              <span id="ttUpcomingDeadlinesCountBadge" class="hidden px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-[#b84a4a] text-white">0</span>
            </button>

            <!-- + Add Deadline Button -->
            <button onclick="openAddDeadlineFromTimetableModal()"
              class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] bg-[#1b1e25] hover:bg-[#222630] border border-[#262932] text-[#f3f4f6] text-[12px] font-medium state-transition"
              title="Track a new assignment or test deadline linked to this timetable">
              <svg class="w-3.5 h-3.5 text-[#f59e0b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>+ Add Deadline</span>
            </button>

            <!-- Quick Paste Text Schedule -->
            <button onclick="openQuickPasteModal()"
              class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] border border-[#262932] bg-[#15171d] hover:bg-[#1b1e25] text-[12px] font-medium text-[#d1d5db] state-transition"
              title="Paste multiple schedule lines (e.g. COS 212 Mon 08:30-10:00 CB 204)">
              <svg class="w-3.5 h-3.5 text-[#f59e0b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Paste Schedule</span>
            </button>

            <!-- Export .ics -->
            <button onclick="exportTimetableICal()"
              class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] border border-[#262932] bg-[#15171d] hover:bg-[#1b1e25] text-[12px] font-medium text-[#d1d5db] state-transition"
              title="Download RFC 5545 iCalendar (.ics) for Google/Apple Calendar without mobile data usage">
              <svg class="w-3.5 h-3.5 text-[#3b5b8c]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              <span>Export .ics</span>
            </button>

            <!-- Add Slot Button -->
            <button onclick="openAddSlotModal()"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-[#3b5b8c] hover:bg-[#466ba3] text-white text-[12px] font-medium state-transition shadow-sm">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              <span>+ Add Class Slot</span>
            </button>
          </div>
        </div>

        <!-- Section 0: PROACTIVE ACADEMIC DEADLINES NOTIFICATION BANNER -->
        <div id="timetableDeadlineAlertBanner" class="hidden bg-[#15171d] border border-[#b84a4a]/40 rounded-[10px] p-3.5 shadow-sm space-y-2.5 state-transition">
          <!-- Dynamically populated by renderTimetableDeadlineAlertBanner() -->
        </div>

        <!-- Section 1: QUICK COURSE CODE ENTRY BAR (INLINE INPUT) -->
        <div class="bg-[#15171d] border border-[#262932] rounded-[10px] p-3.5 space-y-3 shadow-sm">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-[#3b5b8c]"></span>
              <span class="text-[13px] font-semibold text-[#f3f4f6]">Quick Course Code Scheduler</span>
              <span class="text-[11px] text-[#9ca3af] hidden sm:inline">· Type any course code to schedule a weekly lecture, tutorial, or lab</span>
            </div>
            <span class="text-[11px] font-mono text-[#6b7280]">Instant conflict verification</span>
          </div>

          <form id="quickAddSlotForm" onsubmit="handleQuickAddSlot(event)" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-end">
            <!-- Course Code Input -->
            <div class="lg:col-span-3">
              <label class="block text-[11px] font-medium text-[#9ca3af] mb-1">Course Code <span class="text-[#f59e0b]">*</span></label>
              <div class="relative">
                <input type="text" id="quickCourseCode" required placeholder="e.g. COS 212, WTW 158" list="enrolledCourseCodesList"
                  class="w-full bg-[#0f1115] border border-[#262932] rounded-[6px] px-2.5 py-1.5 text-[13px] font-mono uppercase text-[#f3f4f6] placeholder-[#6b7280] focus:outline-none focus:border-[#3b5b8c] state-transition">
                <datalist id="enrolledCourseCodesList"></datalist>
              </div>
            </div>

            <!-- Day of Week -->
            <div class="lg:col-span-2">
              <label class="block text-[11px] font-medium text-[#9ca3af] mb-1">Day of Week <span class="text-[#f59e0b]">*</span></label>
              <select id="quickDayOfWeek" required
                class="w-full bg-[#0f1115] border border-[#262932] rounded-[6px] px-2.5 py-1.5 text-[13px] text-[#f3f4f6] focus:outline-none focus:border-[#3b5b8c]">
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
              </select>
            </div>

            <!-- Start Time -->
            <div class="lg:col-span-2">
              <label class="block text-[11px] font-medium text-[#9ca3af] mb-1">Start Time <span class="text-[#f59e0b]">*</span></label>
              <input type="time" id="quickStartTime" required value="08:30"
                class="w-full bg-[#0f1115] border border-[#262932] rounded-[6px] px-2.5 py-1.5 text-[13px] text-[#f3f4f6] focus:outline-none focus:border-[#3b5b8c]">
            </div>

            <!-- End Time with duration helper -->
            <div class="lg:col-span-2">
              <div class="flex items-center justify-between mb-1">
                <label class="text-[11px] font-medium text-[#9ca3af]">End Time <span class="text-[#f59e0b]">*</span></label>
                <div class="flex items-center gap-1 text-[10px] text-[#3b5b8c]">
                  <button type="button" onclick="setQuickDuration(45)" class="hover:underline">45m</button>
                  <span>·</span>
                  <button type="button" onclick="setQuickDuration(90)" class="hover:underline">90m</button>
                  <span>·</span>
                  <button type="button" onclick="setQuickDuration(120)" class="hover:underline">2h</button>
                </div>
              </div>
              <input type="time" id="quickEndTime" required value="10:00"
                class="w-full bg-[#0f1115] border border-[#262932] rounded-[6px] px-2.5 py-1.5 text-[13px] text-[#f3f4f6] focus:outline-none focus:border-[#3b5b8c]">
            </div>

            <!-- Campus Venue / Room -->
            <div class="lg:col-span-2">
              <label class="block text-[11px] font-medium text-[#9ca3af] mb-1">Campus Venue</label>
              <input type="text" id="quickVenue" placeholder="e.g. CB 204, IT Lab 3"
                class="w-full bg-[#0f1115] border border-[#262932] rounded-[6px] px-2.5 py-1.5 text-[13px] text-[#f3f4f6] placeholder-[#6b7280] focus:outline-none focus:border-[#3b5b8c]">
            </div>

            <!-- Submit Button -->
            <div class="lg:col-span-1">
              <button type="submit" id="quickAddSubmitBtn"
                class="w-full bg-[#3b5b8c] hover:bg-[#466ba3] text-white py-1.5 px-3 rounded-[6px] text-[13px] font-medium state-transition flex items-center justify-center gap-1 shadow-sm">
                <span>+ Add</span>
              </button>
            </div>
          </form>

          <!-- Quick Session Type & Helper Badges -->
          <div class="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#262932]/60 text-[11px] text-[#9ca3af]">
            <div class="flex items-center gap-1.5">
              <span class="text-[#6b7280]">Session Type:</span>
              <label class="inline-flex items-center gap-1 cursor-pointer">
                <input type="radio" name="quickSessionType" value="Lecture" checked class="text-[#3b5b8c]">
                <span>Lecture</span>
              </label>
              <label class="inline-flex items-center gap-1 cursor-pointer">
                <input type="radio" name="quickSessionType" value="Practical" class="text-[#3b5b8c]">
                <span>Practical / Lab</span>
              </label>
              <label class="inline-flex items-center gap-1 cursor-pointer">
                <input type="radio" name="quickSessionType" value="Tutorial" class="text-[#3b5b8c]">
                <span>Tutorial</span>
              </label>
              <label class="inline-flex items-center gap-1 cursor-pointer">
                <input type="radio" name="quickSessionType" value="Seminar" class="text-[#3b5b8c]">
                <span>Seminar</span>
              </label>
            </div>
            <div class="flex items-center gap-1.5 font-mono text-[#6b7280]">
              <span>Tip: Click any empty timeslot on the weekly calendar to schedule directly</span>
            </div>
          </div>
        </div>

        <!-- Section 2: COURSE CODE FILTER CHIPS & SCHEDULE STATS STRIP -->
        <div class="bg-[#15171d] border border-[#262932] rounded-[10px] p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <!-- Course Code Filter Chips -->
          <div class="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0" id="timetableCourseFilterChips">
            <button onclick="filterByCourseCode('ALL')" id="courseFilter-ALL"
              class="course-filter-btn px-2.5 py-1 rounded-[6px] bg-[#1b1e25] text-[#f3f4f6] font-medium border border-[#262932] text-[12px] whitespace-nowrap state-transition">
              All Courses
            </button>
            <!-- Dynamically populated course chips -->
          </div>

          <!-- Weekly Schedule Health & Metrics -->
          <div class="flex items-center gap-4 shrink-0 text-[12px] font-mono border-t md:border-t-0 border-[#262932] pt-2 md:pt-0">
            <div class="flex items-center gap-1.5">
              <span class="text-[#6b7280]">Weekly:</span>
              <span id="ttTotalHours" class="font-semibold text-[#f3f4f6]">0 hrs</span>
            </div>
            <span class="text-[#262932]">|</span>
            <div class="flex items-center gap-1.5">
              <span class="text-[#6b7280]">Sessions:</span>
              <span id="ttTotalSessions" class="font-semibold text-[#f3f4f6]">0</span>
            </div>
            <span class="text-[#262932]">|</span>
            <div id="ttClashStatusBadge" class="flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-[#3e885b]/20 text-[#3e885b] font-semibold text-[11px]">
              <span class="w-1.5 h-1.5 rounded-full bg-[#3e885b]"></span>
              <span>Conflict-Free</span>
            </div>
          </div>
        </div>

        <!-- Section 3: CLASH & TRANSIT INSPECTOR CARD -->
        <div id="timetableClashCard" class="bg-[#15171d] border border-[#262932] rounded-[10px] p-3.5 space-y-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-[#3e885b]"></span>
              <span class="text-[13px] font-medium text-[#f3f4f6]">Schedule Clash Inspector</span>
            </div>
            <span class="text-[11px] text-[#3e885b] font-medium">Auditing timetable...</span>
          </div>
        </div>

        <!-- ==================================================== -->
        <!-- MODE A: VISUAL WEEKLY CALENDAR GRID (PRIMARY VIEW)   -->
        <!-- ==================================================== -->
        <div id="timetableGridView" class="space-y-2">
          <div class="bg-[#15171d] border border-[#262932] rounded-[10px] overflow-hidden shadow-sm">
            <!-- Weekly Grid Scrollable Container -->
            <div class="overflow-x-auto">
              <div id="timetableGridWrapper" class="min-w-[760px] select-none">
                
                <!-- Grid Days Header Row -->
                <div class="grid grid-cols-12 border-b border-[#262932] bg-[#121419] sticky top-0 z-20" id="timetableGridHeader">
                  <!-- Time column header -->
                  <div class="col-span-1 py-2.5 px-2 text-center text-[11px] font-mono text-[#6b7280] border-r border-[#262932]">
                    Time
                  </div>
                  <!-- Day Headers: dynamically injected (Monday - Friday / Saturday) -->
                  <div id="gridDayHeaders" class="col-span-11 grid grid-cols-5 divide-x divide-[#262932]">
                    <!-- Monday to Friday injected by script -->
                  </div>
                </div>

                <!-- Grid Body (Time Rows & Slot Overlay Canvas) -->
                <div class="relative bg-[#0f1115]" id="timetableGridBody" style="height: 660px;">
                  <!-- Background hour stripes & grid lines -->
                  <div id="gridHourRows" class="absolute inset-0 flex flex-col pointer-events-none">
                    <!-- 11 hour rows from 07:00 to 18:00 injected by script -->
                  </div>

                  <!-- Active Live "Now" Indicator Line -->
                  <div id="gridNowIndicator" class="hidden absolute left-0 right-0 z-10 pointer-events-none flex items-center">
                    <span class="w-2 h-2 rounded-full bg-[#b84a4a] -ml-1"></span>
                    <div class="h-[1.5px] bg-[#b84a4a] w-full"></div>
                    <span class="text-[9px] font-mono text-white bg-[#b84a4a] px-1 rounded-r-[2px]">Now</span>
                  </div>

                  <!-- Day Columns Overlay Container for Slot Cards -->
                  <div class="absolute inset-0 grid grid-cols-12 pointer-events-auto">
                    <!-- Left Time axis labels -->
                    <div class="col-span-1 border-r border-[#262932] flex flex-col justify-between py-1 text-[10px] font-mono text-[#6b7280] text-center select-none" id="gridTimeLabels">
                      <!-- 07:00, 08:00, ... -->
                    </div>

                    <!-- Day Columns (Clickable to add class, houses class cards) -->
                    <div id="gridDayColumns" class="col-span-11 grid grid-cols-5 divide-x divide-[#262932] relative h-full">
                      <!-- 5 day columns (Mon-Fri) -->
                    </div>
                  </div>
                </div>

              </div>
            </div>

            <!-- Calendar Grid Footer Hints -->
            <div class="p-2.5 bg-[#121419] border-t border-[#262932] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6b7280]">
              <div class="flex items-center gap-3">
                <span class="flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-[#3b5b8c]"></span>
                  <span>Click class card for details &amp; edit</span>
                </span>
                <span class="flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-[#10b981]"></span>
                  <span>Click empty cell to schedule</span>
                </span>
                <span class="flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-[#b84a4a]"></span>
                  <span>Red border indicates schedule clash</span>
                </span>
              </div>
              <div class="font-mono">
                Campus Timezone: SAST (UTC+2)
              </div>
            </div>
          </div>
        </div>

        <!-- ==================================================== -->
        <!-- MODE B: DAY AGENDA LIST VIEW                         -->
        <!-- ==================================================== -->
        <div id="timetableAgendaView" class="hidden space-y-4">
          <!-- Day Filter Selector for Agenda -->
          <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-[12px]">
            <button onclick="filterTimetableDay('ALL')" id="dayFilter-ALL"
              class="day-filter-btn px-3 py-1 rounded-[6px] bg-[#1b1e25] text-[#f3f4f6] font-medium border border-[#262932]">All Week</button>
            <button onclick="filterTimetableDay(1)" id="dayFilter-1"
              class="day-filter-btn px-3 py-1 rounded-[6px] bg-[#15171d] text-[#9ca3af] hover:text-[#d1d5db] border border-transparent">Monday</button>
            <button onclick="filterTimetableDay(2)" id="dayFilter-2"
              class="day-filter-btn px-3 py-1 rounded-[6px] bg-[#15171d] text-[#9ca3af] hover:text-[#d1d5db] border border-transparent">Tuesday</button>
            <button onclick="filterTimetableDay(3)" id="dayFilter-3"
              class="day-filter-btn px-3 py-1 rounded-[6px] bg-[#15171d] text-[#9ca3af] hover:text-[#d1d5db] border border-transparent">Wednesday</button>
            <button onclick="filterTimetableDay(4)" id="dayFilter-4"
              class="day-filter-btn px-3 py-1 rounded-[6px] bg-[#15171d] text-[#9ca3af] hover:text-[#d1d5db] border border-transparent">Thursday</button>
            <button onclick="filterTimetableDay(5)" id="dayFilter-5"
              class="day-filter-btn px-3 py-1 rounded-[6px] bg-[#15171d] text-[#9ca3af] hover:text-[#d1d5db] border border-transparent">Friday</button>
            <button onclick="filterTimetableDay(6)" id="dayFilter-6"
              class="day-filter-btn px-3 py-1 rounded-[6px] bg-[#15171d] text-[#9ca3af] hover:text-[#d1d5db] border border-transparent">Saturday</button>
          </div>

          <!-- Agenda Slots List Container -->
          <div id="timetableSlotsContainer" class="space-y-3">
            <!-- Dynamically populated -->
          </div>
        </div>

      </section>

      <!-- ==================================================== -->
      <!-- MODAL: QUICK PASTE & PARSE TEXT TIMETABLE            -->
      <!-- ==================================================== -->
      <div id="quickPasteModalOverlay" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs hidden flex items-center justify-center p-4">
        <div class="w-full max-w-[540px] bg-[#15171d] border border-[#262932] rounded-[10px] p-5 space-y-4 shadow-xl">
          <div class="flex items-center justify-between pb-2 border-b border-[#262932]">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-[2px] bg-[#f59e0b]"></span>
              <h3 class="text-[16px] font-semibold text-[#f3f4f6]">Paste Course Timetable Schedule</h3>
            </div>
            <button onclick="closeQuickPasteModal()" class="w-7 h-7 rounded-[6px] hover:bg-[#1b1e25] text-[#9ca3af] hover:text-[#f3f4f6] flex items-center justify-center state-transition">
              ✕
            </button>
          </div>

          <p class="text-[12px] text-[#9ca3af]">
            Paste syllabus, course outline, or timetable lines. You can input multiple courses at once.
          </p>

          <div class="space-y-2">
            <div class="text-[11px] font-mono text-[#6b7280] bg-[#0f1115] p-2.5 rounded-[6px] border border-[#262932]">
              <div class="text-[#d1d5db] font-semibold mb-1">Recognized formats:</div>
              <div>COS 212 | Mon | 08:30 - 10:00 | MSB 1.22 | Lecture</div>
              <div>INF 214 | Tue | 11:15 - 12:45 | IT Lab 3 | Practical</div>
              <div>WTW 158 | Thu | 14:00 - 15:30 | Centenary 2 | Tutorial</div>
            </div>

            <textarea id="quickPasteText" rows="6" placeholder="Paste your weekly schedule lines here..."
              class="w-full bg-[#0f1115] border border-[#262932] rounded-[6px] p-3 text-[13px] font-mono text-[#f3f4f6] placeholder-[#6b7280] focus:outline-none focus:border-[#3b5b8c]"></textarea>
          </div>

          <div id="quickPastePreview" class="hidden p-2.5 bg-[#1b1e25] rounded-[6px] text-[12px] text-[#d1d5db] border border-[#262932] max-h-36 overflow-y-auto font-mono">
            <!-- Parsed items preview -->
          </div>

          <div class="pt-2 flex items-center justify-between gap-2 border-t border-[#262932]">
            <button type="button" onclick="parseScheduleTextPreview()" class="px-3 py-1.5 rounded-[6px] border border-[#262932] text-[12px] font-medium text-[#d1d5db] hover:bg-[#1b1e25]">
              Preview Parse
            </button>
            <div class="flex items-center gap-2">
              <button type="button" onclick="closeQuickPasteModal()" class="px-3 py-1.5 rounded-[6px] text-[12px] text-[#9ca3af] hover:text-[#d1d5db]">
                Cancel
              </button>
              <button type="button" id="quickPasteSubmitBtn" onclick="handleImportParsedSchedule()" class="bg-[#3b5b8c] hover:bg-[#466ba3] text-white px-3.5 py-1.5 rounded-[6px] text-[12px] font-medium state-transition shadow-sm">
                Import to Schedule
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ==================================================== -->
      <!-- MODAL: SLOT DETAILS & EDIT DRAWER                    -->
      <!-- ==================================================== -->
      <div id="slotDetailModalOverlay" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs hidden flex items-center justify-center p-4">
        <div class="w-full max-w-[440px] bg-[#15171d] border border-[#262932] rounded-[10px] p-5 space-y-4 shadow-xl">
          <div class="flex items-center justify-between pb-2 border-b border-[#262932]">
            <div class="flex items-center gap-2">
              <span id="slotDetailColorBadge" class="w-3 h-3 rounded-[3px] bg-[#3b5b8c]"></span>
              <h3 id="slotDetailCourseCode" class="text-[17px] font-bold font-mono text-[#f3f4f6]">COS 212</h3>
            </div>
            <button onclick="closeSlotDetailModal()" class="w-7 h-7 rounded-[6px] hover:bg-[#1b1e25] text-[#9ca3af] hover:text-[#f3f4f6] flex items-center justify-center state-transition">
              ✕
            </button>
          </div>

          <div class="space-y-3 text-[13px]">
            <div>
              <div class="text-[11px] text-[#9ca3af]">Course Title</div>
              <div id="slotDetailCourseName" class="text-[14px] font-medium text-[#f3f4f6] mt-0.5">Data Structures and Algorithms</div>
            </div>

            <div class="grid grid-cols-2 gap-3 p-3 rounded-[6px] bg-[#0f1115] border border-[#262932]">
              <div>
                <div class="text-[11px] text-[#6b7280]">Day &amp; Time</div>
                <div id="slotDetailDayTime" class="font-mono text-[#f3f4f6] mt-0.5 font-medium">Monday · 08:30 - 10:00</div>
              </div>
              <div>
                <div class="text-[11px] text-[#6b7280]">Duration</div>
                <div id="slotDetailDuration" class="font-mono text-[#f3f4f6] mt-0.5 font-medium">1h 30m</div>
              </div>
            </div>

            <div>
              <div class="text-[11px] text-[#9ca3af]">Campus Venue / Room</div>
              <div class="flex items-center gap-1.5 mt-0.5 text-[#f3f4f6]">
                <svg class="w-4 h-4 text-[#3b5b8c] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                <span id="slotDetailVenue">Science Stadium (WSS 101)</span>
              </div>
            </div>

            <!-- Clash Warning Details if active -->
            <div id="slotDetailClashSection" class="hidden p-2.5 rounded-[6px] bg-[#b84a4a]/10 border border-[#b84a4a]/30 space-y-1">
              <div class="text-[11px] font-semibold text-[#b84a4a] uppercase">Schedule Conflict</div>
              <p id="slotDetailClashText" class="text-[12px] text-[#d1d5db]"></p>
            </div>
          </div>

          <div class="pt-3 flex items-center justify-between border-t border-[#262932]">
            <button type="button" id="slotDetailDeleteBtn" onclick="handleDeleteCurrentSlot()"
              class="px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-[#b84a4a] hover:bg-[#b84a4a]/15 state-transition flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
              <span>Delete Slot</span>
            </button>
            <div class="flex items-center gap-2">
              <button type="button" onclick="closeSlotDetailModal()" class="px-3 py-1.5 rounded-[6px] text-[12px] text-[#9ca3af] hover:text-[#d1d5db]">
                Close
              </button>
              <button type="button" id="slotDetailEditBtn" onclick="openEditSlotModalFromDetail()" class="bg-[#3b5b8c] hover:bg-[#466ba3] text-white px-3 py-1.5 rounded-[6px] text-[12px] font-medium state-transition">
                Edit Slot
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ==================================================== -->
      <!-- MODAL: TIMETABLE ACADEMIC DEADLINES & NOTIFICATIONS  -->
      <!-- ==================================================== -->
      <div id="timetableDeadlinesModalOverlay" class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 hidden flex items-center justify-center p-3 sm:p-4">
        <div class="bg-[#15171d] border border-[#262932] rounded-[12px] max-w-[760px] w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden state-transition">
          
          <!-- Header -->
          <div class="p-4 sm:p-5 border-b border-[#262932] flex items-center justify-between bg-[#121419]">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-[8px] bg-[#f59e0b]/15 border border-[#f59e0b]/30 flex items-center justify-center shrink-0">
                <svg class="w-5 h-5 text-[#f59e0b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
              </div>
              <div>
                <h3 class="text-[16px] font-semibold text-[#f3f4f6]">Academic Deadlines &amp; Notification Center</h3>
                <p class="text-[12px] text-[#9ca3af]">Track assignments, tests, and quizzes linked directly with your campus timetable</p>
              </div>
            </div>
            <button onclick="closeTimetableDeadlinesModal()" class="p-1.5 rounded-[6px] hover:bg-[#1b1e25] text-[#9ca3af] hover:text-[#d1d5db]">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <!-- Quick Stats & Notification Dispatch Strip -->
          <div class="p-3.5 bg-[#101216] border-b border-[#262932] flex flex-wrap items-center justify-between gap-3 text-[12px]">
            <!-- Metrics -->
            <div class="flex items-center gap-2.5 font-mono">
              <div class="flex items-center gap-1.5 px-2 py-1 rounded-[4px] bg-[#b84a4a]/15 text-[#f87171] border border-[#b84a4a]/30">
                <span class="w-1.5 h-1.5 rounded-full bg-[#f87171] animate-pulse"></span>
                <span>Critical (&lt;24h): <b id="ttNotifCritCount">0</b></span>
              </div>
              <div class="flex items-center gap-1.5 px-2 py-1 rounded-[4px] bg-[#f59e0b]/15 text-[#fbbf24] border border-[#f59e0b]/30">
                <span>Urgent (&lt;48h): <b id="ttNotifUrgCount">0</b></span>
              </div>
              <div class="text-[#9ca3af]">
                Total: <b id="ttNotifTotalCount" class="text-[#f3f4f6]">0</b>
              </div>
            </div>

            <!-- Action: Run Sweep -->
            <div class="flex items-center gap-2">
              <button onclick="handleSweepTimetableDeadlines()" id="ttSweepNotifsBtn"
                class="flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#1b1e25] hover:bg-[#222630] border border-[#262932] text-[#d1d5db] hover:text-white font-medium state-transition"
                title="Scan all upcoming deadlines and dispatch notifications">
                <svg class="w-3.5 h-3.5 text-[#3b5b8c]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Run Alert Sweep</span>
              </button>
            </div>
          </div>

          <!-- Notification Channel Controls: Browser Push & Audio Chime -->
          <div class="px-4 py-2.5 bg-[#121419] border-b border-[#262932] flex flex-wrap items-center justify-between gap-3 text-[11px]">
            <div class="flex flex-wrap items-center gap-3">
              <!-- Browser Notification Toggle -->
              <div class="flex items-center gap-1.5">
                <span class="text-[#6b7280]">Desktop Push:</span>
                <button onclick="requestBrowserNotificationPermission()" id="ttBrowserPushBtn"
                  class="flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#1b1e25] border border-[#262932] text-[#d1d5db] hover:text-white state-transition font-medium">
                  <span id="ttBrowserPushDot" class="w-1.5 h-1.5 rounded-full bg-[#6b7280]"></span>
                  <span id="ttBrowserPushLabel">Enable Desktop Alerts</span>
                </button>
              </div>

              <!-- Audio Chime Toggle -->
              <div class="flex items-center gap-1.5">
                <span class="text-[#6b7280]">Sound:</span>
                <button onclick="toggleNotificationSound()" id="ttSoundToggleBtn"
                  class="flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#1b1e25] border border-[#262932] text-[#3e885b] state-transition font-medium">
                  <span>🔊 Chime Enabled</span>
                </button>
              </div>
            </div>

            <!-- View Switcher: Deadlines vs History -->
            <div class="flex items-center p-0.5 bg-[#0f1115] border border-[#262932] rounded-[4px]">
              <button onclick="setDeadlinesModalTab('deadlines')" id="ttDeadlinesTabBtn"
                class="px-2 py-0.5 rounded-[3px] text-[11px] font-medium text-[#f3f4f6] bg-[#1b1e25]">
                Upcoming Deadlines
              </button>
              <button onclick="setDeadlinesModalTab('history')" id="ttHistoryTabBtn"
                class="px-2 py-0.5 rounded-[3px] text-[11px] font-medium text-[#9ca3af] hover:text-[#d1d5db]">
                Alert History
              </button>
            </div>
          </div>

          <!-- Body Container: Scrollable List -->
          <div class="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1 min-h-[280px]">
            <!-- Tab 1: Deadlines List -->
            <div id="timetableDeadlinesListContainer" class="space-y-2.5">
              <div class="text-center py-8 text-[#6b7280] text-[13px]">Loading upcoming deadlines...</div>
            </div>

            <!-- Tab 2: Notification History -->
            <div id="timetableNotificationHistoryContainer" class="hidden space-y-2">
              <div class="text-center py-8 text-[#6b7280] text-[13px]">No notification history logged yet.</div>
            </div>
          </div>

          <!-- Footer -->
          <div class="p-3.5 sm:p-4 border-t border-[#262932] flex items-center justify-between bg-[#121419]">
            <button onclick="openAddDeadlineFromTimetableModal()"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-[#1b1e25] hover:bg-[#222630] border border-[#262932] text-[#f3f4f6] text-[12px] font-medium state-transition">
              <svg class="w-3.5 h-3.5 text-[#f59e0b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              <span>+ Add Academic Deadline</span>
            </button>
            <button onclick="closeTimetableDeadlinesModal()"
              class="px-3.5 py-1.5 rounded-[6px] bg-[#3b5b8c] hover:bg-[#466ba3] text-white text-[12px] font-medium state-transition">
              Done
            </button>
          </div>
        </div>
      </div>

      <!-- ==================================================== -->
      <!-- MODAL: ADD ACADEMIC DEADLINE FROM TIMETABLE          -->
      <!-- ==================================================== -->
      <div id="addDeadlineFromTimetableModalOverlay" class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 hidden flex items-center justify-center p-3 sm:p-4">
        <div class="bg-[#15171d] border border-[#262932] rounded-[12px] max-w-[560px] w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden state-transition">
          
          <div class="p-4 sm:p-5 border-b border-[#262932] flex items-center justify-between bg-[#121419]">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-[6px] bg-[#f59e0b]/15 border border-[#f59e0b]/30 flex items-center justify-center">
                <svg class="w-4 h-4 text-[#f59e0b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 class="text-[15px] font-semibold text-[#f3f4f6]">Add Academic Deadline</h3>
                <p class="text-[11px] text-[#9ca3af]">Track an upcoming test, assignment, or practical on your timetable</p>
              </div>
            </div>
            <button onclick="closeAddDeadlineFromTimetableModal()" class="p-1.5 rounded-[6px] hover:bg-[#1b1e25] text-[#9ca3af] hover:text-[#d1d5db]">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <form id="addDeadlineFromTimetableForm" onsubmit="handleAddDeadlineFromTimetable(event)" class="p-4 sm:p-5 overflow-y-auto space-y-4">
            <!-- Course Code -->
            <div>
              <label class="block text-[12px] font-medium text-[#9ca3af] mb-1">Course Code <span class="text-[#f59e0b]">*</span></label>
              <input type="text" id="addDeadlineCourseCode" required placeholder="e.g. COS 212, WTW 158" list="enrolledCourseCodesList"
                class="w-full bg-[#0f1115] border border-[#262932] rounded-[6px] px-3 py-2 text-[13px] font-mono uppercase text-[#f3f4f6] placeholder-[#6b7280] focus:outline-none focus:border-[#3b5b8c]">
            </div>

            <!-- Title -->
            <div>
              <label class="block text-[12px] font-medium text-[#9ca3af] mb-1">Assessment / Deliverable Title <span class="text-[#f59e0b]">*</span></label>
              <input type="text" id="addDeadlineTitle" required placeholder="e.g. Practical 3: Binary Search Trees"
                class="w-full bg-[#0f1115] border border-[#262932] rounded-[6px] px-3 py-2 text-[13px] text-[#f3f4f6] placeholder-[#6b7280] focus:outline-none focus:border-[#3b5b8c]">
            </div>

            <!-- Task Type & Priority Grid -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[12px] font-medium text-[#9ca3af] mb-1">Assessment Type</label>
                <select id="addDeadlineType"
                  class="w-full bg-[#0f1115] border border-[#262932] rounded-[6px] px-3 py-2 text-[13px] text-[#f3f4f6] focus:outline-none focus:border-[#3b5b8c]">
                  <option value="ASSIGNMENT">Assignment</option>
                  <option value="TEST">Semester Test</option>
                  <option value="EXAM">Final Exam</option>
                  <option value="QUIZ">Quiz / Lab Test</option>
                </select>
              </div>
              <div>
                <label class="block text-[12px] font-medium text-[#9ca3af] mb-1">Urgency Priority</label>
                <select id="addDeadlinePriority"
                  class="w-full bg-[#0f1115] border border-[#262932] rounded-[6px] px-3 py-2 text-[13px] text-[#f3f4f6] focus:outline-none focus:border-[#3b5b8c]">
                  <option value="CRITICAL">Critical (Impending)</option>
                  <option value="HIGH" selected>High Priority</option>
                  <option value="MEDIUM">Medium Priority</option>
                  <option value="LOW">Low Priority</option>
                </select>
              </div>
            </div>

            <!-- Due Date and Time with Quick Presets -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-[12px] font-medium text-[#9ca3af]">Due Date &amp; Submission Time <span class="text-[#f59e0b]">*</span></label>
                <!-- Quick Date Presets -->
                <div class="flex items-center gap-1.5 text-[10px] text-[#3b5b8c]">
                  <button type="button" onclick="setDeadlinePreset('tonight')" class="hover:underline">Tonight 23:59</button>
                  <span>·</span>
                  <button type="button" onclick="setDeadlinePreset('tomorrow')" class="hover:underline">Tomorrow 17:00</button>
                  <span>·</span>
                  <button type="button" onclick="setDeadlinePreset('3days')" class="hover:underline">+3 Days</button>
                  <span>·</span>
                  <button type="button" onclick="setDeadlinePreset('1week')" class="hover:underline">+1 Week</button>
                </div>
              </div>
              <input type="datetime-local" id="addDeadlineDueDate" required
                class="w-full bg-[#0f1115] border border-[#262932] rounded-[6px] px-3 py-2 text-[13px] text-[#f3f4f6] focus:outline-none focus:border-[#3b5b8c]">
            </div>

            <!-- DP Weight Percentage -->
            <div>
              <label class="block text-[12px] font-medium text-[#9ca3af] mb-1">DP Mark Weight Contribution (%)</label>
              <input type="number" id="addDeadlineWeight" min="0" max="100" value="15"
                class="w-full bg-[#0f1115] border border-[#262932] rounded-[6px] px-3 py-2 text-[13px] text-[#f3f4f6] focus:outline-none focus:border-[#3b5b8c]">
              <p class="text-[11px] text-[#6b7280] mt-1">Contributes towards course DP subminimum and semester aggregate</p>
            </div>

            <!-- Submit buttons -->
            <div class="pt-3 flex items-center justify-end gap-2.5 border-t border-[#262932]">
              <button type="button" onclick="closeAddDeadlineFromTimetableModal()"
                class="px-3.5 py-2 rounded-[6px] text-[12px] font-medium text-[#9ca3af] hover:text-[#d1d5db]">
                Cancel
              </button>
              <button type="submit" id="addDeadlineSubmitBtn"
                class="bg-[#3b5b8c] hover:bg-[#466ba3] text-white px-4 py-2 rounded-[6px] text-[12px] font-medium state-transition flex items-center gap-1.5 shadow-sm">
                <span>Save &amp; Track Deadline</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- ==================================================== -->
      <!-- MODAL: TIMETABLE DEADLINE DETAIL & INSTANT NOTIFIER  -->
      <!-- ==================================================== -->
      <div id="timetableDeadlineDetailModalOverlay" class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 hidden flex items-center justify-center p-3 sm:p-4">
        <div class="bg-[#15171d] border border-[#262932] rounded-[12px] max-w-[540px] w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden state-transition">
          
          <div class="p-4 sm:p-5 border-b border-[#262932] flex items-center justify-between bg-[#121419]">
            <div class="flex items-center gap-2.5">
              <span id="ttDetailCourseBadge" class="px-2.5 py-1 rounded-[4px] font-mono text-[12px] font-bold text-white bg-[#3b5b8c]">COS 212</span>
              <div>
                <h3 id="ttDetailTitle" class="text-[15px] font-semibold text-[#f3f4f6]">Practical Deliverable</h3>
                <div id="ttDetailCourseName" class="text-[11px] text-[#9ca3af]">Data Structures &amp; Algorithms</div>
              </div>
            </div>
            <button onclick="closeTimetableDeadlineDetail()" class="p-1.5 rounded-[6px] hover:bg-[#1b1e25] text-[#9ca3af] hover:text-[#d1d5db]">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div class="p-4 sm:p-5 overflow-y-auto space-y-4">
            <!-- Countdown & Urgency banner -->
            <div id="ttDetailUrgencyBox" class="p-3.5 rounded-[8px] bg-[#b84a4a]/15 border border-[#b84a4a]/30 flex items-center justify-between">
              <div>
                <div id="ttDetailUrgencyTag" class="text-[11px] font-bold text-[#f87171] uppercase tracking-wide">Critical Impending Deadline</div>
                <div id="ttDetailCountdown" class="text-[14px] font-mono font-bold text-[#f3f4f6] mt-0.5">Due in 14 hours 23 mins</div>
              </div>
              <div id="ttDetailDueDateFormatted" class="text-[12px] font-mono text-[#9ca3af] text-right">Thu, 24 Sep · 23:59</div>
            </div>

            <!-- Metrics Grid -->
            <div class="grid grid-cols-2 gap-3 p-3 bg-[#0f1115] border border-[#262932] rounded-[8px]">
              <div>
                <div class="text-[11px] text-[#6b7280]">DP Weight Contribution</div>
                <div id="ttDetailWeight" class="text-[14px] font-mono font-semibold text-[#f3f4f6] mt-0.5">15%</div>
              </div>
              <div>
                <div class="text-[11px] text-[#6b7280]">Assessment Type</div>
                <div id="ttDetailType" class="text-[14px] font-semibold text-[#f3f4f6] mt-0.5">Assignment</div>
              </div>
            </div>

            <!-- Associated Timetable Class Slots -->
            <div class="space-y-1.5">
              <div class="text-[11px] font-medium text-[#9ca3af]">Timetable Classes for this Course:</div>
              <div id="ttDetailAssociatedSlots" class="space-y-1 text-[12px] text-[#d1d5db]">
                <!-- Injected by script -->
              </div>
            </div>

            <!-- Notification Status Notice -->
            <div class="p-3 rounded-[6px] bg-[#101216] border border-[#262932] flex items-center justify-between text-[12px]">
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-[#f59e0b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                </svg>
                <span id="ttDetailNotificationNotice" class="text-[#9ca3af]">Proactive 24h &amp; 2h reminders active</span>
              </div>
              <button type="button" id="ttDetailDispatchBtn" onclick="handleDetailTriggerNotification()"
                class="px-2.5 py-1 rounded-[4px] bg-[#1b1e25] hover:bg-[#222630] border border-[#262932] text-[#f59e0b] hover:text-[#fbbf24] font-medium state-transition flex items-center gap-1">
                <span>🔔 Trigger Alert</span>
              </button>
            </div>
          </div>

          <div class="p-3.5 sm:p-4 border-t border-[#262932] flex items-center justify-between bg-[#121419]">
            <button type="button" id="ttDetailToggleCompleteBtn" onclick="handleDetailToggleComplete()"
              class="px-3 py-1.5 rounded-[6px] text-[12px] font-medium border border-[#262932] bg-[#1b1e25] text-[#d1d5db] hover:text-white state-transition flex items-center gap-1.5">
              <span>✓ Mark Completed</span>
            </button>
            <button type="button" onclick="closeTimetableDeadlineDetail()"
              class="px-3.5 py-1.5 rounded-[6px] bg-[#3b5b8c] hover:bg-[#466ba3] text-white text-[12px] font-medium state-transition">
              Close
            </button>
          </div>
        </div>
      </div>
  `;
}

export function getTimetableClientScript(): string {
  return `
    // ========================================================
    // ADVANCED CAMPUS TIMETABLE & WEEKLY VISUALIZATION ENGINE
    // ========================================================
    let cachedTimetableSlots = [];
    let cachedTimetableClashes = [];
    let cachedTimetableDeadlines = [];
    let cachedNotificationSettings = {
      lead_hours: [24, 2],
      browser_push_enabled: true,
      sound_enabled: true,
      email_enabled: true,
      min_priority: 'LOW'
    };
    let cachedNotificationLogs = [];
    let activeTimetableDay = 'ALL';
    let activeCourseFilter = 'ALL';
    let timetableCurrentMode = 'grid'; // 'grid' | 'agenda'
    let showSaturday = false;
    let selectedSlotForDetail = null;
    let selectedDeadlineForDetail = null;
    let activeDeadlinesModalTab = 'deadlines'; // 'deadlines' | 'history'
    let notificationSoundEnabled = true;

    const TIMETABLE_DAY_MAP = {
      1: 'Monday',
      2: 'Tuesday',
      3: 'Wednesday',
      4: 'Thursday',
      5: 'Friday',
      6: 'Saturday',
      7: 'Sunday'
    };

    const TIMETABLE_SHORT_DAYS = {
      1: 'Mon',
      2: 'Tue',
      3: 'Wed',
      4: 'Thu',
      5: 'Fri',
      6: 'Sat',
      7: 'Sun'
    };

    const GRID_START_HOUR = 7; // 07:00
    const GRID_END_HOUR = 18;   // 18:00
    const TOTAL_GRID_HOURS = GRID_END_HOUR - GRID_START_HOUR; // 11 hours
    const TOTAL_GRID_MINUTES = TOTAL_GRID_HOURS * 60; // 660 mins

    async function loadTimetableData() {
      try {
        const [slotsRes, clashesRes, deadlinesRes] = await Promise.all([
          apiFetch('/api/v1/academic/timetable'),
          apiFetch('/api/v1/academic/timetable/clashes'),
          apiFetch('/api/v1/academic/timetable/deadlines')
        ]);

        if (slotsRes.ok) {
          cachedTimetableSlots = await slotsRes.json();
        }
        if (clashesRes.ok) {
          const clashData = await clashesRes.json();
          cachedTimetableClashes = clashData.clashes || [];
          renderTimetableClashes(clashData);
        }
        if (deadlinesRes.ok) {
          const dData = await deadlinesRes.json();
          cachedTimetableDeadlines = dData.deadlines || [];
          if (dData.notification_settings) {
            cachedNotificationSettings = dData.notification_settings;
          }
          cachedNotificationLogs = dData.recent_notifications || [];
          renderTimetableDeadlinesBadge(dData);
          renderTimetableDeadlineAlertBanner(cachedTimetableDeadlines);
        }

        // Populate course code datalist and filter chips
        updateCourseCodeDatalist();
        renderCourseFilterChips();
        updateTimetableStats();

        // Render active view mode
        if (timetableCurrentMode === 'grid') {
          renderWeeklyCalendarGrid();
        } else {
          renderTimetableSlots();
        }

        // Update desktop notification button state
        updateBrowserNotificationBtnUI();
      } catch (err) {
        console.error('Failed to load timetable data:', err);
        showToast('Error loading timetable schedule.', 'error');
      }
    }

    function setTimetableMode(mode) {
      timetableCurrentMode = mode;
      const gridView = document.getElementById('timetableGridView');
      const agendaView = document.getElementById('timetableAgendaView');
      const gridBtn = document.getElementById('ttModeGridBtn');
      const agendaBtn = document.getElementById('ttModeAgendaBtn');

      if (mode === 'grid') {
        if (gridView) gridView.classList.remove('hidden');
        if (agendaView) agendaView.classList.add('hidden');
        if (gridBtn) {
          gridBtn.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[12px] font-medium text-[#f3f4f6] bg-[#1b1e25] state-transition';
        }
        if (agendaBtn) {
          agendaBtn.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[12px] font-medium text-[#9ca3af] hover:text-[#d1d5db] state-transition';
        }
        renderWeeklyCalendarGrid();
      } else {
        if (gridView) gridView.classList.add('hidden');
        if (agendaView) agendaView.classList.remove('hidden');
        if (gridBtn) {
          gridBtn.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[12px] font-medium text-[#9ca3af] hover:text-[#d1d5db] state-transition';
        }
        if (agendaBtn) {
          agendaBtn.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[12px] font-medium text-[#f3f4f6] bg-[#1b1e25] state-transition';
        }
        renderTimetableSlots();
      }
    }

    function toggleWeekend() {
      showSaturday = !showSaturday;
      const btnLabel = document.getElementById('weekendToggleLabel');
      if (btnLabel) {
        btnLabel.textContent = showSaturday ? 'Hide Saturday' : '+ Saturday';
      }
      renderWeeklyCalendarGrid();
      renderTimetableSlots();
    }

    function updateCourseCodeDatalist() {
      const datalist = document.getElementById('enrolledCourseCodesList');
      if (!datalist) return;
      datalist.innerHTML = '';

      const modules = (dashboardData && dashboardData.modules) || [];
      const codes = new Set();
      modules.forEach(m => {
        if (m.code) codes.add(m.code);
      });
      cachedTimetableSlots.forEach(s => {
        if (s.module_code) codes.add(s.module_code);
      });

      codes.forEach(code => {
        const opt = document.createElement('option');
        opt.value = code;
        datalist.appendChild(opt);
      });
    }

    function renderCourseFilterChips() {
      const container = document.getElementById('timetableCourseFilterChips');
      if (!container) return;

      const courseCounts = {};
      cachedTimetableSlots.forEach(s => {
        const code = s.module_code || 'GEN';
        courseCounts[code] = (courseCounts[code] || 0) + 1;
      });

      const uniqueCodes = Object.keys(courseCounts).sort();

      let html = 
        '<button onclick="filterByCourseCode(\\'ALL\\')" id="courseFilter-ALL" ' +
        'class="course-filter-btn px-2.5 py-1 rounded-[6px] ' + (activeCourseFilter === 'ALL' ? 'bg-[#1b1e25] text-[#f3f4f6] border-[#3b5b8c]' : 'bg-[#15171d] text-[#9ca3af] border-[#262932]') + ' font-medium border text-[12px] whitespace-nowrap state-transition">' +
        'All Courses (' + cachedTimetableSlots.length + ')' +
        '</button>';

      uniqueCodes.forEach(code => {
        const count = courseCounts[code];
        const isActive = activeCourseFilter === code;
        // find color
        const slot = cachedTimetableSlots.find(s => s.module_code === code);
        const color = (slot && slot.color_code) || '#3b5b8c';

        html += 
          '<button onclick="filterByCourseCode(\\'' + escapeHtml(code) + '\\')" id="courseFilter-' + escapeHtml(code) + '" ' +
          'class="course-filter-btn px-2.5 py-1 rounded-[6px] flex items-center gap-1.5 ' + (isActive ? 'bg-[#1b1e25] text-[#f3f4f6] border-[#3b5b8c]' : 'bg-[#15171d] text-[#9ca3af] border-[#262932]') + ' hover:text-[#d1d5db] border text-[12px] font-mono whitespace-nowrap state-transition">' +
          '<span class="w-2 h-2 rounded-full" style="background-color: ' + color + '"></span>' +
          '<span>' + escapeHtml(code) + ' (' + count + ')</span>' +
          '</button>';
      });

      container.innerHTML = html;
    }

    function filterByCourseCode(code) {
      activeCourseFilter = code;
      renderCourseFilterChips();
      if (timetableCurrentMode === 'grid') {
        renderWeeklyCalendarGrid();
      } else {
        renderTimetableSlots();
      }
    }

    function updateTimetableStats() {
      let totalMinutes = 0;
      cachedTimetableSlots.forEach(s => {
        const start = timeStringToMinutes(s.start_time);
        const end = timeStringToMinutes(s.end_time);
        if (end > start) {
          totalMinutes += (end - start);
        }
      });

      const totalHours = (totalMinutes / 60).toFixed(1);
      const hoursEl = document.getElementById('ttTotalHours');
      const sessionsEl = document.getElementById('ttTotalSessions');
      if (hoursEl) hoursEl.textContent = totalHours + ' hrs';
      if (sessionsEl) sessionsEl.textContent = cachedTimetableSlots.length;

      const badgeEl = document.getElementById('ttClashStatusBadge');
      if (badgeEl) {
        if (cachedTimetableClashes.length === 0) {
          badgeEl.className = 'flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-[#3e885b]/20 text-[#3e885b] font-semibold text-[11px]';
          badgeEl.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#3e885b]"></span><span>Conflict-Free</span>';
        } else {
          badgeEl.className = 'flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-[#b84a4a]/20 text-[#b84a4a] font-semibold text-[11px]';
          badgeEl.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#b84a4a]"></span><span>' + cachedTimetableClashes.length + ' Conflict(s)</span>';
        }
      }
    }

    function timeStringToMinutes(t) {
      if (!t) return 0;
      const parts = t.split(':');
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }

    function minutesToTimeString(m) {
      const h = Math.floor(m / 60).toString().padStart(2, '0');
      const min = (m % 60).toString().padStart(2, '0');
      return h + ':' + min;
    }

    function setQuickDuration(mins) {
      const startVal = document.getElementById('quickStartTime').value;
      if (!startVal) return;
      const startMins = timeStringToMinutes(startVal);
      const endMins = startMins + mins;
      document.getElementById('quickEndTime').value = minutesToTimeString(endMins);
    }

    // ========================================================
    // RENDER: VISUAL WEEKLY CALENDAR GRID
    // ========================================================
    function renderWeeklyCalendarGrid() {
      const daysCount = showSaturday ? 6 : 5;
      const dayList = [];
      for (let i = 1; i <= daysCount; i++) {
        dayList.push(i);
      }

      // 1. Render Headers
      const headerContainer = document.getElementById('gridDayHeaders');
      if (headerContainer) {
        headerContainer.className = 'col-span-11 grid grid-cols-' + daysCount + ' divide-x divide-[#262932]';
        let headerHtml = '';
        const todayDayOfWeek = new Date().getDay(); // 0 is Sunday, 1 is Monday

        dayList.forEach(dayNum => {
          const dayName = TIMETABLE_SHORT_DAYS[dayNum];
          const isToday = (todayDayOfWeek === dayNum);
          const count = cachedTimetableSlots.filter(s => s.day_of_week === dayNum).length;

          // Find deadlines due on this day of week
          const dayDeadlines = (cachedTimetableDeadlines || []).filter(d => !d.is_completed && d.day_of_week === dayNum);
          let deadlineHtml = '';
          if (dayDeadlines.length > 0) {
            deadlineHtml = '<div class="mt-1.5 space-y-1">';
            dayDeadlines.slice(0, 2).forEach(d => {
              const isCrit = d.urgency === 'CRITICAL' || d.urgency === 'OVERDUE';
              deadlineHtml += 
                '<button onclick="event.stopPropagation(); openTimetableDeadlineDetail(\\'' + escapeHtml(d.id) + '\\')" ' +
                'class="w-full text-left truncate px-1.5 py-0.5 rounded-[4px] ' + (isCrit ? 'bg-[#b84a4a]/25 border border-[#b84a4a]/50 text-[#f87171]' : 'bg-[#f59e0b]/20 border border-[#f59e0b]/40 text-[#fbbf24]') + ' text-[10px] font-medium flex items-center justify-between hover:brightness-110 state-transition shadow-sm" title="' + escapeHtml(d.title) + ' - Due ' + escapeHtml(d.due_date_formatted) + '">' +
                  '<span class="truncate">⏳ ' + escapeHtml(d.module_code) + ': ' + escapeHtml(d.title) + '</span>' +
                  '<span class="font-mono text-[9px] ml-1 shrink-0">' + escapeHtml(d.due_date.substring(11, 16)) + '</span>' +
                '</button>';
            });
            if (dayDeadlines.length > 2) {
              deadlineHtml += '<button onclick="event.stopPropagation(); openTimetableDeadlinesModal()" class="text-[9px] text-[#9ca3af] hover:text-[#d1d5db] font-mono">+' + (dayDeadlines.length - 2) + ' more deadlines</button>';
            }
            deadlineHtml += '</div>';
          }

          headerHtml += 
            '<div class="py-2.5 px-2 text-center ' + (isToday ? 'bg-[#1b1e25]/60' : '') + '">' +
              '<div class="flex items-center justify-center gap-1.5">' +
                '<span class="text-[13px] font-semibold ' + (isToday ? 'text-[#3b5b8c]' : 'text-[#f3f4f6]') + '">' + dayName + '</span>' +
                (isToday ? '<span class="text-[9px] px-1 py-0.2 rounded-[2px] bg-[#3b5b8c] text-white font-mono">Today</span>' : '') +
              '</div>' +
              '<div class="text-[11px] text-[#6b7280] mt-0.5">' + count + ' ' + (count === 1 ? 'class' : 'classes') + '</div>' +
              deadlineHtml +
            '</div>';
        });
        headerContainer.innerHTML = headerHtml;
      }

      // 2. Render Time Axis labels on the left
      const timeLabelsEl = document.getElementById('gridTimeLabels');
      if (timeLabelsEl) {
        let labelsHtml = '';
        for (let h = GRID_START_HOUR; h <= GRID_END_HOUR; h++) {
          const hourText = h.toString().padStart(2, '0') + ':00';
          labelsHtml += '<div>' + hourText + '</div>';
        }
        timeLabelsEl.innerHTML = labelsHtml;
      }

      // 3. Render Background Hour Stripes
      const hourRowsEl = document.getElementById('gridHourRows');
      if (hourRowsEl) {
        let rowsHtml = '';
        for (let h = GRID_START_HOUR; h < GRID_END_HOUR; h++) {
          rowsHtml += 
            '<div class="flex-1 border-b border-[#262932]/40 relative flex flex-col justify-center">' +
              '<div class="border-b border-[#262932]/15 w-full"></div>' +
            '</div>';
        }
        hourRowsEl.innerHTML = rowsHtml;
      }

      // 4. Render Day Columns & Slot Cards
      const columnsContainer = document.getElementById('gridDayColumns');
      if (!columnsContainer) return;
      columnsContainer.className = 'col-span-11 grid grid-cols-' + daysCount + ' divide-x divide-[#262932] relative h-full';

      let colsHtml = '';
      dayList.forEach(dayNum => {
        colsHtml += '<div class="relative h-full day-grid-column" data-day="' + dayNum + '" onclick="handleGridColumnClick(event, ' + dayNum + ')">';

        // Get slots for this day
        let daySlots = cachedTimetableSlots.filter(s => s.day_of_week === dayNum);
        if (activeCourseFilter !== 'ALL') {
          daySlots = daySlots.filter(s => (s.module_code || '').toUpperCase() === activeCourseFilter.toUpperCase());
        }

        daySlots.forEach(slot => {
          const startMins = timeStringToMinutes(slot.start_time);
          const endMins = timeStringToMinutes(slot.end_time);

          // Calculate vertical position percentage relative to 07:00 -> 18:00
          const gridStartMins = GRID_START_HOUR * 60;
          const topPercent = Math.max(0, Math.min(100, ((startMins - gridStartMins) / TOTAL_GRID_MINUTES) * 100));
          const durationMins = Math.max(25, endMins - startMins);
          const heightPercent = Math.max(4, Math.min(100 - topPercent, (durationMins / TOTAL_GRID_MINUTES) * 100));

          // Check if this slot has a clash
          const hasClash = cachedTimetableClashes.some(c => 
            (c.slot_a && c.slot_a.id === slot.id) || (c.slot_b && c.slot_b.id === slot.id)
          );

          const color = slot.color_code || '#3b5b8c';
          const code = slot.module_code || 'GEN';
          const name = slot.module_name || 'Class';
          const venue = slot.venue || 'Campus Hall';

          colsHtml += 
            '<div onclick="event.stopPropagation(); openSlotDetailModal(\\'' + escapeHtml(slot.id) + '\\')" ' +
              'class="absolute left-1 right-1 rounded-[6px] p-1.5 text-left border cursor-pointer select-none transition-all hover:scale-[1.01] hover:z-30 overflow-hidden shadow-sm ' + 
              (hasClash ? 'border-[#b84a4a] ring-1 ring-[#b84a4a]/40 animate-pulse' : 'border-[#262932] hover:border-[#3b5b8c]') + '" ' +
              'style="top: ' + topPercent.toFixed(2) + '%; height: ' + heightPercent.toFixed(2) + '%; background-color: ' + color + '22; border-left: 3.5px solid ' + color + ';" ' +
              'title="' + escapeHtml(code + ': ' + name + ' (' + slot.start_time.substring(0, 5) + ' - ' + slot.end_time.substring(0, 5) + ') @ ' + venue) + '">' +
              
              '<div class="flex items-center justify-between gap-1 leading-tight">' +
                '<span class="text-[11px] font-mono font-bold text-[#f3f4f6] truncate">' + escapeHtml(code) + '</span>' +
                (hasClash ? '<span class="text-[9px] px-1 py-0.2 rounded bg-[#b84a4a] text-white font-mono font-bold">CLASH</span>' : '') +
              '</div>' +

              '<div class="text-[10px] font-mono text-[#d1d5db] truncate mt-0.5">' + 
                escapeHtml(slot.start_time.substring(0, 5)) + ' - ' + escapeHtml(slot.end_time.substring(0, 5)) +
              '</div>' +

              (heightPercent > 8 ? 
                ('<div class="text-[10px] text-[#9ca3af] truncate flex items-center gap-1 mt-0.5">' +
                  '<svg class="w-3 h-3 text-[#6b7280] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">' +
                    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>' +
                  '</svg>' +
                  '<span>' + escapeHtml(venue) + '</span>' +
                '</div>') : '') +

            '</div>';
        });

        colsHtml += '</div>';
      });

      columnsContainer.innerHTML = colsHtml;

      // 5. Update Live "Now" Indicator Line
      updateGridNowIndicator();
    }

    function updateGridNowIndicator() {
      const nowIndicator = document.getElementById('gridNowIndicator');
      if (!nowIndicator) return;

      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const gridStartMins = GRID_START_HOUR * 60;
      const gridEndMins = GRID_END_HOUR * 60;

      if (currentMinutes >= gridStartMins && currentMinutes <= gridEndMins) {
        const percent = ((currentMinutes - gridStartMins) / TOTAL_GRID_MINUTES) * 100;
        nowIndicator.style.top = percent.toFixed(2) + '%';
        nowIndicator.classList.remove('hidden');
      } else {
        nowIndicator.classList.add('hidden');
      }
    }

    function handleGridColumnClick(event, dayNum) {
      // Find approximate hour clicked
      const colEl = event.currentTarget;
      const rect = colEl.getBoundingClientRect();
      const clickY = event.clientY - rect.top;
      const fraction = Math.max(0, Math.min(1, clickY / rect.height));
      const targetMins = (GRID_START_HOUR * 60) + (fraction * TOTAL_GRID_MINUTES);

      // Round down to nearest 30 mins
      const roundedMins = Math.floor(targetMins / 30) * 30;
      const startStr = minutesToTimeString(roundedMins);
      const endStr = minutesToTimeString(roundedMins + 90); // default 90 min class

      // Pre-fill quick add form
      const daySelect = document.getElementById('quickDayOfWeek');
      const startInput = document.getElementById('quickStartTime');
      const endInput = document.getElementById('quickEndTime');
      if (daySelect) daySelect.value = dayNum;
      if (startInput) startInput.value = startStr;
      if (endInput) endInput.value = endStr;

      // Focus course code input
      const codeInput = document.getElementById('quickCourseCode');
      if (codeInput) {
        codeInput.focus();
        showToast('Selected ' + TIMETABLE_DAY_MAP[dayNum] + ' at ' + startStr + '. Enter course code to schedule.');
      }
    }

    // ========================================================
    // RENDER: DAY AGENDA LIST VIEW
    // ========================================================
    function renderTimetableSlots() {
      const container = document.getElementById('timetableSlotsContainer');
      if (!container) return;

      let slots = cachedTimetableSlots;
      if (activeTimetableDay !== 'ALL') {
        const dayNum = Number(activeTimetableDay);
        slots = slots.filter(s => s.day_of_week === dayNum);
      }
      if (activeCourseFilter !== 'ALL') {
        slots = slots.filter(s => (s.module_code || '').toUpperCase() === activeCourseFilter.toUpperCase());
      }

      if (slots.length === 0) {
        container.innerHTML = 
          '<div class="p-8 text-center bg-[#15171d] border border-[#262932] rounded-[10px] space-y-2">' +
            '<div class="text-[14px] font-medium text-[#f3f4f6]">No class sessions scheduled' + (activeTimetableDay !== 'ALL' ? (' for ' + (TIMETABLE_DAY_MAP[activeTimetableDay] || 'this day')) : '') + '</div>' +
            '<p class="text-[12px] text-[#9ca3af]">Use the Quick Course Code Scheduler above to add lectures, tutorials, or computer labs.</p>' +
            '<button onclick="openAddSlotModal()" class="mt-2 px-3 py-1.5 rounded-[6px] bg-[#3b5b8c] hover:bg-[#466ba3] text-white text-[12px] font-medium state-transition">+ Add First Class Slot</button>' +
          '</div>';
        return;
      }

      // Group by day of week
      const byDay = {};
      slots.forEach(s => {
        if (!byDay[s.day_of_week]) byDay[s.day_of_week] = [];
        byDay[s.day_of_week].push(s);
      });

      let html = '';
      const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);

      days.forEach(day => {
        const daySlots = byDay[day];
        const dayTitle = TIMETABLE_DAY_MAP[day] || ('Day ' + day);

        // Day's academic deadlines
        const dayDeadlines = (cachedTimetableDeadlines || []).filter(d => d.day_of_week === day);
        let dayDeadlinesHtml = '';
        if (dayDeadlines.length > 0) {
          dayDeadlinesHtml = 
            '<div class="p-2.5 rounded-[8px] bg-[#101216] border border-[#f59e0b]/30 space-y-2 mb-2">' +
              '<div class="flex items-center justify-between">' +
                '<span class="text-[11px] font-bold text-[#f59e0b] uppercase tracking-wider flex items-center gap-1.5">' +
                  '<span>⚠️ Deadlines Due on ' + escapeHtml(dayTitle) + '</span>' +
                '</span>' +
                '<span class="text-[10px] text-[#9ca3af] font-mono">' + dayDeadlines.length + ' deadline' + (dayDeadlines.length === 1 ? '' : 's') + '</span>' +
              '</div>' +
              '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">';

          dayDeadlines.forEach(d => {
            const isCrit = d.urgency === 'CRITICAL' || d.urgency === 'OVERDUE';
            dayDeadlinesHtml += 
              '<div class="flex items-center justify-between p-2 rounded-[6px] ' + (d.is_completed ? 'bg-[#1b1e25]/40 border border-[#262932] opacity-60' : isCrit ? 'bg-[#b84a4a]/15 border border-[#b84a4a]/40' : 'bg-[#1b1e25] border border-[#262932]') + '">' +
                '<div class="flex items-center gap-2 truncate cursor-pointer flex-1 min-w-0" onclick="openTimetableDeadlineDetail(\\'' + escapeHtml(d.id) + '\\')">' +
                  '<span class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded text-white shrink-0" style="background-color: ' + (d.color_code || '#3b5b8c') + '">' + escapeHtml(d.module_code) + '</span>' +
                  '<div class="truncate">' +
                    '<div class="text-[12px] font-medium ' + (d.is_completed ? 'line-through text-[#9ca3af]' : 'text-[#f3f4f6]') + ' truncate">' + escapeHtml(d.title) + '</div>' +
                    '<div class="text-[10px] text-[#6b7280] font-mono">Due ' + escapeHtml(d.due_date_formatted) + ' · ' + (d.weight_percentage || 0) + '% DP</div>' +
                  '</div>' +
                '</div>' +
                '<div class="flex items-center gap-1 shrink-0 ml-2" onclick="event.stopPropagation()">' +
                  (!d.is_completed ? '<button onclick="handleTriggerDeadlineNotification(\\'' + escapeHtml(d.id) + '\\')" class="p-1 rounded text-[#f59e0b] hover:bg-[#f59e0b]/20 text-[11px]" title="Trigger Alert Now">🔔</button>' : '') +
                  '<button onclick="handleToggleDeadlineComplete(\\'' + escapeHtml(d.id) + '\\', ' + d.is_completed + ')" class="px-1.5 py-0.5 rounded text-[11px] font-medium ' + (d.is_completed ? 'bg-[#3e885b]/20 text-[#3e885b]' : 'bg-[#262932] text-[#9ca3af] hover:text-white') + '" title="' + (d.is_completed ? 'Mark Incomplete' : 'Mark Complete') + '">' + (d.is_completed ? '✓ Done' : 'Complete') + '</button>' +
                '</div>' +
              '</div>';
          });
          dayDeadlinesHtml += '</div></div>';
        }

        html += 
          '<div class="bg-[#15171d] border border-[#262932] rounded-[10px] p-4 space-y-3">' +
            '<div class="flex items-center justify-between pb-2 border-b border-[#262932]">' +
              '<div class="flex items-center gap-2">' +
                '<h3 class="text-[15px] font-semibold text-[#f3f4f6]">' + escapeHtml(dayTitle) + '</h3>' +
                '<span class="text-[11px] px-2 py-0.5 rounded-[4px] bg-[#1b1e25] text-[#9ca3af] font-mono font-medium">' + daySlots.length + ' sessions</span>' +
              '</div>' +
              '<button onclick="openAddSlotModal(' + day + ')" class="text-[11px] text-[#3b5b8c] hover:underline font-medium">+ Add to ' + escapeHtml(dayTitle) + '</button>' +
            '</div>' +
            dayDeadlinesHtml +
            '<div class="space-y-2.5">';

        daySlots.forEach(s => {
          const color = s.color_code || '#3b5b8c';
          const hasClash = cachedTimetableClashes.some(c => 
            (c.slot_a && c.slot_a.id === s.id) || (c.slot_b && c.slot_b.id === s.id)
          );

          html += 
            '<div class="flex items-center justify-between p-3.5 rounded-[8px] bg-[#101216] border border-[#262932] state-transition hover:border-[#3b5b8c]/50 cursor-pointer" ' +
              'onclick="openSlotDetailModal(\\'' + escapeHtml(s.id) + '\\')">' +
              '<div class="flex items-start gap-3.5">' +
                '<div class="shrink-0 text-center min-w-[70px] pt-0.5">' +
                  '<div class="text-[13px] font-mono font-semibold text-[#f3f4f6]">' + escapeHtml(s.start_time.substring(0, 5)) + '</div>' +
                  '<div class="text-[11px] text-[#6b7280] font-mono">' + escapeHtml(s.end_time.substring(0, 5)) + '</div>' +
                '</div>' +
                '<div class="space-y-1">' +
                  '<div class="flex items-center gap-2">' +
                    '<span class="text-[12px] font-mono font-bold px-2 py-0.5 rounded-[4px] text-white" style="background-color: ' + color + '">' + escapeHtml(s.module_code) + '</span>' +
                    '<span class="text-[13px] font-medium text-[#f3f4f6]">' + escapeHtml(s.module_name) + '</span>' +
                    (hasClash ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-[#b84a4a] text-white font-mono font-bold">CLASH</span>' : '') +
                  '</div>' +
                  '<div class="flex items-center gap-1.5 text-[12px] text-[#9ca3af]">' +
                    '<svg class="w-3.5 h-3.5 text-[#6b7280] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">' +
                      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>' +
                      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>' +
                    '</svg>' +
                    '<span>' + escapeHtml(s.venue || 'Campus Venue') + '</span>' +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div class="flex items-center gap-1.5 shrink-0" onclick="event.stopPropagation()">' +
                '<button onclick="handleDeleteSlot(\\'' + escapeHtml(s.id) + '\\')" class="p-2 rounded hover:text-[#b84a4a] hover:bg-[#b84a4a]/15 text-[#6b7280] state-transition" title="Delete slot">' +
                  '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">' +
                    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>' +
                  '</svg>' +
                '</button>' +
              '</div>' +
            '</div>';
        });

        html += '</div></div>';
      });

      container.innerHTML = html;
    }

    function filterTimetableDay(day) {
      activeTimetableDay = day;
      document.querySelectorAll('.day-filter-btn').forEach(btn => {
        btn.className = 'day-filter-btn px-3 py-1 rounded-[6px] bg-[#15171d] text-[#9ca3af] hover:text-[#d1d5db] border border-transparent';
      });
      const activeBtn = document.getElementById('dayFilter-' + day);
      if (activeBtn) {
        activeBtn.className = 'day-filter-btn px-3 py-1 rounded-[6px] bg-[#1b1e25] text-[#f3f4f6] font-medium border border-[#262932]';
      }
      renderTimetableSlots();
    }

    function renderTimetableClashes(data) {
      const card = document.getElementById('timetableClashCard');
      const railBadge = document.getElementById('railClashBadge');
      if (!card) return;

      const totalClashes = data.clash_count || 0;
      const criticalCount = data.critical_clashes || 0;
      const warningCount = data.transit_warnings || 0;

      if (railBadge) {
        if (criticalCount > 0) {
          railBadge.textContent = criticalCount + ' Clash';
          railBadge.className = 'text-[10px] px-1.5 py-0.5 rounded-[4px] bg-[#b84a4a] text-white font-mono font-semibold';
          railBadge.classList.remove('hidden');
        } else if (warningCount > 0) {
          railBadge.textContent = warningCount + ' Warn';
          railBadge.className = 'text-[10px] px-1.5 py-0.5 rounded-[4px] bg-[#f59e0b] text-black font-mono font-semibold';
          railBadge.classList.remove('hidden');
        } else {
          railBadge.classList.add('hidden');
        }
      }

      if (totalClashes === 0) {
        card.innerHTML = 
          '<div class="flex items-center justify-between">' +
            '<div class="flex items-center gap-2">' +
              '<span class="w-2 h-2 rounded-full bg-[#3e885b]"></span>' +
              '<span class="text-[13px] font-medium text-[#f3f4f6]">Schedule Clash Inspector</span>' +
            '</div>' +
            '<span class="text-[11px] text-[#3e885b] font-medium">All sessions conflict-free</span>' +
          '</div>' +
          '<p class="text-[12px] text-[#9ca3af] mt-1">' +
            'Sweep-line interval analysis verified ' + (data.total_slots || 0) + ' weekly lectures and practicals with safe transit buffers between campus venues.' +
          '</p>';
        return;
      }

      let html = 
        '<div class="flex items-center justify-between pb-2 border-b border-[#262932]">' +
          '<div class="flex items-center gap-2">' +
            '<span class="w-2 h-2 rounded-full ' + (criticalCount > 0 ? 'bg-[#b84a4a]' : 'bg-[#f59e0b]') + '"></span>' +
            '<span class="text-[13px] font-semibold text-[#f3f4f6]">Clash &amp; Transit Warnings (' + totalClashes + ')</span>' +
          '</div>' +
          '<span class="text-[11px] font-mono ' + (criticalCount > 0 ? 'text-[#b84a4a]' : 'text-[#f59e0b]') + '">' +
            criticalCount + ' direct overlap, ' + warningCount + ' tight transit' +
          '</span>' +
        '</div>' +
        '<div class="space-y-2 mt-2">';

      data.clashes.forEach(c => {
        const isCritical = c.severity === 'CRITICAL';
        html += 
          '<div class="p-2.5 rounded-[6px] ' + (isCritical ? 'bg-[#b84a4a]/10 border border-[#b84a4a]/30' : 'bg-[#f59e0b]/10 border border-[#f59e0b]/30') + '">' +
            '<div class="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider ' + (isCritical ? 'text-[#b84a4a]' : 'text-[#f59e0b]') + '">' +
              '<span>' + escapeHtml(c.day_name) + ' · ' + (isCritical ? 'Direct Class Overlap' : 'Tight Campus Transit') + '</span>' +
              '<span>' + (isCritical ? (c.overlap_minutes + 'm overlap') : 'Transit alert') + '</span>' +
            '</div>' +
            '<p class="text-[12px] text-[#d1d5db] mt-1 leading-snug">' + escapeHtml(c.message) + '</p>' +
          '</div>';
      });

      html += '</div>';
      card.innerHTML = html;
    }

    // ========================================================
    // ACTION HANDLERS: QUICK ADD SLOT (INLINE FORM)
    // ========================================================
    async function handleQuickAddSlot(e) {
      e.preventDefault();
      const courseCode = document.getElementById('quickCourseCode').value.trim().toUpperCase();
      const dayOfWeek = parseInt(document.getElementById('quickDayOfWeek').value, 10);
      const startTime = document.getElementById('quickStartTime').value;
      const endTime = document.getElementById('quickEndTime').value;
      const venue = document.getElementById('quickVenue').value.trim();

      const sessionRadio = document.querySelector('input[name="quickSessionType"]:checked');
      const sessionType = sessionRadio ? sessionRadio.value : 'Lecture';

      if (!courseCode || !startTime || !endTime) {
        showToast('Please specify course code, start time, and end time.', 'error');
        return;
      }

      const submitBtn = document.getElementById('quickAddSubmitBtn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Saving...</span>';
      }

      try {
        const res = await apiFetch('/api/v1/academic/timetable', {
          method: 'POST',
          body: JSON.stringify({
            course_code: courseCode,
            day_of_week: dayOfWeek,
            start_time: startTime,
            end_time: endTime,
            venue: venue || 'Campus Lecture Hall',
            session_type: sessionType
          })
        });

        if (res.ok) {
          const data = await res.json();
          // Reset course code & venue
          document.getElementById('quickCourseCode').value = '';
          document.getElementById('quickVenue').value = '';

          await loadTimetableData();
          loadDashboardData();

          if (data.has_clash) {
            showToast('Scheduled ' + courseCode + ' (Clash warning: ' + data.clash_warning + ')', 'error');
          } else {
            showToast('Scheduled ' + courseCode + ' on ' + TIMETABLE_DAY_MAP[dayOfWeek] + '!');
          }
        } else {
          const err = await res.json();
          showToast(err.detail || 'Failed to schedule class slot.', 'error');
        }
      } catch (err) {
        console.error('Quick add error:', err);
        showToast('Network error while scheduling class slot.', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>+ Add</span>';
        }
      }
    }

    // ========================================================
    // ACTION HANDLERS: QUICK PASTE TEXT SCHEDULE PARSER
    // ========================================================
    function openQuickPasteModal() {
      document.getElementById('quickPasteModalOverlay').classList.remove('hidden');
    }

    function closeQuickPasteModal() {
      document.getElementById('quickPasteModalOverlay').classList.add('hidden');
    }

    function parseRawTimetableLines(text) {
      const lines = text.split('\\n');
      const parsedSlots = [];
      const dayKeywords = {
        'mon': 1, 'monday': 1,
        'tue': 2, 'tues': 2, 'tuesday': 2,
        'wed': 3, 'wednesday': 3,
        'thu': 4, 'thur': 4, 'thurs': 4, 'thursday': 4,
        'fri': 5, 'friday': 5,
        'sat': 6, 'saturday': 6,
        'sun': 7, 'sunday': 7
      };

      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return;

        // Try pipe format: CODE | DAY | START-END | VENUE | TYPE
        let parts = trimmed.split('|').map(s => s.trim());
        if (parts.length >= 3) {
          const code = parts[0].toUpperCase();
          const dayStr = parts[1].toLowerCase();
          const dayNum = dayKeywords[dayStr] || 1;
          const timePart = parts[2];
          const venue = parts[3] || 'Campus Hall';
          const type = parts[4] || 'Lecture';

          const timeMatch = timePart.match(/(\\d{1,2}:\\d{2})\\s*[-–—to]+\\s*(\\d{1,2}:\\d{2})/i);
          if (timeMatch) {
            parsedSlots.push({
              course_code: code,
              day_of_week: dayNum,
              start_time: timeMatch[1].padStart(5, '0'),
              end_time: timeMatch[2].padStart(5, '0'),
              venue: venue,
              session_type: type
            });
            return;
          }
        }

        // Try freeform regex: e.g. "COS 212 Mon 08:30-10:00 CB 204"
        const regex = /([A-Za-z]{2,4}\\s*\\d{3,4}[A-Za-z]?)\\s+(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday)\\s+(\\d{1,2}:\\d{2})\\s*[-–—to]+\\s*(\\d{1,2}:\\d{2})(?:\\s+(.*))?/i;
        const match = trimmed.match(regex);
        if (match) {
          const code = match[1].replace(/\\s+/g, ' ').toUpperCase();
          const dayStr = match[2].toLowerCase();
          const dayNum = dayKeywords[dayStr] || 1;
          const start = match[3].padStart(5, '0');
          const end = match[4].padStart(5, '0');
          const extra = (match[5] || '').trim();

          parsedSlots.push({
            course_code: code,
            day_of_week: dayNum,
            start_time: start,
            end_time: end,
            venue: extra || 'Campus Hall',
            session_type: 'Lecture'
          });
        }
      });

      return parsedSlots;
    }

    function parseScheduleTextPreview() {
      const text = document.getElementById('quickPasteText').value;
      const parsed = parseRawTimetableLines(text);
      const previewEl = document.getElementById('quickPastePreview');
      if (!previewEl) return;

      if (parsed.length === 0) {
        previewEl.classList.remove('hidden');
        previewEl.innerHTML = '<span class="text-[#b84a4a]">Could not identify valid schedule lines. Check formatting and try again.</span>';
        return;
      }

      let previewHtml = '<div class="text-[#3e885b] font-semibold mb-1">Found ' + parsed.length + ' class session(s):</div>';
      parsed.forEach((s, idx) => {
        previewHtml += '<div>' + (idx + 1) + '. ' + escapeHtml(s.course_code) + ' · ' + TIMETABLE_SHORT_DAYS[s.day_of_week] + ' ' + s.start_time + '-' + s.end_time + ' @ ' + escapeHtml(s.venue) + '</div>';
      });

      previewEl.innerHTML = previewHtml;
      previewEl.classList.remove('hidden');
    }

    async function handleImportParsedSchedule() {
      const text = document.getElementById('quickPasteText').value;
      const parsed = parseRawTimetableLines(text);

      if (parsed.length === 0) {
        showToast('No valid schedule lines found to import.', 'error');
        return;
      }

      const btn = document.getElementById('quickPasteSubmitBtn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Importing...';
      }

      try {
        const res = await apiFetch('/api/v1/academic/timetable/batch', {
          method: 'POST',
          body: JSON.stringify({ slots: parsed })
        });

        if (res.ok) {
          const result = await res.json();
          closeQuickPasteModal();
          document.getElementById('quickPasteText').value = '';
          await loadTimetableData();
          loadDashboardData();
          showToast('Imported ' + result.created_count + ' timetable sessions!');
        } else {
          showToast('Failed to import schedule.', 'error');
        }
      } catch (err) {
        console.error('Import error:', err);
        showToast('Network error during batch schedule import.', 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Import to Schedule';
        }
      }
    }

    // ========================================================
    // SLOT DETAIL & EDIT MODAL
    // ========================================================
    function openSlotDetailModal(slotId) {
      const slot = cachedTimetableSlots.find(s => s.id === slotId);
      if (!slot) return;
      selectedSlotForDetail = slot;

      const modal = document.getElementById('slotDetailModalOverlay');
      if (!modal) return;

      document.getElementById('slotDetailCourseCode').textContent = slot.module_code || 'GEN';
      document.getElementById('slotDetailCourseName').textContent = slot.module_name || 'Class Session';
      document.getElementById('slotDetailColorBadge').style.backgroundColor = slot.color_code || '#3b5b8c';

      const dayName = TIMETABLE_DAY_MAP[slot.day_of_week] || 'Day ' + slot.day_of_week;
      document.getElementById('slotDetailDayTime').textContent = dayName + ' · ' + slot.start_time.substring(0, 5) + ' - ' + slot.end_time.substring(0, 5);

      const startMins = timeStringToMinutes(slot.start_time);
      const endMins = timeStringToMinutes(slot.end_time);
      const durMins = endMins - startMins;
      const durHours = Math.floor(durMins / 60);
      const durRestMins = durMins % 60;
      let durText = '';
      if (durHours > 0) durText += durHours + 'h ';
      if (durRestMins > 0 || durHours === 0) durText += durRestMins + 'm';
      document.getElementById('slotDetailDuration').textContent = durText;

      document.getElementById('slotDetailVenue').textContent = slot.venue || 'Campus Lecture Hall';

      // Check clash
      const clash = cachedTimetableClashes.find(c => 
        (c.slot_a && c.slot_a.id === slot.id) || (c.slot_b && c.slot_b.id === slot.id)
      );

      const clashSection = document.getElementById('slotDetailClashSection');
      const clashText = document.getElementById('slotDetailClashText');
      if (clash && clashSection && clashText) {
        clashSection.classList.remove('hidden');
        clashText.textContent = clash.message;
      } else if (clashSection) {
        clashSection.classList.add('hidden');
      }

      modal.classList.remove('hidden');
    }

    function closeSlotDetailModal() {
      const modal = document.getElementById('slotDetailModalOverlay');
      if (modal) modal.classList.add('hidden');
      selectedSlotForDetail = null;
    }

    async function handleDeleteCurrentSlot() {
      if (!selectedSlotForDetail) return;
      const slotId = selectedSlotForDetail.id;
      closeSlotDetailModal();
      await handleDeleteSlot(slotId);
    }

    function openEditSlotModalFromDetail() {
      if (!selectedSlotForDetail) return;
      const slot = selectedSlotForDetail;
      closeSlotDetailModal();

      // Open add slot modal prefilled with existing info
      openAddSlotModal(slot.day_of_week);

      // Pre-fill fields
      const select = document.getElementById('newSlotModuleSelect');
      if (select && slot.module_id) select.value = slot.module_id;
      const daySelect = document.getElementById('newSlotDaySelect');
      if (daySelect) daySelect.value = slot.day_of_week;
      const startInput = document.getElementById('newSlotStartTime');
      if (startInput) startInput.value = slot.start_time.substring(0, 5);
      const endInput = document.getElementById('newSlotEndTime');
      if (endInput) endInput.value = slot.end_time.substring(0, 5);
      const venueInput = document.getElementById('newSlotVenue');
      if (venueInput) venueInput.value = slot.venue || '';

      // Delete old slot when editing to replace cleanly
      const form = document.getElementById('addSlotForm');
      if (form) {
        form.dataset.replaceSlotId = slot.id;
      }
    }

    // ========================================================
    // STANDARD ADD SLOT MODAL (DROPDOWN / DETAILED)
    // ========================================================
    function toggleModalCourseInputMode() {
      const selectContainer = document.getElementById('modalModuleSelectContainer');
      const customContainer = document.getElementById('modalCourseCodeCustomContainer');
      const btn = document.getElementById('toggleCourseInputModeBtn');
      if (!selectContainer || !customContainer) return;
      const isCustom = selectContainer.classList.contains('hidden');
      if (isCustom) {
        selectContainer.classList.remove('hidden');
        customContainer.classList.add('hidden');
        if (btn) btn.textContent = 'Type course code';
      } else {
        selectContainer.classList.add('hidden');
        customContainer.classList.remove('hidden');
        if (btn) btn.textContent = 'Select enrolled course';
        const input = document.getElementById('newSlotCourseCodeCustom');
        if (input) input.focus();
      }
    }

    function setModalDuration(mins) {
      const startVal = document.getElementById('newSlotStartTime').value;
      if (!startVal) return;
      const startMins = timeStringToMinutes(startVal);
      const endMins = startMins + mins;
      document.getElementById('newSlotEndTime').value = minutesToTimeString(endMins);
    }

    function openAddSlotModal(prefillDay = null) {
      const select = document.getElementById('newSlotModuleSelect');
      if (select) {
        select.innerHTML = '';
        const modules = (dashboardData && dashboardData.modules) || [];
        modules.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = m.code + ' — ' + m.name;
          select.appendChild(opt);
        });
      }

      // Reset to dropdown mode by default if modules exist
      const selectContainer = document.getElementById('modalModuleSelectContainer');
      const customContainer = document.getElementById('modalCourseCodeCustomContainer');
      const btn = document.getElementById('toggleCourseInputModeBtn');
      if (selectContainer && customContainer) {
        const modules = (dashboardData && dashboardData.modules) || [];
        if (modules.length === 0) {
          selectContainer.classList.add('hidden');
          customContainer.classList.remove('hidden');
          if (btn) btn.textContent = 'Select enrolled course';
        } else {
          selectContainer.classList.remove('hidden');
          customContainer.classList.add('hidden');
          if (btn) btn.textContent = 'Type course code';
        }
      }

      if (prefillDay) {
        const daySelect = document.getElementById('newSlotDaySelect');
        if (daySelect) daySelect.value = prefillDay;
      }

      const form = document.getElementById('addSlotForm');
      if (form) delete form.dataset.replaceSlotId;

      document.getElementById('addSlotModalOverlay').classList.remove('hidden');
    }

    function closeAddSlotModal() {
      document.getElementById('addSlotModalOverlay').classList.add('hidden');
      const form = document.getElementById('addSlotForm');
      if (form) delete form.dataset.replaceSlotId;
    }

    async function handleAddSlotSubmit(e) {
      e.preventDefault();
      const form = document.getElementById('addSlotForm');
      const replaceSlotId = form ? form.dataset.replaceSlotId : null;

      const customContainer = document.getElementById('modalCourseCodeCustomContainer');
      const isCustomMode = customContainer && !customContainer.classList.contains('hidden');

      const customCode = document.getElementById('newSlotCourseCodeCustom') ? document.getElementById('newSlotCourseCodeCustom').value.trim() : '';
      const moduleId = document.getElementById('newSlotModuleSelect') ? document.getElementById('newSlotModuleSelect').value : '';

      const dayOfWeek = parseInt(document.getElementById('newSlotDaySelect').value, 10);
      const startTime = document.getElementById('newSlotStartTime').value;
      const endTime = document.getElementById('newSlotEndTime').value;
      const venue = document.getElementById('newSlotVenue').value.trim();

      const sessionRadio = document.querySelector('input[name="modalSessionType"]:checked');
      const sessionType = sessionRadio ? sessionRadio.value : 'Lecture';

      if ((!isCustomMode && !moduleId) || (isCustomMode && !customCode)) {
        showToast('Please select or input a course code.', 'error');
        return;
      }
      if (!startTime || !endTime) {
        showToast('Please fill start and end times.', 'error');
        return;
      }

      const submitBtn = document.getElementById('addSlotSubmitBtn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Scheduling...';
      }

      try {
        if (replaceSlotId) {
          // Delete prior slot
          await apiFetch('/api/v1/academic/timetable/' + replaceSlotId, { method: 'DELETE' });
        }

        const payload = {
          day_of_week: dayOfWeek,
          start_time: startTime,
          end_time: endTime,
          venue: venue || 'Campus Lecture Hall',
          session_type: sessionType
        };

        if (isCustomMode && customCode) {
          payload.course_code = customCode.toUpperCase();
        } else {
          payload.module_id = moduleId;
        }

        const res = await apiFetch('/api/v1/academic/timetable', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const result = await res.json();
          closeAddSlotModal();
          await loadTimetableData();
          loadDashboardData();
          if (result.has_clash) {
            showToast('Slot scheduled with clash warning: ' + result.clash_warning, 'error');
          } else {
            showToast('Class slot scheduled successfully!');
          }
        } else {
          const err = await res.json().catch(() => ({}));
          showToast(err.detail || 'Failed to add timetable slot.', 'error');
        }
      } catch (err) {
        console.error('Failed to add slot:', err);
        showToast('Error saving timetable slot.', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Add to schedule';
        }
      }
    }

    async function handleDeleteSlot(slotId) {
      if (!confirm('Are you sure you want to remove this timetable slot?')) return;
      try {
        const res = await apiFetch('/api/v1/academic/timetable/' + encodeURIComponent(slotId), {
          method: 'DELETE'
        });

        if (res.ok || res.status === 204) {
          showToast('Slot removed from schedule.');
          await loadTimetableData();
          loadDashboardData();
        } else {
          showToast('Failed to delete slot.', 'error');
        }
      } catch (err) {
        console.error('Delete slot error:', err);
        showToast('Error removing timetable slot.', 'error');
      }
    }

    async function exportTimetableICal() {
      try {
        showToast('Generating offline iCalendar (.ics)...');
        const res = await apiFetch('/api/v1/academic/timetable/export.ics');
        if (!res.ok) {
          showToast('Failed to generate iCal export.', 'error');
          return;
        }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'varsity_companion_schedule.ics';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showToast('iCalendar (.ics) downloaded! Ready for Google or Apple Calendar.');
      } catch (err) {
        showToast('Failed to download calendar file.', 'error');
      }
    }

    // ========================================================
    // ACADEMIC DEADLINES & NOTIFICATION SYSTEM
    // ========================================================

    function playNotificationChime() {
      if (!notificationSoundEnabled) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc1.frequency.exponentialRampToValueAtTime(880.00, ctx.currentTime + 0.12); // A5

        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

        osc1.connect(gain);
        gain.connect(ctx.destination);

        osc1.start();
        osc1.stop(ctx.currentTime + 0.35);
      } catch (e) {
        // audio might be blocked before user gesture; gracefully ignore
      }
    }

    function toggleNotificationSound() {
      notificationSoundEnabled = !notificationSoundEnabled;
      const btn = document.getElementById('ttSoundToggleBtn');
      if (btn) {
        if (notificationSoundEnabled) {
          btn.innerHTML = '<span>🔊 Chime Enabled</span>';
          btn.className = 'flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#1b1e25] border border-[#262932] text-[#3e885b] state-transition font-medium';
          playNotificationChime();
          showToast('Notification audio chime enabled.');
        } else {
          btn.innerHTML = '<span>🔇 Chime Muted</span>';
          btn.className = 'flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#1b1e25] border border-[#262932] text-[#9ca3af] state-transition font-medium';
          showToast('Notification audio chime muted.');
        }
      }
    }

    function updateBrowserNotificationBtnUI() {
      const btn = document.getElementById('ttBrowserPushBtn');
      const dot = document.getElementById('ttBrowserPushDot');
      const label = document.getElementById('ttBrowserPushLabel');
      if (!btn || !label || !dot) return;

      if (!('Notification' in window)) {
        label.textContent = 'Push Unsupported';
        dot.className = 'w-1.5 h-1.5 rounded-full bg-[#6b7280]';
        btn.disabled = true;
        return;
      }

      if (Notification.permission === 'granted') {
        label.textContent = 'Desktop Alerts Active';
        dot.className = 'w-1.5 h-1.5 rounded-full bg-[#3e885b]';
        btn.className = 'flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#3e885b]/15 border border-[#3e885b]/40 text-[#3e885b] state-transition font-medium';
      } else if (Notification.permission === 'denied') {
        label.textContent = 'Desktop Alerts Blocked';
        dot.className = 'w-1.5 h-1.5 rounded-full bg-[#b84a4a]';
        btn.className = 'flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#b84a4a]/15 border border-[#b84a4a]/40 text-[#f87171] state-transition font-medium';
      } else {
        label.textContent = 'Enable Desktop Alerts';
        dot.className = 'w-1.5 h-1.5 rounded-full bg-[#f59e0b]';
        btn.className = 'flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#1b1e25] border border-[#262932] text-[#d1d5db] hover:text-white state-transition font-medium';
      }
    }

    async function requestBrowserNotificationPermission() {
      if (!('Notification' in window)) {
        showToast('Web notifications are not supported in this browser.', 'error');
        return;
      }

      if (Notification.permission === 'granted') {
        showToast('Desktop push notifications are already enabled!');
        showBrowserPushNotification('Timetable Notifications Active', 'You will receive proactive alerts before upcoming tests and assignment deadlines.');
        return;
      }

      try {
        const permission = await Notification.requestPermission();
        updateBrowserNotificationBtnUI();
        if (permission === 'granted') {
          showToast('Desktop notifications successfully enabled!');
          playNotificationChime();
          showBrowserPushNotification('Timetable Notifications Active', 'Proactive deadline alerts are now active for your campus schedule.');
        } else {
          showToast('Desktop notifications permission was dismissed or blocked.', 'error');
        }
      } catch (err) {
        console.error('Permission error:', err);
      }
    }

    function showBrowserPushNotification(title, body) {
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(title, {
            body: body,
            icon: '/favicon.ico'
          });
        } catch (e) {
          // ignore notification constructor failure
        }
      }
    }

    function renderTimetableDeadlinesBadge(data) {
      const badge = document.getElementById('ttUpcomingDeadlinesCountBadge');
      if (!badge) return;

      const totalUpcoming = data.total_upcoming || 0;
      const criticalCount = data.critical_count || 0;

      if (totalUpcoming > 0) {
        badge.classList.remove('hidden');
        badge.textContent = totalUpcoming.toString();
        if (criticalCount > 0) {
          badge.className = 'px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-[#b84a4a] text-white animate-pulse';
        } else {
          badge.className = 'px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-[#3b5b8c] text-white';
        }
      } else {
        badge.classList.add('hidden');
      }

      // Update modal metrics
      const critEl = document.getElementById('ttNotifCritCount');
      const urgEl = document.getElementById('ttNotifUrgCount');
      const totalEl = document.getElementById('ttNotifTotalCount');
      if (critEl) critEl.textContent = (data.critical_count || 0).toString();
      if (urgEl) urgEl.textContent = (data.urgent_count || 0).toString();
      if (totalEl) totalEl.textContent = (data.total_upcoming || 0).toString();
    }

    function renderTimetableDeadlineAlertBanner(deadlines) {
      const banner = document.getElementById('timetableDeadlineAlertBanner');
      if (!banner) return;

      // Filter uncompleted deadlines due within 48 hours or overdue
      const impending = (deadlines || []).filter(d => !d.is_completed && (d.urgency === 'CRITICAL' || d.urgency === 'URGENT' || d.urgency === 'OVERDUE'));

      if (impending.length === 0) {
        banner.classList.add('hidden');
        banner.innerHTML = '';
        return;
      }

      banner.classList.remove('hidden');
      const hasCritical = impending.some(d => d.urgency === 'CRITICAL' || d.urgency === 'OVERDUE');

      let html = 
        '<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-[#262932]">' +
          '<div class="flex items-center gap-2">' +
            '<span class="w-2.5 h-2.5 rounded-full ' + (hasCritical ? 'bg-[#f87171] animate-pulse' : 'bg-[#f59e0b]') + '"></span>' +
            '<span class="text-[13px] font-semibold ' + (hasCritical ? 'text-[#f87171]' : 'text-[#f59e0b]') + '">' +
              (hasCritical ? '🚨 Proactive Alert: Impending Academic Deadlines' : '⏳ Upcoming Academic Deadlines') +
            '</span>' +
            '<span class="text-[11px] text-[#9ca3af] hidden md:inline">Tracked directly alongside your weekly class schedule</span>' +
          '</div>' +
          '<div class="flex items-center gap-2">' +
            '<button onclick="openTimetableDeadlinesModal()" class="text-[11px] text-[#3b5b8c] hover:underline font-medium">View All Deadlines (' + impending.length + ')</button>' +
          '</div>' +
        '</div>' +
        '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">';

      impending.slice(0, 3).forEach(d => {
        const isCritical = d.urgency === 'CRITICAL' || d.urgency === 'OVERDUE';
        const urgencyText = d.urgency === 'OVERDUE' ? 'Overdue!' : d.hours_remaining <= 0 ? 'Due Today!' : 'Due in ' + d.hours_remaining + 'h';
        const color = d.color_code || '#3b5b8c';

        html += 
          '<div class="p-2.5 rounded-[8px] ' + (isCritical ? 'bg-[#b84a4a]/15 border border-[#b84a4a]/40' : 'bg-[#1b1e25] border border-[#262932]') + ' flex items-center justify-between gap-2.5">' +
            '<div class="flex items-center gap-2 truncate cursor-pointer flex-1 min-w-0" onclick="openTimetableDeadlineDetail(\\'' + escapeHtml(d.id) + '\\')">' +
              '<span class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded text-white shrink-0" style="background-color: ' + color + '">' + escapeHtml(d.module_code) + '</span>' +
              '<div class="truncate">' +
                '<div class="text-[12px] font-semibold text-[#f3f4f6] truncate">' + escapeHtml(d.title) + '</div>' +
                '<div class="text-[11px] font-mono ' + (isCritical ? 'text-[#f87171] font-bold' : 'text-[#fbbf24]') + '">' + urgencyText + ' · ' + (d.weight_percentage || 0) + '% DP</div>' +
              '</div>' +
            '</div>' +
            '<div class="flex items-center gap-1.5 shrink-0">' +
              '<button onclick="handleTriggerDeadlineNotification(\\'' + escapeHtml(d.id) + '\\')" ' +
                'class="px-2 py-1 rounded-[4px] bg-[#101216] border border-[#262932] text-[#f59e0b] hover:text-[#fbbf24] text-[11px] font-medium state-transition flex items-center gap-1" title="Trigger Instant Alert">' +
                '<span>🔔 Alert</span>' +
              '</button>' +
              '<button onclick="handleToggleDeadlineComplete(\\'' + escapeHtml(d.id) + '\\', false)" ' +
                'class="px-2 py-1 rounded-[4px] bg-[#101216] border border-[#262932] text-[#9ca3af] hover:text-[#3e885b] text-[11px] font-medium state-transition" title="Mark Done">' +
                '<span>✓</span>' +
              '</button>' +
            '</div>' +
          '</div>';
      });

      html += '</div>';
      banner.innerHTML = html;
    }

    function openTimetableDeadlinesModal() {
      const modal = document.getElementById('timetableDeadlinesModalOverlay');
      if (!modal) return;
      modal.classList.remove('hidden');
      setDeadlinesModalTab(activeDeadlinesModalTab);
    }

    function closeTimetableDeadlinesModal() {
      const modal = document.getElementById('timetableDeadlinesModalOverlay');
      if (modal) modal.classList.add('hidden');
    }

    function setDeadlinesModalTab(tab) {
      activeDeadlinesModalTab = tab;
      const deadlinesBtn = document.getElementById('ttDeadlinesTabBtn');
      const historyBtn = document.getElementById('ttHistoryTabBtn');
      const deadlinesContainer = document.getElementById('timetableDeadlinesListContainer');
      const historyContainer = document.getElementById('timetableNotificationHistoryContainer');

      if (tab === 'deadlines') {
        if (deadlinesBtn) deadlinesBtn.className = 'px-2 py-0.5 rounded-[3px] text-[11px] font-medium text-[#f3f4f6] bg-[#1b1e25]';
        if (historyBtn) historyBtn.className = 'px-2 py-0.5 rounded-[3px] text-[11px] font-medium text-[#9ca3af] hover:text-[#d1d5db]';
        if (deadlinesContainer) deadlinesContainer.classList.remove('hidden');
        if (historyContainer) historyContainer.classList.add('hidden');
        renderDeadlinesModalContent();
      } else {
        if (historyBtn) historyBtn.className = 'px-2 py-0.5 rounded-[3px] text-[11px] font-medium text-[#f3f4f6] bg-[#1b1e25]';
        if (deadlinesBtn) deadlinesBtn.className = 'px-2 py-0.5 rounded-[3px] text-[11px] font-medium text-[#9ca3af] hover:text-[#d1d5db]';
        if (historyContainer) historyContainer.classList.remove('hidden');
        if (deadlinesContainer) deadlinesContainer.classList.add('hidden');
        renderNotificationHistoryContent();
      }
    }

    function renderDeadlinesModalContent() {
      const container = document.getElementById('timetableDeadlinesListContainer');
      if (!container) return;

      const deadlines = cachedTimetableDeadlines || [];

      if (deadlines.length === 0) {
        container.innerHTML = 
          '<div class="p-8 text-center bg-[#101216] border border-[#262932] rounded-[8px] space-y-2">' +
            '<div class="text-[14px] font-medium text-[#f3f4f6]">No academic deadlines tracked yet</div>' +
            '<p class="text-[12px] text-[#9ca3af]">Add upcoming assignments, tests, or quizzes to receive proactive notifications.</p>' +
            '<button onclick="openAddDeadlineFromTimetableModal()" class="mt-2 px-3 py-1.5 rounded-[6px] bg-[#3b5b8c] hover:bg-[#466ba3] text-white text-[12px] font-medium state-transition">+ Add First Deadline</button>' +
          '</div>';
        return;
      }

      let html = '';

      deadlines.forEach(d => {
        const isDone = Boolean(d.is_completed);
        const isCrit = !isDone && (d.urgency === 'CRITICAL' || d.urgency === 'OVERDUE');
        const isUrg = !isDone && d.urgency === 'URGENT';
        const color = d.color_code || '#3b5b8c';

        let urgencyBadge = '';
        if (isDone) {
          urgencyBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#3e885b]/15 text-[#3e885b] border border-[#3e885b]/30">COMPLETED</span>';
        } else if (d.urgency === 'OVERDUE') {
          urgencyBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#b84a4a] text-white font-mono font-bold animate-pulse">OVERDUE</span>';
        } else if (isCrit) {
          urgencyBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#b84a4a]/20 text-[#f87171] border border-[#b84a4a]/40 font-mono font-bold">CRITICAL &lt;24h</span>';
        } else if (isUrg) {
          urgencyBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#f59e0b]/20 text-[#fbbf24] border border-[#f59e0b]/40 font-mono">URGENT &lt;48h</span>';
        } else {
          urgencyBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#262932] text-[#9ca3af] font-mono">UPCOMING</span>';
        }

        const timeRemainingText = isDone ? 'Completed' : d.urgency === 'OVERDUE' ? 'Past Due Date' : d.hours_remaining <= 0 ? 'Due Today' : d.hours_remaining <= 24 ? ('Due in ' + d.hours_remaining + ' hours') : ('Due in ' + d.days_remaining + ' days');

        html += 
          '<div class="p-3 rounded-[8px] ' + (isDone ? 'bg-[#101216]/50 border border-[#262932] opacity-60' : isCrit ? 'bg-[#b84a4a]/10 border border-[#b84a4a]/30' : 'bg-[#101216] border border-[#262932]') + ' flex flex-col sm:flex-row sm:items-center justify-between gap-3 state-transition">' +
            '<div class="flex items-start gap-3 flex-1 min-w-0 cursor-pointer" onclick="openTimetableDeadlineDetail(\\'' + escapeHtml(d.id) + '\\')">' +
              '<span class="text-[11px] font-mono font-bold px-2 py-1 rounded text-white shrink-0 mt-0.5" style="background-color: ' + color + '">' + escapeHtml(d.module_code) + '</span>' +
              '<div class="space-y-1 flex-1 min-w-0">' +
                '<div class="flex items-center gap-2 flex-wrap">' +
                  '<span class="text-[13px] font-semibold ' + (isDone ? 'line-through text-[#9ca3af]' : 'text-[#f3f4f6]') + ' truncate">' + escapeHtml(d.title) + '</span>' +
                  urgencyBadge +
                  '<span class="text-[10px] px-1.5 py-0.5 rounded bg-[#1b1e25] text-[#9ca3af] font-mono">' + escapeHtml(d.task_type) + '</span>' +
                '</div>' +
                '<div class="flex items-center gap-3 text-[11px] text-[#9ca3af] font-mono flex-wrap">' +
                  '<span>Due: ' + escapeHtml(d.due_date_formatted) + '</span>' +
                  '<span>·</span>' +
                  '<span class="' + (isCrit ? 'text-[#f87171] font-bold' : 'text-[#fbbf24]') + '">' + timeRemainingText + '</span>' +
                  '<span>·</span>' +
                  '<span>' + (d.weight_percentage || 0) + '% DP Contribution</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="flex items-center gap-2 shrink-0 self-end sm:self-center">' +
              (!isDone ? 
                '<button onclick="handleTriggerDeadlineNotification(\\'' + escapeHtml(d.id) + '\\')" class="px-2.5 py-1 rounded-[6px] bg-[#1b1e25] hover:bg-[#222630] border border-[#262932] text-[#f59e0b] hover:text-[#fbbf24] text-[11px] font-medium state-transition flex items-center gap-1" title="Trigger Instant Alert">' +
                  '<span>🔔 Alert Now</span>' +
                '</button>' : '') +
              '<button onclick="handleToggleDeadlineComplete(\\'' + escapeHtml(d.id) + '\\', ' + isDone + ')" class="px-2.5 py-1 rounded-[6px] ' + (isDone ? 'bg-[#3e885b]/20 border border-[#3e885b]/40 text-[#3e885b]' : 'bg-[#1b1e25] hover:bg-[#222630] border border-[#262932] text-[#9ca3af] hover:text-white') + ' text-[11px] font-medium state-transition">' +
                (isDone ? '✓ Completed' : 'Mark Done') +
              '</button>' +
            '</div>' +
          '</div>';
      });

      container.innerHTML = html;
    }

    async function renderNotificationHistoryContent() {
      const container = document.getElementById('timetableNotificationHistoryContainer');
      if (!container) return;

      container.innerHTML = '<div class="text-center py-6 text-[#9ca3af] text-[12px]">Loading notification audit log...</div>';

      try {
        const res = await apiFetch('/api/v1/academic/timetable/notifications/history');
        if (res.ok) {
          cachedNotificationLogs = await res.json();
        }
      } catch (err) {
        console.error('History load error:', err);
      }

      const logs = cachedNotificationLogs || [];

      if (logs.length === 0) {
        container.innerHTML = 
          '<div class="p-8 text-center bg-[#101216] border border-[#262932] rounded-[8px] space-y-1.5">' +
            '<div class="text-[13px] font-medium text-[#f3f4f6]">No notifications sent yet</div>' +
            '<p class="text-[11px] text-[#9ca3af]">Notifications are recorded when deadlines are within lead window (24h/2h) or when you trigger an alert.</p>' +
          '</div>';
        return;
      }

      let html = '<div class="space-y-2">';
      logs.forEach(log => {
        const isCrit = log.urgency === 'CRITICAL';
        const dateStr = new Date(log.created_at).toLocaleString('en-GB', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        });

        html += 
          '<div class="p-2.5 rounded-[6px] bg-[#101216] border border-[#262932] flex items-center justify-between gap-3 text-[12px]">' +
            '<div class="flex items-center gap-2.5 min-w-0">' +
              '<span class="w-2 h-2 rounded-full ' + (isCrit ? 'bg-[#f87171]' : 'bg-[#f59e0b]') + ' shrink-0"></span>' +
              '<div class="min-w-0">' +
                '<div class="text-[#f3f4f6] font-medium truncate">' + escapeHtml(log.message) + '</div>' +
                '<div class="text-[10px] text-[#6b7280] font-mono">' + escapeHtml(log.module_code) + ' · Channel: ' + escapeHtml(log.channel) + ' · Status: ' + escapeHtml(log.status) + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="text-[10px] font-mono text-[#9ca3af] shrink-0">' + dateStr + '</div>' +
          '</div>';
      });
      html += '</div>';

      container.innerHTML = html;
    }

    function openAddDeadlineFromTimetableModal() {
      const modal = document.getElementById('addDeadlineFromTimetableModalOverlay');
      if (!modal) return;
      modal.classList.remove('hidden');

      // Pre-fill course code if active filter is set
      const codeInput = document.getElementById('addDeadlineCourseCode');
      if (codeInput && activeCourseFilter !== 'ALL') {
        codeInput.value = activeCourseFilter;
      }

      // Default due date to tomorrow 23:59
      setDeadlinePreset('tomorrow');
    }

    function closeAddDeadlineFromTimetableModal() {
      const modal = document.getElementById('addDeadlineFromTimetableModalOverlay');
      if (modal) modal.classList.add('hidden');
    }

    function setDeadlinePreset(preset) {
      const input = document.getElementById('addDeadlineDueDate');
      if (!input) return;

      const now = new Date();
      let target = new Date();

      if (preset === 'tonight') {
        target.setHours(23, 59, 0, 0);
      } else if (preset === 'tomorrow') {
        target.setDate(target.getDate() + 1);
        target.setHours(17, 0, 0, 0);
      } else if (preset === '3days') {
        target.setDate(target.getDate() + 3);
        target.setHours(23, 59, 0, 0);
      } else if (preset === '1week') {
        target.setDate(target.getDate() + 7);
        target.setHours(23, 59, 0, 0);
      }

      // Format YYYY-MM-DDTHH:mm
      const yyyy = target.getFullYear();
      const mm = String(target.getMonth() + 1).padStart(2, '0');
      const dd = String(target.getDate()).padStart(2, '0');
      const hh = String(target.getHours()).padStart(2, '0');
      const min = String(target.getMinutes()).padStart(2, '0');

      input.value = yyyy + '-' + mm + '-' + dd + 'T' + hh + ':' + min;
    }

    async function handleAddDeadlineFromTimetable(e) {
      e.preventDefault();
      const submitBtn = document.getElementById('addDeadlineSubmitBtn');
      const code = (document.getElementById('addDeadlineCourseCode').value || '').trim();
      const title = (document.getElementById('addDeadlineTitle').value || '').trim();
      const taskType = document.getElementById('addDeadlineType').value;
      const priority = document.getElementById('addDeadlinePriority').value;
      const dueDate = document.getElementById('addDeadlineDueDate').value;
      const weight = parseFloat(document.getElementById('addDeadlineWeight').value || '10');

      if (!code || !title || !dueDate) {
        showToast('Please enter course code, title, and due date.', 'error');
        return;
      }

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Saving Deadline...';
        }

        const res = await apiFetch('/api/v1/academic/timetable/deadlines', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            course_code: code,
            title,
            task_type: taskType,
            priority,
            due_date: new Date(dueDate).toISOString(),
            weight_percentage: weight
          })
        });

        if (res.ok) {
          showToast('Academic deadline tracked successfully!');
          playNotificationChime();
          closeAddDeadlineFromTimetableModal();
          await loadTimetableData();
          if (typeof loadDashboardData === 'function') loadDashboardData();
        } else {
          const err = await res.json().catch(() => ({}));
          showToast(err.detail || 'Failed to save academic deadline.', 'error');
        }
      } catch (err) {
        console.error('Failed to add deadline:', err);
        showToast('Error saving deadline.', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>Save &amp; Track Deadline</span>';
        }
      }
    }

    function openTimetableDeadlineDetail(deadlineId) {
      const d = (cachedTimetableDeadlines || []).find(item => item.id === deadlineId);
      if (!d) return;

      selectedDeadlineForDetail = d;
      const modal = document.getElementById('timetableDeadlineDetailModalOverlay');
      if (!modal) return;

      const badge = document.getElementById('ttDetailCourseBadge');
      const title = document.getElementById('ttDetailTitle');
      const courseName = document.getElementById('ttDetailCourseName');
      const urgencyBox = document.getElementById('ttDetailUrgencyBox');
      const urgencyTag = document.getElementById('ttDetailUrgencyTag');
      const countdown = document.getElementById('ttDetailCountdown');
      const dueDateEl = document.getElementById('ttDetailDueDateFormatted');
      const weightEl = document.getElementById('ttDetailWeight');
      const typeEl = document.getElementById('ttDetailType');
      const slotsEl = document.getElementById('ttDetailAssociatedSlots');
      const completeBtn = document.getElementById('ttDetailToggleCompleteBtn');

      if (badge) {
        badge.textContent = d.module_code;
        badge.style.backgroundColor = d.color_code || '#3b5b8c';
      }
      if (title) title.textContent = d.title;
      if (courseName) courseName.textContent = d.module_name || 'Academic Course';
      if (dueDateEl) dueDateEl.textContent = d.due_date_formatted;
      if (weightEl) weightEl.textContent = (d.weight_percentage || 0) + '%';
      if (typeEl) typeEl.textContent = d.task_type;

      const isDone = Boolean(d.is_completed);
      const isCrit = !isDone && (d.urgency === 'CRITICAL' || d.urgency === 'OVERDUE');

      if (urgencyBox) {
        if (isDone) {
          urgencyBox.className = 'p-3.5 rounded-[8px] bg-[#3e885b]/15 border border-[#3e885b]/30 flex items-center justify-between';
        } else if (isCrit) {
          urgencyBox.className = 'p-3.5 rounded-[8px] bg-[#b84a4a]/15 border border-[#b84a4a]/30 flex items-center justify-between';
        } else {
          urgencyBox.className = 'p-3.5 rounded-[8px] bg-[#f59e0b]/15 border border-[#f59e0b]/30 flex items-center justify-between';
        }
      }

      if (urgencyTag) {
        if (isDone) {
          urgencyTag.textContent = 'Completed Task';
          urgencyTag.className = 'text-[11px] font-bold text-[#3e885b] uppercase tracking-wide';
        } else if (d.urgency === 'OVERDUE') {
          urgencyTag.textContent = 'Overdue Task Alert';
          urgencyTag.className = 'text-[11px] font-bold text-[#f87171] uppercase tracking-wide animate-pulse';
        } else if (isCrit) {
          urgencyTag.textContent = 'Critical Impending Deadline (<24h)';
          urgencyTag.className = 'text-[11px] font-bold text-[#f87171] uppercase tracking-wide';
        } else {
          urgencyTag.textContent = 'Upcoming Academic Deadline';
          urgencyTag.className = 'text-[11px] font-bold text-[#fbbf24] uppercase tracking-wide';
        }
      }

      if (countdown) {
        if (isDone) {
          countdown.textContent = 'Task completed';
        } else if (d.urgency === 'OVERDUE') {
          countdown.textContent = 'Deadline has passed';
        } else if (d.hours_remaining <= 0) {
          countdown.textContent = 'Due today!';
        } else if (d.hours_remaining <= 24) {
          countdown.textContent = 'Due in ' + d.hours_remaining + ' hours';
        } else {
          countdown.textContent = 'Due in ' + d.days_remaining + ' days';
        }
      }

      // Associated timetable class slots
      if (slotsEl) {
        const slots = d.module_slots || [];
        if (slots.length === 0) {
          slotsEl.innerHTML = '<div class="text-[#6b7280] italic text-[11px]">No weekly class sessions scheduled for ' + escapeHtml(d.module_code) + '</div>';
        } else {
          let sHtml = '';
          slots.forEach(s => {
            const dayName = TIMETABLE_DAY_MAP[s.day_of_week] || 'Day ' + s.day_of_week;
            sHtml += 
              '<div class="flex items-center justify-between p-1.5 rounded bg-[#15171d] border border-[#262932]">' +
                '<span class="font-medium text-[#f3f4f6]">' + escapeHtml(dayName) + ' ' + escapeHtml(s.start_time.substring(0, 5)) + ' - ' + escapeHtml(s.end_time.substring(0, 5)) + '</span>' +
                '<span class="text-[#9ca3af] font-mono text-[11px]">' + escapeHtml(s.venue || 'Campus Venue') + '</span>' +
              '</div>';
          });
          slotsEl.innerHTML = sHtml;
        }
      }

      if (completeBtn) {
        if (isDone) {
          completeBtn.innerHTML = '<span>↩ Mark Incomplete</span>';
          completeBtn.className = 'px-3 py-1.5 rounded-[6px] text-[12px] font-medium border border-[#262932] bg-[#1b1e25] text-[#9ca3af] hover:text-white state-transition';
        } else {
          completeBtn.innerHTML = '<span>✓ Mark Completed</span>';
          completeBtn.className = 'px-3 py-1.5 rounded-[6px] text-[12px] font-medium border border-[#3e885b]/40 bg-[#3e885b]/15 text-[#3e885b] hover:bg-[#3e885b]/25 state-transition';
        }
      }

      modal.classList.remove('hidden');
    }

    function closeTimetableDeadlineDetail() {
      const modal = document.getElementById('timetableDeadlineDetailModalOverlay');
      if (modal) modal.classList.add('hidden');
      selectedDeadlineForDetail = null;
    }

    async function handleDetailTriggerNotification() {
      if (!selectedDeadlineForDetail) return;
      await handleTriggerDeadlineNotification(selectedDeadlineForDetail.id);
    }

    async function handleDetailToggleComplete() {
      if (!selectedDeadlineForDetail) return;
      const current = Boolean(selectedDeadlineForDetail.is_completed);
      await handleToggleDeadlineComplete(selectedDeadlineForDetail.id, current);
      closeTimetableDeadlineDetail();
    }

    async function handleTriggerDeadlineNotification(taskId) {
      try {
        showToast('Dispatching deadline notification alert...');
        const res = await apiFetch('/api/v1/academic/timetable/deadlines/' + encodeURIComponent(taskId) + '/notify', {
          method: 'POST'
        });

        if (res.ok) {
          const data = await res.json();
          const notif = data.notification || {};

          // Play Audio chime
          playNotificationChime();

          // Trigger native Desktop Push notification if enabled
          showBrowserPushNotification(notif.title || 'Academic Deadline Alert', notif.body || 'Upcoming academic deadline alert');

          const emailNotice = notif.email_dispatched ? ' (Email sent to ' + notif.recipient_email + ')' : '';
          showToast('🔔 Notification Alert Dispatched!' + emailNotice);

          await loadTimetableData();
          if (activeDeadlinesModalTab === 'history') {
            renderNotificationHistoryContent();
          }
        } else {
          showToast('Failed to dispatch notification.', 'error');
        }
      } catch (err) {
        console.error('Trigger notification error:', err);
        showToast('Error triggering notification.', 'error');
      }
    }

    async function handleSweepTimetableDeadlines() {
      const btn = document.getElementById('ttSweepNotifsBtn');
      try {
        if (btn) btn.disabled = true;
        showToast('Scanning schedule for upcoming deadlines...');
        const res = await apiFetch('/api/v1/academic/timetable/deadlines/notify-sweep', {
          method: 'POST'
        });

        if (res.ok) {
          const data = await res.json();
          if (data.dispatched_count > 0) {
            playNotificationChime();
            showBrowserPushNotification('Timetable Deadline Sweep', 'Dispatched alerts for ' + data.dispatched_count + ' impending deadlines.');
            showToast('Sweep completed: ' + data.dispatched_count + ' deadline notification(s) dispatched!');
          } else {
            showToast('Sweep completed: No unnotified deadlines due within active alert window.');
          }
          await loadTimetableData();
          if (activeDeadlinesModalTab === 'history') {
            renderNotificationHistoryContent();
          }
        } else {
          showToast('Sweep check failed.', 'error');
        }
      } catch (err) {
        console.error('Sweep error:', err);
        showToast('Error running notification sweep.', 'error');
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    async function handleToggleDeadlineComplete(taskId, currentStatus) {
      try {
        const res = await apiFetch('/api/v1/academic/timetable/deadlines/' + encodeURIComponent(taskId) + '/complete', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_completed: !currentStatus })
        });

        if (res.ok) {
          showToast(!currentStatus ? '✓ Deadline marked completed!' : 'Deadline restored to active status.');
          await loadTimetableData();
          if (typeof loadDashboardData === 'function') loadDashboardData();
        } else {
          showToast('Failed to update deadline status.', 'error');
        }
      } catch (err) {
        console.error('Toggle complete error:', err);
        showToast('Error updating deadline status.', 'error');
      }
    }
  `;
}
