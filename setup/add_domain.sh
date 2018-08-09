#!/usr/bin/env bash

#need root to make changes to nginx configs
echo STOP NOW IF NOT RUNNING AS ROOT
echo Enter your humble chameleon domain \(i.e. phishy.net\):
read fulldomain
domain=$( echo $fulldomain | cut -d. -f1)
toplevel=$( echo $fulldomain | cut -d. -f2)
cat ./example_nginx.conf | sed "s/HCDOMAIN/$domain/g"| sed "s/HCTOPLEVEL/$toplevel/g" > /etc/nginx/sites-available/$domain.conf
ln -s /etc/nginx/sites-available/$domain.conf /etc/nginx/sites-enabled/$domain.conf
echo Creating vhosts directory for nginx logs
mkdir -p /var/log/nginx/vhosts
echo Wrote nginx config to /etc/nginx/sites-available/$domain.conf
echo !!!Ensure that ssl_certificate, and ssl_certificate_key are correct! Then run:
echo sudo service nginx restart
