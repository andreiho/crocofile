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

Setup the local development environment:

```
export APP_SETTINGS="config.DevelopmentConfig"
```

Now reload your environment by running the ```workon env``` command again.

Install bower dependencies:

```
bower install
```

Install pip modules:

```
pip install -r requirements.txt
```

Setup and initialize the database:

```
createdb crocofile
psql crocofile
```

Create the users table:

```
CREATE TABLE users (id SERIAL PRIMARY KEY, username varchar(30) UNIQUE not null, password varchar(600) not null, timestamp date not null default CURRENT_DATE);
```

Common development tasks
------------------------

Install javascript libraries via bower:

```
bower install -S libraryname
```

After installing modules via pip run:
```
pip freeze > requirements.txt
```

Run the app:

```
python app.py
```
