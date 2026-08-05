const adapterError = (code, message) => Object.assign(new Error(message), { code });

export class OutfitAiAdapter {
    constructor({ endpoint = process.env.AI_OUTFIT_ADAPTER_URL, timeoutMs = Number(process.env.AI_OUTFIT_ADAPTER_TIMEOUT_MS || 10000), fetchImpl = globalThis.fetch } = {}) {
        this.endpoint = endpoint;
        this.timeoutMs = timeoutMs;
        this.fetch = fetchImpl;
    }

    async generate({ jobId, userId, bodyProfileId, closetItemIds, styleTagIds, situation, selectedDate, weather }) {
        if (!this.endpoint) throw adapterError('AI_NOT_CONFIGURED', 'AI outfit adapter is not configured.');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.fetch(this.endpoint, {
                method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
                body: JSON.stringify({
                    jobId, userId, bodyProfileId, closetItemIds, styleTagIds, situation, selectedDate,
                    weather: weather ? { ...weather, rain: weather.condition === 'RAINY' } : null
                })
            });
            if (!response.ok) throw adapterError('AI_UNAVAILABLE', `AI outfit adapter returned ${response.status}.`);
            const data = await response.json().catch(() => { throw adapterError('AI_INVALID_RESPONSE', 'AI outfit adapter returned invalid JSON.'); });
            if (!data || typeof data.generatedImageUrl !== 'string' || !/^https?:\/\//.test(data.generatedImageUrl)
                || !Array.isArray(data.recommendedClosetItemIds) || !data.recommendedClosetItemIds.every(Number.isSafeInteger)
                || typeof data.modelVersion !== 'string' || !data.modelVersion.trim()) {
                throw adapterError('AI_INVALID_RESPONSE', 'AI outfit adapter response did not match the contract.');
            }
            return {
                generatedImageUrl: data.generatedImageUrl,
                recommendedClosetItemIds: data.recommendedClosetItemIds,
                provider: data.provider || 'fitty-ai',
                modelVersion: data.modelVersion.trim(),
                promptVersion: typeof data.promptVersion === 'string' && data.promptVersion.trim() ? data.promptVersion.trim() : null,
                fallbackUsed: false
            };
        } catch (error) {
            if (error.name === 'AbortError') throw adapterError('AI_TIMEOUT', 'AI outfit generation timed out.');
            throw error;
        } finally { clearTimeout(timeout); }
    }
}
