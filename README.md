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
CREATE TABLE users (id SERIAL PRIMARY KEY, username varchar(30) UNIQUE not null, password varchar(600) not null, timestamp date not null default CURRENT_DATE);
```

**Create the files table:**

```
CREATE TABLE files (id SERIAL PRIMARY KEY, ipaddress inet not null, iv varchar(32) not null, fileaddress varchar(90));
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

**Run the app in production:**

First, ensure that nginx is running.

```
sudo service nginx status
```

Activate the virtual environment:

```
source /var/www/crocofile/crocoenv/bin/activate
```

Add these lines to your environment:

```
export APP_SETTINGS="config.ProductionConfig"
```

```
export CONN_STRING="host='localhost' dbname='crocofile' user='crocofile' password='putpasswordhere'"
```

Run the app:

```
uwsgi --ini /var/www/crocofile/crocofile/crocofile_uwsgi.ini
```
