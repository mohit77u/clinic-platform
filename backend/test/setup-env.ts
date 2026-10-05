// Runs before any test module loads: points the app at the isolated test database.
process.env.DB_NAME = 'clinic_platform_test';
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = 'redis://localhost:6379/5';
process.env.RATE_LIMIT_PER_MIN = '100000';
