import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
    Dimensions,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Animated, {
    FadeIn,
    FadeInUp,
    useSharedValue
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

const ONBOARDING_KEY = 'onboarding_done';

const slides = [
    {
        colors: ['#334155', '#475569'] as [string, string],
        title: 'Scan Your Medicine',
        subtitle: 'Point your camera at any prescription or medicine packaging. Our AI instantly identifies it and tells you what you need to know.',
        badge: 'AI-Powered',
        badgeColor: '#94A3B8',
    },
    {
        colors: ['#475569', '#334155'] as [string, string],
        title: 'Emergency SOS',
        subtitle: 'One tap sends your GPS location to your emergency contacts. Your Medical ID card is always ready for first responders.',
        badge: 'Always Ready',
        badgeColor: '#FCA5A5',
    },
    {
        colors: ['#334155', '#475569'] as [string, string],
        title: 'Track Medications',
        subtitle: 'Never miss a dose. Your medication history, daily schedule, and drug interaction alerts — all in one place.',
        badge: 'Stay Safe',
        badgeColor: '#6EE7B7',
    },
];

export default function OnboardingScreen() {
    const router = useRouter();
    const [current, setCurrent] = useState(0);
    const offsetX = useSharedValue(0);
    const slideRef = useRef(0);

    const handleNext = async () => {
        if (current < slides.length - 1) {
            setCurrent(current + 1);
            slideRef.current = current + 1;
        } else {
            await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
            router.replace('/(tabs)');
        }
    };

    const handleSkip = async () => {
        await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
        router.replace('/(tabs)');
    };

    const slide = slides[current];
    const isLast = current === slides.length - 1;



    return (
        <View style={styles.root}>
            <StatusBar barStyle="light-content" />
            <LinearGradient colors={slide.colors} style={styles.topHalf}>
                {/* Skip */}
                {!isLast && (
                    <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
                        <Text style={styles.skipText}>Skip</Text>
                    </TouchableOpacity>
                )}

                <Animated.View entering={FadeIn.duration(400)} key={`badge-${current}`} style={styles.badgeWrap}>
                    <View style={[styles.badge, { borderColor: slide.badgeColor }]}>
                        <Text style={[styles.badgeText, { color: slide.badgeColor }]}>{slide.badge}</Text>
                    </View>
                </Animated.View>
            </LinearGradient>

            {/* Bottom card */}
            <View style={styles.bottomCard}>
                <Animated.View entering={FadeInUp.duration(400)} key={`content-${current}`}>
                    <Text style={styles.title}>{slide.title}</Text>
                    <Text style={styles.subtitle}>{slide.subtitle}</Text>
                </Animated.View>

                {/* Dots */}
                <View style={styles.dots}>
                    {slides.map((_, i) => (
                        <View
                            key={i}
                            style={[
                                styles.dot,
                                i === current
                                    ? { width: 24, backgroundColor: '#334155' }
                                    : { width: 8, backgroundColor: '#CBD5E1' },
                            ]}
                        />
                    ))}
                </View>

                {/* CTA */}
                <TouchableOpacity onPress={handleNext} activeOpacity={0.85}>
                    <View style={styles.ctaBtn}>
                        <Text style={styles.ctaText}>
                            {isLast ? 'Get Started' : 'Next'}
                        </Text>
                    </View>
                </TouchableOpacity>

                {/* Step text */}
                <Text style={styles.stepText}>{current + 1} of {slides.length}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    topHalf: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
        minHeight: 300,
    },
    skipBtn: {
        position: 'absolute',
        top: 52,
        right: 24,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 20,
    },
    skipText: {
        color: '#FFF',
        fontWeight: '600',
        fontSize: 14,
    },
    badgeWrap: {
        marginBottom: 12,
    },
    badge: {
        borderWidth: 1.5,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 5,
        backgroundColor: 'rgba(15,23,42,0.15)',
    },
    badgeText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
    bottomCard: {
        backgroundColor: '#FFF',
        borderTopLeftRadius: 36,
        borderTopRightRadius: 36,
        padding: 32,
        paddingBottom: 48,
    },
    title: {
        fontSize: 26,
        fontWeight: '800',
        color: '#1E293B',
        letterSpacing: -0.5,
        marginBottom: 12,
    },
    subtitle: {
        fontSize: 15,
        color: '#64748B',
        lineHeight: 22,
        fontWeight: '400',
    },
    dots: {
        flexDirection: 'row',
        gap: 6,
        alignItems: 'center',
        marginVertical: 24,
    },
    dot: {
        height: 8,
        borderRadius: 4,
    },
    ctaBtn: {
        borderRadius: 18,
        paddingVertical: 16,
        alignItems: 'center',
        marginBottom: 16,
        backgroundColor: '#334155',
    },
    ctaText: {
        color: '#FFF',
        fontWeight: '800',
        fontSize: 16,
    },
    stepText: {
        textAlign: 'center',
        color: '#94A3B8',
        fontSize: 13,
        fontWeight: '500',
    },
});
