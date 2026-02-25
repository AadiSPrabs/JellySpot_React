import { decode } from 'blurhash';

/**
 * Extract the dominant color from a blurhash string
 * Returns an RGB color object
 */
export function getDominantColorFromBlurHash(blurHash: string): { r: number; g: number; b: number } | null {
    try {
        // Decode the blurhash to a small 4x4 pixel array (enough to get average color)
        const pixels = decode(blurHash, 4, 4);

        let totalR = 0, totalG = 0, totalB = 0;
        const pixelCount = 16; // 4x4

        // Calculate average color from all pixels
        for (let i = 0; i < pixels.length; i += 4) {
            totalR += pixels[i];
            totalG += pixels[i + 1];
            totalB += pixels[i + 2];
        }

        return {
            r: Math.round(totalR / pixelCount),
            g: Math.round(totalG / pixelCount),
            b: Math.round(totalB / pixelCount),
        };
    } catch (error) {
        console.error('Failed to decode blurhash:', error);
        return null;
    }
}

/**
 * Convert RGB to hex color string
 */
export function rgbToHex(r: number, g: number, b: number): string {
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Get the luminance of a color to determine if it's light or dark
 */
export function getLuminance(r: number, g: number, b: number): number {
    // Using relative luminance formula
    const a = [r, g, b].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

/**
 * Determine if a color is light (returns true) or dark (returns false)
 */
export function isLightColor(r: number, g: number, b: number): boolean {
    return getLuminance(r, g, b) > 0.179;
}

/**
 * Get a contrasting text color (white or black) based on background
 */
export function getContrastColor(r: number, g: number, b: number): string {
    return isLightColor(r, g, b) ? '#000000' : '#FFFFFF';
}

/**
 * Get a muted/secondary contrasting color
 */
export function getSecondaryContrastColor(r: number, g: number, b: number): string {
    return isLightColor(r, g, b) ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)';
}

/**
 * Lighten or darken a color
 */
export function adjustBrightness(r: number, g: number, b: number, factor: number): { r: number; g: number; b: number } {
    return {
        r: Math.min(255, Math.max(0, Math.round(r + (255 - r) * factor))),
        g: Math.min(255, Math.max(0, Math.round(g + (255 - g) * factor))),
        b: Math.min(255, Math.max(0, Math.round(b + (255 - b) * factor))),
    };
}

/**
 * Darken a color by a factor (0-1)
 */
export function darkenColor(r: number, g: number, b: number, factor: number): { r: number; g: number; b: number } {
    return {
        r: Math.round(r * (1 - factor)),
        g: Math.round(g * (1 - factor)),
        b: Math.round(b * (1 - factor)),
    };
}

/**
 * Get player colors based on dominant color from blurhash
 * Returns an object with all the colors needed for the player UI
 */
export function getPlayerColorsFromBlurHash(blurHash: string | null | undefined): {
    backgroundColor: string;
    gradientColors: [string, string];
    textColor: string;
    secondaryTextColor: string;
    iconColor: string;
    activeColor: string;
} | null {
    if (!blurHash) return null;

    const dominantColor = getDominantColorFromBlurHash(blurHash);
    if (!dominantColor) return null;

    const { r, g, b } = dominantColor;
    const isLight = isLightColor(r, g, b);

    // Create a slightly darkened version for gradient
    const darkened = darkenColor(r, g, b, 0.4);

    return {
        backgroundColor: rgbToHex(r, g, b),
        gradientColors: [rgbToHex(r, g, b), rgbToHex(darkened.r, darkened.g, darkened.b)],
        textColor: isLight ? '#000000' : '#FFFFFF',
        secondaryTextColor: isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)',
        iconColor: isLight ? '#000000' : '#FFFFFF',
        activeColor: isLight ? '#000000' : '#FFFFFF',
    };
}

// ============================================
// Hex-based utilities (from PlayerScreen)
// ============================================

/**
 * Determines if a hex color is dark (luminance < 128)
 * Uses YIQ formula for perceived brightness
 */
export const isColorDarkHex = (color: string): boolean => {
    if (!color || !color.startsWith('#')) return true;
    const hex = color.replace('#', '');
    if (hex.length < 6) return true;
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq < 128;
};

/**
 * Lightens a hex color by a given amount (0-1)
 * @param color - Hex color string (#RRGGBB)
 * @param amount - Amount to lighten (0 = no change, 1 = white)
 */
export const lightenHexColor = (color: string, amount: number): string => {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    const newR = Math.min(255, Math.floor(r + (255 - r) * amount));
    const newG = Math.min(255, Math.floor(g + (255 - g) * amount));
    const newB = Math.min(255, Math.floor(b + (255 - b) * amount));

    const toHex = (c: number) => {
        const h = c.toString(16);
        return h.length === 1 ? '0' + h : h;
    };

    return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
};

/**
 * Adjusts a hex color by mixing with white (positive) or black (negative)
 * Uses 60% strength for a clear distinct shade
 * @param color - Hex color string
 * @param amount - Positive to lighten, negative to darken
 */
export const adjustHexColor = (color: string, amount: number): string => {
    if (!color) return color;
    let hex = color.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');

    const num = parseInt(hex, 16);
    let r = (num >> 16) & 0xFF;
    let g = (num >> 8) & 0xFF;
    let b = num & 0xFF;

    const strength = 0.6; // Create a clear distinct shade (60% mix)

    if (amount > 0) {
        // Lighten: Mix with White
        r = r + (255 - r) * strength;
        g = g + (255 - g) * strength;
        b = b + (255 - b) * strength;
    } else {
        // Darken: Mix with Black
        r = r * (1 - strength);
        g = g * (1 - strength);
        b = b * (1 - strength);
    }

    return '#' + (
        (1 << 24) +
        (Math.round(r) << 16) +
        (Math.round(g) << 8) +
        Math.round(b)
    ).toString(16).slice(1);
};

/**
 * Gets a contrasting icon color for a given hex background
 * Returns a lighter or darker shade depending on background luminance
 */
export const getContrastingIconColorFromHex = (bgColor: string): string => {
    return isColorDarkHex(bgColor) ? adjustHexColor(bgColor, 100) : adjustHexColor(bgColor, -100);
};

