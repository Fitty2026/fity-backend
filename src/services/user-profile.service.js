const problem = (status, code, message) => Object.assign(new Error(message), { status, code });
const USER_FIELDS = new Set(['name', 'styleTags']);
const BODY_FIELDS = new Set(['heightCm', 'weightKg', 'bodyType']);

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const publicUser = (user) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    styleTags: user.styleTags,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
});

const publicBodyProfile = (profile) => ({
    id: profile.id,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg === null || profile.weightKg === undefined ? profile.weightKg : Number(profile.weightKg),
    bodyType: profile.bodyType,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
});

const validateStyleTags = (value) => {
    if (!Array.isArray(value) || value.length > 10 || value.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.trim().length > 60)) {
        throw problem(400, 'USER4003', 'styleTags는 최대 10개의 60자 이하 문자열 배열이어야 합니다.');
    }
    const tags = value.map((tag) => tag.trim());
    if (new Set(tags).size !== tags.length) throw problem(400, 'USER4003', 'styleTags에 중복된 값이 있습니다.');
    return tags;
};

const userUpdateData = (payload) => {
    const keys = Object.keys(payload).filter((key) => key !== 'userId');
    if (keys.length === 0 || keys.some((key) => !USER_FIELDS.has(key))) {
        throw problem(400, 'USER4002', '수정할 수 없는 사용자 필드가 포함되어 있습니다.');
    }
    const data = {};
    if (own(payload, 'name')) {
        if (payload.name !== null && (typeof payload.name !== 'string' || payload.name.trim().length > 191)) {
            throw problem(400, 'USER4002', 'name은 191자 이하 문자열 또는 null이어야 합니다.');
        }
        data.name = payload.name?.trim() || null;
    }
    if (own(payload, 'styleTags')) data.styleTags = validateStyleTags(payload.styleTags);
    return data;
};

const bodyProfileData = (payload) => {
    const keys = Object.keys(payload).filter((key) => key !== 'userId');
    if (keys.length === 0 || keys.some((key) => !BODY_FIELDS.has(key))) {
        throw problem(400, 'PROFILE4001', '수정할 수 없는 체형 프로필 필드가 포함되어 있습니다.');
    }
    const data = {};
    if (own(payload, 'heightCm')) {
        const heightCm = Number(payload.heightCm);
        if (!Number.isInteger(heightCm) || heightCm < 50 || heightCm > 300) throw problem(400, 'PROFILE4002', 'heightCm은 50~300 사이의 정수여야 합니다.');
        data.heightCm = heightCm;
    }
    if (own(payload, 'weightKg')) {
        const weightKg = Number(payload.weightKg);
        if (!Number.isFinite(weightKg) || weightKg < 10 || weightKg > 500) throw problem(400, 'PROFILE4003', 'weightKg은 10~500 사이의 숫자여야 합니다.');
        data.weightKg = weightKg;
    }
    if (own(payload, 'bodyType')) {
        if (payload.bodyType !== null && (typeof payload.bodyType !== 'string' || payload.bodyType.trim().length > 60)) {
            throw problem(400, 'PROFILE4004', 'bodyType은 60자 이하 문자열 또는 null이어야 합니다.');
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
        const user = await this.client.user.findUnique({ where: { id: userId } });
        if (!user) throw problem(404, 'USER4041', '존재하지 않는 사용자입니다.');
        return publicUser(user);
    }

    async updateUser(userId, payload) {
        try {
            return publicUser(await this.client.user.update({ where: { id: userId }, data: userUpdateData(payload) }));
        } catch (error) {
            if (error?.code === 'P2025') throw problem(404, 'USER4041', '존재하지 않는 사용자입니다.');
            throw error;
        }
    }

    async getBodyProfile(userId) {
        const profile = await this.client.bodyProfile.findUnique({ where: { userId } });
        if (!profile) throw problem(404, 'PROFILE4041', '체형 프로필이 없습니다.');
        return publicBodyProfile(profile);
    }

    async upsertBodyProfile(userId, payload) {
        const data = bodyProfileData(payload);
        const user = await this.client.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) throw problem(404, 'USER4041', '존재하지 않는 사용자입니다.');
        const profile = await this.client.bodyProfile.upsert({
            where: { userId },
            create: { userId, ...data },
            update: data
        });
        return publicBodyProfile(profile);
    }
}
