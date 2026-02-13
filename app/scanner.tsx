import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, Modal, Platform, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { analyzeMedicineImage, MedicineAnalysis } from '../services/gemini';
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

    const renderItem = ({ item }: { item: SavedScan }) => (
        <TouchableOpacity style={styles.recentItem} onPress={() => onSelect(item)}>
            <Image source={{ uri: item.imageUri }} style={styles.recentThumb} />
            <View style={styles.recentInfo}>
                <Text style={styles.recentName} numberOfLines={1}>{item.analysis.medicineName}</Text>
                <Text style={styles.recentTime}>
                    {new Date(item.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} • {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
        </TouchableOpacity>
    );

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
}

const CustomTimePicker = ({ visible, onClose, onConfirm }: CustomTimePickerProps) => {
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
    const [results, setResults] = useState<MedicineAnalysis | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [showRecentModal, setShowRecentModal] = useState(false);

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
        setResults(null);
        setError(null);
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

        try {
            const analysis = await analyzeMedicineImage(photo);
            setResults(analysis);
            await saveScan(analysis, photo);

            if (analysis.recommendedTime) {
                const [timeStr] = analysis.recommendedTime.split(' ');
                const [h, m] = timeStr.split(':').map(Number);
                if (!isNaN(h) && !isNaN(m)) {
                    setTimeout(() => scheduleReminder(analysis.medicineName, h, m, true), 800);
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
        setShowRecentModal(false);
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
                {results && !isAnalyzing && !error && (
                    <View style={styles.bottomSheetContainer}>
                        <View style={styles.bottomSheetContent}>
                            <View style={styles.dragHandle} />

                            <ScrollView style={styles.resultsScroll} showsVerticalScrollIndicator={false}>
                                <Text style={styles.medName}>{results.medicineName}</Text>

                                <View style={styles.infoRow}>
                                    <View style={styles.infoBlock}>
                                        <Text style={styles.infoLabel}>DOSAGE</Text>
                                        <Text style={styles.infoVal}>{results.dosage || '--'}</Text>
                                    </View>
                                    <View style={styles.infoBlock}>
                                        <Text style={styles.infoLabel}>TIME</Text>
                                        <Text style={styles.infoVal}>{results.recommendedTime || '--'}</Text>
                                    </View>
                                </View>

                                <Text style={styles.sectionHeader}>PURPOSE</Text>
                                <Text style={styles.bodyText}>{results.commonUses}</Text>

                                <Text style={styles.sectionHeader}>INGREDIENTS</Text>
                                <Text style={styles.bodyText}>{results.activeIngredients}</Text>

                                {results.warnings ? (
                                    <View style={styles.warningCard}>
                                        <Ionicons name="warning" size={20} color="#EF4444" />
                                        <Text style={styles.warningText}>{results.warnings}</Text>
                                    </View>
                                ) : null}

                                <View style={styles.actionRow}>
                                    <TouchableOpacity style={styles.secondaryBtn} onPress={retakePhoto}>
                                        <Ionicons name="camera-outline" size={20} color="#4facfe" />
                                        <Text style={styles.secondaryBtnText}>New Scan</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.primaryBtnRow} onPress={() => setShowTimePicker(true)}>
                                        <Ionicons name="alarm-outline" size={20} color="#FFF" />
                                        <Text style={styles.primaryBtnText}>Reminder</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={{ height: 40 }} />
                            </ScrollView>
                        </View>
                    </View>
                )}

                {/* Pre-Analysis Actions */}
                {!results && !error && !isAnalyzing && (
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
                    onConfirm={(h, m) => results && scheduleReminder(results.medicineName, h, m)}
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
        height: '65%', // Takes up bottom 65%
        justifyContent: 'flex-end',
    },
    bottomSheetContent: {
        flex: 1,
        backgroundColor: '#FFF',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 24,
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
        backgroundColor: '#E5E5EA',
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: 20,
    },
    medName: { fontSize: 28, fontWeight: '800', color: '#1C1C1E', marginBottom: 20, lineHeight: 34 },
    infoRow: { flexDirection: 'row', marginBottom: 24, gap: 16 },
    infoBlock: { flex: 1, backgroundColor: '#F2F2F7', padding: 12, borderRadius: 12 },
    infoLabel: { fontSize: 11, fontWeight: '700', color: '#8E8E93', marginBottom: 4, letterSpacing: 0.5 },
    infoVal: { fontSize: 16, fontWeight: '600', color: '#000' },
    sectionHeader: { fontSize: 13, fontWeight: '700', color: '#8E8E93', marginTop: 16, marginBottom: 8, letterSpacing: 0.5 },
    bodyText: { fontSize: 15, color: '#3A3A3C', lineHeight: 22 },
    warningCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#FEF2F2',
        padding: 16,
        borderRadius: 12,
        marginTop: 20,
        gap: 12
    },
    warningText: { flex: 1, color: '#B91C1C', fontSize: 14, lineHeight: 20 },
    actionRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
    primaryBtnRow: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: '#000',
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8
    },
    primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
    secondaryBtn: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: '#F0F9FF',
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8
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
    pickerHeader: { fontSize: 18, fontWeight: '700', marginBottom: 24 },
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
});
