import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Text, List, useTheme, IconButton, RadioButton, Switch } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useSettingsStore, BackgroundType } from '../store/settingsStore';

const THEME_COLORS = [
    '#D0BCFF', // Default Purple
    '#F2B8B5', // Pink
    '#F9DEDC', // Soft Red
    '#EADDFF', // Light Purple
    '#B0C4DE', // Light Steel Blue
    '#98FB98', // Pale Green
    '#FFD700', // Gold
    '#FF6347', // Tomato
];

const BACKGROUND_OPTIONS: { label: string; value: BackgroundType; description: string }[] = [
    { label: 'Off', value: 'off', description: 'Use default dark background' },
    { label: 'Blurred Image', value: 'blurred', description: 'Heavily blurred album artwork' },
    { label: 'Dominant Color', value: 'blurhash', description: 'Solid color from artwork with adaptive icons' },
];

export default function AppearanceScreen() {
    const theme = useTheme();
    const navigation = useNavigation();
    const { backgroundType, themeColor, isAmoledMode, setBackgroundType, setThemeColor, setAmoledMode } = useSettingsStore();
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
            <View style={[styles.appBar, isLandscape && styles.appBarLandscape]}>
                <IconButton icon="arrow-left" onPress={() => navigation.goBack()} size={isLandscape ? 20 : 24} />
                <Text variant={isLandscape ? "titleMedium" : "titleLarge"} style={{ fontWeight: 'bold' }}>Appearance</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <List.Section>
                    <List.Subheader>Player Background</List.Subheader>
                    <RadioButton.Group
                        onValueChange={(value) => setBackgroundType(value as BackgroundType)}
                        value={backgroundType}
                    >
                        {BACKGROUND_OPTIONS.map(option => (
                            <List.Item
                                key={option.value}
                                title={option.label}
                                description={option.description}
                                left={() => (
                                    <RadioButton value={option.value} />
                                )}
                                onPress={() => setBackgroundType(option.value)}
                                style={styles.radioItem}
                            />
                        ))}
                    </RadioButton.Group>
                </List.Section>

                <List.Section>
                    <List.Subheader>Theme Color</List.Subheader>
                    <View style={styles.colorGrid}>
                        {THEME_COLORS.map(color => (
                            <TouchableOpacity
                                key={color}
                                style={[
                                    styles.colorSwatch,
                                    { backgroundColor: color },
                                    themeColor === color && styles.selectedSwatch
                                ]}
                                onPress={() => setThemeColor(color)}
                            >
                                {themeColor === color && (
                                    <IconButton icon="check" iconColor="#000" size={20} />
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </List.Section>

                <List.Section>
                    <List.Subheader>Display</List.Subheader>
                    <List.Item
                        title="AMOLED Mode"
                        description="Use pure black background"
                        left={props => <List.Icon {...props} icon="brightness-2" />}
                        right={() => (
                            <Switch
                                value={isAmoledMode}
                                onValueChange={setAmoledMode}
                            />
                        )}
                    />
                </List.Section>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    appBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        marginBottom: 16,
    },
    appBarLandscape: {
        marginBottom: 8,
        paddingVertical: 4,
    },
    content: {
        paddingBottom: 40,
    },
    radioItem: {
        paddingLeft: 8,
    },
    colorGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 16,
        gap: 16,
    },
    colorSwatch: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    selectedSwatch: {
        borderColor: '#FFF',
    },
    dropdownContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
});
