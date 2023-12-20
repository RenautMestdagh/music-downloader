FROM --platform=linux/arm64 node:20.10.0
RUN apt-get update
RUN apt-get install python3 -y
RUN apt-get install ffmpeg -y
WORKDIR /usr/app
COPY package*.json .
RUN npm install
COPY . .
EXPOSE 7070
CMD [ "npm", "start"]
