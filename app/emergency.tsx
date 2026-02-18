import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { DeviceMotion } from 'expo-sensors';
import * as Speech from 'expo-speech';
import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Dimensions,
    Linking,
    Modal,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import {
    requestSpeechPermission,
    speakText,
    startListening,
    stopListening,
    useSpeechRecognitionEvent,
} from '../services/speechService';

const CONTACTS_KEY = 'emergency_contacts';
const MEDICAL_ID_KEY = 'medical_id';
const FALL_DETECTION_KEY = 'fall_detection_enabled';
const BATTERY_ALERT_KEY = 'battery_alert_enabled';
const DISTRESS_KEYWORDS = ['help', 'emergency', 'call 911', 'accident', 'hurt', 'pain', 'ambulance'];

// Fall detection thresholds
const FALL_ACCELERATION_THRESHOLD = 2.5; // g-force
const FALL_IMPACT_THRESHOLD = 0.6; // g-force (near freefall)
const LOW_BATTERY_THRESHOLD = 20; // percent
const CRITICAL_BATTERY_THRESHOLD = 10; // percent

const { width } = Dimensions.get('window');

interface EmergencyContact {
    id: string;
    name: string;
    phone: string;
}

interface MedicalInfo {
    name: string;
    bloodType: string;
    allergies: string;
    conditions: string;
    medications: string;
}

export default function Emergency() {
    const router = useRouter();
    const [contacts, setContacts] = useState<EmergencyContact[]>([]);
    const [medicalInfo, setMedicalInfo] = useState<MedicalInfo>({
        name: '', bloodType: '', allergies: '', conditions: '', medications: ''
    });

    // UI States
    const [isEditingMedical, setIsEditingMedical] = useState(false);
    const [isAddingContact, setIsAddingContact] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');

    // Voice & Auto-SOS State
    const [isListening, setIsListening] = useState(false);
    const [sosCountdown, setSosCountdown] = useState<number | null>(null);
    const [isSmsAvailable, setIsSmsAvailable] = useState(false);
    const [isSirenActive, setIsSirenActive] = useState(false);
    const [showPreCallInfo, setShowPreCallInfo] = useState(false);

    // Feature Toggles
    const [fallDetectionEnabled, setFallDetectionEnabled] = useState(false);
    const [batteryAlertEnabled, setBatteryAlertEnabled] = useState(false);

    // Monitoring State
    const [fallDetected, setFallDetected] = useState(false);
    const [batteryLevel, setBatteryLevel] = useState(100);
    const [batteryAlertSent, setBatteryAlertSent] = useState({ low: false, critical: false });

    // Animation Refs
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const sirenAnim = useRef(new Animated.Value(1)).current;
    const countdownTimerRef = useRef<any>(null);

    useEffect(() => {
        loadData();
        loadSettings();
        checkSmsAvailability();
        checkPermissions();

        // Cleanup on unmount
        return () => {
            stopAutoDetection();
            stopSiren();
            DeviceMotion.removeAllListeners();
            if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
        };
    }, []);

    // Load persisted settings
    const loadSettings = async () => {
        try {
            const fall = await AsyncStorage.getItem(FALL_DETECTION_KEY);
            if (fall !== null) setFallDetectionEnabled(JSON.parse(fall));

            const battery = await AsyncStorage.getItem(BATTERY_ALERT_KEY);
            if (battery !== null) setBatteryAlertEnabled(JSON.parse(battery));
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    };

    // Toggle Handlers
    const toggleFallDetection = async (value: boolean) => {
        setFallDetectionEnabled(value);
        await AsyncStorage.setItem(FALL_DETECTION_KEY, JSON.stringify(value));
        if (!value) {
            DeviceMotion.removeAllListeners();
        }
    };

    const toggleBatteryAlert = async (value: boolean) => {
        setBatteryAlertEnabled(value);
        await AsyncStorage.setItem(BATTERY_ALERT_KEY, JSON.stringify(value));
        if (!value) {
            // Optional: Remove listener if we had a stored ref, 
            // but Battery.addBatteryLevelListener returns a subscription we should manage.
            // For simplicity in this functional component, the useEffect handles dependencies.
        }
    };

    // --- Core Logic Effects (Fall, Battery, Animation) ---

    // Fall Detection
    useEffect(() => {
        if (!fallDetectionEnabled) return;

        DeviceMotion.setUpdateInterval(100); // 10 Hz
        const subscription = DeviceMotion.addListener((data: any) => {
            if (!data.acceleration) return;
            const { x, y, z } = data.acceleration;
            const totalAcceleration = Math.sqrt(x * x + y * y + z * z);

            if (totalAcceleration > FALL_ACCELERATION_THRESHOLD) {
                // Potential fall impact
                setTimeout(() => {
                    DeviceMotion.addListener((followUp: any) => {
                        if (!followUp.acceleration) return;
                        const { x: fx, y: fy, z: fz } = followUp.acceleration;
                        const freefallAccel = Math.sqrt(fx * fx + fy * fy + fz * fz);

                        if (freefallAccel < FALL_IMPACT_THRESHOLD && !fallDetected && sosCountdown === null) {
                            setFallDetected(true);
                            Speech.speak('Fall detected. Initiating emergency sequence.');
                            startSOSCountdown();
                            setTimeout(() => setFallDetected(false), 5000); // Reset flag
                        }
                    });
                }, 500);
            }
        });
        return () => subscription.remove();
    }, [fallDetectionEnabled, fallDetected, sosCountdown]);

    // Battery Detection
    useEffect(() => {
        if (!batteryAlertEnabled) return;

        const checkBattery = async () => {
            const level = await Battery.getBatteryLevelAsync();
            setBatteryLevel(Math.round(level * 100));
        };
        checkBattery();

        const subscription = Battery.addBatteryLevelListener(({ batteryLevel }) => {
            const percent = Math.round(batteryLevel * 100);
            setBatteryLevel(percent);

            if (percent <= CRITICAL_BATTERY_THRESHOLD && !batteryAlertSent.critical) {
                sendBatteryAlert(percent, 'CRITICAL');
                setBatteryAlertSent(prev => ({ ...prev, critical: true }));
            } else if (percent <= LOW_BATTERY_THRESHOLD && !batteryAlertSent.low) {
                sendBatteryAlert(percent, 'LOW');
                setBatteryAlertSent(prev => ({ ...prev, low: true }));
            }

            if (percent > LOW_BATTERY_THRESHOLD) {
                setBatteryAlertSent({ low: false, critical: false });
            }
        });

        return () => subscription.remove();
    }, [batteryAlertEnabled]);

    // Animations
    useEffect(() => {
        if (isListening) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [isListening]);

    useEffect(() => {
        if (isSirenActive) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(sirenAnim, { toValue: 1.1, duration: 300, useNativeDriver: true }),
                    Animated.timing(sirenAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
                ])
            ).start();
            playSirenLoop();
        } else {
            sirenAnim.setValue(1);
            Speech.stop();
        }
    }, [isSirenActive]);


    // --- Helpers ---

    const checkPermissions = async () => {
        const loc = await Location.requestForegroundPermissionsAsync();
        const speech = await requestSpeechPermission();
        if (loc.status !== 'granted') console.log('Location denied');
        if (!speech) console.log('Speech denied');
    };

    const checkSmsAvailability = async () => {
        try {
            const SMS = require('expo-sms');
            const avail = await SMS.isAvailableAsync();
            setIsSmsAvailable(avail);
        } catch {
            setIsSmsAvailable(false);
        }
    };

    const loadData = async () => {
        try {
            const c = await AsyncStorage.getItem(CONTACTS_KEY);
            if (c) setContacts(JSON.parse(c));
            const m = await AsyncStorage.getItem(MEDICAL_ID_KEY);
            if (m) setMedicalInfo(JSON.parse(m));
        } catch (e) {
            console.error(e);
        }
    };

    const playSirenLoop = () => {
        if (!isSirenActive) return;
        Speech.speak('EMERGENCY! HELP NEEDED!', {
            rate: 1.1, pitch: 1.1, volume: 1.0,
            onDone: () => { if (isSirenActive) playSirenLoop(); }
        });
    };

    const stopSiren = () => {
        setIsSirenActive(false);
        Speech.stop();
    };

    const sendBatteryAlert = async (percent: number, level: 'LOW' | 'CRITICAL') => {
        if (contacts.length === 0 || !isSmsAvailable) return;

        let locString = '';
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                locString = ` Loc: maps.google.com/?q=${loc.coords.latitude},${loc.coords.longitude}`;
            }
        } catch (e) { }

        const urgency = level === 'CRITICAL' ? '🔴 CRITICAL' : '⚠️ WARNING';
        const msg = `${urgency} Battery at ${percent}%. ${medicalInfo.name ? `User: ${medicalInfo.name}.` : ''}${locString}`;

        try {
            const SMS = require('expo-sms');
            await SMS.sendSMSAsync(contacts.map(c => c.phone), msg);
        } catch (e) {
            console.error('SMS Error', e);
        }
    };

    // --- SOS Logic ---

    useSpeechRecognitionEvent('result', (event) => {
        if (!isListening || sosCountdown !== null) return;
        const transcript = event.results[0]?.transcript.toLowerCase() || '';
        if (DISTRESS_KEYWORDS.some(k => transcript.includes(k))) {
            startSOSCountdown();
        }
    });

    const toggleAutoDetection = async () => {
        if (isListening) await stopAutoDetection();
        else {
            await startListening();
            setIsListening(true);
            speakText('Emergency listening on.');
        }
    };

    const stopAutoDetection = async () => {
        await stopListening();
        setIsListening(false);
    };

    const startSOSCountdown = () => {
        if (sosCountdown !== null) return;
        stopAutoDetection();
        setSosCountdown(10);
        speakText('Emergency detected. Calling 911 in 10 seconds.');

        let t = 10;
        countdownTimerRef.current = setInterval(() => {
            t -= 1;
            setSosCountdown(t);
            if (t <= 0) {
                if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
                setSosCountdown(null);
                executeSOS();
            }
        }, 1000);
    };

    const cancelSOS = () => {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        setSosCountdown(null);
        speakText('Cancelled.');
    };

    const executeSOS = () => {
        setShowPreCallInfo(true);
    };

    const confirmAndCall911 = async () => {
        setShowPreCallInfo(false);

        // 1. Send SMS silently if possible (User interaction required mostly) or prep it
        if (contacts.length > 0 && isSmsAvailable) {
            // In a real app we might try to send this first, but on iOS/Android standard 
            // this opens the composer. We'll do it after the call or assume user handles it.
            // For this safety feature, we prioritize the call.

            // However, we can TRY to send it. 
            // NOTE: Opening SMS composer might interrupt the call flow. 
            // Best practice: Call 911 first.
        }

        Linking.openURL('tel:911');
    };

    const sendEmergencySMS = async () => {
        if (!isSmsAvailable || contacts.length === 0) {
            Alert.alert('Unavailable', 'No contacts or SMS unavailable.');
            return;
        }

        let locString = '';
        try {
            const { status } = await Location.getForegroundPermissionsAsync();
            if (status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({});
                locString = ` https://maps.google.com/?q=${loc.coords.latitude},${loc.coords.longitude}`;
            }
        } catch { }

        const msg = `🆘 HELP! I need emergency assistance! ${locString}`;
        const SMS = require('expo-sms');
        await SMS.sendSMSAsync(contacts.map(c => c.phone), msg);
    };

    // --- Contact / Medical Editing ---

    const saveMedicalInfo = async () => {
        await AsyncStorage.setItem(MEDICAL_ID_KEY, JSON.stringify(medicalInfo));
        setIsEditingMedical(false);
        Alert.alert('Success', 'Medical ID saved.');
    };

    const addContact = () => {
        if (!newName.trim() || !newPhone.trim()) return;
        const nc = { id: Date.now().toString(), name: newName.trim(), phone: newPhone.trim() };
        const updated = [...contacts, nc];
        setContacts(updated);
        AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(updated));
        setNewName(''); setNewPhone(''); setIsAddingContact(false);
    };

    const deleteContact = (id: string) => {
        Alert.alert('Delete', 'Remove this contact?', [
            { text: 'Cancel' },
            {
                text: 'Remove', style: 'destructive', onPress: () => {
                    const updated = contacts.filter(c => c.id !== id);
                    setContacts(updated);
                    AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(updated));
                }
            }
        ]);
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#0369A1" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Emergency SOS</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>

                {/* Main SOS Button */}
                <View style={styles.sosContainer}>
                    <TouchableOpacity
                        style={styles.sosButton}
                        onPress={() => executeSOS()}
                        activeOpacity={0.8}
                    >
                        <View style={styles.sosInner}>
                            <Text style={styles.sosText}>SOS</Text>
                            <Text style={styles.sosSub}>TAP FOR 911</Text>
                        </View>
                    </TouchableOpacity>
                </View>

                {/* Quick Actions Grid */}
                <View style={styles.grid}>
                    <TouchableOpacity
                        style={[styles.actionCard, isSirenActive && styles.cardActiveRed]}
                        onPress={() => setIsSirenActive(!isSirenActive)}
                    >
                        <Animated.View style={{ transform: [{ scale: sirenAnim }] }}>
                            <Ionicons name="megaphone" size={28} color={isSirenActive ? "#FFF" : "#0369A1"} />
                        </Animated.View>
                        <Text style={[styles.cardText, isSirenActive && styles.textWhite]}>Siren</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.actionCard}
                        onPress={sendEmergencySMS}
                    >
                        <Ionicons name="location" size={28} color="#0369A1" />
                        <Text style={styles.cardText}>Share Loc</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionCard, isListening && styles.cardActiveBlue]}
                        onPress={toggleAutoDetection}
                    >
                        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                            <Ionicons name={isListening ? "mic" : "mic-outline"} size={28} color={isListening ? "#FFF" : "#0369A1"} />
                        </Animated.View>
                        <Text style={[styles.cardText, isListening && styles.textWhite]}>Auto-SOS</Text>
                    </TouchableOpacity>
                </View>

                {/* Settings Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionHeader}>Safety Settings</Text>
                    <View style={styles.settingRow}>
                        <View style={styles.settingInfo}>
                            <Text style={styles.settingLabel}>Fall Detection</Text>
                            <Text style={styles.settingDesc}>Auto-alert if a hard fall is detected</Text>
                        </View>
                        <Switch
                            value={fallDetectionEnabled}
                            onValueChange={toggleFallDetection}
                            trackColor={{ false: '#E2E8F0', true: '#0369A1' }}
                        />
                    </View>
                    <View style={styles.settingRow}>
                        <View style={styles.settingInfo}>
                            <Text style={styles.settingLabel}>Battery Monitor</Text>
                            <Text style={styles.settingDesc}>Alert contacts when battery is low</Text>
                        </View>
                        <Switch
                            value={batteryAlertEnabled}
                            onValueChange={toggleBatteryAlert}
                            trackColor={{ false: '#E2E8F0', true: '#0369A1' }}
                        />
                    </View>
                </View>

                {/* Medical ID Section */}
                <View style={styles.section}>
                    <View style={styles.sectionTitleRow}>
                        <Text style={styles.sectionHeader}>Medical ID</Text>
                        <TouchableOpacity onPress={() => isEditingMedical ? saveMedicalInfo() : setIsEditingMedical(true)}>
                            <Text style={styles.editLink}>{isEditingMedical ? 'Done' : 'Edit'}</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.medicalCard}>
                        {isEditingMedical ? (
                            <View style={styles.editForm}>
                                <TextInput style={styles.input} placeholder="Name" value={medicalInfo.name} onChangeText={t => setMedicalInfo({ ...medicalInfo, name: t })} />
                                <TextInput style={styles.input} placeholder="Blood Type" value={medicalInfo.bloodType} onChangeText={t => setMedicalInfo({ ...medicalInfo, bloodType: t })} />
                                <TextInput style={styles.input} placeholder="Allergies" value={medicalInfo.allergies} onChangeText={t => setMedicalInfo({ ...medicalInfo, allergies: t })} />
                                <TextInput style={styles.input} placeholder="Conditions" value={medicalInfo.conditions} onChangeText={t => setMedicalInfo({ ...medicalInfo, conditions: t })} />
                                <TextInput style={[styles.input, styles.textArea]} placeholder="Notes/Meds" multiline value={medicalInfo.medications} onChangeText={t => setMedicalInfo({ ...medicalInfo, medications: t })} />
                            </View>
                        ) : (
                            <View>
                                <View style={styles.medRow}>
                                    <View>
                                        <Text style={styles.medLabel}>Name</Text>
                                        <Text style={styles.medValue}>{medicalInfo.name || 'Not set'}</Text>
                                    </View>
                                    <View>
                                        <Text style={styles.medLabel}>Blood</Text>
                                        <Text style={styles.medValue}>{medicalInfo.bloodType || '--'}</Text>
                                    </View>
                                </View>
                                <View style={styles.medRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.medLabel}>Allergies</Text>
                                        <Text style={styles.medValue}>{medicalInfo.allergies || 'None'}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.medLabel}>Conditions</Text>
                                        <Text style={styles.medValue}>{medicalInfo.conditions || 'None'}</Text>
                                    </View>
                                </View>
                                {medicalInfo.medications ? (
                                    <View style={{ marginTop: 12 }}>
                                        <Text style={styles.medLabel}>Notes</Text>
                                        <Text style={styles.medValue}>{medicalInfo.medications}</Text>
                                    </View>
                                ) : null}
                            </View>
                        )}
                    </View>
                </View>

                {/* Contacts Section */}
                <View style={styles.section}>
                    <View style={styles.sectionTitleRow}>
                        <Text style={styles.sectionHeader}>Emergency Contacts</Text>
                        <TouchableOpacity onPress={() => setIsAddingContact(!isAddingContact)}>
                            <Text style={styles.editLink}>{isAddingContact ? 'Cancel' : '+ Add'}</Text>
                        </TouchableOpacity>
                    </View>

                    {isAddingContact && (
                        <View style={styles.addContactForm}>
                            <TextInput style={styles.input} placeholder="Contact Name" value={newName} onChangeText={setNewName} />
                            <TextInput style={styles.input} placeholder="Phone Number" keyboardType="phone-pad" value={newPhone} onChangeText={setNewPhone} />
                            <TouchableOpacity style={styles.saveBtn} onPress={addContact}>
                                <Text style={styles.saveBtnText}>Save Contact</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {contacts.map(c => (
                        <View key={c.id} style={styles.contactRow}>
                            <View style={styles.contactAvatar}>
                                <Text style={styles.contactAvatarText}>{c.name[0]}</Text>
                            </View>
                            <View style={styles.contactInfo}>
                                <Text style={styles.contactName}>{c.name}</Text>
                                <Text style={styles.contactPhone}>{c.phone}</Text>
                            </View>
                            <View style={styles.contactActions}>
                                <TouchableOpacity onPress={() => Linking.openURL(`tel:${c.phone}`)} style={styles.iconBtn}>
                                    <Ionicons name="call" size={20} color="#0369A1" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => deleteContact(c.id)} style={styles.iconBtn}>
                                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                    {contacts.length === 0 && !isAddingContact && (
                        <Text style={styles.emptyState}>No emergency contacts added.</Text>
                    )}
                </View>

            </ScrollView>

            {/* COUNTDOWN OVERLAY */}
            <Modal visible={sosCountdown !== null} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.countdownContainer}>
                        <Text style={styles.countdownLabel}>EMERGENCY</Text>
                        <Text style={styles.countdownSub}>Calling 911 in</Text>
                        <Text style={styles.countdownBig}>{sosCountdown}</Text>
                        <TouchableOpacity style={styles.cancelBtn} onPress={cancelSOS}>
                            <Text style={styles.cancelBtnText}>CANCEL</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* PRE-CALL CONFIRMATION MODAL */}
            <Modal visible={showPreCallInfo} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.confirmCard}>
                        <View style={styles.confirmHeader}>
                            <Ionicons name="warning" size={40} color="#EF4444" />
                            <Text style={styles.confirmTitle}>Emergency Call</Text>
                        </View>
                        <Text style={styles.confirmText}>
                            You are about to call 911.
                        </Text>

                        <TouchableOpacity style={styles.bigCallBtn} onPress={confirmAndCall911}>
                            <Text style={styles.bigCallText}>CALL 911 NOW</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.secondaryBtn} onPress={sendEmergencySMS}>
                            <Text style={styles.secondaryBtnText}>Text Contacts Only</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.closeBtn} onPress={() => setShowPreCallInfo(false)}>
                            <Text style={styles.closeBtnText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 20 },
    backButton: { marginRight: 16 },
    headerTitle: { fontSize: 22, fontWeight: '700', color: '#1E293B', flex: 1 },

    scrollContent: { paddingBottom: 40 },

    // SOS Button
    sosContainer: { alignItems: 'center', marginVertical: 20 },
    sosButton: {
        width: 180, height: 180, borderRadius: 90,
        backgroundColor: '#EF4444',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#EF4444', shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3, shadowRadius: 20, elevation: 10,
        borderWidth: 8, borderColor: '#FEE2E2'
    },
    sosInner: { alignItems: 'center' },
    sosText: { fontSize: 48, fontWeight: '900', color: '#FFF' },
    sosSub: { fontSize: 13, fontWeight: '700', color: '#FEE2E2', marginTop: 4 },

    // Quick Action Grid
    grid: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 30 },
    actionCard: {
        flex: 1, backgroundColor: '#FFF', padding: 16, borderRadius: 16,
        alignItems: 'center', justifyContent: 'center', gap: 8,
        shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05, shadowRadius: 8, elevation: 2
    },
    cardActiveRed: { backgroundColor: '#EF4444' },
    cardActiveBlue: { backgroundColor: '#0369A1' },
    textWhite: { color: '#FFF' },
    cardText: { fontSize: 13, fontWeight: '600', color: '#475569' },

    // Section
    section: { marginBottom: 24, paddingHorizontal: 20 },
    sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionHeader: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 12 },
    editLink: { fontSize: 14, fontWeight: '600', color: '#0369A1' },

    // Settings
    settingRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#FFF', padding: 16, borderRadius: 16, marginBottom: 12,
        shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05, shadowRadius: 4, elevation: 1
    },
    settingInfo: { flex: 1, marginRight: 16 },
    settingLabel: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
    settingDesc: { fontSize: 13, color: '#64748B', marginTop: 2 },

    // Medical ID
    medicalCard: {
        backgroundColor: '#FFF', padding: 20, borderRadius: 20,
        shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05, shadowRadius: 8, elevation: 2
    },
    editForm: { gap: 12 },
    input: {
        backgroundColor: '#F1F5F9', borderRadius: 12, padding: 12,
        fontSize: 15, color: '#1E293B', borderWidth: 1, borderColor: '#E2E8F0'
    },
    textArea: { height: 80, textAlignVertical: 'top' },
    medRow: { flexDirection: 'row', gap: 20, marginBottom: 16 },
    medLabel: { fontSize: 12, fontWeight: '600', color: '#64748B', textTransform: 'uppercase', marginBottom: 4 },
    medValue: { fontSize: 16, fontWeight: '600', color: '#0F172A' },

    // Contacts
    addContactForm: { backgroundColor: '#FFF', padding: 16, borderRadius: 16, marginBottom: 16, gap: 12 },
    saveBtn: { backgroundColor: '#0369A1', padding: 14, borderRadius: 12, alignItems: 'center' },
    saveBtnText: { color: '#FFF', fontWeight: '600' },
    contactRow: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF',
        padding: 12, borderRadius: 16, marginBottom: 12,
        shadowColor: '#64748B', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 4, elevation: 1
    },
    contactAvatar: {
        width: 40, height: 40, borderRadius: 20, backgroundColor: '#E0F2FE',
        alignItems: 'center', justifyContent: 'center', marginRight: 12
    },
    contactAvatarText: { fontSize: 18, fontWeight: '700', color: '#0369A1' },
    contactInfo: { flex: 1 },
    contactName: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
    contactPhone: { fontSize: 14, color: '#64748B' },
    contactActions: { flexDirection: 'row', gap: 8 },
    iconBtn: { padding: 8 },
    emptyState: { textAlign: 'center', color: '#94A3B8', marginTop: 8 },

    // Modals
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
    countdownContainer: { alignItems: 'center' },
    countdownLabel: { fontSize: 24, fontWeight: '800', color: '#FFF', marginBottom: 8 },
    countdownSub: { fontSize: 18, color: 'rgba(255,255,255,0.8)' },
    countdownBig: { fontSize: 100, fontWeight: '900', color: '#FFF', marginVertical: 10 },
    cancelBtn: { backgroundColor: '#FFF', paddingHorizontal: 40, paddingVertical: 16, borderRadius: 30 },
    cancelBtnText: { fontSize: 20, fontWeight: '800', color: '#EF4444' },

    confirmCard: { backgroundColor: '#FFF', width: '100%', borderRadius: 24, padding: 24, alignItems: 'center' },
    confirmHeader: { alignItems: 'center', marginBottom: 16 },
    confirmTitle: { fontSize: 24, fontWeight: '700', color: '#1E293B', marginTop: 8 },
    confirmText: { fontSize: 16, color: '#64748B', textAlign: 'center', marginBottom: 24 },
    bigCallBtn: { backgroundColor: '#EF4444', width: '100%', padding: 18, borderRadius: 16, alignItems: 'center', marginBottom: 12 },
    bigCallText: { color: '#FFF', fontSize: 18, fontWeight: '800' },
    secondaryBtn: { backgroundColor: '#F1F5F9', width: '100%', padding: 16, borderRadius: 16, alignItems: 'center', marginBottom: 12 },
    secondaryBtnText: { color: '#475569', fontSize: 16, fontWeight: '600' },
    closeBtn: { padding: 12 },
    closeBtnText: { color: '#94A3B8', fontSize: 16, fontWeight: '600' },
});
