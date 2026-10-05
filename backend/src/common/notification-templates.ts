export type TemplateKey =
  | 'otp'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_cancelled_by_clinic'
  | 'turn_near'
  | 'appointment_reminder'
  | 'walkin_token'
  | 'subscription_expiring'
  | 'subscription_expired'
  | 'payment_received';

export type Lang = 'hi' | 'en';

/** Templates must stay in sync with the DLT / WhatsApp approved texts. Placeholders: {name}. */
export const TEMPLATES: Record<TemplateKey, Record<Lang, string>> = {
  otp: {
    hi: 'आपका OTP {code} है। यह {minutes} मिनट में समाप्त हो जाएगा। किसी को न बताएं।',
    en: 'Your OTP is {code}. It expires in {minutes} minutes. Do not share it.',
  },
  booking_confirmed: {
    hi: 'बुकिंग पक्की: {clinic}, {doctor}, {date}। टोकन #{token}, अनुमानित समय {time}। लाइव कतार: {link}',
    en: 'Booking confirmed: {clinic}, {doctor}, {date}. Token #{token}, approx. {time}. Live queue: {link}',
  },
  booking_cancelled: {
    hi: 'आपकी बुकिंग रद्द हो गई: {clinic}, {date}, टोकन #{token}।',
    en: 'Your booking is cancelled: {clinic}, {date}, token #{token}.',
  },
  booking_cancelled_by_clinic: {
    hi: 'क्षमा करें, {clinic} ने {date} की आपकी बुकिंग (टोकन #{token}) रद्द कर दी है। {reason}',
    en: 'Sorry, {clinic} has cancelled your booking on {date} (token #{token}). {reason}',
  },
  turn_near: {
    hi: 'आपका टोकन #{token} लगभग {minutes} मिनट में आने वाला है। अभी #{serving} चल रहा है। लाइव कतार: {link}',
    en: 'Your token #{token} is due in about {minutes} minutes. Now serving #{serving}. Live queue: {link}',
  },
  appointment_reminder: {
    hi: 'रिमाइंडर: {clinic} में {doctor} के साथ आपका टोकन #{token}, अनुमानित समय {time} (लगभग {minutes} मिनट में)। {link}',
    en: 'Reminder: token #{token} with {doctor} at {clinic}, approx. {time} (in about {minutes} minutes). {link}',
  },
  walkin_token: {
    hi: '{clinic} में आपका टोकन #{token} है। लाइव कतार: {link}',
    en: 'Your token at {clinic} is #{token}. Live queue: {link}',
  },
  subscription_expiring: {
    hi: '{clinic} का प्लान {days} दिन में समाप्त होगा। लिस्टिंग चालू रखने के लिए रिन्यू करें।',
    en: 'The plan for {clinic} ends in {days} days. Renew to stay listed.',
  },
  subscription_expired: {
    hi: '{clinic} का प्लान समाप्त हो गया है। रिन्यू करने तक क्लिनिक छिपा रहेगा।',
    en: 'The plan for {clinic} has expired. The clinic stays hidden until renewed.',
  },
  payment_received: {
    hi: '{clinic}: ₹{amount} का भुगतान मिला। इनवॉइस {invoice}।',
    en: '{clinic}: payment of ₹{amount} received. Invoice {invoice}.',
  },
};

export function render(template: TemplateKey, lang: Lang, params: Record<string, string | number>): string {
  return TEMPLATES[template][lang].replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ''));
}

/** Keys never written to notification_logs. */
export const SENSITIVE_PARAMS = new Set(['code']);
