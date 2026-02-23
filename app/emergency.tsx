import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
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
import Animated, {
    FadeIn,
    FadeInDown,
    FadeInUp,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import {
    requestSpeechPermission,
    speakText,
    startListening,
    stopListening,
    useSpeechRecognitionEvent,
} from '../services/speechService';


const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

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

    // Animation Refs (old Animated API for speech recognition compat)
    const pulseAnim = useRef(new (require('react-native').Animated).Value(1)).current;
    const sirenAnim = useRef(new (require('react-native').Animated).Value(1)).current;
    const countdownTimerRef = useRef<any>(null);

    // Reanimated SOS heartbeat pulse (always active)
    const sosPulse = useSharedValue(1);
    useEffect(() => {
        sosPulse.value = withRepeat(
            withSequence(
                withTiming(1.06, { duration: 800 }),
                withTiming(1, { duration: 800 }),
                withTiming(1.03, { duration: 600 }),
                withTiming(1, { duration: 600 })
            ),
            -1,
            false
        );
    }, []);

    const sosPulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: sosPulse.value }],
    }));

    // SOS glow ring
    const sosGlow = useSharedValue(0.08);
    useEffect(() => {
        sosGlow.value = withRepeat(
            withSequence(
                withTiming(0.18, { duration: 1200 }),
                withTiming(0.08, { duration: 1200 })
            ),
            -1,
            true
        );
    }, []);

    const sosGlowStyle = useAnimatedStyle(() => ({
        opacity: sosGlow.value,
        transform: [{ scale: 1.25 }],
    }));

    useEffect(() => {
        loadData();
        checkSmsAvailability();
        checkPermissions();

        return () => {
            stopAutoDetection();
            stopSiren();
            if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
        };
    }, []);

    const checkPermissions = async () => {
        const locStatus = await Location.requestForegroundPermissionsAsync();
        if (locStatus.status !== 'granted') {
            console.log('Location permission denied');
        }
        const speechGranted = await requestSpeechPermission();
        if (!speechGranted) {
            console.log('Speech permission denied');
        }
    };

    // Pulse animation for listening state (old Animated API)
    const RNAnimated = require('react-native').Animated;
    useEffect(() => {
        if (isListening) {
            RNAnimated.loop(
                RNAnimated.sequence([
                    RNAnimated.timing(pulseAnim, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
                    RNAnimated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [isListening]);

    // Siren Animation
    useEffect(() => {
        if (isSirenActive) {
            RNAnimated.loop(
                RNAnimated.sequence([
                    RNAnimated.timing(sirenAnim, { toValue: 1.1, duration: 300, useNativeDriver: true }),
                    RNAnimated.timing(sirenAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
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
                if (isSirenActive) playSirenLoop();
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

        if (contacts.length > 0 && isSmsAvailable) {
            const phoneNumbers = contacts.map(c => c.phone);
            const message = `🆘 EMERGENCY: I need help! This is an automated alert from my MediMate app. Please call me or 911.${locationLink}`;
            try {
                const SMS = require('expo-sms');
                SMS.sendSMSAsync(phoneNumbers, message).catch((err: any) => console.error('SMS failed in background', err));
            } catch (error) {
                console.error('Failed to initiate SMS:', error);
            }
        }

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



    const Content = (
        <>
            {/* SOS Countdown Overlay */}
            {sosCountdown !== null && (
                <Animated.View entering={FadeIn.duration(300)} style={styles.countdownOverlay}>
                    <Ionicons name="warning" size={48} color="#FFF" style={{ marginBottom: 12 }} />
                    <Text style={styles.countdownTitle}>EMERGENCY DETECTED</Text>
                    <Text style={styles.countdownSub}>Calling 911 in</Text>
                    <Text style={styles.countdownNumber}>{sosCountdown}</Text>
                    <TouchableOpacity style={styles.cancelButton} onPress={cancelSOS}>
                        <Text style={styles.cancelButtonText}>CANCEL</Text>
                    </TouchableOpacity>
                </Animated.View>
            )}

            {/* Header */}
            <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <View style={styles.backBtnCircle}>
                        <Ionicons name="arrow-back" size={20} color="#FFF" />
                    </View>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.title}>Emergency SOS</Text>
                    <Text style={styles.headerSub}>Safety & Quick Response</Text>
                </View>
            </Animated.View>

            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                {/* 1. Auto-Detect & Siren Row */}
                <Animated.View entering={FadeInUp.duration(500).delay(200)} style={styles.controlsRow}>
                    <TouchableOpacity
                        style={[styles.controlCard, isListening && styles.controlActive]}
                        onPress={toggleAutoDetection}
                        activeOpacity={0.8}
                    >
                        <RNAnimated.View style={{ transform: [{ scale: pulseAnim }], marginBottom: 8 }}>
                            <View style={[styles.controlIconWrap, { backgroundColor: isListening ? 'rgba(255,255,255,0.2)' : '#FEE2E2' }]}>
                                <Ionicons name={isListening ? "mic" : "mic-off"} size={28} color={isListening ? "#FFF" : "#dc2626"} />
                            </View>
                        </RNAnimated.View>
                        <Text style={[styles.controlTitle, isListening && styles.textWhite]}>Auto-SOS</Text>
                        <Text style={[styles.controlSub, isListening && styles.textWhiteSub]}>{isListening ? "Listening..." : "Tap to enable"}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.controlCard, isSirenActive && styles.sirenActive]}
                        onPress={() => setIsSirenActive(!isSirenActive)}
                        activeOpacity={0.8}
                    >
                        <RNAnimated.View style={{ transform: [{ scale: sirenAnim }], marginBottom: 8 }}>
                            <View style={[styles.controlIconWrap, { backgroundColor: isSirenActive ? 'rgba(255,255,255,0.2)' : '#FEE2E2' }]}>
                                <Ionicons name="megaphone" size={28} color={isSirenActive ? "#FFF" : "#dc2626"} />
                            </View>
                        </RNAnimated.View>
                        <Text style={[styles.controlTitle, isSirenActive && styles.textWhite]}>Loud Siren</Text>
                        <Text style={[styles.controlSub, isSirenActive && styles.textWhiteSub]}>{isSirenActive ? "🔊 ACTIVE" : "Tap to play"}</Text>
                    </TouchableOpacity>
                </Animated.View>

                {/* 2. Big SOS Button with heartbeat pulse */}
                <Animated.View entering={FadeInUp.duration(600).delay(350)} style={styles.sosButtonWrap}>
                    <TouchableOpacity style={styles.sosButton} onPress={() => Linking.openURL('tel:911')} activeOpacity={0.85}>
                        <Animated.View style={[styles.sosGlowRing, sosGlowStyle]} />
                        <Animated.View style={[styles.sosInner, sosPulseStyle]}>
                            <Text style={styles.sosText}>SOS</Text>
                            <Text style={styles.sosSub}>CALL 911</Text>
                        </Animated.View>
                    </TouchableOpacity>
                    <Text style={styles.sosHint}>Tap to call emergency services</Text>
                </Animated.View>

                {/* 3. Medical ID Card */}
                <Animated.View entering={FadeInUp.duration(500).delay(450)} style={styles.medicalCard}>
                    <View style={styles.cardHeader}>
                        <View style={styles.headerTitleRow}>
                            <View style={styles.medIconWrap}>
                                <Ionicons name="medical" size={20} color="#dc2626" />
                            </View>
                            <Text style={styles.cardTitle}>Medical ID</Text>
                        </View>
                        <TouchableOpacity
                            style={styles.editBtnWrap}
                            onPress={isEditingMedical ? saveMedicalInfo : () => setIsEditingMedical(true)}
                        >
                            <Ionicons name={isEditingMedical ? "checkmark" : "create-outline"} size={16} color="#0369A1" />
                            <Text style={styles.editBtn}>{isEditingMedical ? 'Save' : 'Edit'}</Text>
                        </TouchableOpacity>
                    </View>

                    {isEditingMedical ? (
                        <View style={styles.medicalForm}>
                            <TextInput style={styles.medInput} placeholder="Full Name" placeholderTextColor="#94A3B8" value={medicalInfo.name} onChangeText={t => setMedicalInfo({ ...medicalInfo, name: t })} />
                            <TextInput style={styles.medInput} placeholder="Blood Type (e.g. A+)" placeholderTextColor="#94A3B8" value={medicalInfo.bloodType} onChangeText={t => setMedicalInfo({ ...medicalInfo, bloodType: t })} />
                            <TextInput style={styles.medInput} placeholder="Allergies (e.g. Penicillin)" placeholderTextColor="#94A3B8" value={medicalInfo.allergies} onChangeText={t => setMedicalInfo({ ...medicalInfo, allergies: t })} />
                            <TextInput style={styles.medInput} placeholder="Conditions (e.g. Diabetes)" placeholderTextColor="#94A3B8" value={medicalInfo.conditions} onChangeText={t => setMedicalInfo({ ...medicalInfo, conditions: t })} />
                            <TextInput style={[styles.medInput, { height: 70, textAlignVertical: 'top' }]} placeholder="Medications / Notes" placeholderTextColor="#94A3B8" multiline value={medicalInfo.medications} onChangeText={t => setMedicalInfo({ ...medicalInfo, medications: t })} />
                        </View>
                    ) : (
                        <View style={styles.medicalDisplay}>
                            <View style={styles.medRow}>
                                <View style={styles.medLabelWrap}>
                                    <Ionicons name="person-outline" size={14} color="#94A3B8" />
                                    <Text style={styles.medLabel}>Name</Text>
                                </View>
                                <Text style={styles.medValue}>{medicalInfo.name || '--'}</Text>
                            </View>
                            <View style={styles.medRow}>
                                <View style={styles.medLabelWrap}>
                                    <Ionicons name="water-outline" size={14} color="#94A3B8" />
                                    <Text style={styles.medLabel}>Blood Type</Text>
                                </View>
                                <Text style={[styles.medValue, medicalInfo.bloodType ? styles.bloodTypeBold : null]}>
                                    {medicalInfo.bloodType || '--'}
                                </Text>
                            </View>
                            <View style={styles.medRow}>
                                <View style={styles.medLabelWrap}>
                                    <Ionicons name="alert-circle-outline" size={14} color="#94A3B8" />
                                    <Text style={styles.medLabel}>Allergies</Text>
                                </View>
                                <Text style={styles.medValue}>{medicalInfo.allergies || 'None'}</Text>
                            </View>
                            <View style={styles.medRow}>
                                <View style={styles.medLabelWrap}>
                                    <Ionicons name="fitness-outline" size={14} color="#94A3B8" />
                                    <Text style={styles.medLabel}>Conditions</Text>
                                </View>
                                <Text style={styles.medValue}>{medicalInfo.conditions || 'None'}</Text>
                            </View>
                            {medicalInfo.medications ? (
                                <View style={styles.medRowBlock}>
                                    <View style={styles.medLabelWrap}>
                                        <Ionicons name="document-text-outline" size={14} color="#94A3B8" />
                                        <Text style={styles.medLabel}>Notes</Text>
                                    </View>
                                    <Text style={styles.medValue}>{medicalInfo.medications}</Text>
                                </View>
                            ) : null}
                        </View>
                    )}
                </Animated.View>

                {/* 4. Emergency Contacts */}
                <Animated.View entering={FadeInUp.duration(500).delay(550)} style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Ionicons name="people" size={20} color="#1F2937" />
                            <Text style={styles.sectionTitle}>Emergency Contacts</Text>
                        </View>
                        <TouchableOpacity style={styles.addButton} onPress={() => setIsAddingContact(!isAddingContact)}>
                            <Ionicons name={isAddingContact ? "close" : "add"} size={16} color={isAddingContact ? "#DC2626" : "#FFF"} />
                            <Text style={[styles.addButtonText, isAddingContact && { color: '#DC2626' }]}>
                                {isAddingContact ? 'Cancel' : 'Add'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {isAddingContact && (
                        <Animated.View entering={FadeInDown.duration(400)} style={styles.addForm}>
                            <TextInput style={styles.input} placeholder="Name" placeholderTextColor="#94A3B8" value={newName} onChangeText={setNewName} />
                            <TextInput style={styles.input} placeholder="Phone" placeholderTextColor="#94A3B8" keyboardType="phone-pad" value={newPhone} onChangeText={setNewPhone} />
                            <TouchableOpacity style={styles.saveButton} onPress={addContact} activeOpacity={0.8}>
                                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                                <Text style={styles.saveButtonText}>Save Contact</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    )}

                    {contacts.map((contact, index) => (
                        <Animated.View key={contact.id} entering={FadeInUp.duration(400).delay(index * 80)}>
                            <TouchableOpacity
                                style={styles.contactCard}
                                onPress={() => callContact(contact)}
                                onLongPress={() => deleteContact(contact.id)}
                                activeOpacity={0.85}
                            >
                                <View style={styles.contactIcon}>
                                    <Text style={styles.contactInitial}>
                                        {contact.name.charAt(0).toUpperCase()}
                                    </Text>
                                </View>
                                <View style={styles.contactInfo}>
                                    <Text style={styles.contactName}>{contact.name}</Text>
                                    <Text style={styles.contactPhone}>{contact.phone}</Text>
                                </View>
                                <View style={styles.callBtnCircle}>
                                    <Ionicons name="call" size={18} color="#FFF" />
                                </View>
                            </TouchableOpacity>
                        </Animated.View>
                    ))}

                    {contacts.length === 0 && !isAddingContact && (
                        <View style={styles.emptyContactState}>
                            <Ionicons name="people-outline" size={40} color="#CBD5E1" />
                            <Text style={styles.emptyText}>No contacts yet</Text>
                            <Text style={styles.emptySubText}>Add family members to notify them in emergencies</Text>
                        </View>
                    )}
                </Animated.View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </>
    );

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0369A1" />
            {Content}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFFFFF' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        paddingTop: 16,
        gap: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 0,
        shadowColor: '#000',
        shadowOpacity: 0.03,
        shadowRadius: 4,
        shadowOffset: { height: 1, width: 0 },
        elevation: 1,
    },
    backButton: {},
    backBtnCircle: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        color: '#0F172A',
        letterSpacing: -0.3,
    },
    headerSub: {
        fontSize: 13,
        fontWeight: '500',
        color: '#64748B',
        marginTop: 2,
    },
    content: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
    },
    contentContainer: { padding: 20, paddingBottom: 50 },

    // Controls Row
    controlsRow: { flexDirection: 'row', gap: 14, marginBottom: 40 },
    controlCard: {
        flex: 1,
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 0,
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { height: 1, width: 0 },
        elevation: 1,
    },
    controlActive: { backgroundColor: '#10b981', borderColor: '#10b981' },
    sirenActive: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
    controlIconWrap: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    controlTitle: { fontSize: 14, fontWeight: '700', color: '#1F2937', marginBottom: 4 },
    controlSub: { fontSize: 12, fontWeight: '500', color: '#9CA3AF' },
    textWhite: { color: '#FFF' },
    textWhiteSub: { color: 'rgba(255,255,255,0.8)' },

    // SOS Button
    sosButtonWrap: { alignItems: 'center', marginBottom: 32, marginTop: 8 },
    sosButton: { alignItems: 'center', justifyContent: 'center' },
    sosGlowRing: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'transparent',
        borderWidth: 6,
        borderColor: '#dc2626',
    },
    sosInner: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#dc2626',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 8,
        borderWidth: 0,
        shadowColor: '#dc2626',
        shadowOpacity: 0.3,
        shadowRadius: 12,
        shadowOffset: { height: 3, width: 0 },
    },
    sosText: { fontSize: 28, fontWeight: '800', color: '#FFF', letterSpacing: 1 },
    sosSub: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.85)', marginTop: 2 },
    sosHint: { fontSize: 13, color: '#64748B', marginTop: 20, fontWeight: '500' },

    // Medical ID
    medicalCard: {
        backgroundColor: '#FFF',
        borderRadius: 16,
        padding: 18,
        marginBottom: 24,
        borderWidth: 0,
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { height: 1, width: 0 },
        elevation: 1,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    medIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: '#FEE2E2',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
    editBtnWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 18,
    },
    editBtn: { color: '#0369A1', fontWeight: '600', fontSize: 12 },
    medicalForm: { gap: 12 },
    medInput: {
        backgroundColor: '#F8FAFC',
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        fontSize: 15,
        color: '#1F2937',
    },
    medicalDisplay: { gap: 0 },
    medRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        paddingVertical: 12,
    },
    medRowBlock: { paddingTop: 12 },
    medLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    medLabel: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
    medValue: { fontSize: 15, fontWeight: '700', color: '#111827' },
    bloodTypeBold: { color: '#DC2626', fontSize: 17, fontWeight: '800' },

    // Contacts
    section: { marginBottom: 24 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937' },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#0369A1',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
    },
    addButtonText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
    addForm: {
        backgroundColor: '#FFF',
        padding: 18,
        borderRadius: 22,
        marginBottom: 16,
        gap: 12,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { height: 2, width: 0 },
        elevation: 2,
    },
    input: {
        backgroundColor: '#F8FAFC',
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        fontSize: 15,
        color: '#1F2937',
    },
    saveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#10b981',
        padding: 14,
        borderRadius: 14,
    },
    saveButtonText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
    contactCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 14,
        borderRadius: 18,
        marginBottom: 10,
        elevation: 3,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { height: 2, width: 0 },
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    contactIcon: {
        width: 44,
        height: 44,
        borderRadius: 16,
        backgroundColor: '#0369A1',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    contactInitial: {
        fontSize: 18,
        fontWeight: '800',
        color: '#FFF',
    },
    contactInfo: { flex: 1 },
    contactName: { fontSize: 16, fontWeight: '700', color: '#111827' },
    contactPhone: { fontSize: 13, color: '#6B7280', marginTop: 2 },
    callBtnCircle: {
        width: 38,
        height: 38,
        borderRadius: 14,
        backgroundColor: '#10b981',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyContactState: {
        alignItems: 'center',
        paddingVertical: 32,
        gap: 6,
    },
    emptyText: { fontSize: 16, fontWeight: '600', color: '#94A3B8', marginTop: 8 },
    emptySubText: { fontSize: 13, color: '#CBD5E1', textAlign: 'center' },

    // Countdown Overlay
    countdownOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(220, 38, 38, 0.97)',
        zIndex: 100,
        alignItems: 'center',
        justifyContent: 'center',
    },
    countdownTitle: { fontSize: 22, fontWeight: '800', color: '#FFF', marginBottom: 4, letterSpacing: 1 },
    countdownSub: { fontSize: 18, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
    countdownNumber: { fontSize: 100, fontWeight: '900', color: '#FFF', letterSpacing: 4 },
    cancelButton: {
        backgroundColor: '#FFF',
        paddingHorizontal: 44,
        paddingVertical: 16,
        borderRadius: 100,
        marginTop: 32,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 12,
        shadowOffset: { height: 4, width: 0 },
        elevation: 4,
    },
    cancelButtonText: { fontSize: 18, fontWeight: '800', color: '#dc2626', letterSpacing: 0.5 },
});
