export const LANGUAGES = [
    { label: '🇺🇸 English', code: 'en-US', geminiName: 'English' },
    { label: '🇵🇭 Filipino (Tagalog)', code: 'fil-PH', geminiName: 'Filipino/Tagalog' },
    { label: '🇵🇭 Bisaya / Cebuano', code: 'fil-PH', geminiName: 'Cebuano/Bisaya dialect' },
    { label: '🇵🇭 Ilocano', code: 'fil-PH', geminiName: 'Ilocano dialect' },
    { label: '🇵🇭 Waray', code: 'fil-PH', geminiName: 'Waray dialect' },
    { label: '🇵🇭 Hiligaynon / Ilonggo', code: 'fil-PH', geminiName: 'Hiligaynon/Ilonggo dialect' },
    { label: '🇵🇭 Kapampangan', code: 'fil-PH', geminiName: 'Kapampangan dialect' },
    { label: '🇪🇸 Spanish', code: 'es-ES', geminiName: 'Spanish' },
    { label: '🇨🇳 Chinese (Mandarin)', code: 'zh-CN', geminiName: 'Mandarin Chinese' },
    { label: '🇯🇵 Japanese', code: 'ja-JP', geminiName: 'Japanese' },
    { label: '🇰🇷 Korean', code: 'ko-KR', geminiName: 'Korean' },
    { label: '🇸🇦 Arabic', code: 'ar-SA', geminiName: 'Arabic' },
    { label: '🇫🇷 French', code: 'fr-FR', geminiName: 'French' },
    { label: '🇩🇪 German', code: 'de-DE', geminiName: 'German' },
    { label: '🇮🇳 Hindi', code: 'hi-IN', geminiName: 'Hindi' },
];

export type Language = typeof LANGUAGES[number];
