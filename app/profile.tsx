import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
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
import Animated, { FadeInUp } from 'react-native-reanimated';
import { moderateScale, scale, verticalScale } from '../utils/responsive';

const PROFILE_KEY = 'user_profile';

interface UserProfile {
    firstName: string;
    lastName: string;
    age: string;
    sex: string;
    bloodType: string;
    seniorId: string;
    philhealthId: string;
    contactNumber: string;
    address: string;
    emergencyContact: string;
    emergencyPhone: string;
    allergies: string;
    conditions: string;
}

const defaultProfile: UserProfile = {
    firstName: '', lastName: '', age: '', sex: '', bloodType: '',
    seniorId: '', philhealthId: '', contactNumber: '', address: '',
    emergencyContact: '', emergencyPhone: '', allergies: '', conditions: '',
};



// ── Styles defined FIRST so components below can reference them ──────────────
const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F9FAFB' },
    header: {
        paddingTop: verticalScale(48),
        paddingBottom: verticalScale(28),
        paddingHorizontal: scale(20),
        backgroundColor: '#F9FAFB',
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: verticalScale(24),
    },
    headerBtn: {
        width: scale(40),
        height: scale(40),
        borderRadius: 14,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: moderateScale(18),
        fontWeight: '700',
        color: '#1E293B',
        letterSpacing: 0.3,
    },
    avatarArea: { alignItems: 'center' },
    avatar: {
        width: scale(80),
        height: scale(80),
        borderRadius: scale(28),
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginBottom: verticalScale(12),
    },
    avatarText: {
        fontSize: moderateScale(28),
        fontWeight: '800',
        color: '#334155',
    },
    avatarName: {
        fontSize: moderateScale(20),
        fontWeight: '800',
        color: '#1E293B',
        letterSpacing: -0.3,
    },
    avatarPlaceholder: {
        fontSize: moderateScale(14),
        color: '#64748B',
        fontWeight: '600',
    },
    pillRow: { flexDirection: 'row', gap: scale(6), marginTop: verticalScale(8) },
    pill: {
        backgroundColor: '#F1F5F9',
        paddingHorizontal: scale(10),
        paddingVertical: verticalScale(3),
        borderRadius: 20,
    },
    pillText: { fontSize: moderateScale(14), fontWeight: '700', color: '#64748B' },
    body: { flex: 1 },
    bodyContent: { padding: scale(20), paddingTop: verticalScale(20) },
    editCta: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: scale(16),
        borderRadius: 16,
        marginBottom: verticalScale(20),
        gap: scale(10),
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    editCtaText: {
        flex: 1,
        fontSize: moderateScale(15),
        fontWeight: '600',
        color: '#334155',
    },
    saveBtnRow: { flexDirection: 'row', gap: scale(10), marginBottom: verticalScale(20) },
    saveBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: scale(8),
        backgroundColor: '#334155',
        paddingVertical: verticalScale(14),
        borderRadius: 14,
    },
    saveBtnText: { fontSize: moderateScale(15), fontWeight: '700', color: '#FFF' },
    cancelBtn: {
        paddingHorizontal: scale(20),
        paddingVertical: verticalScale(14),
        borderRadius: 14,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    cancelBtnText: { fontSize: moderateScale(14), fontWeight: '600', color: '#64748B' },
    logoutBtn: {
        marginTop: verticalScale(16),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: scale(8),
        paddingVertical: verticalScale(12),
    },
    logoutText: {
        fontSize: moderateScale(14),
        fontWeight: '700',
        color: '#EF4444',
    },
    sectionLabel: {
        fontSize: moderateScale(13),
        fontWeight: '800',
        color: '#94A3B8',
        letterSpacing: 1.2,
        marginBottom: verticalScale(8),
        marginLeft: scale(4),
        textTransform: 'uppercase',
    },
    card: {
        backgroundColor: '#FFF',
        borderRadius: 20,
        marginBottom: verticalScale(20),
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    field: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: scale(14),
        gap: scale(12),
        borderBottomWidth: 1,
        borderBottomColor: '#F8FAFC',
    },
    fieldIconWrap: {
        width: scale(32),
        height: scale(32),
        borderRadius: 10,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    fieldLabel: {
        fontSize: moderateScale(13),
        fontWeight: '700',
        color: '#94A3B8',
        marginBottom: verticalScale(2),
        letterSpacing: 0.3,
    },
    fieldValue: {
        fontSize: moderateScale(15),
        fontWeight: '600',
        color: '#1E293B',
    },
    fieldInput: {
        backgroundColor: '#F8FAFC',
        paddingHorizontal: scale(12),
        paddingVertical: verticalScale(10),
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        fontSize: moderateScale(14),
        color: '#1E293B',
        fontWeight: '500',
    },
});

// ── Isolated field — no re-renders while typing ───────────────────────────────
const ProfileField = React.memo(({
    label, value, icon, placeholder,
    keyboard = 'default', lines = false, isEditing, onUpdate,
}: {
    label: string;
    value: string;
    icon: string;
    placeholder: string;
    keyboard?: 'default' | 'phone-pad' | 'numeric';
    lines?: boolean;
    isEditing: boolean;
    onUpdate: (v: string) => void;
}) => {
    const ref = useRef<TextInput>(null);
    const localRef = useRef(value);

    // Reset internal ref when value changes (e.g. after load/cancel)
    useEffect(() => {
        localRef.current = value;
        if (isEditing && ref.current) {
            ref.current.setNativeProps({ text: value });
        }
    }, [value, isEditing]);

    return (
        <View style={styles.field}>
            <View style={styles.fieldIconWrap}>
                <Ionicons name={icon as any} size={16} color="#334155" />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{label}</Text>
                {isEditing ? (
                    <TextInput
                        ref={ref}
                        style={[
                            styles.fieldInput,
                            lines ? { height: 60, textAlignVertical: 'top' } : undefined,
                        ]}
                        defaultValue={value}
                        onChangeText={(t) => { localRef.current = t; }}
                        onEndEditing={() => onUpdate(localRef.current)}
                        placeholder={placeholder}
                        placeholderTextColor="#CBD5E1"
                        keyboardType={keyboard}
                        multiline={lines}
                        returnKeyType={lines ? 'default' : 'done'}
                    />
                ) : (
                    <Text style={styles.fieldValue}>{value || '—'}</Text>
                )}
            </View>
        </View>
    );
});

ProfileField.displayName = 'ProfileField';

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ProfileScreen() {
    const router = useRouter();
    const [profile, setProfile] = useState<UserProfile>(defaultProfile);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => { loadProfile(); }, []);

    const loadProfile = async () => {
        try {
            const data = await AsyncStorage.getItem(PROFILE_KEY);
            if (data) setProfile(JSON.parse(data));
        } catch (e) { console.error('Load profile error:', e); }
    };

    const saveProfile = async () => {
        try {
            setIsSaving(true);
            await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
            setIsEditing(false);
            Alert.alert('✓ Saved', 'Your profile has been updated.');
        } catch {
            Alert.alert('Error', 'Could not save profile.');
        } finally { setIsSaving(false); }
    };

    const update = useCallback((field: keyof UserProfile, value: string) => {
        setProfile(prev => ({ ...prev, [field]: value }));
    }, []);

    const initials = () => {
        const f = profile.firstName?.charAt(0) || '';
        const l = profile.lastName?.charAt(0) || '';
        return (f + l).toUpperCase() || '?';
    };

    const handleLogout = async () => {
        try {
            await AsyncStorage.removeItem('onboarding_done');
            Alert.alert('Logged out', 'You can sign in again later and your data will still be here.');
            router.replace('/onboarding');
        } catch {
            Alert.alert('Error', 'Could not log out. Please try again.');
        }
    };

    const F = (
        label: string,
        field: keyof UserProfile,
        icon: string,
        placeholder: string,
        keyboard: 'default' | 'phone-pad' | 'numeric' = 'default',
        lines = false,
    ) => (
        <ProfileField
            label={label}
            value={profile[field]}
            icon={icon}
            placeholder={placeholder}
            keyboard={keyboard}
            lines={lines}
            isEditing={isEditing}
            onUpdate={(v) => update(field, v)}
        />
    );

    const hasName = profile.firstName.trim().length > 0;



    const Content = (
        <>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
                        <View style={styles.headerBtn}>
                            <Ionicons name="arrow-back" size={20} color="#334155" />
                        </View>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Profile</Text>
                    <TouchableOpacity
                        onPress={isEditing ? saveProfile : () => setIsEditing(true)}
                        activeOpacity={0.7}
                        disabled={isSaving}
                    >
                        <View style={[styles.headerBtn, isEditing ? { backgroundColor: '#10B981' } : {}]}>
                            <Ionicons name={isEditing ? 'checkmark' : 'create-outline'} size={20} color={isEditing ? '#FFF' : '#334155'} />
                        </View>
                    </TouchableOpacity>
                </View>

                <View style={styles.avatarArea}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initials()}</Text>
                    </View>
                    {hasName ? (
                        <>
                            <Text style={styles.avatarName}>{profile.firstName} {profile.lastName}</Text>
                            <View style={styles.pillRow}>
                                {profile.age ? <View style={styles.pill}><Text style={styles.pillText}>{profile.age} yrs</Text></View> : null}
                                {profile.sex ? <View style={styles.pill}><Text style={styles.pillText}>{profile.sex}</Text></View> : null}
                                {profile.bloodType
                                    ? <View style={[styles.pill, { backgroundColor: 'rgba(220,38,38,0.2)' }]}>
                                        <Text style={[styles.pillText, { color: '#FEE2E2' }]}>{profile.bloodType}</Text>
                                    </View>
                                    : null}
                            </View>
                        </>
                    ) : (
                        <Text style={styles.avatarPlaceholder}>Tap Edit to set up your profile</Text>
                    )}
                </View>
            </View>

            {/* Body */}
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView
                    style={styles.body}
                    contentContainerStyle={styles.bodyContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Edit / Save CTA */}
                    {!isEditing ? (
                        <Animated.View entering={FadeInUp.duration(400)}>
                            <TouchableOpacity style={styles.editCta} onPress={() => setIsEditing(true)} activeOpacity={0.85}>
                                <Ionicons name="create-outline" size={18} color="#334155" />
                                <Text style={styles.editCtaText}>Edit Profile</Text>
                                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                            </TouchableOpacity>
                        </Animated.View>
                    ) : (
                        <Animated.View entering={FadeInUp.duration(400)} style={styles.saveBtnRow}>
                            <TouchableOpacity style={styles.saveBtn} onPress={saveProfile} activeOpacity={0.85} disabled={isSaving}>
                                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                                <Text style={styles.saveBtnText}>{isSaving ? 'Saving...' : 'Save Changes'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => { loadProfile(); setIsEditing(false); }} activeOpacity={0.85}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    )}

                    <Animated.View entering={FadeInUp.duration(400).delay(200)}>
                        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
                            <Ionicons name="log-out-outline" size={18} color="#DC2626" />
                            <Text style={styles.logoutText}>Log out</Text>
                        </TouchableOpacity>
                    </Animated.View>

                    {/* Personal */}
                    <Animated.View entering={FadeInUp.duration(400).delay(100)}>
                        <Text style={styles.sectionLabel}>PERSONAL</Text>
                        <View style={styles.card}>
                            {F('First Name', 'firstName', 'person-outline', 'Juan')}
                            {F('Last Name', 'lastName', 'person-outline', 'Dela Cruz')}
                            {F('Age', 'age', 'calendar-outline', '65', 'numeric')}
                            {F('Sex', 'sex', 'male-female-outline', 'Male / Female')}
                            {F('Phone', 'contactNumber', 'call-outline', '09XX XXX XXXX', 'phone-pad')}
                            {F('Address', 'address', 'location-outline', 'Brgy, City', 'default', true)}
                        </View>
                    </Animated.View>

                    {/* Medical */}
                    <Animated.View entering={FadeInUp.duration(400).delay(200)}>
                        <Text style={styles.sectionLabel}>MEDICAL</Text>
                        <View style={styles.card}>
                            {F('Blood Type', 'bloodType', 'water-outline', 'O+')}
                            {F('Allergies', 'allergies', 'alert-circle-outline', 'Penicillin, Aspirin...', 'default', true)}
                            {F('Conditions', 'conditions', 'fitness-outline', 'Diabetes, Hypertension...', 'default', true)}
                        </View>
                    </Animated.View>

                    {/* IDs */}
                    <Animated.View entering={FadeInUp.duration(400).delay(300)}>
                        <Text style={styles.sectionLabel}>GOVERNMENT IDs</Text>
                        <View style={styles.card}>
                            {F('Senior Citizen ID', 'seniorId', 'id-card-outline', 'SC-XXXXXXXXXX')}
                            {F('PhilHealth ID', 'philhealthId', 'shield-checkmark-outline', 'XX-XXXXXXXXX-X')}
                        </View>
                    </Animated.View>

                    {/* Emergency */}
                    <Animated.View entering={FadeInUp.duration(400).delay(400)}>
                        <Text style={styles.sectionLabel}>EMERGENCY CONTACT</Text>
                        <View style={styles.card}>
                            {F('Contact Person', 'emergencyContact', 'people-outline', 'Maria Dela Cruz')}
                            {F('Phone', 'emergencyPhone', 'call-outline', '09XX XXX XXXX', 'phone-pad')}
                        </View>
                    </Animated.View>

                    <View style={{ height: verticalScale(40) }} />
                </ScrollView>
            </KeyboardAvoidingView>
        </>
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.root}>
                {Content}
            </View>
        </SafeAreaView>
    );
}
