import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../types/navigation';
import ServerSelectScreen from '../screens/auth/ServerSelectScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import { Colors } from '../constants/Colors';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
    return (
        <Stack.Navigator
            screenOptions={{
                headerStyle: { backgroundColor: Colors.background },
                headerTintColor: Colors.text,
                headerTitleStyle: { fontWeight: 'bold' },
                headerShadowVisible: false, // Remove border
                animation: 'slide_from_right',
                contentStyle: { backgroundColor: Colors.background },
            }}
        >
            <Stack.Screen
                name="ServerSelect"
                component={ServerSelectScreen}
                options={{ headerShown: false }}
            />
            <Stack.Screen
                name="Login"
                component={LoginScreen}
                options={{ title: '' }} // Minimal header
            />
        </Stack.Navigator>
    );
}
