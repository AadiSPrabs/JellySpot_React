import React from 'react';
import { View, StyleSheet, useWindowDimensions, Platform, Pressable } from 'react-native';
import { createBottomTabNavigator, BottomTabBar, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainTabParamList, HomeStackParamList, SearchStackParamList, LibraryStackParamList, DownloadsStackParamList } from '../types/navigation';
import HomeScreen from '../screens/HomeScreen';
import SearchScreen from '../screens/SearchScreen';
import LibraryScreen from '../screens/LibraryScreen';
import DetailScreen from '../screens/DetailScreen';
import { Colors } from '../constants/Colors';
import { Home, Search, Library, Download } from 'lucide-react-native';
import { useTheme, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettingsStore } from '../store/settingsStore';

const Tab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const SearchStack = createNativeStackNavigator<SearchStackParamList>();
const LibraryStack = createNativeStackNavigator<LibraryStackParamList>();
const DownloadsStack = createNativeStackNavigator<DownloadsStackParamList>();

import SettingsScreen from '../screens/SettingsScreen';
import AppearanceScreen from '../screens/AppearanceScreen';
import PlaybackSettingsScreen from '../screens/PlaybackSettingsScreen';
import StorageSettingsScreen from '../screens/StorageSettingsScreen';
import SourceModeSettingsScreen from '../screens/SourceModeSettingsScreen';
import DependenciesScreen from '../screens/DependenciesScreen';
import DownloadsScreen from '../screens/DownloadsScreen';
import DownloadSettingsScreen from '../screens/DownloadSettingsScreen';

// Width of the left tab bar in landscape mode - exported for use by MiniPlayer
export const LEFT_BAR_WIDTH = 100;

// Base tab configuration
const BASE_TAB_CONFIG = [
    { name: 'HomeStack', label: 'Home', icon: Home },
    { name: 'SearchStack', label: 'Search', icon: Search },
    { name: 'LibraryStack', label: 'Library', icon: Library },
    { name: 'DownloadsStack', label: 'Downloads', icon: Download },
];

// Custom Tab Bar that switches to vertical left-side layout in landscape
function CustomTabBar(props: BottomTabBarProps & { isLandscape: boolean; isLocalOnly: boolean }) {
    const { state, descriptors, navigation, isLandscape, isLocalOnly, insets, ...rest } = props;
    const theme = useTheme();
    const safeInsets = useSafeAreaInsets();

    // Filter tab config based on mode - hide Downloads in local-only mode
    const TAB_CONFIG = isLocalOnly
        ? BASE_TAB_CONFIG.filter(tab => tab.name !== 'DownloadsStack')
        : BASE_TAB_CONFIG;

    // Portrait -> default bottom bar
    if (!isLandscape) {
        return (
            <BottomTabBar
                state={state}
                descriptors={descriptors}
                navigation={navigation}
                insets={insets || safeInsets}
                {...rest}
            />
        );
    }

    // Landscape -> custom vertical tab bar on the left
    return (
        <View style={[
            styles.leftContainer,
            {
                backgroundColor: Colors.tabBar,
                paddingTop: safeInsets.top,
                paddingBottom: safeInsets.bottom,
                left: -LEFT_BAR_WIDTH, // Counteract parent's paddingLeft
            }
        ]}>
            {state.routes.map((route, index) => {
                const { options } = descriptors[route.key];
                const isFocused = state.index === index;

                // Get the icon component from our config
                const tabConfig = TAB_CONFIG.find(t => t.name === route.name);
                const IconComponent = tabConfig?.icon || Home;
                const label = tabConfig?.label || route.name;

                const onPress = () => {
                    const event = navigation.emit({
                        type: 'tabPress',
                        target: route.key,
                        canPreventDefault: true,
                    });

                    if (!isFocused && !event.defaultPrevented) {
                        navigation.navigate(route.name);
                    }
                };

                const onLongPress = () => {
                    navigation.emit({
                        type: 'tabLongPress',
                        target: route.key,
                    });
                };

                const color = isFocused ? theme.colors.primary : Colors.textSecondary;

                return (
                    <Pressable
                        key={route.key}
                        accessibilityRole="button"
                        accessibilityState={isFocused ? { selected: true } : {}}
                        accessibilityLabel={options.tabBarAccessibilityLabel}
                        onPress={onPress}
                        onLongPress={onLongPress}
                        style={[
                            styles.leftTabItem,
                            isFocused && { backgroundColor: theme.colors.primaryContainer + '40' }
                        ]}
                    >
                        <IconComponent color={color} size={22} />
                        <Text
                            style={[
                                styles.leftTabLabel,
                                { color }
                            ]}
                            numberOfLines={1}
                        >
                            {label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

function HomeStackNavigator() {
    const theme = useTheme();
    return (
        <HomeStack.Navigator screenOptions={{ headerShown: false, animation: 'default', contentStyle: { backgroundColor: theme.colors.background } }}>
            <HomeStack.Screen name="Home" component={HomeScreen} />
            <HomeStack.Screen name="Detail" component={DetailScreen} />
            <HomeStack.Screen name="Settings" component={SettingsScreen} />
            <HomeStack.Screen name="Appearance" component={AppearanceScreen} />
            <HomeStack.Screen name="PlaybackSettings" component={PlaybackSettingsScreen} />
            <HomeStack.Screen name="StorageSettings" component={StorageSettingsScreen} />
            <HomeStack.Screen name="SourceModeSettings" component={SourceModeSettingsScreen} />
            <HomeStack.Screen name="DownloadSettings" component={DownloadSettingsScreen} />
            <HomeStack.Screen name="Dependencies" component={DependenciesScreen} />
        </HomeStack.Navigator>
    );
}

function SearchStackNavigator() {
    const theme = useTheme();
    const { dataSource } = useSettingsStore();
    return (
        <SearchStack.Navigator screenOptions={{ headerShown: false, animation: 'default', contentStyle: { backgroundColor: theme.colors.background } }}>
            <SearchStack.Screen name="Search" component={SearchScreen} />
            <SearchStack.Screen name="Detail" component={DetailScreen} />
            <SearchStack.Screen name="Dependencies" component={DependenciesScreen} />
        </SearchStack.Navigator>
    );
}

function LibraryStackNavigator() {
    const theme = useTheme();
    const { dataSource } = useSettingsStore();
    return (
        <LibraryStack.Navigator screenOptions={{ headerShown: false, animation: 'default', contentStyle: { backgroundColor: theme.colors.background } }}>
            <LibraryStack.Screen name="Library" component={LibraryScreen} />
            <LibraryStack.Screen name="Detail" component={DetailScreen} />
            <LibraryStack.Screen name="Settings" component={SettingsScreen} />
            <LibraryStack.Screen name="Appearance" component={AppearanceScreen} />
            <LibraryStack.Screen name="PlaybackSettings" component={PlaybackSettingsScreen} />
            <LibraryStack.Screen name="StorageSettings" component={StorageSettingsScreen} />
            <LibraryStack.Screen name="SourceModeSettings" component={SourceModeSettingsScreen} />
            <LibraryStack.Screen name="DownloadSettings" component={DownloadSettingsScreen} />
            <LibraryStack.Screen name="Dependencies" component={DependenciesScreen} />
        </LibraryStack.Navigator>
    );
}

function DownloadsStackNavigator() {
    const theme = useTheme();
    return (
        <DownloadsStack.Navigator screenOptions={{ headerShown: false, animation: 'default', contentStyle: { backgroundColor: theme.colors.background } }}>
            <DownloadsStack.Screen name="Downloads" component={DownloadsScreen} />
        </DownloadsStack.Navigator>
    );
}

export default function MainNavigator() {
    const theme = useTheme();
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;
    const { sourceMode, dataSource } = useSettingsStore();

    // Check if we're in local-only mode (sourceMode is 'local' OR in 'both' mode with local selected)
    const isLocalOnly = sourceMode === 'local' || (sourceMode === 'both' && dataSource === 'local');

    return (
        <View
            style={{
                flex: 1,
                backgroundColor: theme.colors.background,
                paddingLeft: isLandscape ? LEFT_BAR_WIDTH : 0,
                // Note: paddingBottom removed for portrait - sceneContainerStyle handles it
            }}
        >
            <Tab.Navigator
                screenOptions={{
                    headerShown: false,
                    sceneStyle: {
                        paddingBottom: isLandscape ? 0 : 90, // Push content up in portrait
                    },
                    tabBarStyle: isLandscape ? {
                        // Landscape: hide the default tab bar completely
                        display: 'none',
                    } : {
                        // Portrait: default bottom bar style
                        backgroundColor: Colors.tabBar,
                        borderTopWidth: 0,
                        position: 'absolute',
                        elevation: 0,
                        height: 90,
                        paddingBottom: 0,
                        paddingTop: 0,
                        justifyContent: 'center',
                    },
                    tabBarActiveTintColor: theme.colors.primary,
                    tabBarInactiveTintColor: Colors.textSecondary,
                    tabBarItemStyle: {
                        justifyContent: 'center',
                        paddingVertical: 10,
                    },
                    tabBarLabelStyle: {
                        fontSize: 12,
                    },
                    animation: 'shift',
                }}
                tabBar={(props) => <CustomTabBar {...props} isLandscape={isLandscape} isLocalOnly={isLocalOnly} />}
            >
                <Tab.Screen
                    name="HomeStack"
                    component={HomeStackNavigator}
                    options={{
                        tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
                        tabBarLabel: 'Home',
                    }}
                />
                <Tab.Screen
                    name="SearchStack"
                    component={SearchStackNavigator}
                    options={{
                        tabBarIcon: ({ color, size }) => <Search color={color} size={size} />,
                        tabBarLabel: 'Search',
                    }}
                />
                <Tab.Screen
                    name="LibraryStack"
                    component={LibraryStackNavigator}
                    options={{
                        tabBarIcon: ({ color, size }) => <Library color={color} size={size} />,
                        tabBarLabel: 'Library',
                    }}
                />
                {/* Downloads tab - only show when Jellyfin is active */}
                {!isLocalOnly && (
                    <Tab.Screen
                        name="DownloadsStack"
                        component={DownloadsStackNavigator}
                        options={{
                            tabBarIcon: ({ color, size }) => <Download color={color} size={size} />,
                            tabBarLabel: 'Downloads',
                        }}
                    />
                )}
            </Tab.Navigator>
        </View>
    );
}

const styles = StyleSheet.create({
    leftContainer: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: LEFT_BAR_WIDTH,
        zIndex: 1000,
        flexDirection: 'column',
        justifyContent: 'space-evenly',
        alignItems: 'center',
        // Shadow for visual separation
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOpacity: 0.15,
                shadowRadius: 8,
                shadowOffset: { width: 2, height: 0 },
            },
            android: {
                elevation: 8,
            },
        }),
    },
    leftTabItem: {
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        paddingHorizontal: 8,
        width: LEFT_BAR_WIDTH - 8,
        borderRadius: 16,
    },
    leftTabLabel: {
        fontSize: 10,
        marginTop: 4,
        textAlign: 'center',
    },
});
