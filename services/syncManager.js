// services/syncManager.js
const axios = require('axios');
const { dbQuery } = require('../config/database');
const DownloadManager = require('./downloadManager');
const logger = require('../utils/logger'); // Add this

/**
 * Synchronization manager for YouTube and Jellyfin integration
 * Handles playlist comparisons and library updates
 */
class SyncManager {
    constructor() {
        this.jfUrl = process.env.JF_URL;
        this.downloadManager = new DownloadManager();

        // Data stores
        this.ytPlaylists = {};
        this.ytSongs = new Set();
        this.jfPlaylists = {};
        this.jfLibrary = [];

        this.apiCallCount = 0;
        this.maxApiCalls = 9950; // Daily YouTube API quota
    }

    async loadLibraryData() {
        await logger.syncOperation('Loading Jellyfin library data', async () => {
            await this.loadJellyfinLibrary();
            await this.loadJellyfinPlaylists();
            logger.info(`Loaded ${this.jfLibrary.length} library items and ${Object.keys(this.jfPlaylists).length} playlists`);

            this.downloadManager.loadDownloadedFiles();
        });
    }

    async loadJellyfinLibrary() {
        try {
            const response = await axios.get(
                `${this.jfUrl}/items?userId=${process.env.JF_UID}&parentId=${process.env.JF_LIBID}&Fields=Path`,
                { headers: { "Accept-Encoding": "gzip,deflate,compress", "Authorization": `MediaBrowser Token="${process.env.JF_API_KEY}"` } }
            );
            this.jfLibrary = response.data.Items.map(jfSong => ({
                id: jfSong.Id,
                ytId: this.extractYtIdFromPath(jfSong.Path)
            }));
        } catch (error) {
            logger.error('Error loading Jellyfin library:', error.message);
            this.jfLibrary = [];
        }
    }

    async loadJellyfinPlaylists() {
        const playlists = await dbQuery('SELECT * FROM playlists ORDER BY name');
        this.jfPlaylists = {};

        for (const playlist of playlists) {
            try {
                const response = await axios.get(
                    `${this.jfUrl}/Playlists/${playlist.jf_id}/Items?userId=${process.env.JF_UID}&Fields=Path`,
                    { headers: { "Accept-Encoding": "gzip,deflate,compress", "Authorization": `MediaBrowser Token="${process.env.JF_API_KEY}"` } }
                );
                this.jfPlaylists[playlist.jf_id] = response.data.Items.map(jfSong => ({
                    ytId: this.extractYtIdFromPath(jfSong.Path),
                    playlistItemId: jfSong.PlaylistItemId
                }));
            } catch (error) {
                logger.error(`Error loading Jellyfin playlist ${playlist.jf_id}:`, error.message);
                this.jfPlaylists[playlist.jf_id] = [];
            }
        }
    }

    async syncYouTubePlaylists() {
        await logger.syncOperation('Syncing YouTube playlists', async () => {
            this.resetYouTubeData();
            const playlists = await dbQuery('SELECT * FROM playlists ORDER BY name');

            for (const playlist of playlists)
                await this.fetchYouTubePlaylist(playlist);

            logger.info(`YouTube sync complete. Processed ${this.apiCallCount} API calls`);
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

        logger.info(`YouTube playlist "${playlist.name}": ${this.ytPlaylists[ytPlaylistId].size} items`);
    }

    async syncAllPlaylists() {
        const playlists = await dbQuery('SELECT * FROM playlists');
        const songsToDownload = new Set();

        await logger.syncOperation('Syncing individual playlists', async () => {
            for (const playlist of playlists) {
                await this.syncSinglePlaylist(playlist, songsToDownload);
            }

            await this.downloadManager.processDownloads(songsToDownload);
        });
    }

    async syncSinglePlaylist(playlist, songsToDownload) {
        const jfPlaylist = this.jfPlaylists[playlist.jf_id] || [];
        const ytPlaylist = this.ytPlaylists[playlist.yt_id] || new Set();

        await this.removeMissingSongs(playlist, jfPlaylist, ytPlaylist);
        await this.addNewSongs(playlist, jfPlaylist, ytPlaylist, songsToDownload);
    }

    async removeMissingSongs(playlist, jfPlaylist, ytPlaylist) {
        const songsToRemove = jfPlaylist.filter(jfSong => !ytPlaylist.has(jfSong.ytId));

        if (songsToRemove.length > 0) {
            logger.info(`Removing ${songsToRemove.length} songs from ${playlist.name}`);
            await this.removeSongsFromPlaylist(playlist.jf_id, songsToRemove);
        }
    }

    async addNewSongs(playlist, jfPlaylist, ytPlaylist, songsToDownload) {
        const existingYtIds = new Set(jfPlaylist.map(song => song.ytId));
        const songsToAdd = Array.from(ytPlaylist).filter(ytId => !existingYtIds.has(ytId));

        let addToPlaylist = 0;
        for (const ytId of songsToAdd) {
            const jfSong = this.jfLibrary.find(song => song.ytId === ytId);
            if (jfSong) {
                await this.addSongToPlaylist(playlist.jf_id, jfSong.id);
                addToPlaylist++;
            } else if (!this.downloadManager.isFileDownloaded(ytId)) {
                songsToDownload.add(ytId);
            }
        }
        if(addToPlaylist > 0)
            logger.info(`Added ${addToPlaylist} songs to ${playlist.name}`);
    }

    // Helper methods
    async removeSongsFromPlaylist(playlistId, songsToRemove) {
        const batchSize = 50;
        const songIds = songsToRemove.map(song => song.PlaylistItemId);

        for (let i = 0; i < songIds.length; i += batchSize) {
            const batch = songIds.slice(i, i + batchSize);
            const entryIds = batch.join(',');

            if(process.env.DRY_RUN)
                continue;

            try {
                await axios.delete(
                    `${this.jfUrl}/Playlists/${playlistId}/Items?EntryIds=${entryIds}&userId=${process.env.JF_UID}`,
                    { headers: { "Accept-Encoding": "gzip,deflate,compress", "Authorization": `MediaBrowser Token="${process.env.JF_API_KEY}"` } }
                );
            } catch (error) {
                logger.error(`Error removing songs from playlist ${playlistId}:`, error.message);
            }
        }
    }

    async addSongToPlaylist(playlistId, songId) {
        if(process.env.DRY_RUN)
            return;

        try {
            await axios.post(
                `${this.jfUrl}/Playlists/${playlistId}/Items?Ids=${songId}&userId=${process.env.JF_UID}`,
                {},
                { headers: { "Accept-Encoding": "gzip,deflate,compress", "Authorization": `MediaBrowser Token="${process.env.JF_API_KEY}"` } }
            );
        } catch (error) {
            logger.error(`Error adding song to playlist ${playlistId}:`, error.message);
        }
    }

    extractYtIdFromPath(filePath) {
        return filePath.split("/").pop().split(".")[0];
    }
}

module.exports = SyncManager;