import os, psycopg2, time, sys, scrypt, random, binascii
from flask import Flask, request, session, redirect, url_for, render_template, flash
from flask.ext.bower import Bower

app = Flask(__name__)

# load config
app.config.from_object(os.environ['APP_SETTINGS'])

# connect to psql db 
conn_string = app.config['CONN_STRING']

# print the connection string
print ("Connecting to database\n ->%s" % (conn_string))

# get a connection, if a connect cannot be made an exception will be raised here
conn = psycopg2.connect(conn_string)

# conn.cursor will return a cursor object, you can use this cursor to perform queries
cursor = conn.cursor()
print ("Connected!\n")

# users get loaded before the app gets started (not implemented: on user table changes)
users_dict = {}
# mapping an IP (string) -> username attempts (integer)
wrong_username_dict = {}
# mapping an IP (string) -> timestamp of timeout over
wrong_username_timeout = {}


# CLASSES

class UserContext():
    def __init__(self, id, username, password):
        assert type(id) == int
        assert type(username) == str
        assert type(password) == str

        self._id = id
        self._username = username
        self._password = password

        # blocked is a mapping an IP (string) -> counter (integer)
        self._blocked = {}

        # blocked Timeout is a mapping an IP (string) -> timestamp of timeout over
        self._blocked_timeout = {}
    def is_blocked(self, ip):
        assert type(ip) == str

        counter = self._blocked.get(ip, 0)
        timeout = self._blocked_timeout.get(ip, 0)

        return counter == 3 and timeout > time.time()

    def failed_login_attempt(self, ip):
        assert type(ip) == str

        counter = self._blocked.get(ip, 0)
        counter += 1
        self._blocked[ip] = counter
        
        if counter == 3:
            self._blocked_timeout[ip] = time.time() + 60

    def login(self, password, ip):
        assert type(password) == str
        assert type(ip) == str

        result = verify_password(self._password, password)

        if result:
            self._blocked[ip] = 0
            self._blocked_timeout[ip] = 0

        return result

# ROUTES

@app.route('/')
def index():
    return render_template("index.html")

@app.route('/logout')
def logout():
    session.pop('logged_in', None)
    flash('You were logged out')
    return redirect('/')

@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None

    if 'logged_in' in session:
        flash('You are already logged in.')
        return redirect(url_for('index'))

    if request.method == 'POST':
            
        username = request.form['username'].strip()
        password = request.form['password'].strip()
        ip = request.remote_addr
        username_attempts = 0

        user = fetch_user_by_username(username)

        if is_blocked_for_username(ip):
            error = "Too many failed attempts"
            return render_template("login.html", error=error)

        if not user:
            add_to_wrong_username(ip)
            error = "Wrong username or password"
            return render_template("login.html", error=error)
        
        if user.is_blocked(ip):
            error = "Too many failed attempts"
            return render_template("login.html", error=error)
            
        if not user.login(password, ip):
            user.failed_login_attempt(ip)
            error = "Wrong username or password"
            return render_template('login.html', error=error)

        session['logged_in'] = True
        flash('You were logged in')
        return redirect(url_for('index'))

    return render_template('login.html', error=error)

@app.route('/registration', methods=['GET', 'POST'])
def registration():
    error = None

    if request.method == 'POST':
        username = request.form['username'].strip()
        password = request.form['password'].strip()
        password_repeat = request.form['password-repeat'].strip()

        user = fetch_user_by_username(username)
        if user:
            error = "This username exists already."
            return render_template('registration.html', error=error)
        
        if password != password_repeat:
            error = "Passwords do not match."
            return render_template('registration.html', error=error)

        if len(password) < 10:
            error = "Passwords must be at least 10 characters long"
            return render_template('registration.html', error=error)

        password = binascii.hexlify(hash_password(password)).decode('utf-8')
        cursor.execute('INSERT INTO users (username, password) VALUES (%s, %s)', (username, password))
        conn.commit()
        load_all_users()    
        flash('You have been registered.')
        return redirect(url_for('login'))

    return render_template('registration.html', error=error)

@app.route('/vault')
def vault():
    return render_template("vault.html")

# ROUTES END

def add_to_wrong_username(ip):
    global wrong_username_dict
    global wrong_username_timeout
    counter = wrong_username_dict.get(ip, 0)
    counter += 1
    wrong_username_dict[ip] = counter

    if counter == 3:
        wrong_username_timeout[ip] = time.time() + 60

def is_blocked_for_username(ip):
    global wrong_username_dict
    global wrong_username_timeout

    counter = wrong_username_dict.get(ip, 0)
    timeout = wrong_username_timeout.get(ip, 0)

    if counter == 3 and timeout > time.time():
        return True
    elif counter ==3 and timeout < time.time():
        wrong_username_dict[ip] = 0
        wrong_username_timeout[ip] = 0
        return False
    else:
        return False

def fetch_user_by_username(username):
    return users_dict.get(username, None)

def randstr(length):
    return ''.join(chr(random.randint(0,255)) for i in range(length))

def hash_password(password, maxtime=0.5, datalength=64):
    return scrypt.encrypt(randstr(datalength), password, maxtime=maxtime)

def verify_password(hashed_password, guessed_password, maxtime=0.5):
    
    x = binascii.unhexlify(hashed_password)

    try:
        scrypt.decrypt(x, guessed_password, maxtime)
        return True
    except scrypt.error:
        return False

def load_all_users():
    global users_dict
    cursor.execute('select id, username, password from users')

    for row in cursor.fetchall():
        users_dict[row[1]] = UserContext(row[0], row[1], row[2])

if __name__ == '__main__':
    with app.app_context():
        load_all_users()
    app.run()

Bower(app)