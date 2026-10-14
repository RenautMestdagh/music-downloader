// config/secrets.js
const fs = require('fs');

/**
 * Read a secret from the environment.
 * If `${name}_FILE` is set, the value is read from that file (Docker secrets),
 * otherwise `process.env[name]` is returned unchanged.
 */
const readSecret = (name) => {
    const filePath = process.env[`${name}_FILE`];
    if (!filePath) {
        return process.env[name];
    }

    try {
        return fs.readFileSync(filePath, 'utf8').trim();
    } catch (error) {
        throw new Error(`Failed to read ${name}_FILE (${filePath}): ${error.code || error.message}`);
    }
};

// Resolved once at startup so a missing secret file fails fast
const secrets = {
    SESSION_SECRET: readSecret('SESSION_SECRET'),
    BASIC_AUTH_USER: readSecret('BASIC_AUTH_USER'),
    BASIC_AUTH_PASSWORD: readSecret('BASIC_AUTH_PASSWORD'),
    YT_API_KEY: readSecret('YT_API_KEY')
};

module.exports = { readSecret, secrets };
