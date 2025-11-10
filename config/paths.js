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

    // Temporary directories for processing
    const tmpSongsPath = path.join(__dirname, '../tmp/songs');
    const tmpImgPath = path.join(__dirname, '../tmp/img');

    return {
        storagePath,
        tmpSongsPath,
        tmpImgPath
    };
};

module.exports = getPaths();