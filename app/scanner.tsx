import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, Modal, Platform, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { analyzeInteractions, analyzeMedicineImage, InteractionReport, MedicineAnalysis } from '../services/gemini';
import { getRecentScans, SavedScan, saveScan } from '../services/storage';

// Configure notification handler
try {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
        }),
    });
} catch (e) {
    console.warn('Notification handler setup failed:', e);
}

const { width, height } = Dimensions.get('window');

// --- Helper Components ---

// Recent Scans Modal (Bottom Sheet Style)
interface RecentScansModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (scan: SavedScan) => void;
}

const RecentScansModal = ({ visible, onClose, onSelect }: RecentScansModalProps) => {
    const [scans, setScans] = useState<SavedScan[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (visible) {
            loadScans();
        }
    }, [visible]);

    const loadScans = async () => {
        setLoading(true);
        const data = await getRecentScans();
        setScans(data);
        setLoading(false);
    };

    const renderItem = ({ item }: { item: SavedScan }) => {
        const meds = item.analysis;
        const title = meds.length > 1
            ? `${meds.length} Medicines Found`
            : meds[0].medicineName;

        const subtitle = meds.length > 1
            ? meds.map(m => m.medicineName).join(', ')
            : new Date(item.timestamp).toLocaleDateString();

        return (
            <TouchableOpacity style={styles.recentItem} onPress={() => onSelect(item)}>
                <Image source={{ uri: item.imageUri }} style={styles.recentThumb} />
                <View style={styles.recentInfo}>
                    <Text style={styles.recentName} numberOfLines={1}>{title}</Text>
                    <Text style={styles.recentTime} numberOfLines={1}>
                        {subtitle}
                    </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
            </TouchableOpacity>
        );
    };

    return (
        <Modal visible={visible} animationType="slide" transparent={true}>
            <View style={styles.modalOverlay}>
                <View style={styles.bottomSheet}>
                    <View style={styles.sheetHeader}>
                        <Text style={styles.sheetTitle}>Recent Scans</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeIconBtn}>
                            <Ionicons name="close-circle" size={30} color="#E5E5EA" />
                        </TouchableOpacity>
                    </View>

                    {loading ? (
                        <ActivityIndicator size="large" color="#4facfe" style={{ marginTop: 40 }} />
                    ) : scans.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="medical-outline" size={48} color="#D1D1D6" />
                            <Text style={styles.emptyText}>No scans yet</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={scans}
                            keyExtractor={(item) => item.id}
                            renderItem={renderItem}
                            contentContainerStyle={styles.recentList}
                            showsVerticalScrollIndicator={false}
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
};

// Custom Time Picker
interface CustomTimePickerProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: (hour: number, minute: number) => void;
    medicineName?: string;
}

const CustomTimePicker = ({ visible, onClose, onConfirm, medicineName }: CustomTimePickerProps) => {
    const [hour, setHour] = useState(8);
    const [minute, setMinute] = useState(0);
    const [isAm, setIsAm] = useState(true);

    const handleConfirm = () => {
        let finalHour = hour;
        if (!isAm && hour < 12) finalHour += 12;
        if (isAm && hour === 12) finalHour = 0;
        onConfirm(finalHour, minute);
        onClose();
    };

    return (
        <Modal transparent visible={visible} animationType="fade">
            <View style={styles.pickerOverlay}>
                <View style={styles.pickerCard}>
                    <Text style={styles.pickerHeader}>Set Reminder</Text>
                    {medicineName && <Text style={styles.pickerSubHeader}>for {medicineName}</Text>}

                    <View style={styles.timeSelectRow}>
                        {/* Hour */}
                        <View style={styles.timeCol}>
                            <TouchableOpacity onPress={() => setHour(h => h === 12 ? 1 : h + 1)}><Ionicons name="chevron-up" size={24} color="#4facfe" /></TouchableOpacity>
                            <Text style={styles.timeDigit}>{hour.toString().padStart(2, '0')}</Text>
                            <TouchableOpacity onPress={() => setHour(h => h === 1 ? 12 : h - 1)}><Ionicons name="chevron-down" size={24} color="#4facfe" /></TouchableOpacity>
                        </View>
                        <Text style={styles.timeSeparator}>:</Text>
                        {/* Minute */}
                        <View style={styles.timeCol}>
                            <TouchableOpacity onPress={() => setMinute(m => m >= 55 ? 0 : m + 5)}><Ionicons name="chevron-up" size={24} color="#4facfe" /></TouchableOpacity>
                            <Text style={styles.timeDigit}>{minute.toString().padStart(2, '0')}</Text>
                            <TouchableOpacity onPress={() => setMinute(m => m < 5 ? 55 : m - 5)}><Ionicons name="chevron-down" size={24} color="#4facfe" /></TouchableOpacity>
                        </View>
                        {/* AM/PM */}
                        <View style={styles.amPmCol}>
                            <TouchableOpacity onPress={() => setIsAm(true)} style={[styles.amPmBox, isAm && styles.amPmSelected]}><Text style={[styles.amPmLabel, isAm && styles.amPmLabelSelected]}>AM</Text></TouchableOpacity>
                            <TouchableOpacity onPress={() => setIsAm(false)} style={[styles.amPmBox, !isAm && styles.amPmSelected]}><Text style={[styles.amPmLabel, !isAm && styles.amPmLabelSelected]}>PM</Text></TouchableOpacity>
                        </View>
                    </View>
                    <View style={styles.pickerBtnRow}>
                        <TouchableOpacity style={styles.pickerBtnCancel} onPress={onClose}><Text style={styles.pickerBtnTextCancel}>Cancel</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.pickerBtnConfirm} onPress={handleConfirm}><Text style={styles.pickerBtnTextConfirm}>Save</Text></TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};


// --- Main Screen ---

export default function Scanner() {
    const router = useRouter();
    const [permission, requestPermission] = useCameraPermissions();
    const [photo, setPhoto] = useState<string | null>(null);
    const [results, setResults] = useState<MedicineAnalysis[]>([]);
    const [interactionReport, setInteractionReport] = useState<InteractionReport | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // UI State
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [selectedMedForReminder, setSelectedMedForReminder] = useState<MedicineAnalysis | null>(null);
    const [showRecentModal, setShowRecentModal] = useState(false);
    const [expandedMedIndex, setExpandedMedIndex] = useState<number | null>(0); // Default expand first

    const cameraRef = useRef<CameraView>(null);

    // Setup Notification Channel for Android
    useEffect(() => {
        if (Platform.OS === 'android') {
            Notifications.setNotificationChannelAsync('medicine-reminders', {
                name: 'Medicine Reminders',
                importance: Notifications.AndroidImportance.HIGH,
                sound: 'default',
                vibrationPattern: [0, 250, 250, 250],
            });
        }
    }, []);

    if (!permission) return <View style={styles.container} />;
    if (!permission.granted) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.permContainer}>
                    <Ionicons name="camera-outline" size={64} color="#555" />
                    <Text style={styles.permTitle}>Camera Access Needed</Text>
                    <Text style={styles.permDesc}>Allow access to scan your medicine.</Text>
                    <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
                        <Text style={styles.permBtnText}>Enable Camera</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    const takePhoto = async () => {
        if (cameraRef.current) {
            const result = await cameraRef.current.takePictureAsync({ quality: 0.8 });
            if (result) {
                setPhoto(result.uri);
                setError(null);
            }
        }
    };

    const retakePhoto = () => {
        setPhoto(null);
        setResults([]);
        setInteractionReport(null);
        setError(null);
        setExpandedMedIndex(0);
    };

    const requestNotificationPermissions = async () => {
        const { status } = await Notifications.requestPermissionsAsync();
        return status === 'granted';
    };

    const scheduleReminder = async (medicineName: string, hour: number, minute: number, isAuto: boolean = false) => {
        try {
            const hasPermission = await requestNotificationPermissions();
            if (!hasPermission) {
                Alert.alert('Permission Required', 'Notifications are needed for reminders.');
                return;
            }

            const now = new Date();
            const scheduledTime = new Date();
            scheduledTime.setHours(hour, minute, 0, 0);
            if (scheduledTime <= now) scheduledTime.setDate(scheduledTime.getDate() + 1);

            const secondsUntil = Math.floor((scheduledTime.getTime() - now.getTime()) / 1000);

            await Notifications.scheduleNotificationAsync({
                content: {
                    title: '💊 Medicine Reminder',
                    body: `It's time for your ${medicineName}`,
                    sound: true,
                    data: { medicine: medicineName },
                    priority: Notifications.AndroidNotificationPriority.HIGH,
                },
                trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                    seconds: secondsUntil,
                    channelId: 'medicine-reminders',
                },
            });

            const timeString = scheduledTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            Alert.alert(isAuto ? '✅ Auto-Reminder' : '✅ Reminder Set', `Scheduled for ${timeString}`);
        } catch (err) {
            if (!isAuto) Alert.alert('Error', 'Could not set reminder.');
        }
    };

    const identifyMedicine = async () => {
        if (!photo) return;
        setIsAnalyzing(true);
        setError(null);
        setInteractionReport(null);

        try {
            // 1. Identification
            const analysis = await analyzeMedicineImage(photo);
            setResults(analysis);
            await saveScan(analysis, photo);

            // 2. Interaction Check (if > 1 med)
            if (analysis.length > 1) {
                const report = await analyzeInteractions(analysis);
                setInteractionReport(report);
            }

            // 3. Auto-Schedule Reminders (Optional - maybe too aggressive for multi-meds)
            // Only auto-schedule if single med found for now to avoid spam
            if (analysis.length === 1 && analysis[0].recommendedTime) {
                const [timeStr] = analysis[0].recommendedTime.split(' ');
                const [h, m] = timeStr.split(':').map(Number);
                if (!isNaN(h) && !isNaN(m)) {
                    setTimeout(() => scheduleReminder(analysis[0].medicineName, h, m, true), 800);
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Analysis failed.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleRecentSelect = (scan: SavedScan) => {
        setPhoto(scan.imageUri);
        setResults(scan.analysis);
        // We could re-run interaction check here if we saved it differently, 
        // but for now let's re-run it live or just skip if we don't save reports.
        // Let's quickly check if we can re-run:
        if (scan.analysis.length > 1) {
            analyzeInteractions(scan.analysis).then(setInteractionReport);
        } else {
            setInteractionReport(null);
        }
        setShowRecentModal(false);
    };

    const handleReminderPress = (med: MedicineAnalysis) => {
        setSelectedMedForReminder(med);
        setShowTimePicker(true);
    };

    // -- Renders --

    // Mode 1: Review / Results
    if (photo) {
        return (
            <View style={styles.container}>
                <StatusBar barStyle="light-content" />
                <Image source={{ uri: photo }} style={styles.fullScreenImage} />

                {/* Header Actions */}
                <SafeAreaView style={styles.topOverlay}>
                    <TouchableOpacity onPress={retakePhoto} style={styles.iconBtn}>
                        <Ionicons name="close" size={28} color="#FFF" />
                    </TouchableOpacity>
                </SafeAreaView>

                {/* Loading State */}
                {isAnalyzing && (
                    <View style={styles.darkOverlay}>
                        <ActivityIndicator size="large" color="#FFF" />
                        <Text style={styles.loadingText}>Analyzing...</Text>
                    </View>
                )}

                {/* Error State */}
                {error && !isAnalyzing && (
                    <View style={styles.bottomSheetContainer}>
                        <View style={styles.bottomSheetContent}>
                            <View style={styles.dragHandle} />
                            <Text style={styles.errorTitle}>Identification Failed</Text>
                            <Text style={styles.errorDesc}>{error}</Text>
                            <TouchableOpacity style={styles.primaryBtn} onPress={retakePhoto}>
                                <Text style={styles.primaryBtnText}>Try Again</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Success Results */}
                {results.length > 0 && !isAnalyzing && !error && (
                    <View style={styles.bottomSheetContainer}>
                        <View style={styles.bottomSheetContent}>
                            <View style={styles.dragHandle} />

                            <ScrollView style={styles.resultsScroll} showsVerticalScrollIndicator={false}>

                                {/* INTERACTION ALERT BANNER */}
                                {interactionReport && interactionReport.hasConflict && (
                                    <View style={[
                                        styles.alertBanner,
                                        interactionReport.severity === 'high' ? styles.alertHigh : styles.alertMedium
                                    ]}>
                                        <View style={styles.alertHeader}>
                                            <Ionicons name="warning" size={24} color={interactionReport.severity === 'high' ? '#FFF' : '#854D0E'} />
                                            <Text style={[
                                                styles.alertTitle,
                                                interactionReport.severity === 'high' ? { color: '#FFF' } : { color: '#854D0E' }
                                            ]}>
                                                CONFLICT DETECTED
                                            </Text>
                                        </View>
                                        <Text style={[
                                            styles.alertDesc,
                                            interactionReport.severity === 'high' ? { color: '#FEF2F2' } : { color: '#A16207' }
                                        ]}>
                                            {interactionReport.description}
                                        </Text>
                                    </View>
                                )}

                                {/* MEDICINE LIST */}
                                {results.map((med, index) => {
                                    const isExpanded = expandedMedIndex === index;
                                    const fraud = med.fraudDetection;

                                    // Determine badge color based on risk level
                                    let badgeColor = '#10B981'; // green for safe
                                    let badgeText = 'VERIFIED';
                                    if (fraud) {
                                        if (fraud.riskLevel === 'high-risk') {
                                            badgeColor = '#EF4444';
                                            badgeText = `${fraud.authenticityScore}% HIGH RISK`;
                                        } else if (fraud.riskLevel === 'suspicious') {
                                            badgeColor = '#F97316';
                                            badgeText = `${fraud.authenticityScore}% SUSPICIOUS`;
                                        } else if (fraud.riskLevel === 'caution') {
                                            badgeColor = '#EAB308';
                                            badgeText = `${fraud.authenticityScore}% CAUTION`;
                                        } else {
                                            badgeText = `${fraud.authenticityScore}% AUTHENTIC`;
                                        }
                                    }

                                    return (
                                        <View key={index} style={styles.medCard}>
                                            <TouchableOpacity
                                                style={styles.medCardHeader}
                                                onPress={() => setExpandedMedIndex(isExpanded ? null : index)}
                                            >
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.medCardTitle}>{med.medicineName}</Text>
                                                    {fraud && (
                                                        <View style={[styles.fraudBadge, { backgroundColor: badgeColor }]}>
                                                            <Ionicons name={fraud.riskLevel === 'safe' || fraud.riskLevel === 'caution' ? "shield-checkmark" : "warning"} size={14} color="#FFF" />
                                                            <Text style={styles.fraudBadgeText}>{badgeText}</Text>
                                                        </View>
                                                    )}
                                                </View>
                                                <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color="#8E8E93" />
                                            </TouchableOpacity>

                                            {isExpanded && (
                                                <View style={styles.medCardBody}>
                                                    <View style={styles.infoRow}>
                                                        <View style={styles.infoBlock}>
                                                            <Text style={styles.infoLabel}>DOSAGE</Text>
                                                            <Text style={styles.infoVal}>{med.dosage || '--'}</Text>
                                                        </View>
                                                        <View style={styles.infoBlock}>
                                                            <Text style={styles.infoLabel}>TIME</Text>
                                                            <Text style={styles.infoVal}>{med.recommendedTime || '--'}</Text>
                                                        </View>
                                                    </View>

                                                    <Text style={styles.sectionHeader}>PURPOSE</Text>
                                                    <Text style={styles.bodyText}>{med.commonUses}</Text>

                                                    <Text style={styles.sectionHeader}>INGREDIENTS</Text>
                                                    <Text style={styles.bodyText}>{med.activeIngredients}</Text>

                                                    {/* PATIENT INFORMATION */}
                                                    {(med.patientName || med.patientAge || med.patientSex) && (
                                                        <View style={styles.patientInfo}>
                                                            <View style={styles.patientInfoHeader}>
                                                                <Ionicons name="person" size={18} color="#2563EB" />
                                                                <Text style={styles.patientInfoTitle}>Patient Information</Text>
                                                            </View>
                                                            {med.patientName && (
                                                                <View style={styles.patientInfoRow}>
                                                                    <Text style={styles.patientInfoLabel}>Name:</Text>
                                                                    <Text style={styles.patientInfoValue}>{med.patientName}</Text>
                                                                </View>
                                                            )}
                                                            <View style={styles.patientInfoRow}>
                                                                {med.patientAge && (
                                                                    <>
                                                                        <Text style={styles.patientInfoLabel}>Age:</Text>
                                                                        <Text style={styles.patientInfoValue}>{med.patientAge}</Text>
                                                                    </>
                                                                )}
                                                                {med.patientSex && (
                                                                    <>
                                                                        <Text style={[styles.patientInfoLabel, { marginLeft: med.patientAge ? 16 : 0 }]}>Sex:</Text>
                                                                        <Text style={styles.patientInfoValue}>{med.patientSex}</Text>
                                                                    </>
                                                                )}
                                                            </View>
                                                        </View>
                                                    )}

                                                    {/* PRESCRIPTION VERIFICATION */}
                                                    {(med.prescribedBy || med.hospital || med.signatureVerified) && (
                                                        <View style={styles.prescriptionVerification}>
                                                            <View style={styles.verificationHeader}>
                                                                <Ionicons name="shield-checkmark" size={18} color="#059669" />
                                                                <Text style={styles.verificationTitle}>Prescription Details</Text>
                                                                {med.signatureVerified && (
                                                                    <View style={styles.signatureBadge}>
                                                                        <Ionicons name="create" size={12} color="#FFF" />
                                                                        <Text style={styles.signatureBadgeText}>Signed</Text>
                                                                    </View>
                                                                )}
                                                            </View>
                                                            {med.prescribedBy && (
                                                                <View style={styles.verificationRow}>
                                                                    <Ionicons name="medkit" size={14} color="#047857" />
                                                                    <Text style={styles.verificationText}>Prescribed by: {med.prescribedBy}</Text>
                                                                </View>
                                                            )}
                                                            {med.hospital && (
                                                                <View style={styles.verificationRow}>
                                                                    <Ionicons name="business" size={14} color="#047857" />
                                                                    <Text style={styles.verificationText}>From: {med.hospital}</Text>
                                                                </View>
                                                            )}
                                                            {med.licenseNumber && (
                                                                <View style={styles.verificationRow}>
                                                                    <Ionicons name="card-outline" size={14} color="#047857" />
                                                                    <Text style={styles.verificationText}>License: {med.licenseNumber}</Text>
                                                                </View>
                                                            )}
                                                            {med.signatureVerified && (
                                                                <View style={styles.verificationRow}>
                                                                    <Ionicons name="checkmark-circle" size={14} color="#047857" />
                                                                    <Text style={styles.verificationText}>Doctor's signature verified on prescription</Text>
                                                                </View>
                                                            )}
                                                        </View>
                                                    )}

                                                    {med.warnings ? (
                                                        <View style={styles.warningCard}>
                                                            <Ionicons name="warning" size={20} color="#EF4444" />
                                                            <Text style={styles.warningText}>{med.warnings}</Text>
                                                        </View>
                                                    ) : null}

                                                    {/* FOOD WARNINGS */}
                                                    {med.foodWarnings && med.foodWarnings.length > 0 && (
                                                        <View style={styles.foodWarningSection}>
                                                            <View style={styles.foodWarningHeader}>
                                                                <Ionicons name="fast-food" size={18} color="#D97706" />
                                                                <Text style={styles.foodWarningTitle}>⚠️ Avoid These Foods</Text>
                                                            </View>
                                                            <View style={styles.foodChipsContainer}>
                                                                {med.foodWarnings.map((food, idx) => (
                                                                    <View key={idx} style={styles.foodChip}>
                                                                        <Text style={styles.foodChipText}>{food}</Text>
                                                                    </View>
                                                                ))}
                                                            </View>
                                                        </View>
                                                    )}

                                                    {/* AFFORDABILITY (Philippines) */}
                                                    {med.affordability && (
                                                        <View style={styles.affordabilitySection}>
                                                            {/* Generic Alternative */}
                                                            {med.affordability.genericAlternative && (
                                                                <View style={styles.savingsCard}>
                                                                    <View style={styles.savingsHeader}>
                                                                        <Ionicons name="pricetag" size={20} color="#10B981" />
                                                                        <Text style={styles.savingsTitle}>SAVE MONEY</Text>
                                                                    </View>
                                                                    <Text style={styles.genericName}>{med.affordability.genericAlternative}</Text>
                                                                    {med.affordability.estimatedSavings && (
                                                                        <Text style={styles.savingsAmount}>Save {med.affordability.estimatedSavings}</Text>
                                                                    )}
                                                                    <Text style={styles.pharmacyHint}>Available at Generika, TGP, Mercury Drug</Text>
                                                                </View>
                                                            )}

                                                            {/* Senior Discount */}
                                                            {med.affordability.seniorDiscountEligible && (
                                                                <View style={styles.seniorDiscountCard}>
                                                                    <View style={styles.seniorDiscountHeader}>
                                                                        <Ionicons name="card" size={18} color="#7C3AED" />
                                                                        <Text style={styles.seniorDiscountTitle}>Senior Citizen Discount</Text>
                                                                    </View>
                                                                    <Text style={styles.seniorDiscountText}>Show your Senior ID for 20% OFF at any pharmacy!</Text>
                                                                </View>
                                                            )}

                                                            {/* Government Assistance */}
                                                            {med.affordability.governmentPrograms && med.affordability.governmentPrograms.length > 0 && (
                                                                <View style={styles.govAssistCard}>
                                                                    <TouchableOpacity
                                                                        style={styles.govAssistHeader}
                                                                        onPress={() => {
                                                                            // Toggle collapsed state (you can add state for this)
                                                                        }}
                                                                    >
                                                                        <Ionicons name="help-circle" size={18} color="#3B82F6" />
                                                                        <Text style={styles.govAssistTitle}>Financial Assistance</Text>
                                                                        <Ionicons name="chevron-down" size={16} color="#3B82F6" />
                                                                    </TouchableOpacity>
                                                                    <View style={styles.govAssistBody}>
                                                                        {med.affordability.governmentPrograms.map((program, idx) => (
                                                                            <Text key={idx} style={styles.govAssistItem}>• {program}</Text>
                                                                        ))}
                                                                        <Text style={styles.govAssistContact}>PCSO Hotline: 1-800-10-2476</Text>
                                                                    </View>
                                                                </View>
                                                            )}

                                                            {/* PhilHealth Coverage */}
                                                            {med.affordability.philHealthCoverage && (
                                                                <View style={styles.philhealthCard}>
                                                                    <Ionicons name="shield-checkmark" size={16} color="#059669" />
                                                                    <Text style={styles.philhealthText}>PhilHealth: {med.affordability.philHealthCoverage}</Text>
                                                                </View>
                                                            )}
                                                        </View>
                                                    )}

                                                    <View style={styles.actionRow}>
                                                        <TouchableOpacity
                                                            style={styles.primaryBtnRow}
                                                            onPress={() => handleReminderPress(med)}
                                                        >
                                                            <Ionicons name="alarm-outline" size={20} color="#FFF" />
                                                            <Text style={styles.primaryBtnText}>Set Reminder</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                            )}
                                        </View>
                                    );
                                })}

                                <TouchableOpacity style={styles.secondaryBtnFull} onPress={retakePhoto}>
                                    <Ionicons name="camera-outline" size={20} color="#007AFF" />
                                    <Text style={styles.secondaryBtnText}>Scan New Items</Text>
                                </TouchableOpacity>

                                <View style={{ height: 40 }} />
                            </ScrollView>
                        </View>
                    </View>
                )}

                {/* Pre-Analysis Actions */}
                {results.length === 0 && !error && !isAnalyzing && (
                    <View style={styles.bottomActions}>
                        <TouchableOpacity style={styles.largeFab} onPress={identifyMedicine}>
                            <Ionicons name="scan" size={32} color="#FFF" />
                        </TouchableOpacity>
                        <Text style={styles.instructionText}>Tap to identify</Text>
                    </View>
                )}

                <CustomTimePicker
                    visible={showTimePicker}
                    onClose={() => setShowTimePicker(false)}
                    medicineName={selectedMedForReminder?.medicineName}
                    onConfirm={(h, m) => selectedMedForReminder && scheduleReminder(selectedMedForReminder.medicineName, h, m)}
                />
            </View>
        );
    }

    // Mode 2: Camera Viewfinder
    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <CameraView ref={cameraRef} style={styles.camera} facing="back">
                {/* Controls Overlay */}
                <SafeAreaView style={styles.overlayContainer}>
                    {/* Top Bar - No Back Arrow as requested, just empty or flash controls if we added them */}
                    <View style={styles.headerBar} />

                    {/* Bottom Controls */}
                    <View style={styles.bottomControls}>
                        {/* Recent Button (Left) */}
                        <TouchableOpacity style={styles.controlBtn} onPress={() => setShowRecentModal(true)}>
                            <View style={styles.blurCircle}>
                                <Ionicons name="time" size={24} color="#FFF" />
                            </View>
                            <Text style={styles.controlLabel}>Recent</Text>
                        </TouchableOpacity>

                        {/* Shutter Button (Center) */}
                        <TouchableOpacity onPress={takePhoto} style={styles.shutterOuter}>
                            <View style={styles.shutterInner} />
                        </TouchableOpacity>

                        {/* Placeholder (Right) for symmetry */}
                        <View style={styles.controlBtn}>
                            {/* Future: Flash/Gallery upload */}
                            <View style={[styles.blurCircle, { opacity: 0 }]} />
                            <Text style={[styles.controlLabel, { opacity: 0 }]}>Flash</Text>
                        </View>
                    </View>
                </SafeAreaView>
            </CameraView>

            <RecentScansModal
                visible={showRecentModal}
                onClose={() => setShowRecentModal(false)}
                onSelect={handleRecentSelect}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    fullScreenImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    camera: { flex: 1 },

    // Camera Overlay
    overlayContainer: { flex: 1, justifyContent: 'space-between' },
    headerBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 10
    },
    bottomControls: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 40,
        paddingBottom: 50,
    },
    controlBtn: { alignItems: 'center', width: 60 },
    blurCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)'
    },
    controlLabel: { color: '#FFF', fontSize: 12, fontWeight: '500' },
    shutterOuter: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 4,
        borderColor: 'rgba(255,255,255,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    shutterInner: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#FFF',
    },

    // Results Bottom Sheet
    bottomSheetContainer: {
        position: 'absolute',
        bottom: 0,
        width: '100%',
        height: '75%', // Increased height for lists
        justifyContent: 'flex-end',
    },
    bottomSheetContent: {
        flex: 1,
        backgroundColor: '#F2F2F7', // Gray bg for card separation
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 20,
        paddingTop: 12,
        shadowColor: '#000',
        shadowRadius: 12,
        elevation: 10,
    },
    resultsScroll: {
        flex: 1,
    },
    dragHandle: {
        width: 40,
        height: 5,
        backgroundColor: '#C7C7CC',
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: 20,
    },

    // Alert Banner
    alertBanner: { padding: 16, borderRadius: 16, marginBottom: 16, borderLeftWidth: 6 },
    alertHigh: { backgroundColor: '#EF4444', borderLeftColor: '#7F1D1D' }, // Red
    alertMedium: { backgroundColor: '#FEF3C7', borderLeftColor: '#D97706' }, // Yellow
    alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    alertTitle: { fontSize: 18, fontWeight: '800' },
    alertDesc: { fontSize: 14, fontWeight: '600' },

    // Med Cards
    medCard: {
        backgroundColor: '#FFF',
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 12,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2
    },
    medCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
    },
    medCardTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
    medCardBody: {
        padding: 16,
        paddingTop: 0,
        borderTopWidth: 1,
        borderTopColor: '#F2F2F7'
    },

    infoRow: { flexDirection: 'row', marginBottom: 20, gap: 12, marginTop: 16 },
    infoBlock: { flex: 1, backgroundColor: '#F2F2F7', padding: 12, borderRadius: 12 },
    infoLabel: { fontSize: 11, fontWeight: '700', color: '#8E8E93', marginBottom: 4, letterSpacing: 0.5 },
    infoVal: { fontSize: 16, fontWeight: '600', color: '#000' },
    sectionHeader: { fontSize: 13, fontWeight: '700', color: '#8E8E93', marginTop: 12, marginBottom: 6, letterSpacing: 0.5 },
    bodyText: { fontSize: 15, color: '#3A3A3C', lineHeight: 22 },
    warningCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#FEF2F2',
        padding: 12,
        borderRadius: 12,
        marginTop: 16,
        gap: 10
    },
    warningText: { flex: 1, color: '#B91C1C', fontSize: 14, lineHeight: 20 },

    fraudBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        marginTop: 6,
        gap: 6,
    },
    fraudBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#FFF',
        letterSpacing: 0.5,
    },

    actionRow: { flexDirection: 'row', marginTop: 20 },

    primaryBtnRow: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: '#000',
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8
    },
    primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },

    secondaryBtnFull: {
        flexDirection: 'row',
        backgroundColor: '#E0F2FE',
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 12,
        marginBottom: 20
    },
    secondaryBtnText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },

    // Misc
    topOverlay: { position: 'absolute', top: 0, left: 0, right: 0, padding: 20 },
    iconBtn: { padding: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.3)', alignSelf: 'flex-start' },
    darkOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
    loadingText: { color: '#FFF', marginTop: 12, fontSize: 16, fontWeight: '600' },
    errorTitle: { fontSize: 22, fontWeight: '700', color: '#1C1C1E', textAlign: 'center', marginBottom: 8 },
    errorDesc: { fontSize: 16, color: '#3A3A3C', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
    primaryBtn: { backgroundColor: '#007AFF', paddingVertical: 16, borderRadius: 16, alignItems: 'center', width: '100%' },
    bottomActions: { position: 'absolute', bottom: 50, left: 0, right: 0, alignItems: 'center', gap: 12 },
    largeFab: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#007AFF', shadowOpacity: 0.4, shadowOffset: { width: 0, height: 4 } },
    instructionText: { color: '#FFF', fontSize: 16, fontWeight: '500', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },

    // Recent Modal
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    bottomSheet: { backgroundColor: '#F2F2F7', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '80%', paddingBottom: 30 },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E5E5EA', backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    sheetTitle: { fontSize: 20, fontWeight: '700' },
    closeIconBtn: { padding: 4 },
    recentList: { padding: 16 },
    recentItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 12, borderRadius: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
    recentThumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#F2F2F7', marginRight: 12 },
    recentInfo: { flex: 1 },
    recentName: { fontSize: 16, fontWeight: '600', color: '#000', marginBottom: 4 },
    recentTime: { fontSize: 13, color: '#8E8E93' },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.6 },
    emptyText: { marginTop: 12, fontSize: 16, color: '#8E8E93' },

    // Perm Screen
    permContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    permTitle: { fontSize: 20, fontWeight: '700', marginTop: 20, marginBottom: 8 },
    permDesc: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 24 },
    permBtn: { backgroundColor: '#000', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
    permBtnText: { color: '#FFF', fontWeight: '600' },

    // Picker
    pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
    pickerCard: { backgroundColor: '#FFF', width: '85%', borderRadius: 24, padding: 24, alignItems: 'center' },
    pickerHeader: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
    pickerSubHeader: { fontSize: 14, color: '#666', marginBottom: 24 },
    timeSelectRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 32 },
    timeCol: { alignItems: 'center' },
    timeDigit: { fontSize: 36, fontWeight: '300', marginVertical: 8, minWidth: 50, textAlign: 'center' },
    timeSeparator: { fontSize: 36, fontWeight: '300', marginHorizontal: 8, paddingBottom: 8 },
    amPmCol: { marginLeft: 16, gap: 8 },
    amPmBox: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#F2F2F7' },
    amPmSelected: { backgroundColor: '#000' },
    amPmLabel: { fontSize: 14, fontWeight: '600', color: '#8E8E93' },
    amPmLabelSelected: { color: '#FFF' },
    pickerBtnRow: { flexDirection: 'row', gap: 12, width: '100%' },
    pickerBtnCancel: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#F2F2F7', alignItems: 'center' },
    pickerBtnConfirm: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#000', alignItems: 'center' },
    pickerBtnTextCancel: { fontSize: 16, fontWeight: '600', color: '#000' },
    pickerBtnTextConfirm: { fontSize: 16, fontWeight: '600', color: '#FFF' },

    // Food Warnings
    foodWarningSection: {
        backgroundColor: '#FEF3C7',
        padding: 14,
        borderRadius: 12,
        marginTop: 16,
        borderLeftWidth: 4,
        borderLeftColor: '#D97706'
    },
    foodWarningHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 10
    },
    foodWarningTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#92400E'
    },
    foodChipsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8
    },
    foodChip: {
        backgroundColor: '#FFF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#F59E0B'
    },
    foodChipText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#B45309'
    },

    // Patient Information
    patientInfo: {
        backgroundColor: '#EFF6FF',
        padding: 12,
        borderRadius: 10,
        marginTop: 16,
        borderLeftWidth: 3,
        borderLeftColor: '#2563EB',
    },
    patientInfoHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
    },
    patientInfoTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1E40AF',
    },
    patientInfoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        flexWrap: 'wrap',
    },
    patientInfoLabel: {
        fontSize: 13,
        color: '#1E3A8A',
        fontWeight: '600',
        marginRight: 6,
    },
    patientInfoValue: {
        fontSize: 13,
        color: '#1E40AF',
    },

    // Prescription Verification
    prescriptionVerification: {
        backgroundColor: '#ECFDF5',
        padding: 12,
        borderRadius: 10,
        marginTop: 16,
        borderLeftWidth: 3,
        borderLeftColor: '#059669',
    },
    verificationHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
    },
    verificationTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#047857',
    },
    signatureBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#059669',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
        gap: 4,
        marginLeft: 'auto',
    },
    signatureBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#FFF',
    },
    verificationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 4,
    },
    verificationText: {
        fontSize: 13,
        color: '#065F46',
    },

    // Affordability (Philippines)
    affordabilitySection: {
        marginTop: 16,
        gap: 12,
    },
    savingsCard: {
        backgroundColor: '#D1FAE5',
        padding: 14,
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#10B981',
    },
    savingsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
    },
    savingsTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#065F46',
    },
    genericName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#047857',
        marginBottom: 4,
    },
    savingsAmount: {
        fontSize: 18,
        fontWeight: '700',
        color: '#10B981',
        marginBottom: 6,
    },
    pharmacyHint: {
        fontSize: 12,
        color: '#059669',
        fontStyle: 'italic',
    },
    seniorDiscountCard: {
        backgroundColor: '#EDE9FE',
        padding: 14,
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#7C3AED',
    },
    seniorDiscountHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    seniorDiscountTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#5B21B6',
    },
    seniorDiscountText: {
        fontSize: 13,
        color: '#6B21A8',
        lineHeight: 18,
    },
    govAssistCard: {
        backgroundColor: '#DBEAFE',
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#3B82F6',
        overflow: 'hidden',
    },
    govAssistHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        padding: 14,
    },
    govAssistTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1E40AF',
        flex: 1,
    },
    govAssistBody: {
        padding: 14,
        paddingTop: 0,
    },
    govAssistItem: {
        fontSize: 13,
        color: '#1E3A8A',
        marginBottom: 4,
    },
    govAssistContact: {
        fontSize: 13,
        fontWeight: '600',
        color: '#2563EB',
        marginTop: 8,
    },
    philhealthCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#D1FAE5',
        padding: 10,
        borderRadius: 8,
    },
    philhealthText: {
        fontSize: 13,
        color: '#065F46',
        fontWeight: '600',
    },
});

