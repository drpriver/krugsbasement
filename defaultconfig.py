# this config is for development.
# Use different settings on the server
# This should be False on the server
DEV = True

# Where the database is
DBNAME = 'campaigns.db'

# Where static files are
STATICDIR = 'Generated'

# DON'T USE THIS ON THE HOST. SET IT TO AN ACTUAL RANDOM KEY
# VIA os.urandom.
SECRET_KEY = 'dev'

# set to blank to disable invite codes
INVITE_CODE = 'dev'
