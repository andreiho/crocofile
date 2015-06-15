import os, psycopg2, time, sys, scrypt, random, binascii, base64, json, datetime
from flask import Flask, request, session, redirect, url_for, render_template, flash, abort
from flask.ext.bower import Bower
from werkzeug import secure_filename

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

# users get loaded before the app gets started (on user table changes)
users_dict = {}
# files get loaded before the app gets started (on file table changes)
files_dict = {}
# files usernames get loaded before the app gets started (on file table changes)
files_usernames_dict = {}

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

# CSRF safeguard

@app.before_request
def csrf_protect():
    if request.method == "POST":
        token = session['_csrf_token']

        if 'X-Csrf-Token' in request.headers:
            if request.headers['X-Last-Request'] == "true":
                token = session.pop('_csrf_token', None)
            if not token or token != request.headers['X-Csrf-Token']:
                abort(403)
        else:
            token = session.pop('_csrf_token', None)
            if not token or token != request.form.get('_csrf_token'):
                abort(403)

def generate_csrf_token():
    if '_csrf_token' not in session:
        token = scrypt.hash(str(int(time.time())), 'change me; im salty')
        session['_csrf_token'] = binascii.hexlify(token).decode('utf-8')
    return session['_csrf_token']

# Register a global function in the Jinja environment of csrf_token() for use in forms
app.jinja_env.globals['csrf_token'] = generate_csrf_token
app.jinja_env.globals['datetime'] = datetime

# ROUTES

@app.route('/', methods=['GET', 'POST'])
def index():
    return render_template("index.html")

@app.route('/upload', methods=['GET', 'POST'])
def upload():
    if request.method == 'POST':

        binary_file = request.data

        if binary_file:

            chunknumber = secure_filename(request.headers['X-Chunk-Number'])
            total_chunks = request.headers['X-Total-Chunks']
            upload_token = request.headers['X-Upload-Token']

            if upload_token not in session:
                return "failed"

            filename = session[upload_token]

            if not os.path.exists(os.path.join(app.config['UPLOAD_FOLDER'], filename)):
                os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            with open(os.path.join(app.config['UPLOAD_FOLDER'], filename, chunknumber), 'wb') as f:
                f.write(binary_file)

            if int(chunknumber) == int(total_chunks) - 1:
                session.pop(upload_token, None)
                return filename

            return upload_token

        else:

            filename = secure_filename(request.headers['X-File-Name'])
            filename = str(int(time.time())) + "_" + filename
            username = request.headers['X-User-Name']
            ipaddress = request.remote_addr
            iv = request.headers['X-IV']
            upload_token = request.headers['X-Upload-Token']

            try:
                cursor.execute('INSERT INTO files (ipaddress, iv, fileaddress, username) VALUES (%s, %s, %s, %s) RETURNING id', (ipaddress, iv, filename, username))
                file_id = cursor.fetchone()
                file_id = file_id[0]
                conn.commit()
                filename = str(file_id) + "_" + filename

            except:
                conn.rollback()
                return "failed"
                
            session[upload_token] = filename
            load_all_files()
            return upload_token

    return "failed"

@app.route('/download', methods=['GET', 'POST'])
def download():
    return render_template("download.html")

@app.route('/downloadHandler', methods=['GET', 'POST'])
def downloadHandler():

    if request.method == 'POST':

        if  request.headers['X-File-Request'] == "true":
            iv = None
            filename = None
            fileid = request.headers['X-File-Name']

            cursor.execute('SELECT * FROM files WHERE id = (%s);', (fileid,))
            result = cursor.fetchone()

            iv = result[2]
            filename = fileid + "_" + result[3]
            chunks = os.listdir(os.path.join(app.config['UPLOAD_FOLDER'], filename))

            return json.dumps({'chunks': str(len(chunks)), 'iv' : iv, 'filename' : filename})

        else:
            chunknumber = int(request.headers['X-Requested-Chunk'])
            filename = request.headers['X-File-Name']
            chunk = None
            with open(os.path.join(app.config['UPLOAD_FOLDER'], filename, str(chunknumber))) as f:
                chunk = f.read()

            return json.dumps({'number': chunknumber, 'chunk': chunk}) 


    return "failed"

@app.route('/logout')
def logout():
    session.pop('logged_in', None)
    flash('You were logged out.')
    return redirect('/')

@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    fieldError = None

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
            error = "Too many failed attempts."
            return render_template("login.html", error=error)

        if not user:
            add_to_wrong_username(ip)
            error = "Wrong username or password."
            fieldError = "error"
            return render_template("login.html", error=error, fieldError=fieldError)

        if user.is_blocked(ip):
            error = "Too many failed attempts."
            return render_template("login.html", error=error)

        if not user.login(password, ip):
            user.failed_login_attempt(ip)
            error = "Wrong username or password."
            return render_template('login.html', error=error)

        session['logged_in'] = True
        flash('You were logged in.')
        return redirect(url_for('index'))

    return render_template('login.html', error=error)

@app.route('/registration', methods=['GET', 'POST'])
def registration():
    error = None

    userError = None
    userErrorMsg = None

    userLenError = None
    userLenErrorMsg = None

    passError = None
    passErrorMsg = None

    lenError = None
    lenErrorMsg = None

    someError = None

    if request.method == 'POST':
        username = request.form['username'].strip()
        password = request.form['password'].strip()
        password_repeat = request.form['password-repeat'].strip()

        user = fetch_user_by_username(username)
        if user:
            userError = "error"
            userErrorMsg = "This username already exists."
            return render_template('registration.html', userError=userError, userErrorMsg=userErrorMsg)

        if len(username) > 30:
            userLenError = "error"
            userLenErrorMsg = "This username is too long."
            return render_template('registration.html', userLenError=userLenError, userLenErrorMsg=userLenErrorMsg)

        if password != password_repeat:
            passError = "error"
            passErrorMsg = "Passwords do not match."
            return render_template('registration.html', passError=passError, passErrorMsg=passErrorMsg)

        if len(password) < 10:
            lenError = "error"
            lenErrorMsg = "Passwords must be at least 10 characters long."
            return render_template('registration.html', lenError=lenError, lenErrorMsg=lenErrorMsg)

        password = binascii.hexlify(hash_password(password)).decode('utf-8')
        try:
            cursor.execute('INSERT INTO users (username, password) VALUES (%s, %s)', (username, password))
        except:
            conn.rollback()	
            return render_template('registration.html', someError="Something went wrong. Try again or tell us, if you are sweet?")
        conn.commit()
        load_all_users()
        flash('You have been registered.')
        return redirect(url_for('login'))

    return render_template('registration.html', error=error)

@app.route('/vault')
def vault():
    return render_template("vault.html", files_dict=files_dict, files_usernames_dict=files_usernames_dict)

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
    cursor.execute('SELECT id, username, password FROM users')

    for row in cursor.fetchall():
        users_dict[row[1]] = UserContext(row[0], row[1], row[2])


def load_all_files():
    global files_dict
    cursor.execute('SELECT id, fileaddress, username FROM files')

    for row in cursor.fetchall():
        files_dict[row[0]] = row[1]
        files_usernames_dict[row[0]] = row[2]

if __name__ == '__main__':
    with app.app_context():
        load_all_files()
        load_all_users()
    app.run()

Bower(app)
