import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    RefreshControl,
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
} from 'react-native-reanimated';
import {
    DailySchedule,
    findDuplicateMedications,
    getActiveMedications,
    getTodaySchedule,
    markMedicationTaken,
    MedicationRecord,
    updateMedicationStatus
} from '../services/medicationStorage';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function MedicationsScreen() {
    const router = useRouter();

    const [medications, setMedications] = useState<MedicationRecord[]>([]);
    const [todaySchedule, setTodaySchedule] = useState<DailySchedule[]>([]);
    const [duplicates, setDuplicates] = useState<Array<{ ingredient: string; medications: MedicationRecord[] }>>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [expandedMedId, setExpandedMedId] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setIsLoading(true);
            const [meds, schedule, dups] = await Promise.all([
                getActiveMedications(),
                getTodaySchedule(),
                findDuplicateMedications()
            ]);
            setMedications(meds);
            setTodaySchedule(schedule);
            setDuplicates(dups);
        } catch (error) {
            console.error('Error loading medications:', error);
            Alert.alert('Error', 'Failed to load medications');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const handleMarkTaken = async (medicationId: string) => {
        try {
            await markMedicationTaken(medicationId);
            await loadData();
        } catch (error) {
            Alert.alert('Error', 'Failed to mark as taken');
        }
    };

    const handleDiscontinue = async (medicationId: string) => {
        Alert.alert(
            'Discontinue Medication',
            'Are you sure you want to mark this medication as discontinued?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Discontinue',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await updateMedicationStatus(medicationId, 'discontinued');
                            await loadData();
                        } catch (error) {
                            Alert.alert('Error', 'Failed to discontinue medication');
                        }
                    }
                }
            ]
        );
    };

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <View style={styles.loadingIconWrap}>
                        <ActivityIndicator size="large" color="#0369A1" />
                    </View>
                    <Text style={styles.loadingText}>Loading medications...</Text>
                </View>
            </SafeAreaView>
        );
    }


    const Header = (
        <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                <View style={styles.backBtnCircle}>
                    <Ionicons name="arrow-back" size={20} color="#0F172A" />
                </View>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>My Medications</Text>
                <Text style={styles.headerSubtitle}>
                    {medications.length} Active Medicine{medications.length !== 1 ? 's' : ''}
                </Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/scanner')} style={styles.addButton}>
                <View style={styles.addBtnCircle}>
                    <Ionicons name="add" size={22} color="#FFF" />
                </View>
            </TouchableOpacity>
        </Animated.View>
    );

    const Content = (
        <>
            <StatusBar barStyle="dark-content" />

            <ScrollView
                style={styles.scrollView}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#0369A1" />}
            >
                {/* Duplicates Warning */}
                {duplicates.length > 0 && (
                    <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.warningBanner}>
                        <View style={styles.warningIconWrap}>
                            <Ionicons name="warning" size={18} color="#DC2626" />
                        </View>
                        <Text style={styles.warningText}>
                            {duplicates.length} duplicate medication{duplicates.length > 1 ? 's' : ''} detected
                        </Text>
                    </Animated.View>
                )}

                {/* Today's Schedule */}
                {todaySchedule.length > 0 && (
                    <Animated.View entering={FadeInUp.duration(500).delay(200)} style={styles.section}>
                        <View style={styles.sectionTitleRow}>
                            <Ionicons name="calendar-outline" size={16} color="#64748B" />
                            <Text style={styles.sectionTitle}>TODAY&apos;S SCHEDULE</Text>
                        </View>
                        {todaySchedule.map((item, index) => (
                            <AnimatedTouchable
                                key={index}
                                entering={FadeInUp.duration(400).delay(250 + index * 80)}
                                style={[styles.scheduleItem, item.taken && styles.scheduleItemTaken]}
                                onPress={() => !item.taken && handleMarkTaken(item.medicationId)}
                                activeOpacity={0.85}
                            >
                                <View style={[
                                    styles.scheduleAccent,
                                    { backgroundColor: item.taken ? '#10B981' : '#0369A1' }
                                ]} />
                                <Ionicons
                                    name={item.taken ? "checkmark-circle" : "ellipse-outline"}
                                    size={26}
                                    color={item.taken ? "#10B981" : "#CBD5E1"}
                                />
                                <View style={styles.scheduleInfo}>
                                    <Text style={[styles.scheduleTime, item.taken && { color: '#94A3B8' }]}>{item.time}</Text>
                                    <Text style={[styles.scheduleMedName, item.taken && { color: '#94A3B8' }]}>{item.medicationName}</Text>
                                    <Text style={styles.scheduleDosage}>{item.dosage}</Text>
                                </View>
                                {item.taken && item.takenAt && (
                                    <View style={styles.takenBadge}>
                                        <Ionicons name="checkmark" size={12} color="#10B981" />
                                        <Text style={styles.takenTime}>
                                            {new Date(item.takenAt).toLocaleTimeString('en-US', {
                                                hour: 'numeric',
                                                minute: '2-digit'
                                            })}
                                        </Text>
                                    </View>
                                )}
                            </AnimatedTouchable>
                        ))}
                    </Animated.View>
                )}

                {/* All Medications */}
                <Animated.View entering={FadeInUp.duration(500).delay(300)} style={styles.section}>
                    <View style={styles.sectionTitleRow}>
                        <Ionicons name="medical-outline" size={16} color="#64748B" />
                        <Text style={styles.sectionTitle}>ALL MEDICATIONS</Text>
                    </View>
                    {medications.length === 0 ? (
                        <Animated.View entering={FadeInUp.duration(500).delay(400)} style={styles.emptyState}>
                            <View style={styles.emptyIconCircle}>
                                <Ionicons name="medical-outline" size={40} color="#CBD5E1" />
                            </View>
                            <Text style={styles.emptyText}>No medications found</Text>
                            <Text style={styles.emptySubtext}>Scan a prescription to get started</Text>
                            <TouchableOpacity
                                style={styles.scanButton}
                                onPress={() => router.push('/scanner')}
                                activeOpacity={0.85}
                            >
                                <Ionicons name="camera" size={20} color="#FFF" />
                                <Text style={styles.scanButtonText}>Scan Medicine</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    ) : (
                        medications.map((med, index) => {
                            const isExpanded = expandedMedId === med.id;
                            const fraud = med.analysis.fraudDetection;

                            return (
                                <Animated.View key={med.id} entering={FadeInUp.duration(400).delay(350 + index * 100)} style={styles.medCard}>
                                    <TouchableOpacity
                                        style={styles.medCardHeader}
                                        onPress={() => setExpandedMedId(isExpanded ? null : med.id)}
                                        activeOpacity={0.85}
                                    >
                                        <Image source={{ uri: med.imageUri }} style={styles.medThumb} />
                                        <View style={styles.medCardHeaderInfo}>
                                            <Text style={styles.medName}>{med.analysis.medicineName}</Text>
                                            <Text style={styles.medDosage}>{med.analysis.dosage}</Text>
                                            
                                            {med.inventoryCount !== undefined && med.dailyDoseCount !== undefined && (
                                                <View style={styles.inventoryStatusRow}>
                                                    <View style={[
                                                        styles.stockBadge, 
                                                        med.inventoryCount < (med.dailyDoseCount * 5) ? styles.stockBadgeLow : styles.stockBadgeGood
                                                    ]}>
                                                        <View style={[styles.authDot, { backgroundColor: med.inventoryCount < (med.dailyDoseCount * 5) ? '#DC2626' : '#059669' }]} />
                                                        <Text style={[styles.stockBadgeText, { color: med.inventoryCount < (med.dailyDoseCount * 5) ? '#991B1B' : '#065F46' }]}>
                                                            {med.inventoryCount} pills left
                                                        </Text>
                                                    </View>
                                                    {med.inventoryCount < (med.dailyDoseCount * 5) && (
                                                        <Text style={styles.lowStockWarningText}>⚠ Low Stock</Text>
                                                    )}
                                                </View>
                                            )}

                                            {fraud && (
                                                <View style={[
                                                    styles.authBadge,
                                                    { backgroundColor: fraud.riskLevel === 'safe' ? '#10B981' : fraud.riskLevel === 'caution' ? '#EAB308' : fraud.riskLevel === 'suspicious' ? '#F97316' : '#EF4444' }
                                                ]}>
                                                    <View style={styles.authDot} />
                                                    <Text style={styles.authBadgeText}>
                                                        {fraud.authenticityScore}% {fraud.riskLevel.toUpperCase()}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                        <View style={styles.chevronWrap}>
                                            <Ionicons
                                                name={isExpanded ? "chevron-up" : "chevron-down"}
                                                size={18}
                                                color="#94A3B8"
                                            />
                                        </View>
                                    </TouchableOpacity>

                                    {isExpanded && (
                                        <Animated.View entering={FadeInDown.duration(300)} style={styles.medCardBody}>
                                            <Text style={styles.bodyLabel}>Active Ingredients</Text>
                                            <Text style={styles.bodyText}>{med.analysis.activeIngredients}</Text>

                                            <Text style={styles.bodyLabel}>Purpose</Text>
                                            <Text style={styles.bodyText}>{med.analysis.commonUses}</Text>

                                            {med.analysis.prescribedBy && (
                                                <>
                                                    <Text style={styles.bodyLabel}>Prescribed By</Text>
                                                    <Text style={styles.bodyText}>
                                                        {med.analysis.prescribedBy}
                                                        {med.analysis.licenseNumber && ` (PRC: ${med.analysis.licenseNumber})`}
                                                    </Text>
                                                    {med.analysis.hospital && (
                                                        <Text style={styles.bodyTextSmall}>{med.analysis.hospital}</Text>
                                                    )}
                                                </>
                                            )}

                                            <Text style={styles.bodyLabel}>Scanned On</Text>
                                            <Text style={styles.bodyText}>
                                                {new Date(med.scanDate).toLocaleDateString('en-US', {
                                                    year: 'numeric',
                                                    month: 'long',
                                                    day: 'numeric'
                                                })}
                                            </Text>

                                            {/* Restock Button overlay specifically for Low Stock items */}
                                            {med.inventoryCount !== undefined && med.dailyDoseCount !== undefined && med.inventoryCount < (med.dailyDoseCount * 5) && (
                                                <TouchableOpacity
                                                    style={styles.restockButton}
                                                    onPress={() => router.push('/pharmacy-finder')}
                                                    activeOpacity={0.8}
                                                >
                                                    <Ionicons name="cart" size={18} color="#FFF" />
                                                    <Text style={styles.restockText}>Restock Now (Find Pharmacy)</Text>
                                                </TouchableOpacity>
                                            )}

                                            <TouchableOpacity
                                                style={styles.discontinueButton}
                                                onPress={() => handleDiscontinue(med.id)}
                                                activeOpacity={0.8}
                                            >
                                                <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
                                                <Text style={styles.discontinueText}>Discontinue</Text>
                                            </TouchableOpacity>
                                        </Animated.View>
                                    )}
                                </Animated.View>
                            );
                        })
                    )}
                </Animated.View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </>
    );

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            {Header}
            {Content}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    loadingIconWrap: {
        width: 64,
        height: 64,
        borderRadius: 22,
        backgroundColor: '#EFF6FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        fontSize: 18,
        color: '#0369A1',
        fontWeight: '600',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 32,
        paddingBottom: 20,
        backgroundColor: '#FFF',
        borderBottomWidth: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
        elevation: 1,
        gap: 12,
    },
    backButton: {},
    backBtnCircle: {
        width: 40,
        height: 40,
        borderRadius: 14,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: -0.3,
    },
    headerSubtitle: {
        fontSize: 16,
        color: '#0369A1',
        marginTop: 4,
        fontWeight: '600',
    },
    addButton: {},
    addBtnCircle: {
        width: 40,
        height: 40,
        borderRadius: 14,
        backgroundColor: '#0369A1',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollView: {
        flex: 1,
    },
    warningBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEF2F2',
        padding: 16,
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: 16,
        gap: 14,
        borderWidth: 0,
        shadowColor: '#DC2626',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 2,
    },
    warningIconWrap: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: '#FEE2E2',
        alignItems: 'center',
        justifyContent: 'center',
    },
    warningText: {
        flex: 1,
        fontSize: 16,
        color: '#991B1B',
        fontWeight: '700',
    },
    section: {
        marginTop: 32,
        paddingHorizontal: 16,
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: '#0369A1',
        letterSpacing: 1.4,
        textTransform: 'uppercase',
    },
    scheduleItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        padding: 18,
        borderRadius: 16,
        marginBottom: 12,
        gap: 14,
        borderWidth: 0,
        shadowColor: '#0369A1',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 3,
        overflow: 'hidden',
    },
    scheduleItemTaken: {
        backgroundColor: '#FAFBFC',
        borderColor: '#E2E8F0',
    },
    scheduleAccent: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        borderTopLeftRadius: 16,
        borderBottomLeftRadius: 16,
    },
    scheduleInfo: {
        flex: 1,
    },
    scheduleTime: {
        fontSize: 16,
        fontWeight: '800',
        color: '#0F172A',
    },
    scheduleMedName: {
        fontSize: 16,
        color: '#0F172A',
        marginTop: 6,
        fontWeight: '700',
    },
    scheduleDosage: {
        fontSize: 16,
        color: '#64748B',
        marginTop: 4,
        fontWeight: '500',
    },
    takenBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#F0FDF4',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#BBF7D0',
    },
    takenTime: {
        fontSize: 14,
        color: '#10B981',
        fontWeight: '800',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 48,
        gap: 8,
    },
    emptyIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 32,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
        shadowColor: '#94A3B8',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 2,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#94A3B8',
    },
    emptySubtext: {
        fontSize: 16,
        color: '#94A3B8',
        fontWeight: '500',
    },
    scanButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0369A1',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 16,
        marginTop: 20,
        gap: 8,
        shadowColor: '#0369A1',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    scanButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFF',
    },
    medCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        marginBottom: 12,
        overflow: 'hidden',
        borderWidth: 0,
        shadowColor: '#0369A1',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 3,
    },
    medCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 18,
        gap: 16,
    },
    medThumb: {
        width: 72,
        height: 72,
        borderRadius: 16,
        backgroundColor: '#F0F9FF',
        borderWidth: 2,
        borderColor: '#0369A1',
    },
    medCardHeaderInfo: {
        flex: 1,
    },
    medName: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: -0.2,
    },
    medDosage: {
        fontSize: 16,
        color: '#64748B',
        marginTop: 4,
        fontWeight: '500',
    },
    authBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 20,
        marginTop: 6,
        gap: 4,
    },
    authDot: {
        width: 5,
        height: 5,
        borderRadius: 3,
        backgroundColor: '#FFF',
    },
    authBadgeText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#FFF',
        letterSpacing: 0.5,
    },
    chevronWrap: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
    },
    medCardBody: {
        padding: 18,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
    },
    bodyLabel: {
        fontSize: 14,
        fontWeight: '800',
        color: '#0369A1',
        marginTop: 18,
        marginBottom: 8,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
    },
    bodyText: {
        fontSize: 16,
        color: '#334155',
        lineHeight: 24,
        fontWeight: '500',
    },
    bodyTextSmall: {
        fontSize: 15,
        color: '#64748B',
        marginTop: 4,
        fontWeight: '500',
    },
    discontinueButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FEF2F2',
        padding: 12,
        borderRadius: 12,
        marginTop: 16,
        gap: 8,
        borderWidth: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.02,
        shadowRadius: 3,
        elevation: 1,
    },
    discontinueText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#DC2626',
    },
    inventoryStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        gap: 8,
    },
    stockBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
        borderWidth: 1,
    },
    stockBadgeGood: {
        backgroundColor: '#D1FAE5',
        borderColor: '#34D399',
    },
    stockBadgeLow: {
        backgroundColor: '#FEE2E2',
        borderColor: '#F87171',
    },
    stockBadgeText: {
        fontSize: 13,
        fontWeight: '700',
    },
    lowStockWarningText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#DC2626',
    },
    restockButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#8B5CF6',
        padding: 12,
        borderRadius: 12,
        marginTop: 20,
        gap: 8,
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    restockText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFF',
    }
});
