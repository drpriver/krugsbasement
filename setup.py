from setuptools import setup #type: ignore

install_requires = [
    'flask',
    'flask-socketio',
    'eventlet',
]

setup(
    name='WebDnD',
    version='0.1dev',
    python_requires='>=3.14',
    packages=['WebDnD',],
    install_requires=install_requires,
)

