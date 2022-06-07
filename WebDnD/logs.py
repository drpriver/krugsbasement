#
# Copyright © 2021-2022, David Priver
#

import logging
import os
logging.basicConfig(level=logging.INFO,format=f'{os.getpid()}'+'[%(asctime)s][%(levelname)s] - %(funcName)s: %(message)s')
logging.getLogger('socketio').setLevel(logging.INFO)
logging.getLogger('socketio.server').setLevel(logging.ERROR)
logging.getLogger('engineio').setLevel(logging.INFO)
logging.getLogger('geventwebsocket.handler').setLevel(logging.INFO)
