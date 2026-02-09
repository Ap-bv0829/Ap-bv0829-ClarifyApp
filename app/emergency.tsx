import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Alert, Linking, SafeAreaView, ScrollView, StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

const CONTACTS_KEY = 'emergency_contacts';

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

    useEffect(() => {
        loadContacts();
    }, []);

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
        const phoneUrl = `tel:${contact.phone}`;
        Linking.canOpenURL(phoneUrl)
            .then((supported) => {
                if (supported) {
                    Linking.openURL(phoneUrl);
                } else {
                    Alert.alert('Cannot Call', 'Phone calls are not supported on this device.');
                }
            })
            .catch((err) => console.error('Error making call:', err));
    };

    const callEmergency = () => {
        Alert.alert(
            '🚨 Call Emergency Services?',
            'This will dial 911 (or your local emergency number).',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Call 911',
                    style: 'destructive',
                    onPress: () => {
                        Linking.openURL('tel:911');
                    },
                },
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#dc2626" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Emergency Help</Text>
            </View>

            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                {/* Big SOS Button */}
                <TouchableOpacity style={styles.sosButton} onPress={callEmergency}>
                    <Text style={styles.sosIcon}>🆘</Text>
                    <Text style={styles.sosText}>CALL 911</Text>
                    <Text style={styles.sosSubtext}>Tap for emergency services</Text>
                </TouchableOpacity>

                {/* My Emergency Contacts */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>My Emergency Contacts</Text>
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
                                No emergency contacts yet.{'\n'}Tap "+ Add" to add family or caregivers.
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

                {/* Tips */}
                <View style={styles.tipsSection}>
                    <Text style={styles.tipsTitle}>💡 Tips</Text>
                    <Text style={styles.tipText}>• Tap a contact to call them instantly</Text>
                    <Text style={styles.tipText}>• Long-press a contact to remove it</Text>
                    <Text style={styles.tipText}>• Add family members and caregivers</Text>
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
    sosButton: {
        backgroundColor: '#dc2626',
        borderRadius: 24,
        paddingVertical: 40,
        alignItems: 'center',
        marginBottom: 24,
        shadowColor: '#dc2626',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 12,
    },
    sosIcon: {
        fontSize: 64,
        marginBottom: 12,
    },
    sosText: {
        fontSize: 32,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 2,
    },
    sosSubtext: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.8)',
        marginTop: 8,
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
        backgroundColor: '#F9F9F9',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 15,
        color: '#666',
        textAlign: 'center',
        lineHeight: 22,
    },
    contactCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    contactIcon: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#FEE2E2',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    contactIconText: {
        fontSize: 24,
    },
    contactInfo: {
        flex: 1,
    },
    contactName: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1A1A1A',
        marginBottom: 4,
    },
    contactPhone: {
        fontSize: 14,
        color: '#666',
    },
    callIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#10b981',
        justifyContent: 'center',
        alignItems: 'center',
    },
    callIconText: {
        fontSize: 20,
    },
    tipsSection: {
        backgroundColor: '#FEF3C7',
        borderRadius: 16,
        padding: 16,
    },
    tipsTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#92400E',
        marginBottom: 12,
    },
    tipText: {
        fontSize: 14,
        color: '#92400E',
        lineHeight: 22,
    },
});
