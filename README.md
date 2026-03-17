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
1. **Sync to Pi**:
   Update `PI_HOST` in `sync_to_pi.sh`, then run:
   ```bash
   ./sync_to_pi.sh
   ```
2. **Setup Credentials**:
   On the Pi, create your environment file:
   ```bash
   cd ~/SamsungRAMProject
   cp .env.example .env
   nano .env  # Set your ADMIN_USER, ADMIN_PASS, and JWT_SECRET
   ```
3. **Install & Start Service**:
   ```bash
   sudo ./deploy_pi.sh
   ```
4. **Cloudflare Tunnel**:
   Find your public link by checking the logs:
   ```bash
   journalctl -u samsung-ram -f
   ```
   Look for the `https://<random>.trycloudflare.com` URL.

For a full guide on professional domains and persistent tunnels, see [PI_DEPLOYMENT.md](PI_DEPLOYMENT.md).

Security notes:
- The development server currently generates a self-signed certificate; for production use a valid TLS certificate (Let's Encrypt) or use Cloudflare Tunnel.
