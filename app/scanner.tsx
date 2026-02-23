import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Platform, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import Animated, { FadeInUp, FadeInDown, Easing } from 'react-native-reanimated';
import { analyzeInteractions, analyzeMedicineImage, InteractionReport, MedicineAnalysis, translateBatch, translateText } from '../services/gemini';
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

// ─── Language List ────────────────────────────────────────────────────────────
const LANGUAGES = [
    { label: '🇺🇸 English', code: 'en-US', geminiName: 'English' },
    { label: '🇵🇭 Filipino (Tagalog)', code: 'fil-PH', geminiName: 'Filipino/Tagalog' },
    { label: '🇵🇭 Bisaya / Cebuano', code: 'fil-PH', geminiName: 'Cebuano/Bisaya dialect' },
    { label: '🇵🇭 Ilocano', code: 'fil-PH', geminiName: 'Ilocano dialect' },
    { label: '🇵🇭 Waray', code: 'fil-PH', geminiName: 'Waray dialect' },
    { label: '🇵🇭 Kapampangan', code: 'fil-PH', geminiName: 'Kapampangan dialect' },
    { label: '🇪🇸 Spanish', code: 'es-ES', geminiName: 'Spanish' },
    { label: '🇨🇳 Chinese (Mandarin)', code: 'zh-CN', geminiName: 'Mandarin Chinese' },
    { label: '🇯🇵 Japanese', code: 'ja-JP', geminiName: 'Japanese' },
    { label: '🇰🇷 Korean', code: 'ko-KR', geminiName: 'Korean' },
    { label: '🇸🇦 Arabic', code: 'ar-SA', geminiName: 'Arabic' },
    { label: '🇫🇷 French', code: 'fr-FR', geminiName: 'French' },
    { label: '🇩🇪 German', code: 'de-DE', geminiName: 'German' },
    { label: '🇮🇳 Hindi', code: 'hi-IN', geminiName: 'Hindi' },
];
type Language = typeof LANGUAGES[number];


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

// ─── Language Picker Component ───────────────────────────────────────────────
const LanguagePicker = ({
    visible, selected, onSelect, onClose,
}: { visible: boolean; selected: Language; onSelect: (l: Language) => void; onClose: () => void }) => (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
            <View style={{
                backgroundColor: '#FFF',
                borderTopLeftRadius: 24, borderTopRightRadius: 24,
                paddingTop: 12, paddingBottom: 36,
                maxHeight: '78%',
            }}>
                {/* Handle */}
                <View style={{ width: 36, height: 4, backgroundColor: '#CBD5E1', borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F172A', textAlign: 'center', marginBottom: 16 }}>Select Language</Text>
                <FlatList
                    data={LANGUAGES}
                    keyExtractor={item => item.geminiName}
                    contentContainerStyle={{ paddingHorizontal: 20, gap: 4 }}
                    renderItem={({ item }) => {
                        const isSelected = item.geminiName === selected.geminiName;
                        return (
                            <TouchableOpacity
                                onPress={() => { onSelect(item); onClose(); }}
                                activeOpacity={0.7}
                                style={{
                                    flexDirection: 'row', alignItems: 'center',
                                    paddingVertical: 13, paddingHorizontal: 16,
                                    borderRadius: 12,
                                    backgroundColor: isSelected ? '#EFF6FF' : 'transparent',
                                    borderWidth: isSelected ? 1 : 0,
                                    borderColor: '#BFDBFE',
                                }}
                            >
                                <Text style={{ fontSize: 16, flex: 1, color: isSelected ? '#1D4ED8' : '#334155', fontWeight: isSelected ? '700' : '500' }}>
                                    {item.label}
                                </Text>
                                {item.code === 'fil-PH' && item.geminiName !== 'Filipino/Tagalog' && (
                                    <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginRight: 8 }}>
                                        <Text style={{ fontSize: 10, color: '#92400E', fontWeight: '700' }}>DIALECT</Text>
                                    </View>
                                )}
                                {isSelected && <Ionicons name="checkmark-circle" size={20} color="#1D4ED8" />}
                            </TouchableOpacity>
                        );
                    }}
                />
                <TouchableOpacity
                    onPress={onClose}
                    style={{
                        marginHorizontal: 20, marginTop: 16,
                        backgroundColor: '#F1F5F9', borderRadius: 14,
                        paddingVertical: 14, alignItems: 'center',
                    }}
                >
                    <Text style={{ fontWeight: '600', color: '#64748B', fontSize: 15 }}>Cancel</Text>
                </TouchableOpacity>
            </View>
        </View>
    </Modal>
);


export default function Scanner() {
    const router = useRouter();
    const [permission, requestPermission] = useCameraPermissions();
    const [photo, setPhoto] = useState<string | null>(null);
    const [results, setResults] = useState<MedicineAnalysis[]>([]);
    const [interactionReport, setInteractionReport] = useState<InteractionReport | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [flash, setFlash] = useState(false);

    // UI State
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [selectedMedForReminder, setSelectedMedForReminder] = useState<MedicineAnalysis | null>(null);
    const [showRecentModal, setShowRecentModal] = useState(false);
    const [expandedMedIndex, setExpandedMedIndex] = useState<number | null>(0); // Default expand first
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [successMessage, setSuccessMessage] = useState({ time: '', tone: '', isAuto: false });

    // Language / TTS State
    const [selectedLang, setSelectedLang] = useState<Language>(LANGUAGES[0]);
    const [showLangPicker, setShowLangPicker] = useState(false);
    const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
    const [isTranslatingAll, setIsTranslatingAll] = useState(false);
    // Stores translated {name, purpose, warnings} per result index
    const [translatedFields, setTranslatedFields] = useState<Record<number, { name: string; purpose: string; warnings: string }>>({});

    const cameraRef = useRef<CameraView>(null);

    // TTS Handler — uses pre-translated text when available, otherwise translates on-the-fly
    const handleSpeak = async (text: string, cardIndex?: number) => {
        try {
            Speech.stop();
            if (cardIndex !== undefined) setSpeakingIndex(cardIndex);
            // Use pre-translated fields if available
            let toSpeak = text;
            if (cardIndex !== undefined && translatedFields[cardIndex]) {
                const t = translatedFields[cardIndex];
                toSpeak = `${t.name}. ${t.purpose}`;
            } else if (selectedLang.geminiName !== 'English') {
                toSpeak = await translateText(text, selectedLang.geminiName);
            }
            // Use 'en-US' for dialects without a dedicated TTS engine on device;
            // the content is already translated so it will still read in the target language.
            const ttsLang = ['fil-PH'].includes(selectedLang.code) ? 'en-US' : selectedLang.code;
            Speech.speak(toSpeak, {
                language: ttsLang,
                pitch: 1.0,
                rate: 0.85,
                onDone: () => setSpeakingIndex(null),
                onError: () => setSpeakingIndex(null),
            });
        } catch (e) {
            console.warn('TTS Error:', e);
            setSpeakingIndex(null);
        }
    };

    // Auto-translate results when language changes — ONE batched Gemini call
    useEffect(() => {
        if (results.length === 0) return;
        if (selectedLang.geminiName === 'English') {
            setTranslatedFields({});
            return;
        }
        let cancelled = false;
        const run = async () => {
            setIsTranslatingAll(true);
            const translations = await translateBatch(results, selectedLang.geminiName);
            if (!cancelled) {
                const map: Record<number, { name: string; purpose: string; warnings: string }> = {};
                translations.forEach((t, i) => { map[i] = t; });
                setTranslatedFields(map);
                setIsTranslatingAll(false);
            }
        };
        run();
        return () => { cancelled = true; };
    }, [selectedLang, results]);

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
            const result = await cameraRef.current.takePictureAsync({
                quality: 0.3,
            });
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

        // Offline Check
        const netState = await NetInfo.fetch();
        if (!netState.isConnected) {
            Alert.alert(
                "No Internet Connection",
                "You need an internet connection to identify new medicines. Please check your settings."
            );
            return;
        }

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

                                {/* Sheet Header */}
                                <View style={styles.sheetTopRow}>
                                    <View style={styles.sheetTopIcon}>
                                        <Ionicons name="medical" size={16} color="#0369A1" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.sheetTopTitle}>
                                            {results.length === 1 ? 'Prescription Result' : `${results.length} Medicines Found`}
                                        </Text>
                                        <Text style={styles.sheetTopSub}>Tap a card to expand details</Text>
                                    </View>
                                    {/* Language Picker Button */}
                                    <TouchableOpacity
                                        onPress={() => setShowLangPicker(true)}
                                        style={{
                                            flexDirection: 'row', alignItems: 'center', gap: 4,
                                            backgroundColor: '#EFF6FF',
                                            paddingHorizontal: 10, paddingVertical: 6,
                                            borderRadius: 20, marginRight: 8,
                                            borderWidth: 1, borderColor: '#BFDBFE',
                                        }}
                                    >
                                        <Text style={{ fontSize: 14 }}>{selectedLang.label.split(' ')[0]}</Text>
                                        <Ionicons name="chevron-down" size={12} color="#3B82F6" />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={retakePhoto} style={styles.sheetCloseBtn}>
                                        <Ionicons name="camera-outline" size={20} color="#64748B" />
                                    </TouchableOpacity>
                                </View>

                                <ScrollView style={styles.resultsScroll} showsVerticalScrollIndicator={false}>

                                    {/* INTERACTION ALERT BANNER */}
                                    {interactionReport && interactionReport.hasConflict && (
                                        <View style={[
                                            styles.alertBanner,
                                            interactionReport.severity === 'high' ? styles.alertHigh : styles.alertMedium
                                        ]}>
                                            <View style={styles.alertHeader}>
                                                <Ionicons name="warning" size={18} color={interactionReport.severity === 'high' ? '#DC2626' : '#D97706'} />
                                                <Text style={[
                                                    styles.alertTitle,
                                                    { color: interactionReport.severity === 'high' ? '#DC2626' : '#D97706' }
                                                ]}>
                                                    Drug Interaction Detected
                                                </Text>
                                            </View>
                                            <Text style={styles.alertDesc}>{interactionReport.description}</Text>
                                        </View>
                                    )}

                                    {/* MEDICINE LIST */}
                                    {isTranslatingAll && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 4 }}>
                                            <ActivityIndicator size={16} color="#0369A1" />
                                            <Text style={{ fontSize: 13, color: '#64748B' }}>Translating to {selectedLang.label.split(' ').slice(1).join(' ')}...</Text>
                                        </View>
                                    )}
                                    {results.map((med, index) => {
                                        const isExpanded = expandedMedIndex === index;
                                        const fraud = med.fraudDetection;
                                        const tx = translatedFields[index]; // translated text for this card
                                        const displayName = tx?.name || med.medicineName;
                                        const displayPurpose = tx?.purpose || med.commonUses;
                                        const displayWarnings = tx?.warnings || med.warnings;

                                        let badgeColor = '#10B981';
                                        let badgeText = 'Verified';
                                        if (fraud) {
                                            if (fraud.riskLevel === 'high-risk') { badgeColor = '#EF4444'; badgeText = 'High Risk'; }
                                            else if (fraud.riskLevel === 'suspicious') { badgeColor = '#F97316'; badgeText = 'Suspicious'; }
                                            else if (fraud.riskLevel === 'caution') { badgeColor = '#EAB308'; badgeText = 'Caution'; }
                                            else { badgeText = `${fraud.authenticityScore}% Auth`; }
                                        }

                                        return (
                                            <View key={index} style={styles.medCard}>
                                                {/* Card Header */}
                                                <TouchableOpacity
                                                    style={styles.medCardHeader}
                                                    onPress={() => setExpandedMedIndex(isExpanded ? null : index)}
                                                    activeOpacity={0.7}
                                                >
                                                    <View style={styles.medCardIconWrap}>
                                                        <Ionicons name="medkit" size={18} color="#0369A1" />
                                                    </View>
                                                    <View style={{ flex: 1, marginRight: 8 }}>
                                                        <Text style={styles.medCardTitle} numberOfLines={2}>{displayName}</Text>
                                                        <View style={styles.medCardMeta}>
                                                            {fraud && (
                                                                <View style={[styles.fraudPill, { backgroundColor: badgeColor + '18', borderColor: badgeColor + '60' }]}>
                                                                    <View style={[styles.fraudDot, { backgroundColor: badgeColor }]} />
                                                                    <Text style={[styles.fraudPillText, { color: badgeColor }]}>{badgeText}</Text>
                                                                </View>
                                                            )}
                                                            {med.dosage ? (
                                                                <View style={styles.dosagePill}>
                                                                    <Text style={styles.dosagePillText}>{med.dosage}</Text>
                                                                </View>
                                                            ) : null}
                                                        </View>
                                                    </View>
                                                    <View style={styles.speakAndChevron}>
                                                        <TouchableOpacity
                                                            onPress={() => handleSpeak(`${displayName}. ${displayPurpose}`, index)}
                                                            style={styles.speakBtn}
                                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                        >
                                                            {speakingIndex === index
                                                                ? <ActivityIndicator size={18} color="#0369A1" />
                                                                : <Ionicons name="volume-medium-outline" size={20} color="#94A3B8" />}
                                                        </TouchableOpacity>
                                                        <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color="#CBD5E1" />
                                                    </View>
                                                </TouchableOpacity>

                                                {isExpanded && (
                                                    <View style={styles.medCardBody}>
                                                        {/* Dosage + Time chips */}
                                                        <View style={styles.chipRow}>
                                                            <View style={styles.infoChip}>
                                                                <Ionicons name="flask-outline" size={14} color="#0369A1" />
                                                                <Text style={styles.infoChipLabel}>Dosage</Text>
                                                                <Text style={styles.infoChipVal}>{med.dosage || '—'}</Text>
                                                            </View>
                                                            <View style={styles.infoChip}>
                                                                <Ionicons name="time-outline" size={14} color="#0369A1" />
                                                                <Text style={styles.infoChipLabel}>Time</Text>
                                                                <Text style={styles.infoChipVal}>{med.recommendedTime || '—'}</Text>
                                                            </View>
                                                        </View>

                                                        {/* Purpose */}
                                                        <View style={styles.sectionBlock}>
                                                            <View style={styles.sectionBlockHeader}>
                                                                <Text style={styles.sectionLabel}>PURPOSE</Text>
                                                                <TouchableOpacity onPress={() => handleSpeak(displayPurpose)} style={styles.ttsInline}>
                                                                    <Ionicons name="volume-high-outline" size={15} color="#94A3B8" />
                                                                </TouchableOpacity>
                                                            </View>
                                                            <Text style={styles.bodyText}>{displayPurpose}</Text>
                                                        </View>

                                                        {/* Ingredients */}
                                                        <View style={styles.sectionBlock}>
                                                            <Text style={styles.sectionLabel}>ACTIVE INGREDIENTS</Text>
                                                            <Text style={styles.bodyText}>{med.activeIngredients}</Text>
                                                        </View>

                                                        {/* Patient ID Card */}
                                                        {(med.patientName || med.patientAge || med.patientSex) && (
                                                            <View style={styles.patientIdCard}>
                                                                <View style={styles.patientAvatarContainer}>
                                                                    <Ionicons name="person" size={20} color="#FFF" />
                                                                </View>
                                                                <View style={styles.patientDetails}>
                                                                    <Text style={styles.patientNameLarge}>{med.patientName || 'Unknown Patient'}</Text>
                                                                    <View style={styles.patientSubDetails}>
                                                                        <Text style={styles.patientMeta}>{med.patientAge ? `${med.patientAge} yrs` : '—'}</Text>
                                                                        <View style={styles.metaDivider} />
                                                                        <Text style={styles.patientMeta}>{med.patientSex || '—'}</Text>
                                                                    </View>
                                                                </View>
                                                            </View>
                                                        )}
                                                    </View>
                                                )}

                                                {/* PRESCRIPTION DETAILS */}
                                                {(med.prescribedBy || med.hospital || med.signatureVerified) && (
                                                    <View style={styles.rxCard}>
                                                        <View style={styles.rxCardHeader}>
                                                            <View style={styles.rxIconWrap}>
                                                                <Ionicons name="document-text" size={14} color="#059669" />
                                                            </View>
                                                            <Text style={styles.rxCardTitle}>Prescription Details</Text>
                                                            {med.signatureVerified && (
                                                                <View style={styles.rxSignedBadge}>
                                                                    <Ionicons name="checkmark-circle" size={12} color="#059669" />
                                                                    <Text style={styles.rxSignedText}>Signed</Text>
                                                                </View>
                                                            )}
                                                        </View>
                                                        <View style={styles.rxDivider} />
                                                        {med.prescribedBy && (
                                                            <View style={styles.rxRow}>
                                                                <Text style={styles.rxLabel}>Doctor</Text>
                                                                <Text style={styles.rxValue}>{med.prescribedBy}</Text>
                                                            </View>
                                                        )}
                                                        {med.hospital && (
                                                            <View style={styles.rxRow}>
                                                                <Text style={styles.rxLabel}>Clinic / Hospital</Text>
                                                                <Text style={styles.rxValue}>{med.hospital}</Text>
                                                            </View>
                                                        )}
                                                        {med.licenseNumber && (
                                                            <View style={styles.rxRow}>
                                                                <Text style={styles.rxLabel}>License No.</Text>
                                                                <Text style={styles.rxValue}>{med.licenseNumber}</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                )}

                                                {/* WARNINGS */}
                                                {displayWarnings && displayWarnings.length > 0 && (
                                                    <View style={styles.warningCardClean}>
                                                        <View style={styles.warningHeaderRow}>
                                                            <View style={styles.warningIconWrap}>
                                                                <Ionicons name="warning" size={15} color="#DC2626" />
                                                            </View>
                                                            <Text style={styles.warningTitleClean}>Safety Warnings</Text>
                                                            <TouchableOpacity
                                                                onPress={() => handleSpeak(`Warning. ${Array.isArray(displayWarnings) ? displayWarnings.join('. ') : displayWarnings}`)}
                                                                style={styles.ttsInline}
                                                            >
                                                                <Ionicons name="volume-high-outline" size={15} color="#DC2626" />
                                                            </TouchableOpacity>
                                                        </View>
                                                        {Array.isArray(displayWarnings) ? displayWarnings.map((w, i) => (
                                                            <Text key={i} style={styles.warningTextClean}>· {w}</Text>
                                                        )) : <Text style={styles.warningTextClean}>{med.warnings}</Text>}
                                                    </View>
                                                )}

                                                {/* FOOD INTERACTIONS */}
                                                {med.foodWarnings && med.foodWarnings.length > 0 && (
                                                    <View style={styles.foodSectionClean}>
                                                        <Text style={styles.sectionLabel}>FOOD INTERACTIONS</Text>
                                                        {med.foodWarnings.map((food, i) => (
                                                            <View key={i} style={styles.foodItemRow}>
                                                                <Ionicons name="restaurant-outline" size={14} color="#94A3B8" />
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
                                                                <View style={styles.savingsHeader}>
                                                                    <Ionicons name="pricetag-outline" size={16} color="#10B981" />
                                                                    <Text style={styles.savingsTitle}>Generic Alternative</Text>
                                                                </View>
                                                                <Text style={styles.genericName}>{med.affordability.genericAlternative}</Text>
                                                                {med.affordability.estimatedSavings && (
                                                                    <Text style={styles.savingsAmount}>Est. savings: {med.affordability.estimatedSavings}</Text>
                                                                )}
                                                                <Text style={styles.pharmacyHint}>Generika · TGP · Mercury Drug</Text>
                                                            </View>
                                                        )}
                                                        {med.affordability.seniorDiscountEligible && (
                                                            <View style={styles.seniorDiscountCard}>
                                                                <View style={styles.seniorDiscountBadge}>
                                                                    <Ionicons name="accessibility" size={13} color="#FFF" />
                                                                    <Text style={styles.seniorDiscountBadgeText}>SENIOR / PWD</Text>
                                                                </View>
                                                                <Text style={styles.seniorDiscountText} numberOfLines={1}>20% Off & Priority Lane</Text>
                                                            </View>
                                                        )}
                                                        {med.affordability.philHealthCoverage && (
                                                            <View style={styles.philhealthCard}>
                                                                <Ionicons name="shield-checkmark-outline" size={15} color="#059669" />
                                                                <Text style={styles.philhealthText}>PhilHealth: {med.affordability.philHealthCoverage}</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                )}

                                                {/* Reminder CTA */}
                                                <TouchableOpacity
                                                    style={styles.reminderBtn}
                                                    onPress={() => handleReminderPress(med)}
                                                    activeOpacity={0.8}
                                                >
                                                    <Ionicons name="alarm-outline" size={18} color="#FFF" />
                                                    <Text style={styles.reminderBtnText}>Set Reminder</Text>
                                                </TouchableOpacity>
                                            </View>
                                        );
                                    })}

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
                <View style={styles.camera}>
                    <CameraView
                        ref={cameraRef}
                        style={StyleSheet.absoluteFill}
                        facing="back"
                        enableTorch={flash}
                    />
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
                            {/* Flash Button (Right) */}
                            <TouchableOpacity style={styles.controlBtn} onPress={() => setFlash(!flash)}>
                                <View style={[styles.blurCircle, flash && { backgroundColor: 'rgba(255, 215, 0, 0.6)' }]}>
                                    <Ionicons name={flash ? "flash" : "flash-off"} size={24} color={flash ? "#FFF" : "#FFF"} />
                                </View>
                                <Text style={styles.controlLabel}>{flash ? "On" : "Off"}</Text>
                            </TouchableOpacity>
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

            {/* Language Picker */}
            <LanguagePicker
                visible={showLangPicker}
                selected={selectedLang}
                onSelect={setSelectedLang}
                onClose={() => setShowLangPicker(false)}
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

import { moderateScale, scale, verticalScale } from '../utils/responsive';

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    fullScreenImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    camera: { flex: 1 },

    // Camera Overlay
    overlayContainer: { flex: 1, justifyContent: 'space-between' },
    headerBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: scale(20),
        paddingTop: verticalScale(10),
        zIndex: 10
    },
    topOverlay: {
        position: 'absolute',
        top: verticalScale(40),
        left: scale(20),
        zIndex: 10
    },
    bottomControls: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingHorizontal: scale(30),
        paddingBottom: verticalScale(40),
    },

    // Buttons
    shutterBtn: {
        width: scale(80),
        height: scale(80),
        borderRadius: scale(40),
        borderWidth: 4,
        borderColor: 'rgba(255,255,255,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)'
    },
    shutterInner: {
        width: 64, // Keep constant for clear inner circle
        height: 64,
        borderRadius: 32,
        backgroundColor: '#FFF',
    },
    controlBtn: {
        alignItems: 'center',
        justifyContent: 'center',
        width: scale(60),
        height: scale(60)
    },
    controlLabel: {
        color: '#FFF',
        fontSize: moderateScale(12),
        marginTop: verticalScale(4),
        fontWeight: '600',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2
    },
    blurCircle: {
        width: scale(44),
        height: scale(44),
        borderRadius: scale(22),
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: verticalScale(4)
    },
    iconBtn: {
        width: scale(44),
        height: scale(44),
        borderRadius: scale(22),
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Loading & Analysis
    darkOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 20
    },
    loadingText: {
        color: '#FFF',
        marginTop: verticalScale(20),
        fontSize: moderateScale(18),
        fontWeight: '600'
    },

    // Pre-Analysis / Bottom Actions
    bottomActions: {
        position: 'absolute',
        bottom: verticalScale(50),
        alignSelf: 'center',
        alignItems: 'center',
        gap: verticalScale(12)
    },
    largeFab: {
        width: scale(72),
        height: scale(72),
        borderRadius: scale(36),
        backgroundColor: '#0369A1',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6
    },
    instructionText: {
        color: '#FFF',
        fontSize: moderateScale(14),
        fontWeight: '500',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2
    },

    // Picker Styles (Restored)
    pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    pickerCard: {
        backgroundColor: '#FFF',
        width: '100%',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: scale(28),
        maxHeight: '90%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 10,
    },
    pickerHeaderContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: scale(12),
        marginBottom: verticalScale(24),
    },
    pickerHeader: { fontSize: moderateScale(20), fontWeight: '700', color: '#0F172A', marginBottom: 4 },
    pickerSubHeader: { fontSize: moderateScale(14), color: '#64748B', flexDirection: 'row', alignItems: 'center', gap: 4 },

    timeSelectRow: { flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(24), alignSelf: 'center' },
    timeCol: { alignItems: 'center', gap: verticalScale(12) },
    chevronBtn: {
        width: scale(50),
        height: scale(50),
        borderRadius: scale(25),
        backgroundColor: '#E0F2FE',
        alignItems: 'center',
        justifyContent: 'center',
    },
    timeDigit: { fontSize: moderateScale(72), fontWeight: '300', minWidth: scale(90), textAlign: 'center', color: '#0369A1' },
    timeSeparator: { fontSize: moderateScale(72), fontWeight: '200', marginHorizontal: scale(16), paddingBottom: 10, color: '#94A3B8' },

    amPmCol: { marginLeft: scale(20), gap: verticalScale(12) },
    amPmBox: {
        paddingVertical: verticalScale(12),
        paddingHorizontal: scale(18),
        borderRadius: 16,
        backgroundColor: '#F1F5F9',
        minWidth: scale(60),
        alignItems: 'center',
    },
    amPmSelected: { backgroundColor: '#0369A1' },
    amPmLabel: { fontSize: moderateScale(16), fontWeight: '600', color: '#64748B' },
    amPmLabelSelected: { color: '#FFF' },

    pickerBtnRow: { flexDirection: 'row', gap: scale(12), width: '100%', marginTop: verticalScale(20) },
    pickerBtnCancel: { flex: 1, padding: verticalScale(14), borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center' },
    pickerBtnConfirm: { flex: 1, padding: verticalScale(14), borderRadius: 12, backgroundColor: '#0369A1', alignItems: 'center' },
    pickerBtnTextCancel: { fontSize: moderateScale(16), fontWeight: '600', color: '#0F172A' },
    pickerBtnTextConfirm: { fontSize: moderateScale(16), fontWeight: '600', color: '#FFF' },

    // Tone Selector
    toneSectionDivider: {
        height: 1,
        backgroundColor: '#E2E8F0',
        marginVertical: verticalScale(20),
    },
    toneLabel: {
        fontSize: moderateScale(12),
        fontWeight: '800',
        color: '#64748B',
        letterSpacing: 1.5,
        marginBottom: verticalScale(16),
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    toneList: {
        gap: verticalScale(10),
        marginBottom: verticalScale(24),
    },
    toneItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: scale(16),
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#E2E8F0',
        backgroundColor: '#FAFBFC',
        gap: scale(14),
    },
    toneIconBox: {
        width: scale(56),
        height: scale(56),
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    toneTextCol: {
        flex: 1,
    },
    toneName: {
        fontSize: moderateScale(16),
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 2,
    },
    toneDesc: {
        fontSize: moderateScale(12),
        color: '#64748B',
        lineHeight: 16,
    },

    // Success Modal
    successOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: scale(20),
    },
    successCard: {
        backgroundColor: '#FFF',
        borderRadius: 24,
        padding: scale(32),
        alignItems: 'center',
        width: '90%',
        maxWidth: 400,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 12,
    },
    successIconCircle: {
        marginBottom: verticalScale(16),
    },
    successTitle: {
        fontSize: moderateScale(24),
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: verticalScale(20),
        textAlign: 'center',
    },
    successDetailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: scale(10),
        marginVertical: verticalScale(6),
        backgroundColor: '#F0F9FF',
        paddingVertical: verticalScale(12),
        paddingHorizontal: scale(20),
        borderRadius: 12,
        width: '100%',
    },
    successTime: {
        fontSize: moderateScale(18),
        fontWeight: '600',
        color: '#0369A1',
    },
    successAlarm: {
        fontSize: moderateScale(16),
        fontWeight: '600',
        color: '#0369A1',
    },

    // --- Restored Missing Styles ---
    recentItem: {
        flexDirection: 'row',
        padding: scale(16),
        backgroundColor: '#FAFBFC',
        borderRadius: 16,
        marginBottom: verticalScale(12),
        alignItems: 'center',
        gap: scale(16),
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    recentThumb: {
        width: scale(56),
        height: scale(56),
        borderRadius: 12,
        backgroundColor: '#E2E8F0',
    },
    recentInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    recentName: {
        fontSize: moderateScale(16),
        fontWeight: '600',
        color: '#0F172A',
        marginBottom: 4,
    },
    recentTime: {
        fontSize: moderateScale(12),
        color: '#64748B',
    },

    // Empty States & Sheets
    emptyState: { alignItems: 'center', padding: scale(40), opacity: 0.6 },
    emptyText: { marginTop: verticalScale(16), fontSize: moderateScale(16), color: '#64748B' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    bottomSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', paddingBottom: verticalScale(40) },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: scale(20), borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
    sheetTitle: { fontSize: moderateScale(18), fontWeight: '700', color: '#0F172A' },
    closeIconBtn: { padding: 4 },
    recentList: { padding: scale(20) },

    // Permissions
    permContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: scale(20), backgroundColor: '#000' },
    permTitle: { fontSize: moderateScale(20), fontWeight: '700', color: '#FFF', marginBottom: verticalScale(12) },
    permDesc: { fontSize: moderateScale(16), color: '#CBD5E1', textAlign: 'center', marginBottom: verticalScale(24) },
    permBtn: { backgroundColor: '#0369A1', paddingHorizontal: scale(24), paddingVertical: verticalScale(12), borderRadius: 12 },
    permBtnText: { color: '#FFF', fontSize: moderateScale(16), fontWeight: '600' },

    // Results / Analysis Styles
    bottomSheetContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#F8FAFC',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        height: '87%',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.12,
        shadowRadius: 20,
        elevation: 24,
    },
    bottomSheetContent: { flex: 1 },
    dragHandle: { width: 36, height: 4, backgroundColor: '#CBD5E1', borderRadius: 2, alignSelf: 'center', marginTop: verticalScale(10) },
    resultsScroll: { paddingHorizontal: scale(18), paddingTop: verticalScale(12), paddingBottom: verticalScale(120) },

    // Sheet Header Row
    sheetTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: scale(12),
        paddingHorizontal: scale(16),
        paddingVertical: verticalScale(14),
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    sheetTopIcon: {
        width: scale(36),
        height: scale(36),
        borderRadius: scale(18),
        backgroundColor: '#EFF6FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sheetTopTitle: { fontSize: moderateScale(16), fontWeight: '700', color: '#0F172A' },
    sheetTopSub: { fontSize: moderateScale(12), color: '#94A3B8', marginTop: 2 },
    sheetCloseBtn: {
        width: scale(36),
        height: scale(36),
        borderRadius: scale(18),
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Error State
    errorTitle: { fontSize: moderateScale(18), fontWeight: '700', color: '#EF4444', marginBottom: verticalScale(8) },
    errorDesc: { fontSize: moderateScale(14), color: '#64748B', textAlign: 'center', marginBottom: verticalScale(16) },
    primaryBtn: { backgroundColor: '#0369A1', paddingVertical: verticalScale(14), borderRadius: 14, alignItems: 'center', width: '100%' },
    primaryBtnText: { fontSize: moderateScale(16), fontWeight: '600', color: '#FFF' },

    // Alerts
    alertBanner: { flexDirection: 'column', gap: 8, padding: scale(14), borderRadius: 14, marginBottom: verticalScale(14), marginTop: verticalScale(10), borderLeftWidth: 0 },
    alertHigh: { backgroundColor: '#FEF2F2', borderLeftColor: '#DC2626', borderWidth: 0 },
    alertMedium: { backgroundColor: '#FFFBEB', borderLeftColor: '#D97706', borderWidth: 0 },
    alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    alertTitle: { fontSize: moderateScale(14), fontWeight: '700' },
    alertDesc: { fontSize: moderateScale(13), color: '#64748B', lineHeight: 19 },

    // Medication Card
    medCard: {
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: scale(18),
        marginTop: verticalScale(12),
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
        borderWidth: 0,
        overflow: 'hidden',
    },
    medCardIconWrap: {
        width: scale(38),
        height: scale(38),
        borderRadius: scale(19),
        backgroundColor: '#EFF6FF',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: scale(12),
    },
    medCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(4) },
    medCardTitle: { fontSize: moderateScale(17), fontWeight: '700', color: '#0F172A', letterSpacing: -0.2 },
    medCardMeta: { flexDirection: 'row', alignItems: 'center', gap: scale(6), marginTop: verticalScale(4), flexWrap: 'wrap' },
    medCardBody: { marginTop: verticalScale(18), gap: verticalScale(16), borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: verticalScale(18) },

    // Pills / Badges
    fraudPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: scale(8), paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
    fraudDot: { width: 6, height: 6, borderRadius: 3 },
    fraudPillText: { fontSize: moderateScale(11), fontWeight: '700' },
    dosagePill: { backgroundColor: '#F0F9FF', paddingHorizontal: scale(8), paddingVertical: 3, borderRadius: 20 },
    dosagePillText: { fontSize: moderateScale(11), fontWeight: '600', color: '#0369A1' },

    speakAndChevron: { flexDirection: 'row', alignItems: 'center', gap: scale(8) },
    speakBtn: { padding: 4 },
    ttsInline: { padding: 4 },

    // Info Chip Row
    chipRow: { flexDirection: 'row', gap: scale(12) },
    infoChip: {
        flex: 1,
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: scale(14),
        gap: 5,
        alignItems: 'center',
    },
    infoChipLabel: { fontSize: moderateScale(10), fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.8 },
    infoChipVal: { fontSize: moderateScale(14), fontWeight: '600', color: '#0F172A' },

    // Section block
    sectionBlock: { gap: verticalScale(6) },
    sectionBlockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: verticalScale(2) },
    sectionLabel: { fontSize: moderateScale(11), fontWeight: '800', color: '#0369A1', letterSpacing: 1.2, textTransform: 'uppercase' },
    bodyText: { fontSize: moderateScale(14), color: '#334155', lineHeight: 22, fontWeight: '500' },

    // Compat aliases
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
    infoBlock: { flex: 1 },
    infoLabel: { fontSize: moderateScale(11), fontWeight: '700', color: '#94A3B8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 },
    infoVal: { fontSize: moderateScale(17), color: '#0F172A', fontWeight: '600', lineHeight: 24 },
    sectionHeader: { fontSize: moderateScale(13), fontWeight: '700', color: '#64748B', marginTop: verticalScale(16), marginBottom: verticalScale(8), letterSpacing: 0.5 },

    // Patient ID Card
    patientIdCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: scale(16),
        backgroundColor: '#F8FAFC',
        borderRadius: 20,
        marginBottom: verticalScale(20), // Separation from next section
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    patientAvatarContainer: {
        width: scale(48),
        height: scale(48),
        borderRadius: 24,
        backgroundColor: '#CBD5E1',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: scale(16),
    },
    patientDetails: { flex: 1 },
    patientNameLarge: { fontSize: moderateScale(18), fontWeight: '700', color: '#1E293B', marginBottom: 4 },
    patientSubDetails: { flexDirection: 'row', alignItems: 'center' },
    patientMeta: { fontSize: moderateScale(14), color: '#64748B', fontWeight: '500' },
    metaDivider: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#94A3B8',
        marginHorizontal: 8,
    },

    // Warnings
    warningCardClean: {
        backgroundColor: '#FEF2F2',
        borderLeftWidth: 0,
        borderLeftColor: '#DC2626',
        padding: scale(14),
        borderRadius: 12,
        marginTop: verticalScale(6),
        borderWidth: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
        elevation: 1,
    },
    warningIconWrap: {
        width: scale(28),
        height: scale(28),
        borderRadius: scale(14),
        backgroundColor: '#FEE2E2',
        alignItems: 'center',
        justifyContent: 'center',
    },
    warningHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: verticalScale(10) },
    warningTitleClean: { fontSize: moderateScale(13), fontWeight: '800', color: '#991B1B', flex: 1 },
    warningTextClean: { fontSize: moderateScale(13), color: '#7F1D1D', lineHeight: 20, marginTop: 6, paddingLeft: scale(8), fontWeight: '500' },

    // Food Section
    foodSectionClean: { marginTop: verticalScale(4) },
    sectionHeaderLabel: { fontSize: moderateScale(11), fontWeight: '700', color: '#94A3B8', marginBottom: verticalScale(8), letterSpacing: 1 },
    foodItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: verticalScale(6), borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
    foodItemText: { fontSize: moderateScale(13), color: '#475569' },

    // Deprecated (kept empty)
    patientInfo: {},
    prescriptionVerification: {},
    foodWarningSection: {},
    warningCard: {},
    warningText: {},
    verificationHeader: {},
    signatureBadge: {},
    signatureBadgeText: {},
    verificationRow: {},
    verificationText: {},
    verificationTitle: {},

    // Prescription / Rx Card (clean)
    rxCard: {
        backgroundColor: '#F0FDF4',
        borderRadius: 14,
        padding: scale(14),
        marginTop: verticalScale(4),
        borderWidth: 1,
        borderColor: '#BBF7D0',
    },
    rxCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: scale(8),
    },
    rxIconWrap: {
        width: scale(26),
        height: scale(26),
        borderRadius: scale(13),
        backgroundColor: '#DCFCE7',
        alignItems: 'center',
        justifyContent: 'center',
    },
    rxCardTitle: { fontSize: moderateScale(13), fontWeight: '700', color: '#15803D', flex: 1 },
    rxSignedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#DCFCE7',
        paddingHorizontal: scale(8),
        paddingVertical: 3,
        borderRadius: 20,
    },
    rxSignedText: { fontSize: moderateScale(11), fontWeight: '700', color: '#15803D' },
    rxDivider: { height: 1, backgroundColor: '#BBF7D0', marginVertical: verticalScale(10) },
    rxRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingVertical: verticalScale(4),
    },
    rxLabel: { fontSize: moderateScale(12), fontWeight: '600', color: '#6B7280', flex: 1 },
    rxValue: { fontSize: moderateScale(13), fontWeight: '600', color: '#1E293B', flex: 2, textAlign: 'right' },



    // Affordability
    affordabilitySection: { marginTop: verticalScale(24), padding: scale(20), backgroundColor: '#F8FAFC', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    savingsCard: { backgroundColor: '#FFF', borderRadius: 16, padding: scale(20), marginBottom: verticalScale(16), borderWidth: 1, borderColor: '#E2E8F0' },
    savingsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: verticalScale(12) },
    savingsTitle: { fontSize: moderateScale(16), fontWeight: '700', color: '#0F172A' },
    genericName: { fontSize: moderateScale(18), fontWeight: '700', color: '#0369A1', marginBottom: 4 },
    savingsAmount: { fontSize: moderateScale(14), color: '#10B981', fontWeight: '600', marginBottom: 8 },
    pharmacyHint: { fontSize: moderateScale(13), color: '#64748B' },

    seniorDiscountCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: scale(8),
        paddingRight: scale(16),
        backgroundColor: '#F3E8FF',
        borderRadius: 100,
        borderWidth: 1,
        borderColor: '#E9D5FF',
        marginBottom: verticalScale(16),
        gap: 12,
        alignSelf: 'flex-start'
    },
    seniorDiscountBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: scale(12),
        paddingVertical: verticalScale(6),
        backgroundColor: '#7C3AED',
        borderRadius: 100,
        gap: 6
    },
    seniorDiscountBadgeText: {
        color: '#FFF',
        fontSize: moderateScale(11),
        fontWeight: '800',
        letterSpacing: 0.5
    },
    seniorDiscountText: {
        fontSize: moderateScale(13),
        color: '#6B21A8',
        fontWeight: '700',
        flex: 1
    },
    seniorDiscountHeader: {}, // Deprecated
    seniorDiscountTitle: {}, // Deprecated

    govAssistCard: { padding: scale(16), backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0' },
    govAssistHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: verticalScale(12) },
    govAssistTitle: { fontSize: moderateScale(15), fontWeight: '700', color: '#0F172A' },
    govAssistBody: { gap: verticalScale(8) },
    govAssistItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    govAssistContact: { fontSize: moderateScale(13), fontWeight: '600', color: '#0369A1' },

    philhealthCard: { flexDirection: 'row', alignItems: 'center', padding: scale(16), backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 12 },
    philhealthText: { fontSize: moderateScale(13), color: '#64748B', flex: 1 },

    // Action Buttons
    actionRow: { flexDirection: 'row', gap: scale(12), marginTop: verticalScale(12) },
    primaryBtnRow: { flex: 1, backgroundColor: '#0369A1', paddingVertical: verticalScale(14), borderRadius: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
    reminderBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: scale(8),
        backgroundColor: '#0369A1',
        paddingVertical: verticalScale(14),
        borderRadius: 14,
        marginTop: verticalScale(16),
    },
    reminderBtnText: { fontSize: moderateScale(15), fontWeight: '700', color: '#FFF' },
    secondaryBtnFull: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: scale(8),
        paddingVertical: verticalScale(13),
        borderRadius: 14,
        backgroundColor: '#F1F5F9',
        marginTop: verticalScale(8),
        marginBottom: verticalScale(4),
    },
    secondaryBtnText: { fontSize: moderateScale(14), fontWeight: '600', color: '#475569' },

    // Controls
    shutterOuter: { width: scale(84), height: scale(84), borderRadius: scale(42), borderWidth: 4, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
});


