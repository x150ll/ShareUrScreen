// App.tsx
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View } from 'react-native';

// Firebase — يجب أن يكون أول استيراد
import '@react-native-firebase/app';
import '@react-native-firebase/database';

import OnboardingScreen from './src/screens/OnboardingScreen';
import HomeScreen       from './src/screens/HomeScreen';
import HostScreen       from './src/screens/HostScreen';
import ViewerScreen     from './src/screens/ViewerScreen';
import SignalingService from './src/services/SignalingService';

const Stack = createStackNavigator();
const ONBOARDING_KEY = 'onboarding_done_v1';

export default function App() {
  const [route, setRoute] = useState<string | null>(null);

  useEffect(() => {
    // 1. فحص Onboarding
    AsyncStorage.getItem(ONBOARDING_KEY).then(done => {
      setRoute(done ? 'Home' : 'Onboarding');
    });

    // 2. تنظيف الجلسات المنتهية في الخلفية (لا ينتظر)
    SignalingService.cleanupExpiredSessions().catch(() => {});
  }, []);

  if (!route) return <View style={{ flex: 1, backgroundColor: '#0A0A0F' }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName={route}
          screenOptions={{ headerShown: false, cardStyle: { backgroundColor: '#0A0A0F' } }}
        >
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          <Stack.Screen name="Home"       component={HomeScreen} />
          <Stack.Screen name="Host"       component={HostScreen} />
          <Stack.Screen name="Viewer"     component={ViewerScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
