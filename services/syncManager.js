// services/syncManager.js
const axios = require('axios');
const { dbQuery } = require('../config/database');
const DownloadManager = require('./downloadManager');
const M3UManager = require('./m3uManager');
const logger = require('../utils/logger');

/**
 * Synchronization manager for YouTube and M3U playlist integration
 * Handles playlist synchronization and M3U file generation
 */
class SyncManager {
    constructor() {
        this.downloadManager = new DownloadManager();
        this.m3uManager = new M3UManager();

        // Data stores
        this.ytPlaylists = {};
        this.ytSongs = new Set();

        this.apiCallCount = 0;
        this.maxApiCalls = 9950; // Daily YouTube API quota
    }

    async loadLibraryData() {
        await logger.syncOperation('Loading downloaded songs', async () => {
            this.downloadManager.loadDownloadedFiles();
        });
    }

    async syncYouTubePlaylists() {
        await logger.syncOperation('Syncing YouTube playlists', async () => {
            this.resetYouTubeData();
            const playlists = await dbQuery('SELECT * FROM playlists ORDER BY name');

            for (const playlist of playlists)
                await this.fetchYouTubePlaylist(playlist);

            logger.info(`YouTube sync complete. Processed ${logger.pluralize(this.apiCallCount, 'API call')}`);
        });
    }

    resetYouTubeData() {
        this.ytPlaylists = {};
        this.ytSongs = new Set();
        this.apiCallCount = 0;
    }

    async fetchYouTubePlaylist(playlist) {
        const ytPlaylistId = playlist.yt_id;
        this.ytPlaylists[ytPlaylistId] = new Set();
        let pageToken = "";
        let hasMorePages = true;

        while (hasMorePages && this.apiCallCount < this.maxApiCalls) {
            try {
                const response = await axios({
                    method: "get",
                    url: `https://youtube.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50${pageToken}&playlistId=${ytPlaylistId}&key=${process.env.YT_API_KEY}`,
                });

                this.apiCallCount++;

                for (const song of response.data.items) {
                    const videoId = song.snippet.resourceId.videoId;
                    this.ytSongs.add(videoId);
                    this.ytPlaylists[ytPlaylistId].add(videoId);
                }

                pageToken = response.data.nextPageToken ? `&pageToken=${response.data.nextPageToken}` : "";
                hasMorePages = !!response.data.nextPageToken;

            } catch (error) {
                logger.error(`YouTube API Error for playlist ${playlist.name}:`, error.response?.data || error.message);
                break;
            }
        }

        logger.info(`YouTube playlist "${playlist.name}": ${logger.pluralize(this.ytPlaylists[ytPlaylistId].size, 'item')}`);
    }

    async syncAllPlaylists() {
        const playlists = await dbQuery('SELECT * FROM playlists');
        const songsToDownload = new Set();

        await logger.syncOperation('Syncing playlists and generating M3U files', async () => {
            // Generate M3U files from YouTube playlists
            for (const playlist of playlists) {
                const ytPlaylist = this.ytPlaylists[playlist.yt_id] || new Set();
                const ytIds = Array.from(ytPlaylist);
                
                // Add missing songs to download queue
                for (const ytId of ytIds) {
                    if (!this.downloadManager.isFileDownloaded(ytId)) {
                        songsToDownload.add(ytId);
                    }
                }
            }

            // Process downloads
            await this.downloadManager.processDownloads(songsToDownload);

            // Generate M3U files with all songs from YouTube playlists
            for (const playlist of playlists) {
                const ytPlaylist = this.ytPlaylists[playlist.yt_id] || new Set();
                const ytIds = Array.from(ytPlaylist);
                await this.m3uManager.createOrUpdatePlaylist(playlist.name, ytIds);
            }
        });
    }
}

module.exports = SyncManager;
