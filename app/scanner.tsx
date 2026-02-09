import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { analyzeMedicineImage, MedicineAnalysis } from '../services/gemini';

// Configure notification handler (wrapped in try-catch for Expo Go SDK 53+ compatibility)
try {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
        }),
    });
} catch (e) {
    // Ignore errors in Expo Go - notifications won't work but app won't crash
    console.warn('Notification handler setup failed (expected in Expo Go):', e);
}

export default function Scanner() {
    const router = useRouter();
    const [permission, requestPermission] = useCameraPermissions();
    const [photo, setPhoto] = useState<string | null>(null);
    const [results, setResults] = useState<MedicineAnalysis | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const cameraRef = useRef<CameraView>(null);

    // Handle permission request
    if (!permission) {
        return <View style={styles.container} />;
    }

    if (!permission.granted) {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar barStyle="light-content" backgroundColor="#000000" />
                <View style={styles.permissionContainer}>
                    <Text style={styles.permissionText}>Camera permission is required</Text>
                    <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                        <Text style={styles.permissionButtonText}>Grant Permission</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    // Capture photo
    const takePhoto = async () => {
        if (cameraRef.current) {
            const result = await cameraRef.current.takePictureAsync({
                quality: 0.8,
            });
            if (result) {
                setPhoto(result.uri);
                setError(null);
            }
        }
    };

    // Retake photo
    const retakePhoto = () => {
        setPhoto(null);
        setResults(null);
        setError(null);
    };

    // Identify medicine using AI
    const identifyMedicine = async () => {
        if (!photo) return;

        setIsAnalyzing(true);
        setError(null);

        try {
            const analysis = await analyzeMedicineImage(photo);
            setResults(analysis);
        } catch (err) {
            console.error('Error analyzing medicine:', err);
            setError(err instanceof Error ? err.message : 'Failed to analyze medicine. Please try again.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Request notification permissions
    const requestNotificationPermissions = async () => {
        const { status } = await Notifications.requestPermissionsAsync();
        return status === 'granted';
    };

    // Set medicine reminder
    const setMedicineReminder = async () => {
        if (!results) return;

        try {
            const hasPermission = await requestNotificationPermissions();
            if (!hasPermission) {
                Alert.alert('Permission Required', 'Please enable notifications to set reminders.');
                return;
            }

            // Schedule notification 10 seconds from now (for testing)
            // NOTE: Expo Go doesn't support calendar-based repeating notifications
            // For production, you'd build a standalone app
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: '💊 Medicine Reminder',
                    body: `Don't forget to take ${results.medicineName}`,
                    sound: true,
                },
                trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                    seconds: 10, // Trigger in 10 seconds for testing
                },
            });

            Alert.alert(
                '✅ Reminder Set!',
                `Test reminder will appear in 10 seconds for ${results.medicineName}\n\nNote: Daily repeating reminders require a standalone build, not Expo Go.`,
                [{ text: 'OK' }]
            );
        } catch (err) {
            console.error('Error setting reminder:', err);
            // Check if this is the Expo Go SDK 53+ limitation
            const errorMessage = err instanceof Error ? err.message : String(err);
            if (errorMessage.includes('expo-notifications') || errorMessage.includes('removed from Expo Go')) {
                Alert.alert(
                    '⚠️ Reminders Unavailable',
                    'Android push notifications are not supported in Expo Go (SDK 53+).\n\nTo use reminders, please build a Development Build.\n\nSee: expo.dev/develop/development-builds',
                    [{ text: 'OK' }]
                );
            } else {
                Alert.alert('Error', 'Failed to set reminder. Please try again.');
            }
        }
    };

    // Format results for display
    const formatResults = (analysis: MedicineAnalysis): string => {
        return `**Medicine Name:**
${analysis.medicineName}

**Active Ingredients:**
${analysis.activeIngredients}

**Common Uses:**
${analysis.commonUses}

**Dosage:**
${analysis.dosage}

**Warnings:**
${analysis.warnings}`;
    };

    // Preview Mode - Show captured photo
    if (photo) {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar barStyle="light-content" backgroundColor="#000000" />

                {/* Back Button */}
                <TouchableOpacity onPress={() => router.back()} style={styles.backButtonOverlay}>
                    <Text style={styles.backTextOverlay}>← Back</Text>
                </TouchableOpacity>

                {/* Captured Photo */}
                <Image source={{ uri: photo }} style={styles.previewImage} />

                {/* Loading Overlay */}
                {isAnalyzing && (
                    <View style={styles.loadingOverlay}>
                        <View style={styles.loadingCard}>
                            <ActivityIndicator size="large" color="#4facfe" />
                            <Text style={styles.loadingText}>Analyzing medicine...</Text>
                        </View>
                    </View>
                )}

                {/* Error Display */}
                {error && !isAnalyzing && (
                    <View style={styles.resultsOverlay}>
                        <View style={styles.resultsCard}>
                            <Text style={styles.resultsTitle}>❌ Error</Text>
                            <Text style={styles.resultsText}>{error}</Text>
                            <TouchableOpacity style={styles.closeButton} onPress={() => setError(null)}>
                                <Text style={styles.closeButtonText}>Close</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Results Display */}
                {results && !isAnalyzing && !error && (
                    <View style={styles.resultsOverlay}>
                        <View style={styles.resultsCard}>
                            <Text style={styles.resultsTitle}>Analysis Results</Text>
                            <Text style={styles.resultsText}>{formatResults(results)}</Text>
                            <View style={styles.buttonRow}>
                                <TouchableOpacity style={styles.reminderButton} onPress={setMedicineReminder}>
                                    <Text style={styles.reminderButtonText}>⏰ Set Reminder</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.closeButton} onPress={() => setResults(null)}>
                                    <Text style={styles.closeButtonText}>Close</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}

                {/* Action Buttons */}
                {!results && !error && !isAnalyzing && (
                    <View style={styles.previewActions}>
                        <TouchableOpacity style={styles.actionButton} onPress={retakePhoto}>
                            <Text style={styles.actionButtonText}>🔄 Retake</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionButton} onPress={identifyMedicine}>
                            <Text style={styles.actionButtonText}>✅ Identify</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </SafeAreaView>
        );
    }

    // Camera Mode - Active camera view
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#000000" />

            {/* Back Button */}
            <TouchableOpacity onPress={() => router.back()} style={styles.backButtonOverlay}>
                <Text style={styles.backTextOverlay}>← Back</Text>
            </TouchableOpacity>

            {/* Camera View */}
            <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="back"
            >
                {/* Shutter Button */}
                <View style={styles.shutterContainer}>
                    <TouchableOpacity style={styles.shutterButton} onPress={takePhoto}>
                        <View style={styles.shutterButtonInner} />
                    </TouchableOpacity>
                </View>
            </CameraView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    permissionContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    permissionText: {
        fontSize: 18,
        color: '#FFFFFF',
        textAlign: 'center',
        marginBottom: 24,
    },
    permissionButton: {
        backgroundColor: '#4facfe',
        paddingHorizontal: 32,
        paddingVertical: 16,
        borderRadius: 8,
    },
    permissionButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    backButtonOverlay: {
        position: 'absolute',
        top: 50,
        left: 24,
        zIndex: 10,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
    },
    backTextOverlay: {
        fontSize: 16,
        color: '#FFFFFF',
        fontWeight: '600',
    },
    camera: {
        flex: 1,
    },
    shutterContainer: {
        position: 'absolute',
        bottom: 40,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    shutterButton: {
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
        borderColor: 'rgba(255, 255, 255, 0.5)',
    },
    shutterButtonInner: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#FFFFFF',
    },
    previewImage: {
        flex: 1,
        width: '100%',
        resizeMode: 'cover',
    },
    loadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingCard: {
        alignItems: 'center',
    },
    loadingText: {
        fontSize: 18,
        color: '#FFFFFF',
        marginTop: 16,
        fontWeight: '600',
    },
    previewActions: {
        position: 'absolute',
        bottom: 40,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingHorizontal: 24,
    },
    actionButton: {
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        paddingHorizontal: 32,
        paddingVertical: 16,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#FFFFFF',
        minWidth: 140,
    },
    actionButtonText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFFFFF',
        textAlign: 'center',
    },
    resultsOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    resultsCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 24,
        width: '100%',
        maxWidth: 400,
        maxHeight: '80%',
    },
    resultsTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: '#1A1A1A',
        marginBottom: 16,
        textAlign: 'center',
    },
    resultsText: {
        fontSize: 14,
        color: '#666666',
        lineHeight: 22,
        marginBottom: 24,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
    },
    reminderButton: {
        flex: 1,
        backgroundColor: '#10b981',
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    reminderButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    closeButton: {
        flex: 1,
        backgroundColor: '#4facfe',
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    closeButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
});
