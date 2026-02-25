import { MD3DarkTheme, configureFonts } from 'react-native-paper';

const fontConfig = {
    fontFamily: 'System',
};

export const theme = {
    ...MD3DarkTheme,
    colors: {
        ...MD3DarkTheme.colors,
        primary: '#D0BCFF', // Example M3 primary
        onPrimary: '#381E72',
        primaryContainer: '#4F378B',
        onPrimaryContainer: '#EADDFF',
        secondary: '#CCC2DC',
        onSecondary: '#332D41',
        secondaryContainer: '#4A4458',
        onSecondaryContainer: '#E8DEF8',
        tertiary: '#EFB8C8',
        onTertiary: '#492532',
        tertiaryContainer: '#633B48',
        onTertiaryContainer: '#FFD8E4',
        background: '#1C1B1F',
        onBackground: '#E6E1E5',
        surface: '#1C1B1F',
        onSurface: '#E6E1E5',
        surfaceVariant: '#49454F',
        onSurfaceVariant: '#CAC4D0',
        outline: '#938F99',
    },
};
