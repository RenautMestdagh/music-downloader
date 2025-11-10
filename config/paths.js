// config/paths.js
const path = require('path');

const getPaths = () => {
    // Storage path for final MP3 files
    const storagePath = process.env.STORAGE_PATH || (
        process.env.NODE_ENV === "production"
            ? "/songs"
            : process.platform === "linux"
                ? "/mnt/z/"
                : "Z:\\"
    );

    // Database paths
    const dbPath = process.env.DB_PATH || (
        process.env.NODE_ENV === 'production'
            ? path.join('/data', 'music_downloader.db')
            : path.join(__dirname, '..', 'data', 'music_downloader.db')
    );

    // Temporary directories for processing
    const tmpSongsPath = process.env.NODE_ENV === "production"
        ? path.join("/tmp", "songs")
        : path.join(__dirname, '..', 'tmp', 'songs');

    const tmpImgPath = process.env.NODE_ENV === "production"
        ? path.join("/tmp", "img")
        : path.join(__dirname, '..', 'tmp', 'img');

    return {
        storagePath,
        dbPath,
        tmpSongsPath,
        tmpImgPath
    };
};

module.exports = getPaths();