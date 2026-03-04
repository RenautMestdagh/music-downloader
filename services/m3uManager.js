// services/m3uManager.js
const fs = require('fs');
const path = require('path');
const { storagePath } = require('../config/paths');
const logger = require('../utils/logger');

/**
 * M3U playlist manager
 * Handles creation, reading, and updating of M3U playlist files
 */
class M3UManager {
    constructor() {
        this.storagePath = storagePath;
    }

    /**
     * Create or update an M3U playlist file
     * @param {string} playlistName - Name of the playlist
     * @param {Array<string>} ytIds - Array of YouTube video IDs
     */
    async createOrUpdatePlaylist(playlistName, ytIds) {
        const filename = `${playlistName}.m3u`;
        const filePath = path.join(this.storagePath, filename);
        
        let m3uContent = `#EXTM3U\n`;
        
        for (const ytId of ytIds) {
            const mp3File = path.join(this.storagePath, `${ytId}.mp3`);
            if (fs.existsSync(mp3File)) {
                m3uContent += `${ytId}.mp3\n`;
            } else {
                logger.warn(`Song file not found for ${ytId}, skipping in playlist ${playlistName}`);
            }
        }
        
        try {
            fs.writeFileSync(filePath, m3uContent, 'utf8');
            logger.info(`Updated M3U playlist: ${filename}`);
        } catch (error) {
            logger.error(`Error creating M3U playlist ${filename}:`, error.message);
            throw error;
        }
    }

    /**
     * Read an M3U playlist file
     * @param {string} playlistName - Name of the playlist
     * @returns {Object} { name: string, songs: Array<string> }
     */
    readPlaylist(playlistName) {
        const filename = `${playlistName}.m3u`;
        const filePath = path.join(this.storagePath, filename);
        
        if (!fs.existsSync(filePath)) {
            return { name: playlistName, songs: [] };
        }
        
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n').filter(line => line.trim() !== '');
            
            let name = playlistName;
            const songs = [];
            
            for (const line of lines) {
                if (line.endsWith('.mp3')) {
                    songs.push(path.parse(line).name);
                }
            }
            
            return { name, songs };
        } catch (error) {
            logger.error(`Error reading M3U playlist ${filename}:`, error.message);
            return { name: playlistName, songs: [] };
        }
    }

    /**
     * Get all M3U playlists in storage
     * @returns {Array<Object>} Array of playlist objects
     */
    getAllPlaylists() {
        if (!fs.existsSync(this.storagePath)) {
            return [];
        }
        
        const files = fs.readdirSync(this.storagePath);
        const playlistFiles = files.filter(file => file.endsWith('.m3u'));
        
        const playlists = [];
        for (const file of playlistFiles) {
            const playlistName = file.slice(0, -4);
            const playlist = this.readPlaylist(playlistName);
            playlists.push(playlist);
        }
        
        return playlists;
    }

    /**
     * Delete an M3U playlist file
     * @param {string} playlistName - Name of the playlist
     */
    deletePlaylist(playlistName) {
        const filename = `${playlistName}.m3u`;
        const filePath = path.join(this.storagePath, filename);

        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                logger.info(`Deleted M3U playlist: ${filename}`);
            } catch (error) {
                logger.error(`Error deleting M3U playlist ${filename}:`, error.message);
                throw error;
            }
        }
    }
}

module.exports = M3UManager;
