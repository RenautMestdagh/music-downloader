// services/downloadService.js
const SyncManager = require('./syncManager');
const FileManager = require('./fileManager');
const logger = require('../utils/logger');

/**
 * Main service orchestrator for sync cycles and scheduling
 */
class DownloadService {
    constructor() {
        this.syncManager = new SyncManager();
        this.fileManager = new FileManager();
        this.repeatInterval = 24 * 60 * 60 * 1000; // 24 hours
        this.isSyncing = false;
    }

    async initialize() {
        this.fileManager.ensureDirectories();
        this.scheduleNextExecution(10000); // Start first sync in 10 seconds
    }

    scheduleNextExecution(delay = null) {
        const executionDelay = delay !== null ? delay : this.repeatInterval;
        const nextExecutionTime = new Date(Date.now() + executionDelay);

        this.syncTimeout = setTimeout(() => {
            this.executeSyncCycle();
        }, executionDelay);

        logger.info(`Next sync scheduled at ${nextExecutionTime.toISOString()}`);
    }

    async executeSyncCycle() {
        if (this.isSyncing) {
            logger.info('Sync already in progress, skipping');
            return;
        }

        this.isSyncing = true;
        try {
            await logger.syncOperation('Sync cycle', async () => {
                await this.syncManager.loadLibraryData();
                await this.syncManager.syncYouTubePlaylists();
                await this.syncManager.syncAllPlaylists();
                if(!parseInt(process.env.DISABLE_PRUNING,10))
                    await this.fileManager.cleanupOrphanedFiles(this.syncManager.ytSongs);
                await this.fileManager.clearTemporaryFiles();
            });
        } catch (error) {
            logger.error('Sync cycle failed:', error);
        } finally {
            this.isSyncing = false;
            this.scheduleNextExecution();
        }
    }

    getSyncStatus() {
        return {
            isSyncing: this.isSyncing
        };
    }

    async triggerManualSync() {
        if (this.isSyncing) {
            return { success: false, message: 'Sync already in progress' };
        }
        
        // Cancel any pending scheduled sync
        if (this.syncTimeout) {
            clearTimeout(this.syncTimeout);
        }
        
        await this.executeSyncCycle();
        return { success: true, message: 'Sync triggered successfully' };
    }
}

module.exports = new DownloadService();