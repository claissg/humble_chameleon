#!/usr/bin/env bash
if [[ $EUID -ne 0 ]]; then
   echo "This script MUST be run as root. Please double-check the README." 
   exit 1
fi
wget -q -O - https://archive.kali.org/archive-key.asc  | apt-key add
apt-get update
apt-get upgrade
