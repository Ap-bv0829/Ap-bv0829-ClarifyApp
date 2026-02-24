import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

const ONBOARDING_KEY = 'onboarding_done';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    checkOnboarding();
  }, []);

  const checkOnboarding = async () => {
    try {
      const done = await AsyncStorage.getItem(ONBOARDING_KEY);
      if (!done) {
        setReady(true);
        // Small delay to let the navigator mount
        setTimeout(() => router.replace('/onboarding'), 50);
      } else {
        setReady(true);
      }
    } catch {
      setReady(true);
    }
  };

  if (!ready) return <View style={{ flex: 1, backgroundColor: '#F9FAFB' }} />;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="medications" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        <Stack.Screen name="scan-history" options={{ headerShown: false }} />
        <Stack.Screen name="pharmacy-finder" options={{ headerShown: false }} />
        <Stack.Screen name="medicine-details" options={{ presentation: 'modal', title: 'Medicine Details' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
