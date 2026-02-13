import { GoogleGenerativeAI } from '@google/generative-ai';
import * as FileSystem from 'expo-file-system/legacy';

// Initialize Gemini API
// TODO: Replace with your actual API key or use environment variable
const API_KEY = 'AIzaSyCfm3mfhrOskLTnij3IXBW_e8enC5StXqg';
const genAI = new GoogleGenerativeAI(API_KEY);

export interface MedicineAnalysis {
    medicineName: string;
    activeIngredients: string;
    commonUses: string;
    dosage: string;
    warnings: string;
    recommendedTime?: string; // Format: "HH:MM" 24-hour
}

/**
 * Analyzes an image of medicine using Google Gemini Vision API
 * @param imageUri - Local file URI of the captured image
 * @returns Structured information about the identified medicine
 */
export async function analyzeMedicineImage(imageUri: string): Promise<MedicineAnalysis> {
    try {
        // Read the image file as base64
        const base64Image = await FileSystem.readAsStringAsync(imageUri, {
            encoding: 'base64',
        });

        // Initialize the Gemini model (using Gemini 2.0 Flash)
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Create the prompt for medicine identification
        const prompt = `You are a medical assistant AI. Analyze this image of medicine/medication and provide the following information in a structured JSON format.

Return ONLY a valid JSON object with these exact keys:
- medicineName: (Brand name and generic name if visible)
- activeIngredients: (Main active pharmaceutical ingredients)
- commonUses: (What this medicine is typically used for)
- dosage: (Typical dosage information if visible on the packaging)
- warnings: (Important warnings or precautions)
- recommendedTime: (If a specific time is mentioned like "8 AM" or "bedtime", return it in "HH:MM" 24-hour format. E.g., "08:00" or "22:00". If no specific time is mentioned, return null)

If you cannot clearly identify the medicine, state that in the fields or provide partial info.
Do NOT use Markdown code blocks. Just return the raw JSON string.`;

        // Send the image and prompt to Gemini
        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Image,
                    mimeType: 'image/jpeg',
                },
            },
        ]);

        const response = await result.response;
        const text = response.text();

        // Parse the response into structured format
        return parseMedicineResponse(text);
    } catch (error: any) {
        console.error('Error analyzing medicine image:', error);
        // Show the actual error message for debugging
        const errorMessage = error?.message || error?.toString() || 'Unknown error';
        console.error('Detailed error:', errorMessage);
        throw new Error(`Failed to analyze: ${errorMessage}`);
    }
}

/**
 * Parses the AI response into a structured format
 */
function parseMedicineResponse(text: string): MedicineAnalysis {
    try {
        // Clean the text to ensure it's valid JSON
        // Remove markdown code blocks if present (e.g., ```json ... ```)
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

        const parsed = JSON.parse(cleanText);

        return {
            medicineName: parsed.medicineName || 'Unknown Medicine',
            activeIngredients: parsed.activeIngredients || 'Not identified',
            commonUses: parsed.commonUses || 'Not available',
            dosage: parsed.dosage || 'Not visible',
            warnings: parsed.warnings || 'Consult a doctor',
            recommendedTime: parsed.recommendedTime || undefined,
        };
    } catch (e) {
        console.error('Failed to parse Gemini JSON response:', text);
        // Fallback to simple text extraction if JSON parsing fails
        return {
            medicineName: 'Error parsing results',
            activeIngredients: 'Could not structure the data',
            commonUses: 'Please try again',
            dosage: '',
            warnings: text.substring(0, 100) + '...', // Show raw text snippet
        };
    }
}

export interface PersonInfo {
    name: string;
    relationship: string;
    details: string;
}

/**
 * Extract person information from a voice transcript using Gemini AI
 * @param transcript - The transcribed voice note about a person
 * @returns Extracted name, relationship, and key details
 */
export async function extractPersonInfo(transcript: string): Promise<PersonInfo> {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `Extract person information from this voice note. Return ONLY a JSON object with these fields:
- name: The person's name (first name, or full name if given)
- relationship: How they relate to the speaker (e.g., "neighbor", "nurse's son", "grandchild")
- details: Key memorable details about them

Voice note: "${transcript}"

Respond with ONLY valid JSON, no markdown, no explanation. Example:
{"name": "Mark", "relationship": "nurse's son", "details": "likes basketball"}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();

        // Clean up response - remove markdown code blocks if present
        const cleanJson = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        try {
            const parsed = JSON.parse(cleanJson);
            return {
                name: parsed.name || 'Unknown',
                relationship: parsed.relationship || '',
                details: parsed.details || '',
            };
        } catch {
            // If JSON parsing fails, try to extract the name manually
            const nameMatch = transcript.match(/(?:this is|i'm with|meet|called|named)\s+(\w+)/i);
            return {
                name: nameMatch ? nameMatch[1] : 'Unknown',
                relationship: '',
                details: transcript,
            };
        }
    } catch (error) {
        console.error('Error extracting person info:', error);
        // Fallback: try simple name extraction
        const nameMatch = transcript.match(/(?:this is|i'm with|meet|called|named)\s+(\w+)/i);
        return {
            name: nameMatch ? nameMatch[1] : 'Unknown',
            relationship: '',
            details: transcript,
        };
    }
}
