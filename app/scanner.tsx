import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, Modal, Platform, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { analyzeInteractions, analyzeMedicineImage, InteractionReport, MedicineAnalysis } from '../services/gemini';
import { saveMedication } from '../services/medicationStorage';
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

// Alarm tone definitions
const ALARM_TONES = [
    { id: 'gentle', name: 'Gentle', icon: 'musical-note', pattern: [0, 300, 200, 300], color: '#10B981' },
    { id: 'standard', name: 'Standard', icon: 'notifications', pattern: [0, 400, 200, 400, 200, 400], color: '#0369A1' },
    { id: 'urgent', name: 'Urgent', icon: 'alert-circle', pattern: [0, 200, 100, 200, 100, 200, 100, 200], color: '#F59E0B' },
    { id: 'alarm', name: 'Alarm', icon: 'alarm', pattern: [0, 500, 100, 500, 100, 500, 100, 500], color: '#EF4444' },
    { id: 'silent', name: 'Silent', icon: 'volume-mute', pattern: [0], color: '#64748B' },
];

// Custom Time Picker
interface CustomTimePickerProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: (hour: number, minute: number, toneId: string) => void;
    medicineName?: string;
}

const CustomTimePicker = ({ visible, onClose, onConfirm, medicineName }: CustomTimePickerProps) => {
    const [hour, setHour] = useState(8);
    const [minute, setMinute] = useState(0);
    const [isAm, setIsAm] = useState(true);
    const [selectedTone, setSelectedTone] = useState('standard');

    const previewTone = (toneId: string) => {
        setSelectedTone(toneId);
        const tone = ALARM_TONES.find(t => t.id === toneId);
        if (!tone || toneId === 'silent') return;

        // Vibrate with the tone's pattern
        Vibration.vibrate(tone.pattern);

        // Speak the tone name as audio preview
        Speech.stop();
        const messages: Record<string, string> = {
            gentle: 'Gentle reminder tone',
            standard: 'Standard alarm tone',
            urgent: 'Urgent! Urgent! Alarm!',
            alarm: 'ALARM! ALARM! Take your medicine now!',
        };
        Speech.speak(messages[toneId] || tone.name, {
            rate: toneId === 'urgent' ? 1.3 : toneId === 'alarm' ? 1.5 : 1.0,
            pitch: toneId === 'alarm' ? 1.3 : 1.0,
            volume: toneId === 'gentle' ? 0.5 : 1.0,
        });
    };

    const handleConfirm = () => {
        let finalHour = hour;
        if (!isAm && hour < 12) finalHour += 12;
        if (isAm && hour === 12) finalHour = 0;
        onConfirm(finalHour, minute, selectedTone);
        onClose();
    };

    return (
        <Modal transparent visible={visible} animationType="slide">
            <View style={styles.pickerOverlay}>
                <View style={styles.pickerCard}>
                    <View style={styles.pickerHeaderContainer}>
                        <Ionicons name="time" size={28} color="#0369A1" />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.pickerHeader}>Set Medication Reminder</Text>
                            {medicineName && <Text style={styles.pickerSubHeader}><Ionicons name="medical" size={14} color="#64748B" /> {medicineName}</Text>}
                        </View>
                    </View>

                    <ScrollView
                        style={{ width: '100%' }}
                        showsVerticalScrollIndicator={false}
                        bounces={true}
                    >

                        <View style={styles.timeSelectRow}>
                            {/* Hour */}
                            <View style={styles.timeCol}>
                                <TouchableOpacity style={styles.chevronBtn} onPress={() => setHour(h => h === 12 ? 1 : h + 1)} activeOpacity={0.7}>
                                    <Ionicons name="chevron-up" size={36} color="#0369A1" />
                                </TouchableOpacity>
                                <Text style={styles.timeDigit}>{hour.toString().padStart(2, '0')}</Text>
                                <TouchableOpacity style={styles.chevronBtn} onPress={() => setHour(h => h === 1 ? 12 : h - 1)} activeOpacity={0.7}>
                                    <Ionicons name="chevron-down" size={36} color="#0369A1" />
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.timeSeparator}>:</Text>
                            {/* Minute */}
                            <View style={styles.timeCol}>
                                <TouchableOpacity style={styles.chevronBtn} onPress={() => setMinute(m => m >= 55 ? 0 : m + 5)} activeOpacity={0.7}>
                                    <Ionicons name="chevron-up" size={36} color="#0369A1" />
                                </TouchableOpacity>
                                <Text style={styles.timeDigit}>{minute.toString().padStart(2, '0')}</Text>
                                <TouchableOpacity style={styles.chevronBtn} onPress={() => setMinute(m => m < 5 ? 55 : m - 5)} activeOpacity={0.7}>
                                    <Ionicons name="chevron-down" size={36} color="#0369A1" />
                                </TouchableOpacity>
                            </View>
                            {/* AM/PM */}
                            <View style={styles.amPmCol}>
                                <TouchableOpacity onPress={() => setIsAm(true)} style={[styles.amPmBox, isAm && styles.amPmSelected]} activeOpacity={0.7}>
                                    <Text style={[styles.amPmLabel, isAm && styles.amPmLabelSelected]}>AM</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setIsAm(false)} style={[styles.amPmBox, !isAm && styles.amPmSelected]} activeOpacity={0.7}>
                                    <Text style={[styles.amPmLabel, !isAm && styles.amPmLabelSelected]}>PM</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Alarm Tone Selector */}
                        <View style={styles.toneSectionDivider} />
                        <Text style={styles.toneLabel}>
                            <Ionicons name="notifications" size={14} color="#64748B" /> ALARM SOUND
                        </Text>
                        <View style={styles.toneList}>
                            {ALARM_TONES.map(tone => {
                                const isSelected = selectedTone === tone.id;
                                const descriptions: Record<string, string> = {
                                    gentle: 'Soft, calming notification',
                                    standard: 'Regular reminder sound',
                                    urgent: 'Attention-grabbing alert',
                                    alarm: 'Maximum volume alert',
                                    silent: 'Vibration only, no sound',
                                };
                                return (
                                    <TouchableOpacity
                                        key={tone.id}
                                        style={[
                                            styles.toneItem,
                                            isSelected && {
                                                borderColor: tone.color,
                                                backgroundColor: `${tone.color}15`,
                                                borderWidth: 2.5,
                                            },
                                        ]}
                                        onPress={() => previewTone(tone.id)}
                                        activeOpacity={0.6}
                                    >
                                        <View style={[styles.toneIconBox, { backgroundColor: `${tone.color}20` }]}>
                                            <Ionicons
                                                name={tone.icon as any}
                                                size={28}
                                                color={tone.color}
                                            />
                                        </View>
                                        <View style={styles.toneTextCol}>
                                            <Text style={[
                                                styles.toneName,
                                                isSelected && { color: tone.color, fontWeight: '800' },
                                            ]}>{tone.name}</Text>
                                            <Text style={styles.toneDesc}>{descriptions[tone.id]}</Text>
                                        </View>
                                        {isSelected && (
                                            <Ionicons name="checkmark-circle" size={24} color={tone.color} />
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </ScrollView>

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
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [successMessage, setSuccessMessage] = useState({ time: '', tone: '', isAuto: false });

    const cameraRef = useRef<CameraView>(null);

    // TTS Handler
    const handleSpeak = (text: string) => {
        try {
            Speech.speak(text, {
                language: 'en',
                pitch: 1.0,
                rate: 0.9,
            });
        } catch (e) {
            console.warn('TTS Error:', e);
        }
    };

    // Setup Notification Channel for Android + Notification Listener
    useEffect(() => {
        if (Platform.OS === 'android') {
            Notifications.setNotificationChannelAsync('medicine-reminders', {
                name: 'Medicine Reminders',
                importance: Notifications.AndroidImportance.MAX,
                sound: 'default',
                vibrationPattern: [0, 250, 250, 250],
                enableVibrate: true,
                showBadge: true,
            });
        }

        // Listen for notifications and speak the alarm
        const subscription = Notifications.addNotificationReceivedListener(notification => {
            const data = notification.request.content.data;
            const medicineName = data?.medicine || 'your medicine';
            const toneId = data?.tone || 'standard';
            const tone = ALARM_TONES.find(t => t.id === toneId);

            if (toneId !== 'silent') {
                // Vibrate
                if (tone) Vibration.vibrate(tone.pattern);

                // Speak the alarm
                Speech.stop();
                const urgency = toneId === 'alarm' || toneId === 'urgent';
                const message = urgency
                    ? `Attention! It is time to take ${medicineName}. Please take your medicine now!`
                    : `Medicine reminder. It is time to take ${medicineName}.`;

                Speech.speak(message, {
                    rate: urgency ? 1.2 : 1.0,
                    pitch: 1.0,
                    volume: 1.0,
                });

                // Repeat for urgent/alarm tones
                if (urgency) {
                    setTimeout(() => {
                        Speech.speak(`Reminder: take ${medicineName} now.`, { rate: 1.1 });
                    }, 5000);
                }
            }
        });

        return () => subscription.remove();
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

    const scheduleReminder = async (medicineName: string, hour: number, minute: number, isAuto: boolean = false, toneId: string = 'standard') => {
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
            const tone = ALARM_TONES.find(t => t.id === toneId) || ALARM_TONES[1];

            await Notifications.scheduleNotificationAsync({
                content: {
                    title: '💊 Medicine Reminder',
                    body: `It's time for your ${medicineName}`,
                    sound: toneId !== 'silent',
                    data: { medicine: medicineName, tone: toneId },
                    priority: toneId === 'urgent' || toneId === 'alarm'
                        ? Notifications.AndroidNotificationPriority.MAX
                        : Notifications.AndroidNotificationPriority.HIGH,
                    vibrate: tone.pattern,
                },
                trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                    seconds: secondsUntil,
                    channelId: 'medicine-reminders',
                },
            });

            const timeString = scheduledTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const toneLabel = tone.name;
            console.log('Setting success message:', timeString, toneLabel);
            setSuccessMessage({ time: timeString, tone: toneLabel, isAuto });
            // Delay to ensure time picker modal closes first
            setTimeout(() => {
                console.log('Showing success modal now!');
                setShowSuccessModal(true);
                setTimeout(() => setShowSuccessModal(false), 3000);
            }, 300);
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

            // 1.5. Save to Medication Storage (for My Medications screen)
            for (const medicine of analysis) {
                try {
                    await saveMedication(photo, medicine);
                } catch (err) {
                    console.error('Error saving to medication storage:', err);
                }
            }

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

    // -- Renders --

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />

            {photo ? (
                // Mode 1: Review / Results
                <View style={styles.container}>
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
                                                {/* 1. PATIENT INFORMATION (TOP PRIORITY) */}
                                                {(med.patientName || med.patientAge || med.patientSex) && (
                                                    <View style={styles.patientIdCard}>
                                                        <View style={styles.patientAvatarContainer}>
                                                            <Ionicons name="person" size={20} color="#6366F1" />
                                                        </View>
                                                        <View style={styles.patientDetails}>
                                                            <Text style={styles.patientLabel}>PATIENT</Text>
                                                            <Text style={styles.patientNameLarge}>{med.patientName || 'Unknown Patient'}</Text>
                                                            <View style={styles.patientSubDetails}>
                                                                <Text style={styles.patientMeta}>{med.patientAge ? `${med.patientAge}` : '--'}</Text>
                                                                <View style={styles.metaDivider} />
                                                                <Text style={styles.patientMeta}>{med.patientSex || '--'}</Text>
                                                            </View>
                                                        </View>
                                                    </View>
                                                )}

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
                                                    <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={24} color="#64748B" />
                                                </TouchableOpacity>

                                                {/* TTS Button */}
                                                <TouchableOpacity
                                                    style={styles.ttsButtonTop}
                                                    onPress={() => handleSpeak(`${med.medicineName}. ${med.commonUses}`)}
                                                >
                                                    <Ionicons name="volume-medium" size={22} color="#2563EB" />
                                                </TouchableOpacity>

                                                <View style={styles.medCardBody}>
                                                    {/* 2. CORE PRESCRIPTION DETAILS (Always visible) */}
                                                    <View style={styles.coreDetailsRow}>
                                                        <View style={styles.coreInfoBlock}>
                                                            <Text style={styles.infoLabel}>DOSAGE</Text>
                                                            <Text style={styles.infoVal}>{med.dosage || '--'}</Text>
                                                        </View>
                                                        <View style={styles.coreInfoBlock}>
                                                            <Text style={styles.infoLabel}>TIME</Text>
                                                            <Text style={styles.infoVal}>{med.recommendedTime || '--'}</Text>
                                                        </View>
                                                    </View>

                                                    {isExpanded && (
                                                        <View style={styles.expandedContent}>
                                                            <View style={styles.sectionDivider} />

                                                            <View style={styles.sectionHeaderRow}>
                                                                <Text style={styles.sectionHeader}>PURPOSE</Text>
                                                                <TouchableOpacity onPress={() => handleSpeak(med.commonUses)}>
                                                                    <Ionicons name="volume-high" size={16} color="#2563EB" />
                                                                </TouchableOpacity>
                                                            </View>
                                                            <Text style={styles.bodyText}>{med.commonUses}</Text>

                                                            <Text style={styles.sectionHeader}>INGREDIENTS</Text>
                                                            <Text style={styles.bodyText}>{med.activeIngredients}</Text>

                                                            {/* PRESCRIPTION VERIFICATION */}
                                                            {(med.prescribedBy || med.hospital || med.signatureVerified) && (
                                                                <View style={styles.prescriptionVerification}>
                                                                    <View style={styles.verificationHeader}>
                                                                        <Ionicons name="shield-checkmark" size={18} color="#059669" />
                                                                        <Text style={styles.verificationTitle}>Prescription Verified</Text>
                                                                        {med.signatureVerified && (
                                                                            <View style={styles.signatureBadge}>
                                                                                <Text style={styles.signatureBadgeText}>SIGNED</Text>
                                                                            </View>
                                                                        )}
                                                                    </View>
                                                                    {med.prescribedBy && (
                                                                        <View style={styles.verificationRow}>
                                                                            <Text style={styles.verificationLabel}>Doctor: </Text>
                                                                            <Text style={styles.verificationValue}>{med.prescribedBy}</Text>
                                                                        </View>
                                                                    )}
                                                                    {med.hospital && (
                                                                        <View style={styles.verificationRow}>
                                                                            <Text style={styles.verificationLabel}>Clinic: </Text>
                                                                            <Text style={styles.verificationValue}>{med.hospital}</Text>
                                                                        </View>
                                                                    )}
                                                                    {med.licenseNumber && (
                                                                        <View style={styles.verificationRow}>
                                                                            <Text style={styles.verificationLabel}>License: </Text>
                                                                            <Text style={styles.verificationValue}>{med.licenseNumber}</Text>
                                                                        </View>
                                                                    )}
                                                                </View>
                                                            )}

                                                            {/* IMPORTANT WARNINGS */}
                                                            {med.warnings && med.warnings.length > 0 && (
                                                                <View style={styles.warningCardClean}>
                                                                    <View style={styles.warningHeaderRow}>
                                                                        <Ionicons name="alert-circle" size={20} color="#DC2626" />
                                                                        <Text style={styles.warningTitleClean}>Safety Warnings</Text>
                                                                    </View>
                                                                    {Array.isArray(med.warnings) ? med.warnings.map((w, i) => (
                                                                        <Text key={i} style={styles.warningTextClean}>• {w}</Text>
                                                                    )) : (
                                                                        <Text style={styles.warningTextClean}>{med.warnings}</Text>
                                                                    )}
                                                                </View>
                                                            )}

                                                            {/* FOOD INTERACTIONS */}
                                                            {med.foodWarnings && med.foodWarnings.length > 0 && (
                                                                <View style={styles.foodSectionClean}>
                                                                    <Text style={styles.sectionHeaderLabel}>FOOD INTERACTIONS</Text>
                                                                    {med.foodWarnings.map((food, i) => (
                                                                        <View key={i} style={styles.foodItemRow}>
                                                                            <Ionicons name="restaurant-outline" size={16} color="#64748B" />
                                                                            <Text style={styles.foodItemText}>{food}</Text>
                                                                        </View>
                                                                    ))}
                                                                </View>
                                                            )}

                                                            {/* AFFORDABILITY */}
                                                            {med.affordability && (
                                                                <View style={styles.affordabilitySection}>
                                                                    {med.affordability.genericAlternative && (
                                                                        <View style={styles.savingsCard}>
                                                                            <Text style={styles.savingsTitle}>GENERIC OPTION</Text>
                                                                            <Text style={styles.genericName}>{med.affordability.genericAlternative}</Text>
                                                                            {med.affordability.estimatedSavings && (
                                                                                <Text style={styles.savingsAmount}>Potential Savings: {med.affordability.estimatedSavings}</Text>
                                                                            )}
                                                                        </View>
                                                                    )}

                                                                    {med.affordability.seniorDiscountEligible && (
                                                                        <View style={styles.seniorDiscountCard}>
                                                                            <Ionicons name="accessibility" size={16} color="#7C3AED" />
                                                                            <Text style={styles.seniorDiscountText}>Senior Citizen/PWD Discount Eligible</Text>
                                                                        </View>
                                                                    )}
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
                                            </View>
                                        )
                                    }

                                    )}

                                    <TouchableOpacity style={styles.secondaryBtnFull} onPress={retakePhoto}>
                                        <Ionicons name="camera-outline" size={20} color="#007AFF" />
                                        <Text style={styles.secondaryBtnText}>Scan New Items</Text>
                                    </TouchableOpacity>

                                    <View style={{ height: 40 }} />
                                </ScrollView>
                            </View>
                        </View>
                    )
                    }

                    {/* Pre-Analysis Actions */}
                    {
                        results.length === 0 && !error && !isAnalyzing && (
                            <View style={styles.bottomActions}>
                                <TouchableOpacity style={styles.largeFab} onPress={identifyMedicine}>
                                    <Ionicons name="scan" size={32} color="#FFF" />
                                </TouchableOpacity>
                                <Text style={styles.instructionText}>Tap to identify</Text>
                            </View>
                        )
                    }
                </View >
            ) : (
                // Mode 2: Camera Viewfinder
                <View style={{ flex: 1 }}>
                    <CameraView ref={cameraRef} style={styles.camera} facing="back" />
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
                </View>
            )}

            {/* --- GLOBAL MODALS (Always at root) --- */}

            <CustomTimePicker
                visible={showTimePicker}
                onClose={() => setShowTimePicker(false)}
                medicineName={selectedMedForReminder?.medicineName}
                onConfirm={(h, m, tone) => selectedMedForReminder && scheduleReminder(selectedMedForReminder.medicineName, h, m, false, tone)}
            />

            <RecentScansModal
                visible={showRecentModal}
                onClose={() => setShowRecentModal(false)}
                onSelect={handleRecentSelect}
            />

            {/* Success Confirmation Modal */}
            <Modal transparent visible={showSuccessModal} animationType="fade">
                <TouchableOpacity
                    style={styles.successOverlay}
                    activeOpacity={1}
                    onPress={() => setShowSuccessModal(false)}
                >
                    <View style={styles.successCard}>
                        <View style={styles.successIconCircle}>
                            <Ionicons name="checkmark-circle" size={64} color="#10B981" />
                        </View>
                        <Text style={styles.successTitle}>
                            {successMessage.isAuto ? 'Auto-Reminder Set!' : 'Reminder Set!'}
                        </Text>
                        <View style={styles.successDetailRow}>
                            <Ionicons name="time-outline" size={20} color="#0369A1" />
                            <Text style={styles.successTime}>{successMessage.time}</Text>
                        </View>
                        <View style={styles.successDetailRow}>
                            <Ionicons name="notifications-outline" size={20} color="#0369A1" />
                            <Text style={styles.successAlarm}>Alarm: {successMessage.tone}</Text>
                        </View>
                    </View>
                </TouchableOpacity>
            </Modal>
        </View >
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    fullScreenImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    camera: { flex: 1 },

    // Camera Overlay
    // Camera Overlay
    overlayContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'space-between',
        zIndex: 10
    },
    headerBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 10,
        zIndex: 10
    },
    topOverlay: {
        position: 'absolute',
        top: 40,
        left: 20,
        zIndex: 10
    },
    bottomControls: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingHorizontal: 30,
        paddingBottom: 40,
    },

    // Buttons
    shutterInner: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#FFF',
    },
    controlBtn: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 60,
        height: 60
    },
    controlLabel: {
        color: '#FFF',
        fontSize: 12,
        marginTop: 4,
        fontWeight: '600',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2
    },
    blurCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4
    },
    iconBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Loading & Analysis
    darkOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 20
    },
    loadingText: {
        color: '#FFF',
        marginTop: 20,
        fontSize: 18,
        fontWeight: '600',
        letterSpacing: 1
    },

    // Pre-Analysis / Bottom Actions
    bottomActions: {
        position: 'absolute',
        bottom: 50,
        alignSelf: 'center',
        alignItems: 'center',
        gap: 12
    },
    largeFab: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#2563EB',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6
    },
    instructionText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '600',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
        letterSpacing: 0.5
    },

    // Modal Styles
    pickerOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'flex-end' },
    pickerCard: {
        backgroundColor: '#FFF',
        width: '100%',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 24,
        maxHeight: '90%',
    },
    pickerHeaderContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 24,
    },
    pickerHeader: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
    pickerSubHeader: { fontSize: 13, color: '#64748B', fontWeight: '600' },

    timeSelectRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, alignSelf: 'center' },
    timeCol: { alignItems: 'center', gap: 8 },
    chevronBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    timeDigit: { fontSize: 64, fontWeight: '800', minWidth: 80, textAlign: 'center', color: '#0F172A' },
    timeSeparator: { fontSize: 64, fontWeight: '200', marginHorizontal: 8, color: '#CBD5E1' },

    amPmCol: { marginLeft: 16, gap: 8 },
    amPmBox: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: '#F1F5F9',
        minWidth: 56,
        alignItems: 'center',
    },
    amPmSelected: { backgroundColor: '#0F172A' },
    amPmLabel: { fontSize: 14, fontWeight: '700', color: '#64748B' },
    amPmLabelSelected: { color: '#FFF' },

    pickerBtnRow: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 24 },
    pickerBtnCancel: { flex: 1, padding: 16, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center' },
    pickerBtnConfirm: { flex: 1, padding: 16, borderRadius: 16, backgroundColor: '#2563EB', alignItems: 'center' },
    pickerBtnTextCancel: { fontSize: 16, fontWeight: '700', color: '#64748B' },
    pickerBtnTextConfirm: { fontSize: 16, fontWeight: '700', color: '#FFF' },

    // Tone Selector
    toneSectionDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 24 },
    toneLabel: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.5, marginBottom: 16, textTransform: 'uppercase' },
    toneList: { gap: 10, marginBottom: 24 },
    toneItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: '#F1F5F9',
        backgroundColor: '#FAFBFC',
        gap: 14,
    },
    toneIconBox: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    toneTextCol: { flex: 1 },
    toneName: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
    toneDesc: { fontSize: 12, color: '#64748B', lineHeight: 16 },

    // Recent Scans
    recentItem: {
        flexDirection: 'row',
        padding: 16,
        backgroundColor: '#FFF',
        borderRadius: 20,
        marginBottom: 16,
        alignItems: 'center',
        gap: 16,
        // Minimalist Card Style with Accent
        borderLeftWidth: 4,
        borderLeftColor: '#2563EB',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 3,
    },
    recentThumb: { width: 60, height: 60, borderRadius: 14, backgroundColor: '#F1F5F9' },
    recentInfo: { flex: 1 },
    recentName: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
    recentTime: { fontSize: 13, color: '#64748B' },

    // Results Layout
    bottomSheetContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#F8FAFC',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        height: '88%',
    },
    bottomSheetContent: { flex: 1 },
    dragHandle: { width: 36, height: 5, backgroundColor: '#E2E8F0', borderRadius: 10, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
    resultsScroll: { padding: 20, paddingBottom: 120 },

    // Med Card (Modern & Clean)
    medCard: {
        backgroundColor: '#FFF',
        borderRadius: 28,
        padding: 24,
        marginBottom: 24,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.05,
        shadowRadius: 20,
        elevation: 4,
        borderWidth: 1,
        borderColor: '#F1F5F9'
    },

    // 1. Patient Section (NEW REORG)
    patientIdCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 0,
        marginBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
        paddingBottom: 20
    },
    patientAvatarContainer: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: '#FFF',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    patientDetails: { flex: 1 },
    patientLabel: { fontSize: 10, fontWeight: '800', color: '#6366F1', letterSpacing: 1, marginBottom: 2 },
    patientNameLarge: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
    patientSubDetails: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
    patientMeta: { fontSize: 13, color: '#64748B', fontWeight: '600' },
    metaDivider: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#CBD5E1', marginHorizontal: 8 },

    // 2. Medicine Section
    medCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    medCardTitle: { fontSize: 22, fontWeight: '900', color: '#0F172A', flex: 1, letterSpacing: -0.5 },
    ttsButtonTop: { position: 'absolute', right: 24, top: 80, width: 44, height: 44, borderRadius: 22, backgroundColor: '#F0F7FF', alignItems: 'center', justifyContent: 'center' },

    fraudBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 6, alignSelf: 'flex-start' },
    fraudBadgeText: { fontSize: 11, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },

    medCardBody: { gap: 16 },
    coreDetailsRow: { flexDirection: 'row', backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16, gap: 16 },
    coreInfoBlock: { flex: 1 },
    infoLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', marginBottom: 4, letterSpacing: 1 },
    infoVal: { fontSize: 16, color: '#334155', fontWeight: '700' },

    // Expanded Content
    expandedContent: { gap: 20, marginTop: 4 },
    sectionDivider: { height: 1.5, backgroundColor: '#F1F5F9', marginVertical: 4 },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionHeader: { fontSize: 12, fontWeight: '800', color: '#64748B', letterSpacing: 1 },
    bodyText: { fontSize: 15, color: '#334155', lineHeight: 24, fontWeight: '500' },

    // Prescription Verification
    prescriptionVerification: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderLeftWidth: 4, borderLeftColor: '#22C55E', marginTop: 8, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 2 },
    verificationHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    verificationTitle: { fontSize: 15, fontWeight: '800', color: '#166534' },
    signatureBadge: { backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    signatureBadgeText: { fontSize: 9, fontWeight: '900', color: '#166534' },
    verificationRow: { flexDirection: 'row', marginBottom: 4 },
    verificationLabel: { fontSize: 13, fontWeight: '700', color: '#15803D' },
    verificationValue: { fontSize: 13, color: '#334155', flex: 1 },

    // Warnings & Food
    warningCardClean: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderLeftWidth: 4, borderLeftColor: '#EF4444', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 2 },
    warningTitleClean: { fontSize: 15, fontWeight: '800', color: '#991B1B' },
    warningTextClean: { fontSize: 14, color: '#334155', lineHeight: 22, marginTop: 4, fontWeight: '500' },
    warningHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },

    foodSectionClean: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderLeftWidth: 4, borderLeftColor: '#64748B', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 2 },
    sectionHeaderLabel: { fontSize: 11, fontWeight: '800', color: '#64748B', letterSpacing: 1, marginBottom: 12 },
    foodItemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    foodItemText: { fontSize: 14, color: '#334155', fontWeight: '600' },

    // Affordability
    affordabilitySection: { gap: 12 },
    savingsCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderLeftWidth: 4, borderLeftColor: '#059669', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 2 },
    savingsTitle: { fontSize: 10, fontWeight: '900', color: '#059669', letterSpacing: 1, marginBottom: 4 },
    genericName: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
    savingsAmount: { fontSize: 13, color: '#059669', marginTop: 2, fontWeight: '700' },

    seniorDiscountCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', padding: 16, borderRadius: 16, borderLeftWidth: 4, borderLeftColor: '#7C3AED', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 2 },
    seniorDiscountText: { fontSize: 13, fontWeight: '700', color: '#5B21B6' },

    // General UI
    actionRow: { marginTop: 12 },
    primaryBtnRow: { backgroundColor: '#2563EB', paddingVertical: 16, borderRadius: 18, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
    secondaryBtnFull: { width: '100%', paddingVertical: 16, borderRadius: 18, alignItems: 'center', backgroundColor: '#F1F5F9', marginTop: 16, flexDirection: 'row', justifyContent: 'center', gap: 8 },
    secondaryBtnText: { fontSize: 15, fontWeight: '700', color: '#475569' },

    shutterOuter: { width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' },

    // Fallbacks & Missing (Fixed Lint Errors)
    emptyState: { alignItems: 'center', padding: 40, opacity: 0.6 },
    emptyText: { marginTop: 16, fontSize: 16, color: '#64748B', fontWeight: '600' },

    permContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#0F172A' },
    permTitle: { fontSize: 24, fontWeight: '800', color: '#FFF', marginBottom: 12, textAlign: 'center' },
    permDesc: { fontSize: 16, color: '#94A3B8', textAlign: 'center', marginBottom: 32, lineHeight: 24 },
    permBtn: { backgroundColor: '#2563EB', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 20 },
    permBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

    primaryBtn: { backgroundColor: '#2563EB', paddingVertical: 16, borderRadius: 20, alignItems: 'center', width: '100%' },
    primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },

    alertBanner: { padding: 16, borderRadius: 20, marginBottom: 16, gap: 8 },
    alertHigh: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
    alertMedium: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' },
    alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    alertTitle: { fontSize: 16, fontWeight: '800', color: '#991B1B' },
    alertDesc: { fontSize: 14, color: '#B91C1C', lineHeight: 20, fontWeight: '500' },

    successIconCircle: { marginBottom: 20, alignItems: 'center' },

    // Fallbacks
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    bottomSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingBottom: 40 },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    sheetTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
    closeIconBtn: { padding: 4 },
    recentList: { padding: 20 },

    successOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.8)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    successCard: { backgroundColor: '#FFF', borderRadius: 32, padding: 32, alignItems: 'center', width: '100%', shadowColor: '#000', shadowRadius: 30, shadowOpacity: 0.2 },
    successTitle: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginBottom: 24 },
    successDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F0F9FF', padding: 16, borderRadius: 20, width: '100%', marginBottom: 10 },
    successTime: { fontSize: 18, fontWeight: '700', color: '#2563EB' },
    successAlarm: { fontSize: 15, fontWeight: '600', color: '#2563EB' },

    errorTitle: { fontSize: 20, fontWeight: '800', color: '#EF4444', textAlign: 'center', marginTop: 20 },
    errorDesc: { fontSize: 16, color: '#64748B', textAlign: 'center', marginVertical: 16, paddingHorizontal: 20 },
});


