# Changelog

All notable changes to Calens will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.2.7] - 2026-10-19

### Fixed

- Dragging an event's top edge failed with "could not parse time format" in 12-hour time when the start time showed no am/pm (e.g. "1 – 4:45pm"); times like "1:30 – 4:45pm" were misread as 1:30 AM
- Diagnostics now says to reload the extension when the background service doesn't respond, instead of a generic error
- The store package no longer includes a stray manifest backup file

## [0.0.2.6] - 2026-10-13

### Added

- **Diagnostics reports**: the Diagnostics section shows a live, filterable log and can send a report (IDs and technical logs only, no event content) to the Calens team, or copy it. Error boxes in the side panel link straight to it

### Changed

- Community moved from Telegram to Discord ("Chat with Founder" now opens the Discord invite)

### Fixed

- "Event not found" no longer appears after creating an event and clicking it right away
- Diagnostics "Last sync" was always blank
- Access tokens are no longer printed to the browser console

## [0.0.1.0] - 2026-01-13

### Added

- **This Week Bar Chart**: Activity Lens displays inline horizontal bars next to each weekday showing hours tracked for the current week
- **Tag Aggregation Mode**: New "Tag" button in sidepanel Time Chart groups events by tag
- **Unified Color Detection**: Filter badges and color scale match calendar color when all filtered events share the same color

### Changed

- Contribution graph month labels now always display the most recent month
- Weekly bar chart layout aligned with contribution graph
- Activity Lens shows week date range header above bar chart section
- Homepage demo uses deterministic data for consistent display

### Fixed

- Horizontal bar colors now match corresponding contribution cell intensity
- Privacy policy URL corrected

## [0.0.0.2] - 2026-01-05

### Added

- Toggle for Calendar Progress chart aggregation mode (Calendar vs Title grouping)
- Tab/Shift+Tab support for indenting and outdenting list items in the description markdown editor
- "Chat with Founder" link (Telegram) in sidepanel footer
- Chrome Web Store link in homepage navigation

### Fixed

- Authentication flow now properly completes sign-in when token is already available
- Event details panel no longer opens for newly created events (previously showed "Event not found" error)

## [0.0.0.1] - Initial Release

### Added

- Google Calendar analytics with time tracking
- Calendar progress chart showing completed vs planned hours
- Event details panel with markdown description editor
- Contribution graph visualization
- Chrome Identity API integration for secure OAuth
- Privacy-focused on-device data processing
