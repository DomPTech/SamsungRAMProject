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
   cd ~/SamsungRAMProject
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   chmod +x deploy_pi.sh
   sudo ./deploy_pi.sh
   ```

   Note: dependency installation is manual; `deploy_pi.sh` does not run `pip install`.
4. **Cloudflare Tunnel**:
   `cloudflared` is not installed by this project. Install and authenticate it manually on the Pi first.
   For Raspberry Pi `aarch64`, this install flow works:
   ```bash
   cd ~
   wget -O cloudflared-linux-arm64.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
   sudo apt update
   sudo apt install -y ./cloudflared-linux-arm64.deb
   cloudflared --version
   cloudflared tunnel login
   ```
   If `~/.cloudflared/config.yml` is missing, `deploy_pi.sh` now creates a persistent quick-tunnel service automatically (`--no-tls-verify`) and you can view the random URL in:
   ```bash
   journalctl -u samsung-ram-quick-tunnel -f
   ```
   If you later create `~/.cloudflared/config.yml` for a named tunnel, re-run:
   ```bash
   cd ~/SamsungRAMProject
   sudo ./deploy_pi.sh
   ```
   The deploy script will enable/restart `cloudflared` as a persistent service when config is present.
   Find tunnel activity by checking:
   ```bash
   journalctl -u cloudflared -f
   ```
   Look for the `https://<random>.trycloudflare.com` URL when using anonymous/quick tunnels.

For a full guide on professional domains and persistent tunnels, see [PI_DEPLOYMENT.md](PI_DEPLOYMENT.md).

Security notes:
- The development server currently generates a self-signed certificate; for production use a valid TLS certificate (Let's Encrypt) or use Cloudflare Tunnel.
