#!/bin/bash

# Configuration
PI_USER="ramdenture"
PI_HOST="stanbrock.local"  # Update this to your Pi's IP or hostname
PI_DEST="~/SamsungRAMProject"

echo "🔍 Preparing to sync to $PI_HOST..."

# Use rsync to safely sync files
# -a: archive mode (preserves permissions, etc.)
# -v: verbose
# -z: compress data during transfer
# --exclude-from: uses .gitignore to skip non-source files
if rsync -avz \
    --exclude-from='.gitignore' \
    --exclude='.git/' \
    --exclude='samsung-ram.service' \
    --exclude='.env' \
    . "$PI_USER@$PI_HOST:$PI_DEST"; then
    echo "✅ Sync complete!"
    echo "💡 To finish setup on the Pi, run: sudo ./deploy_pi.sh"
else
    echo "❌ Sync failed."
    exit 1
fi
