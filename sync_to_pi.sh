#!/bin/bash

# Configuration
PI_USER="cheezumdomp"
PI_HOST="landnraspi.local"  # Update this to your Pi's IP or hostname
PI_DEST="~/SamsungRAMProject"

echo "🔍 Preparing to sync to $PI_HOST..."

# Use rsync to safely sync files
# -a: archive mode (preserves permissions, etc.)
# -v: verbose
# -z: compress data during transfer
# --delete: optional (removes files on Pi that were deleted locally)
# --exclude-from: uses .gitignore to skip non-source files
rsync -avz \
    --exclude-from='.gitignore' \
    --exclude='.git/' \
    --exclude='deploy_pi.sh' \
    --exclude='samsung-ram.service' \
    --exclude='.env' \
    --exclude='.env.example' \
    . "$PI_USER@$PI_HOST:$PI_DEST"

echo "✅ Sync complete!"
echo "💡 To finish setup on the Pi, run: sudo ./deploy_pi.sh"
