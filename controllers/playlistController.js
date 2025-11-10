// controllers/playlistController.js
const axios = require('axios');
const { dbQuery, dbGet, dbRun } = require('../config/database');

class PlaylistController {
    // Web view method (moved from web.js)
    async getPlaylistsView(req, res) {
        try {
            const playlists = await dbQuery('SELECT * FROM playlists ORDER BY name');
            res.render('index', {
                title: 'Playlist Config',
                jf_url: process.env.JF_URL,
                data: JSON.stringify(playlists),
            });
        } catch (error) {
            console.error('Error loading playlists:', error);
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
            console.error('Error getting playlists:', error);
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

            // Create playlist in Jellyfin
            const jfResponse = await axios.post(
                `${process.env.JF_URL}/Playlists?api_key=${process.env.JF_API_KEY}`,
                {
                    Name: name,
                    userId: process.env.JF_UID
                },
                { headers: { "Accept-Encoding": "gzip,deflate,compress" } }
            );

            // Insert into database
            const result = await dbRun(
                'INSERT INTO playlists (name, jf_id, yt_id) VALUES (?, ?, ?)',
                [name, jfResponse.data.Id, yt_id]
            );

            res.status(201).json({
                id: result.id,
                name,
                jf_id: jfResponse.data.Id,
                yt_id,
            });
        } catch (error) {
            console.error('Error creating playlist:', error);
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

            // Update in Jellyfin if name changed
            if (name && name !== playlist.name) {
                await axios.post(
                    `${process.env.JF_URL}/Items/${playlist.jf_id}?api_key=${process.env.JF_API_KEY}`,
                    {
                        "Name": name,
                        "Genres": [],
                        "Tags": [],
                        "ProviderIds": {}
                    },
                    { headers: { "Accept-Encoding": "gzip,deflate,compress" } }
                );
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

            res.json({ message: 'Playlist updated successfully' });
        } catch (error) {
            console.error('Error updating playlist:', error);
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

            // Delete from Jellyfin
            await axios.delete(
                `${process.env.JF_URL}/Items/${playlist.jf_id}?api_key=${process.env.JF_API_KEY}`,
                { headers: { "Accept-Encoding": "gzip,deflate,compress" } }
            );

            // Delete from database
            await dbRun('DELETE FROM playlists WHERE id = ?', [id]);

            res.json({ message: 'Playlist deleted successfully' });
        } catch (error) {
            console.error('Error deleting playlist:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new PlaylistController();