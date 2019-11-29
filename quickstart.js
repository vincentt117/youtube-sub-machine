// TODO: Add documentation



var fs = require('fs');
var readline = require('readline');
var {google} = require('googleapis');
var OAuth2 = google.auth.OAuth2;
var SERVICE = google.youtube('v3');

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/youtube-nodejs-quickstart.json
var SCOPES = ['https://www.googleapis.com/auth/youtube.readonly'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
    process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'youtube-bot.json';

var MAX_NUM_CREATORS = 10;
var MAX_NUM_VID_PER_CREATOR = 2;

var SUB_RES = {};

// Load client secrets from a local file.
fs.readFile('./.credentials/client_secret.json', function processClientSecrets(err, content) {
  if (err) {
    console.log('Error loading client secret file: ' + err);
    return;
  }
  // Authorize a client with the loaded credentials, then call the YouTube API.
  authorize(JSON.parse(content), getSubscribedTo);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  var clientSecret = credentials.installed.client_secret;
  var clientId = credentials.installed.client_id;
  var redirectUrl = credentials.installed.redirect_uris[0];
  var oauth2Client = new OAuth2(clientId, clientSecret, redirectUrl);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, function(err, token) {
    if (err) {
      getNewToken(oauth2Client, callback);
    } else {
      oauth2Client.credentials = JSON.parse(token);
      callback(oauth2Client);
    }
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
  console.log('Authorize this app by visiting this url: ', authUrl);
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question('Enter the code from that page here: ', function(code) {
    rl.close();
    oauth2Client.getToken(code, function(err, token) {
      if (err) {
        console.log('Error while trying to retrieve access token', err);
        return;
      }
      oauth2Client.credentials = token;
      storeToken(token);
      callback(oauth2Client);
    });
  });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
  try {
    fs.mkdirSync(TOKEN_DIR);
  } catch (err) {
    if (err.code != 'EEXIST') {
      throw err;
    }
  }
  fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
    if (err) throw err;
    console.log('Token stored to ' + TOKEN_PATH);
  });
}

/**
 * Lists the names and IDs of up to 10 files.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function getChannel() {
  SERVICE.channels.list({
    auth: auth,
    part: 'snippet,contentDetails,statistics',
    forUsername: 'GoogleDevelopers'
  }, function(err, response) {
    if (err) {
      console.log('The API returned an error: ' + err);
      return;
    }
    var channels = response.data.items;
    if (channels.length == 0) {
      console.log('No channel found.');
    } else {
      console.log('This channel\'s ID is %s. Its title is \'%s\', and ' +
                  'it has %s views.',
                  channels[0].id,
                  channels[0].snippet.title,
                  channels[0].statistics.viewCount);
    }
  });
}

// TODO make next three function return a promise

function getSubscribedTo(auth) {
    SERVICE.subscriptions.list({
      auth: auth,
      part: 'snippet',
      maxResults: MAX_NUM_CREATORS,
      mine: true,
      order: "relevance"
    }, function(err, response) {
      if (err) {
        console.log('The API returned an error: ' + err);
        return;
      }
      var channels = response.data.items;
      if (channels.length == 0) {
        console.log('No channel found.');
      } else {
        var promise_collection = channels.map(channel => {
          Promise.resolve(getUploadIdOfChannel(auth, channel.snippet))
        });
        Promise.all(promise_collection).then();
      }
    });
}

function getUploadIdOfChannel(auth, channelSnippet) {
  SERVICE.channels.list({
    auth: auth,
    id: channelSnippet.resourceId.channelId,
    part: 'contentDetails'
  }, function(err, response) {
    if (err) {
      console.log('The API returned an error: ' + err);
      return;
    }
    var channelPlaylistInfo = response.data.items;
    if (channelPlaylistInfo.length >= 0) {
      return Promise.resolve(getUploadList(auth, channelPlaylistInfo[0].contentDetails.relatedPlaylists.uploads, channelSnippet));
    }
  });
}

function getUploadList(auth, uploadPlaylistId, channelSnippet) {
  SERVICE.playlistItems.list({
    auth: auth,
    playlistId: uploadPlaylistId,
    part: 'snippet',
    maxResults: MAX_NUM_VID_PER_CREATOR
  }, function(err, response) {
    if (err) {
      console.log('The API returned an error: ' + err);
      return;
    }
    var uploads = response.data.items;
    if (uploads.length > 0) {
      SUB_RES[channelSnippet.title] = [];
      var promise_collection = uploads.map(upload => getVideoDetails(auth, upload.snippet));
      Promise.all(promise_collection).then((videoInfo) => {
        SUB_RES[channelSnippet.title].push(videoInfo);
        console.log(SUB_RES[channelSnippet.title]);
    })
  }
  }
      )}

function getVideoDetails(auth, uploadsSnippet) {
  return new Promise(function(resolve, reject) {
        SERVICE.videos.list({
          auth: auth,
          id: uploadsSnippet.resourceId.videoId,
          part: 'snippet'
        }, function(err, response) {
          var videoInfo = {};
          if (err) {
            console.log('The API returned an error: ' + err);
            return;
          }
          var video = response.data.items;

          if (video.length > 0) {
            videoInfo['title'] = uploadsSnippet.title;
            videoInfo['link'] = 'https://www.youtube.com/watch?v=' + uploadsSnippet.resourceId.videoId;
            videoInfo['upload_at'] = video[0].snippet.publishedAt;
          }
          resolve(videoInfo);
        });
    }) 
}