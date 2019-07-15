module.exports = {
  getTarget: function(humble_domain, victim_request, ship_logs) {
    try {
      var domain = config[humble_domain]
      var primary = domain.primary_target
      var secondary = domain.secondary_target
      var full_path = victim_request.headers.host + url.parse(victim_request.url).path
      var file_name = url.parse(victim_request.url).pathname.split('/').pop()
      var cookie = victim_request.headers.cookie
      if (full_path.includes(domain.snitch.snitch_string)){
        console.log(success + "Snitch triggered. Redirecting to: " + domain.snitch.redirect_url)
        access_log.write("[+] Snitch triggered. Redirecting to: " + domain.snitch.redirect_url + "\n")
          return {
          target_type: "snitch",
          target: domain.snitch.redirect_url
        }
      } 

      if (full_path.includes(domain.wwwroot)){
        console.log(success + "Sent a Payload: " + full_path)
        access_log.write("[+] Sent a Payload: " + full_path + "\n")
        if(full_path.includes(domain.search_string)){
          let tracking_search = new RegExp(domain.search_string + '=([^\&]*)')
          tracking_id = tracking_search.exec(full_path)[1]
          ship_logs({"target": tracking_id, "event_type": "DIRECT_DOWNLOAD", "event_data": file_name})
        }
        return {
          target_type: "payload",
          target: file_name
        }
      }  

      if (admin_config.set_admin.switch){
        if (full_path.includes(admin_config.set_admin.search_string)){
          console.log(success + "Setting admin cookie")
          access_log.write("[+] Setting admin cookie\n")
            return {
            target_type: "set_cookie",
            target: admin_config.admin_cookie.cookie_name + " = " + admin_config.admin_cookie.cookie_value + ";secure;httponly"
          }
        } 
      }

      try {
        if (cookie.includes(domain.tracking_cookie)) {
          //track repeat clicks anyway
          if(full_path.includes(domain.search_string)){
            let tracking_search = new RegExp(domain.search_string + '=([^\&]*)')
            tracking_id = tracking_search.exec(full_path)[1]
            ship_logs({"target": tracking_id, "event_type": "CLICK", "event_data": full_path})
          }
          return {
            target_type: "proxy",
            target: secondary 
          }
        }
      } catch (err) {
        console.log(fail + "couldn't read cookie for tracking_cookie: " + err)
      }

      try {
        if (full_path.includes(domain.search_string)) {
          //set our search cookie if we have this option set in our config
          //this come into play in humbleProxy and is used as a global semaphore
          set_cookie = true
          let tracking_search = new RegExp(domain.search_string + '=([^\&]*)')
          tracking_id = tracking_search.exec(full_path)[1]
          ship_logs({"target": tracking_id, "event_type": "CLICK", "event_data": full_path})
          return {
            target_type: "proxy",
            target: secondary 
          }
        }
      } catch (err) {
        console.log(fail + "problem with url_search: " + err)
      }

      return {
        target_type: "proxy",
        target: primary
      }

    } catch(err){
      console.log(fail + "couldn't select target: " + err)
      access_log.write("[-] couldn't select target: " + err + "\n")
      return {
        target_type: "snitch",
        target: "https://www.example.com"
      }
    }
  }
}
