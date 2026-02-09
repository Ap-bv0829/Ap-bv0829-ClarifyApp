import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { translateTagalogToEnglish } from '../services/translator';

export default function Translator() {
    const router = useRouter();
    const [tagalogText, setTagalogText] = useState('');
    const [englishTranslation, setEnglishTranslation] = useState('');
    const [isTranslating, setIsTranslating] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);

    // Translate function
    const handleTranslate = async () => {
        if (!tagalogText.trim()) {
            Alert.alert('Please Enter Text', 'Type or speak some Tagalog text to translate.');
            return;
        }

        setIsTranslating(true);
        setEnglishTranslation('');

        try {
            const translation = await translateTagalogToEnglish(tagalogText);
            setEnglishTranslation(translation);

            // Auto-speak the translation
            Speech.speak(translation, {
                language: 'en-US',
                pitch: 1.0,
                rate: 0.9, // Slightly slower for clarity
            });
        } catch (error) {
            console.error('Translation error:', error);
            Alert.alert('Translation Failed', 'Could not translate. Please try again.');
        } finally {
            setIsTranslating(false);
        }
    };

    // Speak the translation again
    const handleSpeak = () => {
        if (!englishTranslation) return;

        setIsSpeaking(true);
        Speech.speak(englishTranslation, {
            language: 'en-US',
            pitch: 1.0,
            rate: 0.9,
            onDone: () => setIsSpeaking(false),
            onStopped: () => setIsSpeaking(false),
            onError: () => setIsSpeaking(false),
        });
    };

    // Clear everything
    const handleClear = () => {
        setTagalogText('');
        setEnglishTranslation('');
        Speech.stop();
        setIsSpeaking(false);
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#43e97b" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Voice Translator</Text>
                <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
                    <Ionicons name="refresh" size={24} color="#FFFFFF" />
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView
                style={styles.content}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    {/* Instructions */}
                    <View style={styles.instructionCard}>
                        <Ionicons name="information-circle" size={24} color="#43e97b" />
                        <Text style={styles.instructionText}>
                            Type Tagalog text below and tap Translate
                        </Text>
                    </View>

                    {/* Tagalog Input */}
                    <View style={styles.inputSection}>
                        <Text style={styles.sectionLabel}>🇵🇭 Tagalog / Filipino</Text>
                        <TextInput
                            style={styles.textInput}
                            placeholder="Type here... (e.g. Kumusta ka?)"
                            placeholderTextColor="#999"
                            value={tagalogText}
                            onChangeText={setTagalogText}
                            multiline
                            numberOfLines={4}
                            textAlignVertical="top"
                        />
                    </View>

                    {/* Big Green Translate Button */}
                    <TouchableOpacity
                        style={[styles.translateButton, isTranslating && styles.translateButtonDisabled]}
                        onPress={handleTranslate}
                        disabled={isTranslating}
                    >
                        {isTranslating ? (
                            <>
                                <ActivityIndicator size="large" color="#FFFFFF" />
                                <Text style={styles.translateButtonText}>Translating...</Text>
                            </>
                        ) : (
                            <>
                                <Ionicons name="language" size={32} color="#FFFFFF" />
                                <Text style={styles.translateButtonText}>Translate to English</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    {/* English Translation Result */}
                    {englishTranslation && (
                        <View style={styles.resultSection}>
                            <View style={styles.resultHeader}>
                                <Text style={styles.sectionLabel}>🇺🇸 English Translation</Text>
                                <TouchableOpacity
                                    onPress={handleSpeak}
                                    style={styles.speakButton}
                                    disabled={isSpeaking}
                                >
                                    <Ionicons
                                        name={isSpeaking ? "volume-high" : "volume-medium"}
                                        size={28}
                                        color="#43e97b"
                                    />
                                </TouchableOpacity>
                            </View>
                            <View style={styles.translationBox}>
                                <Text style={styles.translationText}>{englishTranslation}</Text>
                            </View>
                        </View>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F5F5F5',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
        backgroundColor: '#43e97b',
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    clearButton: {
        padding: 8,
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        gap: 20,
    },
    instructionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E8F8F0',
        padding: 16,
        borderRadius: 12,
        gap: 12,
    },
    instructionText: {
        flex: 1,
        fontSize: 14,
        color: '#2D7A5E',
        fontWeight: '500',
    },
    inputSection: {
        gap: 12,
    },
    sectionLabel: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1A1A1A',
    },
    textInput: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        fontSize: 18,
        color: '#1A1A1A',
        minHeight: 120,
        borderWidth: 2,
        borderColor: '#E0E0E0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    translateButton: {
        backgroundColor: '#43e97b',
        paddingVertical: 24,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        shadowColor: '#43e97b',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
    },
    translateButtonDisabled: {
        backgroundColor: '#A8DFC0',
    },
    translateButtonText: {
        fontSize: 22,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    resultSection: {
        gap: 12,
    },
    resultHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    speakButton: {
        padding: 8,
    },
    translationBox: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 24,
        borderWidth: 2,
        borderColor: '#43e97b',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    translationText: {
        fontSize: 28,
        lineHeight: 40,
        color: '#1A1A1A',
        fontWeight: '600',
    },
});
