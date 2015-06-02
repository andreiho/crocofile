from flask import Flask, request, session, g, redirect, url_for, render_template
from flask.ext.bower import Bower

app = Flask(__name__)

@app.route('/')
def index():
    return render_template("index.html")

@app.route('/login')
def login():
    return render_template("login.html")

@app.route('/vault')
def vault():
    return render_template("vault.html")

if __name__ == '__main__':
    app.run()

Bower(app)
