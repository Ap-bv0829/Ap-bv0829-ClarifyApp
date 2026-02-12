import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
    FlatList,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
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

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Remember People</Text>
                <TouchableOpacity
                    style={styles.listButton}
                    onPress={() => setShowMemories(!showMemories)}
                >
                    <Text style={styles.listButtonText}>
                        {showMemories ? '✕' : `📋 ${memories.length}`}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Memories List (when toggled) */}
            {showMemories && (
                <View style={styles.memoriesPanel}>
                    <FlatList
                        data={memories}
                        keyExtractor={(item) => item.id}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={styles.memoryItem}
                                onLongPress={() => handleDeleteMemory(item)}
                            >
                                <Text style={styles.memoryName}>{item.name}</Text>
                                <Text style={styles.memoryDetails} numberOfLines={1}>
                                    {item.relationship && `${item.relationship} • `}
                                    {item.details || item.transcript}
                                </Text>
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={
                            <Text style={styles.emptyText}>No memories yet</Text>
                        }
                    />
                </View>
            )}

            {/* Main Content */}
            <View style={styles.mainContent}>
                {/* Status Display */}
                <View style={styles.statusContainer}>
                    <Text style={styles.statusIcon}>
                        {isProcessing ? '🤖' : isListening ? '🎧' : '👂'}
                    </Text>
                    <Text style={styles.statusText}>{statusText}</Text>

                    {/* Live Transcript */}
                    {transcript && isListening && (
                        <View style={styles.transcriptBox}>
                            <ScrollView style={styles.transcriptScroll}>
                                <Text style={styles.transcriptText}>"{transcript}"</Text>
                            </ScrollView>
                        </View>
                    )}

                    {/* Instructions */}
                    {!isListening && (
                        <View style={styles.instructionsBox}>
                            <Text style={styles.instructionTitle}>How it works:</Text>
                            <Text style={styles.instructionText}>
                                • Tap START to begin listening{'\n'}
                                • Talk naturally about people{'\n'}
                                • AI auto-saves their info{'\n'}
                                • Ask "Who is [name]?" anytime
                            </Text>
                        </View>
                    )}
                </View>

                {/* Big Button */}
                <View style={styles.buttonsContainer}>
                    {isListening ? (
                        <TouchableOpacity
                            style={styles.stopButton}
                            onPress={handleStopListening}
                        >
                            <Text style={styles.bigButtonIcon}>⏹️</Text>
                            <Text style={styles.bigButtonText}>STOP LISTENING</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={styles.startButton}
                            onPress={handleStartListening}
                        >
                            <Text style={styles.bigButtonIcon}>🎤</Text>
                            <Text style={styles.bigButtonText}>START LISTENING</Text>
                            <Text style={styles.bigButtonHint}>Continuous open mic</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 12,
    },
    backButton: {
        paddingVertical: 8,
    },
    backText: {
        fontSize: 16,
        color: '#10b981',
        fontWeight: '600',
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1A1A1A',
    },
    listButton: {
        backgroundColor: '#F5F5F5',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    listButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
    },
    memoriesPanel: {
        maxHeight: 200,
        backgroundColor: '#F9F9F9',
        marginHorizontal: 20,
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
    },
    memoryItem: {
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E5E5',
    },
    memoryName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1A1A1A',
    },
    memoryDetails: {
        fontSize: 14,
        color: '#666',
        marginTop: 2,
    },
    emptyText: {
        fontSize: 14,
        color: '#999',
        textAlign: 'center',
        paddingVertical: 20,
    },
    mainContent: {
        flex: 1,
        justifyContent: 'space-between',
        padding: 20,
    },
    statusContainer: {
        alignItems: 'center',
        paddingVertical: 20,
    },
    statusIcon: {
        fontSize: 80,
        marginBottom: 20,
    },
    statusText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#1A1A1A',
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    transcriptBox: {
        marginTop: 20,
        backgroundColor: '#F5F5F5',
        borderRadius: 12,
        padding: 16,
        width: '100%',
        maxHeight: 150,
    },
    transcriptScroll: {
        maxHeight: 120,
    },
    transcriptText: {
        fontSize: 16,
        color: '#666',
        fontStyle: 'italic',
        lineHeight: 24,
    },
    instructionsBox: {
        marginTop: 30,
        backgroundColor: '#F0F9FF',
        borderRadius: 12,
        padding: 20,
        width: '100%',
    },
    instructionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1A1A1A',
        marginBottom: 12,
    },
    instructionText: {
        fontSize: 14,
        color: '#666',
        lineHeight: 22,
    },
    buttonsContainer: {
        paddingBottom: 20,
    },
    startButton: {
        backgroundColor: '#10b981',
        borderRadius: 24,
        paddingVertical: 32,
        alignItems: 'center',
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 8,
    },
    stopButton: {
        backgroundColor: '#ef4444',
        borderRadius: 24,
        paddingVertical: 32,
        alignItems: 'center',
        shadowColor: '#ef4444',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 8,
    },
    bigButtonIcon: {
        fontSize: 48,
        marginBottom: 8,
    },
    bigButtonText: {
        fontSize: 24,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 1,
    },
    bigButtonHint: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.8)',
        marginTop: 4,
    },
});
