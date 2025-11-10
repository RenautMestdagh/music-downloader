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

        console.log('Ensuring directories exist...');

        directories.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`Created directory: ${dir}`);
            }
        });
    }

    async clearTemporaryFiles() {
        console.log('Cleaning temporary files...');

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
                        console.error(`Error deleting tmp file ${file}:`, error.message);
                    }
                }
            }
        }

        console.log(`Cleared ${totalCleaned} temporary files`);
    }

    async cleanupOrphanedFiles(activeYtIds) {
        if (!fs.existsSync(this.storagePath)) {
            console.log('Storage path does not exist, skipping orphan cleanup');
            return;
        }

        console.log('Checking for orphaned files...');

        const files = fs.readdirSync(this.storagePath);
        let orphansRemoved = 0;

        for (const file of files) {
            if (!file.endsWith('.mp3')) continue;

            const ytId = path.parse(file).name;

            if (!activeYtIds.has(ytId)) {
                try {
                    fs.unlinkSync(path.join(this.storagePath, file));
                    orphansRemoved++;
                    console.log(`Removed orphaned file: ${file}`);
                } catch (error) {
                    console.error(`Error removing orphaned file ${file}:`, error.message);
                }
            }
        }

        if (orphansRemoved > 0) {
            console.log(`Removed ${orphansRemoved} orphaned files`);
        } else {
            console.log('No orphaned files found');
        }
    }
}

module.exports = FileManager;