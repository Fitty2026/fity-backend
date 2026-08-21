import dotenv from 'dotenv';
dotenv.config();

import path from 'node:path';
import { getPrisma, disconnectPrisma } from '../src/config/prisma.js';
import { LocalImageStorage } from '../src/storage/local-image.storage.js';
import { DemoClosetService } from '../src/services/demo-closet.service.js';

const storage = new LocalImageStorage({
    rootDirectory: process.env.IMAGE_STORAGE_ROOT || path.resolve('var/images')
});
const service = new DemoClosetService({ getPrisma, storage });
const replace = process.argv.includes('--replace');

try {
    const results = await service.seedAllUsers({ replace });
    const created = results.reduce((sum, result) => sum + (result.seeded ? result.count : 0), 0);
    const removed = results.reduce((sum, result) => sum + result.removedCount, 0);
    console.log(`Demo closet sync complete: ${created} items added and ${removed} prior demo items replaced for ${results.length} users.`);
} finally {
    await disconnectPrisma();
}
