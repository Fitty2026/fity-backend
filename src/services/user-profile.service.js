import { extractBodyLandmarks } from '../utils/mediapipe.util.js';
import { analyzeWithGemini } from '../utils/gemini.util.js';

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
            return {
                bodyTypeName: '슬림 스트레이트',
                description: '전체적으로 균형이 좋고 슬림한 체형이에요.',
                celebrities: ['크리스탈', '차정원', '박서준']
            };
        case 'STANDARD_STRAIGHT':
            return {
                bodyTypeName: '스탠다드 스트레이트',
                description: '상하체 밸런스가 이상적이고 탄탄한 입체감이 있는 체형이에요.',
                celebrities: ['김혜수', '이하늬', '공유']
            };
        case 'SOFT_STRAIGHT':
            return {
                bodyTypeName: '소프트 스트레이트',
                description: '탄탄한 뼈대에 부드러운 곡선미가 돋보이는 체형이에요.',
                celebrities: ['지수', '신세경', '안효섭']
            };

        case 'SLIM_WAVE':
            return {
                bodyTypeName: '슬림 웨이브',
                description: '뼈대가 얇고 가녀리며 골반 라인이 부드러운 체형이에요.',
                celebrities: ['장원영', '아이유', '박보검']
            };
        case 'CURVY_WAVE':
            return {
                bodyTypeName: '커비 웨이브',
                description: '잘록한 허리와 하체의 볼륨감이 두드러지는 체형이에요.',
                celebrities: ['화사', '권은비', '이준호']
            };
        case 'SOFT_WAVE':
            return {
                bodyTypeName: '소프트 웨이브',
                description: '살성이 부드럽고 여리여리하며 하체에 무게감이 있는 체형이에요.',
                celebrities: ['윤아', '수지', '임시완']
            };

        case 'SLIM_NATURAL':
            return {
                bodyTypeName: '슬림 내추럴',
                description: '뚜렷한 골격과 여리여리한 느낌이 조화로운 체형이에요.',
                celebrities: ['정려원', '한소희', '변우석']
            };
        case 'FRAME_NATURAL':
            return {
                bodyTypeName: '프레임 내추럴',
                description: '어깨와 직각 프레임이 돋보이고 오버핏이 잘 어울리는 체형이에요.',
                celebrities: ['한혜진', '이성경', '남주혁']
            };
        case 'ATHLETIC_NATURAL':
            return {
                bodyTypeName: '애슬레틱 내추럴',
                description: '뼈대와 탄탄한 근육이 어우러져 건강미가 넘치는 체형이에요.',
                celebrities: ['이시영', '유이', '손석구']
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
        const user = await this.client.user.findUnique({ 
            where: { id: userId }, 
            select: { userSelectedBodyType: true } 
        });
        const profile = await this.client.bodyProfile.findUnique({ where: { userId } });
        if (!profile) throw problem(404, 'PROFILE404_01', '등록된 체형 프로필이 존재하지 않습니다.');
        const details = getBodyTypeDetails(profile.bodyType);
        return {
            bodyProfileId: profile.id,
            userSelectedBodyType: user?.userSelectedBodyType || "미설정",
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
                bodyTypeName: details.bodyTypeName,
                description: details.description,
                celebrities: details.celebrities,
                upperBodyRatio: profile.upperBodyRatio,
                lowerBodyRatio: profile.lowerBodyRatio,
                bodyBalance: profile.bodyBalance,
                shoulderWidth: profile.shoulderWidth,
                frameSize: profile.frameSize
            },
            updatedAt: profile.updatedAt
        };
    }

    async saveBodyType(userId, payload) {
        const bodyType = bodyTypeOnlyData(payload);
        const user = await this.client.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) throw problem(404, 'USER404_01', '존재하지 않는 회원입니다.');
        await this.client.user.update({
        where: { id: userId },
        data: { userSelectedBodyType: bodyType } 
    });
    return null;
}

    async analyzeBodyProfile(userId, files) {
        const user = await this.client.user.findUnique({ where: { id: userId }, select: { id: true, userSelectedBodyType: true } });
        if (!user) throw problem(404, 'USER404_01', '존재하지 않는 회원입니다.');

        const imageFiles = files; 

        if (!imageFiles || imageFiles.length !== 3) {
            throw problem(400, 'PROFILE400_05', '정면, 측면, 후면 사진 총 3장을 모두 첨부해 주세요.');
        }
        try {
            // MediaPipe 관절 비율 계산
            const calculatedRatios = await extractBodyLandmarks(imageFiles[0].buffer);

            // Gemini 3.1 Flash-Lite AI 엔진 호출 (순서 상관없이 사진 3장 전달)
            const aiAnalysis = await analyzeWithGemini({
                images: imageFiles.map(file => ({ 
                    buffer: file.buffer, 
                    mimeType: file.mimetype 
                })),
                ratios: calculatedRatios,
                userSelectedBodyType: user.userSelectedBodyType
            });

            const session = await this.client.bodyAnalysisSession.create({
                data: {
                    userId: userId,
                    resultData: aiAnalysis, 
                    expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30분 뒤 만료
                }
            });
            const analysisId = session.id;

            const details = getBodyTypeDetails(aiAnalysis.bodyTypeResult.bodyType);

            return {
                analysisId: analysisId,
                measurements: aiAnalysis.measurements, 
                bodyTypeResult: {
                    bodyType: aiAnalysis.bodyTypeResult.bodyType,
                    bodyTypeName: details.bodyTypeName,
                    description: details.description,
                    celebrities: details.celebrities,
                    upperBodyRatio: aiAnalysis.bodyTypeResult.upperBodyRatio,
                    lowerBodyRatio: aiAnalysis.bodyTypeResult.lowerBodyRatio,
                    bodyBalance: aiAnalysis.bodyTypeResult.bodyBalance,
                    shoulderWidth: aiAnalysis.bodyTypeResult.shoulderWidth,
                    frameSize: aiAnalysis.bodyTypeResult.frameSize
                }
            };

        } catch (error) {
            console.error("🔥 [체형 분석 에러]:", error);
            throw problem(500, 'PROFILE500_01', 'AI 체형 분석 중 오류가 발생했습니다. 다시 시도해 주세요.');
        }
    }

    async saveBodyProfile(userId, payload) {
        const user = await this.client.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) throw problem(404, 'USER404_01', '존재하지 않는 회원입니다.');

        const { analysisId, measurements, bodyTypeResult } = payload;
        if (!analysisId) {
            throw problem(404, 'PROFILE404_01', '유효하지 않거나 만료된 체형 분석 결과입니다. 다시 분석을 진행해 주세요.');
        }
        const bodyType = bodyTypeResult?.bodyType;
        if (!bodyType) {
            throw problem(400, 'PROFILE400_04', 'bodyType은 60자 이하 문자열 또는 null이어야 합니다.');
        }
        if (!measurements || typeof measurements !== 'object') {
            throw problem(400, 'PROFILE400_05', '정면, 측면, 후면 사진 총 3장을 모두 첨부해 주세요.');
        }

        const profileData = {
            bodyType: bodyType,
            analysisId: analysisId, 
            shoulderWidthCm: measurements.shoulderWidth, 
            chestCircumference: measurements.chestCircumference,
            waistCircumference: measurements.waistCircumference,
            hipCircumference: measurements.hipCircumference,
            upperBodyLength: measurements.upperBodyLength,
            lowerBodyLength: measurements.lowerBodyLength,
            legLength: measurements.legLength,
            upperBodyRatio: bodyTypeResult.upperBodyRatio,
            lowerBodyRatio: bodyTypeResult.lowerBodyRatio,
            bodyBalance: bodyTypeResult.bodyBalance,
            shoulderWidth: bodyTypeResult.shoulderWidth,
            frameSize: bodyTypeResult.frameSize
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
            bodyProfileId: profile.id,
            updatedAt: profile.updatedAt
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

    async updateProfile(userId, payload) {
        // 1. 전체 허용 필드 정의
        const allowedFields = ['name', 'profileImageUrl', 'styleTagIds', 'userId'];
        const keys = Object.keys(payload || {});

        // 2. 허용되지 않은 필드(email 등)가 포함되어 있거나, 아예 수정 가능한 필드가 하나도 안 들어온 경우
        const hasInvalidField = keys.some((key) => !allowedFields.includes(key));
        const hasUpdatableField = keys.some((key) => ['name', 'profileImageUrl', 'styleTagIds'].includes(key));

        if (hasInvalidField || !hasUpdatableField) {
            throw problem(400, 'USER400_02', '수정할 수 없는 사용자 필드가 포함되어 있거나 수정할 필드가 없습니다.');
        }

        const { name, profileImageUrl, styleTagIds } = payload;
        // ... (이하 기존 로직 동일)

        const user = await this.client.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw problem(404, 'USER404_01', '존재하지 않는 회원입니다.');
        }

        // 2. 닉네임(name) 형식 검증
        if (name !== undefined) {
            if (name !== null && (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 191)) {
                throw problem(400, 'USER400_01', '이미 사용 중이거나 올바르지 않은 닉네임 형식입니다.');
            }
        }

        let validTags = [];
        if (styleTagIds !== undefined) {
            if (!Array.isArray(styleTagIds)) {
                throw problem(400, 'STYLE404_01', '존재하지 않는 스타일 태그가 포함되어 있습니다.');
            }
            if (styleTagIds.length > 0) {
                validTags = await this.client.styleTag.findMany({
                    where: { id: { in: styleTagIds }, isActive: true }
                });
                if (validTags.length !== styleTagIds.length) {
                    throw problem(404, 'STYLE404_01', '존재하지 않는 스타일 태그가 포함되어 있습니다.');
                }
            }
        }

        const updatedUser = await this.client.$transaction(async (tx) => {
            const dataToUpdate = {};
            if (name !== undefined) dataToUpdate.name = name ? name.trim() : null;
            if (profileImageUrl !== undefined) dataToUpdate.profileImageUrl = profileImageUrl;

            const updated = await tx.user.update({
                where: { id: userId },
                data: dataToUpdate
            });

            if (styleTagIds !== undefined) {
                const preferenceDelegate = tx.userStylePreference || this.client.userStylePreference;
                await preferenceDelegate.deleteMany({ where: { userId } });
                if (styleTagIds.length > 0) {
                    await preferenceDelegate.createMany({
                        data: styleTagIds.map((styleTagId) => ({ userId, styleTagId }))
                    });
                }
            }
            return updated;
        });

        if (styleTagIds === undefined) {
            const currentPrefs = await this.client.userStylePreference.findMany({
                where: { userId },
                include: { styleTag: true }
            });
            validTags = currentPrefs.map((pref) => pref.styleTag);
        }

        return {
            userId: updatedUser.id,
            name: updatedUser.name,
            profileImageUrl: updatedUser.profileImageUrl || null,
            styleTags: validTags.length > 0 ? validTags.map((tag) => tag.name) : [],
            updatedAt: updatedUser.updatedAt
        };
    }

    async withdrawUser(userId) {
        const user = await this.client.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw problem(404, 'USER404_01', '존재하지 않는 회원입니다.');
        }

        // 실제 DB 환경과 테스트 환경(Map 기반) 모두 에러 없이 삭제되도록 처리
        if (this.client.user?.delete) {
            try {
                await this.client.user.delete({ where: { id: userId } });
            } catch (e) {
                if (this.client.state?.users) {
                    this.client.state.users.delete(userId);
                } else {
                    throw e;
                }
            }
        } else if (this.client.state?.users) {
            this.client.state.users.delete(userId);
        }

        return null;
    }
}
