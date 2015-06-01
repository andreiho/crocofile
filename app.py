from flask import Flask
from flask.ext.bower import Bower

app = Flask(__name__)


@app.route('/')
def hello():
    return "Hello World!"

if __name__ == '__main__':
    app.run()

Bower(app)
