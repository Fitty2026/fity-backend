const problem = (status, code, message) => Object.assign(new Error(message), { status, code });
const USER_FIELDS = new Set(['name']);
const BODY_FIELDS = new Set(['bodyBalance', 'shoulderWidth', 'frameSize']);
const BODY_BALANCE_VALUES = new Set(['UPPER_BODY_DEVELOPED', 'BALANCED', 'LOWER_BODY_DEVELOPED']);
const SHOULDER_WIDTH_VALUES = new Set(['NARROW', 'AVERAGE', 'WIDE']);
const FRAME_SIZE_VALUES = new Set(['SMALL', 'MEDIUM', 'LARGE']);
const REQUIRED_AGREEMENT_TARGETS = new Set(['TERMS_OF_SERVICE', 'PRIVACY_POLICY']);
const OPTIONAL_AGREEMENT_TARGETS = new Set(['MARKETING', 'AI_USAGE']);
const AGREEMENT_TARGETS = new Set([...REQUIRED_AGREEMENT_TARGETS, ...OPTIONAL_AGREEMENT_TARGETS]);

const ALLOWED_BODY_TYPES = new Set(['STRAIGHT', 'WAVE', 'NATURAL']);

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

// const publicBodyProfile = (profile) => ({
//     id: profile.id,
//     bodyBalance: profile.bodyBalance,
//     shoulderWidth: profile.shoulderWidth,
//     frameSize: profile.frameSize,
//     createdAt: profile.createdAt,
//     updatedAt: profile.updatedAt
// });

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
    if (keys.length !== 1 || keys[0] !== 'styleTagIds') {
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


const getBodyTypeDetails = (bodyType) => {
    switch (bodyType) {
        case 'SLIM_STRAIGHT':
        case 'STRAIGHT':
            return {
                bodyTypeName: '슬림 스트레이트',
                description: '전체적으로 균형이 좋고 슬림한 체형이에요',
                celebrities: ['강민경', '크리스탈', '차정원'],
                upperBodyRatio: 47,
                lowerBodyRatio: 53
            };
        case 'WAVE':
            return {
                bodyTypeName: '웨이브 체형',
                description: '목이 가늘고 길며 상체보다 하체에 볼륨이 실리는 체형이에요',
                celebrities: ['윤아', '수지', '웬디'],
                upperBodyRatio: 45,
                lowerBodyRatio: 55
            };
        case 'NATURAL':
        default:
            return {
                bodyTypeName: '내추럴 체형',
                description: '뼈와 관절 프레임이 굵직하며 골격감이 돋보이는 체형이에요',
                celebrities: ['한혜진', '김고은', '정려원'],
                upperBodyRatio: 50,
                lowerBodyRatio: 50
            };
    }
};

const stubDetailedBodyAnalysis = (seedNumber) => {
    const types = ['SLIM_STRAIGHT', 'WAVE', 'NATURAL'];
    const balances = ['UPPER_BODY_DEVELOPED', 'BALANCED', 'LOWER_BODY_DEVELOPED'];
    const shoulders = ['NARROW', 'AVERAGE', 'WIDE'];
    const frames = ['SMALL', 'MEDIUM', 'LARGE'];

    const chosenType = types[seedNumber % types.length];
    
    return {
        analysisId: seedNumber * 100 + 7,
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
            bodyType: chosenType,
            ...getBodyTypeDetails(chosenType),
            bodyBalance: balances[seedNumber % balances.length],
            shoulderWidth: shoulders[seedNumber % shoulders.length],
            frameSize: frames[seedNumber % frames.length]
        }
    };
};

const LEGACY_AGREEMENT_KEY_TARGETS = {
    termsOfService: 'TERMS_OF_SERVICE',
    privacyPolicy: 'PRIVACY_POLICY',
    aiUsage: 'AI_USAGE',
    marketing: 'MARKETING'
};

const normalizeAgreements = (raw) => {
    if (Array.isArray(raw)) {
        return raw;
    }
    if (raw && typeof raw === 'object') {
        return Object.entries(raw).map(([key, isAgreed]) => ({
            target: LEGACY_AGREEMENT_KEY_TARGETS[key],
            isAgreed
        }));
    }
    return null;
};

const agreementInput = (payload) => {
    const keys = Object.keys(payload).filter((key) => key !== 'userId');
    const agreementsInput = keys.length === 1 && keys[0] === 'agreements' ? normalizeAgreements(payload.agreements) : null;
    if (!Array.isArray(agreementsInput) || agreementsInput.length === 0) {
        throw problem(400, 'AGREE400_01', '약관 동의 정보가 필수 항목입니다.');
    }

    const seen = new Set();
    const agreements = agreementsInput.map((entry) => {
        const target = entry?.target;
        const isAgreed = entry?.isAgreed;
        if (!AGREEMENT_TARGETS.has(target) || typeof isAgreed !== 'boolean') {
            throw problem(400, 'AGREE400_01', '약관 동의 정보가 올바르지 않습니다.');
        }
        if (seen.has(target)) {
            throw problem(400, 'AGREE400_01', '중복된 약관 target이 포함되어 있습니다.');
        }
        seen.add(target);
        return { target, isAgreed };
    });

    const requiredChecks = [
        { target: 'TERMS_OF_SERVICE', code: 'AGREE400_02', msg: '이용 약관 동의는 필수 항목입니다.' },
        { target: 'PRIVACY_POLICY', code: 'AGREE400_03', msg: '개인정보 수집 및 이용 동의는 필수 항목입니다.' },
        { target: 'AI_USAGE', code: 'AGREE400_04', msg: 'AI 생성 및 이미지 활용 동의는 필수 항목입니다.' }
    ];

    for (const check of requiredChecks) {
        const entry = agreements.find((agreement) => agreement.target === check.target);
        if (!entry || !entry.isAgreed) {
            throw problem(400, check.code, check.msg);
        }
    }

    return agreements;
};

const bodyTypeOnlyData = (payload) => {
    const keys = Object.keys(payload).filter((key) => key !== 'userId');
    if (keys.length !== 1 || keys[0] !== 'bodyType') {
        throw problem(400, 'PROFILE400_01', '수정할 수 없는 체형 프로필 필드가 포함되어 있습니다.');
    }
    const bodyType = payload.bodyType?.trim();
    if (!bodyType || bodyType.length > 60 || !ALLOWED_BODY_TYPES.has(bodyType)) {
        throw problem(400, 'PROFILE400_04', 'bodyType은 60자 이하 문자열 또는 null이어야 합니다.');
    }
    return bodyType;
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
        if (!user) throw problem(404, 'USER404_01', '존재하지 않는 회원입니다.');
        return publicUser(user);
    }

    async updateUser(userId, payload) {
        try {
            await this.client.user.update({ where: { id: userId }, data: userUpdateData(payload) });
            return this.getUser(userId);
        } catch (error) {
            if (error?.code === 'P2025') throw problem(404, 'USER404_01', '존재하지 않는 회원입니다.');
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
        if (!user) throw problem(404, 'USER404_01', '존재하지 않는 회원입니다.');

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

            return { userId, styleTagIds, styles };
        });
    }

    async getBodyProfile(userId) {
        const profile = await this.client.bodyProfile.findUnique({ where: { userId } });
        if (!profile) throw problem(404, 'PROFILE404_01', '등록된 체형 프로필이 존재하지 않습니다.');
        return {
            bodyProfileId: profile.id,
            measurements: {
                shoulderWidth: profile.shoulderWidthCm,
                chestCircumference: profile.chestCircumference,
                waistCircumference: profile.waistCircumference,
                hipCircumference: profile.hipCircumference,
                upperBodyLength: profile.upperBodyLength,
                lowerBodyLength: profile.lowerBodyLength,
                legLength: profile.legLength
            },
            bodyTypeResult: {
                bodyType: profile.bodyType,
                ...getBodyTypeDetails(profile.bodyType),
                bodyBalance: profile.bodyBalance,
                shoulderWidth: profile.shoulderWidth,
                frameSize: profile.frameSize
            }
        };
    }

    async saveBodyType(userId, payload) {
        const bodyType = bodyTypeOnlyData(payload);
        const user = await this.client.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) throw problem(404, 'USER404_01', '존재하지 않는 회원입니다.');
        await this.client.bodyProfile.upsert({
        where: { userId },
        create: { userId, bodyType },
        update: { bodyType }
    });
    return null;
}

    async analyzeBodyProfile(userId, files) {
        const user = await this.client.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) throw problem(404, 'USER404_01', '존재하지 않는 회원입니다.');

        const front = files?.frontImage?.[0];
        const side = files?.sideImage?.[0];
        const back = files?.backImage?.[0];

        if (!front || !side || !back) {
            throw problem(400, 'PROFILE400_05', '정면, 측면, 후면 사진 총 3장을 모두 첨부해 주세요.');
        }

        // TODO: 향후 이 부분에 실제 S3 이미지 업로드 및 AI 서버 연동 로직이 들어갑니다.
        // 현재는 프론트엔드 UI 연동 테스트를 위해 명세서 규격과 똑같은 Mock 데이터를 반환합니다.

        const mockResult = stubDetailedBodyAnalysis(userId);

        return mockResult; 
    }

    async saveBodyProfile(userId, payload) {
        const user = await this.client.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) throw problem(404, 'USER404_01', '존재하지 않는 회원입니다.');

        const existingProfile = await this.client.bodyProfile.findUnique({ where: { userId } });
        if (existingProfile && existingProfile.bodyType && existingProfile.analysisId) {
            throw problem(409, 'PROFILE409_01', '이미 체형 프로필이 등록되어 있습니다.');
        }

        const { analysisId, measurements, bodyType } = payload;

        if (!analysisId) {
            throw problem(404, 'PROFILE404_01', '유효하지 않거나 만료된 체형 분석 결과입니다. 다시 분석을 진행해 주세요.');
        }
        if (!bodyType) {
            throw problem(400, 'PROFILE400_04', 'bodyType은 60자 이하 문자열 또는 null이어야 합니다.');
        }
        if (!measurements || typeof measurements !== 'object') {
            throw problem(400, 'PROFILE400_05', '정면, 측면, 후면 사진 총 3장을 모두 첨부해 주세요.');
        }

        const profileData = {
            bodyType: bodyType,
            analysisId: analysisId, 
            shoulderWidthCm: measurements.shoulderWidth, // 프론트의 shoulderWidth(숫자)를 DB의 shoulderWidthCm에 매핑
            chestCircumference: measurements.chestCircumference,
            waistCircumference: measurements.waistCircumference,
            hipCircumference: measurements.hipCircumference,
            upperBodyLength: measurements.upperBodyLength,
            lowerBodyLength: measurements.lowerBodyLength,
            legLength: measurements.legLength
        };

        const profile = await this.client.bodyProfile.upsert({
            where: { userId },
            create: {
                userId,
                ...profileData
            },
            update: profileData
        });

        return {
            bodyProfileId: profile.id
        };
    }

    async saveAgreements(userId, payload) {
        const agreements = agreementInput(payload);
        const user = await this.client.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) throw problem(404, 'USER404_01', '존재하지 않는 회원입니다.');
        await this.client.consentLog.createMany({
            data: agreements.map(({ target, isAgreed }) => ({ userId, target, isAgreed }))
        });
        return null;
    }
}
