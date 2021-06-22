import logging
logging.basicConfig(level=logging.INFO,format='[%(asctime)s][%(levelname)s] - %(funcName)s: %(message)s')
logging.getLogger('socketio').setLevel(logging.INFO)
logging.getLogger('socketio.server').setLevel(logging.ERROR)
logging.getLogger('engineio').setLevel(logging.INFO)
logging.getLogger('geventwebsocket.handler').setLevel(logging.INFO)
