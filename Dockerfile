FROM node:18.17.0-alpine
RUN apk add --no-cache python3
WORKDIR /usr/app
COPY package.json .
RUN npm install --quiet
RUN apk update
RUN apk add ffmpeg
COPY . .
EXPOSE 7070
CMD yarn start
