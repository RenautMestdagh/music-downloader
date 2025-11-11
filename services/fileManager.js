// services/fileManager.js
const fs = require('fs');
const path = require('path');
const { storagePath, tmpSongsPath, tmpImgPath } = require('../config/paths');

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
        const tmpDirs = [this.tmpSongsPath, this.tmpImgPath];
        let totalCleaned = 0;

        for (const tmpDir of tmpDirs) {
            if (fs.existsSync(tmpDir)) {
                const files = fs.readdirSync(tmpDir);
                totalCleaned += files.length;

                for (const file of files) {
                    try {
                        fs.unlinkSync(path.join(tmpDir, file));
                    } catch (error) {
                        console.error(`[${new Date().toISOString()}]: Error deleting tmp file ${file}:`, error.message);
                    }
                }
            }
        }
    }

    async cleanupOrphanedFiles(activeYtIds) {
        if (!fs.existsSync(this.storagePath))
            return;

        console.log(`[${new Date().toISOString()}]: Checking for orphaned files...`);

        const files = fs.readdirSync(this.storagePath);
        let orphansRemoved = 0;

        for (const file of files) {
            if (!file.endsWith('.mp3')) continue;

            const ytId = path.parse(file).name;

            if (!activeYtIds.has(ytId)) {
                try {
                    fs.unlinkSync(path.join(this.storagePath, file));
                    orphansRemoved++;
                    console.log(`[${new Date().toISOString()}]: Removed orphaned file: ${file}`);
                } catch (error) {
                    console.error(`[${new Date().toISOString()}]: Error removing orphaned file ${file}:`, error.message);
                }
            }
        }

        if (orphansRemoved > 0) {
            console.log(`[${new Date().toISOString()}]: Removed ${orphansRemoved} orphaned files`);
        } else {
            console.log(`[${new Date().toISOString()}]: No orphaned files found`);
        }
    }
}

module.exports = FileManager;