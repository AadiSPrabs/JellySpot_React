import React from 'react';
import { StyleSheet } from 'react-native';
import { List, Divider, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface SettingsItemProps {
    title: string;
    description?: string;
    icon?: IconName;
    right?: () => React.ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    isLast?: boolean; // Injected by SettingsGroup
}

export default function SettingsItem({ title, description, icon, right, onPress, disabled, isLast }: SettingsItemProps) {
    const theme = useTheme();

    return (
        <>
            <List.Item
                title={title}
                description={description}
                titleStyle={{ fontWeight: '500' }}
                descriptionStyle={{ marginTop: 2 }}
                left={icon ? (props) => <List.Icon {...props} icon={icon} color={theme.colors.primary} /> : undefined}
                right={right ? right : undefined}
                onPress={onPress}
                disabled={disabled}
                style={[styles.item, disabled && { opacity: 0.5 }]}
            />
            {!isLast && <Divider style={{ marginLeft: icon ? 56 : 16 }} />}
        </>
    );
}

const styles = StyleSheet.create({
    item: {
        paddingVertical: 4,
    }
});
