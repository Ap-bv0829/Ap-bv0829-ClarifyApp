import { GoogleGenerativeAI } from '@google/generative-ai';

// Use the same API key as the medicine scanner
const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY || '');

/**
 * Translates Tagalog/Filipino text to English using Google Gemini AI
 * @param tagalogText - The Filipino/Tagalog text to translate
 * @returns English translation
 */
export async function translateTagalogToEnglish(tagalogText: string): Promise<string> {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `You are a professional Filipino-English translator helping seniors communicate with doctors and English-speaking family members.

Translate the following Tagalog/Filipino text to natural, conversational English:

"${tagalogText}"

Important:
- Provide ONLY the English translation
- Use natural, everyday English
- Preserve the tone and emotion of the original
- If it's a medical description, be precise
- No explanations, just the translation`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const translation = response.text().trim();

        return translation;
    } catch (error: any) {
        console.error('Translation error:', error);
        const errorMessage = error?.message || 'Unknown error';
        throw new Error(`Failed to translate: ${errorMessage}`);
    }
}
