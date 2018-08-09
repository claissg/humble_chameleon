read -p "Are you sure you want to lose all logs and delete the DB? (y/n):" -n 1 -r
echo    # (optional) move to a new line
if [[ $REPLY =~ ^[Yy]$ ]]
then
  > ./access.log
  > ./creds.log
  > ./error.log
  rm ../db/humble.db
  echo All cleared. Restart your Humble Server to rebuild the DB tables!
fi
