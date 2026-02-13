import AsyncStorage from '@react-native-async-storage/async-storage';

const MEMORIES_KEY = 'people_memories';

export interface PersonMemory {
    id: string;
    name: string;
    relationship: string;
    details: string;
    audioUri: string;
    transcript: string;
    createdAt: number;
    // New Social Memory Fields
    tags: string[];         // e.g., "Work", "Hiking", "Family"
    context: string;        // e.g., "Met at coffee shop", "High school reunion"
    topics: string[];       // e.g., "Gardening", "Politics"
    interactionDate: number; // When the meeting happened (defaults to creation)
}

/**
 * Generate a unique ID for memories
 */
function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Save a new person memory
 */
export async function saveMemory(
    audioUri: string,
    transcript: string,
    name: string,
    relationship: string = '',
    details: string = '',
    tags: string[] = [],
    context: string = '',
    topics: string[] = []
): Promise<PersonMemory> {
    const memories = await getMemories();

    const newMemory: PersonMemory = {
        id: generateId(),
        name: name.trim(),
        relationship: relationship.trim(),
        details: details.trim(),
        audioUri,
        transcript,
        createdAt: Date.now(),
        tags,
        context: context.trim(),
        topics,
        interactionDate: Date.now(),
    };

    memories.unshift(newMemory); // Add to beginning
    await AsyncStorage.setItem(MEMORIES_KEY, JSON.stringify(memories));

    return newMemory;
}

/**
 * Get all saved memories
 */
export async function getMemories(): Promise<PersonMemory[]> {
    try {
        const data = await AsyncStorage.getItem(MEMORIES_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Error loading memories:', error);
        return [];
    }
}

/**
 * Search memories by name or keywords
 */
export async function searchMemories(query: string): Promise<PersonMemory[]> {
    const memories = await getMemories();
    const lowerQuery = query.toLowerCase().trim();

    if (!lowerQuery) return memories;

    return memories.filter(memory =>
        memory.name.toLowerCase().includes(lowerQuery) ||
        memory.relationship.toLowerCase().includes(lowerQuery) ||
        memory.details.toLowerCase().includes(lowerQuery) ||
        memory.transcript.toLowerCase().includes(lowerQuery) ||
        memory.context?.toLowerCase().includes(lowerQuery) ||
        memory.tags?.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
        memory.topics?.some(topic => topic.toLowerCase().includes(lowerQuery))
    );
}

/**
 * Delete a memory by ID
 */
export async function deleteMemory(id: string): Promise<void> {
    const memories = await getMemories();
    const filtered = memories.filter(m => m.id !== id);
    await AsyncStorage.setItem(MEMORIES_KEY, JSON.stringify(filtered));
}

/**
 * Get a single memory by ID
 */
export async function getMemoryById(id: string): Promise<PersonMemory | null> {
    const memories = await getMemories();
    return memories.find(m => m.id === id) || null;
}
