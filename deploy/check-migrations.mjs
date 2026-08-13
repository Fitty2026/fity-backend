import fs from 'node:fs/promises';
import path from 'node:path';

const migrationsRoot = process.env.MIGRATIONS_ROOT || '/app/prisma/migrations';
const applied = new Set(
    (process.env.APPLIED_MIGRATIONS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
);
const destructivePattern = /\b(DROP\s+(TABLE|DATABASE|COLUMN|INDEX|CONSTRAINT|FOREIGN\s+KEY)|TRUNCATE\s+TABLE|DELETE\s+FROM|UPDATE\s+\S+\s+SET|RENAME\s+TABLE|ALTER\s+TABLE[\s\S]*?\b(MODIFY|CHANGE|RENAME)\b)\b/i;
const manualApprovalMarker = /--\s*FITTY:\s*MANUAL_DEPLOY_REQUIRED\b/i;
const allowDestructiveMigrations = process.env.ALLOW_DESTRUCTIVE_MIGRATIONS === 'true';

const entries = await fs.readdir(migrationsRoot, { withFileTypes: true });
const pending = entries
    .filter((entry) => entry.isDirectory() && !applied.has(entry.name))
    .map((entry) => entry.name)
    .sort();

if (applied.size === 0) {
    console.log(`빈 DB 최초 설치 migration: ${pending.join(', ') || '없음'}`);
    process.exit(0);
}

const destructive = [];
const manualApprovalRequired = [];
for (const migration of pending) {
    const sql = await fs.readFile(path.join(migrationsRoot, migration, 'migration.sql'), 'utf8');
    if (manualApprovalMarker.test(sql)) {
        manualApprovalRequired.push(migration);
    } else if (destructivePattern.test(sql.replaceAll(/--.*$/gm, ''))) {
        destructive.push(migration);
    }
}

if (manualApprovalRequired.length > 0) {
    console.error(`수동 승인 표식이 있는 migration: ${manualApprovalRequired.join(', ')}`);
    process.exit(1);
}

if (destructive.length > 0 && !allowDestructiveMigrations) {
    console.error(`자동 배포에서 차단된 파괴적 migration: ${destructive.join(', ')}`);
    process.exit(1);
}

if (destructive.length > 0) {
    console.warn(`백업 후 자동 승인된 파괴적 migration: ${destructive.join(', ')}`);
}

console.log(`자동 적용 가능한 pending migration: ${pending.join(', ') || '없음'}`);
