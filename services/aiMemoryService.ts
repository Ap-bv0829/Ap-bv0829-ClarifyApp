import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = 'AIzaSyCfm3mfhrOskLTnij3IXBW_e8enC5StXqg';
const genAI = new GoogleGenerativeAI(API_KEY);

interface PersonInfo {
    name: string;
    relationship: string;
    details: string;
    context: string;
    tags: string[];
    topics: string[];
}

/**
 * Analyze conversation transcript to detect if person information is mentioned
 * Returns person info if found, null otherwise
 */
export async function analyzeConversationForPeople(transcript: string): Promise<PersonInfo | null> {
    if (!transcript || transcript.trim().length < 10) {
        return null;
    }

    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `Analyze this conversation and extract details about a person being discussed or introduced. 
This is for a "Social Memory" aid to help the user remember friends, family, and acquaintances.

Conversation:
"${transcript}"

If this mentions a SPECIFIC PERSON with their name, respond with JSON:
{
  "name": "person's name",
  "relationship": "relationship to speaker (e.g., friend, coworker, nephew)",
  "details": "key facts (job, hobbies, age, etc.)",
  "context": "where/when they met or current location (e.g., 'Met at coffee shop', 'High school reunion')",
  "topics": ["topic1", "topic2"], // e.g., ["Gardening", "Politics", "Project Alpha"]
  "tags": ["tag1", "tag2"] // e.g., ["Work", "Family", "Hiking Group"]
}

If this is just a question like "Who is X?" or general conversation with NO new person information, respond with:
null

IMPORTANT: Extract as much as possible. Infer tags from the context (e.g., if talking about spreadsheets, add "Work").`;

        const result = await model.generateContent(prompt);
        const response = result.response.text().trim();

        // Try to parse JSON response
        if (response === 'null' || response.toLowerCase().includes('no person')) {
            return null;
        }

        // Extract JSON from markdown code blocks if present
        const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || response.match(/(\{[\s\S]*\})/);
        if (jsonMatch) {
            const personInfo = JSON.parse(jsonMatch[1]);
            if (personInfo.name) {
                return {
                    name: personInfo.name,
                    relationship: personInfo.relationship || '',
                    details: personInfo.details || '',
                    context: personInfo.context || '',
                    tags: personInfo.tags || [],
                    topics: personInfo.topics || [],
                };
            }
        }

        return null;
    } catch (error) {
        console.error('Error analyzing conversation:', error);
        return null;
    }
}

/**
 * Check if transcript is a query about someone (not new person info)
 */
export function isQueryAboutPerson(transcript: string): boolean {
    const lowerTranscript = transcript.toLowerCase();
    const queryPatterns = [
        /who\s+is/i,
        /tell\s+me\s+about/i,
        /do\s+you\s+know/i,
        /what\s+about/i,
        /remember/i,
    ];

    return queryPatterns.some(pattern => pattern.test(lowerTranscript));
}
