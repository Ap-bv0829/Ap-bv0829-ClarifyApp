import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TextInput,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { MedicineAnalysis, translateBatch, translateText } from '../services/gemini';
import { LANGUAGES, Language } from '../services/languages';
import { SavedScan } from '../services/storage';
import { updateMedicationInventory } from '../services/medicationStorage';
import { moderateScale, scale, verticalScale } from '../utils/responsive';

export default function MedicineDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const scan: SavedScan | null = params.scanData ? JSON.parse(params.scanData as string) : null;
  const meds: MedicineAnalysis[] = useMemo(
    () => (params.medicineData ? JSON.parse(params.medicineData as string) : []),
    [params.medicineData]
  );

  const [speakingField, setSpeakingField] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState<Language>(LANGUAGES[0]);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatedMeds, setTranslatedMeds] = useState<Record<number, { name: string; purpose: string; warnings: string }>>({});

  // Inventory State
  const [showInventorySheet, setShowInventorySheet] = useState(false);
  const [editingMedIndex, setEditingMedIndex] = useState<number | null>(null);
  const [inventoryInput, setInventoryInput] = useState('');
  const [doseInput, setDoseInput] = useState('');

  // Effect to handle batch translation when language changes
  useEffect(() => {
    if (meds.length === 0) return;
    if (selectedLang.geminiName === 'English') {
      setTranslatedMeds({});
      return;
    }

    let cancelled = false;
    const runTranslate = async () => {
      setIsTranslating(true);
      try {
        const translations = await translateBatch(meds, selectedLang.geminiName);
        if (!cancelled) {
          const map: Record<number, { name: string; purpose: string; warnings: string }> = {};
          translations.forEach((t, i) => { map[i] = t; });
          setTranslatedMeds(map);
        }
      } catch (err) {
        console.error('Translation error in details:', err);
      } finally {
        if (!cancelled) setIsTranslating(false);
      }
    };

    runTranslate();
    return () => { cancelled = true; };
  }, [selectedLang, meds]);

  if (!scan || meds.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#94A3B8" />
        <Text style={styles.emptyText}>No medicine data found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Helper for TTS
  const handleSpeak = async (text: string, fieldId: string, index?: number) => {
    try {
      if (speakingField === fieldId) {
        Speech.stop();
        setSpeakingField(null);
        return;
      }

      Speech.stop();
      setSpeakingField(fieldId);

      let toSpeak = text;
      // Use translated text if available for TTS
      if (index !== undefined && translatedMeds[index]) {
        if (fieldId.includes('purpose')) toSpeak = translatedMeds[index].purpose;
        if (fieldId.includes('warning')) toSpeak = translatedMeds[index].warnings;
        if (fieldId.includes('name')) toSpeak = translatedMeds[index].name;
      } else if (selectedLang.geminiName !== 'English') {
        toSpeak = await translateText(text, selectedLang.geminiName);
      }

      // Voice settings
      const ttsLang = ['fil-PH'].includes(selectedLang.code) ? 'en-US' : selectedLang.code;
      Speech.speak(toSpeak, {
        language: ttsLang,
        onDone: () => setSpeakingField(null),
        onError: () => setSpeakingField(null),
        rate: 0.9,
        pitch: 1.0
      });
    } catch (e) {
      console.warn('TTS Error:', e);
      setSpeakingField(null);
    }
  };

  const handleSetReminder = async (medicine: MedicineAnalysis) => {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const { status: newStatus } = await Notifications.requestPermissionsAsync();
      if (newStatus !== 'granted') {
        Alert.alert('Permission Required', 'Please enable notifications to set reminders.');
        return;
      }
    }

    Alert.alert(
      'Set Reminder',
      `Set a daily reminder for ${medicine.medicineName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Set for 8:00 AM', onPress: () => scheduleSimpleReminder(medicine.medicineName, 8, 0) },
        { text: 'Set for 8:00 PM', onPress: () => scheduleSimpleReminder(medicine.medicineName, 20, 0) },
      ]
    );
  };

  const scheduleSimpleReminder = async (name: string, hours: number, minutes: number) => {
    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setHours(hours, minutes, 0, 0);
    if (scheduledTime <= now) scheduledTime.setDate(scheduledTime.getDate() + 1);

    const secondsUntil = Math.floor((scheduledTime.getTime() - now.getTime()) / 1000);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Medicine Reminder',
        body: `It's time to take your ${name}`,
        data: { medicine: name },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsUntil,
      },
    });

    Alert.alert('Success', `Reminder set for ${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}.`);
  };

  const handleOpenInventory = (index: number) => {
    setEditingMedIndex(index);
    setInventoryInput('');
    setDoseInput('');
    setShowInventorySheet(true);
  };

  const handleSaveInventory = async () => {
    if (editingMedIndex === null) return;
    const med = meds[editingMedIndex];
    
    // Parse to number with fallback to empty if null/undefined
    const inventory = parseInt(inventoryInput, 10);
    let dailyDose = parseInt(doseInput, 10);
    
    if (isNaN(inventory) || inventory < 0) {
      Alert.alert('Invalid Input', 'Please enter a valid number for current pill count.');
      return;
    }
    
    if (isNaN(dailyDose) || dailyDose < 0) {
      dailyDose = 1; // Default to 1 if they didn't specify properly
    }
    
    try {
      await updateMedicationInventory(med.medicineName, inventory, dailyDose);
      Alert.alert('Success', 'Inventory tracked for ' + med.medicineName);
      setShowInventorySheet(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to update inventory.');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Modern Fixed Header */}
      <SafeAreaView style={styles.safeHeader}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Medicine Details</Text>

          <TouchableOpacity
            onPress={() => setShowLangPicker(true)}
            style={styles.langBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.langBtnText}>{selectedLang.label.split(' ')[0]}</Text>
            <Ionicons name="chevron-down" size={14} color="#0369A1" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Scan Preview Card */}
        <View style={styles.heroCard}>
          <Image source={{ uri: scan.imageUri }} style={styles.heroImage} />
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={styles.heroOverlay}>
            <Text style={styles.heroTimestamp}>Scanned on {new Date(scan.id).toLocaleDateString()}</Text>
          </LinearGradient>
        </View>

        {/* Translation Status Indicator */}
        {isTranslating && (
          <View style={styles.translatingBar}>
            <ActivityIndicator size="small" color="#0369A1" />
            <Text style={styles.translatingText}>Translating to {selectedLang.label.split(' ').slice(1).join(' ')}...</Text>
          </View>
        )}

        {meds.map((med, index) => {
          const tx = translatedMeds[index];
          const displayName = tx?.name || med.medicineName;
          const displayPurpose = tx?.purpose || med.commonUses;
          const displayWarnings = tx?.warnings || med.warnings;

          const displaySimpleInstructions = tx?.simpleInstructions || med.simpleInstructions;

          return (
            <View key={index} style={styles.medSection}>
              {/* Medicine Name Card */}
              <View style={styles.titleCard}>
                <View style={styles.iconContainer}>
                  <Ionicons name="medkit" size={28} color="#0369A1" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.medicineName}>{displayName}</Text>
                  {med.dosage && <Text style={styles.dosageLabel}>{med.dosage}</Text>}
                </View>
                <TouchableOpacity
                  onPress={() => handleSpeak(`${displayName}. ${displayPurpose}`, `name-${index}`, index)}
                  style={styles.ttsMainBtn}
                >
                  {speakingField === `name-${index}`
                    ? <ActivityIndicator size={20} color="#0369A1" />
                    : <Ionicons name="volume-medium" size={24} color="#0369A1" />}
                </TouchableOpacity>
              </View>

              {/* Patient Badge (if found in prescription) */}
              {(med.patientName || med.patientAge) && (
                <View style={styles.patientCard}>
                  <View style={styles.patientHeader}>
                    <Ionicons name="person-circle" size={20} color="#64748B" />
                    <Text style={styles.patientTitle}>PRESCRIBED TO</Text>
                  </View>
                  <Text style={styles.patientNameText}>{med.patientName || 'Patient Not Specified'}</Text>
                  <View style={styles.patientMetaRow}>
                    <Text style={styles.patientMeta}>{med.patientAge ? `${med.patientAge} years old` : ''}</Text>
                    {med.patientSex && <Text style={styles.patientMeta}> • {med.patientSex}</Text>}
                  </View>
                </View>
              )}

              {/* Detail Cards */}
              
              {/* How to Take (Simple Instructions) */}
              {displaySimpleInstructions && (
                <View style={[styles.infoCard, { borderColor: '#10B981', borderWidth: 2 }]}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="information-circle" size={24} color="#10B981" />
                    <Text style={[styles.cardTitle, { color: '#047857' }]}>How to Take</Text>
                    <TouchableOpacity
                      onPress={() => handleSpeak(displaySimpleInstructions, `instructions-${index}`, index)}
                      style={styles.ttsBtn}
                    >
                      {speakingField === `instructions-${index}`
                        ? <ActivityIndicator size={18} color="#10B981" />
                        : <Ionicons name="volume-medium" size={24} color="#10B981" />}
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.usageText, { fontWeight: '700', color: '#064E3B', fontSize: moderateScale(18) }]}>
                    {displaySimpleInstructions}
                  </Text>
                </View>
              )}

              <View style={styles.infoCard}>
                <View style={styles.cardHeader}>
                  <MaterialIcons name="description" size={24} color="#0369A1" />
                  <Text style={styles.cardTitle}>Purpose</Text>
                  <TouchableOpacity
                    onPress={() => handleSpeak(displayPurpose, `purpose-${index}`, index)}
                    style={styles.ttsBtn}
                  >
                    {speakingField === `purpose-${index}`
                      ? <ActivityIndicator size={18} color="#0369A1" />
                      : <Ionicons name="volume-medium" size={24} color="#0369A1" />}
                  </TouchableOpacity>
                </View>
                <Text style={styles.usageText}>{displayPurpose}</Text>
              </View>

              {/* Warning Card (Red) */}
              {displayWarnings && (
                <View style={[styles.infoCard, styles.warningCard]}>
                  <View style={styles.cardHeader}>
                    <MaterialIcons name="warning" size={24} color="#DC2626" />
                    <Text style={[styles.cardTitle, { color: '#DC2626' }]}>Safety Warnings</Text>
                    <TouchableOpacity
                      onPress={() => handleSpeak(displayWarnings, `warning-${index}`, index)}
                      style={styles.ttsBtn}
                    >
                      {speakingField === `warning-${index}`
                        ? <ActivityIndicator size={18} color="#DC2626" />
                        : <Ionicons name="volume-medium" size={24} color="#DC2626" />}
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.warningText}>
                    {Array.isArray(displayWarnings) ? displayWarnings.join('\n• ') : displayWarnings}
                  </Text>
                </View>
              )}

              {/* Schedule Card & Reminder Action */}
              <View style={styles.infoCard}>
                <View style={styles.cardHeader}>
                  <MaterialIcons name="schedule" size={24} color="#0369A1" />
                  <Text style={styles.cardTitle}>Recommended Schedule</Text>
                  <TouchableOpacity
                    onPress={() => handleSetReminder(med)}
                    style={styles.reminderSmallBtn}
                  >
                    <Ionicons name="alarm" size={22} color="#0EA5E9" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.usageText}>{med.recommendedTime || 'As specified by doctor'}</Text>
              </View>

              {/* Inventory Tracking Card */}
              <View style={[styles.infoCard, { borderColor: '#8B5CF6' }]}>
                <View style={[styles.cardHeader, { marginBottom: 16 }]}>
                  <MaterialIcons name="inventory" size={24} color="#8B5CF6" />
                  <Text style={[styles.cardTitle, { color: '#6D28D9' }]}>Virtual Pillbox</Text>
                  <TouchableOpacity
                    onPress={() => handleOpenInventory(index)}
                    style={{ backgroundColor: '#EDE9FE', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}
                  >
                    <Text style={{ color: '#6D28D9', fontWeight: '800', fontSize: moderateScale(12) }}>SET INVENTORY</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.usageText, { fontSize: moderateScale(14), color: '#4C1D95' }]}>
                  Track your physical supply and get "Low Stock" alerts to restock in time.
                </Text>
              </View>

              {/* Prescription Source Details */}
              {(med.prescribedBy || med.hospital) && (
                <View style={styles.rxDetailsCard}>
                  <Text style={styles.rxHeader}>PRESCRIPTION SOURCE</Text>
                  {med.prescribedBy && (
                    <View style={styles.rxRow}>
                      <Text style={styles.rxLabel}>Doctor</Text>
                      <Text style={styles.rxValue}>{med.prescribedBy}</Text>
                    </View>
                  )}
                  {med.hospital && (
                    <View style={styles.rxRow}>
                      <Text style={styles.rxLabel}>Hospital</Text>
                      <Text style={styles.rxValue}>{med.hospital}</Text>
                    </View>
                  )}
                  {med.licenseNumber && (
                    <View style={styles.rxRow}>
                      <Text style={styles.rxLabel}>License No.</Text>
                      <Text style={styles.rxValue}>{med.licenseNumber}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}

        <View style={styles.actionSection}>
          <TouchableOpacity style={styles.btnPrimary} onPress={() => router.back()}>
            <Ionicons name="checkmark-circle" size={22} color="#FFF" />
            <Text style={styles.btnPrimaryText}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Shared Language Picker */}
      <Modal visible={showLangPicker} transparent animationType="slide" onRequestClose={() => setShowLangPicker(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>Select Language</Text>
            <FlatList
              data={LANGUAGES}
              keyExtractor={item => item.geminiName}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 20 }}
              renderItem={({ item }) => {
                const isSelected = item.geminiName === selectedLang.geminiName;
                return (
                  <TouchableOpacity
                    onPress={() => { setSelectedLang(item); setShowLangPicker(false); }}
                    activeOpacity={0.7}
                    style={[styles.langOption, isSelected && styles.langOptionSelected]}
                  >
                    <Text style={[styles.langOptionText, isSelected && styles.langOptionTextSelected]}>
                      {item.label}
                    </Text>
                    {item.code === 'fil-PH' && item.geminiName !== 'Filipino/Tagalog' && (
                      <View style={styles.dialectBadge}>
                        <Text style={styles.dialectBadgeText}>DIALECT</Text>
                      </View>
                    )}
                    {isSelected && <Ionicons name="checkmark-circle" size={20} color="#0369A1" />}
                  </TouchableOpacity>
                );
              }}
            />
            <TouchableOpacity onPress={() => setShowLangPicker(false)} style={styles.pickerCancelBtn}>
              <Text style={styles.pickerCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Inventory Bottom Sheet Overlay Modal */}
      <Modal visible={showInventorySheet} transparent animationType="slide" onRequestClose={() => setShowInventorySheet(false)}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.pickerOverlay}
        >
          <View style={styles.pickerCard}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>Set Inventory</Text>
            
            {editingMedIndex !== null && meds[editingMedIndex] && (
              <ScrollView style={{ paddingHorizontal: 20, marginBottom: 20 }} keyboardShouldPersistTaps="handled">
                <Text style={{ fontSize: moderateScale(16), fontWeight: '600', color: '#334155', marginBottom: 20, textAlign: 'center' }}>
                  {meds[editingMedIndex].medicineName}
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Current Pill Count</Text>
                  <TextInput
                    style={styles.textInputStyle}
                    placeholder="e.g. 30"
                    placeholderTextColor="#94A3B8"
                    keyboardType="number-pad"
                    value={inventoryInput}
                    onChangeText={setInventoryInput}
                  />
                  <Text style={styles.inputHint}>How many pills do you currently have?</Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Pills Per Day</Text>
                  <TextInput
                    style={styles.textInputStyle}
                    placeholder="e.g. 2"
                    placeholderTextColor="#94A3B8"
                    keyboardType="number-pad"
                    value={doseInput}
                    onChangeText={setDoseInput}
                  />
                  <Text style={styles.inputHint}>How many pills do you take daily?</Text>
                </View>

                <TouchableOpacity style={[styles.btnPrimary, { marginTop: 10, backgroundColor: '#8B5CF6', shadowColor: '#8B5CF6' }]} onPress={handleSaveInventory}>
                  <Ionicons name="save-outline" size={20} color="#FFF" />
                  <Text style={styles.btnPrimaryText}>Save Inventory</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setShowInventorySheet(false)} style={styles.btnSecondary}>
                  <Text style={styles.btnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  safeHeader: {
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    gap: 12,
  },
  headerTitle: {
    fontSize: moderateScale(18),
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    textAlign: 'center',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  langBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  langBtnText: {
    fontSize: moderateScale(14),
    fontWeight: '700',
    color: '#0369A1',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: verticalScale(40),
  },
  heroCard: {
    height: verticalScale(280),
    marginHorizontal: scale(16),
    marginTop: verticalScale(16),
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
  heroImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 20,
  },
  heroTimestamp: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: moderateScale(12),
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  translatingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0F9FF',
    marginHorizontal: scale(16),
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  translatingText: {
    fontSize: moderateScale(14),
    color: '#0369A1',
    fontWeight: '600',
  },
  medSection: {
    marginTop: verticalScale(24),
  },
  titleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    marginHorizontal: scale(16),
    padding: 20,
    borderRadius: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    gap: 16,
  },
  iconContainer: {
    width: scale(56),
    height: scale(56),
    borderRadius: 18,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  medicineName: {
    fontSize: moderateScale(22),
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  dosageLabel: {
    fontSize: moderateScale(15),
    color: '#0369A1',
    fontWeight: '700',
    marginTop: 2,
  },
  ttsMainBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0F2FE',
  },
  patientCard: {
    backgroundColor: '#F8FAFC',
    marginHorizontal: scale(16),
    padding: 16,
    borderRadius: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  patientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  patientTitle: {
    fontSize: moderateScale(12),
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1,
  },
  patientNameText: {
    fontSize: moderateScale(18),
    fontWeight: '700',
    color: '#334155',
  },
  patientMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  patientMeta: {
    fontSize: moderateScale(14),
    color: '#94A3B8',
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: scale(16),
    padding: 20,
    borderRadius: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  cardTitle: {
    fontSize: moderateScale(16),
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    letterSpacing: 0.3,
  },
  ttsBtn: {
    padding: 4,
  },
  reminderSmallBtn: {
    padding: 4,
  },
  usageText: {
    fontSize: moderateScale(16),
    color: '#334155',
    lineHeight: 24,
    fontWeight: '500',
  },
  warningCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
  },
  warningText: {
    fontSize: moderateScale(15),
    color: '#991B1B',
    lineHeight: 22,
    fontWeight: '600',
  },
  rxDetailsCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: scale(16),
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  rxHeader: {
    fontSize: moderateScale(12),
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  rxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E1F8F2',
  },
  rxLabel: {
    fontSize: moderateScale(14),
    color: '#64748B',
    fontWeight: '600',
  },
  rxValue: {
    fontSize: moderateScale(14),
    color: '#0F172A',
    fontWeight: '700',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  actionSection: {
    paddingHorizontal: scale(16),
    marginTop: 20,
    gap: 12,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#0369A1',
    paddingVertical: verticalScale(16),
    borderRadius: 20,
    shadowColor: '#0369A1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  btnPrimaryText: {
    color: '#FFF',
    fontSize: moderateScale(17),
    fontWeight: '700',
  },
  btnSecondary: {
    alignItems: 'center',
    paddingVertical: verticalScale(14),
  },
  btnSecondaryText: {
    color: '#64748B',
    fontSize: moderateScale(16),
    fontWeight: '600',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerCard: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 12,
    maxHeight: '80%',
  },
  pickerHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  pickerTitle: {
    fontSize: moderateScale(18),
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 16,
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    gap: 12,
  },
  langOptionSelected: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  langOptionText: {
    fontSize: moderateScale(16),
    color: '#334155',
    fontWeight: '600',
    flex: 1,
  },
  langOptionTextSelected: {
    color: '#0369A1',
    fontWeight: '800',
  },
  dialectBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dialectBadgeText: {
    fontSize: moderateScale(10),
    color: '#92400E',
    fontWeight: '800',
  },
  pickerCancelBtn: {
    marginHorizontal: 20,
    marginBottom: 40,
    marginTop: 10,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
  },
  pickerCancelBtnText: {
    fontSize: moderateScale(16),
    fontWeight: '700',
    color: '#64748B',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F8FAFC',
  },
  emptyText: {
    fontSize: moderateScale(18),
    color: '#64748B',
    marginTop: 16,
    marginBottom: 24,
    fontWeight: '600',
  },
  backBtn: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    backgroundColor: '#0369A1',
    borderRadius: 12,
  },
  backBtnText: {
    color: '#FFF',
    fontSize: moderateScale(16),
    fontWeight: '700',
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: moderateScale(14),
    fontWeight: '800',
    color: '#475569',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInputStyle: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: moderateScale(16),
    color: '#0F172A',
    fontWeight: '600',
  },
  inputHint: {
    fontSize: moderateScale(12),
    color: '#94A3B8',
    marginTop: 6,
    marginLeft: 4,
  }
});
