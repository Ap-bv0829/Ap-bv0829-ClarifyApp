import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    FlatList,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { analyzeConversationForPeople, isQueryAboutPerson } from '../services/aiMemoryService';
import {
    deleteMemory,
    getMemories,
    PersonMemory,
    saveMemory,
    searchMemories
} from '../services/memoryService';
import {
    requestSpeechPermission,
    speakText,
    startListening,
    stopListening,
    useSpeechRecognitionEvent,
} from '../services/speechService';

export default function Memories() {
    const router = useRouter();
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [fullTranscript, setFullTranscript] = useState('');
    const [statusText, setStatusText] = useState('Tap to start listening');
    const [memories, setMemories] = useState<PersonMemory[]>([]);
    const [showMemories, setShowMemories] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [lastSavedPerson, setLastSavedPerson] = useState('');

    const processingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load memories on mount
    useEffect(() => {
        loadMemories();
    }, []);

    const loadMemories = async () => {
        const loaded = await getMemories();
        setMemories(loaded);
    };

    // Handle speech recognition results
    useSpeechRecognitionEvent('result', (event) => {
        const text = event.results[0]?.transcript || '';
        setTranscript(text);

        if (event.isFinal && text.trim()) {
            handleFinalTranscript(text);
        }
    });

    useSpeechRecognitionEvent('error', (event) => {
        // Only stop for permission errors, ignore everything else in continuous mode
        if (event.error === 'not-allowed') {
            setIsListening(false);
            setStatusText('Microphone permission denied');
            return;
        }

        // All other errors (no-speech, network, etc.) — just keep listening
        console.log('Speech error (ignoring):', event.error);
    });

    useSpeechRecognitionEvent('end', () => {
        // If we're supposed to be listening, restart
        if (isListening) {
            console.log('Speech ended, restarting...');
            setTimeout(() => {
                if (isListening) {
                    startListening().catch(console.error);
                }
            }, 100);
        }
    });

    const handleFinalTranscript = async (text: string) => {
        // Add to full transcript
        const newFullTranscript = fullTranscript + ' ' + text;
        setFullTranscript(newFullTranscript);

        // Check if this is a query
        if (isQueryAboutPerson(text)) {
            await handleQuery(text);
            return;
        }

        // Debounce AI processing
        if (processingTimerRef.current) {
            clearTimeout(processingTimerRef.current);
        }

        processingTimerRef.current = setTimeout(async () => {
            await processTranscriptForPeople(newFullTranscript);
        }, 2000); // Wait 2 seconds after speech stops
    };

    const processTranscriptForPeople = async (text: string) => {
        if (isProcessing) return;

        setIsProcessing(true);
        setStatusText('🤖 Analyzing...');

        try {
            const personInfo = await analyzeConversationForPeople(text);

            if (personInfo && personInfo.name) {
                // Check if we already saved this person recently
                if (personInfo.name.toLowerCase() !== lastSavedPerson.toLowerCase()) {
                    await saveMemory('', text, personInfo.name, personInfo.relationship, personInfo.details);
                    await loadMemories();
                    setLastSavedPerson(personInfo.name);
                    setStatusText(`✅ Saved: ${personInfo.name}`);
                    speakText(`Got it! I'll remember ${personInfo.name}.`);

                    // Clear transcript after successful save
                    setFullTranscript('');

                    setTimeout(() => {
                        if (isListening) {
                            setStatusText('🎧 Listening...');
                        }
                    }, 2000);
                } else {
                    setStatusText('🎧 Listening...');
                }
            } else {
                setStatusText('🎧 Listening...');
            }
        } catch (error) {
            console.error('Error processing transcript:', error);
            setStatusText('🎧 Listening...');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleQuery = async (text: string) => {
        // Extract name from query
        const words = text.toLowerCase().split(' ');
        const whoIsIndex = words.indexOf('is');

        if (whoIsIndex >= 0 && whoIsIndex < words.length - 1) {
            const queriedName = words[whoIsIndex + 1];
            const results = await searchMemories(queriedName);

            if (results.length > 0) {
                const person = results[0];
                const response = `${person.name}${person.relationship ? `, ${person.relationship}` : ''}. ${person.details || person.transcript}`;
                setStatusText(`Found: ${person.name}`);
                speakText(response);

                setTimeout(() => {
                    if (isListening) {
                        setStatusText('🎧 Listening...');
                    }
                }, 3000);
            } else {
                setStatusText(`Don't know ${queriedName}`);
                speakText(`I don't have any memory of ${queriedName}.`);

                setTimeout(() => {
                    if (isListening) {
                        setStatusText('🎧 Listening...');
                    }
                }, 3000);
            }
        }
    };

    const handleStartListening = async () => {
        const granted = await requestSpeechPermission();
        if (!granted) {
            Alert.alert('Permission Needed', 'Please allow microphone access to use this feature.');
            return;
        }

        setIsListening(true);
        setTranscript('');
        setFullTranscript('');
        setLastSavedPerson('');
        setStatusText('🎧 Listening...');

        try {
            await startListening();
            speakText('I\'m listening. Tell me about people you know, or ask who someone is.');
        } catch (error) {
            console.error('Failed to start listening:', error);
            setStatusText('Speech recognition not available');
            setIsListening(false);
        }
    };

    const handleStopListening = async () => {
        await stopListening();
        setIsListening(false);
        setStatusText('Stopped. Tap to start listening');
        setTranscript('');
        setFullTranscript('');

        if (processingTimerRef.current) {
            clearTimeout(processingTimerRef.current);
        }
    };

    const handleDeleteMemory = (memory: PersonMemory) => {
        Alert.alert(
            'Delete Memory?',
            `Forget ${memory.name}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        await deleteMemory(memory.id);
                        loadMemories();
                    },
                },
            ]
        );
    };

    // Animation Ref
    const pulseAnim = useRef(new Animated.Value(1)).current;

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

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#1e3a8a" />
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Remember People</Text>
                <TouchableOpacity
                    style={styles.historyButton}
                    onPress={() => setShowMemories(!showMemories)}
                >
                    <Ionicons name={showMemories ? "close" : "list"} size={24} color="#1e3a8a" />
                </TouchableOpacity>
            </View>

            {/* Main Content Area */}
            <View style={styles.content}>

                {/* Status Indicator */}
                <View style={styles.statusSection}>
                    <Text style={styles.statusEmoji}>
                        {isProcessing ? '🤖' : isListening ? '👂' : 'Ready'}
                    </Text>
                    <Text style={styles.statusText}>{statusText}</Text>
                </View>

                {/* Microphone / Action Button */}
                <View style={styles.micContainer}>
                    {isListening ? (
                        <TouchableOpacity onPress={handleStopListening} activeOpacity={0.8}>
                            <Animated.View style={[styles.micCircle, styles.micActive, { transform: [{ scale: pulseAnim }] }]}>
                                <Ionicons name="mic" size={48} color="#FFF" />
                            </Animated.View>
                            <Text style={styles.micLabel}>Tap to Stop</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity onPress={handleStartListening} activeOpacity={0.8}>
                            <View style={[styles.micCircle, styles.micInactive]}>
                                <Ionicons name="mic-outline" size={48} color="#1e3a8a" />
                            </View>
                            <Text style={styles.micLabel}>Tap to Listen</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Transcript Bubble */}
                {transcript ? (
                    <View style={styles.transcriptBubble}>
                        <Text style={styles.transcriptText}>"{transcript}"</Text>
                    </View>
                ) : (
                    !showMemories && (
                        <View style={styles.tipsContainer}>
                            <Text style={styles.tipTitle}>Try saying:</Text>
                            <Text style={styles.tipText}>"This is Mark, he is my nephew."</Text>
                            <Text style={styles.tipText}>"Who is Mark?"</Text>
                        </View>
                    )
                )}

                {/* Memories Overlay/List */}
                {showMemories && (
                    <View style={styles.memoriesOverlay}>
                        <Text style={styles.overlayTitle}>Your Memories ({memories.length})</Text>
                        <FlatList
                            data={memories}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={styles.listContent}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={styles.memoryCard}
                                    onLongPress={() => handleDeleteMemory(item)}
                                >
                                    <View style={styles.avatarCircle}>
                                        <Text style={styles.avatarInitials}>{item.name.substring(0, 2).toUpperCase()}</Text>
                                    </View>
                                    <View style={styles.cardInfo}>
                                        <Text style={styles.cardName}>{item.name}</Text>
                                        <Text style={styles.cardRelation}>{item.relationship || 'Friend'}</Text>
                                        <Text style={styles.cardDetails} numberOfLines={2}>
                                            {item.details || item.transcript}
                                        </Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={
                                <View style={styles.emptyState}>
                                    <Text style={styles.emptyStateText}>No memories yet.</Text>
                                    <Text style={styles.emptyStateSub}>Start close to the microphone.</Text>
                                </View>
                            }
                        />
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F3F4F6' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: 10, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
    backButton: { flexDirection: 'row', alignItems: 'center' },
    backText: { fontSize: 16, fontWeight: '600', color: '#1e3a8a', marginLeft: 4 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
    historyButton: { padding: 8 },

    content: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingTop: 40, paddingBottom: 20 },

    statusSection: { alignItems: 'center', marginBottom: 20 },
    statusEmoji: { fontSize: 40, marginBottom: 8 },
    statusText: { fontSize: 16, fontWeight: '600', color: '#374151', paddingHorizontal: 40, textAlign: 'center' },

    micContainer: { alignItems: 'center', justifyContent: 'center', marginBottom: 40 },
    micCircle: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', elevation: 10, shadowColor: '#1e3a8a', shadowOpacity: 0.3, shadowRadius: 15, shadowOffset: { width: 0, height: 8 } },
    micActive: { backgroundColor: '#ef4444' }, // Red for recording
    micInactive: { backgroundColor: '#FFF', borderWidth: 4, borderColor: '#1e3a8a' },
    micLabel: { marginTop: 16, fontSize: 16, fontWeight: '600', color: '#6B7280' },

    transcriptBubble: { backgroundColor: '#FFF', padding: 20, borderRadius: 20, marginHorizontal: 24, maxWidth: '90%', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    transcriptText: { fontSize: 18, color: '#1F2937', fontStyle: 'italic', textAlign: 'center', lineHeight: 26 },

    tipsContainer: { alignItems: 'center', opacity: 0.6 },
    tipTitle: { fontSize: 14, fontWeight: '700', color: '#6B7280', marginBottom: 8 },
    tipText: { fontSize: 14, color: '#9CA3AF', marginBottom: 4 },

    // Memories Overlay
    memoriesOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, top: 100, backgroundColor: '#F3F4F6', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, elevation: 20 },
    overlayTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 16, marginLeft: 8 },
    listContent: { paddingBottom: 40 },
    memoryCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 20, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    avatarCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    avatarInitials: { fontSize: 18, fontWeight: '700', color: '#1e3a8a' },
    cardInfo: { flex: 1 },
    cardName: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
    cardRelation: { fontSize: 12, fontWeight: '600', color: '#10b981', marginBottom: 2 },
    cardDetails: { fontSize: 13, color: '#6B7280' },
    emptyState: { alignItems: 'center', marginTop: 40 },
    emptyStateText: { fontSize: 18, fontWeight: '600', color: '#9CA3AF' },
    emptyStateSub: { fontSize: 14, color: '#D1D5DB', marginTop: 8 },
});
