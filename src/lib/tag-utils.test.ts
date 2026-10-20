import { describe, it, expect } from 'vitest';
import {
  parseTagsFromDescription,
  parseTagsInput,
  stripTagsFromDescription,
  mergeTagsIntoDescription,
} from './tag-utils';

describe('parseTagsFromDescription', () => {
  it('returns tags from valid front-matter', () => {
    const desc = '---\ntags: Tag A, Tag B\n---\n\nContent';
    expect(parseTagsFromDescription(desc)).toBe('Tag A, Tag B');
  });

  it('returns empty string when no front-matter', () => {
    expect(parseTagsFromDescription('Just content')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(parseTagsFromDescription('')).toBe('');
  });

  it('returns empty string for malformed YAML (no closing ---)', () => {
    expect(parseTagsFromDescription('---\ntags: Tag A\nContent')).toBe('');
  });

  it('handles front-matter with no body', () => {
    const desc = '---\ntags: Solo\n---\n';
    expect(parseTagsFromDescription(desc)).toBe('Solo');
  });
});

describe('parseTagsInput', () => {
  it('splits comma-separated tags', () => {
    expect(parseTagsInput('Tag A, Tag B, Tag C')).toEqual(['Tag A', 'Tag B', 'Tag C']);
  });

  it('trims whitespace around tags', () => {
    expect(parseTagsInput('  Tag A  ,  Tag B  ')).toEqual(['Tag A', 'Tag B']);
  });

  it('filters empty entries from extra commas', () => {
    expect(parseTagsInput('Tag A,  , Tag B')).toEqual(['Tag A', 'Tag B']);
  });

  it('returns empty array for empty input', () => {
    expect(parseTagsInput('')).toEqual([]);
  });

  it('preserves case', () => {
    expect(parseTagsInput('project-ABC, WORK')).toEqual(['project-ABC', 'WORK']);
  });
});

describe('stripTagsFromDescription', () => {
  it('removes front-matter, preserves body', () => {
    const desc = '---\ntags: Tag A\n---\n\nContent here';
    expect(stripTagsFromDescription(desc)).toBe('Content here');
  });

  it('returns unchanged string when no front-matter', () => {
    expect(stripTagsFromDescription('Just content')).toBe('Just content');
  });

  it('returns empty string for empty input', () => {
    expect(stripTagsFromDescription('')).toBe('');
  });

  it('handles front-matter with no body', () => {
    expect(stripTagsFromDescription('---\ntags: Tag A\n---\n')).toBe('');
  });
});

describe('mergeTagsIntoDescription', () => {
  it('prepends front-matter to description', () => {
    const result = mergeTagsIntoDescription('Meeting notes', 'Tag A, Tag B');
    expect(result).toBe('---\ntags: Tag A, Tag B\n---\n\nMeeting notes');
  });

  it('returns description without front-matter when no tags', () => {
    expect(mergeTagsIntoDescription('Meeting notes', '')).toBe('Meeting notes');
  });

  it('round-trips: strip then re-merge produces same result', () => {
    const original = '---\ntags: Tag A, Tag B\n---\n\nContent';
    const stripped = stripTagsFromDescription(original);
    const remerged = mergeTagsIntoDescription(stripped, 'Tag A, Tag B');
    expect(remerged).toBe(original);
  });

  it('empty tags removes existing front-matter', () => {
    const desc = '---\ntags: Old Tag\n---\n\nContent';
    expect(mergeTagsIntoDescription(desc, '')).toBe('Content');
  });

  it('replaces existing front-matter with new tags', () => {
    const desc = '---\ntags: Old\n---\n\nBody';
    const result = mergeTagsIntoDescription(desc, 'New');
    expect(result).toBe('---\ntags: New\n---\n\nBody');
  });
});
