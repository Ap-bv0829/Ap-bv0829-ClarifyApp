import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function App() {
  const router = useRouter();

  const menuItems = [
    {
      title: 'Scan Medicine',
      subtitle: 'Identify pills & set reminders',
      route: '/scanner' as const,
      gradient: ['#4facfe', '#00f2fe'] as const,
    },
    {
      title: 'My Medications',
      subtitle: 'View schedule & manage meds',
      route: '/medications' as const,
      gradient: ['#a855f7', '#c084fc'] as const,
    },
    {
      title: 'Emergency SOS',
      subtitle: 'Quick call for help',
      route: '/emergency' as const,
      gradient: ['#dc2626', '#f87171'] as const,
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.headerContainer}>
        <Text style={styles.brandLabel}>CLARIFY.</Text>
        <Text style={styles.greeting}>Good morning, Anna</Text>
      </View>

      {/* Menu Cards */}
      <View style={styles.menuContainer}>
        {menuItems.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={styles.cardWrapper}
            onPress={() => item.route && router.push(item.route)}
            activeOpacity={item.route ? 0.8 : 1}
          >
            <LinearGradient
              colors={item.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.card}
            >
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
              </View>
              <Text style={styles.arrow}>→</Text>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerContainer: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  brandLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888888',
    letterSpacing: 2,
    marginBottom: 8,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  menuContainer: {
    flex: 1,
    paddingHorizontal: 24,
    gap: 16,
  },
  cardWrapper: {
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  card: {
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  arrow: {
    fontSize: 28,
    fontWeight: '300',
    color: '#FFFFFF',
    marginLeft: 16,
  },
});
