import { Audio } from 'expo-av';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { deleteMemory, getMemories, PersonMemory, saveMemory, searchMemories } from '../services/memoryService';

export default function Memories() {
    const router = useRouter();
    const [memories, setMemories] = useState<PersonMemory[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [recording, setRecording] = useState<Audio.Recording | null>(null);
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [isVoiceSearching, setIsVoiceSearching] = useState(false);
    const [voiceRecording, setVoiceRecording] = useState<Audio.Recording | null>(null);

    // Modal state for cross-platform input (Alert.prompt is iOS-only)
    const [showInputModal, setShowInputModal] = useState(false);
    const [pendingAudioUri, setPendingAudioUri] = useState<string | null>(null);
    const [personName, setPersonName] = useState('');
    const [personDetails, setPersonDetails] = useState('');

    // Load memories on mount
    useEffect(() => {
        loadMemories();
    }, []);

    // Cleanup sound on unmount
    useEffect(() => {
        return () => {
            if (sound) {
                sound.unloadAsync();
            }
        };
    }, [sound]);

    const loadMemories = async () => {
        const loaded = await getMemories();
        setMemories(loaded);
    };

    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        if (query.trim()) {
            const results = await searchMemories(query);
            setMemories(results);
        } else {
            loadMemories();
        }
    };

    // Voice query - tap to speak "Who is Mark?"
    const startVoiceSearch = async () => {
        try {
            const { status } = await Audio.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Required', 'Please enable microphone access.');
                return;
            }

            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            const { recording: newRecording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            setVoiceRecording(newRecording);
            setIsVoiceSearching(true);
        } catch (error) {
            console.error('Failed to start voice search:', error);
        }
    };

    const stopVoiceSearch = async () => {
        if (!voiceRecording) return;

        setIsVoiceSearching(false);
        try {
            await voiceRecording.stopAndUnloadAsync();
            setVoiceRecording(null);

            // Prompt for the query (simulating speech-to-text)
            Alert.prompt(
                '🎤 Voice Search',
                'What did you say? (e.g., "Who is Mark?")',
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Search',
                        onPress: (query: string | undefined) => {
                            if (query) {
                                // Extract the name from "Who is X?" pattern
                                const nameMatch = query.match(/who\s+is\s+(\w+)/i);
                                const searchTerm = nameMatch ? nameMatch[1] : query;
                                handleSearch(searchTerm);
                                setSearchQuery(searchTerm);
                            }
                        },
                    },
                ],
                'plain-text'
            );
        } catch (error) {
            console.error('Failed to stop voice search:', error);
        }
    };

    const startRecording = async () => {
        try {
            // Request permissions
            const { status } = await Audio.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Required', 'Please enable microphone access to record voice notes.');
                return;
            }

            // Configure audio mode
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            // Start recording
            const { recording: newRecording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            setRecording(newRecording);
            setIsRecording(true);
        } catch (error) {
            console.error('Failed to start recording:', error);
            Alert.alert('Error', 'Failed to start recording. Please try again.');
        }
    };

    const stopRecording = async () => {
        if (!recording) return;

        setIsRecording(false);

        try {
            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();
            setRecording(null);

            if (!uri) {
                throw new Error('No recording URI');
            }

            // Show the cross-platform input modal (Alert.prompt is iOS-only!)
            setPendingAudioUri(uri);
            setPersonName('');
            setPersonDetails('');
            setShowInputModal(true);
        } catch (error) {
            console.error('Failed to stop recording:', error);
            Alert.alert('Error', 'Failed to save recording. Please try again.');
        }
    };

    // Save memory from modal input (no AI needed - simpler and faster!)
    const saveMemoryFromModal = async () => {
        if (!personName.trim() || !pendingAudioUri) {
            Alert.alert('Name Required', 'Please enter the person\'s name.');
            return;
        }

        setShowInputModal(false);
        setIsProcessing(true);

        try {
            // Save the memory directly - no AI needed!
            await saveMemory(
                pendingAudioUri,
                personDetails || personName, // Use details as transcript, fallback to name
                personName.trim(),
                '', // relationship can be extracted from details
                personDetails.trim()
            );

            // Reload memories
            await loadMemories();

            Alert.alert('✅ Memory Saved!', `Remembered ${personName.trim()}`);
        } catch (error) {
            console.error('Error saving memory:', error);
            Alert.alert('Error', 'Failed to save memory. Please try again.');
        } finally {
            setIsProcessing(false);
            setPendingAudioUri(null);
            setPersonName('');
            setPersonDetails('');
        }
    };

    const cancelModal = () => {
        setShowInputModal(false);
        setPendingAudioUri(null);
        setPersonName('');
        setPersonDetails('');
    };

    const playMemory = async (memory: PersonMemory) => {
        try {
            // Stop any currently playing sound
            if (sound) {
                await sound.unloadAsync();
            }

            setPlayingId(memory.id);
            const { sound: newSound } = await Audio.Sound.createAsync(
                { uri: memory.audioUri },
                { shouldPlay: true }
            );
            setSound(newSound);

            // Reset playing state when done
            newSound.setOnPlaybackStatusUpdate((status) => {
                if (status.isLoaded && status.didJustFinish) {
                    setPlayingId(null);
                }
            });
        } catch (error) {
            console.error('Error playing memory:', error);
            setPlayingId(null);
            // If audio fails, just show the transcript
            Alert.alert(
                `🗣️ ${memory.name}`,
                `${memory.relationship ? `(${memory.relationship})\n\n` : ''}${memory.transcript}`
            );
        }
    };

    const handleDelete = (memory: PersonMemory) => {
        Alert.alert(
            'Delete Memory?',
            `Remove "${memory.name}" from your memories?`,
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

    const renderMemoryItem = ({ item }: { item: PersonMemory }) => (
        <TouchableOpacity
            style={styles.memoryCard}
            onPress={() => playMemory(item)}
            onLongPress={() => handleDelete(item)}
        >
            <View style={styles.memoryIcon}>
                <Text style={styles.memoryIconText}>
                    {playingId === item.id ? '🔊' : '👤'}
                </Text>
            </View>
            <View style={styles.memoryContent}>
                <Text style={styles.memoryName}>{item.name}</Text>
                {item.relationship ? (
                    <Text style={styles.memoryRelationship}>{item.relationship}</Text>
                ) : null}
                {item.details ? (
                    <Text style={styles.memoryDetails} numberOfLines={2}>{item.details}</Text>
                ) : null}
            </View>
            <Text style={styles.playIcon}>▶</Text>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.title}>People I Know</Text>
            </View>

            {/* Search Bar with Voice Button */}
            <View style={styles.searchContainer}>
                <TextInput
                    style={styles.searchInput}
                    placeholder='Ask "Who is...?" or search by name'
                    placeholderTextColor="#999"
                    value={searchQuery}
                    onChangeText={handleSearch}
                />
                <TouchableOpacity
                    style={[
                        styles.voiceSearchButton,
                        isVoiceSearching && styles.voiceSearchButtonActive,
                    ]}
                    onPress={isVoiceSearching ? stopVoiceSearch : startVoiceSearch}
                >
                    <Text style={styles.voiceSearchIcon}>
                        {isVoiceSearching ? '⏹️' : '🎤'}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Memory List */}
            <FlatList
                data={memories}
                keyExtractor={(item) => item.id}
                renderItem={renderMemoryItem}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>👥</Text>
                        <Text style={styles.emptyTitle}>No memories yet</Text>
                        <Text style={styles.emptySubtitle}>
                            Tap the green button to record your first memory
                        </Text>
                    </View>
                }
            />

            {/* Processing Overlay */}
            {isProcessing && (
                <View style={styles.processingOverlay}>
                    <View style={styles.processingCard}>
                        <ActivityIndicator size="large" color="#10b981" />
                        <Text style={styles.processingText}>Saving memory...</Text>
                    </View>
                </View>
            )}

            {/* Record Button */}
            <View style={styles.recordButtonContainer}>
                <TouchableOpacity
                    style={[
                        styles.recordButton,
                        isRecording && styles.recordButtonActive,
                    ]}
                    onPress={isRecording ? stopRecording : startRecording}
                    disabled={isProcessing}
                >
                    <Text style={styles.recordButtonIcon}>
                        {isRecording ? '⏹️' : '🎙️'}
                    </Text>
                    <Text style={styles.recordButtonText}>
                        {isRecording ? 'Stop Recording' : 'Record Memory'}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Input Modal (cross-platform - works on Android!) */}
            <Modal
                visible={showInputModal}
                transparent
                animationType="fade"
                onRequestClose={cancelModal}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>📝 Who is this?</Text>

                        <TextInput
                            style={styles.modalInput}
                            placeholder="Name (e.g., Mark)"
                            placeholderTextColor="#999"
                            value={personName}
                            onChangeText={setPersonName}
                            autoFocus
                        />

                        <TextInput
                            style={[styles.modalInput, styles.modalInputMultiline]}
                            placeholder="Details (e.g., nurse's son, likes basketball)"
                            placeholderTextColor="#999"
                            value={personDetails}
                            onChangeText={setPersonDetails}
                            multiline
                            numberOfLines={3}
                        />

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.modalCancelButton} onPress={cancelModal}>
                                <Text style={styles.modalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.modalSaveButton} onPress={saveMemoryFromModal}>
                                <Text style={styles.modalSaveText}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
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
        color: '#10b981',
        fontWeight: '600',
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#1A1A1A',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 16,
        gap: 10,
    },
    searchInput: {
        flex: 1,
        backgroundColor: '#F5F5F5',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: '#1A1A1A',
    },
    voiceSearchButton: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#10b981',
        justifyContent: 'center',
        alignItems: 'center',
    },
    voiceSearchButtonActive: {
        backgroundColor: '#ef4444',
    },
    voiceSearchIcon: {
        fontSize: 22,
    },
    listContent: {
        paddingHorizontal: 20,
        paddingBottom: 120,
    },
    memoryCard: {
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
    memoryIcon: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#E8FFF3',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    memoryIconText: {
        fontSize: 24,
    },
    memoryContent: {
        flex: 1,
    },
    memoryName: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1A1A1A',
        marginBottom: 2,
    },
    memoryRelationship: {
        fontSize: 14,
        color: '#10b981',
        fontWeight: '500',
        marginBottom: 4,
    },
    memoryDetails: {
        fontSize: 13,
        color: '#666',
        lineHeight: 18,
    },
    playIcon: {
        fontSize: 16,
        color: '#10b981',
        marginLeft: 8,
    },
    emptyState: {
        alignItems: 'center',
        paddingTop: 60,
    },
    emptyIcon: {
        fontSize: 64,
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1A1A1A',
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 15,
        color: '#666',
        textAlign: 'center',
        paddingHorizontal: 40,
    },
    processingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    processingCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 32,
        alignItems: 'center',
    },
    processingText: {
        marginTop: 16,
        fontSize: 16,
        color: '#1A1A1A',
        fontWeight: '600',
    },
    recordButtonContainer: {
        position: 'absolute',
        bottom: 30,
        left: 20,
        right: 20,
    },
    recordButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#10b981',
        borderRadius: 16,
        paddingVertical: 18,
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 8,
    },
    recordButtonActive: {
        backgroundColor: '#ef4444',
    },
    recordButtonIcon: {
        fontSize: 24,
        marginRight: 10,
    },
    recordButtonText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 24,
        width: '100%',
        maxWidth: 400,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#1A1A1A',
        textAlign: 'center',
        marginBottom: 20,
    },
    modalInput: {
        backgroundColor: '#F5F5F5',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: '#1A1A1A',
        marginBottom: 12,
    },
    modalInputMultiline: {
        minHeight: 80,
        textAlignVertical: 'top',
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
    modalCancelButton: {
        flex: 1,
        backgroundColor: '#F5F5F5',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    modalCancelText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#666',
    },
    modalSaveButton: {
        flex: 1,
        backgroundColor: '#10b981',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    modalSaveText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
});
