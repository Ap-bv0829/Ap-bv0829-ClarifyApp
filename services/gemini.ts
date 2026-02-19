import { GoogleGenerativeAI } from '@google/generative-ai';
import * as FileSystem from 'expo-file-system/legacy';

// ========== FRAUD DETECTION UTILITIES ==========
function validatePRCLicense(licenseNumber?: string): boolean {
    if (!licenseNumber) return false;
    const numbers = licenseNumber.replace(/\D/g, '');
    return numbers.length >= 6 && numbers.length <= 7;
}

function calculateAuthenticityScore(medicine: any): any {
    let score = 0;
    const passedChecks: string[] = [];
    const redFlags: string[] = [];
    const recommendations: string[] = [];

    if (medicine.signatureVerified) {
        score += 25;
        passedChecks.push('Doctor signature verified');
    } else {
        redFlags.push('No visible doctor signature');
    }

    if (validatePRCLicense(medicine.licenseNumber)) {
        score += 20;
        passedChecks.push('Valid PRC license format');
    } else if (medicine.licenseNumber) {
        redFlags.push('Invalid PRC license number format');
    } else {
        redFlags.push('Missing PRC license number');
    }

    if (medicine.hospital) {
        score += 15;
        passedChecks.push('Hospital/clinic documented');
    } else {
        redFlags.push('No hospital or clinic name');
    }

    if (medicine.patientName && medicine.patientAge && medicine.patientSex) {
        score += 15;
        passedChecks.push('Complete patient information');
    } else {
        if (!medicine.patientName) redFlags.push('Missing patient name');
        if (!medicine.patientAge) redFlags.push('Missing patient age');
        if (!medicine.patientSex) redFlags.push('Missing patient sex');
    }

    if (medicine.prescribedBy) {
        score += 10;
        passedChecks.push('Prescribing doctor identified');
    } else {
        redFlags.push('No prescribing doctor name');
    }

    if (medicine.dosage && medicine.dosage !== 'Not visible') {
        score += 10;
        passedChecks.push('Dosage information present');
    }

    if (medicine.prescribedBy && medicine.hospital && medicine.licenseNumber) {
        score += 5;
        passedChecks.push('Professional prescription format');
    }

    let riskLevel: 'safe' | 'caution' | 'suspicious' | 'high-risk';
    if (score >= 90) riskLevel = 'safe';
    else if (score >= 70) riskLevel = 'caution';
    else if (score >= 40) riskLevel = 'suspicious';
    else riskLevel = 'high-risk';

    if (riskLevel === 'high-risk') {
        recommendations.push('DO NOT USE - Verify with healthcare provider immediately');
        recommendations.push('Contact the hospital listed to confirm prescription');
        recommendations.push('Report to PRC if suspected fraud');
    } else if (riskLevel === 'suspicious') {
        recommendations.push('Verify prescription with your pharmacist');
        recommendations.push('Contact prescribing doctor to confirm');
        recommendations.push('Check PRC license at: prc.gov.ph');
    } else if (riskLevel === 'caution') {
        recommendations.push('Ask your pharmacist to verify');
        recommendations.push('Ensure prescription details are complete');
    }

    return { authenticityScore: score, riskLevel, redFlags, passedChecks, recommendations };
}
// ========== END FRAUD DETECTION ==========

// Initialize Gemini API
const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY || '');

export interface MedicineAnalysis {
    medicineName: string;
    activeIngredients: string;
    commonUses: string;
    dosage: string;
    warnings: string;
    recommendedTime?: string; // Format: "HH:MM" 24-hour
    foodWarnings: string[]; // Foods/drinks to avoid
    affordability?: AffordabilityInfo; // Philippines-specific affordability info
    prescribedBy?: string; // Doctor's name if visible on prescription
    hospital?: string; // Hospital/clinic name if visible
    signatureVerified?: boolean; // true if doctor's signature is visible
    licenseNumber?: string; // Doctor's PRC license number if visible
    patientName?: string; // Patient's name if visible on prescription
    patientAge?: string; // Patient's age if visible
    patientSex?: string; // Patient's sex (M/F) if visible
    fraudDetection?: FraudDetection; // Prescription authenticity analysis
}

export interface FraudDetection {
    authenticityScore: number;      // 0-100%
    riskLevel: 'safe' | 'caution' | 'suspicious' | 'high-risk';
    redFlags: string[];             // List of suspicious findings
    passedChecks: string[];         // List of validation checks passed
    recommendations: string[];      // What to do if suspicious
}


export interface AffordabilityInfo {
    genericAlternative?: string;        // "Amlodipine (Generika)"
    estimatedSavings?: string;          // "₱135 per box"
    seniorDiscountEligible: boolean;    // true for all medicines in PH
    philHealthCoverage?: string;        // "Not covered" or "Z-Package eligible"
    governmentPrograms: string[];       // ["PCSO", "DSWD AICS", "Malasakit"]
}

export interface InteractionReport {
    hasConflict: boolean;
    severity: 'high' | 'medium' | 'low' | 'none';
    description: string;
}

/**
 * Checks for contraindications between multiple medicines
 */
export async function analyzeInteractions(medicines: MedicineAnalysis[]): Promise<InteractionReport> {
    if (medicines.length < 2) {
        return { hasConflict: false, severity: 'none', description: 'No interactions checked (single medicine).' };
    }

    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const medNames = medicines.map(m => `${m.medicineName} (${m.activeIngredients})`).join(', ');

        const prompt = `Analyze these medicines for harmful drug interactions (contraindications):
${medNames}

Return ONLY a valid JSON object:
{
  "hasConflict": boolean,
  "severity": "high" | "medium" | "low" | "none", 
  "description": "Short, urgent warning explaining the risk (e.g., 'Aspirin and Warfarin increase bleeding risk'). If no risk, say 'Safe combination'."
}

Start with "⚠️ WARNING:" in description if high risk.`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanText);

        return {
            hasConflict: parsed.hasConflict || false,
            severity: parsed.severity || 'none',
            description: parsed.description || 'Analysis complete.',
        };

    } catch (error) {
        console.error('Interaction check failed:', error);
        return { hasConflict: false, severity: 'none', description: 'Could not check interactions.' };
    }
}

/**
 * Analyzes an image of medicine using Google Gemini Vision API
 * @param imageUri - Local file URI of the captured image
 * @returns Array of structured information about the identified medicines
 */
export async function analyzeMedicineImage(imageUri: string): Promise<MedicineAnalysis[]> {
    try {
        // Read the image file as base64
        const base64Image = await FileSystem.readAsStringAsync(imageUri, {
            encoding: 'base64',
        });

        // Initialize the Gemini model
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Create the prompt for medicine identification
        const prompt = `You are a medical assistant AI specialized in helping Filipino seniors. Analyze this image of medicine/medication.
If there are MULTIPLE medicines in the image, identify ALL of them independently.

Return ONLY a valid JSON ARRAY of objects. Each object should have these exact keys:
- medicineName: (Brand name and generic name if visible)
- activeIngredients: (Main active pharmaceutical ingredients)
- commonUses: (What this medicine is typically used for)
- dosage: (Typical dosage information if visible on the packaging)
- warnings: (Important warnings or precautions)
- recommendedTime: (If a specific time is mentioned like "8 AM" or "bedtime", return it in "HH:MM" 24-hour format. E.g., "08:00" or "22:00". If no specific time is mentioned, return null)
- foodWarnings: (Array of foods/drinks to avoid with this medication. Examples: ["Grapefruit", "Alcohol", "Dairy products", "High-Vitamin K foods (spinach, kale)"]. If no specific food interactions, return empty array [])
- prescribedBy: (Doctor's name if visible on prescription label or packaging. Format: "Dr. [Name]". If not visible, set to null)
- hospital: (Hospital or clinic name if visible on prescription label. If not visible, set to null)
- signatureVerified: (true if you can see a doctor's signature on the prescription label/packaging. false if no signature visible. Set to null if this is not a prescription medicine)
- licenseNumber: (Doctor's PRC license number if visible on prescription label. Format: "PRC No. [number]" or just the number. If not visible, set to null)
- patientName: (Patient's name if visible on prescription label. If not visible, set to null)
- patientAge: (Patient's age if visible on prescription label. Can be number or "XX years old". If not visible, set to null)
- patientSex: (Patient's sex if visible. Should be "Male", "Female", "M", or "F". If not visible, set to null)
- affordability: (Object with Philippines-specific affordability info):
  {
    "genericAlternative": "Name of generic version available in Philippines (e.g., 'Amlodipine from Generika' if brand is Norvasc). If already generic or no alternative, set to null",
    "estimatedSavings": "Estimated savings in Philippine Peso if switching to generic (e.g., '₱135 per box'). If no savings, set to null",
    "seniorDiscountEligible": true (always true - all medicines in Philippines qualify for 20% senior discount),
    "philHealthCoverage": "State if covered by PhilHealth (e.g., 'Covered under Z-Package', 'Not covered', 'Requires prior authorization')",
    "governmentPrograms": ["Array of relevant government assistance programs like 'PCSO Medical Assistance', 'DSWD AICS', 'Malasakit Center' if medicine is expensive or for chronic conditions. Empty array if not applicable"]
  }

IMPORTANT: 
- For foodWarnings, include common dangerous food-drug interactions that seniors should know about.
- For affordability, focus on helping low-income Filipino seniors save money.
- Generic alternatives should be from common Philippine pharmacies (Generika, TGP, Mercury Drug).
- All seniors in Philippines get 20% discount with Senior Citizen ID, so always set seniorDiscountEligible to true.
- For prescribedBy and hospital, look carefully at prescription labels, stickers, or packaging for doctor/clinic information.

If you cannot clearly identify the medicine, state that in the fields or provide partial info.
Do NOT use Markdown code blocks. Just return the raw JSON ARRAY string.`;

        // Send the image and prompt to Gemini
        console.log(`Sending to Gemini... Payload size: ${(base64Image.length / 1024 / 1024).toFixed(2)} MB`);
        const startTime = Date.now();
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
function parseMedicineResponse(text: string): MedicineAnalysis[] {
    try {
        // Clean the text to ensure it's valid JSON
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanText);

        const results: MedicineAnalysis[] = [];

        // Handle if AI returns a single object instead of an array
        const items = Array.isArray(parsed) ? parsed : [parsed];

        for (const item of items) {
            const medicine = {
                medicineName: item.medicineName || 'Unknown Medicine',
                activeIngredients: item.activeIngredients || 'Not identified',
                commonUses: item.commonUses || 'Not available',
                dosage: item.dosage || 'Not visible',
                warnings: item.warnings || 'Consult a doctor',
                recommendedTime: item.recommendedTime || undefined,
                foodWarnings: Array.isArray(item.foodWarnings) ? item.foodWarnings : [],
                prescribedBy: item.prescribedBy || undefined,
                hospital: item.hospital || undefined,
                signatureVerified: item.signatureVerified || undefined,
                licenseNumber: item.licenseNumber || undefined,
                patientName: item.patientName || undefined,
                patientAge: item.patientAge || undefined,
                patientSex: item.patientSex || undefined,
                affordability: item.affordability ? {
                    genericAlternative: item.affordability.genericAlternative || null,
                    estimatedSavings: item.affordability.estimatedSavings || null,
                    seniorDiscountEligible: item.affordability.seniorDiscountEligible !== false, // default true
                    philHealthCoverage: item.affordability.philHealthCoverage || null,
                    governmentPrograms: Array.isArray(item.affordability.governmentPrograms) ? item.affordability.governmentPrograms : [],
                } : {
                    genericAlternative: null,
                    estimatedSavings: null,
                    seniorDiscountEligible: true,
                    philHealthCoverage: null,
                    governmentPrograms: [],
                },
                fraudDetection: undefined, // Will be calculated next
            };

            // Calculate fraud detection if prescription data exists
            if (medicine.prescribedBy || medicine.hospital || medicine.licenseNumber || medicine.signatureVerified) {
                medicine.fraudDetection = calculateAuthenticityScore(medicine);
            }

            results.push(medicine);
        }

        return results;
    } catch (e) {
        console.error('Failed to parse Gemini JSON response:', text);
        // Fallback to simple text extraction if JSON parsing fails
        return [{
            medicineName: 'Error parsing results',
            activeIngredients: 'Could not structure the data',
            commonUses: 'Please try again',
            dosage: '',
            warnings: text.substring(0, 100) + '...', // Show raw text snippet
            foodWarnings: [],
        }];
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
