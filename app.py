import os, psycopg2, time, sys, scrypt, random, binascii, base64, json, datetime, shutil
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
# usernames get loaded before the app gets started (on user table changes)
users_offline_dict = {}
# online users get loaded before the app gets started (on user table changes)
users_online_dict = {}

# files get loaded before the app gets started (on file table changes)
files_dict = {}
# files usernames (tags) get loaded before the app gets started (on file table change)
files_usernames_dict = {}

# mapping an IP (string) -> username attempts (integer)
wrong_username_dict = {}
# mapping an IP (string) -> timestamp of timeout over
wrong_username_timeout = {}


# USER CONTEXT CLASS

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

# Login attempts with wrong username

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

# Username utility

def fetch_user_by_username(username):
    return users_dict.get(username, None)

# JINJA (send values to the templates)

# CSRF safeguard

@app.before_request
def csrf_protect():
    if request.method == "POST":
        token = session['_csrf_token']

        if 'X-Csrf-Token' in request.headers:
            if request.headers['X-Last-Request'] == "true":
                token = session.pop('_csrf_token', None)
            if not token or token != request.headers['X-Csrf-Token']:
                return render_template('failure.html')
        else:
            token = session.pop('_csrf_token', None)
            if not token or token != request.form.get('_csrf_token'):
                return render_template('failure.html')

def generate_csrf_token():
    if '_csrf_token' not in session:
        token = scrypt.hash(str(int(time.time())), 'change me; im salty')
        session['_csrf_token'] = binascii.hexlify(token).decode('utf-8')
    return session['_csrf_token']


# Register a global function in the Jinja environment of csrf_token() for use in forms
app.jinja_env.globals['csrf_token'] = generate_csrf_token
# Date time module for string manipulation in template
app.jinja_env.globals['datetime'] = datetime

def get_logged_in_user():
    if 'user_id' in session:
        return session['user_id']
    else:
        return -1

# Return the logged in user to template
app.jinja_env.globals['logged_in'] = get_logged_in_user

# Inject users dict into Jinja environment
@app.context_processor
def inject_users():
    return dict(users_offline_dict=users_offline_dict, users_online_dict=users_online_dict)

# ROUTES

@app.route('/', methods=['GET', 'POST'])
def index():
    return render_template("index.html")

@app.route('/upload', methods=['GET', 'POST'])
def upload():
    if request.method == 'POST':

        chunk = request.data

        if chunk:

            chunknumber = secure_filename(request.headers['X-Chunk-Number'])
            total_chunks = request.headers['X-Total-Chunks']
            upload_token = request.headers['X-Upload-Token']

            if upload_token not in session:
                return "failed"

            filename = session[upload_token]

            if not os.path.exists(os.path.join(app.config['UPLOAD_FOLDER'], filename)):
                os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            with open(os.path.join(app.config['UPLOAD_FOLDER'], filename, chunknumber), 'wb') as f:
                f.write(chunk)

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
            x_del_password = request.headers['X-Del-Password']

            if len(x_del_password) > 1:
                del_password = binascii.hexlify(hash_password(x_del_password)).decode('utf-8')
            else:
                del_password = None

            try:
                cursor.execute('INSERT INTO files (ipaddress, iv, fileaddress, username, del_password) VALUES (%s, %s, %s, %s, %s) RETURNING id', (ipaddress, iv, filename, username, del_password,))
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

# Handle download XHR

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


@app.route('/getPublicKey', methods=['GET', 'POST'])
def getPublicKey():

    if request.method == 'POST':
        user_id = request.headers['X-User-Id']
        try:
            cursor.execute('SELECT public_key FROM users WHERE id = (%s);', (user_id,))
            result = cursor.fetchone()

            if result[0] == None:
                return "offline"
            else:
                return result
        except:
            return "failed"

    return "failed"


@app.route('/logout')
def logout():
    username = session['username']
    userid = session['user_id']

    # Remove public key from database
    try:
        cursor.execute('UPDATE users SET public_key = NULL WHERE id = (%s);', (userid,))
        conn.commit()
    except:
        conn.rollback()

    # Add user to online dictionary
    users_online_dict.pop(userid, None)
    # Remove user from offline dictionary
    users_offline_dict[userid] = username

    session.pop('user_id', None)
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
        public_key = request.form['public-key'].strip()
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
        session['user_id'] = user._id
        session['username'] = username

        # Add user to online dictionary
        users_online_dict[user._id] = username
        # Remove user from offline dictionary
        users_offline_dict.pop(user._id, None)

        try:
            cursor.execute('UPDATE users SET public_key = (%s) WHERE id = (%s);', (public_key, user._id,))
            conn.commit()
        except:
            conn.rollback()

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


@app.route('/delete/<int:fileid>', methods=['GET', 'POST'])
def delete(fileid):
    if request.method == 'GET':
        try:
            cursor.execute('SELECT fileaddress, del_password FROM files WHERE id = (%s);', (fileid,))
            result = cursor.fetchone()
            if not result:
                return render_template("delete.html", errorNotFound="The specified file does not exist!")
            filename = result[0].split("_")[1]
            if result[1] == None:
                return render_template("delete.html", filename=filename, error="You did not set a deletion password for ")
            return render_template("delete.html", filename=filename)
        except:
            conn.rollback()
            return render_template("delete.html", error="There was an unexpected database error. If this keeps happening, please contact us.")

    if request.method == 'POST':
        password = request.form['del-password'].strip()

        try:
            cursor.execute('SELECT fileaddress, del_password FROM files WHERE id = (%s);', (fileid,))
            result = cursor.fetchone()
            hashed_password = result[1]
            fileaddress = result[0]
            dir_name = str(fileid) + "_" + fileaddress

            if verify_password(hashed_password, password):
                print("password correct")
                cursor.execute('DELETE FROM files WHERE id = (%s);', (fileid,))
                conn.commit()
                shutil.rmtree(os.path.join(app.config['UPLOAD_FOLDER'], dir_name))
                flash('The file has been deleted')
                return redirect(url_for('index'))
            else:
                flash('The password was not correct')
                return render_template("delete.html")

        except:
            return render_template("delete.html", error="There was an unexpected error with deleting your file. Please contact us.")            
       
@app.route('/failure')
def failure():
    return render_template("failure.html")

# ROUTES END

# UTILITIES
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
        users_offline_dict[row[0]] = row[1]

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
