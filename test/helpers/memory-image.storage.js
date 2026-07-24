import { Readable } from 'node:stream';
import { ImageStorage } from '../../src/storage/image-storage.js';

export class MemoryImageStorage extends ImageStorage {
    constructor() {
        super();
        this.files = new Map();
    }

    async put({ key, buffer, mimeType }) {
        if (this.files.has(key)) {
            const error = new Error('Storage key already exists.');
            error.code = 'EEXIST';
            throw error;
        }
        if (!Buffer.isBuffer(buffer)) {
            throw new TypeError('buffer must be a Buffer.');
        }

        this.files.set(key, {
            buffer: Buffer.from(buffer),
            mimeType: mimeType ?? null
        });
        return { key };
    }

    async getBuffer(key) {
        const file = this.files.get(key);
        if (!file) {
            const error = new Error('Storage key was not found.');
            error.code = 'ENOENT';
            throw error;
        }
        return Buffer.from(file.buffer);
    }

    async createReadStream(key) {
        return Readable.from(await this.getBuffer(key));
    }

    async delete(key) {
        this.files.delete(key);
    }

    async exists(key) {
        return this.files.has(key);
    }
}
