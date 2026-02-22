# RAMUSA Denture Queue Website

This repository contains a small PWA and Flask server for tracking denture progress by NFC tags. This was developed for RAMUSA.

Quick start (development):

1. Create a Python virtualenv and install dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. Initialize the database and run the server:

```bash
python server.py
```

The server will create `database.db` and seed default stages on first run.

Recommended Pi deployment:
- Run the app with Gunicorn behind Nginx, or expose via Cloudflare Tunnel.
- Create a systemd service to run Gunicorn on boot.

Security notes:
- The development server currently generates a self-signed certificate; for production use a valid TLS certificate (Let's Encrypt) or use Cloudflare Tunnel.
