#!/usr/bin/env bash
if [[ $EUID -eq 0 ]]; then
   echo "This script must NOT be run as root, but the user must be a sudoer. Please double-check the README." 
   exit 1
fi
if ! sudo echo &>/dev/null; then echo "Unable to use sudo. Exiting."; exit 2; fi

echo "Installing Node with NPM"
curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
sudo apt-get install -y \
nodejs \
build-essential \
nginx

#echo Allowing node to bind low ports for standalone mode
#sudo setcap CAP_NET_BIND_SERVICE=+eip /home/linuxbrew/.linuxbrew/Cellar/node/*/bin/node
echo "Installing Certbot"
sudo apt-get install certbot 
cd ..
echo "Installing Humble Chameleon Dependencies and adding sample configs"
npm install
cp ./setup/sample_config.json ./config.json
cp ./setup/sample_admin_config.json ./admin_config.json

echo "Finished Installing Humble Chameleon!
To get started, run add_domain.sh as a sudoer to configure nginx for your domain. Then:
cd ..
node index.js"
