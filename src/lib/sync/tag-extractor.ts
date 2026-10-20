/**
 * Tag Extractor
 * Extracts tags from event descriptions
 */

import { TagStore } from '@/types/database';
import { parseTagsFromDescription, parseTagsInput } from '../tag-utils';

/**
 * Extracts tags from event description and creates TagStore objects
 */
export function extractTagsForEvent(
  userEmail: string,
  eventId: string,
  calendarId: string,
  description?: string
): Omit<TagStore, 'id'>[] {
  if (!description) return [];

  // Parse tags from YAML front-matter
  const tagsString = parseTagsFromDescription(description);
  if (!tagsString) return [];

  // Convert to array
  const tagNames = parseTagsInput(tagsString);

  // Create TagStore object for each tag
  return tagNames.map(tagName => ({
    user_email: userEmail,
    event_id: eventId,
    calendar_id: calendarId,
    tag_name: tagName,
    created_at: new Date()
  }));
}
