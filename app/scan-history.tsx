import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { clearScans, getRecentScans, SavedScan } from '../services/storage';
import { moderateScale, scale, verticalScale } from '../utils/responsive';

type SortType = 'newest' | 'oldest' | 'severity';
type FilterType = 'all' | 'warnings' | 'safe';

export default function ScanHistoryScreen() {
    const router = useRouter();
    const [scans, setScans] = useState<SavedScan[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<SortType>('newest');
    const [filterBy, setFilterBy] = useState<FilterType>('all');
    const [favorites, setFavorites] = useState<string[]>([]);
    const [contextMenuId, setContextMenuId] = useState<string | null>(null);

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

    // Get medicine type based on name/uses
    const getMedicineType = (medicineName: string, commonUses?: string) => {
        const text = (medicineName + ' ' + (commonUses || '')).toLowerCase();

        if (text.includes('pain') || text.includes('ibuprofen') || text.includes('paracetamol')) return { type: 'Painkiller', color: '#F59E0B' };
        if (text.includes('antibiotic') || text.includes('amoxicillin') || text.includes('penicillin')) return { type: 'Antibiotic', color: '#8B5CF6' };
        if (text.includes('vitamin') || text.includes('supplement')) return { type: 'Vitamin', color: '#10B981' };
        if (text.includes('cold') || text.includes('cough') || text.includes('flu')) return { type: 'Cold/Flu', color: '#06B6D4' };
        if (text.includes('allergy') || text.includes('antihistamine')) return { type: 'Allergy', color: '#EC4899' };
        if (text.includes('blood') || text.includes('pressure')) return { type: 'BP Control', color: '#EF4444' };

        return { type: 'Medicine', color: '#3B82F6' };
    };

    // Check for drug interactions between medicines
    const checkDrugInteractions = (meds: any[]) => {
        if (meds.length < 2) return null;

        const highRiskPairs = [
            ['ibuprofen', 'aspirin'],
            ['warfarin', 'aspirin'],
            ['metformin', 'alcohol'],
        ];

        const medNames = meds.map(m => m.medicineName.toLowerCase());
        for (const pair of highRiskPairs) {
            if (pair.every(p => medNames.some(m => m.includes(p)))) {
                return 'Potential drug interaction detected';
            }
        }
        return null;
    };

    // Group scans by date
    const groupScansByDate = (scanList: SavedScan[]) => {
        const grouped: { [key: string]: SavedScan[] } = {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        scanList.forEach(scan => {
            const scanDate = new Date(scan.timestamp);
            scanDate.setHours(0, 0, 0, 0);

            let group = 'Earlier';
            const diffDays = Math.floor((today.getTime() - scanDate.getTime()) / (1000 * 60 * 60 * 24));

            if (diffDays === 0) group = 'Today';
            else if (diffDays <= 7) group = 'This Week';
            else if (diffDays <= 30) group = 'This Month';

            if (!grouped[group]) grouped[group] = [];
            grouped[group].push(scan);
        });

        return grouped;
    };

    // Filter and sort scans
    const filteredAndSortedScans = useMemo(() => {
        let result = scans.filter(scan => {
            const meds = scan.analysis;
            const medsMatch = meds.some(m =>
                m.medicineName.toLowerCase().includes(searchQuery.toLowerCase())
            );

            if (filterBy === 'warnings') {
                return medsMatch && meds.some(m => m.warnings && m.warnings !== 'None');
            } else if (filterBy === 'safe') {
                return medsMatch && meds.every(m => !m.warnings || m.warnings === 'None');
            }

            return medsMatch;
        });

        if (sortBy === 'newest') {
            result.sort((a, b) => b.timestamp - a.timestamp);
        } else if (sortBy === 'oldest') {
            result.sort((a, b) => a.timestamp - b.timestamp);
        } else if (sortBy === 'severity') {
            result.sort((a, b) => {
                const aHasWarning = a.analysis.some(m => m.warnings && m.warnings !== 'None');
                const bHasWarning = b.analysis.some(m => m.warnings && m.warnings !== 'None');
                return bHasWarning ? 1 : -1;
            });
        }

        return result;
    }, [scans, searchQuery, sortBy, filterBy]);

    // Handle individual scan deletion
    const handleDeleteScan = (scanId: string) => {
        Alert.alert(
            'Delete Scan',
            'Are you sure you want to delete this scan record?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                        setScans(scans.filter(s => s.id !== scanId));
                    },
                },
            ]
        );
    };

    // Toggle favorite
    const toggleFavorite = (scanId: string) => {
        setFavorites(prev =>
            prev.includes(scanId) ? prev.filter(id => id !== scanId) : [...prev, scanId]
        );
    };

    return (
        <SafeAreaView style={styles.root}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
                        <View style={styles.headerBtn}>
                            <MaterialIcons name="arrow-back" size={24} color="#334155" />
                        </View>
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>Scan History</Text>
                        <Text style={styles.headerSub}>{scans.length} scan{scans.length !== 1 ? 's' : ''} saved</Text>
                    </View>
                    {scans.length > 0 && (
                        <TouchableOpacity onPress={handleClearAll} activeOpacity={0.7}>
                            <View style={styles.headerBtn}>
                                <MaterialIcons name="delete-outline" size={22} color="#EF4444" />
                            </View>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Search Bar */}
            {scans.length > 0 && (
                <View style={styles.searchSection}>
                    <MaterialIcons name="search" size={20} color="#64748B" style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search medicines..."
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholderTextColor="#94A3B8"
                    />
                </View>
            )}

            {/* Filter & Sort Buttons */}
            {scans.length > 0 && (
                <View style={styles.filterRow}>
                    <TouchableOpacity
                        onPress={() => setFilterBy(filterBy === 'all' ? 'warnings' : filterBy === 'warnings' ? 'safe' : 'all')}
                        style={[styles.filterBtn, filterBy !== 'all' && styles.filterBtnActive]}
                    >
                        <MaterialIcons name="filter-list" size={16} color={filterBy !== 'all' ? '#FF5252' : '#64748B'} />
                        <Text style={[styles.filterBtnText, filterBy !== 'all' && styles.filterBtnTextActive]}>
                            {filterBy === 'all' ? 'All' : filterBy === 'warnings' ? 'Warnings' : 'Safe'}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => setSortBy(sortBy === 'newest' ? 'oldest' : sortBy === 'oldest' ? 'severity' : 'newest')}
                        style={styles.filterBtn}
                    >
                        <MaterialIcons name="sort" size={16} color="#64748B" />
                        <Text style={styles.filterBtnText}>
                            {sortBy === 'newest' ? 'Newest' : sortBy === 'oldest' ? 'Oldest' : 'Severity'}
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            <ScrollView
                style={styles.body}
                contentContainerStyle={[styles.bodyContent, filteredAndSortedScans.length === 0 && { flex: 1 }]}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#334155']} />}
                showsVerticalScrollIndicator={false}
            >
                {loading ? (
                    <View style={styles.emptyState}>
                        <ActivityIndicator size="large" color="#334155" />
                        <Text style={styles.emptyTitle}>Loading...</Text>
                    </View>
                ) : scans.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <MaterialIcons name="document-scanner" size={56} color="#334155" />
                        </View>
                        <Text style={styles.emptyTitle}>No Scans Yet</Text>
                        <Text style={styles.emptySub}>Scan a medicine to see it here</Text>
                        <TouchableOpacity onPress={() => router.push('/scanner')} activeOpacity={0.85}>
                            <View style={styles.scanBtn}>
                                <MaterialIcons name="document-scanner" size={20} color="#FFF" />
                                <Text style={styles.scanBtnText}>Go to Scanner</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                ) : filteredAndSortedScans.length === 0 ? (
                    <View style={styles.emptyState}>
                        <MaterialIcons name="search-off" size={56} color="#64748B" />
                        <Text style={styles.emptyTitle}>No Results</Text>
                        <Text style={styles.emptySub}>No medicines match your search</Text>
                    </View>
                ) : (
                    <>
                        {/* Stats Dashboard */}
                        <View style={styles.statsCard}>
                            <View style={styles.statItem}>
                                <MaterialIcons name="history" size={20} color="#334155" />
                                <View style={styles.statRowText}>
                                    <Text style={styles.statNumber}>{scans.length}</Text>
                                    <Text style={styles.statLabel}>Scans</Text>
                                </View>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statItem}>
                                <MaterialIcons name="star" size={20} color="#D97706" />
                                <View style={styles.statRowText}>
                                    <Text style={styles.statNumber}>{favorites.length}</Text>
                                    <Text style={styles.statLabel}>Favs</Text>
                                </View>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statItem}>
                                <MaterialIcons name="report-problem" size={20} color="#DC2626" />
                                <View style={styles.statRowText}>
                                    <Text style={styles.statNumber}>{scans.filter(s => s.analysis.some(m => m.warnings && m.warnings !== 'None')).length}</Text>
                                    <Text style={styles.statLabel}>Alerts</Text>
                                </View>
                            </View>
                        </View>

                        {filteredAndSortedScans.map((scan, index) => {
                            const meds = scan.analysis;
                            const primary = meds[0];
                            const isFavorite = favorites.includes(scan.id);
                            const interaction = checkDrugInteractions(meds);
                            const medType = getMedicineType(primary.medicineName, primary.commonUses);
                            const title = meds.length > 1 ? `${meds.length} Medicines` : primary.medicineName;
                            const subtitle = meds.length > 1
                                ? meds.map(m => m.medicineName).join(', ')
                                : primary.commonUses;

                            return (
                                <Animated.View
                                    key={scan.id}
                                    entering={FadeInUp.duration(400).delay(index * 60)}
                                >
                                    {/* Context Menu */}
                                    {contextMenuId === scan.id && (
                                        <View style={styles.contextMenu}>
                                            <TouchableOpacity
                                                style={styles.contextOption}
                                                onPress={() => {
                                                    toggleFavorite(scan.id);
                                                    setContextMenuId(null);
                                                }}
                                            >
                                                <MaterialIcons name={isFavorite ? "star" : "star-outline"} size={18} color="#F59E0B" />
                                                <Text style={styles.contextOptionText}>{isFavorite ? 'Unfavorite' : 'Favorite'}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={styles.contextOption}
                                                onPress={() => {
                                                    handleDeleteScan(scan.id);
                                                    setContextMenuId(null);
                                                }}
                                            >
                                                <MaterialIcons name="delete" size={18} color="#EF4444" />
                                                <Text style={[styles.contextOptionText, { color: '#EF4444' }]}>Delete</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={styles.contextOption}
                                                onPress={() => setContextMenuId(null)}
                                            >
                                                <MaterialIcons name="close" size={18} color="#64748B" />
                                                <Text style={styles.contextOptionText}>Close</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    <TouchableOpacity
                                        activeOpacity={0.75}
                                        onLongPress={() => setContextMenuId(contextMenuId === scan.id ? null : scan.id)}
                                        onPress={() => {
                                            if (contextMenuId !== scan.id) {
                                                router.push({
                                                    pathname: '/medicine-details',
                                                    params: {
                                                        scanData: JSON.stringify(scan),
                                                        medicineData: JSON.stringify(meds)
                                                    }
                                                });
                                            }
                                        }}
                                    >
                                        <View style={[styles.card, isFavorite && styles.cardFavorited]}>
                                            <View style={styles.cardBody}>
                                                <View style={styles.cardTop}>
                                                    <View style={{ flex: 1 }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                            {/* Severity Dot */}
                                                            <View style={[styles.severityDot, { backgroundColor: getSeverityColor(primary.warnings) }]} />
                                                            <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
                                                            {isFavorite && <MaterialIcons name="star" size={16} color="#F59E0B" />}
                                                        </View>
                                                        <Text style={styles.cardDate}>{formatDate(scan.timestamp)}</Text>
                                                    </View>

                                                    <View style={styles.cardActions}>
                                                        <TouchableOpacity
                                                            style={styles.actionBtn}
                                                            onPress={() => toggleFavorite(scan.id)}
                                                        >
                                                            <MaterialIcons name={isFavorite ? "star" : "star-outline"} size={22} color={isFavorite ? "#F59E0B" : "#CBD5E1"} />
                                                        </TouchableOpacity>
                                                        <TouchableOpacity
                                                            style={styles.actionBtn}
                                                            onPress={() => handleDeleteScan(scan.id)}
                                                        >
                                                            <MaterialIcons name="delete-outline" size={22} color="#EF4444" />
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>

                                                <View style={styles.metaRow}>
                                                    <View style={[styles.typeTag, { backgroundColor: medType.color + '15' }]}>
                                                        <Text style={[styles.typeTagText, { color: medType.color }]}>
                                                            {medType.type}
                                                        </Text>
                                                    </View>

                                                    {meds.length > 1 && (
                                                        <View style={[styles.countBadge, { backgroundColor: '#F1F5F9' }]}>
                                                            <Text style={styles.countBadgeText}>{meds.length} meds</Text>
                                                        </View>
                                                    )}
                                                </View>

                                                {subtitle && meds.length === 1 ? (
                                                    <Text style={styles.cardSub} numberOfLines={2}>{subtitle}</Text>
                                                ) : null}

                                                {/* Medicine list - vertical and sleek */}
                                                <View style={styles.medicineList}>
                                                    {meds.map((m, i) => (
                                                        <View key={i} style={styles.medicineRow}>
                                                            <View style={styles.medicineBullet} />
                                                            <Text style={styles.medicineNameText} numberOfLines={1}>
                                                                {m.medicineName}
                                                            </Text>
                                                            {m.dosage && (
                                                                <Text style={styles.medicineDosageText}> • {m.dosage}</Text>
                                                            )}
                                                        </View>
                                                    ))}
                                                </View>

                                                {/* Alerts Section */}
                                                <View style={styles.alertsContainer}>
                                                    {interaction && (
                                                        <View style={styles.interactionWarning}>
                                                            <MaterialIcons name="report-problem" size={16} color="#DC2626" />
                                                            <Text style={styles.interactionText}>{interaction}</Text>
                                                        </View>
                                                    )}

                                                    {primary.warnings && primary.warnings !== 'None' && (
                                                        <View style={styles.warningRow}>
                                                            <MaterialIcons name="info-outline" size={16} color="#B45309" />
                                                            <Text style={styles.warningText} numberOfLines={2}>{primary.warnings}</Text>
                                                        </View>
                                                    )}
                                                </View>
                                            </View>

                                            <View style={styles.chevronWrap}>
                                                <MaterialIcons name="chevron-right" size={24} color="#CBD5E1" />
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                </Animated.View>
                            );
                        })}
                    </>
                )}
                <View style={{ height: verticalScale(32) }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F9FAFB' },
    header: {
        paddingTop: verticalScale(48),
        paddingBottom: verticalScale(24),
        paddingHorizontal: scale(20),
        backgroundColor: '#F9FAFB',
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: scale(14) },
    headerBtn: {
        width: scale(44), height: scale(44), borderRadius: 14,
        backgroundColor: '#F1F5F9',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: moderateScale(22), fontWeight: '800', color: '#1E293B' },
    headerSub: { fontSize: moderateScale(15), color: '#64748B', fontWeight: '500', marginTop: 2 },
    body: { flex: 1 },
    bodyContent: { paddingVertical: verticalScale(12), paddingHorizontal: 0 },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingBottom: 80 },
    emptyIconWrap: {
        width: 88,
        height: 88,
        borderRadius: 22,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyIcon: { fontSize: 64 },
    emptyTitle: { fontSize: moderateScale(20), fontWeight: '700', color: '#1E293B' },
    emptySub: { fontSize: moderateScale(16), color: '#94A3B8', fontWeight: '500' },
    scanBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: scale(28), paddingVertical: verticalScale(14),
        borderRadius: 18, marginTop: 12,
        backgroundColor: '#334155',
    },
    scanBtnText: { color: '#FFF', fontWeight: '700', fontSize: moderateScale(16) },
    card: {
        flexDirection: 'row',
        backgroundColor: '#FFF',
        borderRadius: 20,
        marginHorizontal: scale(16),
        marginBottom: verticalScale(16),
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    accent: { width: 7, alignSelf: 'stretch', display: 'none' }, // Deprecated bulky bar
    severityDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    cardBody: { flex: 1, padding: scale(16) },
    cardThumb: { display: 'none' },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
    cardTitle: { fontSize: moderateScale(18), fontWeight: '800', color: '#1E293B', flexShrink: 1, letterSpacing: -0.3 },
    cardDate: { fontSize: moderateScale(13), color: '#94A3B8', marginTop: 2, fontWeight: '600' },
    cardSub: { fontSize: moderateScale(14), color: '#64748B', lineHeight: 22, marginTop: 12 },
    countBadge: {
        paddingHorizontal: scale(10), paddingVertical: 4,
        borderRadius: 10,
    },
    countBadgeText: { fontSize: moderateScale(14), fontWeight: '700', color: '#334155' },

    // Sleek medicine list
    medicineList: { marginTop: 10, gap: 8 },
    medicineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    medicineBullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#CBD5E1' },
    medicineNameText: { fontSize: moderateScale(15), fontWeight: '600', color: '#334155', flexShrink: 1 },
    medicineDosageText: { fontSize: moderateScale(14), color: '#64748B', fontWeight: '500' },

    alertsContainer: { marginTop: 6 },
    warningRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginTop: 12,
        padding: 12,
        backgroundColor: '#FFFBEB',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#FEF3C7',
    },
    warningText: { fontSize: moderateScale(13), color: '#B45309', fontWeight: '500', flex: 1, lineHeight: 18 },

    // Search Section
    searchSection: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        marginHorizontal: scale(16),
        marginTop: verticalScale(8),
        marginBottom: verticalScale(8),
        paddingHorizontal: scale(16),
        borderRadius: 16,
        height: verticalScale(52),
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    searchIcon: { marginRight: scale(10) },
    searchInput: {
        flex: 1,
        fontSize: moderateScale(15),
        color: '#1E293B',
        fontWeight: '500',
    },

    // Filter & Sort
    filterRow: {
        flexDirection: 'row',
        gap: scale(10),
        paddingHorizontal: scale(16),
        marginBottom: verticalScale(12),
    },
    filterBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: scale(6),
        paddingHorizontal: scale(14),
        paddingVertical: verticalScale(8),
        borderRadius: 12,
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    filterBtnActive: {
        backgroundColor: '#F1F5F9',
        borderColor: '#334155',
    },
    filterBtnText: {
        fontSize: moderateScale(13),
        fontWeight: '700',
        color: '#64748B',
    },
    filterBtnTextActive: {
        color: '#334155',
    },

    // Stats Card
    statsCard: {
        flexDirection: 'row',
        backgroundColor: '#FFF',
        borderRadius: 16,
        marginHorizontal: scale(16),
        marginBottom: verticalScale(16),
        height: verticalScale(48),
        paddingHorizontal: scale(12),
        borderWidth: 1,
        borderColor: '#F1F5F9',
        alignItems: 'center',
    },
    statItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
    },
    statRowText: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 3,
    },
    statDivider: {
        width: 1,
        height: '30%',
        backgroundColor: '#F1F5F9',
    },
    statNumber: {
        fontSize: moderateScale(16),
        fontWeight: '800',
        color: '#1E293B',
    },
    statLabel: {
        fontSize: moderateScale(12),
        color: '#94A3B8',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },

    // Card updates
    cardActions: {
        flexDirection: 'row',
        gap: 4,
    },
    actionBtn: {
        padding: 4,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 4,
    },
    typeTag: {
        paddingHorizontal: scale(10),
        paddingVertical: 3,
        borderRadius: 8,
    },
    typeTagText: {
        fontSize: moderateScale(12),
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    interactionWarning: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginTop: 12,
        padding: 12,
        backgroundColor: '#FEF2F2',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#FEE2E2',
    },
    interactionText: {
        fontSize: moderateScale(13),
        color: '#DC2626',
        fontWeight: '600',
        flex: 1,
        lineHeight: 18,
    },
    chevronWrap: {
        justifyContent: 'center',
        paddingRight: scale(12),
    },

    // Context Menu
    contextMenu: {
        backgroundColor: '#FFF',
        borderRadius: 16,
        marginHorizontal: scale(16),
        marginBottom: verticalScale(16),
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    contextOption: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: scale(14),
        paddingHorizontal: scale(18),
        paddingVertical: verticalScale(14),
        borderBottomWidth: 1,
        borderBottomColor: '#F8FAFC',
    },
    contextOptionText: {
        fontSize: moderateScale(15),
        fontWeight: '700',
        color: '#334155',
    },
    cardFavorited: {
        backgroundColor: '#FFFDF5',
        borderColor: '#FEF3C7',
    },
});
