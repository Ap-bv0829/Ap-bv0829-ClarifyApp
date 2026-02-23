import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { clearScans, getRecentScans, SavedScan } from '../services/storage';
import { moderateScale, scale, verticalScale } from '../utils/responsive';


export default function ScanHistoryScreen() {
    const router = useRouter();
    const [scans, setScans] = useState<SavedScan[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => { load(); }, []);

    const load = async () => {
        setLoading(true);
        const data = await getRecentScans();
        setScans(data);
        setLoading(false);
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        const data = await getRecentScans();
        setScans(data);
        setRefreshing(false);
    }, []);

    const handleClearAll = () => {
        Alert.alert(
            'Clear History',
            'Delete all scan history? This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear All',
                    style: 'destructive',
                    onPress: async () => {
                        await clearScans();
                        setScans([]);
                    },
                },
            ]
        );
    };

    const formatDate = (ts: number) => {
        const d = new Date(ts);
        return d.toLocaleDateString('en-PH', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    };

    const getSeverityColor = (warnings?: string) => {
        if (!warnings || warnings === 'None') return '#10B981';
        const w = warnings.toLowerCase();
        if (w.includes('severe') || w.includes('stop')) return '#DC2626';
        if (w.includes('caution') || w.includes('avoid')) return '#F59E0B';
        return '#3B82F6';
    };

    const Content = (
        <>
            <StatusBar barStyle="light-content" backgroundColor="#0369A1" />

            {/* Header */}
            <LinearGradient colors={['#0369A1', '#0284C7']} style={styles.header}>
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
                        <View style={styles.headerBtn}>
                            <Ionicons name="arrow-back" size={20} color="#FFF" />
                        </View>
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>Scan History</Text>
                        <Text style={styles.headerSub}>{scans.length} scan{scans.length !== 1 ? 's' : ''} saved</Text>
                    </View>
                    {scans.length > 0 && (
                        <TouchableOpacity onPress={handleClearAll} activeOpacity={0.7}>
                            <View style={styles.headerBtn}>
                                <Ionicons name="trash-outline" size={18} color="#FFF" />
                            </View>
                        </TouchableOpacity>
                    )}
                </View>
            </LinearGradient>

            <ScrollView
                style={styles.body}
                contentContainerStyle={[styles.bodyContent, scans.length === 0 && { flex: 1 }]}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0369A1']} />}
                showsVerticalScrollIndicator={false}
            >
                {loading ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>🔍</Text>
                        <Text style={styles.emptyTitle}>Loading...</Text>
                    </View>
                ) : scans.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>📋</Text>
                        <Text style={styles.emptyTitle}>No Scans Yet</Text>
                        <Text style={styles.emptySub}>Scan a medicine to see it here</Text>
                        <TouchableOpacity onPress={() => router.push('/scanner')} activeOpacity={0.85}>
                            <LinearGradient colors={['#0369A1', '#0284C7']} style={styles.scanBtn}>
                                <Ionicons name="scan-outline" size={18} color="#FFF" />
                                <Text style={styles.scanBtnText}>Go to Scanner</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                ) : (
                    scans.map((scan, index) => {
                        const meds = scan.analysis;
                        const primary = meds[0];
                        const title = meds.length > 1 ? `${meds.length} Medicines` : primary.medicineName;
                        const subtitle = meds.length > 1
                            ? meds.map(m => m.medicineName).join(', ')
                            : primary.commonUses;

                        return (
                            <Animated.View
                                key={scan.id}
                                entering={FadeInUp.duration(400).delay(index * 60)}
                            >
                                <View style={styles.card}>
                                    {/* Left accent */}
                                    <View style={[styles.accent, { backgroundColor: getSeverityColor(primary.warnings) }]} />

                                    <View style={styles.cardBody}>
                                        <View style={styles.cardTop}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
                                                <Text style={styles.cardDate}>{formatDate(scan.timestamp)}</Text>
                                            </View>
                                            <View style={[styles.countBadge, { backgroundColor: '#EFF6FF' }]}>
                                                <Text style={styles.countBadgeText}>{meds.length} med{meds.length > 1 ? 's' : ''}</Text>
                                            </View>
                                        </View>

                                        {subtitle ? (
                                            <Text style={styles.cardSub} numberOfLines={2}>{subtitle}</Text>
                                        ) : null}

                                        {/* Medicine chips */}
                                        {meds.length > 1 && (
                                            <View style={styles.chipRow}>
                                                {meds.slice(0, 3).map((m, i) => (
                                                    <View key={i} style={styles.chip}>
                                                        <Text style={styles.chipText} numberOfLines={1}>{m.medicineName}</Text>
                                                    </View>
                                                ))}
                                                {meds.length > 3 && (
                                                    <View style={styles.chip}>
                                                        <Text style={styles.chipText}>+{meds.length - 3}</Text>
                                                    </View>
                                                )}
                                            </View>
                                        )}

                                        {/* Warning row */}
                                        {primary.warnings && primary.warnings !== 'None' && (
                                            <View style={styles.warningRow}>
                                                <Ionicons name="warning-outline" size={13} color="#F59E0B" />
                                                <Text style={styles.warningText} numberOfLines={1}>{primary.warnings}</Text>
                                            </View>
                                        )}
                                    </View>

                                    <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
                                </View>
                            </Animated.View>
                        );
                    })
                )}
                <View style={{ height: verticalScale(32) }} />
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
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: scale(12) },
    headerBtn: {
        width: scale(40), height: scale(40), borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: moderateScale(20), fontWeight: '800', color: '#FFF' },
    headerSub: { fontSize: moderateScale(12), color: 'rgba(255,255,255,0.7)', fontWeight: '500', marginTop: 2 },
    body: { flex: 1 },
    bodyContent: { padding: scale(16), paddingTop: verticalScale(16) },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 80 },
    emptyIcon: { fontSize: 64 },
    emptyTitle: { fontSize: moderateScale(20), fontWeight: '700', color: '#0F172A' },
    emptySub: { fontSize: moderateScale(14), color: '#94A3B8', fontWeight: '400' },
    scanBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: scale(24), paddingVertical: verticalScale(14),
        borderRadius: 16, marginTop: 8,
    },
    scanBtnText: { color: '#FFF', fontWeight: '700', fontSize: moderateScale(15) },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderRadius: 18,
        marginBottom: verticalScale(10),
        overflow: 'hidden',
        shadowColor: '#94A3B8',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        paddingRight: scale(14),
    },
    accent: { width: 4, alignSelf: 'stretch' },
    cardBody: { flex: 1, padding: scale(14) },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
    cardTitle: { fontSize: moderateScale(16), fontWeight: '700', color: '#0F172A' },
    cardDate: { fontSize: moderateScale(11), color: '#94A3B8', marginTop: 2, fontWeight: '500' },
    cardSub: { fontSize: moderateScale(13), color: '#64748B', lineHeight: 18, marginTop: 4 },
    countBadge: {
        paddingHorizontal: scale(8), paddingVertical: 3,
        borderRadius: 10, marginLeft: 8,
    },
    countBadgeText: { fontSize: moderateScale(11), fontWeight: '700', color: '#0369A1' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    chip: {
        backgroundColor: '#F1F5F9', paddingHorizontal: scale(10),
        paddingVertical: 3, borderRadius: 10,
        maxWidth: scale(120),
    },
    chipText: { fontSize: moderateScale(11), fontWeight: '600', color: '#475569' },
    warningRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
    warningText: { fontSize: moderateScale(11), color: '#F59E0B', fontWeight: '500', flex: 1 },
});