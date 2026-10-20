/**
 * Demo Data Generation
 * Consolidated demo data generation for development and testing
 */

import type { CategoryTimeStats } from '../types/calendar';

/**
 * Generate random category time stats for demo/testing purposes
 * @returns Array of CategoryTimeStats with random data
 */
export function generateRandomCategoryStats(): CategoryTimeStats[] {
  return [
    {
      category: "Work",
      completed: Math.floor(Math.random() * 20) + 10,
      planned: Math.floor(Math.random() * 10) + 5,
      aggregatedEvents: []
    },
    {
      category: "Personal",
      completed: Math.floor(Math.random() * 15) + 5,
      planned: Math.floor(Math.random() * 8) + 3,
      aggregatedEvents: []
    },
    {
      category: "Fitness",
      completed: Math.floor(Math.random() * 10) + 3,
      planned: Math.floor(Math.random() * 5) + 2,
      aggregatedEvents: []
    },
    {
      category: "Learning",
      completed: Math.floor(Math.random() * 12) + 5,
      planned: Math.floor(Math.random() * 7) + 2,
      aggregatedEvents: []
    },
    {
      category: "Social",
      completed: Math.floor(Math.random() * 8) + 2,
      planned: Math.floor(Math.random() * 5) + 1,
      aggregatedEvents: []
    },
  ];
}
