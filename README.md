Humble Chameleon
============
Humble Chameleon is a tool originally designed to MitM services that have multi-factor auth and allows us to steal sessions through SE.
In addition, the tool now allows us to categorize domains, hide our phishing pages, deliver payloads, and collect POST requests.

Check out [the wiki](https://github.com/claissg/humble\_chameleon/wiki) for more detailed installation and usage instructions. See below for basic install:

by Forrest Kasler ([fkasler](https://twitter.com/fkasler))(ph3eds)

[![Foo](https://rawcdn.githack.com/toolswatch/badges/8bd9be6dac2a1d445367001f2371176cc50a5707/arsenal/usa/2018.svg)](https://www.blackhat.com/us-18/arsenal/schedule/index.html#humble-chameleon-eating-fa-for-breakfast-12092)


Installation 
============
This project is written in Node.js for its flexibility and non-blocking I/O.
You will need to install Node and NPM (Node Package Manager) to run the project.

Install scripts and dependencies:
```
git clone https://github.com/claissg/humble_chameleon
cd humble_chameleon
sudo apt-get install nodejs npm nginx
npm install
```

Set up your phishing domain:
```
node add_domain.js
```

Follow any additional prompts from the script.

Usage
=====

- Set up an A record for your phishing domain to point it at your humble chameleon server

- Use LetsEncrypt to get a cert. I recommend using the new wild card cert functionality to keep things flexible. Otherwise, your cert should include all subdomains you might want to attack. Note the location of your key pair for the following steps.

- Navigate the setup directory in this project as root and run the add\_domain.sh script. You need to be running as root (not just sudo) in order to create new nginx config files. The script will set up a nginx config file for you in the sites-available directory and create a symlink in the sites-enabled directory.
```
sudo su
cd setup
./add_domain.sh
exit #stop running as root when finished
```

- Now you may need to modify the location of the key pairs in your newly created nginx config. The add\_domain script will let you know its location. Then simply restart nginx:
```
sudo service nginx restart
```
- Modify your admin\_config.json file in this project's root directory. It should have been created automatically during the setup process. At a minimum, you will want to check that the "set\_admin" "switch" is set to true so that you can set up a device to access the admin interfaces:
```
{
    "admin_cookie": {
        "cookie_name": "admin_cookie",
        "cookie_value": "super_secret_pass"
    },
    "set_admin": {
        "switch": true,
        "search_string": "longurlsearchstring"
    }
}
```
- Manually edit your config.json and replace "phishing\_domain.com" with your phishing domain. You should also set at least your primary target at this point. Once you have it running, you will be able to make more changes from the admin console.

- Open a screen or tmux and start your HC server.
```
node index.js 
```

- Navigate to your phishing domain. Add the admin\_config's 'search\_string' to any portion of the URL and refresh the page to set the admin cookie on your device. For example, https://www.phishy.net/longurlsearchstring would work for the example admin config above. This is a one-time use by default. If you need to set the admin cookie on multiple devices or reset it then you will need to manually change the "set\_admin" "switch" to true and restart the humble chameleon server.

- With the admin cookie set, you can add 'access' to any place in the url to see the access logs and 'credz' to see credential logs (POST data and cookies). You can view and modify the config by adding 'config' to any portion of the url.

- Steal sessions. Happy Hacking!
