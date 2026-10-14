import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { parseEnv } from '../../config/env';
import { LocalDiskStorage } from './local-disk.storage';
import { applicationObjectKey, assertSafeKey, InvalidObjectKeyError, ObjectNotFoundError } from './object-storage';
import { S3Storage } from './s3.storage';
import { s3OptionsFromEnv } from './storage.module';

describe('object keys', () => {
  it('builds tenant/application scoped random keys', () => {
    const a = applicationObjectKey('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
    const b = applicationObjectKey('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
    expect(a).toMatch(/^tenants\/[\w-]+\/applications\/[\w-]+\/[0-9a-f-]{36}$/);
    expect(a).not.toBe(b);
  });

  it.each(['', '/abs', '../x', 'a/../b', 'a//b', 'a/./b', 'a\\b', 'a/b.', '.hidden', 'a/b c', 'a/%2e%2e/b'])('rejects %j', (key) => {
    expect(() => assertSafeKey(key)).toThrow(InvalidObjectKeyError);
  });

  it('rejects a key longer than 512 characters', () => {
    expect(() => assertSafeKey('x'.repeat(600))).toThrow(InvalidObjectKeyError);
  });
});

describe('LocalDiskStorage', () => {
  let dir: string;
  let store: LocalDiskStorage;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'iskcon-store-'));
    store = new LocalDiskStorage(dir);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('stores, reads, checks and deletes', async () => {
    await store.put('tenants/t/applications/a/k1', Buffer.from('hello'), { mime: 'text/plain' });
    expect(await store.exists('tenants/t/applications/a/k1')).toBe(true);
    expect((await buffer(await store.get('tenants/t/applications/a/k1'))).toString()).toBe('hello');
    await store.put('tenants/t/applications/a/k2', Readable.from([Buffer.from('str'), Buffer.from('eam')]), { mime: 'x/y' });
    expect((await buffer(await store.get('tenants/t/applications/a/k2'))).toString()).toBe('stream');
    await store.delete('tenants/t/applications/a/k1');
    expect(await store.exists('tenants/t/applications/a/k1')).toBe(false);
    await store.delete('tenants/t/applications/a/k1'); // idempotent
  });

  it('refuses keys that could leave the directory and reports missing objects', async () => {
    await expect(store.put('../escape', Buffer.from('x'), { mime: 'x/y' })).rejects.toBeInstanceOf(InvalidObjectKeyError);
    await expect(store.get('a/../../etc/passwd')).rejects.toBeInstanceOf(InvalidObjectKeyError);
    await expect(store.get('missing/key')).rejects.toBeInstanceOf(ObjectNotFoundError);
    expect(await store.exists('missing/key')).toBe(false);
  });

  it('leaves no temporary file behind when a write fails', async () => {
    const broken = new Readable({ read() { this.destroy(new Error('boom')); } });
    await expect(store.put('t/a/bad', broken, { mime: 'x/y' })).rejects.toThrow('boom');
    expect(await readdir(join(dir, 't/a'))).toEqual([]);
  });
});

describe('S3Storage', () => {
  const options = { bucket: 'b', region: 'ap-south-1', serverSideEncryption: 'AES256' as const };

  it('sends the encryption header and content type on upload', async () => {
    const send = jest.fn().mockResolvedValue({});
    await new S3Storage(options, { send }).put('t/a/k', Buffer.from('x'), { mime: 'application/pdf' });
    const cmd = send.mock.calls[0]![0] as PutObjectCommand;
    expect(cmd.input).toMatchObject({ Bucket: 'b', Key: 't/a/k', ContentType: 'application/pdf', ServerSideEncryption: 'AES256' });
  });

  it('omits the header when the store has no encryption service', async () => {
    const send = jest.fn().mockResolvedValue({});
    await new S3Storage({ ...options, serverSideEncryption: null }, { send }).put('t/a/k', Buffer.from('x'), { mime: 'a/b' });
    expect((send.mock.calls[0]![0] as PutObjectCommand).input).not.toHaveProperty('ServerSideEncryption');
  });

  it('maps a missing key to ObjectNotFoundError and streams existing ones', async () => {
    const send = jest.fn(async (cmd: unknown) => {
      if (cmd instanceof GetObjectCommand) {
        if (cmd.input.Key === 'gone') throw Object.assign(new Error('x'), { name: 'NoSuchKey' });
        return { Body: Readable.from([Buffer.from('data')]) };
      }
      if (cmd instanceof HeadObjectCommand) throw Object.assign(new Error('x'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
      return {};
    });
    const s3 = new S3Storage(options, { send } as never);
    await expect(s3.get('gone')).rejects.toBeInstanceOf(ObjectNotFoundError);
    expect((await buffer(await s3.get('present'))).toString()).toBe('data');
    expect(await s3.exists('gone')).toBe(false);
    await expect(s3.put('../x', Buffer.from('x'), { mime: 'a/b' })).rejects.toBeInstanceOf(InvalidObjectKeyError);
  });

  it('derives its options from the environment', () => {
    const base = { DATABASE_URL: 'postgresql://x/y', APP_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'), S3_BUCKET: 'docs' };
    expect(s3OptionsFromEnv(parseEnv(base))).toMatchObject({ bucket: 'docs', serverSideEncryption: 'AES256' });
    expect(s3OptionsFromEnv(parseEnv({ ...base, S3_ENDPOINT: 'http://minio:9000', S3_FORCE_PATH_STYLE: 'true' }))).toMatchObject({
      forcePathStyle: true,
      serverSideEncryption: null,
    });
    expect(() => s3OptionsFromEnv(parseEnv({ ...base, S3_BUCKET: undefined }))).toThrow('S3_BUCKET');
    expect(() => parseEnv({ ...base, S3_SSE: 'weird' })).toThrow();
    expect(s3OptionsFromEnv(parseEnv({ ...base, S3_SSE: 'aws:kms' }))).toMatchObject({ serverSideEncryption: 'aws:kms' });
  });
});
