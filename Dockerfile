FROM node:24-alpine

ENV NODE_ENV=production

# Install dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    shadow

# Install 'shadow' if 'usermod' isn't available, but generally
# unnecessary for basic alpine node images. Adding for safety.

# Create app directory
WORKDIR /usr/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

# --- FLEXIBLE PERMISSION LOGIC ---

# 1. Create a generic 'app' group and add the default 'node' user to it.
RUN groupadd -r app && \
    usermod -a -G app node

# 2. Create necessary directories and ensure they are owned by the node:app group.
RUN mkdir -p /data /songs /tmp/songs /tmp/img && \
    chown -R 1002:100 /data /songs /tmp/songs /tmp/img && \
    chmod -R 777 /data /songs /tmp/songs /tmp/img

# 3. CRITICAL: Make them group-writable (g+w).
# This allows any user running the container process to write
# if their GID matches the 'app' group (which we override at runtime).

# --- END FLEXIBLE PERMISSION LOGIC ---

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "require('http').get('http://localhost/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Switch to non-root user for security
USER node

# Expose port
EXPOSE 80

CMD [ "npm", "start" ]