// utils/logger.js
class Logger {
    constructor() {
        this.levels = {
            ERROR: 0,
            WARN: 1,
            INFO: 2,
            DEBUG: 3,
            TRACE: 4
        };

        this.levelNames = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];
        this.currentLevel = this.levels[process.env.LOG_LEVEL?.toUpperCase()] || this.levels.INFO;
        this.indentLevel = 0;
        this.indentSize = 2;
    }

    setLevel(level) {
        if (typeof level === 'string') {
            this.currentLevel = this.levels[level.toUpperCase()] || this.levels.INFO;
        } else {
            this.currentLevel = level;
        }
    }

    getTimestamp() {
        return new Date().toISOString();
    }

    getIndent() {
        return ' '.repeat(this.indentLevel * this.indentSize);
    }

    log(level, message, ...args) {
        if (this.levels[level] > this.currentLevel) return;

        const timestamp = this.getTimestamp();
        const indent = this.getIndent();
        const formattedMessage = `[${timestamp}]: ${indent}${message}`;

        if (this.levels[level] <= this.levels.WARN) {
            console.error(formattedMessage, ...args);
        } else {
            console.log(formattedMessage, ...args);
        }
    }

    // Convenience methods
    error(message, ...args) {
        this.log('ERROR', message, ...args);
    }

    warn(message, ...args) {
        this.log('WARN', message, ...args);
    }

    info(message, ...args) {
        this.log('INFO', message, ...args);
    }

    debug(message, ...args) {
        this.log('DEBUG', message, ...args);
    }

    trace(message, ...args) {
        this.log('TRACE', message, ...args);
    }

    // Indentation methods for structured logging
    group(message, ...args) {
        this.info(message, ...args);
        this.indentLevel++;
    }

    groupEnd() {
        if (this.indentLevel > 0) {
            this.indentLevel--;
        }
    }

    // For sync operations with automatic grouping
    async syncOperation(name, operation) {
        this.group(`${name}`);
        try {
            return await operation();
        } finally {
            this.groupEnd();
        }
    }

    // For download operations
    async downloadOperation(name, operation) {
        this.group(`${name}`);
        try {
            return await operation();
        } finally {
            this.groupEnd();
        }
    }

    // For file operations
    async fileOperation(name, operation) {
        this.group(`${name}`);
        try {
            return await operation();
        } finally {
            this.groupEnd();
        }
    }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;