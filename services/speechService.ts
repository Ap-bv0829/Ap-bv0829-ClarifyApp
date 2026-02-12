import {
    ExpoSpeechRecognitionModule,
    useSpeechRecognitionEvent,
} from '@jamsch/expo-speech-recognition';
import * as Speech from 'expo-speech';

// Check if speech recognition is available
export async function checkSpeechRecognitionAvailable(): Promise<boolean> {
    try {
        const result = await ExpoSpeechRecognitionModule.getStateAsync();
        // result can be a string state or object with isRecognitionAvailable
        return typeof result === 'object' && 'isRecognitionAvailable' in result
            ? (result as any).isRecognitionAvailable
            : true; // Assume available if state is just a string
    } catch {
        return false;
    }
}

// Request microphone permission for speech recognition
export async function requestSpeechPermission(): Promise<boolean> {
    try {
        const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        return result.granted;
    } catch {
        return false;
    }
}

// Start listening for speech
export async function startListening(): Promise<void> {
    try {
        await ExpoSpeechRecognitionModule.start({
            lang: 'en-US',
            interimResults: true,
            maxAlternatives: 1,
            continuous: true, // Keep listening indefinitely
            requiresOnDeviceRecognition: false,
            addsPunctuation: true,
        });
    } catch (error) {
        console.error('Failed to start speech recognition:', error);
        throw error;
    }
}

// Stop listening
export async function stopListening(): Promise<void> {
    try {
        await ExpoSpeechRecognitionModule.stop();
    } catch (error) {
        console.error('Failed to stop speech recognition:', error);
    }
}

// Speak text aloud (text-to-speech)
export function speakText(text: string, onDone?: () => void): void {
    Speech.speak(text, {
        language: 'en-US',
        rate: 0.9, // Slightly slower for elders
        onDone,
    });
}

// Stop speaking
export function stopSpeaking(): void {
    Speech.stop();
}

// Extract person info from speech (patterns like "I'm Mark", "My name is Mark", "This is Mark")
export function extractPersonFromSpeech(transcript: string): {
    name: string | null;
    details: string;
} {
    const lowerTranscript = transcript.toLowerCase();

    // Common introduction patterns
    const patterns = [
        /(?:i'm|i am|my name is|this is|call me|they call me)\s+(\w+)/i,
        /(?:i'm|i am)\s+(\w+)/i,
        /^(\w+)(?:\s+here|\s+speaking)?$/i, // Just a name
    ];

    for (const pattern of patterns) {
        const match = transcript.match(pattern);
        if (match && match[1]) {
            const name = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
            // Get details (everything after the name)
            const nameIndex = lowerTranscript.indexOf(match[1].toLowerCase());
            const details = transcript.slice(nameIndex + match[1].length).trim();
            return {
                name,
                details: details || transcript,
            };
        }
    }

    return { name: null, details: transcript };
}

// Extract query from speech (patterns like "Who is Mark?")
export function extractQueryFromSpeech(transcript: string): string | null {
    const patterns = [
        /who\s+is\s+(\w+)/i,
        /tell\s+me\s+about\s+(\w+)/i,
        /do\s+you\s+know\s+(\w+)/i,
        /remember\s+(\w+)/i,
    ];

    for (const pattern of patterns) {
        const match = transcript.match(pattern);
        if (match && match[1]) {
            return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
        }
    }

    return null;
}

// Export the hook for use in components
export { useSpeechRecognitionEvent };

