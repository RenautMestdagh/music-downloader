// controllers/playlistController.js
const { dbQuery, dbGet, dbRun } = require('../config/database');
const M3UManager = require('../services/m3uManager');
const logger = require('../utils/logger');

class PlaylistController {
    constructor() {
        this.m3uManager = new M3UManager();
    }

    // Web view method (moved from web.js)
    async getPlaylistsView(req, res) {
        try {
            const playlists = await dbQuery('SELECT * FROM playlists ORDER BY name');
            res.render('index', {
                title: 'Playlist Config',
                data: JSON.stringify(playlists),
            });
        } catch (error) {
            logger.error('Error loading playlists:', error);
            res.status(500).render('error', {
                message: 'Error loading playlists',
                error: process.env.NODE_ENV === 'development' ? error : {}
            });
        }
    }

    // Existing API methods
    async getAllPlaylists(req, res) {
        try {
            const playlists = await dbQuery('SELECT * FROM playlists ORDER BY name');
            res.json(playlists);
        } catch (error) {
            logger.error('Error getting playlists:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async createPlaylist(req, res) {
        try {
            const { name, yt_id } = req.body;

            if (!name || !yt_id) {
                return res.status(400).json({ error: 'Name and YouTube ID are required' });
            }

            // Check for duplicates
            const existing = await dbGet('SELECT id FROM playlists WHERE yt_id = ? OR name = ?', [yt_id, name]);
            if (existing) {
                return res.status(409).json({ error: 'Playlist with this YouTube ID or name already exists' });
            }

            // Insert into database
            const result = await dbRun(
                'INSERT INTO playlists (name, yt_id) VALUES (?, ?)',
                [name, yt_id]
            );

            logger.info(`Created playlist: ${name} (YouTube ID: ${yt_id})`);
            res.status(201).json({
                id: result.id,
                name,
                yt_id,
            });
        } catch (error) {
            logger.error('Error creating playlist:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async updatePlaylist(req, res) {
        try {
            const { id } = req.params;
            const { name, yt_id } = req.body;

            const playlist = await dbGet('SELECT * FROM playlists WHERE id = ?', [id]);
            if (!playlist) {
                return res.status(404).json({ error: 'Playlist not found' });
            }

            // Update in database
            const updates = [];
            const params = [];

            if (name) {
                updates.push('name = ?');
                params.push(name);
            }
            if (yt_id) {
                updates.push('yt_id = ?');
                params.push(yt_id);
            }

            if (updates.length > 0) {
                params.push(id);
                await dbRun(
                    `UPDATE playlists SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    params
                );
            }

            logger.info(`Updated playlist: ${playlist.name} -> ${name || playlist.name}`);
            res.json({ message: 'Playlist updated successfully' });
        } catch (error) {
            logger.error('Error updating playlist:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async deletePlaylist(req, res) {
        try {
            const { id } = req.params;

            const playlist = await dbGet('SELECT * FROM playlists WHERE id = ?', [id]);
            if (!playlist) {
                return res.status(404).json({ error: 'Playlist not found' });
            }

            // Delete M3U file
            this.m3uManager.deletePlaylist(playlist.name);

            // Delete from database
            await dbRun('DELETE FROM playlists WHERE id = ?', [id]);

            logger.info(`Deleted playlist: ${playlist.name}`);
            res.json({ message: 'Playlist deleted successfully' });
        } catch (error) {
            logger.error('Error deleting playlist:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // New method to get M3U playlists
    async getM3UPlaylists(req, res) {
        try {
            const playlists = this.m3uManager.getAllPlaylists();
            res.json(playlists);
        } catch (error) {
            logger.error('Error getting M3U playlists:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // New method to download M3U file
    async downloadM3U(req, res) {
        try {
            const { name } = req.params;
            const playlist = this.m3uManager.readPlaylist(name);
            
            if (playlist.songs.length === 0) {
                return res.status(404).json({ error: 'Playlist not found or empty' });
            }

            const filename = `${name}.m3u`;
            const filePath = require('path').join(require('../config/paths').storagePath, filename);
            
            res.download(filePath, filename, (err) => {
                if (err) {
                    logger.error('Error downloading M3U file:', err);
                    res.status(500).json({ error: 'Error downloading file' });
                }
            });
        } catch (error) {
            logger.error('Error downloading M3U:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new PlaylistController();
