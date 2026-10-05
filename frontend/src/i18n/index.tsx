'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import { format } from './format';
import type { Locale, MessageKey } from './messages';

interface LocaleState {
  locale: Locale;
  messages: Record<MessageKey, string>;
}

const Ctx = createContext<LocaleState | null>(null);

export function LocaleProvider({ locale, messages, children }: LocaleState & { children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useT must be used inside <LocaleProvider>');
  const t = useCallback((key: MessageKey, vars?: Record<string, string | number>) => format(v.messages[key] ?? key, vars), [v]);
  return { t, locale: v.locale };
}

export function setLocaleCookie(locale: Locale) {
  document.cookie = `lang=${locale}; path=/; max-age=31536000; samesite=lax`;
}
