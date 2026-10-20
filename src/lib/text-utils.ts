/**
 * Text measurement utilities for SVG rendering
 */

let canvas: HTMLCanvasElement | null = null;

/**
 * Calculates the width of text in pixels for SVG rendering
 * Uses canvas measureText for accurate measurements
 *
 * @param text - The text to measure
 * @param fontSize - Font size in pixels (default: 10)
 * @param fontFamily - Font family (default: 'Google Sans Flex, sans-serif')
 * @returns Width in pixels including 2px padding buffer, or null if measurement fails
 */
export function getTextWidth(
  text: string,
  fontSize: number = 10,
  fontFamily: string = 'Google Sans Flex, sans-serif'
): number | null {
  try {
    // Create singleton canvas element for performance
    if (!canvas) {
      canvas = document.createElement('canvas');
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }

    // Set font to match SVG text rendering
    context.font = `${fontSize}px ${fontFamily}`;

    // Measure text width
    const metrics = context.measureText(text);

    // Add 2px padding buffer for safety margin
    return metrics.width + 2;
  } catch (error) {
    // Gracefully handle any errors
    console.warn('Failed to measure text width:', error);
    return null;
  }
}
