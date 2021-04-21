import sqlite3
DBNAME = 'WebDnD.db'
def get_conn():
    return sqlite3.connect(DBNAME)
class Schema:
    def __init__(self):
        self.conn = get_conn()
        self.create_user_table()
        self.create_to_do_table()
        self.conn.commit()

    def create_to_do_table(self):
        query = """
        CREATE TABLE IF NOT EXISTS Todo (
          id INTEGER PRIMARY KEY,
          Title TEXT,
          Description TEXT,
          _is_done boolean,
          _is_deleted boolean,
          CreatedOn Date DEFAULT CURRENT_DATE,
          DueDate Date,
          UserId INTEGER FOREIGNKEY REFERENCES User(id)
        );
        """
        self.conn.execute(query)


    def create_user_table(self):
        query = """
        CREATE TABLE IF NOT EXISTS User (
          id INTEGER PRIMARY KEY,
          Name TEXT,
          Email TEXT,
          Registered Date DEFAULT CURRENT_DATE
        );
        """
        self.conn.execute(query)

class ToDoModel:
    def __init__(self, tablename='Todo'):
        self.tablename = tablename
        self.conn = get_conn()

    def create(self, title, description):
        query = f'INSERT INTO {self.tablename} ' \
                f'(Title, Description) ' \
                f'VALUES ("{title}","{description}")'

        self.conn.execute(query)
        self.conn.commit()

    def list(self):
        query = f'SELECT * FROM {self.tablename}'
        result = self.conn.execute(query).fetchall()
        return result

class ToDoService:
    def __init__(self):
        self.model = ToDoModel()
        
    def create(self, params):
        self.model.create(params["Title"], params["Description"])
        return 'OK'

    def list(self):
        return self.model.list()
