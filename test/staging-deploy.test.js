import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readRepositoryFile = (pathname) => readFile(new URL(`../${pathname}`, import.meta.url), 'utf8');

test('staging smoke does not call the removed body type endpoint', async () => {
    const smoke = await readRepositoryFile('deploy/smoke.mjs');

    assert.doesNotMatch(smoke, /\/api\/v1\/body-profiles\/type/);
});

test('staging passes the Naver receipt OCR configuration to the API container', async () => {
    const compose = await readRepositoryFile('docker-compose.yml');

    assert.match(compose, /NAVER_RECEIPT_OCR_URL:\s*\$\{NAVER_RECEIPT_OCR_URL:-\}/);
    assert.match(compose, /NAVER_OCR_SECRET_KEY:\s*\$\{NAVER_OCR_SECRET_KEY:-\}/);
});

test('failed staging migration restores the predeploy snapshot before starting the previous app', async () => {
    const deploy = await readRepositoryFile('deploy/bin/deploy.sh');

    const migrationMarker = deploy.indexOf('migration_started=true');
    const migrationRun = deploy.indexOf('compose --profile tools run --rm migrate', migrationMarker);
    const restore = deploy.indexOf('restore_backup_contents "${backup_path}"');
    const previousRuntime = deploy.indexOf('set_runtime_values "${previous_ref}"', restore);
    const previousApiStart = deploy.indexOf('compose up --detach api', previousRuntime);

    assert.ok(migrationMarker > 0, 'migration attempt must be tracked');
    assert.ok(migrationRun > migrationMarker, 'migration must run after the marker is set');
    assert.ok(restore > 0, 'failure handler must restore the predeploy backup');
    assert.ok(previousRuntime > restore, 'previous runtime must be selected after backup restoration');
    assert.ok(previousApiStart > previousRuntime, 'previous API must start only after runtime restoration');
    assert.match(deploy, /REASON=automatic-deploy-recovery-failed/);
});

test('backup restoration keeps the API stopped until both database and images are restored', async () => {
    const common = await readRepositoryFile('deploy/bin/common.sh');
    const restoreScript = await readRepositoryFile('deploy/bin/restore-backup.sh');

    const restoreFunction = common.indexOf('restore_backup_contents()');
    const stopApi = common.indexOf('compose stop api', restoreFunction);
    const databaseImport = common.indexOf('database.sql', stopApi);
    const imageImport = common.indexOf('images.tar.gz', databaseImport);

    assert.ok(restoreFunction > 0);
    assert.ok(stopApi > restoreFunction, 'API must stop before destructive restoration');
    assert.ok(databaseImport > stopApi, 'database restoration must happen while API is stopped');
    assert.ok(imageImport > databaseImport, 'image restoration must happen after database restoration');
    assert.match(restoreScript, /restore_backup_contents "\$\{backup_path\}" "\$\{IMAGE_REF\}"/);
    assert.match(restoreScript, /restore_failed\(\)[\s\S]*compose stop api/);
});
