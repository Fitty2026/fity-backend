import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const SALT_ROUNDS = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-z0-9]+$/;
const SIGNUP_FIELDS = new Set(['name', 'loginId', 'email', 'password']);

const createRequestError = (message, code = 'AUTH4001') => {
    const error = new Error(message);
    error.status = 400;
    error.code = code;
    return error;
};

const createUnauthorizedError = () => {
    const error = new Error('이메일 또는 비밀번호가 올바르지 않습니다.');
    error.status = 401;
    error.code = 'AUTH4012';
    return error;
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeUsername = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';

const uniqueConstraintTarget = (error) => {
    const directTarget = Array.isArray(error?.meta?.target)
        ? error.meta.target.join(',')
        : String(error?.meta?.target || '');
    const adapterIndex = String(error?.meta?.driverAdapterError?.cause?.constraint?.index || '');
    return `${directTarget},${adapterIndex}`.toLowerCase();
};

const validateCredentials = ({ email, password, name }) => {
    const normalizedEmail = normalizeEmail(email);
    if (!EMAIL_PATTERN.test(normalizedEmail) || normalizedEmail.length > 191) {
        throw createRequestError('유효한 이메일 주소를 입력해 주세요.');
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
        throw createRequestError('비밀번호는 8자 이상 72자 이하여야 합니다.');
    }
    if (name !== undefined && (typeof name !== 'string' || name.trim().length > 191)) {
        throw createRequestError('이름은 191자 이하여야 합니다.');
    }
    return { email: normalizedEmail, password, name: name?.trim() || null };
};

const validateSignupInput = (input) => {
    const fields = Object.keys(input || {});
    if (fields.some((field) => !SIGNUP_FIELDS.has(field))) {
        throw createRequestError('회원가입 요청에 허용되지 않은 항목이 포함되어 있습니다.');
    }

    const credentials = validateCredentials(input);
    const username = normalizeUsername(input?.loginId);
    const name = typeof input?.name === 'string' ? input.name.trim() : '';

    if (username.length < 4 || username.length > 20 || !USERNAME_PATTERN.test(username)) {
        throw createRequestError('아이디는 영문 소문자와 숫자로 이루어진 4~20자여야 합니다.');
    }
    if (!name || name.length > 191) {
        throw createRequestError('이름은 1자 이상 191자 이하여야 합니다.');
    }

    return { ...credentials, username, name };
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
        const { username, email, password, name } = validateSignupInput(input);
        const [existingEmail, existingUsername] = await Promise.all([
            this.repository.findByEmail(email),
            this.repository.findByUsername(username)
        ]);
        if (existingEmail) {
            throw createRequestError('이미 가입된 이메일 주소입니다.', 'AUTH4091');
        }
        if (existingUsername) {
            throw createRequestError('이미 사용 중인 아이디입니다.', 'AUTH4092');
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        let user;
        try {
            user = await this.repository.create({ username, email, passwordHash, name });
        } catch (error) {
            if (error?.code === 'P2002') {
                const target = uniqueConstraintTarget(error);
                if (target.includes('username')) {
                    throw createRequestError('이미 사용 중인 아이디입니다.', 'AUTH4092');
                }
                if (target.includes('email')) {
                    throw createRequestError('이미 가입된 이메일 주소입니다.', 'AUTH4091');
                }
                throw createRequestError('이미 사용 중인 이메일 또는 아이디입니다.', 'AUTH4093');
            }
            throw error;
        }
        return {
            userId: user.id,
            loginId: user.username,
            email: user.email,
            name: user.name,
            createdAt: user.createdAt
        };
    }

    async login(input) {
        const { email, password } = validateCredentials(input);
        const user = await this.repository.findByEmail(email);
        if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
            throw createUnauthorizedError();
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
        return { accessToken, userId: user.id, nickname: user.name };
    }
}
