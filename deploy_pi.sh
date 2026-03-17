#!/bin/bash

# Exit on error
set -e

SERVICE_NAME="samsung-ram.service"
SERVICE_PATH="/etc/systemd/system/$SERVICE_NAME"
PROJECT_DIR=$(pwd)

echo "🚀 Starting setup for $SERVICE_NAME..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Please run as root (use sudo)"
  exit 1
fi

# Link or copy service file
echo "📦 Copying service file to $SERVICE_PATH..."
cp "$PROJECT_DIR/$SERVICE_NAME" "$SERVICE_PATH"

# Reload systemd
echo "🔄 Reloading systemd daemon..."
systemctl daemon-reload

# Enable and start service
echo "▶️ Enabling and starting service..."
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo "✅ Setup complete! Check status with: sudo systemctl status $SERVICE_NAME"
