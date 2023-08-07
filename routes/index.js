const express = require('express');
const router = express.Router();
const path = require("path");
const fs = require("fs");
const axios = require('axios');
const youtubedl = require('youtube-dl-exec');
const {execSync} = require("child_process");
const sharp = require('sharp');

let ytPlaylists = {};
let jfPlaylists;
let jfLibrary;
let downloadedFiles;
let ytSongs;
const nextExecutions = []; // Array to store the planned executions

const slowInterval =60*60*1000 // 1 uur
let repeatInterval =  15*60*1000 // 15 minuten
const maxAtSameTime = 10
let currentAtSameTime = 0

let playlistCollection = require('../playlists.json').playlists;

let storagePath
let jfUrl

// jfLibrary = [songObj, songObj, ...]
// jfPlaylists = { jfID:[songObj, songObj, ...], jfID:[songObj, songObj, ...] }
//
// downloadedFiles = ["abc.mp3", "xyz.mp3", ...]
//
// ytSongs = Set(songId, songId, ...)
// ytPlaylists = {ytPlaylistId: Set(songId, songId, ...), ytPlaylistId: Set(songId, songId, ...), ...}

if (process.env.NODE_ENV === "production"){
    storagePath = "/media/OneDrive/"
    jfUrl = "http://localhost:8096"

} else {
    jfUrl = "https://jellybeats.duckdns.org"
    if(process.platform === "linux")
        storagePath = "/mnt/c/Users/renau/OneDrive/Muziek/"
    else
        storagePath = "/Users/renau/OneDrive/Muziek/"
}
//nextExecutions.push(setTimeout(executeAll, 120000))

router.get('/', function(req, res) {
    res.render('index', { title: 'Playlist config', data: JSON.stringify(playlistCollection) });
});

router.post('/', function(req, res) {
    async function verwerk(){

        const IDs = []
        const entryNames = []
        for (const POSTEntry of req.body){
            IDs.push(POSTEntry.ID)
            entryNames.push(POSTEntry.entryName)
        }
        if((new Set(IDs)).size !== IDs.length || (new Set(entryNames).size !== entryNames.length))  // check for duplicate id's or names
            return res.send("duplicates")

        res.send("k")

        let playlistsRef = playlistCollection
        let newPlaylists = []

        for(const POSTEntry of req.body){

            let playlistObj = getPlaylistObject("ytID", POSTEntry.ID)

            if(!playlistObj){   // if no playlist associated with that ytID -> create new playlist

                let jfPlId = await axios.post(
                    jfUrl+"/Playlists?api_key="+process.env.JF_API_KEY, {
                        Name: POSTEntry.entryName,
                        userId: process.env.JF_UID
                    }, {headers: { "Accept-Encoding": "gzip,deflate,compress" }},
                )
                newPlaylists.push({"name":POSTEntry.entryName,"ytID":POSTEntry.ID,"jfID":jfPlId.data.Id})

            } else {    // there already is a playlist with that ytId

                // check if name changed
                if( playlistObj.name === POSTEntry.entryName ){  // no changes to entry
                    newPlaylists.push(playlistObj)
                    continue
                }

                // name changed
                await axios.post(
                    jfUrl+"/Items/"+playlistObj.jfID+"?api_key="+process.env.JF_API_KEY, {
                        "Name": POSTEntry.entryName,
                        "Genres": [],
                        "Tags": [],
                        "ProviderIds": {}
                    }, {headers: { "Accept-Encoding": "gzip,deflate,compress" }},
                )
                newPlaylists.push({"name":POSTEntry.entryName,"ytID":POSTEntry.ID,"jfID":playlistObj.jfID})

            }
        }

        // delete unused jf playlists
        for(const playlistEntry of playlistsRef){
            if(!newPlaylists.find(obj => obj.jfID === playlistEntry.jfID))
                await axios.delete(jfUrl+"/Items/"+playlistEntry.jfID+"?api_key="+process.env.JF_API_KEY, {headers: { "Accept-Encoding": "gzip,deflate,compress" }})
        }

        // sort alphabetically by name
        newPlaylists.sort( function( a, b ) {
            a = a.name.toLowerCase();
            b = b.name.toLowerCase();

            return a < b ? -1 : a > b ? 1 : 0;
        });

        fs.writeFileSync(path.join(__dirname, '../playlists.json'), "{\"playlists\":"+JSON.stringify(newPlaylists)+"}");
        playlistCollection = newPlaylists

        if(nextExecutions.length > 0)
            return nextExecutions.push(setTimeout(executeAll, 50))  // its not running so run immediately
        else
            return nextExecutions.push("do again")  // its running -> give signal to run it again after execution
    }
    verwerk()
});

async function executeAll(){
    for (const plannedExecution of nextExecutions)
        clearTimeout(plannedExecution);
    nextExecutions.length = 0;

    console.log(getTimeStamp()+"----- Execution started -----")

    await getLibrary()
    await clearOldTmp()
    await getLinks()

    if(nextExecutions.length>0) // if a post happened while executing
        return nextExecutions.push(setTimeout(executeAll, 50))

    nextExecutions.push(setTimeout(executeAll, repeatInterval))

    console.log(getTimeStamp()+"----- Execution complete -----")
    console.log("|")
}

async function getLibrary() {

    jfLibrary = await axios.get(jfUrl+"/items?api_key="+process.env.JF_API_KEY+"&userId="+process.env.JF_UID+"&parentId="+process.env.JF_LIBID+"&Fields=Path", {headers: { "Accept-Encoding": "gzip,deflate,compress" }})
    jfLibrary = jfLibrary.data.Items

    jfPlaylists = {};
    for(let playlistEntry of playlistCollection) {
        let jfPlaylist = await axios.get(jfUrl + "/Playlists/" + playlistEntry.jfID + "/Items?api_key=" + process.env.JF_API_KEY + "&userId=" + process.env.JF_UID + "&Fields=Path", {headers: {"Accept-Encoding": "gzip,deflate,compress"}})
        jfPlaylists[playlistEntry.jfID] = jfPlaylist.data.Items
    }

    downloadedFiles = fs.readdirSync(storagePath).map(filename => path.parse(filename).name);

}

function clearOldTmp() {

    const tmpSongs = fs.readdirSync(path.join(__dirname, '../tmp/songs/'))
    for(const file of tmpSongs)
        fs.unlinkSync(path.join(__dirname, '../tmp/songs/'+file))

    const tmpImages = fs.readdirSync(path.join(__dirname, '../tmp/img/'))
    for(const file of tmpImages)
        fs.unlinkSync(path.join(__dirname, '../tmp/img/'+file))
}

async function getLinks() {

    ytPlaylists = {};
    ytSongs = new Set();
    let APIcalls=0

    for(let playlistEntry of playlistCollection) {
        let ytPlaylistId = playlistEntry.ytID
        ytPlaylists[ytPlaylistId] = new Set()
        let response
        let pageToken = ""

        do {
            try{
                response = await axios({
                    method: "get",
                    url: "https://youtube.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50"+pageToken+"&playlistId="+ytPlaylistId+"&key="+process.env.YT_API_KEY,
                })
                APIcalls++
                if(APIcalls>9950)
                    return console.error(getTimeStamp()+"Too many API calls for one day in one cycle")
            } catch(e){
                repeatInterval=slowInterval
                console.error(e)    // wss quota overschreden
                return console.error(getTimeStamp()+"Error YouTube API ↑")
            }
            pageToken = "&pageToken="+response.data.nextPageToken


            for(let song of response.data.items){
                ytSongs.add(song.snippet.resourceId.videoId)
                ytPlaylists[ytPlaylistId].add(song.snippet.resourceId.videoId);
            }
        }  while(response.data.nextPageToken !== undefined)

        console.log(getTimeStamp()+"YouTube playlist \""+playlistEntry.name+"\" contains "+ytPlaylists[ytPlaylistId].size+" items")
    }

    repeatInterval = Math.max( 60000, Math.ceil(86400000/(10000/(APIcalls*1.25)) ) ) //    ms in day / (10.000 api calls per day / (nr of api calls with margin)) with minimum of once every 1 minute
    if(repeatInterval>86400000) // if more than 8000 API calls, just do it once every day
        repeatInterval =86400000;


    // making sure playlists contain the correct songs
    const toDownload = new Set();
    for(let playlistEntry of playlistCollection) {
        const jfPlaylist = jfPlaylists[playlistEntry.jfID]
        const ytPlaylist = ytPlaylists[playlistEntry.ytID]
        const maxRequestSize = 7800; // Maximum request size in bytes


        // check for songs in JF playlist who aren't in the corresponding YT playlist -> remove them from JF playlist
        const onlyJfSet = new Set();
        for (const songObj of jfPlaylist) { onlyJfSet.add(jfSongObjToYtId(songObj)); }    // add all jf songs to set
        for (const ytId of ytPlaylist) { onlyJfSet.delete(ytId); }   // remove all yt id's from set

        let toDelete = ""
        let requests = [];
        for (const ytId of onlyJfSet) {
            toDelete += jfPlaylist.find(obj => jfSongObjToYtId(obj) === ytId).PlaylistItemId + ','

            if (toDelete.length >= maxRequestSize) {    // Request size exceeded, create a new request
                requests.push(toDelete.slice(0, -1)); // Add the current toDelete to requests
                toDelete = ""; // Reset toDelete for the next request
            }
        }
        if (toDelete.length > 0)
            requests.push(toDelete.slice(0, -1)); // Add the remaining toDelete to requests

        for (const request of requests)
            await axios.delete(jfUrl + "/Playlists/" + playlistEntry.jfID + "/Items?EntryIds=" + request + "&api_key=" + process.env.JF_API_KEY + "&userId=" + process.env.JF_UID, { headers: { "Accept-Encoding": "gzip,deflate,br" } });



        // check for songs in YT playlist who aren't in the corresponding JF playlist -> add them to JF playlist / put in toDownload set
        const onlyYtSet = new Set();
        for (const ytId of ytPlaylist) { onlyYtSet.add(ytId); }   // add all yt id's to set
        for (const songObj of jfPlaylist) { onlyYtSet.delete( jfSongObjToYtId(songObj) ); }   // remove all jf songs from set

        let toAdd = ""
        requests = [];
        for (const ytId of onlyYtSet) {
            const foundObj = jfLibrary.find(obj => jfSongObjToYtId(obj) === ytId);
            if (foundObj) // if its found in jfLibrary -> add to the playlist
                toAdd += foundObj.Id + ',';
            else if (!downloadedFiles.includes(ytId))  // if its not found, it still needs to be downloaded / JF didn't recognize it yet
                toDownload.add(ytId);

            if (toAdd.length >= maxRequestSize) {   // Request size exceeded, create a new request
                requests.push(toAdd.slice(0, -1)); // Add the current toAdd to requests
                toAdd = ""; // Reset toAdd for the next request
            }
        }
        if (toAdd.length > 0)
            requests.push(toAdd.slice(0, -1)); // Add the remaining toAdd to requests

        for (const request of requests)
            await axios.post(jfUrl + "/Playlists/" + playlistEntry.jfID + "/Items?Ids=" + request + "&api_key=" + process.env.JF_API_KEY + "&userId=" + process.env.JF_UID, { headers: { "Accept-Encoding": "gzip,deflate,compress" } });

    }

    // check for songs in downloadedFiles who aren't in a single playlist -> remove songs from storage
    const onlyInDownloadsSet = new Set(downloadedFiles);    // add all downloaded songs
    for (const ytId of ytSongs) { onlyInDownloadsSet.delete(ytId); }   // remove all yt id's
    for (const ytId of onlyInDownloadsSet) { fs.unlinkSync(storagePath + ytId + ".mp3") }


    // download new songs
    for (const ytId of toDownload) {
        while(currentAtSameTime >= maxAtSameTime){ await new Promise(r => setTimeout(r, randomIntFromInterval(5000, 10000))); }  // 5-10 seconden wachten voor opnieuw check
        currentAtSameTime ++
        downloadSong(ytId)
    }

    while(currentAtSameTime !== 0){
        await new Promise(r => setTimeout(r, 5000)); // 5 seconden wachten voor opnieuw check, wachten tegen alles gedownload is
    }
}

async function downloadSong(id){

    let metadata

    try{
        metadata = await youtubedl("https://music.youtube.com/watch?v="+id, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: [
                'referer:youtube.com',
                'user-agent:googlebot'
            ],
        })

        await youtubedl("https://music.youtube.com/watch?v="+id, {
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: [
                'referer:youtube.com',
                'user-agent:googlebot'
            ],
            output:"tmp/songs/"+id+"X.mp3",
            format: "bestaudio",
        })

    } catch (e) {
        console.error(getTimeStamp()+"Song https://youtube.com/watch?v="+id+" failed to download")
        return currentAtSameTime --
    }

    let count = 0;
    const maxTries = 5;
    while(true) {
        try{
            await axios
                .get(metadata.thumbnail, {
                    responseType: "text",
                    responseEncoding: "base64",
                })
                .then(async (resp) => {
                    const uri = resp.data.split(';base64,').pop()
                    let imgBuffer = Buffer.from(uri, 'base64');
                    await sharp(imgBuffer)
                        .resize(1080, 1080)
                        .toFile('tmp/img/' + metadata.id + ".jpg")
                        .catch(err => console.log(`downisze issue ${err}`))

                })
            break
        } catch (e) {
            if (++count === maxTries) {
                console.error(getTimeStamp()+"Picture "+metadata.thumbnail+" failed to download")
                return currentAtSameTime--
            }
        }
    }

    //'ffmpeg -i ' + 'tmp/songs/' + metadata.id + 'X.mp3 -id3v2_version 3 ' +
    //             ' -metadata title="' + metadata.track +
    //             '" -metadata artist="' + metadata.artist +
    //             '" -metadata album="' + metadata.album +
    //             '" tmp/songs/' + id + ".mp3"

    let toExecute = 'ffmpeg -hide_banner -loglevel error -i ' + 'tmp/songs/' + metadata.id + 'X.mp3 -id3v2_version 3 '
    if(metadata.track)
        toExecute += ' -metadata title="' + metadata.track.replaceAll('"','\\"').replaceAll(/'/g,'\'')
    else
        toExecute += ' -metadata title="' + metadata.uploader.replaceAll('"','\\"').replaceAll(/'/g,'\'')
    if(metadata.artist)
        toExecute += '" -metadata artist="' + metadata.artist.replaceAll('"','\\"').replaceAll(/'/g,'\'')
    else
        toExecute += '" -metadata artist="' + metadata.fulltitle.replaceAll('"','\\"').replaceAll(/'/g,'\'')
    if(metadata.album)
        toExecute += '" -metadata album="' + metadata.album.replaceAll('"','\\"').replaceAll(/'/g,'\'')
    toExecute += '" tmp/songs/' + id + ".mp3"

    try{
        execSync(toExecute, {encoding: 'utf-8'});
    } catch(e) {
        console.error(getTimeStamp()+"Setting metadata failed")
        return currentAtSameTime--
    }

    fs.unlinkSync('tmp/songs/' + metadata.id + 'X.mp3')

    execSync('ffmpeg -hide_banner -loglevel error -i tmp/songs/' + id + ".mp3"+' -i tmp/img/' + id + ".jpg -map 0:0 -map 1:0 -c copy -id3v2_version 3 " +
        "-metadata:s:v title=\"Album cover\" -metadata:s:v comment=\"Cover (front)\" "+storagePath + id + ".mp3", { encoding: 'utf-8' });  // the default is 'buffer'

    fs.unlinkSync('tmp/songs/' + metadata.id + '.mp3')
    fs.unlinkSync('tmp/img/' + metadata.id + '.jpg')

    console.log(getTimeStamp()+"Song https://music.youtube.com/watch?v="+metadata.id+" downloaded")
    currentAtSameTime--
}

function jfSongObjToYtId(songObj) {
    return songObj.Path.split("/").slice(-1)[0].split(".")[0];
}

function getPlaylistObject(attribute, value){
    return playlistCollection.find(obj => obj[attribute] === value)
}

function randomIntFromInterval(min, max) { // min and max included
    return Math.floor(Math.random() * (max - min + 1) + min)
}

function getTimeStamp(){
    const d = new Date()
    return "".concat("[",d.getHours().toString().padStart(2, '0'),":",d.getMinutes().toString().padStart(2, '0'),":",d.getSeconds().toString().padStart(2, '0'),"] ")
}

module.exports = router;
