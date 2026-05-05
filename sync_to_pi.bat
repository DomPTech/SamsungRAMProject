@echo off
REM Windows batch wrapper for sync_to_pi.py
REM This allows Windows users to run the sync script more easily
REM Uses Python which is cross-platform and doesn't require rsync

echo Syncing to Raspberry Pi...
python sync_to_pi.py
pause
