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
        console.log('Initializing Download Service...');

        this.fileManager.ensureDirectories();
        this.scheduleNextExecution(10000); // Start first sync in 10 seconds

        console.log('Download Service initialized');
    }

    scheduleNextExecution(delay = null) {
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
        }

        const executionDelay = delay !== null ? delay : this.repeatInterval;

        this.currentTimeout = setTimeout(() => {
            this.executeSyncCycle();
        }, executionDelay);

        console.log(`Next sync scheduled in ${executionDelay / 1000} seconds`);
    }

    async executeSyncCycle() {
        if (this.isRunning) {
            console.log('Sync already in progress, skipping...');
            this.scheduleNextExecution(30000); // Retry in 30 seconds
            return;
        }

        this.isRunning = true;

        try {
            console.log('Sync cycle started');

            await this.syncManager.loadLibraryData();
            await this.fileManager.clearTemporaryFiles();
            await this.syncManager.syncYouTubePlaylists();

            console.log('Sync cycle complete');

        } catch (error) {
            console.error('Sync cycle failed:', error);
        } finally {
            this.isRunning = false;
            this.scheduleNextExecution();
        }
    }

    stop() {
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = null;
        }
        this.isRunning = false;
        console.log('Download Service stopped');
    }

    getTimeStamp() {
        const d = new Date();
        return `[${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}] `;
    }
}

module.exports = new DownloadService();