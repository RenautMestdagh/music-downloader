// services/downloadManager.js
const youtubedl = require('youtube-dl-exec');
const { execSync } = require("child_process");
const sharp = require('sharp');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { storagePath, tmpSongsPath, tmpImgPath } = require('../config/paths');

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
            ? fs.readdirSync(this.storagePath).map(filename => path.parse(filename).name)
            : [];

        console.log(`Loaded ${this.downloadedFiles.length} existing files`);
    }

    isFileDownloaded(ytId) {
        return this.downloadedFiles.includes(ytId);
    }

    async processDownloads(songsToDownload) {
        if (songsToDownload.size === 0) {
            console.log('No new songs to download');
            return;
        }

        console.log(`Processing ${songsToDownload.size} downloads...`);

        const downloadPromises = Array.from(songsToDownload).map(ytId =>
            this.downloadSongWithConcurrency(ytId)
        );

        await Promise.allSettled(downloadPromises);
        console.log('All downloads processed');
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

            console.log(`Downloaded: ${metadata.track || metadata.uploader} - ${metadata.artist || metadata.fulltitle}`);
        } catch (error) {
            console.error(`Download failed for ${ytId}:`, error.message);
        }
    }

    async fetchVideoMetadata(ytId) {
        console.log(`Fetching metadata for ${ytId}`);

        return await youtubedl(`https://music.youtube.com/watch?v=${ytId}`, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: [
                'referer:youtube.com',
                'user-agent:googlebot'
            ],
        });
    }

    async downloadAudioFile(ytId) {
        console.log(`Downloading audio for ${ytId}`);

        await youtubedl(`https://music.youtube.com/watch?v=${ytId}`, {
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: [
                'referer:youtube.com',
                'user-agent:googlebot'
            ],
            output: path.join(this.tmpSongsPath, `${ytId}X.mp3`),
            format: "bestaudio",
        });
    }

    async processThumbnail(metadata) {
        console.log(`Processing thumbnail for ${metadata.id}`);

        const response = await axios.get(metadata.thumbnail, {
            responseType: "arraybuffer",
        });

        await sharp(response.data)
            .resize(1080, 1080)
            .toFile(path.join(this.tmpImgPath, `${metadata.id}.jpg`));
    }

    async processAudioFile(ytId, metadata) {
        console.log(`Processing audio file for ${ytId}`);

        const tempAudioPath = path.join(this.tmpSongsPath, `${ytId}X.mp3`);
        const finalAudioPath = path.join(this.storagePath, `${ytId}.mp3`);
        const thumbnailPath = path.join(this.tmpImgPath, `${ytId}.jpg`);

        // Add metadata to audio file
        const ffmpegCommand = this.buildFfmpegMetadataCommand(tempAudioPath, metadata, ytId);
        execSync(ffmpegCommand, { encoding: 'utf-8' });

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
                console.error(`Error cleaning up file ${filePath}:`, error.message);
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