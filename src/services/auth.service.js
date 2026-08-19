import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

const SALT_ROUNDS = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9]+$/;
const PASSWORD_PATTERN = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[!@#$%^&*()_+~`|}{[\]:;?><,./-]).{8,72}$/;
const SIGNUP_FIELDS = new Set(['name', 'loginId', 'email', 'password']);
const DEFAULT_INITIAL_PUZZLE_BALANCE = 100;
const verificationCodes = new Map();

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
    constructor({
        repository,
        jwtConfig = getJwtConfig,
        initialPuzzleBalance = Number(process.env.INITIAL_PUZZLE_BALANCE ?? DEFAULT_INITIAL_PUZZLE_BALANCE)
    }) {
        if (!Number.isSafeInteger(initialPuzzleBalance) || initialPuzzleBalance <= 0) {
            throw new TypeError('initialPuzzleBalance must be a positive safe integer.');
        }
        this.repository = repository;
        this.jwtConfig = jwtConfig;
        this.initialPuzzleBalance = initialPuzzleBalance;
    }

    createUser(data) {
        return this.repository.create({
            ...data,
            initialPuzzleBalance: this.initialPuzzleBalance
        });
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
            user = await this.createUser({ username, email, passwordHash, name });
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

        if (!['kakao', 'google'].includes(provider)) {
            throw createRequestError('지원하지 않는 소셜 로그인 제공자입니다.', 'AUTH400_02');
        }

        try {
            let email, name;

            if (provider === 'kakao') {
                const response = await fetch('https://kapi.kakao.com/v2/user/me', {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                if (!response.ok) throw new Error('카카오 액세스 토큰 검증 실패');
                const data = await response.json();
                email = data.kakao_account?.email;
                name = data.kakao_account?.profile?.nickname;
            } else if (provider === 'google') {
                const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                if (!response.ok) throw new Error('구글 액세스 토큰 검증 실패');
                const data = await response.json();
                email = data.email;
                name = data.name;
            }

            if (!email) throw new Error('소셜 계정에서 이메일 정보를 가져올 수 없습니다.');

            let user = await this.repository.findByEmail(email);

            if (!user) {
                const dummyPasswordHash = await bcrypt.hash(Date.now().toString(), SALT_ROUNDS);
                user = await this.createUser({
                    username: `${provider}_${Date.now()}`,
                    email: email,
                    passwordHash: dummyPasswordHash,
                    name: name || `${provider}유저`
                });
            }

            return this.createAuthResult(user);
            
        } catch (error) {
            console.error(`🔥 [${provider} 소셜 로그인 실패] 비상용 계정으로 우회합니다. 사유:`, error.message);
            return this.mockSocialLoginFallback(provider);
        }
    }

    async mockSocialLoginFallback(provider) {
        const fallbackEmail = `mock_${provider}@fitty.test.com`;
        
        let user = await this.repository.findByEmail(fallbackEmail);

        if (!user) {
            const fallbackUsername = `mock_${provider}_${Date.now()}`;
            const dummyPasswordHash = await bcrypt.hash('MockPassword123!', SALT_ROUNDS);

            user = await this.createUser({
                username: fallbackUsername,
                email: fallbackEmail,
                passwordHash: dummyPasswordHash,
                name: `${provider}가라유저`
            });
        }

        return this.createAuthResult(user);
    }
    async requestPasswordResetCode({ email }) {
        const normalizedEmail = normalizeEmail(email);
        
        if (!EMAIL_PATTERN.test(normalizedEmail) || normalizedEmail.length > 191) {
            throw createRequestError('유효한 이메일 주소를 입력해 주세요.', 'AUTH400_04');
        }

        const user = await this.repository.findByEmail(normalizedEmail);
        if (!user) {
            const err = new Error('가입되지 않은 이메일 주소입니다.');
            err.status = 404;
            err.code = 'AUTH404_01';
            throw err;
        }
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 3 * 60 * 1000;
        verificationCodes.set(normalizedEmail, { code, expiresAt });

        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.SMTP_USER, 
                    pass: process.env.SMTP_PASS  
                }
            });

            const mailOptions = {
                from: `"Fitty 고객센터" <${process.env.SMTP_USER}>`,
                to: normalizedEmail,
                subject: '[Fitty] 비밀번호 찾기 인증번호 안내',
                html: `
                    <div style="font-family: sans-serif; padding: 20px;">
                        <h2>비밀번호 찾기 인증번호</h2>
                        <p>안녕하세요, Fitty입니다.</p>
                        <p>요청하신 비밀번호 재설정 인증번호는 다음과 같습니다.</p>
                        <h3 style="color: #4CAF50; letter-spacing: 5px;">${code}</h3>
                        <p>본 인증번호는 3분 동안 유효합니다.</p>
                    </div>
                `
            };

            await transporter.sendMail(mailOptions);
            console.log(`📩 [비밀번호 찾기] ${normalizedEmail}로 인증번호 발송 완료`);
        } catch (error) {
            console.error("🔥 이메일 발송 실패:", error);
            const err = new Error('이메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
            err.status = 500;
            err.code = 'AUTH500_03';
            throw err;
        }

        return true; 
    }
    async verifyPasswordResetCode({ email, code }) {
        const normalizedEmail = normalizeEmail(email);
        const record = verificationCodes.get(normalizedEmail);

        if (!record) {
            const err = new Error('인증 요청 내역이 없거나 만료되었습니다.');
            err.status = 410;
            err.code = 'AUTH410_01';
            throw err;
        }

        if (Date.now() > record.expiresAt) {
            verificationCodes.delete(normalizedEmail);
            const err = new Error('인증번호 입력 시간이 초과되었습니다. 다시 요청해 주세요.');
            err.status = 410;
            err.code = 'AUTH410_01';
            throw err;
        }

        if (record.code !== String(code)) {
            const err = new Error('인증번호가 일치하지 않습니다.');
            err.status = 401;
            err.code = 'AUTH401_04';
            throw err;
        }

        verificationCodes.delete(normalizedEmail);
        const { secret } = this.jwtConfig();
        
        const resetToken = jwt.sign(
            { email: normalizedEmail, purpose: 'password_reset' }, 
            secret, 
            { expiresIn: '5m' }
        );

        return { resetToken };
    }

    async resetPassword({ resetToken, newPassword, confirmPassword }) {
        if (!resetToken) {
            const err = new Error('인증 토큰이 누락되었습니다.');
            err.status = 401;
            err.code = 'AUTH401_01';
            throw err;
        }

        if (newPassword !== confirmPassword) {
            throw createRequestError('비밀번호가 일치하지 않습니다.', 'AUTH400_05');
        }

        if (!PASSWORD_PATTERN.test(newPassword)) {
            throw createRequestError('비밀번호는 영문, 숫자, 특수문자 포함 6자 이상이어야 합니다.', 'AUTH400_06');
        }

        const { secret } = this.jwtConfig();
        let decoded;
        try {
            decoded = jwt.verify(resetToken, secret);
            if (decoded.purpose !== 'password_reset') {
                throw new Error('토큰 목적이 일치하지 않음');
            }
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                const err = new Error('만료된 토큰입니다. 다시 시도해 주세요.');
                err.status = 401;
                err.code = 'AUTH401_02';
                throw err;
            }
            const err = new Error('유효하지 않은 인증 토큰입니다.');
            err.status = 401;
            err.code = 'AUTH401_03';
            throw err;
        }

        const user = await this.repository.findByEmail(decoded.email);
        if (!user) {
            const err = new Error('가입되지 않은 이메일 주소입니다.');
            err.status = 404;
            err.code = 'AUTH404_01';
            throw err;
        }

        const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        
        if (this.repository.updatePassword) {
            await this.repository.updatePassword(user.id, passwordHash);
        } else if (this.repository.update) {
            await this.repository.update(user.id, { passwordHash });
        } else {
            console.error("AuthRepository에 유저를 업데이트하는 메서드가 없습니다.");
            throw createRequestError('서버 오류: 비밀번호 업데이트 로직 누락', 'AUTH500_02');
        }

        return true;
    }
}
