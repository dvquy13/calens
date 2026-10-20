import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Re-export decodeEventId from event-id-utils for backward compatibility
export { decodeEventId } from './event-id-utils';
