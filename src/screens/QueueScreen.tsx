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
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, interpolate, Extrapolate, SharedValue } from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Separate component for Right Actions to keep QueueItem lean
const RightActions = ({ progress, dragX }: { progress: SharedValue<number>, dragX: SharedValue<number> }) => {
    const styleAnimation = useAnimatedStyle(() => {
        const opacity = interpolate(
            dragX.value,
            [-80, -40, 0],
            [1, 0.5, 0],
            Extrapolate.CLAMP
        );
        return {
            opacity,
            transform: [{ translateX: interpolate(dragX.value, [-80, 0], [0, 20], Extrapolate.CLAMP) }]
        };
    });

    return (
        <Animated.View style={[styles.deleteAction, styleAnimation]}>
            <Icon name="trash-can-outline" size={24} color="white" />
        </Animated.View>
    );
};

// Optimized QueueItem
const QueueItem = React.memo(({
    item,
    drag,
    isActive,
    isCurrent,
    onPress,
    onRemove,
    isDragging
}: {
    item: any,
    drag: () => void,
    isActive: boolean,
    isCurrent: boolean,
    onPress: (item: any) => void,
    onRemove: (id: string) => void,
    isDragging: boolean
}) => {
    const theme = useTheme();
    const themeActiveColor = theme.colors.primary;

    return (
        <Swipeable
            enabled={!isDragging && !isActive} // Disable swipe while dragging
            renderRightActions={(progress, dragX) => <RightActions progress={progress} dragX={dragX} />}
            onSwipeableWillOpen={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onRemove(item.queueItemId || item.id);
            }}
            friction={2}
            rightThreshold={40}
        >
            <TouchableOpacity
                style={[
                    styles.queueItem,
                    isCurrent && { backgroundColor: `${themeActiveColor}20` },
                    isActive && { backgroundColor: `${themeActiveColor}30`, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4.65 }
                ]}
                onPress={() => onPress(item)}
                activeOpacity={0.7}
            >
                <TouchableOpacity 
                    style={styles.dragHandleContainer}
                    onLongPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        drag();
                    }}
                    delayLongPress={100}
                >
                    <View style={{ width: 24, height: 24, justifyContent: 'center', alignItems: 'center' }}>
                        <View style={{ width: 14, height: 2, backgroundColor: theme.colors.onSurfaceVariant, marginVertical: 2, borderRadius: 1 }} />
                        <View style={{ width: 14, height: 2, backgroundColor: theme.colors.onSurfaceVariant, marginVertical: 2, borderRadius: 1 }} />
                        <View style={{ width: 14, height: 2, backgroundColor: theme.colors.onSurfaceVariant, marginVertical: 2, borderRadius: 1 }} />
                    </View>
                </TouchableOpacity>

                <Image source={{ uri: item.imageUrl }} style={styles.queueImage} />

                <View style={styles.trackInfo}>
                    <RNText style={[styles.trackName, { color: isCurrent ? themeActiveColor : theme.colors.onSurface }]} numberOfLines={1}>
                        {item.name}
                    </RNText>
                    <RNText style={[styles.trackArtist, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
                        {item.artist}
                    </RNText>
                </View>

                {isCurrent && <View style={[styles.playingDot, { backgroundColor: themeActiveColor }]} />}
            </TouchableOpacity>
        </Swipeable>
    );
}, (prev, next) => (
    prev.item.queueItemId === next.item.queueItemId &&
    prev.isActive === next.isActive &&
    prev.isCurrent === next.isCurrent &&
    prev.isDragging === next.isDragging
));

export default function QueueScreen() {
    const theme = useTheme();
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const listRef = useRef<any>(null);
    const hasScrolledRef = useRef(false);
    const insets = useSafeAreaInsets();

    const { queue, currentTrack, reorderQueue, clearQueue } = usePlayerStore(useShallow(state => ({
        queue: state.queue,
        currentTrack: state.currentTrack,
        reorderQueue: state.reorderQueue,
        clearQueue: state.clearQueue,
    })));

    // Actions from store - stable references
    const playTrack = usePlayerStore.getState().playTrack;
    const removeFromQueue = usePlayerStore.getState().removeFromQueue;

    const themeActiveColor = theme.colors.primary;
    const [listReady, setListReady] = React.useState(false);
    const [isDragging, setIsDragging] = React.useState(false);

    // Initial scroll to current track
    useEffect(() => {
        if (!hasScrolledRef.current && currentTrack && queue.length > 0) {
            const currentIndex = queue.findIndex(t => (t.queueItemId || t.id) === (currentTrack.queueItemId || currentTrack.id));
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
    }, [currentTrack?.queueItemId, currentTrack?.id, queue.length]);

    const currentTrackId = currentTrack?.id;

    const renderItem = useCallback(({ item, drag, isActive }: RenderItemParams<any>) => (
        <QueueItem
            item={item}
            drag={drag}
            isActive={isActive}
            isCurrent={item.id === currentTrackId}
            onPress={playTrack}
            onRemove={removeFromQueue}
            isDragging={isDragging}
        />
    ), [currentTrackId, playTrack, removeFromQueue, isDragging]);

    const handleDragEnd = useCallback(({ from, to }: { from: number, to: number }) => {
        if (from === to) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        reorderQueue(from, to);
    }, [reorderQueue]);

    const keyExtractor = useCallback((item: any, index: number) => item.queueItemId || `queue-${index}-${item.id}`, []);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <View style={styles.header}>
                <IconButton
                    icon="chevron-left"
                    size={28}
                    onPress={() => navigation.goBack()}
                />
                <View style={styles.headerTitleContainer}>
                    <Text variant="titleLarge" style={styles.title}>Queue</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {queue.length} {queue.length === 1 ? 'song' : 'songs'}
                    </Text>
                </View>
                <IconButton
                    icon="trash-can-outline"
                    iconColor={theme.colors.error}
                    size={24}
                    onPress={() => {
                        import('react-native').then(({ Alert }) => {
                            Alert.alert(
                                "Clear Queue",
                                "Are you sure you want to clear the queue? Only the current song will remain.",
                                [
                                    { text: "Cancel", style: "cancel" },
                                    { 
                                        text: "Clear", 
                                        style: "destructive", 
                                        onPress: () => {
                                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                                            clearQueue();
                                        }
                                    }
                                ]
                            );
                        });
                    }}
                />
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
                    onDragBegin={() => setIsDragging(true)}
                    onDragEnd={(params) => {
                        setIsDragging(false);
                        handleDragEnd(params);
                    }}
                    contentContainerStyle={[
                        styles.listContent,
                        { opacity: listReady ? 1 : 0 }
                    ]}
                    showsVerticalScrollIndicator={true}
                    initialNumToRender={15}
                    maxToRenderPerBatch={10}
                    windowSize={11} // Increased for smoother scrolling
                    removeClippedSubviews={false}
                    getItemLayout={(data, index) => ({ length: 66, offset: 66 * index, index })}
                    activationDistance={15}
                    containerStyle={{ flex: 1 }}
                />

                {/* Bottom Action Bar */}
                <View style={[styles.bottomBar, { paddingBottom: insets.bottom || 16, borderTopColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
                    <Button
                        mode="contained"
                        onPress={() => navigation.goBack()}
                        style={[styles.bottomButton, { flex: 1 }]}
                    >
                        Close
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
    deleteAction: {
        backgroundColor: '#ff4444',
        justifyContent: 'center',
        alignItems: 'center',
        width: 80,
        height: 64,
        borderRadius: 12,
    },
});
