import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Linking,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
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
const DISTRESS_KEYWORDS = ['help', 'emergency', 'call 911', 'accident', 'hurt', 'pain', 'ambulance'];

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
    const [isEditingMedical, setIsEditingMedical] = useState(false);

    // UI States
    const [isAddingContact, setIsAddingContact] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');

    // Voice & Auto-SOS State
    const [isListening, setIsListening] = useState(false);
    const [sosCountdown, setSosCountdown] = useState<number | null>(null);
    const [isSmsAvailable, setIsSmsAvailable] = useState(false);
    const [isSirenActive, setIsSirenActive] = useState(false);

    // Animation Refs
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const sirenAnim = useRef(new Animated.Value(1)).current;
    const countdownTimerRef = useRef<any>(null);

    useEffect(() => {
        loadData();
        checkSmsAvailability();
        checkPermissions();

        // Cleanup on unmount
        return () => {
            stopAutoDetection();
            stopSiren();
            if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
        };
    }, []);

    const checkPermissions = async () => {
        // 1. Location
        const locStatus = await Location.requestForegroundPermissionsAsync();
        if (locStatus.status !== 'granted') {
            console.log('Location permission denied');
        }

        // 2. Speech
        const speechGranted = await requestSpeechPermission();
        if (!speechGranted) {
            console.log('Speech permission denied');
        }
    };

    // Pulse animation for listening state
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

    // Siren Animation
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

    const playSirenLoop = () => {
        if (!isSirenActive) return;
        Speech.speak('EMERGENCY! HELP NEEDED!', {
            rate: 1.1,
            pitch: 1.1,
            volume: 1.0,
            onDone: () => {
                if (isSirenActive) playSirenLoop(); // Loop recursively
            }
        });
    };

    const stopSiren = () => {
        setIsSirenActive(false);
        Speech.stop();
    };

    const checkSmsAvailability = async () => {
        try {
            const SMS = require('expo-sms');
            const isAvailable = await SMS.isAvailableAsync();
            setIsSmsAvailable(isAvailable);
        } catch (error) {
            console.log('Expo SMS native module not found');
            setIsSmsAvailable(false);
        }
    };

    const loadData = async () => {
        try {
            const contactsData = await AsyncStorage.getItem(CONTACTS_KEY);
            if (contactsData) setContacts(JSON.parse(contactsData));

            const medicalData = await AsyncStorage.getItem(MEDICAL_ID_KEY);
            if (medicalData) setMedicalInfo(JSON.parse(medicalData));
        } catch (error) {
            console.error('Error loading data:', error);
        }
    };

    const saveContacts = async (newContacts: EmergencyContact[]) => {
        try {
            await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(newContacts));
            setContacts(newContacts);
        } catch (error) {
            console.error('Error saving contacts:', error);
        }
    };

    const saveMedicalInfo = async () => {
        try {
            await AsyncStorage.setItem(MEDICAL_ID_KEY, JSON.stringify(medicalInfo));
            setIsEditingMedical(false);
            Alert.alert('Saved', 'Medical ID updated.');
        } catch (error) {
            Alert.alert('Error', 'Could not save Medical ID.');
        }
    };

    // --- Voice Recognition Logic ---

    useSpeechRecognitionEvent('result', (event) => {
        if (!isListening || sosCountdown !== null) return;

        const transcript = event.results[0]?.transcript.toLowerCase() || '';
        // Check for distress keywords
        const detectedKeyword = DISTRESS_KEYWORDS.find(keyword => transcript.includes(keyword));
        if (detectedKeyword) {
            startSOSCountdown();
        }
    });

    useSpeechRecognitionEvent('error', (event) => {
        if (isListening && event.error === 'not-allowed') {
            setIsListening(false);
            Alert.alert('Permission Denied', 'Microphone access is needed for auto-detection.');
        }
    });

    const toggleAutoDetection = async () => {
        if (isListening) await stopAutoDetection();
        else await startAutoDetection();
    };

    const startAutoDetection = async () => {
        try {
            await startListening();
            setIsListening(true);
            speakText('Emergency listening active.');
        } catch (error) {
            Alert.alert('Error', 'Could not start voice detection.');
        }
    };

    const stopAutoDetection = async () => {
        await stopListening();
        setIsListening(false);
    };

    // --- SOS Sequence Logic ---

    const startSOSCountdown = () => {
        if (sosCountdown !== null) return;
        stopAutoDetection();
        setSosCountdown(10);
        speakText('Emergency detected. Calling 911 in 10 seconds.');

        let timeLeft = 10;
        countdownTimerRef.current = setInterval(() => {
            timeLeft -= 1;
            setSosCountdown(timeLeft);

            if (timeLeft <= 0) {
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

    const executeSOS = async () => {
        // 1. Get Location (Best effort, non-blocking for the call)
        let locationLink = '';
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                locationLink = ` https://maps.google.com/?q=${loc.coords.latitude},${loc.coords.longitude}`;
            }
        } catch (e) {
            console.log('Location fetch failed:', e);
        }

        // 2. Prepare SMS (Fire and forget, don't await result)
        if (contacts.length > 0 && isSmsAvailable) {
            const phoneNumbers = contacts.map(c => c.phone);
            const message = `🆘 EMERGENCY: I need help! This is an automated alert from my MediMate app. Please call me or 911.${locationLink}`;

            try {
                const SMS = require('expo-sms');
                // DOM'T AWAIT: This opens the system SMS composer which pauses the app. 
                // We want to trigger the 911 call immediately after.
                SMS.sendSMSAsync(phoneNumbers, message).catch((err: any) => console.error('SMS failed in background', err));
            } catch (error) {
                console.error('Failed to initiate SMS:', error);
            }
        }

        // 3. Dial 911 (Prioritize this)
        // Slight delay to allow SMS composer to at least register the intent if possible, 
        // but ensure 911 call execution.
        setTimeout(() => {
            Linking.openURL('tel:911');
        }, 500);
    };

    // --- Contact Management ---

    const addContact = () => {
        if (!newName.trim() || !newPhone.trim()) {
            Alert.alert('Missing Info', 'Please enter both name and phone number.');
            return;
        }
        const newContact: EmergencyContact = {
            id: Date.now().toString(),
            name: newName.trim(),
            phone: newPhone.trim(),
        };
        saveContacts([...contacts, newContact]);
        setNewName('');
        setNewPhone('');
        setIsAddingContact(false);
    };

    const deleteContact = (id: string) => {
        Alert.alert('Remove Contact?', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => saveContacts(contacts.filter(c => c.id !== id)) },
        ]);
    };

    const callContact = (contact: EmergencyContact) => {
        Linking.openURL(`tel:${contact.phone}`).catch(err => console.error('Error calling contact:', err));
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0369A1" />

            {/* SOS Countdown Overlay */}
            {sosCountdown !== null && (
                <View style={styles.countdownOverlay}>
                    <Text style={styles.countdownTitle}>🚨 EMERGENCY DETECTED</Text>
                    <Text style={styles.countdownSub}>Calling 911 in</Text>
                    <Text style={styles.countdownNumber}>{sosCountdown}</Text>
                    <TouchableOpacity style={styles.cancelButton} onPress={cancelSOS}>
                        <Text style={styles.cancelButtonText}>CANCEL</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#FFF" />
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Emergency SOS</Text>
            </View>

            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>

                {/* 1. Auto-Detect & Siren Row */}
                <View style={styles.controlsRow}>
                    <TouchableOpacity
                        style={[styles.controlCard, isListening && styles.controlActive]}
                        onPress={toggleAutoDetection}
                    >
                        <Animated.View style={{ transform: [{ scale: pulseAnim }], marginBottom: 8 }}>
                            <Ionicons name={isListening ? "mic" : "mic-off"} size={32} color={isListening ? "#FFF" : "#dc2626"} />
                        </Animated.View>
                        <Text style={[styles.controlTitle, isListening && styles.textWhite]}>Auto-SOS</Text>
                        <Text style={[styles.controlSub, isListening && styles.textWhiteSub]}>{isListening ? "Listening" : "Off"}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.controlCard, isSirenActive && styles.sirenActive]}
                        onPress={() => setIsSirenActive(!isSirenActive)}
                    >
                        <Animated.View style={{ transform: [{ scale: sirenAnim }], marginBottom: 8 }}>
                            <Ionicons name="megaphone" size={32} color={isSirenActive ? "#FFF" : "#dc2626"} />
                        </Animated.View>
                        <Text style={[styles.controlTitle, isSirenActive && styles.textWhite]}>Siren</Text>
                        <Text style={[styles.controlSub, isSirenActive && styles.textWhiteSub]}>{isSirenActive ? "LOUD" : "Off"}</Text>
                    </TouchableOpacity>
                </View>

                {/* 2. Big SOS Button */}
                <TouchableOpacity style={styles.sosButton} onPress={() => Linking.openURL('tel:911')}>
                    <View style={styles.sosInner}>
                        <Text style={styles.sosText}>SOS</Text>
                        <Text style={styles.sosSub}>CALL 911</Text>
                    </View>
                </TouchableOpacity>

                {/* 3. Medical ID Card */}
                <View style={styles.medicalCard}>
                    <View style={styles.cardHeader}>
                        <View style={styles.headerTitleRow}>
                            <Ionicons name="medical" size={24} color="#dc2626" />
                            <Text style={styles.cardTitle}>Medical ID</Text>
                        </View>
                        <TouchableOpacity onPress={isEditingMedical ? saveMedicalInfo : () => setIsEditingMedical(true)}>
                            <Text style={styles.editBtn}>{isEditingMedical ? 'Save' : 'Edit'}</Text>
                        </TouchableOpacity>
                    </View>

                    {isEditingMedical ? (
                        <View style={styles.medicalForm}>
                            <TextInput style={styles.medInput} placeholder="Full Name" value={medicalInfo.name} onChangeText={t => setMedicalInfo({ ...medicalInfo, name: t })} />
                            <TextInput style={styles.medInput} placeholder="Blood Type (e.g. A+)" value={medicalInfo.bloodType} onChangeText={t => setMedicalInfo({ ...medicalInfo, bloodType: t })} />
                            <TextInput style={styles.medInput} placeholder="Allergies (e.g. Penicillin)" value={medicalInfo.allergies} onChangeText={t => setMedicalInfo({ ...medicalInfo, allergies: t })} />
                            <TextInput style={styles.medInput} placeholder="Conditions (e.g. Diabetes)" value={medicalInfo.conditions} onChangeText={t => setMedicalInfo({ ...medicalInfo, conditions: t })} />
                            <TextInput style={[styles.medInput, { height: 60 }]} placeholder="Medications / Notes" multiline value={medicalInfo.medications} onChangeText={t => setMedicalInfo({ ...medicalInfo, medications: t })} />
                        </View>
                    ) : (
                        <View style={styles.medicalDisplay}>
                            <View style={styles.medRow}>
                                <Text style={styles.medLabel}>Name:</Text>
                                <Text style={styles.medValue}>{medicalInfo.name || '--'}</Text>
                            </View>
                            <View style={styles.medRow}>
                                <Text style={styles.medLabel}>Blood:</Text>
                                <Text style={styles.medValue}>{medicalInfo.bloodType || '--'}</Text>
                            </View>
                            <View style={styles.medRow}>
                                <Text style={styles.medLabel}>Allergies:</Text>
                                <Text style={styles.medValue}>{medicalInfo.allergies || 'None'}</Text>
                            </View>
                            <View style={styles.medRow}>
                                <Text style={styles.medLabel}>Conditions:</Text>
                                <Text style={styles.medValue}>{medicalInfo.conditions || 'None'}</Text>
                            </View>
                            {medicalInfo.medications ? (
                                <View style={styles.medRowBlock}>
                                    <Text style={styles.medLabel}>Notes:</Text>
                                    <Text style={styles.medValue}>{medicalInfo.medications}</Text>
                                </View>
                            ) : null}
                        </View>
                    )}
                </View>

                {/* 4. Emergency Contacts */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Emergency Contacts</Text>
                        <TouchableOpacity style={styles.addButton} onPress={() => setIsAddingContact(!isAddingContact)}>
                            <Text style={styles.addButtonText}>{isAddingContact ? 'Cancel' : '+ Add'}</Text>
                        </TouchableOpacity>
                    </View>

                    {isAddingContact && (
                        <View style={styles.addForm}>
                            <TextInput style={styles.input} placeholder="Name" value={newName} onChangeText={setNewName} />
                            <TextInput style={styles.input} placeholder="Phone" keyboardType="phone-pad" value={newPhone} onChangeText={setNewPhone} />
                            <TouchableOpacity style={styles.saveButton} onPress={addContact}>
                                <Text style={styles.saveButtonText}>Save Contact</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {contacts.map((contact) => (
                        <TouchableOpacity
                            key={contact.id}
                            style={styles.contactCard}
                            onPress={() => callContact(contact)}
                            onLongPress={() => deleteContact(contact.id)}
                        >
                            <View style={styles.contactIcon}><Text style={{ fontSize: 20 }}>👤</Text></View>
                            <View style={styles.contactInfo}>
                                <Text style={styles.contactName}>{contact.name}</Text>
                                <Text style={styles.contactPhone}>{contact.phone}</Text>
                            </View>
                            <Ionicons name="call" size={24} color="#10b981" />
                        </TouchableOpacity>
                    ))}

                    {contacts.length === 0 && !isAddingContact && (
                        <Text style={styles.emptyText}>No contacts. Add family to notify them.</Text>
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0369A1' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 10 },
    backButton: { flexDirection: 'row', alignItems: 'center', marginRight: 16 },
    backText: { color: '#FFF', fontSize: 16, fontWeight: '600', marginLeft: 4 },
    title: { fontSize: 24, fontWeight: '800', color: '#FFF' },
    content: { flex: 1, backgroundColor: '#F3F4F6', borderTopLeftRadius: 32, borderTopRightRadius: 32 },
    contentContainer: { padding: 20, paddingBottom: 50 },

    // Controls Row
    controlsRow: { flexDirection: 'row', gap: 16, marginBottom: 24 },
    controlCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 20, padding: 16, alignItems: 'center', justifyContent: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { height: 4, width: 0 } },
    controlActive: { backgroundColor: '#10b981' },
    sirenActive: { backgroundColor: '#dc2626' },
    controlTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937', marginBottom: 2 },
    controlSub: { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
    textWhite: { color: '#FFF' },
    textWhiteSub: { color: 'rgba(255,255,255,0.8)' },

    // SOS Button
    sosButton: { alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
    sosInner: { width: 160, height: 160, borderRadius: 80, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center', elevation: 12, borderWidth: 8, borderColor: '#fee2e2', shadowColor: '#dc2626', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { height: 8, width: 0 } },
    sosText: { fontSize: 48, fontWeight: '900', color: '#FFF' },
    sosSub: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },

    // Medical ID
    medicalCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, marginBottom: 24, elevation: 2 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardTitle: { fontSize: 18, fontWeight: '800', color: '#1F2937' },
    editBtn: { color: '#0369A1', fontWeight: '700', fontSize: 14 },
    medicalForm: { gap: 12 },
    medInput: { backgroundColor: '#F9FAFB', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', fontSize: 16 },
    medicalDisplay: { gap: 12 },
    medRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingBottom: 8 },
    medRowBlock: { paddingTop: 4 },
    medLabel: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
    medValue: { fontSize: 15, fontWeight: '700', color: '#111827' },

    // Contacts
    section: { marginBottom: 24 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937' },
    addButton: { backgroundColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    addButtonText: { fontSize: 13, fontWeight: '600', color: '#374151' },
    addForm: { backgroundColor: '#FFF', padding: 16, borderRadius: 20, marginBottom: 16, gap: 12 },
    input: { backgroundColor: '#F9FAFB', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
    saveButton: { backgroundColor: '#10b981', padding: 14, borderRadius: 12, alignItems: 'center' },
    saveButtonText: { color: '#FFF', fontWeight: '700' },
    contactCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 16, marginBottom: 12, elevation: 2 },
    contactIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#d1fae5', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    contactInfo: { flex: 1 },
    contactName: { fontSize: 16, fontWeight: '700', color: '#111827' },
    contactPhone: { fontSize: 14, color: '#6B7280' },
    emptyText: { textAlign: 'center', color: '#9CA3AF', marginTop: 12 },

    // Countdown Overlay
    countdownOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(220, 38, 38, 0.98)', zIndex: 100, alignItems: 'center', justifyContent: 'center' },
    countdownTitle: { fontSize: 24, fontWeight: '800', color: '#FFF', marginBottom: 8 },
    countdownSub: { fontSize: 18, color: 'rgba(255,255,255,0.8)' },
    countdownNumber: { fontSize: 120, fontWeight: '900', color: '#FFF' },
    cancelButton: { backgroundColor: '#FFF', paddingHorizontal: 40, paddingVertical: 16, borderRadius: 30, marginTop: 40 },
    cancelButtonText: { fontSize: 20, fontWeight: '800', color: '#dc2626' },
});
