import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Surface, useTheme, Text } from 'react-native-paper';

interface SettingsGroupProps {
    title?: string;
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

export default function SettingsGroup({ title, children, style }: SettingsGroupProps) {
    const theme = useTheme();

    return (
        <View style={[{ marginBottom: 24, marginHorizontal: 16 }, style]}>
            {title && (
                <Text
                    variant="labelLarge"
                    style={{
                        color: theme.colors.primary,
                        fontWeight: '600',
                        marginBottom: 8,
                        marginLeft: 8,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5
                    }}
                >
                    {title}
                </Text>
            )}
            <Surface
                style={[
                    styles.surface,
                    { backgroundColor: theme.colors.elevation.level1 }
                ]}
                elevation={1}
            >
                {/* Clone children to inject `isLast` prop so we can hide the divider on the last item */}
                {React.Children.map(children, (child, index) => {
                    if (React.isValidElement(child)) {
                        return React.cloneElement(child as React.ReactElement<any>, {
                            isLast: index === React.Children.count(children) - 1
                        });
                    }
                    return child;
                })}
            </Surface>
        </View>
    );
}

const styles = StyleSheet.create({
    surface: {
        borderRadius: 16,
        overflow: 'hidden',
    },
});
