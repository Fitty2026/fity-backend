const problem = (status, code, message) => Object.assign(new Error(message), { status, code });
const USER_FIELDS = new Set(['name']);
const BODY_FIELDS = new Set(['bodyBalance', 'shoulderWidth', 'frameSize']);
const BODY_BALANCE_VALUES = new Set(['UPPER_BODY_DEVELOPED', 'BALANCED', 'LOWER_BODY_DEVELOPED']);
const SHOULDER_WIDTH_VALUES = new Set(['NARROW', 'AVERAGE', 'WIDE']);
const FRAME_SIZE_VALUES = new Set(['SMALL', 'MEDIUM', 'LARGE']);
const REQUIRED_AGREEMENT_TARGETS = new Set(['TERMS_OF_SERVICE', 'PRIVACY_POLICY']);
const OPTIONAL_AGREEMENT_TARGETS = new Set(['MARKETING']);
const AGREEMENT_TARGETS = new Set([...REQUIRED_AGREEMENT_TARGETS, ...OPTIONAL_AGREEMENT_TARGETS]);

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const publicUser = (user) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    styleTags: user.styleTags,
    styleTagIds: (user.stylePreferences || []).map((preference) => preference.styleTagId),
    styles: (user.stylePreferences || []).map((preference) => preference.styleTag),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
});

const publicBodyProfile = (profile) => ({
    id: profile.id,
    bodyBalance: profile.bodyBalance,
    shoulderWidth: profile.shoulderWidth,
    frameSize: profile.frameSize,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
});

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
    return data;
};

const onboardingStyleIds = (payload) => {
    const keys = Object.keys(payload).filter((key) => key !== 'userId');
    if (keys.length !== 1 || keys[0] !== 'styleTagIds') {
        throw problem(400, 'STYLE400_01', 'styleTagIds만 전달해야 합니다.');
    }

    const ids = payload.styleTagIds;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 6
        || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
        || new Set(ids).size !== ids.length) {
        throw problem(400, 'STYLE400_02', 'styleTagIds는 1~6개의 중복 없는 양의 정수 ID 배열이어야 합니다.');
    }
    return ids;
};

const bodyTypeData = (payload) => {
    const keys = Object.keys(payload).filter((key) => key !== 'userId');
    if (keys.length !== BODY_FIELDS.size || keys.some((key) => !BODY_FIELDS.has(key))) {
        throw problem(400, 'PROFILE4001', 'bodyBalance, shoulderWidth, frameSize를 모두 전달해야 합니다.');
    }
    if (!BODY_BALANCE_VALUES.has(payload.bodyBalance)) {
        throw problem(400, 'PROFILE4002', 'bodyBalance 값이 올바르지 않습니다.');
    }
    if (!SHOULDER_WIDTH_VALUES.has(payload.shoulderWidth)) {
        throw problem(400, 'PROFILE4003', 'shoulderWidth 값이 올바르지 않습니다.');
    }
    if (!FRAME_SIZE_VALUES.has(payload.frameSize)) {
        throw problem(400, 'PROFILE4004', 'frameSize 값이 올바르지 않습니다.');
    }
    return {
        bodyBalance: payload.bodyBalance,
        shoulderWidth: payload.shoulderWidth,
        frameSize: payload.frameSize
    };
};

const agreementInput = (payload) => {
    const keys = Object.keys(payload).filter((key) => key !== 'userId');
    if (keys.length !== 1 || keys[0] !== 'agreements' || !Array.isArray(payload.agreements) || payload.agreements.length === 0) {
        throw problem(400, 'AGREEMENT4001', 'agreements 배열을 전달해야 합니다.');
    }

    const seen = new Set();
    const agreements = payload.agreements.map((entry) => {
        const target = entry?.target;
        const isAgreed = entry?.isAgreed;
        if (!AGREEMENT_TARGETS.has(target) || typeof isAgreed !== 'boolean') {
            throw problem(400, 'AGREEMENT4002', 'target과 isAgreed(boolean)가 올바르지 않습니다.');
        }
        if (seen.has(target)) {
            throw problem(400, 'AGREEMENT4002', '중복된 약관 target이 포함되어 있습니다.');
        }
        seen.add(target);
        return { target, isAgreed };
    });

    for (const target of REQUIRED_AGREEMENT_TARGETS) {
        const entry = agreements.find((agreement) => agreement.target === target);
        if (!entry || !entry.isAgreed) {
            throw problem(400, 'AGREEMENT4003', `${target}는 필수 동의 항목입니다.`);
        }
    }

    return agreements;
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
        if (!user) throw problem(404, 'USER4041', '존재하지 않는 사용자입니다.');
        return publicUser(user);
    }

    async updateUser(userId, payload) {
        try {
            await this.client.user.update({ where: { id: userId }, data: userUpdateData(payload) });
            return this.getUser(userId);
        } catch (error) {
            if (error?.code === 'P2025') throw problem(404, 'USER4041', '존재하지 않는 사용자입니다.');
            throw error;
        }
    }

    async listStyleTags() {
        const tags = await this.client.styleTag.findMany({
            where: { isActive: true },
            orderBy: { displayOrder: 'asc' },
            select: { id: true, code: true, name: true, displayOrder: true }
        });
        return tags.map(({ id, code, name, displayOrder }) => ({ styleTagId: id, code, name, displayOrder }));
    }

    async saveOnboardingStyles(userId, payload) {
        const styleTagIds = onboardingStyleIds(payload);
        const user = await this.client.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) throw problem(404, 'USER4041', '존재하지 않는 사용자입니다.');

        return this.client.$transaction(async (tx) => {
            const activeTags = await tx.styleTag.findMany({
                where: { id: { in: styleTagIds }, isActive: true },
                select: { id: true, code: true, name: true, displayOrder: true }
            });
            if (activeTags.length !== styleTagIds.length) {
                throw problem(400, 'STYLE400_03', '존재하지 않거나 비활성화된 styleTagId가 포함되어 있습니다.');
            }

            const tagById = new Map(activeTags.map((tag) => [tag.id, tag]));
            const styles = styleTagIds.map((id) => tagById.get(id));

            await tx.userStylePreference.deleteMany({ where: { userId } });
            await tx.userStylePreference.createMany({
                data: styleTagIds.map((styleTagId) => ({ userId, styleTagId }))
            });

            return { userId, styleTagIds, styles };
        });
    }

    async getBodyProfile(userId) {
        const profile = await this.client.bodyProfile.findUnique({ where: { userId } });
        if (!profile) throw problem(404, 'PROFILE4041', '체형 프로필이 없습니다.');
        return publicBodyProfile(profile);
    }

    async saveBodyType(userId, payload) {
        const data = bodyTypeData(payload);
        const user = await this.client.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) throw problem(404, 'USER4041', '존재하지 않는 사용자입니다.');
        const profile = await this.client.bodyProfile.upsert({
            where: { userId },
            create: { userId, ...data },
            update: data
        });
        return publicBodyProfile(profile);
    }

    async saveAgreements(userId, payload) {
        const agreements = agreementInput(payload);
        const user = await this.client.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) throw problem(404, 'USER4041', '존재하지 않는 사용자입니다.');
        await this.client.consentLog.createMany({
            data: agreements.map(({ target, isAgreed }) => ({ userId, target, isAgreed }))
        });
        return null;
    }
}
