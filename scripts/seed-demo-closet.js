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

try {
    const results = await service.seedAllUsers();
    const created = results.reduce((sum, result) => sum + (result.seeded ? result.count : 0), 0);
    console.log(`Demo closet sync complete: ${created} items added for ${results.length} users.`);
} finally {
    await disconnectPrisma();
}
