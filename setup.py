from setuptools import setup #type: ignore

install_requires = [
    'flask',
    'flask-socketio',
    'eventlet',
]

setup(
    name='WebDnD',
    version='0.1dev',
    packages=['WebDnD',],
    install_requires=install_requires,
)

