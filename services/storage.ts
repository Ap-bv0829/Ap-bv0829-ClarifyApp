import AsyncStorage from '@react-native-async-storage/async-storage';
import { MedicineAnalysis } from './gemini';

export interface SavedScan {
    id: string;
    timestamp: number;
    imageUri: string;
    analysis: MedicineAnalysis[];
}

const STORAGE_KEY = 'recent_scans';

/**
 * Save a new scan to the recent list
 */
export const saveScan = async (analysis: MedicineAnalysis[], imageUri: string): Promise<SavedScan> => {
    try {
        const newScan: SavedScan = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            imageUri,
            analysis,
        };

        const existingScans = await getRecentScans();
        // Keep only top 20 recent scans
        const updatedScans = [newScan, ...existingScans].slice(0, 20);

        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedScans));
        return newScan;
    } catch (error) {
        console.error('Failed to save scan:', error);
        throw error;
    }
};

/**
 * Get all recent scans
 */
export const getRecentScans = async (): Promise<SavedScan[]> => {
    try {
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        if (!json) return [];

        const data = JSON.parse(json);

        // Migration: Ensure all items have analysis as an array
        return data.map((item: any) => ({
            ...item,
            analysis: Array.isArray(item.analysis) ? item.analysis : [item.analysis]
        }));
    } catch (error) {
        console.error('Failed to load scans:', error);
        return [];
    }
};

/**
 * Clear all recent scans
 */
export const clearScans = async (): Promise<void> => {
    try {
        await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        console.error('Failed to clear scans:', error);
    }
};
