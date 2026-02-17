import { translateText as apiTranslate } from './api';

// Supported languages for translation
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'hi', name: 'Hindi' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'te', name: 'Telugu' },
];

/**
 * Translates text to the target language via the backend API.
 */
export const translateText = async (
  text: string,
  targetLang: string
): Promise<string> => {
  if (import.meta.env.DEV) console.log("Translating via backend:", text, "→", targetLang);
  try {
    return await apiTranslate(text, targetLang);
  } catch (error: any) {
    console.error('Translation Error:', error);
    return `[Translation failed]: ${text}`;
  }
};
