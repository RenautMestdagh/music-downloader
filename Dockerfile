FROM node:18-alpine

# Install dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg

# Create app directory
WORKDIR /usr/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p /data /songs /tmp/songs /tmp/img

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Switch to non-root user
USER node

# Expose port
EXPOSE 3000

CMD [ "npm", "start" ]