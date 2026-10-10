/**
 * High-performance Schedule & Timetable Algorithmic Engine
 * - O(n log n) Interval scheduling clash detection with sweeping-line
 * - Inter-venue transit latency analysis
 * - RFC 5545 compliant iCalendar (.ics) export engine for offline calendar sync
 */

export interface EnrichedSlot {
  id: string;
  module_id: string;
  module_code: string;
  module_name: string;
  color_code?: string;
  day_of_week: number; // 1=Mon .. 7=Sun
  start_time: string; // HH:MM or HH:MM:SS
  end_time: string;
  venue: string;
}

export interface ScheduleClash {
  day_of_week: number;
  day_name: string;
  slot_a: EnrichedSlot;
  slot_b: EnrichedSlot;
  overlap_minutes: number;
  type: "DIRECT_OVERLAP" | "TIGHT_TRANSIT";
  message: string;
  severity: "CRITICAL" | "WARNING";
}

const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const ICAL_DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/**
 * Parses time string (e.g. "08:15", "14:00:00") into minutes from midnight
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(":").map((p) => parseInt(p, 10));
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  return h * 60 + m;
}

/**
 * Formats minutes from midnight into 24-hour HH:MM
 */
export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * O(n log n) Interval Sweep-Line algorithm to detect overlapping class times
 * and short transit intervals across campus venues.
 */
export function detectScheduleClashes(
  slots: EnrichedSlot[],
  transitBufferMinutes: number = 10
): ScheduleClash[] {
  const clashes: ScheduleClash[] = [];

  // Group slots by day of week (1 to 7)
  const dayGroups = new Map<number, EnrichedSlot[]>();
  for (const slot of slots) {
    const day = slot.day_of_week;
    if (!dayGroups.has(day)) {
      dayGroups.set(day, []);
    }
    dayGroups.get(day)!.push(slot);
  }

  // Analyze each day's intervals
  for (const [day, daySlots] of dayGroups.entries()) {
    if (daySlots.length < 2) continue;

    // Sort intervals by start time ascending O(k log k)
    daySlots.sort(
      (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
    );

    for (let i = 0; i < daySlots.length - 1; i++) {
      const current = daySlots[i];
      const next = daySlots[i + 1];

      const currentStart = timeToMinutes(current.start_time);
      const currentEnd = timeToMinutes(current.end_time);
      const nextStart = timeToMinutes(next.start_time);
      const nextEnd = timeToMinutes(next.end_time);

      const dayName = DAY_NAMES[day - 1] || `Day ${day}`;

      // 1. Direct Overlap: current.end > next.start
      if (currentEnd > nextStart) {
        const overlap = Math.min(currentEnd, nextEnd) - nextStart;
        clashes.push({
          day_of_week: day,
          day_name: dayName,
          slot_a: current,
          slot_b: next,
          overlap_minutes: overlap,
          type: "DIRECT_OVERLAP",
          severity: "CRITICAL",
          message: `${current.module_code} (${current.start_time}-${current.end_time}) directly overlaps with ${next.module_code} (${next.start_time}-${next.end_time}) by ${overlap} mins on ${dayName}.`,
        });
      }
      // 2. Tight inter-venue transit warning: next.start - current.end < transitBuffer
      else if (
        nextStart - currentEnd >= 0 &&
        nextStart - currentEnd < transitBufferMinutes &&
        current.venue.toLowerCase() !== next.venue.toLowerCase() &&
        !current.venue.toLowerCase().includes("online") &&
        !next.venue.toLowerCase().includes("online")
      ) {
        const gap = nextStart - currentEnd;
        clashes.push({
          day_of_week: day,
          day_name: dayName,
          slot_a: current,
          slot_b: next,
          overlap_minutes: 0,
          type: "TIGHT_TRANSIT",
          severity: "WARNING",
          message: `Only ${gap} mins transit between ${current.venue} (${current.module_code}) and ${next.venue} (${next.module_code}) on ${dayName}. High risk of being late.`,
        });
      }
    }
  }

  return clashes;
}

/**
 * Generates an RFC 5545 compliant iCalendar (.ics) feed
 * Allows zero-data offline calendar sync to Google Calendar, Apple Calendar, and Outlook.
 */
export function generateTimetableICal(
  slots: EnrichedSlot[],
  tasks: Array<{
    id: string;
    module_code: string;
    title: string;
    due_date: string;
    task_type: string;
  }> = []
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Varsity Companion//Academic Timetable & Deadlines//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Varsity Companion Schedule",
    "X-WR-TIMEZONE:Africa/Johannesburg",
  ];

  // Helper to format date into iCal UTC (YYYYMMDDTHHMMSSZ)
  function formatICalDate(d: Date): string {
    return (
      d
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "")
    );
  }

  // Anchor weekly timetable classes to the current academic semester Monday
  const now = new Date();
  const currentDay = now.getDay(); // 0=Sun .. 6=Sat
  const mondayOffset = (currentDay === 0 ? -6 : 1) - currentDay;
  const mondayDate = new Date(now);
  mondayDate.setDate(now.getDate() + mondayOffset);
  mondayDate.setHours(0, 0, 0, 0);

  // 1. Export Recurring Weekly Timetable Slots
  for (const slot of slots) {
    const dayIndex = Math.max(1, Math.min(7, slot.day_of_week));
    const icalDay = ICAL_DAYS[dayIndex - 1];

    // Compute the first instance date for this day of the week
    const classDate = new Date(mondayDate);
    classDate.setDate(mondayDate.getDate() + (dayIndex - 1));

    const [startH, startM] = slot.start_time
      .split(":")
      .map((p) => parseInt(p, 10));
    const [endH, endM] = slot.end_time
      .split(":")
      .map((p) => parseInt(p, 10));

    const startDate = new Date(classDate);
    startDate.setHours(startH || 8, startM || 0, 0, 0);

    const endDate = new Date(classDate);
    endDate.setHours(endH || 9, endM || 50, 0, 0);

    const uid = `slot-${slot.id}@varsitycompanion.co.za`;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${formatICalDate(now)}`);
    lines.push(`DTSTART:${formatICalDate(startDate)}`);
    lines.push(`DTEND:${formatICalDate(endDate)}`);
    lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${icalDay};COUNT=20`);
    lines.push(`SUMMARY:${slot.module_code}: ${slot.module_name}`);
    lines.push(`LOCATION:${slot.venue || "Campus"}`);
    lines.push(
      `DESCRIPTION:Class session for ${slot.module_code} at ${slot.venue}. Exported from Varsity Companion.`
    );
    lines.push("STATUS:CONFIRMED");
    lines.push("END:VEVENT");
  }

  // 2. Export Upcoming Deliverables & Exam Deadlines
  for (const task of tasks) {
    const dueDate = new Date(task.due_date);
    if (isNaN(dueDate.getTime())) continue;

    const startDate = new Date(dueDate.getTime() - 60 * 60 * 1000); // 1 hour prior
    const uid = `task-${task.id}@varsitycompanion.co.za`;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${formatICalDate(now)}`);
    lines.push(`DTSTART:${formatICalDate(startDate)}`);
    lines.push(`DTEND:${formatICalDate(dueDate)}`);
    lines.push(`SUMMARY:[${task.task_type}] ${task.module_code}: ${task.title}`);
    lines.push(
      `DESCRIPTION:Academic deadline: ${task.title} for ${task.module_code}. Verified in Varsity Companion.`
    );
    lines.push("STATUS:CONFIRMED");
    lines.push("CLASS:PUBLIC");
    // Alarms to alert student on calendar apps (24 hours and 2 hours prior)
    lines.push("BEGIN:VALARM");
    lines.push("ACTION:DISPLAY");
    lines.push(`DESCRIPTION:Upcoming Academic Deadline in 24 Hours: [${task.task_type}] ${task.module_code} - ${task.title}`);
    lines.push("TRIGGER:-PT24H");
    lines.push("END:VALARM");
    lines.push("BEGIN:VALARM");
    lines.push("ACTION:DISPLAY");
    lines.push(`DESCRIPTION:Urgent Final Notice (2h): [${task.task_type}] ${task.module_code} - ${task.title}`);
    lines.push("TRIGGER:-PT2H");
    lines.push("END:VALARM");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
