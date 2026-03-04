// services/fileManager.js
const fs = require('fs');
const path = require('path');
const { storagePath, tmpSongsPath, tmpImgPath } = require('../config/paths');
const logger = require('../utils/logger');
const { dbQuery } = require('../config/database');

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
            let mp3OrphansRemoved = 0;
            let m3uOrphansRemoved = 0;

            // Get valid playlist names for M3U cleanup
            let validPlaylistNames = new Set();
            try {
                const playlists = await dbQuery('SELECT * FROM playlists');
                validPlaylistNames = new Set(playlists.map(p => p.name));
            } catch (error) {
                logger.error('Error querying playlists for M3U cleanup:', error.message);
            }

            for (const file of files) {
                const fileExt = path.extname(file).toLowerCase();

                switch (fileExt) {
                    case '.mp3':
                        const mp3Removed = await this.cleanOrphanedMp3(file, activeYtIds);
                        if (mp3Removed) mp3OrphansRemoved++;
                        break;

                    case '.m3u':
                    case '.m3u8':
                        const m3uRemoved = await this.cleanOrphanedM3u(file, validPlaylistNames);
                        if (m3uRemoved) m3uOrphansRemoved++;
                        break;

                    default:
                        fs.unlinkSync(path.join(this.storagePath, file));
                        break;
                }
            }

            const totalOrphansRemoved = mp3OrphansRemoved + m3uOrphansRemoved;

            if (totalOrphansRemoved > 0) {
                logger.info(`Removed ${logger.pluralize(totalOrphansRemoved, 'orphaned file')} total (${mp3OrphansRemoved} MP3, ${m3uOrphansRemoved} M3U)`);
            } else {
                logger.info('No orphaned files found');
            }
        });
    }

    async cleanOrphanedMp3(file, activeYtIds) {
        const ytId = path.parse(file).name;

        if (!activeYtIds.has(ytId)) {
            try {
                fs.unlinkSync(path.join(this.storagePath, file));
                logger.info(`Removed orphaned MP3 file: ${file}`);
                return true; // File was removed
            } catch (error) {
                logger.error(`Error removing orphaned MP3 file ${file}:`, error.message);
            }
        }

        return false; // File not orphaned or error occurred
    }

    async cleanOrphanedM3u(file, validPlaylistNames) {
        const playlistName = path.parse(file).name;

        // Check if this playlist file corresponds to an existing playlist
        if (!validPlaylistNames.has(playlistName)) {
            try {
                fs.unlinkSync(path.join(this.storagePath, file));
                logger.info(`Removed orphaned M3U file: ${file} (no matching playlist in database)`);
                return true; // File was removed
            } catch (error) {
                logger.error(`Error removing orphaned M3U file ${file}:`, error.message);
            }
        }

        return false; // File not orphaned or error occurred
    }
}

module.exports = FileManager;