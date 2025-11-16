// services/downloadService.js
const SyncManager = require('./syncManager');
const FileManager = require('./fileManager');
const logger = require('../utils/logger'); // Add this

/**
 * Main service orchestrator for sync cycles and scheduling
 */
class DownloadService {
    constructor() {
        this.syncManager = new SyncManager();
        this.fileManager = new FileManager();
        this.repeatInterval = 15 * 60 * 1000; // 15 minutes
    }

    async initialize() {
        this.fileManager.ensureDirectories();
        this.scheduleNextExecution(10000); // Start first sync in 10 seconds
    }

    scheduleNextExecution(delay = null) {
        const executionDelay = delay !== null ? delay : this.repeatInterval;
        const nextExecutionTime = new Date(Date.now() + executionDelay);

        setTimeout(() => {
            this.executeSyncCycle();
        }, executionDelay);

        logger.info(`Next sync scheduled at ${nextExecutionTime.toISOString()}`);
    }

    async executeSyncCycle() {
        try {
            await logger.syncOperation('Sync cycle', async () => {
                await this.syncManager.loadLibraryData();
                await this.syncManager.syncYouTubePlaylists();
                await this.syncManager.syncAllPlaylists();
                if(!process.env.DISABLE_PRUNING)
                    await this.fileManager.cleanupOrphanedFiles(this.syncManager.ytSongs);
                await this.fileManager.clearTemporaryFiles();
            });
        } catch (error) {
            logger.error('Sync cycle failed:', error);
        } finally {
            this.scheduleNextExecution();
        }
    }
}

module.exports = new DownloadService();