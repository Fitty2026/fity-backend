import { constants, createReadStream } from 'node:fs';
import {
    access,
    link,
    lstat,
    mkdir,
    readFile,
    realpath,
    unlink,
    writeFile
} from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ImageStorage } from './image-storage.js';

const isInside = (root, candidate) => (
    candidate === root || candidate.startsWith(`${root}${path.sep}`)
);

export class LocalImageStorage extends ImageStorage {
    constructor({ rootDirectory }) {
        super();

        if (typeof rootDirectory !== 'string' || rootDirectory.trim() === '') {
            throw new TypeError('rootDirectory is required.');
        }

        this.rootDirectory = path.resolve(rootDirectory);
    }

    validateKey(key) {
        if (typeof key !== 'string' || key.length === 0 || key.includes('\0')) {
            throw new TypeError('A non-empty storage key is required.');
        }

        if (path.isAbsolute(key) || key.includes('\\')) {
            throw new Error('Invalid storage key.');
        }

        const segments = key.split('/');
        if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
            throw new Error('Invalid storage key.');
        }

        return segments.join(path.sep);
    }

    resolveKey(key) {
        const safeKey = this.validateKey(key);
        const targetPath = path.resolve(this.rootDirectory, safeKey);

        if (!isInside(this.rootDirectory, targetPath) || targetPath === this.rootDirectory) {
            throw new Error('Invalid storage key.');
        }

        return targetPath;
    }

    async ensureSafeParent(targetPath) {
        await mkdir(this.rootDirectory, { recursive: true, mode: 0o700 });
        const realRoot = await realpath(this.rootDirectory);
        const parentDirectory = path.dirname(targetPath);
        await mkdir(parentDirectory, { recursive: true, mode: 0o700 });
        const realParent = await realpath(parentDirectory);

        if (!isInside(realRoot, realParent)) {
            throw new Error('Storage key resolves outside the storage root.');
        }

        return realParent;
    }

    async assertRegularFile(targetPath) {
        const stats = await lstat(targetPath);
        if (!stats.isFile() || stats.isSymbolicLink()) {
            throw new Error('Storage key does not reference a regular file.');
        }
    }

    async put({ key, buffer }) {
        if (!Buffer.isBuffer(buffer)) {
            throw new TypeError('buffer must be a Buffer.');
        }

        const targetPath = this.resolveKey(key);
        const parentDirectory = await this.ensureSafeParent(targetPath);
        const temporaryPath = path.join(parentDirectory, `.${path.basename(targetPath)}.${randomUUID()}.tmp`);

        try {
            await writeFile(temporaryPath, buffer, { flag: 'wx', mode: 0o600 });
            await link(temporaryPath, targetPath);
        } finally {
            await unlink(temporaryPath).catch((error) => {
                if (error.code !== 'ENOENT') {
                    throw error;
                }
            });
        }

        return { key };
    }

    async getBuffer(key) {
        const targetPath = this.resolveKey(key);
        await this.ensureSafeParent(targetPath);
        await this.assertRegularFile(targetPath);
        return readFile(targetPath);
    }

    async createReadStream(key) {
        const targetPath = this.resolveKey(key);
        await this.ensureSafeParent(targetPath);
        await this.assertRegularFile(targetPath);
        return createReadStream(targetPath);
    }

    async delete(key) {
        const targetPath = this.resolveKey(key);
        await this.ensureSafeParent(targetPath);

        try {
            await this.assertRegularFile(targetPath);
            await unlink(targetPath);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }

    async exists(key) {
        const targetPath = this.resolveKey(key);
        await this.ensureSafeParent(targetPath);

        try {
            await access(targetPath, constants.F_OK);
            await this.assertRegularFile(targetPath);
            return true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return false;
            }
            throw error;
        }
    }
}
