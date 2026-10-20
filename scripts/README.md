# Mock Calendar Data Generator

Google Apps Script to generate demo calendar events for showcasing the Calens extension.

## What it creates

**4 Calendars:**
- Exercise (green) - Morning Run, Gym Session, Yoga, Swimming, Cycling
- Relationship (purple) - Family Dinner, Coffee with Friend, Game Night, etc.
- Work (blue) - Blog & Calens project events
- Learning (yellow) - Online Course, Reading, Tech Talk, etc.

**13 weeks of events** with varied patterns:
- Busy weeks (40+ hours): 3-4 out of 13
- Normal weeks (25-35 hours): 6-7 out of 13
- Light weeks (10-15 hours): 2-3 out of 13

**Tags for filtering:**
- All events have `demo` tag (for cleanup)
- Additional tags: `focus`, `social`, `health`, `growth`

## Setup

1. Log into your **secondary** Google account
2. Go to [script.google.com](https://script.google.com)
3. Click "New project"
4. Delete any existing code in the editor
5. Copy the entire contents of `mock-calendar-generator.js` and paste it
6. Save the project (Ctrl/Cmd + S)

## Usage

### Generate Demo Events

1. In the script editor, select `main` from the function dropdown
2. Click "Run" (play button)
3. First run will ask for calendar permissions - click "Review Permissions"
4. Select your account and click "Allow"
5. Wait 2-3 minutes for generation to complete
6. Check the "Execution log" at the bottom for progress
7. Open Google Calendar to see the new calendars and events

### Preview (Optional)

Run `previewGeneration` to see what will be generated without creating any events.

### Cleanup

1. Select `cleanup` from the function dropdown
2. Click "Run"
3. All events with the `demo` tag will be deleted
4. Empty calendars will also be removed

## Demo Scenarios

After running, you can demo these Calens features:

1. **Contribution Graph** - 13 weeks with varied intensity colors
2. **Weekly Bar Chart** - Clear busy vs light week trends
3. **Calendar Filtering** - Toggle Exercise/Relationship/Work/Learning
4. **Tag Filtering** - Filter by focus, social, health, growth
5. **Progress Tracker** - Completed vs planned hours by calendar
6. **Work Projects** - Time split between "Blog:" and "Calens:" events

## Customization

Edit the configuration at the top of the script:

- `WEEKS` - Number of weeks to generate (default: 13)
- `CALENDARS` - Calendar names and colors
- `EVENT_TEMPLATES` - Event types with durations and tags
- `WEEK_PATTERNS` - Which weeks are light (0), normal (1), or busy (2)
