import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { LinearGradient } from 'expo-linear-gradient';
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

  // Animated medical icon rotation
  const iconRotation = useSharedValue(0);
  useEffect(() => {
    iconRotation.value = withRepeat(
      withSequence(
        withTiming(8, { duration: 1500 }),
        withTiming(-8, { duration: 1500 }),
        withTiming(0, { duration: 1000 })
      ),
      -1,
      true
    );
  }, []);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${iconRotation.value}deg` }],
  }));

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
      color: '#0369A1',
      status: 'READY',
    },
    {
      title: 'Medication Log',
      subtitle: 'Track Your Medicines',
      icon: 'list-circle',
      route: '/medications' as const,
      color: '#0EA5E9',
      status: 'ACTIVE',
    },
    {
      title: 'Emergency SOS',
      subtitle: 'Quick Response System',
      icon: 'alert-circle',
      route: '/emergency' as const,
      color: '#DC2626',
      status: 'STANDBY',
    },
    {
      title: 'Scan History',
      subtitle: 'Past Medicine Scans',
      icon: 'time-outline',
      route: '/scan-history' as const,
      color: '#7C3AED',
      status: 'LOG',
    },
    {
      title: 'Find Pharmacy',
      subtitle: 'Nearest Pharmacy Locator',
      icon: 'location-outline',
      route: '/pharmacy-finder' as const,
      color: '#059669',
      status: 'NEAR YOU',
    },
  ];



  const Content = (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#F1F5F9" />

      {/* Offline banner */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="wifi-outline" size={14} color="#FFF" />
          <Text style={styles.offlineText}>No Internet — AI features unavailable</Text>
        </View>
      )}

      {/* HEADER */}
      <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.header}>
        <View>
          <Text style={styles.greetingText}>{greeting} 👋</Text>
          <Text style={styles.brandLabel}>MEDIMATE v2.5</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Animated.View style={iconStyle}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="medical" size={24} color="#0369A1" />
            </View>
          </Animated.View>
          <TouchableOpacity onPress={() => router.push('/profile')} activeOpacity={0.8}>
            <View style={styles.profileBtn}>
              <Ionicons name="person" size={18} color="#FFF" />
            </View>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* STATUS BAR */}
      <Animated.View entering={FadeInDown.duration(500).delay(200)} style={styles.statusRow}>
        <View style={styles.statusItem}>
          <Animated.View
            style={[
              styles.statusDot,
              { backgroundColor: isOnline ? '#10B981' : '#64748B' },
              statusDotStyle,
            ]}
          />
          <Text style={styles.statusText}>{isOnline ? 'ONLINE' : 'OFFLINE'}</Text>
        </View>
        <TouchableOpacity
          style={[styles.statusItem, { flex: 1 }]}
          onPress={handleLocationEdit}
          activeOpacity={0.7}
        >
          <Ionicons
            name={currentLocation ? 'location' : 'location-outline'}
            size={12}
            color={currentLocation ? '#10B981' : '#64748B'}
          />
          <Text style={styles.statusText} numberOfLines={1}>
            {fetchingLocation
              ? 'ACQUIRING...'
              : address
                ? address
                : locationActive
                  ? 'GPS READY'
                  : 'GPS OFF'}
          </Text>
          <Ionicons name="chevron-forward" size={10} color="#0369A1" style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      </Animated.View>

      {/* MODULE CARDS */}
      <View style={styles.gridContainer}>
        {modules.map((item, index) => (
          <AnimatedTouchable
            key={index}
            entering={FadeInUp.duration(500).delay(300 + index * 120).springify().damping(14)}
            style={styles.moduleCard}
            onPress={() => item.route && router.push(item.route)}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#FFFFFF', '#F8FAFC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardGradient}
            >
              <View style={[styles.cardAccent, { backgroundColor: item.color }]} />
              <View style={[styles.iconContainer, { backgroundColor: `${item.color}15` }]}>
                <Ionicons name={item.icon as any} size={30} color={item.color} />
              </View>
              <View style={styles.moduleContent}>
                <Text style={styles.moduleTitle}>{item.title}</Text>
                <Text style={styles.moduleSubtitle}>{item.subtitle}</Text>
                <View style={[styles.statusBadge, { backgroundColor: `${item.color}15` }]}>
                  <View style={[styles.badgeDot, { backgroundColor: item.color }]} />
                  <Text style={[styles.statusBadgeText, { color: item.color }]}>{item.status}</Text>
                </View>
              </View>
              <View style={[styles.arrowContainer, { backgroundColor: `${item.color}10` }]}>
                <Ionicons name="chevron-forward" size={20} color={item.color} />
              </View>
            </LinearGradient>
          </AnimatedTouchable>
        ))}
      </View>

      {/* FOOTER */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>ID: DOST-GRANT-APP-001</Text>
        <Text style={styles.footerText}>SECURE CONTEXT</Text>
      </View>

      {/* LOCATION MODAL */}
      {showLocationModal && (
        <View style={styles.modalOverlay}>
          <Animated.View entering={FadeInDown.duration(400).springify()} style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconBg}>
                <Ionicons name="location" size={28} color="#FFFFFF" />
              </View>
              <Text style={styles.modalTitle}>MY LOCATION</Text>
              <Text style={styles.modalSubtitle}>Real-time GPS tracking active</Text>
            </View>
            <View style={styles.addressCard}>
              <Ionicons name="navigate-circle" size={24} color="#0369A1" />
              <View style={{ flex: 1 }}>
                <Text style={styles.addressLabel}>CURRENT ADDRESS</Text>
                <Text style={styles.addressText}>{address || 'Fetching address...'}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.btnMaps} onPress={openInGoogleMaps} activeOpacity={0.8}>
              <Ionicons name="map" size={20} color="#FFFFFF" />
              <Text style={styles.btnMapsText}>OPEN IN GOOGLE MAPS</Text>
            </TouchableOpacity>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnRefresh} onPress={refreshLocation} activeOpacity={0.8}>
                <Ionicons name="refresh" size={18} color="#0369A1" />
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
      <ScrollView showsVerticalScrollIndicator={false}>
        {Content}
      </ScrollView>
    </SafeAreaView>
  );
}



const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: scale(24),
    paddingTop: verticalScale(48),
    paddingBottom: verticalScale(24),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  greetingText: {
    fontSize: moderateScale(22),
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  brandLabel: {
    fontSize: moderateScale(11),
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1.5,
  },
  headerIconWrap: {
    width: scale(48),
    height: scale(48),
    borderRadius: 14,
    backgroundColor: '#F0F4F8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
  },
  profileBtn: {
    width: scale(40),
    height: scale(40),
    borderRadius: 14,
    backgroundColor: '#0369A1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    paddingHorizontal: scale(24),
    paddingVertical: verticalScale(12),
    gap: scale(10),
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    backgroundColor: '#F9FAFB',
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
    borderRadius: 20,
    borderWidth: 0,
  },
  statusText: {
    fontSize: moderateScale(10),
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  statusDot: {
    width: scale(7),
    height: scale(7),
    borderRadius: 4,
  },
  gridContainer: {
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(20),
    paddingBottom: verticalScale(8),
  },
  moduleCard: {
    borderRadius: 20,
    marginBottom: verticalScale(16),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  cardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: scale(20),
    gap: scale(16),
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0,
  },
  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
  },
  iconContainer: {
    width: scale(56),
    height: scale(56),
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleContent: {
    flex: 1,
    gap: verticalScale(3),
  },
  moduleTitle: {
    fontSize: moderateScale(17),
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  moduleSubtitle: {
    fontSize: moderateScale(12),
    fontWeight: '500',
    color: '#64748B',
    letterSpacing: 0.1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(4),
    borderRadius: 20,
    gap: scale(5),
    marginTop: verticalScale(4),
    alignSelf: 'flex-start',
  },
  badgeDot: {
    width: scale(5),
    height: scale(5),
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: moderateScale(10),
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  arrowContainer: {
    width: scale(36),
    height: scale(36),
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    padding: scale(24),
    marginTop: 'auto',
    alignItems: 'center',
  },
  footerText: {
    fontSize: moderateScale(10),
    fontWeight: '600',
    color: '#CBD5E1',
    letterSpacing: 1,
  },
  // Location Modal
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: scale(24),
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: scale(28),
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(8) },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 6,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: verticalScale(24),
    gap: verticalScale(8),
  },
  modalIconBg: {
    width: scale(60),
    height: scale(60),
    borderRadius: 20,
    backgroundColor: '#0369A1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(8),
  },
  modalTitle: {
    fontSize: moderateScale(20),
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 1,
  },
  modalSubtitle: {
    fontSize: moderateScale(12),
    fontWeight: '600',
    color: '#64748B',
  },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F5F8FF',
    padding: scale(16),
    borderRadius: 14,
    gap: scale(12),
    marginBottom: verticalScale(16),
    borderWidth: 0,
  },
  addressLabel: {
    fontSize: moderateScale(10),
    fontWeight: '800',
    color: '#0369A1',
    letterSpacing: 1,
    marginBottom: verticalScale(4),
  },
  addressText: {
    fontSize: moderateScale(15),
    fontWeight: '600',
    color: '#0F172A',
    lineHeight: 22,
  },
  btnMaps: {
    flexDirection: 'row',
    backgroundColor: '#0369A1',
    paddingVertical: verticalScale(16),
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(10),
    marginBottom: verticalScale(12),
  },
  btnMapsText: {
    fontSize: moderateScale(15),
    fontWeight: '800',
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
    backgroundColor: '#E0F2FE',
    paddingVertical: verticalScale(14),
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(8),
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  btnRefreshText: {
    fontSize: moderateScale(13),
    fontWeight: '700',
    color: '#0369A1',
  },
  btnClose: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: verticalScale(14),
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  btnCloseText: {
    fontSize: moderateScale(13),
    fontWeight: '700',
    color: '#64748B',
  },
  offlineBanner: {
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(6),
    paddingVertical: verticalScale(8),
    paddingHorizontal: scale(16),
  },
  offlineText: {
    color: '#FFF',
    fontSize: moderateScale(12),
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
