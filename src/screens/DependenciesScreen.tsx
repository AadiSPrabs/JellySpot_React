import React from 'react';
import { View, StyleSheet, FlatList, Linking } from 'react-native';
import { Text, List, IconButton, useTheme, Divider, TouchableRipple } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

interface Dependency {
    name: string;
    github?: string;
}

const dependencies: Dependency[] = [
    { name: '@nodefinity/react-native-music-library', github: 'https://github.com/nicotsx/react-native-music-library' },
    { name: '@react-native-async-storage/async-storage', github: 'https://github.com/react-native-async-storage/async-storage' },
    { name: '@react-native-community/slider', github: 'https://github.com/callstack/react-native-slider' },
    { name: '@react-navigation/bottom-tabs', github: 'https://github.com/react-navigation/react-navigation' },
    { name: '@react-navigation/drawer', github: 'https://github.com/react-navigation/react-navigation' },
    { name: '@react-navigation/native', github: 'https://github.com/react-navigation/react-navigation' },
    { name: '@react-navigation/native-stack', github: 'https://github.com/react-navigation/react-navigation' },
    { name: 'axios', github: 'https://github.com/axios/axios' },
    { name: 'blurhash', github: 'https://github.com/woltapp/blurhash' },
    { name: 'drizzle-orm', github: 'https://github.com/drizzle-team/drizzle-orm' },
    { name: 'expo', github: 'https://github.com/expo/expo' },
    { name: 'expo-background-fetch', github: 'https://github.com/expo/expo/tree/main/packages/expo-background-fetch' },
    { name: 'expo-blur', github: 'https://github.com/expo/expo/tree/main/packages/expo-blur' },
    { name: 'expo-build-properties', github: 'https://github.com/expo/expo/tree/main/packages/expo-build-properties' },
    { name: 'expo-document-picker', github: 'https://github.com/expo/expo/tree/main/packages/expo-document-picker' },
    { name: 'expo-file-system', github: 'https://github.com/expo/expo/tree/main/packages/expo-file-system' },
    { name: 'expo-haptics', github: 'https://github.com/expo/expo/tree/main/packages/expo-haptics' },
    { name: 'expo-image', github: 'https://github.com/expo/expo/tree/main/packages/expo-image' },
    { name: 'expo-image-picker', github: 'https://github.com/expo/expo/tree/main/packages/expo-image-picker' },
    { name: 'expo-linear-gradient', github: 'https://github.com/expo/expo/tree/main/packages/expo-linear-gradient' },
    { name: 'expo-media-library', github: 'https://github.com/expo/expo/tree/main/packages/expo-media-library' },
    { name: 'expo-network', github: 'https://github.com/expo/expo/tree/main/packages/expo-network' },
    { name: 'expo-notifications', github: 'https://github.com/expo/expo/tree/main/packages/expo-notifications' },
    { name: 'expo-sqlite', github: 'https://github.com/expo/expo/tree/main/packages/expo-sqlite' },
    { name: 'expo-status-bar', github: 'https://github.com/expo/expo/tree/main/packages/expo-status-bar' },
    { name: 'expo-system-ui', github: 'https://github.com/expo/expo/tree/main/packages/expo-system-ui' },
    { name: 'lottie-react-native', github: 'https://github.com/lottie-react-native/lottie-react-native' },
    { name: 'lucide-react-native', github: 'https://github.com/lucide-icons/lucide' },
    { name: 'react', github: 'https://github.com/facebook/react' },
    { name: 'react-native', github: 'https://github.com/facebook/react-native' },
    { name: 'react-native-draggable-flatlist', github: 'https://github.com/computerjazz/react-native-draggable-flatlist' },
    { name: 'react-native-gesture-handler', github: 'https://github.com/software-mansion/react-native-gesture-handler' },
    { name: 'react-native-image-colors', github: 'https://github.com/osamaqarem/react-native-image-colors' },
    { name: 'react-native-paper', github: 'https://github.com/callstack/react-native-paper' },
    { name: 'react-native-reanimated', github: 'https://github.com/software-mansion/react-native-reanimated' },
    { name: 'react-native-safe-area-context', github: 'https://github.com/th3rdwave/react-native-safe-area-context' },
    { name: 'react-native-screens', github: 'https://github.com/software-mansion/react-native-screens' },
    { name: 'react-native-svg', github: 'https://github.com/software-mansion/react-native-svg' },
    { name: 'react-native-track-player', github: 'https://github.com/doublesymmetry/react-native-track-player' },
    { name: 'react-native-worklets', github: 'https://github.com/margelo/react-native-worklets' },
    { name: 'zustand', github: 'https://github.com/pmndrs/zustand' },
];

export default function DependenciesScreen() {
    const theme = useTheme();
    const navigation = useNavigation();

    const handlePress = (github?: string) => {
        if (github) {
            Linking.openURL(github);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
            <View style={styles.appBar}>
                <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
                <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>Dependencies</Text>
            </View>

            <Text variant="bodySmall" style={{ paddingHorizontal: 16, color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                Tap on a package to view its GitHub repository
            </Text>

            <FlatList
                data={dependencies}
                keyExtractor={(item) => item.name}
                renderItem={({ item }) => (
                    <TouchableRipple
                        onPress={() => handlePress(item.github)}
                        disabled={!item.github}
                    >
                        <List.Item
                            title={item.name}
                            titleStyle={{ color: item.github ? theme.colors.primary : theme.colors.onSurface }}
                            left={props => <List.Icon {...props} icon="package-variant" />}
                            right={props => item.github ? <List.Icon {...props} icon="open-in-new" /> : null}
                        />
                    </TouchableRipple>
                )}
                ItemSeparatorComponent={Divider}
                contentContainerStyle={styles.listContent}
            />
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
        marginBottom: 8,
    },
    listContent: {
        paddingBottom: 24,
    },
});
