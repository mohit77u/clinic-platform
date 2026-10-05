import { ConfigService } from '@nestjs/config';
import { templateVars, WhatsAppBsp } from './provider-notifiers.js';

const cfg = (o: Record<string, string>) => ({ get: (k: string) => o[k], getOrThrow: (k: string) => { if (!(k in o)) throw new Error(k); return o[k]; } }) as unknown as ConfigService;

describe('WhatsApp provider', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('orders template variables like the template text', () => {
    expect(templateVars('otp', { minutes: 5, code: '123456' })).toEqual(['123456', '5']);
    expect(templateVars('booking_confirmed', { clinic: 'C', doctor: 'D', date: '5 Oct', token: 3, time: '9:00 AM', link: 'L' })).toEqual(['C', 'D', '5 Oct', '3', '9:00 AM', 'L']);
    expect(templateVars('turn_near', { token: 7, minutes: 25, serving: 4, link: 'L' })).toEqual(['7', '25', '4', 'L']);
  });

  it('strips the country code and sends positional body values', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await new WhatsAppBsp(cfg({ WHATSAPP_API_KEY: 'abc' })).send({ channel: 'whatsapp', to: '919876543210', template: 'walkin_token', params: { clinic: 'C', token: 4, link: 'L' } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.interakt.ai/v1/public/message/');
    expect(init.headers.authorization).toBe('Basic abc');
    expect(JSON.parse(init.body)).toMatchObject({ countryCode: '+91', phoneNumber: '9876543210', type: 'Template', template: { name: 'walkin_token', bodyValues: ['C', '4', 'L'] } });
    expect(JSON.parse(init.body).template).not.toHaveProperty('buttonValues');
  });

  it('the OTP authentication template also carries the code as the copy-code button value', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await new WhatsAppBsp(cfg({ WHATSAPP_API_KEY: 'abc' })).send({ channel: 'whatsapp', to: '919876543210', template: 'otp', params: { code: '482915', minutes: 5 } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).template).toEqual({ name: 'otp', languageCode: 'hi', bodyValues: ['482915', '5'], buttonValues: { '0': ['482915'] } });
  });

  it('fails loudly on HTTP errors or a missing key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(new WhatsAppBsp(cfg({ WHATSAPP_API_KEY: 'k' })).send({ channel: 'whatsapp', to: '91', template: 'otp', params: {} })).rejects.toThrow(/500/);
    await expect(new WhatsAppBsp(cfg({})).send({ channel: 'whatsapp', to: '91', template: 'otp', params: {} })).rejects.toThrow(/WHATSAPP_API_KEY/);
  });
});
