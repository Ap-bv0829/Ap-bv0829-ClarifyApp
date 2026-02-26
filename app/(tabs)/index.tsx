import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Linking,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from 'react-native-reanimated';
import { moderateScale, scale, verticalScale } from '../../utils/responsive';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function App() {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setIsOnline(!!state.isConnected);
    });
    return unsub;
  }, []);
  const [locationActive, setLocationActive] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [address, setAddress] = useState<string | null>(null);

  // Status dot pulse
  const statusPulse = useSharedValue(1);
  useEffect(() => {
    statusPulse.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 1000 }),
        withTiming(1, { duration: 1000 })
      ),
      -1,
      true
    );
  }, []);

  const statusDotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: statusPulse.value }],
  }));

  // Time-based greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  // Fetch location function
  const fetchLocation = async () => {
    const { status } = await Location.getForegroundPermissionsAsync();
    setLocationActive(status === 'granted');

    if (status === 'granted') {
      try {
        setFetchingLocation(true);
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const coords = {
          lat: location.coords.latitude,
          lon: location.coords.longitude,
        };
        setCurrentLocation(coords);

        try {
          const [geo] = await Location.reverseGeocodeAsync({
            latitude: coords.lat,
            longitude: coords.lon,
          });
          if (geo) {
            const parts = [geo.street, geo.district, geo.city, geo.region].filter(Boolean);
            setAddress(parts.join(', ') || 'Unknown Location');
          }
        } catch (geoErr) {
          console.log('Geocode error:', geoErr);
        }
      } catch (error) {
        console.log('Error fetching location:', error);
      } finally {
        setFetchingLocation(false);
      }
    }
  };

  useEffect(() => {
    fetchLocation();
    const interval = setInterval(() => {
      fetchLocation();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleLocationEdit = () => {
    setShowLocationModal(true);
  };

  const openInGoogleMaps = () => {
    if (currentLocation) {
      const url = `https://www.google.com/maps?q=${currentLocation.lat},${currentLocation.lon}`;
      Linking.openURL(url);
    }
  };

  const refreshLocation = async () => {
    setShowLocationModal(false);
    await fetchLocation();
    setShowLocationModal(true);
  };

  const modules = [
    {
      title: 'Pharma Scan',
      subtitle: 'AI Medicine Identification',
      icon: 'scan-circle',
      route: '/scanner' as const,
      color: '#38BDF8',
      status: 'READY',
    },
    {
      title: 'Medication Log',
      subtitle: 'Track Your Medicines',
      icon: 'list-circle',
      route: '/medications' as const,
      color: '#38BDF8',
      status: 'ACTIVE',
    },
    {
      title: 'Find Pharmacy',
      subtitle: 'Nearest Pharmacy Locator',
      icon: 'location-outline',
      route: '/pharmacy-finder' as const,
      color: '#38BDF8',
      status: 'NEAR YOU',
    },
  ];



  const Content = (
    <>
      <StatusBar barStyle="dark-content" />

      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="wifi-outline" size={14} color="#FFF" />
          <Text style={styles.offlineText}>No Internet — AI features unavailable</Text>
        </View>
      )}

      <View style={styles.headerSection}>
        <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.header}>
          <View>
            <Text style={styles.greetingText}>{greeting}</Text>
            <Text style={styles.brandLabel}>CLARIFY.</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(500).delay(200)} style={styles.statusRow}>
          <View style={styles.statusPill}>
            <Animated.View
              style={[
                styles.statusDot,
                { backgroundColor: isOnline ? '#10B981' : '#EF4444' },
                statusDotStyle,
              ]}
            />
            <Text style={styles.statusText}>{isOnline ? 'System Online' : 'Offline Mode'}</Text>
          </View>
          <TouchableOpacity
            style={styles.locationPill}
            onPress={handleLocationEdit}
            activeOpacity={0.7}
          >
            <Ionicons
              name={currentLocation ? 'location' : 'location-outline'}
              size={12}
              color="#64748B"
            />
            <Text style={styles.locationText} numberOfLines={1}>
              {fetchingLocation
                ? 'Acquiring...'
                : address
                  ? address
                  : locationActive
                    ? 'GPS Active'
                    : 'GPS Off'}
            </Text>
            <Ionicons name="chevron-forward" size={10} color="#94A3B8" />
          </TouchableOpacity>
        </Animated.View>
      </View>

      <View style={styles.mainContent}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>What can I help you with today?</Text>
        </View>

        <View style={styles.gridContainer}>
          {modules.map((item, index) => (
            <AnimatedTouchable
              key={index}
              entering={FadeInUp.duration(500).delay(300 + index * 120).springify().damping(14)}
              style={styles.moduleCard}
              onPress={() => item.route && router.push(item.route)}
              activeOpacity={0.85}
            >
              <View style={styles.cardContent}>
                <View style={[styles.iconContainer, { backgroundColor: '#F8FAFC' }]}>
                  <Ionicons name={item.icon as any} size={28} color="#334155" />
                </View>
                <View style={styles.moduleInfo}>
                  <Text style={styles.moduleTitle}>{item.title}</Text>
                  <Text style={styles.moduleSubtitle}>{item.subtitle}</Text>
                </View>
                <View style={styles.arrowContainer}>
                  <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
                </View>
              </View>
            </AnimatedTouchable>
          ))}
        </View>
      </View>

      {showLocationModal && (
        <View style={styles.modalOverlay}>
          <Animated.View entering={FadeInDown.duration(400).springify()} style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconBg}>
                <Ionicons name="location" size={28} color="#FFFFFF" />
              </View>
              <Text style={styles.modalTitle}>LOCATION SERVICES</Text>
            </View>
            <View style={styles.addressCard}>
              <Ionicons name="navigate-circle" size={24} color="#334155" />
              <View style={{ flex: 1 }}>
                <Text style={styles.addressLabel}>CURRENT ADDRESS</Text>
                <Text style={styles.addressText}>{address || 'Fetching address...'}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.btnMaps} onPress={openInGoogleMaps} activeOpacity={0.8}>
              <Ionicons name="map-outline" size={20} color="#FFFFFF" />
              <Text style={styles.btnMapsText}>OPEN IN MAPS</Text>
            </TouchableOpacity>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnRefresh} onPress={refreshLocation} activeOpacity={0.8}>
                <Ionicons name="refresh" size={18} color="#334155" />
                <Text style={styles.btnRefreshText}>REFRESH</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnClose} onPress={() => setShowLocationModal(false)} activeOpacity={0.8}>
                <Text style={styles.btnCloseText}>CLOSE</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 96 }}>
        {Content}
      </ScrollView>
    </SafeAreaView>
  );
}



const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  headerSection: {
    backgroundColor: '#FFFFFF',
    paddingBottom: verticalScale(20),
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  header: {
    paddingHorizontal: scale(24),
    paddingTop: verticalScale(24),
    paddingBottom: verticalScale(16),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greetingText: {
    fontSize: moderateScale(14),
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  brandLabel: {
    fontSize: moderateScale(28),
    fontWeight: '900',
    color: '#1E293B',
    letterSpacing: -1,
  },
  profileBtn: {
    width: scale(44),
    height: scale(44),
    borderRadius: 22,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  statusRow: {
    flexDirection: 'row',
    paddingHorizontal: scale(24),
    gap: scale(10),
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    flex: 1,
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  statusText: {
    fontSize: moderateScale(12),
    fontWeight: '700',
    color: '#475569',
  },
  locationText: {
    fontSize: moderateScale(12),
    fontWeight: '600',
    color: '#475569',
    flex: 1,
  },
  statusDot: {
    width: scale(6),
    height: scale(6),
    borderRadius: 3,
  },
  mainContent: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  sectionHeader: {
    paddingHorizontal: scale(24),
    paddingTop: verticalScale(28),
    paddingBottom: verticalScale(12),
  },
  sectionTitle: {
    fontSize: moderateScale(18),
    fontWeight: '700',
    color: '#1E293B',
    letterSpacing: -0.2,
  },
  gridContainer: {
    paddingHorizontal: scale(24),
    paddingTop: verticalScale(8),
  },
  moduleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginBottom: verticalScale(16),
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 2,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: scale(20),
    gap: scale(16),
  },
  iconContainer: {
    width: scale(56),
    height: scale(56),
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  moduleInfo: {
    flex: 1,
    gap: verticalScale(2),
  },
  moduleTitle: {
    fontSize: moderateScale(17),
    fontWeight: '700',
    color: '#1E293B',
  },
  moduleSubtitle: {
    fontSize: moderateScale(14),
    fontWeight: '500',
    color: '#64748B',
  },
  arrowContainer: {
    width: scale(32),
    height: scale(32),
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(30,41,59,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: scale(24),
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: scale(32),
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: verticalScale(28),
    gap: verticalScale(12),
  },
  modalIconBg: {
    width: scale(64),
    height: scale(64),
    borderRadius: 24,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(4),
  },
  modalTitle: {
    fontSize: moderateScale(16),
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: 1,
  },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F8FAFC',
    padding: scale(20),
    borderRadius: 16,
    gap: scale(14),
    marginBottom: verticalScale(20),
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  addressLabel: {
    fontSize: moderateScale(11),
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1,
    marginBottom: verticalScale(4),
  },
  addressText: {
    fontSize: moderateScale(15),
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 22,
  },
  btnMaps: {
    flexDirection: 'row',
    backgroundColor: '#334155',
    paddingVertical: verticalScale(18),
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(10),
    marginBottom: verticalScale(12),
  },
  btnMapsText: {
    fontSize: moderateScale(15),
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  modalActions: {
    flexDirection: 'row',
    gap: scale(12),
  },
  btnRefresh: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingVertical: verticalScale(16),
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(8),
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  btnRefreshText: {
    fontSize: moderateScale(14),
    fontWeight: '700',
    color: '#334155',
  },
  btnClose: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingVertical: verticalScale(16),
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  btnCloseText: {
    fontSize: moderateScale(14),
    fontWeight: '700',
    color: '#64748B',
  },
  offlineBanner: {
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(6),
    paddingVertical: verticalScale(10),
  },
  offlineText: {
    color: '#FFF',
    fontSize: moderateScale(13),
    fontWeight: '700',
  },
});
