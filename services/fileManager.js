// services/fileManager.js
const fs = require('fs');
const path = require('path');
const { storagePath, tmpSongsPath, tmpImgPath } = require('../config/paths');
const logger = require('../utils/logger'); // Add this

/**
 * File system operations manager
 * Handles directory management, temporary file cleanup, and orphan removal
 */
class FileManager {
    constructor() {
        this.storagePath = storagePath;
        this.tmpSongsPath = tmpSongsPath;
        this.tmpImgPath = tmpImgPath;
    }

    ensureDirectories() {
        const directories = [this.storagePath, this.tmpSongsPath, this.tmpImgPath];

        directories.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    async clearTemporaryFiles() {
        await logger.fileOperation('Deleting leftover temporary files', async () => {
            const tmpDirs = [this.tmpSongsPath, this.tmpImgPath];
            let totalCleaned = 0;

            for (const tmpDir of tmpDirs) {
                if (fs.existsSync(tmpDir)) {
                    const files = fs.readdirSync(tmpDir);
                    totalCleaned += files.length;

                    for (const file of files) {
                        try {
                            fs.unlinkSync(path.join(tmpDir, file));
                            logger.info(`Removed leftover temporary file: ${file}`);
                        } catch (error) {
                            logger.error(`Error deleting tmp file ${file}:`, error.message);
                        }
                    }
                }
            }
        });
    }

    async cleanupOrphanedFiles(activeYtIds) {
        if (!fs.existsSync(this.storagePath))
            return;

        await logger.fileOperation('Checking for orphaned files', async () => {
            const files = fs.readdirSync(this.storagePath);
            let orphansRemoved = 0;

            for (const file of files) {
                if (!file.endsWith('.mp3')) continue;

                const ytId = path.parse(file).name;

                if (!activeYtIds.has(ytId)) {
                    if(process.env.DRY_RUN)
                        continue;

                    try {
                        fs.unlinkSync(path.join(this.storagePath, file));
                        orphansRemoved++;
                        logger.info(`Removed orphaned file: ${file}`);
                    } catch (error) {
                        logger.error(`Error removing orphaned file ${file}:`, error.message);
                    }
                }
            }

            if (orphansRemoved > 0) {
                logger.info(`Removed ${logger.pluralize(orphansRemoved, 'orphaned file')}`);
            } else {
                logger.info('No orphaned files found');
            }
        });
    }
}

module.exports = FileManager;