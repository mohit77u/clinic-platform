import { en } from './en';
import { hi } from './hi';

export const LOCALES = ['hi', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export type MessageKey = keyof typeof en;
export const messages: Record<Locale, Record<MessageKey, string>> = { en, hi };
