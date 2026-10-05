import { cookies } from 'next/headers';
import { format } from './format';
import { LOCALES, messages, type Locale, type MessageKey } from './messages';

export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get('lang')?.value;
  return (LOCALES as readonly string[]).includes(c ?? '') ? (c as Locale) : 'hi';
}

/** Translator for server components. */
export async function getT() {
  const locale = await getLocale();
  const dict = messages[locale];
  return {
    locale,
    t: (key: MessageKey, vars?: Record<string, string | number>) => format(dict[key] ?? key, vars),
  };
}
