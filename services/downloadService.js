// services/downloadService.js
const SyncManager = require('./syncManager');
const DownloadManager = require('./downloadManager');
const FileManager = require('./fileManager');

/**
 * Main service orchestrator for sync cycles and scheduling
 */
class DownloadService {
    constructor() {
        this.syncManager = new SyncManager();
        this.downloadManager = new DownloadManager();
        this.fileManager = new FileManager();

        this.isRunning = false;
        this.currentTimeout = null;
        this.repeatInterval = 15 * 60 * 1000; // 15 minutes
    }

    async initialize() {
        this.fileManager.ensureDirectories();
        this.scheduleNextExecution(10000); // Start first sync in 10 seconds
    }

    scheduleNextExecution(delay = null) {
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
        }

        const executionDelay = delay !== null ? delay : this.repeatInterval;
        const nextExecutionTime = new Date(Date.now() + executionDelay);

        this.currentTimeout = setTimeout(() => {
            this.executeSyncCycle();
        }, executionDelay);

        console.log(`[${new Date().toISOString()}]: Next sync scheduled at ${nextExecutionTime.toISOString()}`);
    }

    async executeSyncCycle() {
        if (this.isRunning) {
            console.log(`[${new Date().toISOString()}]: Sync already in progress, skipping...`);

            this.scheduleNextExecution(30000); // Retry in 30 seconds
            return;
        }

        this.isRunning = true;

        try {
            console.log(`[${new Date().toISOString()}]: Sync cycle started`);

            await this.syncManager.loadLibraryData();
            await this.fileManager.clearTemporaryFiles();
            await this.syncManager.syncYouTubePlaylists();

            console.log(`[${new Date().toISOString()}]: Sync cycle complete`);

        } catch (error) {
            console.error(`[${new Date().toISOString()}]: Sync cycle failed:`, error);
        } finally {
            this.isRunning = false;
            this.scheduleNextExecution();
        }
    }
}

module.exports = new DownloadService();