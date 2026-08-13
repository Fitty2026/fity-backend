const problem = (status, code, message) => Object.assign(new Error(message), { status, code });

const requiredText = (value, field) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw problem(400, 'CLOSET4001', `${field} 값이 필요합니다.`);
    }
    return value.trim();
};

const optionalText = (value, field) => {
    if (value === undefined || value === null) return value;
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw problem(400, 'CLOSET4001', `${field} 값은 문자열 또는 null이어야 합니다.`);
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

const toItemResponse = (item, imageUrlSigner) => ({
    item_id: item.id,
    imageId: item.imageId,
    name: item.name,
    brand: item.brand,
    colorText: item.colorText,
    colorHex: item.colorHex,
    subCategory: item.subCategory,
    memo: item.memo,
    category: item.category,
    import_type: item.importType,
    tags: (item.tags || []).map((tag) => tag.tagName),
    image_url: item.imageId ? imageUrlSigner.createSignedUrl(item.imageId) : null,
    created_at: item.createdAt,
    updated_at: item.updatedAt
});

export class ClosetService {
    constructor({ prisma, getPrisma, imageUrlSigner }) {
        this.prisma = prisma;
        this.getPrisma = getPrisma;
        this.imageUrlSigner = imageUrlSigner;
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
        const tags = normalizeTags(payload.tags);
        if (!tags || tags.length === 0) throw problem(400, 'CLOSET4002', 'tags는 한 개 이상 필요합니다.');
        const data = {
            userId,
            imageId,
            name: requiredText(payload.name, 'name'),
            category: requiredText(payload.category, 'category'),
            importType: requiredText(payload.importType, 'importType'),
            brand: payload.brand || null,
            colorText: payload.colorText || null,
            colorHex: payload.colorHex || null,
            subCategory: payload.subCategory || null,
            memo: payload.memo || null
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
            return toItemResponse(item, this.imageUrlSigner);
        });
    }

    async listItems(userId, { category, keyword }) {
        const allItems = await this.client.closetItem.findMany({
            where: { userId, deletedAt: null }
        });
        const category_count = allItems.reduce((acc, item) => {
            acc[item.category] = (acc[item.category] || 0) + 1;
            return acc;
        }, {});
        const where = { userId, deletedAt: null };
        if (typeof category === 'string' && category.trim()) where.category = category.trim();
        if (typeof keyword === 'string' && keyword.trim()) where.name = { contains: keyword.trim() };
        const items = await this.client.closetItem.findMany({
            where, 
            include: { tags: true }, 
            orderBy: { createdAt: 'desc' }
        });
        const closet_items = items
            .filter(item => !item.deletedAt)
            .map((item) => toItemResponse(item, this.imageUrlSigner));
        return {
            category_count,
            closet_items
        };
    }

    async getItem(userId, itemId) {
        const item = await this.client.closetItem.findFirst({
            where: { id: itemId, userId }, include: { tags: true }
        });
        if (!item || item.deletedAt) throw problem(404, 'CLOSET4041', '존재하지 않는 옷장 아이템입니다.');
        return toItemResponse(item, this.imageUrlSigner);
    }

    async updateItem(userId, itemId, payload) {
        const tags = normalizeTags(payload.tags);
        const data = {};

        const required = ['name', 'category', 'importType'];
        required.forEach(key => {
            if (payload[key] !== undefined) {
                data[key] = requiredText(payload[key], key);
            }
        });
        const optional = ['brand', 'colorText', 'colorHex', 'subCategory', 'memo'];
        optional.forEach(key => {
            if (payload[key] !== undefined) {
                // 프론트에서 빈 문자열('')이나 null을 보내면 DB에는 null로 비워서 저장
                data[key] = (payload[key] === '' || payload[key] === null) ? null : payload[key];
            }
        });

        if (tags !== undefined) data.tags = { deleteMany: {}, create: tags.map((tagName) => ({ tagName })) };
        if (Object.keys(data).length === 0) throw problem(400, 'CLOSET4005', '수정할 항목이 필요합니다.');

        return this.client.$transaction(async (tx) => {
            const existing = await tx.closetItem.findFirst({ 
                where: { id: itemId, userId }, 
                select: { id: true, deletedAt: true } 
            });
            if (!existing || existing.deletedAt) throw problem(404, 'CLOSET4041', '존재하지 않는 옷장 아이템입니다.');
            const item = await tx.closetItem.update({ where: { id: itemId }, data, include: { tags: true } });
            return toItemResponse(item, this.imageUrlSigner);
        });
    }

    async deleteItem(userId, itemId) {
        return this.client.$transaction(async (tx) => {
            const existing = await tx.closetItem.findFirst({ where: { id: itemId, userId }, select: { id: true, deletedAt: true } });
            if (!existing || existing.deletedAt) throw problem(404, 'CLOSET4041', '존재하지 않는 옷장 아이템이거나 이미 삭제되었습니다.');
            
            await tx.closetItem.update({ 
                where: { id: itemId },
                data: { deletedAt: new Date() } 
            });
        });
    }

    //아이템복구
    async restoreItem(userId, itemId) {
        return this.client.$transaction(async (tx) => {
            const existing = await tx.closetItem.findFirst({ 
                where: { id: itemId, userId }, 
                select: { id: true, deletedAt: true } 
            });
            if (!existing || !existing.deletedAt) throw problem(404, 'CLOSET4041', '휴지통에 존재하지 않는 아이템입니다.');
            
            const item = await tx.closetItem.update({ 
                where: { id: itemId }, 
                data: { deletedAt: null }, 
                include: { tags: true } 
            });
            return toItemResponse(item, this.imageUrlSigner);
        });
    }
    //영구삭제
    async permanentDelete(userId, itemId) {
        return this.client.$transaction(async (tx) => {
            const existing = await tx.closetItem.findFirst({ 
                where: { id: itemId, userId },
                select: { id: true, deletedAt: true }
            });
            if (!existing || !existing.deletedAt) throw problem(404, 'CLOSET4041', '휴지통에 존재하지 않는 아이템입니다.');

            await tx.closetItem.delete({ 
                where: { id: itemId } 
            });
        });
    }
}
