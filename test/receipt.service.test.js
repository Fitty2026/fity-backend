import assert from 'node:assert/strict';
import test from 'node:test';

import { ReceiptService } from '../src/services/receipt.service.js';
import { ImageUrlSigner } from '../src/services/image-url-signer.js';

const imageUrlSigner = new ImageUrlSigner({ secret: 'test-image-url-secret-at-least-32-characters', now: () => 1_800_000_000_000 });

test('ReceiptService는 DB를 사용하는 메서드가 호출되기 전까지 Prisma를 생성하지 않는다', async () => {
    let calls = 0;
    const service = new ReceiptService({
        getPrisma: () => {
            calls += 1;
            throw new Error('DB에 접근하면 안 됩니다.');
        }
    });

    await assert.rejects(
        service.processOcr({ files: [], importType: 'RECEIPT', platform: 'OFFLINE' }),
        (error) => error.code === 'OCR400_01'
    );
    assert.equal(calls, 0);
});

test('연관 이미지 조회는 현재 계약의 세 필드와 활성 아이템 조건을 사용한다', async () => {
    let receivedQuery;
    const prisma = {
        closetItem: {
            findMany: async (query) => {
                receivedQuery = query;
                return [{ imageId: 31 }, { imageId: 32 }];
            }
        }
    };
    const service = new ReceiptService({ prisma, imageUrlSigner });

    const result = await service.findRelatedImages({
        brand: 'Fitty',
        productName: '셔츠',
        colorHex: '#000080'
    });

    assert.match(result[0], /^\/api\/v1\/images\/31\/content\?expires=\d+&signature=[a-f0-9]{64}$/);
    assert.match(result[1], /^\/api\/v1\/images\/32\/content\?expires=\d+&signature=[a-f0-9]{64}$/);
    assert.deepEqual(receivedQuery.where, {
        brand: 'Fitty',
        name: '셔츠',
        colorHex: '#000080',
        imageId: { not: null },
        deletedAt: null
    });
    assert.equal(receivedQuery.take, 3);
});

test('일괄 저장은 트랜잭션에서 옷장 항목과 태그를 저장한다', async () => {
    const createdItems = [];
    const createdTags = [];
    const tx = {
        closetItem: {
            create: async ({ data }) => {
                createdItems.push(data);
                return { id: 41, ...data };
            }
        },
        itemTag: {
            createMany: async ({ data }) => createdTags.push(...data)
        }
    };
    const prisma = {
        user: { findUnique: async () => ({ id: 7 }) },
        $transaction: async (callback) => callback(tx)
    };
    const service = new ReceiptService({ prisma });

    const count = await service.saveBatchItems({
        userId: 7,
        items: [{
            imageId: '21',
            productName: '오버핏 셔츠',
            brand: 'Fitty',
            colorHex: '#FFFFFF',
            category: 'TOP',
            tags: ['캐주얼', '봄']
        }]
    });

    assert.equal(count, 1);
    assert.equal(createdItems[0].imageId, 21);
    assert.equal(createdItems[0].name, '오버핏 셔츠');
    assert.deepEqual(createdTags, [
        { closetItemId: 41, tagName: '캐주얼' },
        { closetItemId: 41, tagName: '봄' }
    ]);
});
