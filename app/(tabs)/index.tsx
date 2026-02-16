import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Linking, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function App() {
  const router = useRouter();
  const [isOnline] = useState(true); // Mock status for now
  const [locationActive, setLocationActive] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [address, setAddress] = useState<string | null>(null);

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

        // Reverse geocode to get address
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
    // Initial fetch
    fetchLocation();

    // Real-time updates every 10 seconds
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
      title: 'PHARMA SCAN',
      subtitle: 'AI IDENTIFICATION',
      icon: 'scan-circle',
      route: '/scanner' as const,
      color: '#0369A1', // Ocean Blue
      status: 'READY'
    },
    {
      title: 'MEDICATION LOG',
      subtitle: 'ADHERENCE TRACKING',
      icon: 'list-circle',
      route: '/medications' as const,
      color: '#0EA5E9', // Sky Blue
      status: 'ACTIVE'
    },
    {
      title: 'EMERGENCY SOS',
      subtitle: 'DISASTER RESPONSE',
      icon: 'alert-circle',
      route: '/emergency' as const,
      color: '#DC2626', // Red
      status: 'STANDBY'
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F1F5F9" />

      {/* SYSTEM HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brandLabel}>MEDIMATE v2.5</Text>
          <Text style={styles.systemTitle}>SYSTEM DASHBOARD</Text>
        </View>
        <Ionicons name="medical" size={32} color="#0369A1" />
      </View>

      {/* STATUS MONITOR */}
      <View style={styles.statusRow}>
        <View style={styles.statusItem}>
          <View style={[styles.statusDot, { backgroundColor: isOnline ? '#10B981' : '#64748B' }]} />
          <Text style={styles.statusText}>{isOnline ? 'NETWORK: ONLINE' : 'NETWORK: OFFLINE'}</Text>
        </View>
        <TouchableOpacity
          style={[styles.statusItem, { flex: 1 }]}
          onPress={handleLocationEdit}
          activeOpacity={0.7}
        >
          <Ionicons
            name={currentLocation ? "location" : fetchingLocation ? "location-outline" : "location-outline"}
            size={12}
            color={currentLocation ? '#10B981' : '#64748B'}
          />
          <Text style={styles.statusText} numberOfLines={1}>
            {fetchingLocation
              ? 'GPS: ACQUIRING...'
              : address
                ? `GPS: ${address}`
                : locationActive ? 'GPS: READY' : 'GPS: OFF'
            }
          </Text>
          <Ionicons name="pencil" size={10} color="#0369A1" style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      {/* ACTION MODULES GRID */}
      <View style={styles.gridContainer}>
        {modules.map((item, index) => (
          <TouchableOpacity
            key={index}
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
              {/* Left: Icon */}
              <View style={[styles.iconContainer, { backgroundColor: `${item.color}20` }]}>
                <Ionicons name={item.icon as any} size={32} color={item.color} />
              </View>

              {/* Middle: Content */}
              <View style={styles.moduleContent}>
                <Text style={styles.moduleTitle}>{item.title}</Text>
                <Text style={styles.moduleSubtitle}>{item.subtitle}</Text>
                <View style={[styles.statusBadge, { backgroundColor: `${item.color}` }]}>
                  <View style={[styles.statusDot, { backgroundColor: '#FFFFFF' }]} />
                  <Text style={styles.statusBadgeText}>{item.status}</Text>
                </View>
              </View>

              {/* Right: Arrow */}
              <View style={styles.arrowContainer}>
                <Ionicons name="chevron-forward" size={24} color={item.color} />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </View>

      {/* FOOTER INFO */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>ID: DOST-GRANT-APP-001</Text>
        <Text style={styles.footerText}>SECURE CONTEXT</Text>
      </View>

      {/* LOCATION MODAL */}
      {showLocationModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalIconBg}>
                <Ionicons name="location" size={28} color="#FFFFFF" />
              </View>
              <Text style={styles.modalTitle}>MY LOCATION</Text>
              <Text style={styles.modalSubtitle}>Real-time GPS tracking active</Text>
            </View>

            {/* Address Card */}
            <View style={styles.addressCard}>
              <Ionicons name="navigate-circle" size={24} color="#0369A1" />
              <View style={{ flex: 1 }}>
                <Text style={styles.addressLabel}>CURRENT ADDRESS</Text>
                <Text style={styles.addressText}>
                  {address || 'Fetching address...'}
                </Text>
              </View>
            </View>

            {/* Actions */}
            <TouchableOpacity
              style={styles.btnMaps}
              onPress={openInGoogleMaps}
              activeOpacity={0.8}
            >
              <Ionicons name="map" size={20} color="#FFFFFF" />
              <Text style={styles.btnMapsText}>OPEN IN GOOGLE MAPS</Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.btnRefresh}
                onPress={refreshLocation}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh" size={18} color="#0369A1" />
                <Text style={styles.btnRefreshText}>REFRESH</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.btnClose}
                onPress={() => setShowLocationModal(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.btnCloseText}>CLOSE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9', // Slate-100
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 2,
    borderBottomColor: '#0369A1',
  },
  brandLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  systemTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A', // Slate-900
    letterSpacing: -0.5,
  },
  statusRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 16,
    backgroundColor: '#FFFFFF',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
    fontFamily: 'monospace',
  },
  divider: {
    height: 1,
    backgroundColor: '#CBD5E1',
  },
  gridContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  moduleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    shadowColor: '#0369A1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    overflow: 'hidden',
  },
  cardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  moduleContent: {
    flex: 1,
    gap: 6,
  },
  moduleTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  moduleSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  arrowContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  footer: {
    padding: 24,
    marginTop: 'auto',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 1,
    fontFamily: 'monospace',
  },
  // Location Modal
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#0369A1',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 10,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
    gap: 8,
  },
  modalIconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0369A1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 1,
  },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0F9FF',
    padding: 16,
    borderRadius: 16,
    gap: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  addressLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0369A1',
    letterSpacing: 1,
    marginBottom: 4,
  },
  addressText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    lineHeight: 22,
  },
  coordRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  coordCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  coordLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1,
    marginBottom: 4,
  },
  coordValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    fontFamily: 'monospace',
  },
  btnMaps: {
    flexDirection: 'row',
    backgroundColor: '#0369A1',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
  },
  btnMapsText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  btnRefresh: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#E0F2FE',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  btnRefreshText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0369A1',
  },
  btnClose: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  btnCloseText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
});
