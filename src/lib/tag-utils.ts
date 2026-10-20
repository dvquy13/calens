/**
 * Tag Utilities for Event Tags Feature
 *
 * Provides functions to parse, strip, and merge tags in YAML front-matter format
 * within event descriptions.
 */

/**
 * Parses tags from YAML front-matter at the beginning of a description.
 *
 * @param description - The full description string potentially containing front-matter
 * @returns Plain comma-separated tags string (case-sensitive), or empty string if no tags found
 *
 * @example
 * const desc = "---\ntags: Tag A, Tag B\n---\n\nContent";
 * parseTagsFromDescription(desc); // Returns: "Tag A, Tag B"
 */
export function parseTagsFromDescription(description: string): string {
  if (!description) return '';

  // Match YAML front-matter at the beginning: ---\ntags: VALUE\n---\n*
  // Trailing newlines are optional (handles events with no description body)
  const frontMatterRegex = /^---\s*\ntags:\s*([^\n]+)\n---\s*\n*/;
  const match = description.match(frontMatterRegex);

  if (match && match[1]) {
    return match[1].trim();
  }

  return '';
}

/**
 * Parses tags input string into an array of individual tags.
 *
 * @param input - Comma-separated tags string
 * @returns Array of trimmed tags (preserves case, filters empty strings only)
 *
 * @example
 * parseTagsInput("Tag A, Tag B,  , project-123");
 * // Returns: ["Tag A", "Tag B", "project-123"]
 */
export function parseTagsInput(input: string): string[] {
  if (!input) return [];

  return input
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0);
}

/**
 * Strips YAML front-matter block from description, returning only content.
 *
 * @param description - The full description string potentially containing front-matter
 * @returns Description content without front-matter
 *
 * @example
 * const desc = "---\ntags: Tag A\n---\n\nContent";
 * stripTagsFromDescription(desc); // Returns: "Content"
 */
export function stripTagsFromDescription(description: string): string {
  if (!description) return '';

  // Remove front-matter block if present
  // Trailing newlines are optional (handles events with no description body)
  const frontMatterRegex = /^---\s*\ntags:\s*[^\n]+\n---\s*\n*/;
  return description.replace(frontMatterRegex, '');
}

/**
 * Merges tags into description as YAML front-matter at the beginning.
 *
 * @param description - The description content (will be stripped of existing front-matter)
 * @param tagsInput - Comma-separated tags string
 * @returns Description with front-matter prepended, or just description if no tags
 *
 * @example
 * mergeTagsIntoDescription("Meeting notes", "Tag A, Tag B");
 * // Returns: "---\ntags: Tag A, Tag B\n---\n\nMeeting notes"
 *
 * mergeTagsIntoDescription("Meeting notes", "");
 * // Returns: "Meeting notes"
 */
export function mergeTagsIntoDescription(description: string, tagsInput: string): string {
  // Strip any existing front-matter
  const cleanDescription = stripTagsFromDescription(description || '');

  // Parse tags and filter empty ones
  const tags = parseTagsInput(tagsInput);

  // If no tags, return description without front-matter
  if (tags.length === 0) {
    return cleanDescription;
  }

  // Create front-matter with tags
  const frontMatter = `---\ntags: ${tags.join(', ')}\n---\n\n`;

  return frontMatter + cleanDescription;
}
