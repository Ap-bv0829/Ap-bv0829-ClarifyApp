const { GoogleGenerativeAI } = require('@google/generative-ai');
const API_KEY = 'AIzaSyAX65VjNJTges0pCZq4wBR7EUXzijRswEk';
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

(async () => {
    try {
        console.log('Testing key with simple prompt...');
        // Set timeout to avoid hanging forever
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000));
        const result = await Promise.race([
            model.generateContent('Say hello'),
            timeoutPromise
        ]);
        console.log('Success! Response:', result.response.text());
    } catch (e) {
        console.error('API Error:', e.message);
    }
})();
