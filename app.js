const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('cookie-session');
const logger = require('morgan');
const axios = require("axios");
const fs = require("fs");
require('dotenv').config()
const router = express.Router();

const app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use("/ytconfig",express.static(path.join(__dirname, 'public')));
app.use(
    session({
        resave: false,
        saveUninitialized: false,
        secret: 'y&yR2q43rYz##4Z5',
    })
)

async function initializePlaylists() {

    //get all current playlists
    let jfPlaylists = await axios.get("http://localhost:8096/Users/" + process.env.JF_UID + "/Items?api_key=" + process.env.JF_API_KEY + "&ParentId=" + process.env.JF_LIBID + "&IncludeItemTypes=Playlist&Recursive=true", {headers: {"Accept-Encoding": "gzip,deflate,compress"}})
    // delete all current playlists
    for(let playlistEntry of jfPlaylists.data.Items)
        await axios.delete("http://localhost:8096/Items/"+playlistEntry.Id+"?api_key="+process.env.JF_API_KEY, {headers: { "Accept-Encoding": "gzip,deflate,compress" }})

    let playlists = []
    let playlistInit = require('./initConfig.json').playlists;

    // create playlists
    for(let playlistEntry of playlistInit){
        let jfPlId = await axios.post(
            "http://localhost:8096/Playlists?api_key="+process.env.JF_API_KEY, {
                Name: playlistEntry.name,
                userId: process.env.JF_UID
            }, {headers: { "Accept-Encoding": "gzip,deflate,compress" }},
        )
        playlists.push({"name":playlistEntry.name,"ytID":playlistEntry.ytID,"jfID":jfPlId.data.Id})
    }

    // sort alphabetically by name
    playlists.sort( function( a, b ) {
        a = a.name.toLowerCase();
        b = b.name.toLowerCase();

        return a < b ? -1 : a > b ? 1 : 0;
    });

    fs.writeFileSync(path.join(__dirname, './playlists.json'), "{\"playlists\":"+JSON.stringify(playlists)+"}");

}

initializePlaylists();

const redirectLogin = (req, res, next) => {
    if (!req.session.userId && req.url!=="/login") {
        if(req.method==='POST')
            return res.send('noSession')
        return res.redirect('/ytconfig/login')
    }
    next()
}

router.use('/login', require('./routes/login'));

router.use('/', redirectLogin, require('./routes/index'));

app.use("/ytconfig", router)

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    next(createError(404));
});

// error handler
app.use(function(err, req, res) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;
