import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalImageStorage } from '../src/storage/local-image.storage.js';

const roots = [];

const createStorage = async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), 'fitty-images-'));
    roots.push(rootDirectory);
    return new LocalImageStorage({ rootDirectory });
};

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, {
        recursive: true,
        force: true
    })));
});

describe('LocalImageStorage', () => {
    it('writes, reads, and deletes a private file', async () => {
        const storage = await createStorage();
        const buffer = Buffer.from('image-bytes');

        await storage.put({ key: '7/asset-key', buffer, mimeType: 'image/png' });
        assert.deepEqual(await storage.getBuffer('7/asset-key'), buffer);
        assert.equal(await storage.exists('7/asset-key'), true);

        await storage.delete('7/asset-key');
        await storage.delete('7/asset-key');
        assert.equal(await storage.exists('7/asset-key'), false);
    });

    it('does not overwrite an existing storage key', async () => {
        const storage = await createStorage();
        await storage.put({ key: '1/same-key', buffer: Buffer.from('first') });

        await assert.rejects(
            storage.put({ key: '1/same-key', buffer: Buffer.from('second') }),
            (error) => error.code === 'EEXIST'
        );
        assert.deepEqual(await storage.getBuffer('1/same-key'), Buffer.from('first'));
    });

    it('rejects traversal and absolute storage keys', async () => {
        const storage = await createStorage();

        for (const key of ['../outside', '1/../../outside', '/tmp/outside', '1\\outside']) {
            await assert.rejects(storage.put({ key, buffer: Buffer.from('x') }));
        }
    });
});
