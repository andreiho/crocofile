from flask import Flask, request, session, g, redirect, url_for, render_template
from flask.ext.bower import Bower

SECRET_KEY = "lol"

app = Flask(__name__)

@app.route('/')
def index():
    return render_template("index.html")

if __name__ == '__main__':
    app.run()

Bower(app)
