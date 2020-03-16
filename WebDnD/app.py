from flask import Flask           # import flask
from WebDnD.models import Schema
app = Flask('WebDnd')             # create an app instance

@app.route('/')                   # at the end point /
def hello():                      # call method hello
    return 'Hello World!'         # which returns 'hello world'

@app.route("/<name>")              # at the end point /<name>
def hello_name(name):              # call method hello_name
        return "Hello "+ name          # which returns "hello + name    

if __name__ == '__main__':        # on running python app.py
    Schema()
    app.run(debug=True)                     # run the flask app
