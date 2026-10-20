/**
 * Color utility functions for calculating contrast and adaptive text colors
 * Uses WCAG 2.0 relative luminance algorithm for accessibility
 */

/**
 * Converts a hex color string to RGB values
 * @param hex - Hex color string (e.g., "#FF5733" or "FF5733" or "#F57")
 * @returns RGB object with r, g, b values (0-255) or null if invalid
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Remove # if present
  const cleanHex = hex.replace(/^#/, '');

  // Handle 3-digit hex
  if (cleanHex.length === 3) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16);
    const g = parseInt(cleanHex[1] + cleanHex[1], 16);
    const b = parseInt(cleanHex[2] + cleanHex[2], 16);

    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
  }

  // Handle 6-digit hex
  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);

    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
  }

  return null;
}

/**
 * Calculates the relative luminance of an RGB color using WCAG 2.0 formula
 * @param r - Red value (0-255)
 * @param g - Green value (0-255)
 * @param b - Blue value (0-255)
 * @returns Relative luminance value (0-1, where 0 is darkest and 1 is lightest)
 */
export function getRelativeLuminance(r: number, g: number, b: number): number {
  // Normalize RGB values to 0-1 range
  const normalize = (val: number) => {
    const normalized = val / 255;
    // Apply gamma correction (sRGB)
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };

  const rNorm = normalize(r);
  const gNorm = normalize(g);
  const bNorm = normalize(b);

  // WCAG 2.0 relative luminance formula
  return 0.2126 * rNorm + 0.7152 * gNorm + 0.0722 * bNorm;
}

/**
 * Returns an appropriate text color (black or white) based on background color
 * Ensures optimal readability by calculating luminance contrast
 * @param backgroundColor - Background color in hex format (e.g., "#FF5733")
 * @returns Text color as hex string ("#000000" for dark text, "#FFFFFF" for light text)
 */
export function getTextColorForBackground(backgroundColor: string): string {
  const rgb = hexToRgb(backgroundColor);

  // Fallback to white text if color parsing fails
  if (!rgb) return '#FFFFFF';

  const luminance = getRelativeLuminance(rgb.r, rgb.g, rgb.b);

  // If background is light (luminance >= 0.5), use dark text
  // If background is dark (luminance < 0.5), use light text
  return luminance >= 0.5 ? '#000000' : '#FFFFFF';
}

/**
 * Converts RGB to HSL color space
 * @param r - Red (0-255)
 * @param g - Green (0-255)
 * @param b - Blue (0-255)
 * @returns HSL object with h (0-360), s (0-100), l (0-100)
 */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  // Normalize RGB values to 0-1
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    // Calculate saturation
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    // Calculate hue
    if (max === rNorm) {
      h = ((gNorm - bNorm) / delta + (gNorm < bNorm ? 6 : 0)) / 6;
    } else if (max === gNorm) {
      h = ((bNorm - rNorm) / delta + 2) / 6;
    } else {
      h = ((rNorm - gNorm) / delta + 4) / 6;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Converts hex color to HSL
 * @param hex - Hex color string (e.g., "#FF5733")
 * @returns HSL object or null if invalid hex
 */
export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return rgbToHsl(rgb.r, rgb.g, rgb.b);
}

/**
 * Converts HSL to hex color string
 * @param h - Hue (0-360)
 * @param s - Saturation (0-100)
 * @param l - Lightness (0-100)
 * @returns Hex color string (e.g., "#FF5733")
 */
export function hslToHex(h: number, s: number, l: number): string {
  // Normalize values
  const hNorm = h / 360;
  const sNorm = s / 100;
  const lNorm = l / 100;

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  let r, g, b;

  if (sNorm === 0) {
    // Achromatic (gray)
    r = g = b = lNorm;
  } else {
    const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
    const p = 2 * lNorm - q;
    r = hue2rgb(p, q, hNorm + 1 / 3);
    g = hue2rgb(p, q, hNorm);
    b = hue2rgb(p, q, hNorm - 1 / 3);
  }

  // Convert to 0-255 range and format as hex
  const toHex = (val: number) => {
    const hex = Math.round(val * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Generates a 5-level color intensity scale from a base color
 * Constrains saturation and uses fixed lightness levels for visibility
 * @param baseColorHex - Base calendar color as hex string
 * @returns Array of 5 hex colors [intensity0, intensity1, intensity2, intensity3, intensity4]
 */
export function generateColorScale(baseColorHex: string): string[] {
  const hsl = hexToHsl(baseColorHex);

  // Fallback to neutral gray if parsing fails
  if (!hsl) return generateNeutralGrayScale();

  // Constrain saturation to 40-70% for visibility
  const constrainedSaturation = Math.max(40, Math.min(70, hsl.s));

  // Fixed lightness levels for consistent progression
  const lightnessLevels = [95, 80, 60, 45, 30];

  return lightnessLevels.map(lightness =>
    hslToHex(hsl.h, constrainedSaturation, lightness)
  );
}

/**
 * Generates a neutral gray scale (5 levels)
 * @returns Array of 5 hex colors for neutral grays
 */
export function generateNeutralGrayScale(): string[] {
  // Pure grayscale: hsl(0, 0%, L%)
  const lightnessLevels = [95, 80, 60, 45, 30];
  return lightnessLevels.map(lightness => hslToHex(0, 0, lightness));
}
