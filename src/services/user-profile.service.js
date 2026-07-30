const problem = (status, code, message) => Object.assign(new Error(message), { status, code });
const USER_FIELDS = new Set(['name']);
const BODY_FIELDS = new Set(['heightCm', 'weightKg', 'bodyType']);

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const publicUser = (user) => ({
    userId: user.id, 
    name: user.name,
    profileImageUrl: "https://s3.ap-northeast-2.amazonaws.com/fitty-bucket/profiles/user_1.jpg", 
    starBalance: 88, 
    bodyTypeName: "슬림 스트레이트 체형", 
    styleTags: (user.stylePreferences || []).map((preference) => preference.styleTag?.name || "캐주얼"), 
    stats: { 
        month: 6,
        registeredClothesCount: 17,
        generatedOutfitsCount: 11,
        savedOutfitsCount: 8
    }
});

const publicBodyProfile = (profile) => ({
    id: profile.id,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg === null || profile.weightKg === undefined ? profile.weightKg : Number(profile.weightKg),
    bodyType: profile.bodyType,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
});

const userUpdateData = (payload) => {
    const keys = Object.keys(payload).filter((key) => key !== 'userId');
    if (keys.length === 0 || keys.some((key) => !USER_FIELDS.has(key))) {
        throw problem(400, 'USER400_02', '수정할 수 없는 사용자 필드가 포함되어 있습니다.');
    }
    const data = {};
    if (own(payload, 'name')) {
        if (payload.name !== null && (typeof payload.name !== 'string' || payload.name.trim().length > 191)) {
            throw problem(400, 'USER400_01', '이미 사용 중이거나 올바르지 않은 닉네임 형식입니다.');
        }
        data.name = payload.name?.trim() || null;
    }
    return data;
};

const onboardingStyleIds = (payload) => {
    const keys = Object.keys(payload).filter((key) => key !== 'userId');
    
    if (keys.length === 0 || !keys.includes('styleTagIds')) {
        throw problem(400, 'STYLE400_01', '선택한 스타일 태그 데이터가 필수 항목입니다.');
    }

    const ids = payload.styleTagIds;
    
    if (!Array.isArray(ids) || ids.length === 0) {
        throw problem(400, 'STYLE400_02', '최소 1개 이상의 스타일 태그를 선택해야 합니다.');
    }

    if (ids.length > 6 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
        throw problem(400, 'STYLE400_04', '스타일 태그는 1~6개의 중복 없는 양의 정수 ID여야 합니다.');
    }
    
    return ids;
};

const bodyProfileData = (payload) => {
    const keys = Object.keys(payload).filter((key) => key !== 'userId');
    if (keys.length === 0 || keys.some((key) => !BODY_FIELDS.has(key))) {
        throw problem(400, 'PROFILE400_01', '수정할 수 없는 체형 프로필 필드가 포함되어 있습니다.');
    }
    const data = {};
    if (own(payload, 'heightCm')) {
        const heightCm = Number(payload.heightCm);
        if (!Number.isInteger(heightCm) || heightCm < 50 || heightCm > 300) throw problem(400, 'PROFILE400_02', 'heightCm은 50~300 사이의 정수여야 합니다.');
        data.heightCm = heightCm;
    }
    if (own(payload, 'weightKg')) {
        const weightKg = Number(payload.weightKg);
        if (!Number.isFinite(weightKg) || weightKg < 10 || weightKg > 500) throw problem(400, 'PROFILE400_03', 'weightKg은 10~500 사이의 숫자여야 합니다.');
        data.weightKg = weightKg;
    }
    if (own(payload, 'bodyType')) {
        if (payload.bodyType !== null && (typeof payload.bodyType !== 'string' || payload.bodyType.trim().length > 60)) {
            throw problem(400, 'PROFILE400_04','bodyType은 60자 이하 문자열 또는 null이어야 합니다.');
        }
        data.bodyType = payload.bodyType?.trim() || null;
    }
    return data;
};

export class UserProfileService {
    constructor({ prisma, getPrisma }) {
        this.prisma = prisma;
        this.getPrisma = getPrisma;
    }

    get client() { return this.prisma || this.getPrisma(); }

    async getUser(userId) {
        const user = await this.client.user.findUnique({
            where: { id: userId },
            include: {
                stylePreferences: {
                    orderBy: { styleTagId: 'asc' },
                    include: {
                        styleTag: {
                            select: { id: true, code: true, name: true, displayOrder: true }
                        }
                    }
                }
            }
        });
        if (!user) throw problem(404, 'USER404_01', '존재하지 않는 사용자입니다.');
        return publicUser(user);
    }

    async updateUser(userId, payload) {
        try {
            await this.client.user.update({ where: { id: userId }, data: userUpdateData(payload) });
            return this.getUser(userId);
        } catch (error) {
            if (error?.code === 'P2002') throw problem(400, 'USER400_01', '이미 사용 중이거나 올바르지 않은 닉네임 형식입니다.');
            if (error?.code === 'P2025') throw problem(404, 'USER404_01', '존재하지 않는 사용자입니다.');
            throw error;
        }
    }

    async listStyleTags() {
        const tags = await this.client.styleTag.findMany({
            where: { isActive: true },
            orderBy: { displayOrder: 'asc' },
            select: { id: true, code: true, name: true } 
        });

        return tags.map(tag => ({
            styleTagId: tag.id,
            code: tag.code,
            name: tag.name
        }));
    }

    async saveOnboardingStyles(userId, payload) {
        const styleTagIds = onboardingStyleIds(payload);
        const user = await this.client.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) throw problem(404, 'USER404_01', '존재하지 않는 사용자입니다.');

        return this.client.$transaction(async (tx) => {
            const activeTags = await tx.styleTag.findMany({
                where: { id: { in: styleTagIds }, isActive: true },
                select: { id: true, code: true, name: true, displayOrder: true }
            });
            if (activeTags.length !== styleTagIds.length) {
                throw problem(400, 'STYLE400_03', '존재하지 않는 스타일 태그 ID가 포함되어 있습니다.');
            }

            const tagById = new Map(activeTags.map((tag) => [tag.id, tag]));
            const styles = styleTagIds.map((id) => tagById.get(id));

            await tx.userStylePreference.deleteMany({ where: { userId } });
            await tx.userStylePreference.createMany({
                data: styleTagIds.map((styleTagId) => ({ userId, styleTagId }))
            });

            return null;
        });
    }

    async getBodyProfile(userId) {
        const profile = await this.client.bodyProfile.findUnique({ where: { userId } });
        if (!profile) throw problem(404, 'PROFILE404_01', '등록된 체형 프로필이 존재하지 않습니다.');
        
        return {
            bodyProfileId: profile.id,
            userSelectedBodyType: profile.bodyType || "NATURAL",
            bodyImage: profile.bodyImage || "https://s3.ap-northeast-2.amazonaws.com/fitty-bucket/",
            measurements: {
                shoulderWidth: 38.0,
                chestCircumference: 85.0,
                waistCircumference: 67.0,
                hipCircumference: 92.0,
                upperBodyLength: 61.0,
                lowerBodyLength: 61.0,
                legLength: 61.0
            },
            bodyTypeResult: {
                bodyType: "SLIM_STRAIGHT",
                bodyTypeName: "슬림 스트레이트",
                description: "전체적으로 균형이 좋고 슬림한 체형이에요",
                celebrities: ["강민경", "크리스탈", "차정원"],
                upperBodyRatio: 47,
                lowerBodyRatio: 53,
                bodyBalance: "BALANCED",
                shoulderWidth: "AVERAGE",
                frameSize: "MEDIUM"
            },
            updatedAt: profile.updatedAt ? profile.updatedAt.toISOString() : "2026-07-28T21:15:00"
        };
    }

    async upsertBodyProfile(userId, payload) {
        const data = bodyProfileData(payload);
        const user = await this.client.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) throw problem(404, 'USER404_01', '존재하지 않는 사용자입니다.');
        const profile = await this.client.bodyProfile.upsert({
            where: { userId },
            create: { userId, ...data },
            update: data
        });
        return publicBodyProfile(profile);
    }

    async saveBodyProfileType(userId, payload) {
        const data = bodyProfileData(payload);
        const user = await this.client.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) throw problem(404, 'USER404_01', '존재하지 않는 사용자입니다.');
        
        await this.client.bodyProfile.upsert({
            where: { userId },
            create: { userId, ...data },
            update: data
        });
        return null;
    }

    async analyzeBodyProfile(userId, images) {
        const user = await this.client.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) throw problem(404, 'USER404_01', '존재하지 않는 사용자입니다.');

        if (!images || !Array.isArray(images) || images.length !== 3) {
            throw problem(400, 'PROFILE400_03', '정면, 측면, 후면 사진 총 3장을 모두 첨부해 주세요.');
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        const isValidType = images.every(img => allowedTypes.includes(img.mimetype || img.type));
        if (!isValidType) {
            throw problem(400, 'PROFILE400_02', '지원하지 않는 이미지 파일 형식입니다.');
        }

        try{
            return {
            analysisId: 1024,
            measurements: {
                shoulderWidth: 38.0,
                chestCircumference: 85.0,
                waistCircumference: 67.0,
                hipCircumference: 92.0,
                upperBodyLength: 61.0,
                lowerBodyLength: 61.0,
                legLength: 61.0
            },
            bodyTypeResult: {
                bodyType: "SLIM_STRAIGHT",
                bodyTypeName: "슬림 스트레이트",
                description: "전체적으로 균형이 좋고 슬림한 체형이에요",
                celebrities: ["강민경", "크리스탈", "차정원"],
                upperBodyRatio: 47,
                lowerBodyRatio: 53,
                bodyBalance: "BALANCED",
                shoulderWidth: "AVERAGE",
                frameSize: "MEDIUM"
            }
        };
    } catch (error) {
            throw problem(500, 'PROFILE500_01', 'AI 체형 분석에 실패했습니다. 사진을 다시 촬영하거나 업로드해 주세요.');
        }
    }

    async saveBodyProfile(userId, payload) {
        const user = await this.client.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) throw problem(404, 'USER404_01', '존재하지 않는 사용자입니다.');

        const existingProfile = await this.client.bodyProfile.findUnique({ where: { userId } });
        if (existingProfile) {
            throw problem(409, 'PROFILE409_01', '이미 체형 프로필이 등록되어 있습니다.');
        }

        const profile = await this.client.bodyProfile.upsert({
            where: { userId },
            create: {
                userId,
                bodyType: payload.bodyType || null
            },
            update: {
                bodyType: payload.bodyType || undefined
            }
        });
        return { bodyProfileId: profile.id };
    }
}