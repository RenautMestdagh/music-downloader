// services/downloadManager.js
const youtubedl = require('youtube-dl-exec');
const { execSync } = require("child_process");
const sharp = require('sharp');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { storagePath, tmpSongsPath, tmpImgPath } = require('../config/paths');
const logger = require('../utils/logger');

/**
 * YouTube video download and processing manager
 * Handles concurrent downloads, metadata extraction, and file processing
 */
class DownloadManager {
    constructor() {
        this.storagePath = storagePath;
        this.tmpSongsPath = tmpSongsPath;
        this.tmpImgPath = tmpImgPath;
        this.downloadedFiles = [];
        this.currentDownloads = 0;
        this.maxConcurrentDownloads = 10;

        this.ensureDirectories();
    }

    ensureDirectories() {
        const directories = [this.storagePath, this.tmpSongsPath, this.tmpImgPath];
        directories.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    loadDownloadedFiles() {
        this.downloadedFiles = fs.existsSync(this.storagePath)
            ? fs.readdirSync(this.storagePath)
                .filter(filename => path.extname(filename).toLowerCase() === '.mp3')
                .map(filename => path.parse(filename).name)
            : [];

        logger.info(`Loaded ${logger.pluralize(this.downloadedFiles.length, 'downloaded MP3 file')}`);
    }

    isFileDownloaded(ytId) {
        return this.downloadedFiles.includes(ytId);
    }

    async processDownloads(songsToDownload) {
        if (songsToDownload.size === 0) {
            logger.info('No new songs to download');
            return;
        }

        logger.info(`Processing ${logger.pluralize(songsToDownload.size, 'download')}...`);

        const downloadPromises = Array.from(songsToDownload).map(ytId =>
            this.downloadSongWithConcurrency(ytId)
        );

        await Promise.allSettled(downloadPromises);
        logger.info('All downloads processed');
    }

    async downloadSongWithConcurrency(ytId) {
        while (this.currentDownloads >= this.maxConcurrentDownloads) {
            await this.delay(5000);
        }

        this.currentDownloads++;

        try {
            await this.downloadSong(ytId);
        } finally {
            this.currentDownloads--;
        }
    }

    async downloadSong(ytId) {
        try {
            const metadata = await this.fetchVideoMetadata(ytId);
            await this.downloadAudioFile(ytId);
            await this.processThumbnail(metadata);
            await this.processAudioFile(ytId, metadata);

            logger.info(`Downloaded: ${metadata.track || metadata.uploader} - ${metadata.artist || metadata.fulltitle}`);
        } catch (error) {
            logger.error(`Download failed for https://music.youtube.com/watch?v=${ytId}:`, error.message);
        }
    }

    async fetchVideoMetadata(ytId) {
        logger.debug(`Fetching metadata for ${ytId}`);

        const url = `https://music.youtube.com/watch?v=${ytId}`;
        let metaData = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
            metaData = await youtubedl(url, {
                dumpSingleJson: true,
                noCheckCertificates: true,
                noWarnings: true,
                preferFreeFormats: true,
                addHeader: [
                    'referer:youtube.com',
                    'user-agent:googlebot'
                ],
            });

            if (metaData && metaData.id)
                return metaData;

            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        throw new Error(`Failed to fetch valid metadata`);
    }

    async downloadAudioFile(ytId) {
        logger.debug(`Downloading audio for ${ytId}`);

        const url = `https://music.youtube.com/watch?v=${ytId}`;
        const filePath = path.join(this.tmpSongsPath, `${ytId}X.mp3`);

        for (let attempt = 1; attempt <= 3; attempt++) {
            await youtubedl(url, {
                noCheckCertificates: true,
                noWarnings: true,
                preferFreeFormats: true,
                addHeader: [
                    'referer:youtube.com',
                    'user-agent:googlebot'
                ],
                output: filePath,
                format: 'bestaudio',
            });
            if (fs.existsSync(filePath))
                return;

            // Wait 1 second before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        throw new Error(`Failed to download audio`);
    }

    async processThumbnail(metadata) {
        logger.debug(`Processing thumbnail for ${metadata.id}`);

        const response = await axios.get(metadata.thumbnail, {
            responseType: "arraybuffer",
        });

        await sharp(response.data)
            .resize(1080, 1080)
            .toFile(path.join(this.tmpImgPath, `${metadata.id}.jpg`));
    }

    async processAudioFile(ytId, metadata) {
        logger.debug(`Processing audio file for ${ytId}`);

        const tempAudioPath = path.join(this.tmpSongsPath, `${ytId}X.mp3`);
        const finalAudioPath = path.join(this.storagePath, `${ytId}.mp3`);
        const thumbnailPath = path.join(this.tmpImgPath, `${ytId}.jpg`);

        // Add metadata to audio file
        const ffmpegCommand = this.buildFfmpegMetadataCommand(tempAudioPath, metadata, ytId);
        execSync(ffmpegCommand, { encoding: 'utf-8' });

        if(parseInt(process.env.DRY_RUN,10))
            return;

        // Add cover art to final file
        execSync(
            `ffmpeg -hide_banner -loglevel error -i ${path.join(this.tmpSongsPath, ytId + ".mp3")} -i ${thumbnailPath} -map 0:0 -map 1:0 -c copy -id3v2_version 3 -metadata:s:v title="Album cover" -metadata:s:v comment="Cover (front)" ${finalAudioPath}`,
            { encoding: 'utf-8' }
        );

        // Cleanup temporary files
        this.cleanupTempFiles([
            tempAudioPath,
            path.join(this.tmpSongsPath, `${ytId}.mp3`),
            thumbnailPath
        ]);
    }

    buildFfmpegMetadataCommand(inputPath, metadata, ytId) {
        const outputPath = path.join(this.tmpSongsPath, `${ytId}.mp3`);
        let command = `ffmpeg -hide_banner -loglevel error -i ${inputPath} -id3v2_version 3`;

        command += ` -metadata title="${this.escapeShellArg(metadata.track || metadata.uploader)}"`;
        command += ` -metadata artist="${this.escapeShellArg(metadata.artist || metadata.fulltitle)}"`;

        if (metadata.album) {
            command += ` -metadata album="${this.escapeShellArg(metadata.album)}"`;
        }

        command += ` ${outputPath}`;
        return command;
    }

    // Utility methods
    cleanupTempFiles(filePaths) {
        filePaths.forEach(filePath => {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (error) {
                logger.error(`Error cleaning up file ${filePath}:`, error.message);
            }
        });
    }

    escapeShellArg(arg) {
        return arg ? arg.replace(/(["\\$])/g, '\\$1') : '';
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = DownloadManager;