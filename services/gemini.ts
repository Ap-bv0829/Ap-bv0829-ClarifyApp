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
        const prompt = `You are a medical assistant AI. Analyze this image of medicine/medication and provide the following information in a structured format:

1. Medicine Name: (Brand name and generic name if visible)
2. Active Ingredients: (Main active pharmaceutical ingredients)
3. Common Uses: (What this medicine is typically used for)
4. Dosage: (Typical dosage information if visible on the packaging)
5. Warnings: (Important warnings or precautions)

If you cannot clearly identify the medicine, please state that clearly and provide any partial information you can see.

Format your response as follows:
Medicine Name: [name]
Active Ingredients: [ingredients]
Common Uses: [uses]
Dosage: [dosage]
Warnings: [warnings]`;

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
    // Simple parsing - extract information between labels
    const extractField = (label: string): string => {
        const regex = new RegExp(`${label}:\\s*(.+?)(?=\\n[A-Z]|$)`, 's');
        const match = text.match(regex);
        return match ? match[1].trim() : 'Not available';
    };

    return {
        medicineName: extractField('Medicine Name'),
        activeIngredients: extractField('Active Ingredients'),
        commonUses: extractField('Common Uses'),
        dosage: extractField('Dosage'),
        warnings: extractField('Warnings'),
    };
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
