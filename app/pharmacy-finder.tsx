import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
import Animated, { FadeInUp } from 'react-native-reanimated';
import { moderateScale, scale, verticalScale } from '../utils/responsive';

interface Pharmacy {
    name: string;
    icon: string;
    color: string;
    description: string;
    hotline: string;
}

const PHARMACIES: Pharmacy[] = [
    {
        name: 'Mercury Drug',
        icon: 'medical',
        color: '#DC2626',
        description: 'Largest pharmacy chain in the Philippines',
        hotline: '028888-5797',
    },
    {
        name: 'Watsons',
        icon: 'medkit',
        color: '#0369A1',
        description: 'Health, beauty & wellness products',
        hotline: '028858-5071',
    },
    {
        name: 'Rose Pharmacy',
        icon: 'heart',
        color: '#DB2777',
        description: 'Trusted pharmacy since 1952',
        hotline: '032253-9100',
    },
    {
        name: 'Generika',
        icon: 'leaf',
        color: '#059669',
        description: 'Affordable generic medicines',
        hotline: '028702-5000',
    },
    {
        name: 'The Generics Pharmacy',
        icon: 'business',
        color: '#7C3AED',
        description: 'Quality generics at low prices',
        hotline: '028888-0000',
    },
];



export default function PharmacyFinderScreen() {
    const router = useRouter();
    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [address, setAddress] = useState<string>('');
    const [locationStatus, setLocationStatus] = useState<'loading' | 'ready' | 'denied' | 'idle'>('idle');

    useEffect(() => { getLocation(); }, []);

    const getLocation = async () => {
        setLocationStatus('loading');
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setLocationStatus('denied');
                return;
            }
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
            setLocation(coords);

            // Reverse geocode
            try {
                const geo = await Location.reverseGeocodeAsync({
                    latitude: loc.coords.latitude,
                    longitude: loc.coords.longitude
                });
                if (geo && geo.length > 0) {
                    const place = geo[0];
                    const street = place.street || '';
                    const district = place.district || place.subregion || '';
                    const city = place.city || '';
                    setAddress(`${street ? street + ', ' : ''}${district ? district + ', ' : ''}${city}`);
                } else {
                    setAddress(`${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
                }
            } catch {
                setAddress(`${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
            }

            setLocationStatus('ready');
        } catch {
            setLocationStatus('denied');
        }
    };

    const openMapsSearch = (query: string) => {
        if (location) {
            Linking.openURL(
                `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${location.lat},${location.lng},15z`
            );
        } else {
            Linking.openURL(
                `https://www.google.com/maps/search/${encodeURIComponent(query + ' Philippines')}`
            );
        }
    };

    const findNearby = (name: string) => openMapsSearch(name + ' pharmacy');
    const openDOH = () => Linking.openURL('tel:1555');

    const handleCall = (phone: string) => {
        Linking.openURL(`tel:${phone.replace(/\s/g, '')}`);
    };

    const Content = (
        <>
            <StatusBar barStyle="light-content" backgroundColor="#0369A1" />

            {/* Header */}
            <LinearGradient colors={['#0369A1', '#0EA5E9']} style={styles.header}>
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
                        <View style={styles.headerBtn}>
                            <Ionicons name="arrow-back" size={20} color="#FFF" />
                        </View>
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>Find a Pharmacy</Text>
                        <Text style={styles.headerSub}>Nearest pharmacies in the Philippines</Text>
                    </View>
                </View>

                {/* Location status */}
                <View style={styles.locationCard}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.locationTitle}>
                            {locationStatus === 'ready' ? 'Location Found ✓' :
                                locationStatus === 'loading' ? 'Getting location...' :
                                    locationStatus === 'denied' ? 'Location access denied' :
                                        'Location not found'}
                        </Text>
                        <Text style={styles.locationSub}>
                            {locationStatus === 'ready'
                                ? (address || 'Searching nearby...')
                                : 'Will search Philippines-wide'}
                        </Text>
                    </View>
                    {locationStatus === 'denied' && (
                        <TouchableOpacity onPress={getLocation}>
                            <Text style={styles.retryText}>Retry</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </LinearGradient>

            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>

                {/* Quick find nearby */}
                <Animated.View entering={FadeInUp.duration(400)}>
                    <TouchableOpacity
                        style={styles.nearbyBtn}
                        onPress={() => openMapsSearch('pharmacy')}
                        activeOpacity={0.85}
                    >
                        <LinearGradient colors={['#0369A1', '#0EA5E9']} style={styles.nearbyBtnInner}>
                            <Ionicons name="navigate" size={22} color="#FFF" />
                            <Text style={styles.nearbyBtnText}>Find Nearest Pharmacy Now</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </Animated.View>

                {/* DOH Hotline */}
                <Animated.View entering={FadeInUp.duration(400).delay(100)}>
                    <TouchableOpacity style={styles.dohCard} onPress={openDOH} activeOpacity={0.85}>
                        <View style={styles.dohIcon}>
                            <Ionicons name="call" size={24} color="#059669" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.dohTitle}>DOH Hotline</Text>
                            <Text style={styles.dohSub}>Department of Health — 1555</Text>
                            <Text style={styles.dohDesc}>24/7 medical assistance & helpline</Text>
                        </View>
                        <View style={styles.callBadge}>
                            <Ionicons name="call" size={14} color="#FFF" />
                            <Text style={styles.callBadgeText}>Call</Text>
                        </View>
                    </TouchableOpacity>
                </Animated.View>

                {/* Section label */}
                <Text style={styles.sectionLabel}>PHARMACY CHAINS</Text>

                {/* Pharmacy list */}
                {PHARMACIES.map((pharmacy, index) => (
                    <Animated.View key={pharmacy.name} entering={FadeInUp.duration(400).delay(200 + index * 80)}>
                        <View style={styles.pharmacyCard}>
                            <View style={[styles.pharmacyIconWrap, { backgroundColor: pharmacy.color + '15' }]}>
                                <Ionicons name={pharmacy.icon as any} size={24} color={pharmacy.color} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.pharmacyName}>{pharmacy.name}</Text>
                                <Text style={styles.pharmacyDesc}>{pharmacy.description}</Text>
                            </View>
                            <View style={styles.pharmacyActions}>
                                <TouchableOpacity
                                    style={[styles.actionBtn, { backgroundColor: pharmacy.color + '15' }]}
                                    onPress={() => findNearby(pharmacy.name)}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons name="location-outline" size={16} color={pharmacy.color} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.actionBtn, { backgroundColor: '#10B98115' }]}
                                    onPress={() => handleCall(pharmacy.hotline)}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons name="call-outline" size={16} color="#059669" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Animated.View>
                ))}

                {/* Senior discount note */}
                <Animated.View entering={FadeInUp.duration(400).delay(700)}>
                    <View style={styles.noteCard}>
                        <View style={styles.noteIconWrap}>
                            <Ionicons name="information-circle" size={24} color="#059669" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.noteTitle}>Senior Citizen Discount</Text>
                            <Text style={styles.noteText}>
                                Under RA 9994, Filipinos 60+ get a <Text style={{ fontWeight: '700', color: '#059669' }}>20% discount</Text> on medicines at all registered pharmacies. Bring your Senior Citizen ID.
                            </Text>
                        </View>
                    </View>
                </Animated.View>

                <View style={{ height: verticalScale(40) }} />
            </ScrollView>
        </>
    );

    return (
        <SafeAreaView style={styles.root}>
            <StatusBar barStyle="light-content" backgroundColor="#0369A1" />
            {Content}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F1F5F9' },
    header: {
        paddingTop: verticalScale(48),
        paddingBottom: verticalScale(20),
        paddingHorizontal: scale(20),
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: scale(12), marginBottom: verticalScale(16) },
    headerBtn: {
        width: scale(40), height: scale(40), borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.12)',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: moderateScale(22), fontWeight: '800', color: '#FFF' },
    headerSub: { fontSize: moderateScale(14), color: 'rgba(255,255,255,0.75)', fontWeight: '600', marginTop: 2 },
    locationCard: {
        flexDirection: 'row', alignItems: 'center', gap: scale(12),
        backgroundColor: '#FFF', borderRadius: 16,
        padding: scale(14),
    },
    locationIcon: {
        width: scale(40), height: scale(40), borderRadius: 12,
        backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center',
    },
    locationTitle: { fontSize: moderateScale(15), fontWeight: '700', color: '#0F172A' },
    locationSub: { fontSize: moderateScale(14), color: '#64748B', marginTop: 2, fontWeight: '500' },
    retryText: { color: '#059669', fontWeight: '800', fontSize: moderateScale(14) },
    body: { flex: 1 },
    bodyContent: { paddingHorizontal: scale(20), paddingVertical: verticalScale(16) },
    nearbyBtn: { marginBottom: verticalScale(12), borderRadius: 18, overflow: 'hidden' },
    nearbyBtnInner: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: scale(10), paddingVertical: verticalScale(18),
    },
    nearbyBtnText: { color: '#FFF', fontWeight: '800', fontSize: moderateScale(16), letterSpacing: 0.5 },
    dohCard: {
        flexDirection: 'row', alignItems: 'center', gap: scale(12),
        backgroundColor: '#FFF', borderRadius: 24, padding: scale(16),
        marginBottom: verticalScale(20),
        borderWidth: 1, borderColor: '#F0FDF4',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.02, shadowRadius: 10, elevation: 2,
    },
    dohIcon: {
        width: scale(52), height: scale(52), borderRadius: 16,
        backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center',
    },
    dohTitle: { fontSize: moderateScale(16), fontWeight: '800', color: '#0F172A' },
    dohSub: { fontSize: moderateScale(14), color: '#059669', fontWeight: '700', marginTop: 2 },
    dohDesc: { fontSize: moderateScale(14), color: '#64748B', marginTop: 2, fontWeight: '500' },
    callBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#059669', paddingHorizontal: scale(12),
        paddingVertical: verticalScale(7), borderRadius: 10,
    },
    callBadgeText: { color: '#FFF', fontWeight: '800', fontSize: moderateScale(14) },
    sectionLabel: {
        fontSize: moderateScale(14), fontWeight: '800', color: '#94A3B8',
        letterSpacing: 1.2, marginBottom: verticalScale(10), marginLeft: scale(4),
    },
    pharmacyCard: {
        flexDirection: 'row', alignItems: 'center', gap: scale(12),
        backgroundColor: '#FFF', borderRadius: 24, padding: scale(16),
        marginBottom: verticalScale(12),
        borderWidth: 1, borderColor: '#FAFAFA',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.02, shadowRadius: 10, elevation: 2,
    },
    pharmacyIconWrap: {
        width: scale(52), height: scale(52), borderRadius: 16,
        alignItems: 'center', justifyContent: 'center',
    },
    pharmacyName: { fontSize: moderateScale(16), fontWeight: '700', color: '#0F172A' },
    pharmacyDesc: { fontSize: moderateScale(14), color: '#64748B', marginTop: 2, fontWeight: '500' },
    pharmacyActions: { flexDirection: 'row', gap: scale(8) },
    actionBtn: {
        width: scale(36), height: scale(36), borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    noteCard: {
        flexDirection: 'row', gap: scale(12), alignItems: 'flex-start',
        backgroundColor: '#F0FDF4', borderRadius: 18, padding: scale(16),
        borderWidth: 1.5, borderColor: '#BBF7D0', marginTop: 4,
    },
    noteIconWrap: {
        width: scale(44), height: scale(44), borderRadius: 14,
        backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center',
    },
    noteTitle: { fontSize: moderateScale(15), fontWeight: '800', color: '#065F46', marginBottom: 6 },
    noteText: { fontSize: moderateScale(14), color: '#047857', lineHeight: 22, fontWeight: '500' },
});
