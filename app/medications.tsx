import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Image, RefreshControl, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
    DailySchedule,
    findDuplicateMedications,
    getActiveMedications,
    getTodaySchedule,
    markMedicationTaken,
    MedicationRecord,
    updateMedicationStatus
} from '../services/medicationStorage';

const { width } = Dimensions.get('window');

export default function MedicationsScreen() {
    const router = useRouter();

    // State
    const [medications, setMedications] = useState<MedicationRecord[]>([]);
    const [todaySchedule, setTodaySchedule] = useState<DailySchedule[]>([]);
    const [duplicates, setDuplicates] = useState<Array<{ ingredient: string; medications: MedicationRecord[] }>>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [expandedMedId, setExpandedMedId] = useState<string | null>(null);

    // Load data on mount
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
            await loadData(); // Reload to update checkmarks
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
                    <ActivityIndicator size="large" color="#007AFF" />
                    <Text style={styles.loadingText}>Loading medications...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#000" />
                </TouchableOpacity>
                <View>
                    <Text style={styles.headerTitle}>My Medications</Text>
                    <Text style={styles.headerSubtitle}>{medications.length} Active Medicine{medications.length !== 1 ? 's' : ''}</Text>
                </View>
                <TouchableOpacity onPress={() => router.push('/scanner')} style={styles.addButton}>
                    <Ionicons name="add-circle" size={28} color="#007AFF" />
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scrollView}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            >
                {/* Duplicates Warning */}
                {duplicates.length > 0 && (
                    <View style={styles.warningBanner}>
                        <Ionicons name="warning" size={20} color="#DC2626" />
                        <Text style={styles.warningText}>
                            {duplicates.length} duplicate medication{duplicates.length > 1 ? 's' : ''} detected
                        </Text>
                    </View>
                )}

                {/* Today's Schedule */}
                {todaySchedule.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>TODAY'S SCHEDULE</Text>
                        {todaySchedule.map((item, index) => (
                            <TouchableOpacity
                                key={index}
                                style={styles.scheduleItem}
                                onPress={() => !item.taken && handleMarkTaken(item.medicationId)}
                            >
                                <Ionicons
                                    name={item.taken ? "checkmark-circle" : "ellipse-outline"}
                                    size={24}
                                    color={item.taken ? "#10B981" : "#D1D5DB"}
                                />
                                <View style={styles.scheduleInfo}>
                                    <Text style={styles.scheduleTime}>{item.time}</Text>
                                    <Text style={styles.scheduleMedName}>{item.medicationName}</Text>
                                    <Text style={styles.scheduleDosage}>{item.dosage}</Text>
                                </View>
                                {item.taken && item.takenAt && (
                                    <Text style={styles.takenTime}>
                                        {new Date(item.takenAt).toLocaleTimeString('en-US', {
                                            hour: 'numeric',
                                            minute: '2-digit'
                                        })}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* All Medications */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>ALL MEDICATIONS</Text>
                    {medications.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="medical-outline" size={48} color="#D1D5DB" />
                            <Text style={styles.emptyText}>No medications found</Text>
                            <Text style={styles.emptySubtext}>Scan a prescription to get started</Text>
                            <TouchableOpacity
                                style={styles.scanButton}
                                onPress={() => router.push('/scanner')}
                            >
                                <Ionicons name="camera" size={20} color="#FFF" />
                                <Text style={styles.scanButtonText}>Scan Medicine</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        medications.map(med => {
                            const isExpanded = expandedMedId === med.id;
                            const fraud = med.analysis.fraudDetection;

                            return (
                                <View key={med.id} style={styles.medCard}>
                                    <TouchableOpacity
                                        style={styles.medCardHeader}
                                        onPress={() => setExpandedMedId(isExpanded ? null : med.id)}
                                    >
                                        <Image source={{ uri: med.imageUri }} style={styles.medThumb} />
                                        <View style={styles.medCardHeaderInfo}>
                                            <Text style={styles.medName}>{med.analysis.medicineName}</Text>
                                            <Text style={styles.medDosage}>{med.analysis.dosage}</Text>
                                            {fraud && (
                                                <View style={[
                                                    styles.authBadge,
                                                    { backgroundColor: fraud.riskLevel === 'safe' ? '#10B981' : fraud.riskLevel === 'caution' ? '#EAB308' : fraud.riskLevel === 'suspicious' ? '#F97316' : '#EF4444' }
                                                ]}>
                                                    <Text style={styles.authBadgeText}>
                                                        {fraud.authenticityScore}% {fraud.riskLevel.toUpperCase()}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                        <Ionicons
                                            name={isExpanded ? "chevron-up" : "chevron-down"}
                                            size={20}
                                            color="#8E8E93"
                                        />
                                    </TouchableOpacity>

                                    {isExpanded && (
                                        <View style={styles.medCardBody}>
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

                                            <TouchableOpacity
                                                style={styles.discontinueButton}
                                                onPress={() => handleDiscontinue(med.id)}
                                            >
                                                <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
                                                <Text style={styles.discontinueText}>Discontinue</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>
                            );
                        })
                    )}
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        color: '#6B7280',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#000',
    },
    headerSubtitle: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 2,
    },
    addButton: {
        padding: 4,
    },
    scrollView: {
        flex: 1,
    },
    warningBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEF2F2',
        padding: 12,
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: 8,
        gap: 8,
    },
    warningText: {
        flex: 1,
        fontSize: 14,
        color: '#DC2626',
        fontWeight: '600',
    },
    section: {
        marginTop: 24,
        paddingHorizontal: 16,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#6B7280',
        letterSpacing: 0.5,
        marginBottom: 12,
    },
    scheduleItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 16,
        borderRadius: 12,
        marginBottom: 8,
        gap: 12,
    },
    scheduleInfo: {
        flex: 1,
    },
    scheduleTime: {
        fontSize: 16,
        fontWeight: '700',
        color: '#000',
    },
    scheduleMedName: {
        fontSize: 15,
        color: '#374151',
        marginTop: 2,
    },
    scheduleDosage: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 1,
    },
    takenTime: {
        fontSize: 12,
        color: '#10B981',
        fontWeight: '600',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 48,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#9CA3AF',
        marginTop: 16,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#D1D5DB',
        marginTop: 4,
    },
    scanButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#007AFF',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 10,
        marginTop: 24,
        gap: 8,
    },
    scanButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFF',
    },
    medCard: {
        backgroundColor: '#FFF',
        borderRadius: 12,
        marginBottom: 12,
        overflow: 'hidden',
    },
    medCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 12,
    },
    medThumb: {
        width: 60,
        height: 60,
        borderRadius: 8,
        backgroundColor: '#E5E7EB',
    },
    medCardHeaderInfo: {
        flex: 1,
    },
    medName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#000',
    },
    medDosage: {
        fontSize: 14,
        color: '#6B7280',
        marginTop: 2,
    },
    authBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
        marginTop: 6,
    },
    authBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#FFF',
        letterSpacing: 0.5,
    },
    medCardBody: {
        padding: 16,
        paddingTop: 0,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
    },
    bodyLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#6B7280',
        marginTop: 12,
        marginBottom: 4,
        letterSpacing: 0.5,
    },
    bodyText: {
        fontSize: 14,
        color: '#374151',
        lineHeight: 20,
    },
    bodyTextSmall: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 2,
    },
    discontinueButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FEF2F2',
        padding: 12,
        borderRadius: 8,
        marginTop: 16,
        gap: 6,
    },
    discontinueText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#DC2626',
    },
});
