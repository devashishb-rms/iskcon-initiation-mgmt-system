// Runs before every test file: points the app at the test database with throwaway secrets.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:5433/iskcon_test';
process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.LOG_LEVEL = 'silent';
process.env.OUTBOX_ENABLED = 'false';
process.env.SCHEDULER_ENABLED = 'false';
process.env.STORAGE_LOCAL_DIR = process.env.STORAGE_LOCAL_DIR ?? '/tmp/iskcon-test-storage';
process.env.DEFAULT_TENANT_SLUG = 'default-test';
