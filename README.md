crocofile
==========================

This is a secure file-sharing service developed as a school project.

Contributors
------------------------

* [RadicalPet](https://github.com/RadicalPet)
* [andreiho](https://github.com/andreiho)
* [jsc](https://github.com/skovsgaard/)

Getting the project set up
------------------------

**Setup the local development environment:**

```
createdb crocofile
psql crocofile
```

**Create the users table:**

```
CREATE TABLE users (id SERIAL PRIMARY KEY, username varchar(30) UNIQUE not null, password varchar(600) not null, timestamp date not null default CURRENT_DATE, public_key varchar(460) not null, secret varchar(16));
```

**Create the files table:**

```
CREATE TABLE files (id SERIAL PRIMARY KEY, ipaddress inet not null, iv varchar(32) not null, fileaddress varchar(90), username varchar(30), del_password varchar(3000));
```

**Add these lines to your environment:**

```
export APP_SETTINGS="config.DevelopmentConfig"
```

```
export CONN_STRING="host='localhost' dbname='crocofile' user='yourdbuser' password='yourdbpass'"
```

Now reload your environment by running the ```workon env``` or ```source yourenv/bin/activate```.

**Install bower dependencies:**

```
bower install
```

**Install pip modules:**

```
pip install -r requirements.txt
```

Common development tasks
------------------------

**Install javascript libraries via bower:**

```
bower install -S libraryname
```

**After installing modules via pip run:**
```
pip freeze > requirements.txt
```

**Run the app:**

```
python app.py
```

Running in production
------------------------

**First, ensure that nginx is running.**

```
sudo service nginx status
```

**Activate the virtual environment:**

```
source /var/www/crocofile/venv/bin/activate
```

**Add these lines to the environment:**

```
export APP_SETTINGS="config.ProductionConfig"
```

```
export CONN_STRING="host='localhost' dbname='crocofile' user='crocofile' password='password'"
```

**Kill existing uwsgi processes if available:**

```
sudo killall -s INT uwsgi
```

**Run the app from /var/www/crocofile/:**

```
uwsgi --emperor app.ini --daemonize /var/log/uwsgi/emperor.log
```


API Key
------------------------

**PeerJS API Key**

```
tnyh1aenu1y8pvi
```
