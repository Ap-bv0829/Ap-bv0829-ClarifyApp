import AsyncStorage from '@react-native-async-storage/async-storage';
import { MedicineAnalysis } from './gemini';

const MEDICATION_STORAGE_KEY = '@clarify_medications';

export interface MedicationRecord {
    id: string;
    scanDate: Date;
    imageUri: string;
    analysis: MedicineAnalysis;
    status: 'active' | 'discontinued' | 'completed';
    startDate: Date;
    endDate?: Date;
    refillDate?: Date;
    notes?: string;
    lastTaken?: Date;
}

export interface DailySchedule {
    time: string; // HH:MM format
    medicationId: string;
    medicationName: string;
    dosage: string;
    taken: boolean;
    takenAt?: Date;
}

/**
 * Save a new medication record
 */
export async function saveMedication(
    imageUri: string,
    analysis: MedicineAnalysis
): Promise<MedicationRecord> {
    try {
        const medications = await getAllMedications();

        const newRecord: MedicationRecord = {
            id: Date.now().toString(),
            scanDate: new Date(),
            imageUri,
            analysis,
            status: 'active',
            startDate: new Date(),
        };

        medications.push(newRecord);
        await AsyncStorage.setItem(MEDICATION_STORAGE_KEY, JSON.stringify(medications));

        return newRecord;
    } catch (error) {
        console.error('Error saving medication:', error);
        throw error;
    }
}

/**
 * Get all medication records
 */
export async function getAllMedications(): Promise<MedicationRecord[]> {
    try {
        const data = await AsyncStorage.getItem(MEDICATION_STORAGE_KEY);
        if (!data) return [];

        const medications = JSON.parse(data);
        // Convert date strings back to Date objects
        return medications.map((med: any) => ({
            ...med,
            scanDate: new Date(med.scanDate),
            startDate: new Date(med.startDate),
            endDate: med.endDate ? new Date(med.endDate) : undefined,
            refillDate: med.refillDate ? new Date(med.refillDate) : undefined,
            lastTaken: med.lastTaken ? new Date(med.lastTaken) : undefined,
        }));
    } catch (error) {
        console.error('Error getting medications:', error);
        return [];
    }
}

/**
 * Get only active medications
 */
export async function getActiveMedications(): Promise<MedicationRecord[]> {
    const all = await getAllMedications();
    return all.filter(med => med.status === 'active');
}

/**
 * Update medication status
 */
export async function updateMedicationStatus(
    id: string,
    status: 'active' | 'discontinued' | 'completed'
): Promise<void> {
    try {
        const medications = await getAllMedications();
        const index = medications.findIndex(med => med.id === id);

        if (index !== -1) {
            medications[index].status = status;
            if (status !== 'active') {
                medications[index].endDate = new Date();
            }
            await AsyncStorage.setItem(MEDICATION_STORAGE_KEY, JSON.stringify(medications));
        }
    } catch (error) {
        console.error('Error updating medication status:', error);
        throw error;
    }
}

/**
 * Mark medication as taken
 */
export async function markMedicationTaken(id: string): Promise<void> {
    try {
        const medications = await getAllMedications();
        const index = medications.findIndex(med => med.id === id);

        if (index !== -1) {
            medications[index].lastTaken = new Date();
            await AsyncStorage.setItem(MEDICATION_STORAGE_KEY, JSON.stringify(medications));
        }
    } catch (error) {
        console.error('Error marking medication as taken:', error);
        throw error;
    }
}

/**
 * Get today's medication schedule
 */
export async function getTodaySchedule(): Promise<DailySchedule[]> {
    const activeMeds = await getActiveMedications();
    const schedule: DailySchedule[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const med of activeMeds) {
        if (med.analysis.recommendedTime) {
            const taken = med.lastTaken &&
                med.lastTaken.getTime() >= today.getTime();

            schedule.push({
                time: med.analysis.recommendedTime,
                medicationId: med.id,
                medicationName: med.analysis.medicineName,
                dosage: med.analysis.dosage,
                taken: !!taken,
                takenAt: taken ? med.lastTaken : undefined,
            });
        }
    }

    // Sort by time
    schedule.sort((a, b) => a.time.localeCompare(b.time));
    return schedule;
}

/**
 * Check for duplicate medications (same active ingredient)
 */
export async function findDuplicateMedications(): Promise<Array<{
    ingredient: string;
    medications: MedicationRecord[];
}>> {
    const activeMeds = await getActiveMedications();
    const byIngredient = new Map<string, MedicationRecord[]>();

    for (const med of activeMeds) {
        const ingredient = med.analysis.activeIngredients.toLowerCase();
        if (!byIngredient.has(ingredient)) {
            byIngredient.set(ingredient, []);
        }
        byIngredient.get(ingredient)!.push(med);
    }

    const duplicates: Array<{ ingredient: string; medications: MedicationRecord[] }> = [];

    for (const [ingredient, meds] of byIngredient) {
        if (meds.length > 1) {
            duplicates.push({ ingredient, medications: meds });
        }
    }

    return duplicates;
}

/**
 * Delete a medication record
 */
export async function deleteMedication(id: string): Promise<void> {
    try {
        const medications = await getAllMedications();
        const filtered = medications.filter(med => med.id !== id);
        await AsyncStorage.setItem(MEDICATION_STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
        console.error('Error deleting medication:', error);
        throw error;
    }
}

/**
 * Clear all medications (for testing/reset)
 */
export async function clearAllMedications(): Promise<void> {
    try {
        await AsyncStorage.removeItem(MEDICATION_STORAGE_KEY);
    } catch (error) {
        console.error('Error clearing medications:', error);
        throw error;
    }
}
