/**
 * Mock Calendar Data Generator for Calens Extension Demo
 *
 * This Google Apps Script generates 13 weeks of realistic calendar events
 * across 4 calendars to showcase Calens extension features.
 *
 * Usage:
 * 1. Go to script.google.com
 * 2. Create a new project and paste this code
 * 3. Run main() to generate events
 * 4. Run cleanup() to remove all generated events
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const WEEKS = 13;
const DEMO_TAG = 'demo';

const CALENDARS = [
  { name: 'Exercise', color: CalendarApp.Color.GREEN },
  { name: 'Relationship', color: CalendarApp.Color.PURPLE },
  { name: 'Work', color: CalendarApp.Color.BLUE },
  { name: 'Learning', color: CalendarApp.Color.YELLOW }
];

const EVENT_TEMPLATES = {
  Exercise: [
    { title: 'Morning Run', minDuration: 45, maxDuration: 60, tags: ['health'] },
    { title: 'Gym Session', minDuration: 60, maxDuration: 90, tags: ['health', 'focus'] },
    { title: 'Yoga', minDuration: 60, maxDuration: 60, tags: ['health'] },
    { title: 'Swimming', minDuration: 60, maxDuration: 60, tags: ['health'] },
    { title: 'Cycling', minDuration: 90, maxDuration: 90, tags: ['health'] }
  ],
  Relationship: [
    { title: 'Family Dinner', minDuration: 90, maxDuration: 120, tags: ['social'] },
    { title: 'Coffee with Friend', minDuration: 60, maxDuration: 60, tags: ['social'] },
    { title: 'Call with Parents', minDuration: 30, maxDuration: 60, tags: ['social'] },
    { title: 'Game Night', minDuration: 120, maxDuration: 180, tags: ['social'] },
    { title: 'Weekend Trip', minDuration: 480, maxDuration: 480, tags: ['social'], allDay: true }
  ],
  Work: [
    // Recommendation System blog project
    { title: 'Blog: Research', minDuration: 90, maxDuration: 120, tags: ['focus', 'growth'] },
    { title: 'Blog: Writing', minDuration: 120, maxDuration: 180, tags: ['focus'] },
    { title: 'Blog: Editing', minDuration: 60, maxDuration: 60, tags: ['focus'] },
    { title: 'Blog: SEO & Publishing', minDuration: 60, maxDuration: 60, tags: [] },
    // Calens extension project
    { title: 'Calens: Feature Development', minDuration: 120, maxDuration: 180, tags: ['focus'] },
    { title: 'Calens: Bug Fixing', minDuration: 60, maxDuration: 120, tags: ['focus'] },
    { title: 'Calens: Code Review', minDuration: 60, maxDuration: 60, tags: [] },
    { title: 'Calens: Planning', minDuration: 45, maxDuration: 45, tags: [] },
    { title: 'Calens: Testing', minDuration: 60, maxDuration: 60, tags: [] }
  ],
  Learning: [
    { title: 'Online Course', minDuration: 60, maxDuration: 120, tags: ['growth', 'focus'] },
    { title: 'Reading', minDuration: 60, maxDuration: 60, tags: ['growth'] },
    { title: 'Tech Talk', minDuration: 60, maxDuration: 60, tags: ['growth', 'social'] },
    { title: 'Tutorial', minDuration: 90, maxDuration: 90, tags: ['growth'] },
    { title: 'Practice Coding', minDuration: 120, maxDuration: 120, tags: ['growth', 'focus'] }
  ]
};

// Weekly intensity patterns (13 weeks)
// 0 = light, 1 = normal, 2 = busy
const WEEK_PATTERNS = [1, 2, 1, 0, 1, 2, 1, 1, 0, 2, 1, 1, 2];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createDescription(tags) {
  const allTags = [DEMO_TAG, ...tags].join(', ');
  return `---\ntags: ${allTags}\n---\n\nGenerated demo event for Calens extension showcase.`;
}

function getStartOfWeek(weeksAgo) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Adjust for Monday start
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff - (weeksAgo * 7));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// ============================================================================
// CALENDAR MANAGEMENT
// ============================================================================

function getOrCreateCalendar(name, color) {
  const calendars = CalendarApp.getCalendarsByName(name);
  if (calendars.length > 0) {
    return calendars[0];
  }
  const calendar = CalendarApp.createCalendar(name);
  calendar.setColor(color);
  return calendar;
}

function createCalendars() {
  const calendarMap = {};
  for (const cal of CALENDARS) {
    calendarMap[cal.name] = getOrCreateCalendar(cal.name, cal.color);
    Logger.log(`Calendar ready: ${cal.name}`);
    Utilities.sleep(1000); // 1 second delay between calendar creation
  }
  return calendarMap;
}

// ============================================================================
// EVENT GENERATION
// ============================================================================

function generateEventsForDay(date, intensity, calendarMap) {
  // Skip ~20% of days for realism
  if (Math.random() < 0.2) return 0;

  // Determine number of events based on intensity
  let minEvents, maxEvents;
  switch (intensity) {
    case 0: // light week
      minEvents = 1;
      maxEvents = 2;
      break;
    case 1: // normal week
      minEvents = 2;
      maxEvents = 3;
      break;
    case 2: // busy week
      minEvents = 3;
      maxEvents = 4;
      break;
    default:
      minEvents = 2;
      maxEvents = 3;
  }

  const numEvents = randomInt(minEvents, maxEvents);
  const dayOfWeek = date.getDay(); // 0 = Sunday

  // Shuffle calendars to distribute events
  const calendarNames = shuffle(Object.keys(calendarMap));

  // Track used time slots to avoid overlaps
  const usedSlots = [];
  let eventsCreated = 0;

  for (let i = 0; i < numEvents; i++) {
    const calendarName = calendarNames[i % calendarNames.length];
    const templates = EVENT_TEMPLATES[calendarName];
    const template = randomChoice(templates);

    // Skip all-day events except on weekends
    if (template.allDay && (dayOfWeek !== 0 && dayOfWeek !== 6)) {
      continue;
    }

    // Calculate duration
    const duration = randomInt(template.minDuration, template.maxDuration);

    if (template.allDay) {
      // Create all-day event
      const calendar = calendarMap[calendarName];
      calendar.createAllDayEvent(
        template.title,
        date,
        { description: createDescription(template.tags) }
      );
      eventsCreated++;
      Utilities.sleep(500); // Delay after event creation
    } else {
      // Find a free time slot (8am - 6pm)
      let startHour = randomInt(8, 17);
      let attempts = 0;

      while (attempts < 10) {
        const slotEnd = startHour + Math.ceil(duration / 60);
        const isOverlapping = usedSlots.some(slot =>
          (startHour >= slot.start && startHour < slot.end) ||
          (slotEnd > slot.start && slotEnd <= slot.end)
        );

        if (!isOverlapping && slotEnd <= 18) {
          break;
        }
        startHour = randomInt(8, 17);
        attempts++;
      }

      if (attempts >= 10) continue;

      // Create the event
      const startTime = new Date(date);
      startTime.setHours(startHour, randomChoice([0, 15, 30]), 0, 0);

      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + duration);

      const calendar = calendarMap[calendarName];
      calendar.createEvent(
        template.title,
        startTime,
        endTime,
        { description: createDescription(template.tags) }
      );

      usedSlots.push({ start: startHour, end: startHour + Math.ceil(duration / 60) });
      eventsCreated++;
      Utilities.sleep(500); // Delay after event creation
    }
  }

  return eventsCreated;
}

function generateWeekEvents(weekIndex, calendarMap) {
  const weekStart = getStartOfWeek(WEEKS - 1 - weekIndex);
  const intensity = WEEK_PATTERNS[weekIndex];
  let totalEvents = 0;

  for (let day = 0; day < 7; day++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + day);
    totalEvents += generateEventsForDay(date, intensity, calendarMap);
  }

  const intensityLabel = ['light', 'normal', 'busy'][intensity];
  Logger.log(`Week ${weekIndex + 1} (${intensityLabel}): ${totalEvents} events`);
  return totalEvents;
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

function main() {
  Logger.log('Starting mock calendar data generation...');
  Logger.log(`Generating ${WEEKS} weeks of data`);

  // Create calendars
  const calendarMap = createCalendars();

  // Generate events for each week
  let totalEvents = 0;
  for (let week = 0; week < WEEKS; week++) {
    totalEvents += generateWeekEvents(week, calendarMap);

    // Longer delay between weeks to avoid rate limiting
    Utilities.sleep(2000);
  }

  Logger.log(`\nGeneration complete!`);
  Logger.log(`Total events created: ${totalEvents}`);
  Logger.log(`Calendars created: ${CALENDARS.map(c => c.name).join(', ')}`);
}

function cleanup() {
  Logger.log('Starting cleanup of demo events...');

  let totalDeleted = 0;

  // Delete events from each calendar
  for (const cal of CALENDARS) {
    const calendars = CalendarApp.getCalendarsByName(cal.name);
    if (calendars.length === 0) {
      Logger.log(`Calendar not found: ${cal.name}`);
      continue;
    }

    const calendar = calendars[0];

    // Get events from the past 13 weeks to 1 week in future
    const startDate = getStartOfWeek(WEEKS);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);

    const events = calendar.getEvents(startDate, endDate);
    let deletedFromCalendar = 0;

    for (const event of events) {
      const description = event.getDescription() || '';
      // Check if event has the demo tag
      if (description.includes(`tags:`) && description.includes(DEMO_TAG)) {
        event.deleteEvent();
        deletedFromCalendar++;

        // Small delay to avoid rate limiting
        if (deletedFromCalendar % 10 === 0) {
          Utilities.sleep(100);
        }
      }
    }

    Logger.log(`Deleted ${deletedFromCalendar} events from ${cal.name}`);
    totalDeleted += deletedFromCalendar;

    // Delete the calendar itself if it was created by us
    // (Only delete if all events were demo events)
    if (deletedFromCalendar > 0 && events.length === deletedFromCalendar) {
      calendar.deleteCalendar();
      Logger.log(`Deleted calendar: ${cal.name}`);
    }
  }

  Logger.log(`\nCleanup complete!`);
  Logger.log(`Total events deleted: ${totalDeleted}`);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function previewGeneration() {
  Logger.log('Preview of what will be generated:');
  Logger.log(`\nCalendars: ${CALENDARS.map(c => c.name).join(', ')}`);
  Logger.log(`\nWeeks: ${WEEKS}`);
  Logger.log(`\nWeek intensity pattern:`);

  for (let i = 0; i < WEEKS; i++) {
    const intensity = WEEK_PATTERNS[i];
    const label = ['Light (10-15h)', 'Normal (25-35h)', 'Busy (40+h)'][intensity];
    const weekStart = getStartOfWeek(WEEKS - 1 - i);
    Logger.log(`  Week ${i + 1} (${weekStart.toDateString()}): ${label}`);
  }

  Logger.log(`\nEvent types per calendar:`);
  for (const [calendar, events] of Object.entries(EVENT_TEMPLATES)) {
    Logger.log(`\n  ${calendar}:`);
    for (const event of events) {
      Logger.log(`    - ${event.title} (${event.minDuration}-${event.maxDuration}min)`);
    }
  }
}
