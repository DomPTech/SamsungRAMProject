#!/bin/bash

# Exit on error
set -e

SERVICE_NAME="samsung-ram.service"
SERVICE_PATH="/etc/systemd/system/$SERVICE_NAME"
QUICK_TUNNEL_SERVICE_NAME="samsung-ram-quick-tunnel.service"
QUICK_TUNNEL_SERVICE_PATH="/etc/systemd/system/$QUICK_TUNNEL_SERVICE_NAME"
PROJECT_DIR=$(pwd)
APP_USER="${SUDO_USER:-}"
CLOUDFLARED_CONFIG=""
CLOUDFLARED_BIN=""

echo "🚀 Starting setup for $SERVICE_NAME..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Please run as root (use sudo)"
  exit 1
fi

# Ensure deploy was run via sudo from the target user
if [ -z "$APP_USER" ]; then
  echo "❌ Could not determine target app user."
  echo "💡 Run this script using sudo from your normal user account (not directly as root)."
  exit 1
fi

APP_HOME=$(getent passwd "$APP_USER" | cut -d: -f6)
if [ -z "$APP_HOME" ]; then
  echo "❌ Could not determine home directory for user: $APP_USER"
  exit 1
fi
CLOUDFLARED_CONFIG="$APP_HOME/.cloudflared/config.yml"

# Validate runtime dependencies expected by the unit file
if [ ! -x "$PROJECT_DIR/.venv/bin/python" ]; then
  echo "❌ Missing Python virtualenv executable at $PROJECT_DIR/.venv/bin/python"
  echo "💡 Run: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi

if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "❌ Missing environment file: $PROJECT_DIR/.env"
  echo "💡 Run: cp .env.example .env and edit ADMIN_USER, ADMIN_PASS, JWT_SECRET"
  exit 1
fi

# Write service file with the current Pi user/project paths
echo "📦 Writing service file to $SERVICE_PATH..."
cat > "$SERVICE_PATH" <<EOF
[Unit]
Description=Samsung RAM Denture Queue Service
After=network.target

[Service]
User=$APP_USER
WorkingDirectory=$PROJECT_DIR
ExecStart=$PROJECT_DIR/.venv/bin/python server.py
Restart=always
RestartSec=5
EnvironmentFile=$PROJECT_DIR/.env

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
echo "🔄 Reloading systemd daemon..."
systemctl daemon-reload

# Enable and start service
echo "▶️ Enabling and starting service..."
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

if command -v cloudflared >/dev/null 2>&1; then
  CLOUDFLARED_BIN=$(command -v cloudflared)
  if [ -f "$CLOUDFLARED_CONFIG" ]; then
    echo "☁️ Configuring persistent Cloudflare Tunnel service..."
    if ! systemctl list-unit-files --type=service | grep -q '^cloudflared.service'; then
      cloudflared service install
    fi
    systemctl enable cloudflared
    systemctl restart cloudflared
    echo "✅ Cloudflare service is running. Check logs with: journalctl -u cloudflared -f"
  else
    echo "ℹ️ cloudflared config not found at $CLOUDFLARED_CONFIG."
    echo "☁️ Falling back to a persistent quick tunnel service..."
    cat > "$QUICK_TUNNEL_SERVICE_PATH" <<EOF
[Unit]
Description=Samsung RAM Quick Cloudflare Tunnel
After=network.target samsung-ram.service
Requires=samsung-ram.service

[Service]
User=$APP_USER
WorkingDirectory=$PROJECT_DIR
ExecStart=$CLOUDFLARED_BIN tunnel --url https://localhost:5001 --no-tls-verify
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable "$QUICK_TUNNEL_SERVICE_NAME"
    systemctl restart "$QUICK_TUNNEL_SERVICE_NAME"
    echo "✅ Quick tunnel service is running. Check logs with: journalctl -u $QUICK_TUNNEL_SERVICE_NAME -f"
    echo "💡 To switch to a named tunnel later, run cloudflared tunnel login, create ~/.cloudflared/config.yml, then re-run sudo ./deploy_pi.sh"
  fi
else
  echo "ℹ️ cloudflared is not installed. Install it, then re-run sudo ./deploy_pi.sh to auto-configure a persistent tunnel."
fi

echo "✅ Setup complete! Check app status with: sudo systemctl status $SERVICE_NAME"
