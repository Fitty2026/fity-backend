const positiveInteger = (value, fallback, maximum) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
};

export class OutfitWorker {
    constructor({
        service,
        intervalMs = positiveInteger(process.env.OUTFIT_WORKER_POLL_INTERVAL_MS, 1000, 60000),
        batchSize = positiveInteger(process.env.OUTFIT_WORKER_BATCH_SIZE, 5, 20),
        cleanupIntervalMs = positiveInteger(process.env.OUTFIT_CLEANUP_INTERVAL_MS, 60000, 86400000),
        now = () => Date.now(),
        logger = console
    }) {
        this.service = service;
        this.intervalMs = intervalMs;
        this.batchSize = batchSize;
        this.cleanupIntervalMs = cleanupIntervalMs;
        this.now = now;
        this.logger = logger;
        this.timer = null;
        this.inFlight = false;
        this.lastCleanupAt = null;
    }

    start() {
        if (this.timer) return;
        void this.tick();
        this.timer = setInterval(() => void this.tick(), this.intervalMs);
        this.timer.unref?.();
    }

    stop() {
        if (!this.timer) return;
        clearInterval(this.timer);
        this.timer = null;
    }

    async tick() {
        if (this.inFlight) return;
        this.inFlight = true;
        try {
            const timestamp = this.now();
            if (typeof this.service.cleanupExpiredJobs === 'function'
                && (this.lastCleanupAt === null || timestamp - this.lastCleanupAt >= this.cleanupIntervalMs)) {
                this.lastCleanupAt = timestamp;
                try {
                    await this.service.cleanupExpiredJobs();
                } catch (error) {
                    this.logger.error('Outfit expiration cleanup failed.', error);
                }
            }
            await this.service.processPendingJobs(this.batchSize);
        } catch (error) {
            this.logger.error('Outfit worker polling failed.', error);
        } finally {
            this.inFlight = false;
        }
    }
}
