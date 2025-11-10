// routes/web.js
const express = require('express');
const router = express.Router();
const playlistController = require('../controllers/playlistController');

// Playlist Management Routes
router.get('/', playlistController.getPlaylistsView);

module.exports = router;