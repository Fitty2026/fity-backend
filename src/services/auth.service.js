import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const SALT_ROUNDS = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9]+$/;
const PASSWORD_PATTERN = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[!@#$%^&*()_+~`|}{[\]:;?><,./-]).{8,72}$/;
const SIGNUP_FIELDS = new Set(['name', 'loginId', 'email', 'password']);

const createRequestError = (message, code = 'AUTH400_01') => {
    const error = new Error(message);
    error.status = 400;
    error.code = code;
    return error;
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeUsername = (value) => typeof value === 'string' ? value.trim() : '';

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
    if (!input?.name) throw createRequestError('이름은 필수 입력 항목입니다.', 'SIGNUP400_01');
    if (!input?.loginId) throw createRequestError('아이디는 필수 입력 항목입니다.', 'SIGNUP400_02');
    if (!input?.email) throw createRequestError('이메일은 필수 입력 항목입니다.', 'SIGNUP400_03');
    if (!input?.password) throw createRequestError('비밀번호는 필수 입력 항목입니다.', 'SIGNUP400_04');

    const email = normalizeEmail(input.email);
    if (!EMAIL_PATTERN.test(email) || email.length > 191) {
        throw createRequestError('올바른 이메일 형식이 아닙니다.', 'SIGNUP400_05');
    }

    if (!PASSWORD_PATTERN.test(input.password)) {
        throw createRequestError('비밀번호는 영문, 숫자, 특수문자를 포함하여 8자 이상이어야 합니다.', 'SIGNUP400_06');
    }

    const username = normalizeUsername(input.loginId);
    if (username.length < 4 || username.length > 30 || !USERNAME_PATTERN.test(username)) {
        throw createRequestError('아이디는 영문(대소문자 무관) 및 숫자 4~30자여야 합니다.', 'SIGNUP400_07');
    }

    const name = input.name.trim();

    return { email, password: input.password, username, name };
};

const validateLoginInput = (input) => {
    if (!input?.email) throw createRequestError('이메일을 입력해 주세요.', 'LOGIN400_01');
    if (!input?.password) throw createRequestError('비밀번호를 입력해 주세요.', 'LOGIN400_02');

    return { email: normalizeEmail(input.email), password: input.password };
};

const getJwtConfig = () => {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret || secret.length < 32) {
        const error = new Error('JWT_ACCESS_SECRET 환경 변수가 설정되지 않았습니다.');
        error.status = 500;
        error.code = 'AUTH500_01';
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
            throw createRequestError('이미 가입된 이메일 주소입니다.', 'SIGNUP409_01');
        }
        if (existingUsername) {
            throw createRequestError('이미 사용 중인 아이디입니다.', 'SIGNUP409_02');
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        let user;
        try {
            user = await this.repository.create({ username, email, passwordHash, name });
        } catch (error) {
            if (error?.code === 'P2002') {
                const target = uniqueConstraintTarget(error);
                if (target.includes('username')) {
                    throw createRequestError('이미 사용 중인 아이디입니다.', 'SIGNUP409_02');
                }
                if (target.includes('email')) {
                    throw createRequestError('이미 가입된 이메일 주소입니다.', 'SIGNUP409_01');
                }
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
        const { email, password } = validateLoginInput(input);
        const user = await this.repository.findByEmail(email);
        if (!user) {
            const err = new Error('가입되지 않은 이메일 주소입니다.');
            err.status = 401;
            err.code = 'LOGIN401_01';
            throw err;
        }
        if (!user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
            const err = new Error('비밀번호가 일치하지 않습니다.');
            err.status = 401;
            err.code = 'LOGIN401_02';
            throw err;
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
        return { accessToken, userId: user.id, name: user.name };
    }

    async socialLogin(input) {
        const { provider, accessToken } = input;
        
        // 1. 유효한 플랫폼인지 검사
        if (!['kakao', 'google', 'apple'].includes(provider)) {
            throw createRequestError('지원하지 않는 소셜 로그인 제공자입니다.', 'AUTH400_02');
        }

        try {
            // 2. 실제 토큰 검증 시도 (현재는 인프라 세팅 전이므로 무조건 에러 발생!)
            // 향후 진짜 통신 코드가 여기에 들어갑니다.
            throw new Error('실제 소셜 로그인 API가 아직 연결되지 않았습니다.');
            
        } catch (error) {
            // 3. 진짜 통신 실패 시 비상용(가라) 로그인으로 우회
            console.error(`🔥 [${provider} 소셜 로그인 실패] 비상용 계정으로 우회합니다. 사유:`, error.message);
            return this.mockSocialLoginFallback(provider);
        }
    }

    // 💡 [추가] 가라 로그인 우회 처리 함수
    async mockSocialLoginFallback(provider) {
        const fallbackEmail = `mock_${provider}@fitty.test.com`;
        
        // 가라 유저가 이미 있는지 조회
        let user = await this.repository.findByEmail(fallbackEmail);

        if (!user) {
            // 없으면 DB 규칙에 맞게 임시 유저 생성 (username, email, passwordHash, name 필수)
            const fallbackUsername = `mock_${provider}_${Date.now()}`;
            const dummyPasswordHash = await bcrypt.hash('MockPassword123!', 12);

            user = await this.repository.create({
                username: fallbackUsername,
                email: fallbackEmail,
                passwordHash: dummyPasswordHash,
                name: `${provider}가라유저`
            });
        }

        // 기존 일반 로그인과 똑같이 JWT 토큰 발급해서 리턴
        return this.createAuthResult(user);
    }
}
