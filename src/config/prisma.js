import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

let prismaClient;

export const getPrisma = () => {
    if (prismaClient) {
        return prismaClient;
    }

    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL 환경 변수가 필요합니다.');
    }

    const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
    prismaClient = new PrismaClient({ adapter });
    return prismaClient;
};

export const disconnectPrisma = async () => {
    if (!prismaClient) {
        return;
    }

    await prismaClient.$disconnect();
    prismaClient = undefined;
};
