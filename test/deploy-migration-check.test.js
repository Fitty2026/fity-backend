import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const checker = path.resolve('deploy/check-migrations.mjs');

const migrationRoot = (sql) => {
    const root = mkdtempSync(path.join(tmpdir(), 'fitty-migrations-'));
    const migration = path.join(root, '20260814000000_test');
    mkdirSync(migration);
    writeFileSync(path.join(migration, 'migration.sql'), sql);
    return root;
};

test('파괴적 migration은 기본적으로 차단한다', () => {
    const result = spawnSync(process.execPath, [checker], {
        env: { ...process.env, MIGRATIONS_ROOT: migrationRoot('ALTER TABLE t DROP COLUMN c;'), APPLIED_MIGRATIONS: 'existing' },
        encoding: 'utf8'
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /차단된 파괴적 migration/);
});

test('명시적 설정 시 파괴적 migration을 자동 승인한다', () => {
    const output = execFileSync(process.execPath, [checker], {
        env: { ...process.env, MIGRATIONS_ROOT: migrationRoot('ALTER TABLE t DROP COLUMN c;'), APPLIED_MIGRATIONS: 'existing', ALLOW_DESTRUCTIVE_MIGRATIONS: 'true' },
        encoding: 'utf8'
    });
    assert.match(output, /자동 적용 가능한 pending migration/);
});

test('수동 승인 표식은 자동 승인 설정과 관계없이 차단한다', () => {
    const result = spawnSync(process.execPath, [checker], {
        env: { ...process.env, MIGRATIONS_ROOT: migrationRoot('-- FITTY: MANUAL_DEPLOY_REQUIRED\nALTER TABLE t ADD COLUMN c INT;'), APPLIED_MIGRATIONS: 'existing', ALLOW_DESTRUCTIVE_MIGRATIONS: 'true' },
        encoding: 'utf8'
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /수동 승인 표식/);
});
