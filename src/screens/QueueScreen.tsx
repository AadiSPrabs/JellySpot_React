import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, Dimensions, TouchableOpacity, Text as RNText, Platform, ActivityIndicator, StatusBar } from 'react-native';
import { Image } from 'expo-image';
import { Text, useTheme, IconButton } from 'react-native-paper';
import { usePlayerStore } from '../store/playerStore';
import { useShallow } from 'zustand/react/shallow';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from 'react-native-paper';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Optimized QueueItem
const QueueItem = React.memo(({
    item,
    drag,
    isActive,
    isCurrent,
    themeActiveColor,
    theme,
    onPress,
    onRemove
}: {
    item: any,
    drag: () => void,
    isActive: boolean,
    isCurrent: boolean,
    themeActiveColor: string,
    theme: any,
    onPress: (item: any) => void,
    onRemove: (id: string) => void
}) => (
    <TouchableOpacity
        style={[
            styles.queueItem,
            isCurrent && { backgroundColor: `${themeActiveColor}20` },
            isActive && { backgroundColor: `${themeActiveColor}30` }
        ]}
        onPress={() => onPress(item)}
        onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            drag();
        }}
        delayLongPress={200}
        activeOpacity={0.7}
    >
        <View style={styles.dragHandleContainer}>
            <View style={{ width: 24, height: 24, justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ width: 14, height: 2, backgroundColor: theme.colors.onSurfaceVariant, marginVertical: 2, borderRadius: 1 }} />
                <View style={{ width: 14, height: 2, backgroundColor: theme.colors.onSurfaceVariant, marginVertical: 2, borderRadius: 1 }} />
                <View style={{ width: 14, height: 2, backgroundColor: theme.colors.onSurfaceVariant, marginVertical: 2, borderRadius: 1 }} />
            </View>
        </View>

        <Image source={{ uri: item.imageUrl }} style={styles.queueImage} />

        <View style={styles.trackInfo}>
            <Text style={[styles.trackName, { color: isCurrent ? themeActiveColor : theme.colors.onSurface }]} numberOfLines={1}>
                {item.name}
            </Text>
            <Text style={[styles.trackArtist, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
                {item.artist}
            </Text>
        </View>

        {isCurrent && <View style={[styles.playingDot, { backgroundColor: themeActiveColor }]} />}

        <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => onRemove(item.queueItemId || item.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
            <Icon name="close" size={20} color={theme.colors.onSurfaceVariant} />
        </TouchableOpacity>
    </TouchableOpacity>
), (prev, next) => (
    (prev.item.queueItemId === next.item.queueItemId || prev.item.id === next.item.id) &&
    prev.isActive === next.isActive &&
    prev.isCurrent === next.isCurrent &&
    prev.themeActiveColor === next.themeActiveColor
));

export default function QueueScreen() {
    const theme = useTheme();
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const listRef = useRef<any>(null);
    const hasScrolledRef = useRef(false);
    const insets = useSafeAreaInsets();

    const { queue, currentTrack, playTrack, reorderQueue, removeFromQueue, clearQueue } = usePlayerStore(useShallow(state => ({
        queue: state.queue,
        currentTrack: state.currentTrack,
        playTrack: state.playTrack,
        reorderQueue: state.reorderQueue,
        removeFromQueue: state.removeFromQueue,
        clearQueue: state.clearQueue,
    })));

    const themeActiveColor = theme.colors.primary;
    const [listReady, setListReady] = React.useState(false);

    // Initial scroll to current track
    useEffect(() => {
        if (!hasScrolledRef.current && currentTrack && queue.length > 0) {
            const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
            if (currentIndex >= 0) {
                const timer = setTimeout(() => {
                    try {
                        listRef.current?.scrollToIndex({
                            index: currentIndex,
                            animated: false,
                            viewPosition: 0.1
                        });
                    } catch (e) {
                        // Fallback for safety
                    }
                    setListReady(true);
                    hasScrolledRef.current = true;
                }, 100);
                return () => clearTimeout(timer);
            } else {
                setListReady(true);
            }
        } else if (!currentTrack || queue.length === 0) {
            setListReady(true);
        }
    }, [currentTrack?.id, queue.length]);

    const renderItem = useCallback(({ item, drag, isActive }: RenderItemParams<any>) => (
        <QueueItem
            item={item}
            drag={drag}
            isActive={isActive}
            isCurrent={item.id === currentTrack?.id}
            themeActiveColor={themeActiveColor}
            theme={theme}
            onPress={playTrack}
            onRemove={removeFromQueue}
        />
    ), [currentTrack?.id, themeActiveColor, theme, playTrack, removeFromQueue]);

    const handleDragEnd = useCallback(({ from, to }: { from: number, to: number }) => {
        if (from === to) return;
        reorderQueue(from, to);
    }, [reorderQueue]);

    const keyExtractor = useCallback((item: any, index: number) => item.queueItemId || item.id, []);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerTitleContainer}>
                    <Text variant="titleLarge" style={styles.title}>Queue</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {queue.length} songs
                    </Text>
                </View>
            </View>

            <View style={{ flex: 1 }}>
                {!listReady && (
                    <View style={styles.loaderContainer}>
                        <ActivityIndicator size="large" color={theme.colors.primary} />
                    </View>
                )}

                <DraggableFlatList
                    ref={listRef}
                    data={queue}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    onDragEnd={handleDragEnd}
                    contentContainerStyle={[
                        styles.listContent,
                        { opacity: listReady ? 1 : 0 }
                    ]}
                    showsVerticalScrollIndicator={true}
                    initialNumToRender={10}
                    maxToRenderPerBatch={5}
                    windowSize={5}
                    removeClippedSubviews={true}
                    getItemLayout={(data, index) => ({ length: 66, offset: 66 * index, index })}
                    activationDistance={10}
                    containerStyle={{ flex: 1 }}
                />

                {/* Bottom Action Bar */}
                <View style={[styles.bottomBar, { paddingBottom: insets.bottom || 16, borderTopColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
                    <Button
                        mode="contained-tonal"
                        onPress={() => navigation.goBack()}
                        style={styles.bottomButton}
                        icon="chevron-left"
                    >
                        Back
                    </Button>
                    <Button
                        mode="text"
                        onPress={() => {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                            clearQueue();
                        }}
                        style={styles.bottomButton}
                        textColor={theme.colors.error}
                        icon="trash-can-outline"
                    >
                        Clear Queue
                    </Button>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        height: 64,
    },
    headerTitleContainer: {
        flex: 1,
        marginLeft: 16,
    },
    title: {
        fontWeight: 'bold',
    },
    loaderContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 100, // Extra padding for bottom bar
    },
    bottomBar: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingTop: 12,
        borderTopWidth: 1,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    bottomButton: {
        borderRadius: 12,
    },
    queueItem: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 64,
        borderRadius: 12,
        marginBottom: 2,
        paddingRight: 8,
    },
    dragHandleContainer: {
        paddingHorizontal: 12,
        opacity: 0.5,
    },
    queueImage: {
        width: 44,
        height: 44,
        borderRadius: 8,
        marginRight: 12,
        backgroundColor: '#2a2a2a',
    },
    trackInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    trackName: {
        fontSize: 16,
        fontWeight: '600',
    },
    trackArtist: {
        fontSize: 13,
        marginTop: 2,
        opacity: 0.7,
    },
    playingDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginHorizontal: 12,
    },
    deleteButton: {
        padding: 12,
        opacity: 0.6,
    },
});
