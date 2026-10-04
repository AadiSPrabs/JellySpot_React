import { MD3DarkTheme } from 'react-native-paper';

/**
 * Jellyspot dark theme.
 *
 * Built on Material 3, because react-native-paper needs a complete MD3 colour
 * set to render its components. The neutrals are deliberately tinted rather
 * than left at the stock baseline.
 *
 * MD3 ships surfaces at a neutral/near-violet `#1C1B1F` with a lavender
 * `#D0BCFF` primary. Unmodified that reads as the Material showcase rather than
 * as this app, and it is the palette a great many generated interfaces land on.
 *
 * These surfaces are tinted toward the deep teal of the player's default
 * gradient, so the app's chrome and its one genuinely authored screen share a
 * family. The tint is subtle on purpose - a few points of blue-green in the
 * neutrals. The product's colour identity comes from the album-art accent
 * system, and a heavier tint here would compete with it.
 *
 * `primary` is a low-saturation mint so that MD3 components which are not given
 * an album-derived colour (dialogs, snackbars, switches, ripples) still look
 * intentional on the screens where the player is absent.
 */
export const theme = {
    ...MD3DarkTheme,
    colors: {
        ...MD3DarkTheme.colors,

        // --- Accent -----------------------------------------------------------
        primary: '#8FD6C0',
        onPrimary: '#00382C',
        primaryContainer: '#005142',
        onPrimaryContainer: '#ABF2DB',

        secondary: '#B2CCC2',
        onSecondary: '#1D352D',
        secondaryContainer: '#344C43',
        onSecondaryContainer: '#CEE8DE',

        tertiary: '#A8CCD6',
        onTertiary: '#0A353F',
        tertiaryContainer: '#244C56',
        onTertiaryContainer: '#C4E8F2',

        // --- Surfaces ---------------------------------------------------------
        // Tinted toward the teal hue. Never pure black, never neutral grey.
        background: '#101614',
        onBackground: '#DFE4E1',
        surface: '#101614',
        onSurface: '#DFE4E1',
        surfaceVariant: '#3F4946',
        onSurfaceVariant: '#BEC9C5',

        // --- Lines and status -------------------------------------------------
        outline: '#899390',
        outlineVariant: '#3F4946',
        error: '#FFB4AB',
        onError: '#690005',
        errorContainer: '#93000A',
        onErrorContainer: '#FFDAD6',
    },
};
