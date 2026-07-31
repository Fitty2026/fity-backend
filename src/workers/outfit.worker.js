const positiveInteger = (value, fallback, maximum) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
};

export class OutfitWorker {
    constructor({
        service,
        intervalMs = positiveInteger(process.env.OUTFIT_WORKER_POLL_INTERVAL_MS, 1000, 60000),
        batchSize = positiveInteger(process.env.OUTFIT_WORKER_BATCH_SIZE, 5, 20),
        logger = console
    }) {
        this.service = service;
        this.intervalMs = intervalMs;
        this.batchSize = batchSize;
        this.logger = logger;
        this.timer = null;
        this.inFlight = false;
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
            await this.service.processPendingJobs(this.batchSize);
        } catch (error) {
            this.logger.error('Outfit worker polling failed.', error);
        } finally {
            this.inFlight = false;
        }
    }
}
