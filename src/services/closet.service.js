const problem = (status, code, message) => Object.assign(new Error(message), { status, code });

const requiredText = (value, field) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw problem(400, 'CLOSET4001', `${field} 값이 필요합니다.`);
    }
    return value.trim();
};

const normalizeTags = (tags) => {
    if (tags === undefined) return undefined;
    if (!Array.isArray(tags)) throw problem(400, 'CLOSET4002', 'tags는 문자열 배열이어야 합니다.');
    const normalized = tags.map((tag) => requiredText(tag, 'tag'));
    if (new Set(normalized).size !== normalized.length) {
        throw problem(400, 'CLOSET4002', '중복된 태그는 사용할 수 없습니다.');
    }
    return normalized;
};

const toItemResponse = (item) => ({
    item_id: item.id,
    name: item.name,
    size: item.size,
    category: item.category,
    import_type: item.importType,
    tags: (item.tags || []).map((tag) => tag.tagName),
    image_url: `/api/v1/images/${item.imageId}/content`,
    created_at: item.createdAt,
    updated_at: item.updatedAt
});

export class ClosetService {
    constructor({ prisma, getPrisma }) {
        this.prisma = prisma;
        this.getPrisma = getPrisma;
    }

    get client() { return this.prisma || this.getPrisma(); }

    async requestSync(userId, { platform, isAgreed }) {
        const platformName = requiredText(platform, 'platform');
        if (isAgreed !== true) throw problem(400, 'CLOSET4003', '구매내역 조회 권한 동의가 필요합니다.');

        return this.client.$transaction(async (tx) => {
            const consent = await tx.consentLog.create({ data: { userId, target: platformName, isAgreed: true } });
            const savedPlatform = await tx.shoppingPlatform.upsert({
                where: { platformName }, update: {}, create: { platformName }
            });
            const session = await tx.importSession.create({
                data: { userId, platformId: savedPlatform.id, status: 'REQUESTED' }
            });
            return { sync_id: session.id, platform: savedPlatform.platformName, status: session.status, consent_id: consent.id };
        });
    }

    async registerItem(userId, payload) {
        const imageId = Number(payload.imageId);
        if (!Number.isSafeInteger(imageId) || imageId <= 0) throw problem(400, 'CLOSET4004', '유효한 imageId가 필요합니다.');
        const tags = normalizeTags(payload.tags) || [];
        const data = {
            userId,
            imageId,
            name: requiredText(payload.name, 'name'),
            size: requiredText(payload.size, 'size'),
            category: requiredText(payload.category, 'category'),
            importType: requiredText(payload.importType, 'importType')
        };

        return this.client.$transaction(async (tx) => {
            const image = await tx.imageAsset.findFirst({
                where: { id: imageId, userId, imageType: 'CLOSET_ITEM', status: 'ACTIVE', deletedAt: null },
                select: { id: true }
            });
            if (!image) throw problem(404, 'IMAGE4041', '사용할 수 있는 의류 이미지가 없습니다.');
            const item = await tx.closetItem.create({
                data: { ...data, tags: { create: tags.map((tagName) => ({ tagName })) } },
                include: { tags: true }
            });
            return toItemResponse(item);
        });
    }

    async listItems(userId, { category, keyword }) {
        const where = { userId };
        if (typeof category === 'string' && category.trim()) where.category = category.trim();
        if (typeof keyword === 'string' && keyword.trim()) where.name = { contains: keyword.trim() };
        const items = await this.client.closetItem.findMany({
            where, include: { tags: true }, orderBy: { createdAt: 'desc' }
        });
        return items.map(toItemResponse);
    }

    async getItem(userId, itemId) {
        const item = await this.client.closetItem.findFirst({
            where: { id: itemId, userId }, include: { tags: true }
        });
        if (!item) throw problem(404, 'CLOSET4041', '존재하지 않는 옷장 아이템입니다.');
        return toItemResponse(item);
    }

    async updateItem(userId, itemId, payload) {
        const tags = normalizeTags(payload.tags);
        const editable = ['name', 'size', 'category', 'importType'];
        const data = Object.fromEntries(editable
            .filter((key) => payload[key] !== undefined)
            .map((key) => [key, requiredText(payload[key], key)]));
        if (tags !== undefined) data.tags = { deleteMany: {}, create: tags.map((tagName) => ({ tagName })) };
        if (Object.keys(data).length === 0) throw problem(400, 'CLOSET4005', '수정할 항목이 필요합니다.');

        return this.client.$transaction(async (tx) => {
            const existing = await tx.closetItem.findFirst({ where: { id: itemId, userId }, select: { id: true } });
            if (!existing) throw problem(404, 'CLOSET4041', '존재하지 않는 옷장 아이템입니다.');
            const item = await tx.closetItem.update({ where: { id: itemId }, data, include: { tags: true } });
            return toItemResponse(item);
        });
    }

    async deleteItem(userId, itemId) {
        return this.client.$transaction(async (tx) => {
            const deleted = await tx.closetItem.deleteMany({ where: { id: itemId, userId } });
            if (deleted.count !== 1) throw problem(404, 'CLOSET4041', '존재하지 않는 옷장 아이템입니다.');
        });
    }
}
