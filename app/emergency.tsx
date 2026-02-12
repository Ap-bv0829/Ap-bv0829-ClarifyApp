import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
// import * as SMS from 'expo-sms';
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
    speakText,
    startListening,
    stopListening,
    useSpeechRecognitionEvent,
} from '../services/speechService';

const CONTACTS_KEY = 'emergency_contacts';
const DISTRESS_KEYWORDS = ['help', 'emergency', 'call 911', 'accident', 'hurt', 'pain', 'ambulance'];

interface EmergencyContact {
    id: string;
    name: string;
    phone: string;
}

export default function Emergency() {
    const router = useRouter();
    const [contacts, setContacts] = useState<EmergencyContact[]>([]);
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');

    // Voice & Auto-SOS State
    const [isListening, setIsListening] = useState(false);
    const [sosCountdown, setSosCountdown] = useState<number | null>(null);
    const [isSmsAvailable, setIsSmsAvailable] = useState(false);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const countdownTimerRef = useRef<any>(null);

    useEffect(() => {
        loadContacts();
        checkSmsAvailability();

        // Cleanup on unmount
        return () => {
            stopAutoDetection();
            if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
        };
    }, []);

    // Pulse animation for listening state
    useEffect(() => {
        if (isListening) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.2,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [isListening]);

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

    const loadContacts = async () => {
        try {
            const data = await AsyncStorage.getItem(CONTACTS_KEY);
            if (data) {
                setContacts(JSON.parse(data));
            }
        } catch (error) {
            console.error('Error loading contacts:', error);
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

    // --- Voice Recognition Logic ---

    useSpeechRecognitionEvent('result', (event) => {
        if (!isListening || sosCountdown !== null) return;

        const transcript = event.results[0]?.transcript.toLowerCase() || '';
        console.log('Heard:', transcript);

        // Check for distress keywords
        const detectedKeyword = DISTRESS_KEYWORDS.find(keyword => transcript.includes(keyword));
        if (detectedKeyword) {
            console.log('Distress detected:', detectedKeyword);
            startSOSCountdown();
        }
    });

    useSpeechRecognitionEvent('error', (event) => {
        // Ignore errors in continuous mode to keep listening
        if (isListening && event.error !== 'not-allowed') {
            console.log('Speech error (ignoring):', event.error);
        } else if (event.error === 'not-allowed') {
            setIsListening(false);
            Alert.alert('Permission Denied', 'Microphone access is needed for auto-detection.');
        }
    });

    const toggleAutoDetection = async () => {
        if (isListening) {
            await stopAutoDetection();
        } else {
            await startAutoDetection();
        }
    };

    const startAutoDetection = async () => {
        try {
            await startListening();
            setIsListening(true);
            speakText('Emergency listening active. Say help or call 911 if you need assistance.');
        } catch (error) {
            console.error('Failed to start listening:', error);
            Alert.alert('Error', 'Could not start voice detection.');
        }
    };

    const stopAutoDetection = async () => {
        await stopListening();
        setIsListening(false);
    };

    // --- SOS Sequence Logic ---

    const startSOSCountdown = () => {
        if (sosCountdown !== null) return; // Already counting down

        stopAutoDetection(); // Stop listening during countdown
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
        speakText('Emergency call cancelled.');
        // Optional: restart listening automatically?
        // startAutoDetection();
    };

    const executeSOS = async () => {
        // 1. Send SMS to contacts
        if (contacts.length > 0 && isSmsAvailable) {
            const phoneNumbers = contacts.map(c => c.phone);
            const message = `🆘 EMERGENCY: I need help! This is an automated alert from my ClarifyApp. Please call me or 911.`;

            try {
                // Note: On most devices this opens the SMS app pre-filled
                const SMS = require('expo-sms');
                await SMS.sendSMSAsync(phoneNumbers, message);
            } catch (error) {
                console.error('Failed to send SMS:', error);
            }
        }

        // 2. Call 911 (User still needs to tap dial)
        Linking.openURL('tel:911');
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
        setIsAdding(false);
    };

    const deleteContact = (id: string) => {
        Alert.alert(
            'Remove Contact?',
            'Are you sure you want to remove this emergency contact?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => {
                        const filtered = contacts.filter(c => c.id !== id);
                        saveContacts(filtered);
                    },
                },
            ]
        );
    };

    const callContact = (contact: EmergencyContact) => {
        Linking.openURL(`tel:${contact.phone}`).catch(err => console.error('Error calling contact:', err));
    };

    const callEmergencyManual = () => {
        Alert.alert(
            '🚨 Call Emergency Services?',
            'This will dial 911.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Call 911', style: 'destructive', onPress: () => Linking.openURL('tel:911') },
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#dc2626" />

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
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Emergency Help</Text>
            </View>

            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>

                {/* Auto-Detect Switch */}
                <TouchableOpacity
                    style={[styles.autoDetectButton, isListening && styles.autoDetectActive]}
                    onPress={toggleAutoDetection}
                >
                    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                        <Text style={styles.autoDetectIcon}>{isListening ? '🎙️' : '🔇'}</Text>
                    </Animated.View>
                    <View style={styles.autoDetectTextContainer}>
                        <Text style={[styles.autoDetectTitle, isListening && styles.textWhite]}>
                            {isListening ? 'Listening for Help...' : 'Auto-Detect Off'}
                        </Text>
                        <Text style={[styles.autoDetectSub, isListening && styles.textWhiteSub]}>
                            {isListening ? 'Say "Help" or "Call 911"' : 'Tap to start voice monitoring'}
                        </Text>
                    </View>
                </TouchableOpacity>

                {/* Big SOS Button */}
                <TouchableOpacity style={styles.sosButton} onPress={callEmergencyManual}>
                    <Text style={styles.sosIcon}>🆘</Text>
                    <Text style={styles.sosText}>CALL 911</Text>
                </TouchableOpacity>

                {/* Contacts Section */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Emergency Contacts</Text>
                        <TouchableOpacity
                            style={styles.addButton}
                            onPress={() => setIsAdding(!isAdding)}
                        >
                            <Text style={styles.addButtonText}>
                                {isAdding ? '✕' : '+ Add'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Add Contact Form */}
                    {isAdding && (
                        <View style={styles.addForm}>
                            <TextInput
                                style={styles.input}
                                placeholder="Name (e.g., Son - David)"
                                placeholderTextColor="#999"
                                value={newName}
                                onChangeText={setNewName}
                            />
                            <TextInput
                                style={styles.input}
                                placeholder="Phone number"
                                placeholderTextColor="#999"
                                value={newPhone}
                                onChangeText={setNewPhone}
                                keyboardType="phone-pad"
                            />
                            <TouchableOpacity style={styles.saveButton} onPress={addContact}>
                                <Text style={styles.saveButtonText}>Save Contact</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Contact List */}
                    {contacts.length === 0 && !isAdding ? (
                        <View style={styles.emptyContacts}>
                            <Text style={styles.emptyText}>
                                No contacts saved.{'\n'}Add family to notify them in emergencies.
                            </Text>
                        </View>
                    ) : (
                        contacts.map((contact) => (
                            <TouchableOpacity
                                key={contact.id}
                                style={styles.contactCard}
                                onPress={() => callContact(contact)}
                                onLongPress={() => deleteContact(contact.id)}
                            >
                                <View style={styles.contactIcon}>
                                    <Text style={styles.contactIconText}>👤</Text>
                                </View>
                                <View style={styles.contactInfo}>
                                    <Text style={styles.contactName}>{contact.name}</Text>
                                    <Text style={styles.contactPhone}>{contact.phone}</Text>
                                </View>
                                <View style={styles.callIcon}>
                                    <Text style={styles.callIconText}>📞</Text>
                                </View>
                            </TouchableOpacity>
                        ))
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#dc2626',
    },
    countdownOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(220, 38, 38, 0.95)',
        zIndex: 100,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    countdownTitle: {
        fontSize: 28,
        fontWeight: '800',
        color: '#FFFFFF',
        marginBottom: 12,
        textAlign: 'center',
    },
    countdownSub: {
        fontSize: 18,
        color: '#FFFFFF',
        opacity: 0.9,
        marginBottom: 24,
    },
    countdownNumber: {
        fontSize: 120,
        fontWeight: '900',
        color: '#FFFFFF',
        marginBottom: 40,
    },
    cancelButton: {
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 48,
        paddingVertical: 20,
        borderRadius: 32,
        elevation: 10,
    },
    cancelButtonText: {
        fontSize: 24,
        fontWeight: '800',
        color: '#dc2626',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 12,
    },
    backButton: {
        paddingVertical: 8,
        paddingRight: 16,
    },
    backText: {
        fontSize: 16,
        color: '#FFFFFF',
        fontWeight: '600',
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    content: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    contentContainer: {
        padding: 20,
        paddingBottom: 40,
    },
    autoDetectButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
        borderWidth: 2,
        borderColor: '#E5E5E5',
    },
    autoDetectActive: {
        backgroundColor: '#10b981',
        borderColor: '#059669',
    },
    autoDetectIcon: {
        fontSize: 32,
        marginRight: 16,
    },
    autoDetectTextContainer: {
        flex: 1,
    },
    autoDetectTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1A1A1A',
    },
    autoDetectSub: {
        fontSize: 13,
        color: '#666',
    },
    textWhite: {
        color: '#FFFFFF',
    },
    textWhiteSub: {
        color: 'rgba(255, 255, 255, 0.9)',
    },
    sosButton: {
        backgroundColor: '#dc2626',
        borderRadius: 24,
        paddingVertical: 40,
        alignItems: 'center',
        marginBottom: 32,
        elevation: 8,
        shadowColor: '#dc2626',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
    },
    sosIcon: {
        fontSize: 56,
        marginBottom: 8,
    },
    sosText: {
        fontSize: 32,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 2,
    },
    section: {
        marginBottom: 24,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1A1A1A',
    },
    addButton: {
        backgroundColor: '#F5F5F5',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
    },
    addButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
    },
    addForm: {
        backgroundColor: '#F9F9F9',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    input: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: '#1A1A1A',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E5E5E5',
    },
    saveButton: {
        backgroundColor: '#10b981',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    saveButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    emptyContacts: {
        padding: 24,
        alignItems: 'center',
        backgroundColor: '#F9F9F9',
        borderRadius: 16,
    },
    emptyText: {
        textAlign: 'center',
        color: '#999',
        fontSize: 15,
        lineHeight: 22,
    },
    contactCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    contactIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#FEE2E2',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    contactIconText: {
        fontSize: 24,
    },
    contactInfo: {
        flex: 1,
    },
    contactName: {
        fontSize: 17,
        fontWeight: '700',
        color: '#1A1A1A',
        marginBottom: 2,
    },
    contactPhone: {
        fontSize: 14,
        color: '#666',
    },
    callIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#10b981',
        justifyContent: 'center',
        alignItems: 'center',
    },
    callIconText: {
        fontSize: 20,
    },
});
