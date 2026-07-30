import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const SALT_ROUNDS = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGIN_ID_PATTERN = /^[a-z0-9]+$/;
const SIGNUP_FIELDS = new Set(['name', 'loginId', 'email', 'password']);

const createRequestError = (message, code) => {
    const error = new Error(message);
    error.status = 400;
    error.code = code;
    return error;
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeLoginId = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';

const uniqueConstraintTarget = (error) => {
    const directTarget = Array.isArray(error?.meta?.target)
        ? error.meta.target.join(',')
        : String(error?.meta?.target || '');
    const adapterIndex = String(error?.meta?.driverAdapterError?.cause?.constraint?.index || '');
    return `${directTarget},${adapterIndex}`.toLowerCase();
};


const validateSignupInput = (input) => {
    const fields = Object.keys(input || {});
    if (fields.some((field) => !SIGNUP_FIELDS.has(field))) {
        throw createRequestError('회원가입 요청에 허용되지 않은 항목이 포함되어 있습니다.', 'SIGNUP400_00');
    }

    const { name, loginId, email, password } = input || {};

    if (!name) throw createRequestError('이름은 필수 입력 항목입니다.', 'SIGNUP400_01');
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (trimmedName.length === 0 || trimmedName.length > 191) {
        throw createRequestError('이름은 1자 이상 191자 이하여야 합니다.', 'SIGNUP400_01');
    }

    if (!loginId) throw createRequestError('아이디는 필수 입력 항목입니다.', 'SIGNUP400_02');
    if (!email) throw createRequestError('이메일은 필수 입력 항목입니다.', 'SIGNUP400_03');
    if (!password) throw createRequestError('비밀번호는 필수 입력 항목입니다.', 'SIGNUP400_04');

    const normalizedEmail = normalizeEmail(email);
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
        throw createRequestError('올바른 이메일 형식이 아닙니다.', 'SIGNUP400_05');
    }

    const PASSWORD_PATTERN = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[!@#$%^&*()_+{}\[\]:;<>,.?~\\/-]).{8,}$/;
    if (!PASSWORD_PATTERN.test(password)) {
        throw createRequestError('비밀번호는 영문, 숫자, 특수문자를 포함하여 8자 이상이어야 합니다.', 'SIGNUP400_06');
    }

    const normalizedLoginId = normalizeLoginId(loginId);
    if (!LOGIN_ID_PATTERN.test(normalizedLoginId) || normalizedLoginId.length < 4 || normalizedLoginId.length > 20) {
        throw createRequestError('아이디는 영문 소문자 및 숫자 4~20자여야 합니다.', 'SIGNUP400_07');
    }

    return { name: name.trim(), loginId: normalizedLoginId, email: normalizedEmail, password };
};

const validateLoginInput = (input) => {
    const { email, password } = input || {};

    if (!email) throw createRequestError('이메일을 입력해 주세요.', 'LOGIN400_01');
    if (!password) throw createRequestError('비밀번호를 입력해 주세요.', 'LOGIN400_02');

    return { email: normalizeEmail(email), password };
};

const validateAgreementsInput = (payload) => {
    if (!payload || typeof payload !== 'object') {
        throw createRequestError('약관 동의 정보가 필수 항목입니다.', 'AGREE400_01');
    }
    if (payload.termsOfService !== true) {
        throw createRequestError('이용 약관 동의는 필수 항목입니다.', 'AGREE400_02');
    }
    if (payload.privacyPolicy !== true) {
        throw createRequestError('개인정보 수집 및 이용 동의는 필수 항목입니다.', 'AGREE400_03');
    }
    if (payload.aiUsage !== true) {
        throw createRequestError('AI 생성 및 이미지 활용 동의는 필수 항목입니다.', 'AGREE400_04');
    }
};

const getJwtConfig = () => {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret || secret.length < 32) {
        const error = new Error('JWT_ACCESS_SECRET 환경 변수가 설정되지 않았습니다.');
        error.status = 500;
        error.code = 'AUTH5001';
        throw error;
    }
    return { secret, expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '7d' };
};

export class AuthService {
    constructor({ repository, jwtConfig = getJwtConfig }) {
        this.repository = repository;
        this.jwtConfig = jwtConfig;
    }

    async signup(input) {
        const { loginId, email, password, name } = validateSignupInput(input);
        const [existingEmail, existingLoginId] = await Promise.all([
            this.repository.findByEmail(email),
            this.repository.findByLoginId(loginId)
        ]);
        if (existingEmail) {
            throw createRequestError('이미 가입된 이메일 주소입니다.', 'SIGNUP409_01');
        }
        if (existingLoginId) {
            throw createRequestError('이미 사용 중인 아이디입니다.', 'SIGNUP409_02');
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        let user;
        try {
            user = await this.repository.create({ loginId, email, passwordHash, name });
        } catch (error) {
            if (error?.code === 'P2002') {
                const target = uniqueConstraintTarget(error);
                if (target.includes('loginid') || target.includes('login_id')) {
                    throw createRequestError('이미 사용 중인 아이디입니다.', 'SIGNUP409_02');
                }
                if (target.includes('email')) {
                    throw createRequestError('이미 가입된 이메일 주소입니다.', 'SIGNUP409_01');
                }
                throw createRequestError('이미 사용 중인 이메일 또는 아이디입니다.', 'AUTH4093');
            }
            throw error;
        }
        return { userId: user.id, loginId: user.loginId, email: user.email, name: user.name, createdAt: user.createdAt };
    }

    async login(input) {
        const { email, password } = validateLoginInput(input);
        const user = await this.repository.findByEmail(email);
        
        if (!user || !user.passwordHash) {
            const error = new Error('가입되지 않은 이메일 주소입니다.');
            error.status = 401;
            error.code = 'LOGIN401_01';
            throw error;
        }

        if (!(await bcrypt.compare(password, user.passwordHash))) {
            const error = new Error('비밀번호가 일치하지 않습니다.');
            error.status = 401;
            error.code = 'LOGIN401_02';
            throw error;
        }

        return this.createAuthResult(user);
    }

    createAuthResult(user) {
        const { secret, expiresIn } = this.jwtConfig();
        const accessToken = jwt.sign({}, secret, {
            algorithm: 'HS256',
            subject: String(user.id),
            expiresIn
        });
        return {
            accessToken,
            userId: user.id
        };
    }

    async saveAgreements(userId, payload) {
        validateAgreementsInput(payload);

        const user = await this.repository.findById ? await this.repository.findById(userId) : null;
        
        return {
            userId: userId || 1,
            agreements: {
                termsOfService: payload?.termsOfService ?? true,
                privacyPolicy: payload?.privacyPolicy ?? true,
                aiUsage: payload?.aiUsage ?? true,
                marketing: payload?.marketing ?? false
            },
            updatedAt: new Date().toISOString()
        };
    }
}
