import request from 'supertest';
import { createTestApp, TestApp } from './helpers/app.js';

describe('Auth (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    await t.redis.flushdb();
    await t.ds.query('TRUNCATE otp_requests, users RESTART IDENTITY CASCADE');
  });

  const http = () => request(t.app.getHttpServer());
  const mobile = '9876543210';
  const e164 = '919876543210';

  it('rejects unauthenticated access to protected routes', async () => {
    await http().get('/auth/me').expect(401);
  });

  it('session probe never 401s and renews from the refresh cookie', async () => {
    expect((await http().get('/auth/session').expect(200)).body).toEqual({ user: null });
    await http().post('/auth/otp/send').send({ mobile }).expect(204);
    const res = await http().post('/auth/otp/verify').send({ mobile, code: t.notifier.lastOtp(e164) }).expect(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect((await http().get('/auth/session').set('Cookie', cookies).expect(200)).body.user.mobile).toBe(e164);
    const refreshOnly = cookies.filter((c) => c.startsWith('refresh_token='));
    const renewed = await http().get('/auth/session').set('Cookie', refreshOnly).expect(200);
    expect(renewed.body.user.mobile).toBe(e164);
    expect((renewed.headers['set-cookie'] as unknown as string[]).some((c) => c.startsWith('access_token='))).toBe(true);
  });

  it('health is public', async () => {
    await http().get('/health').expect(200, { status: 'ok' });
  });

  it('OTP login creates a patient, sets httpOnly cookies and /me works', async () => {
    await http().post('/auth/otp/send').send({ mobile }).expect(204);
    const code = t.notifier.lastOtp(e164);
    const res = await http().post('/auth/otp/verify').send({ mobile, code }).expect(200);
    expect(res.body.role).toBe('patient');
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('access_token=') && c.includes('HttpOnly'))).toBe(true);

    const me = await http().get('/auth/me').set('Cookie', cookies).expect(200);
    expect(me.body.mobile).toBe(e164);
  });

  it('stores only a hash of the OTP', async () => {
    await http().post('/auth/otp/send').send({ mobile }).expect(204);
    const code = t.notifier.lastOtp(e164);
    const [row] = await t.ds.query('SELECT code_hash FROM otp_requests');
    expect(row.code_hash).not.toContain(code);
    expect(row.code_hash).toHaveLength(64);
  });

  it('wrong code is rejected and OTP locks after 5 attempts', async () => {
    await http().post('/auth/otp/send').send({ mobile }).expect(204);
    const code = t.notifier.lastOtp(e164);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await http().post('/auth/otp/verify').send({ mobile, code: wrong }).expect(400);
    await http().post('/auth/otp/verify').send({ mobile, code }).expect(400);
  });

  it('an OTP can only be used once', async () => {
    await http().post('/auth/otp/send').send({ mobile }).expect(204);
    const code = t.notifier.lastOtp(e164);
    await http().post('/auth/otp/verify').send({ mobile, code }).expect(200);
    await http().post('/auth/otp/verify').send({ mobile, code }).expect(400);
  });

  it('expired OTP is rejected', async () => {
    await http().post('/auth/otp/send').send({ mobile }).expect(204);
    const code = t.notifier.lastOtp(e164);
    t.clock.advanceMs(6 * 60 * 1000);
    await http().post('/auth/otp/verify').send({ mobile, code }).expect(400);
    t.clock.advanceMs(-6 * 60 * 1000);
  });

  it('rate limits to 3 OTPs per mobile per hour', async () => {
    for (let i = 0; i < 3; i++) await http().post('/auth/otp/send').send({ mobile }).expect(204);
    await http().post('/auth/otp/send').send({ mobile }).expect(429);
  });

  it('rate limits per IP (10/day)', async () => {
    for (let i = 0; i < 10; i++) {
      await http().post('/auth/otp/send').send({ mobile: `98765432${String(10 + i)}` }).expect(204);
    }
    await http().post('/auth/otp/send').send({ mobile: '9876543299' }).expect(429);
  });

  it('rejects invalid mobiles', async () => {
    await http().post('/auth/otp/send').send({ mobile: '12345' }).expect(400);
    await http().post('/auth/otp/send').send({ mobile: '1234567890' }).expect(400);
  });

  it('refresh issues a new session; logout clears cookies', async () => {
    await http().post('/auth/otp/send').send({ mobile }).expect(204);
    const res = await http().post('/auth/otp/verify').send({ mobile, code: t.notifier.lastOtp(e164) }).expect(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    await http().post('/auth/refresh').set('Cookie', cookies).expect(200);
    await http().post('/auth/refresh').expect(401);
    await http().post('/auth/logout').expect(204);
  });

  it('disabled users cannot log in', async () => {
    await t.ds.query(`INSERT INTO users (role, mobile, is_active) VALUES ('patient', $1, false)`, [e164]);
    await http().post('/auth/otp/send').send({ mobile }).expect(204);
    await http().post('/auth/otp/verify').send({ mobile, code: t.notifier.lastOtp(e164) }).expect(403);
  });
});
