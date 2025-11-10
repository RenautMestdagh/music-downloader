// services/syncManager.js
const axios = require('axios');
const { dbQuery } = require('../config/database');
const DownloadManager = require('./downloadManager');
const FileManager = require('./fileManager');

/**
 * Synchronization manager for YouTube and Jellyfin integration
 * Handles playlist comparisons and library updates
 */
class SyncManager {
    constructor() {
        this.jfUrl = process.env.JF_URL;
        this.downloadManager = new DownloadManager();
        this.fileManager = new FileManager();

        // Data stores
        this.ytPlaylists = {};
        this.ytSongs = new Set();
        this.jfPlaylists = {};
        this.jfLibrary = [];

        this.apiCallCount = 0;
        this.maxApiCalls = 9950; // Daily YouTube API quota
    }

    async loadLibraryData() {
        console.log('Loading Jellyfin library data...');

        await this.loadJellyfinLibrary();
        await this.loadJellyfinPlaylists();
        this.downloadManager.loadDownloadedFiles();

        console.log(`Loaded ${this.jfLibrary.length} library items and ${Object.keys(this.jfPlaylists).length} playlists`);
    }

    async loadJellyfinLibrary() {
        try {
            const response = await axios.get(
                `${this.jfUrl}/items?api_key=${process.env.JF_API_KEY}&userId=${process.env.JF_UID}&parentId=${process.env.JF_LIBID}&Fields=Path`,
                { headers: { "Accept-Encoding": "gzip,deflate,compress" } }
            );
            this.jfLibrary = response.data.Items;
        } catch (error) {
            console.error('Error loading Jellyfin library:', error.message);
            this.jfLibrary = [];
        }
    }

    async loadJellyfinPlaylists() {
        const playlists = await dbQuery('SELECT * FROM playlists ORDER BY name');
        this.jfPlaylists = {};

        for (const playlist of playlists) {
            try {
                const response = await axios.get(
                    `${this.jfUrl}/Playlists/${playlist.jf_id}/Items?api_key=${process.env.JF_API_KEY}&userId=${process.env.JF_UID}&Fields=Path`,
                    { headers: { "Accept-Encoding": "gzip,deflate,compress" } }
                );
                this.jfPlaylists[playlist.jf_id] = response.data.Items;
            } catch (error) {
                console.error(`Error loading Jellyfin playlist ${playlist.jf_id}:`, error.message);
                this.jfPlaylists[playlist.jf_id] = [];
            }
        }
    }

    async syncYouTubePlaylists() {
        console.log('Syncing YouTube playlists...');

        this.resetYouTubeData();
        const playlists = await dbQuery('SELECT * FROM playlists ORDER BY name');

        for (const playlist of playlists) {
            await this.fetchYouTubePlaylist(playlist);
        }

        await this.syncAllPlaylists();

        console.log(`YouTube sync complete. Processed ${this.apiCallCount} API calls`);
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

        console.log(`Fetching YouTube playlist: ${playlist.name}`);

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
                console.error(`YouTube API Error for playlist ${playlist.name}:`, error.response?.data || error.message);
                break;
            }
        }

        console.log(`"${playlist.name}": ${this.ytPlaylists[ytPlaylistId].size} items`);
    }

    async syncAllPlaylists() {
        const playlists = await dbQuery('SELECT * FROM playlists');
        const songsToDownload = new Set();

        console.log('Syncing individual playlists...');

        for (const playlist of playlists) {
            await this.syncSinglePlaylist(playlist, songsToDownload);
        }

        await this.downloadManager.processDownloads(songsToDownload);
        await this.fileManager.cleanupOrphanedFiles(this.ytSongs);

        console.log(`All playlists synced. ${songsToDownload.size} songs to download`);
    }

    async syncSinglePlaylist(playlist, songsToDownload) {
        const jfPlaylist = this.jfPlaylists[playlist.jf_id] || [];
        const ytPlaylist = this.ytPlaylists[playlist.yt_id] || new Set();

        await this.removeMissingSongs(playlist, jfPlaylist, ytPlaylist);
        await this.addNewSongs(playlist, jfPlaylist, ytPlaylist, songsToDownload);
    }

    async removeMissingSongs(playlist, jfPlaylist, ytPlaylist) {
        const songsToRemove = this.findSongsToRemove(jfPlaylist, ytPlaylist);

        if (songsToRemove.length > 0) {
            console.log(`Removing ${songsToRemove.length} songs from ${playlist.name}`);
            await this.removeSongsFromPlaylist(playlist.jf_id, songsToRemove);
        }
    }

    async addNewSongs(playlist, jfPlaylist, ytPlaylist, songsToDownload) {
        const songsToAdd = this.findSongsToAdd(jfPlaylist, ytPlaylist);

        if (songsToAdd.length > 0) {
            console.log(`Adding ${songsToAdd.length} songs to ${playlist.name}`);
        }

        for (const ytId of songsToAdd) {
            const jfSong = this.findSongInLibrary(ytId);
            if (jfSong) {
                await this.addSongToPlaylist(playlist.jf_id, jfSong.Id);
            } else if (!this.downloadManager.isFileDownloaded(ytId)) {
                songsToDownload.add(ytId);
            }
        }
    }

    // Helper methods
    findSongsToRemove(jfPlaylist, ytPlaylist) {
        return jfPlaylist
            .filter(jfSong => {
                const ytId = this.extractYtIdFromPath(jfSong.Path);
                return !ytPlaylist.has(ytId);
            })
            .map(jfSong => jfSong.PlaylistItemId);
    }

    findSongsToAdd(jfPlaylist, ytPlaylist) {
        const existingYtIds = new Set(
            jfPlaylist.map(song => this.extractYtIdFromPath(song.Path))
        );

        return Array.from(ytPlaylist).filter(ytId => !existingYtIds.has(ytId));
    }

    findSongInLibrary(ytId) {
        return this.jfLibrary.find(song =>
            this.extractYtIdFromPath(song.Path) === ytId
        );
    }

    async removeSongsFromPlaylist(playlistId, songIds) {
        const batchSize = 50;

        for (let i = 0; i < songIds.length; i += batchSize) {
            const batch = songIds.slice(i, i + batchSize);
            const entryIds = batch.join(',');

            try {
                await axios.delete(
                    `${this.jfUrl}/Playlists/${playlistId}/Items?EntryIds=${entryIds}&api_key=${process.env.JF_API_KEY}&userId=${process.env.JF_UID}`,
                    { headers: { "Accept-Encoding": "gzip,deflate,br" } }
                );
            } catch (error) {
                console.error(`Error removing songs from playlist ${playlistId}:`, error.message);
            }
        }
    }

    async addSongToPlaylist(playlistId, songId) {
        try {
            await axios.post(
                `${this.jfUrl}/Playlists/${playlistId}/Items?Ids=${songId}&api_key=${process.env.JF_API_KEY}&userId=${process.env.JF_UID}`,
                {},
                { headers: { "Accept-Encoding": "gzip,deflate,compress" } }
            );
        } catch (error) {
            console.error(`Error adding song to playlist ${playlistId}:`, error.message);
        }
    }

    extractYtIdFromPath(filePath) {
        return filePath.split("/").pop().split(".")[0];
    }
}

module.exports = SyncManager;