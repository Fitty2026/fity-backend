import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const specification = JSON.parse(await readFile(new URL('../docs/openapi.json', import.meta.url), 'utf8'));

const expectedOperations = [
    ['post', '/outfits/generation-jobs'],
    ['get', '/outfits/generation-jobs/active'],
    ['get', '/outfits/generation-jobs/{jobId}'],
    ['post', '/outfits/{outfitResultId}/revisions'],
    ['post', '/outfits/saved'],
    ['get', '/outfits/saved'],
    ['get', '/outfits/saved/deleted'],
    ['get', '/outfits/saved/{savedOutfitId}'],
    ['patch', '/outfits/saved/{savedOutfitId}'],
    ['delete', '/outfits/saved/{savedOutfitId}'],
    ['post', '/outfits/saved/{savedOutfitId}/restore'],
    ['delete', '/outfits/saved/{savedOutfitId}/permanent'],
    ['get', '/puzzles/balance']
];

describe('BE4 OpenAPI contract', () => {
    it('documents every public outfit route and JWT security', () => {
        for (const [method, path] of expectedOperations) {
            assert.ok(specification.paths[path]?.[method], `${method.toUpperCase()} ${path} is missing`);
        }
        assert.equal(specification.components.securitySchemes.bearerAuth.scheme, 'bearer');
    });

    it('matches the generation request constraints used by the service', () => {
        const request = specification.components.schemas.CreateGenerationJobRequest;
        assert.equal(request.required, undefined);
        assert.equal(request.properties.closetItemIds.minItems, 0);
        assert.equal(request.properties.closetItemIds.maxItems, 3);
        assert.deepEqual(
            specification.components.schemas.Weather.oneOf[1].properties.condition.enum,
            ['SUNNY', 'CLOUDY', 'RAINY', 'SNOWY', 'WINDY', 'UNKNOWN']
        );
        assert.deepEqual(
            specification.components.schemas.Job.properties.status.enum,
            ['queued', 'processing', 'qc_pending', 'completed', 'failed', 'expired']
        );
    });

    it('documents the authenticated puzzle balance contract', () => {
        const schema = specification.components.schemas.PuzzleBalance;
        assert.deepEqual(schema.required, ['balance', 'currency']);
        assert.equal(schema.properties.balance.minimum, 0);
        assert.equal(schema.properties.currency.const, 'PUZZLE');
    });

    it('documents the thirty-day saved outfit trash contract', () => {
        const remaining = specification.components.schemas.SavedOutfit.properties.deletionDaysRemaining;
        assert.equal(remaining.minimum, 0);
        assert.equal(remaining.maximum, 30);
    });
});
