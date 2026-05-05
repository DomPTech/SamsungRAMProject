#!/usr/bin/env python3
"""
Cross-platform sync script for deploying to Raspberry Pi.
Works on Windows, Mac, and Linux without requiring rsync.
"""

import os
import sys
import shutil
import subprocess
import argparse
from pathlib import Path

# Configuration
PI_USER = "ramdenture"
PI_HOST = "stanbrock.local"  # Update this to your Pi's IP or hostname
PI_DEST = "~/SamsungRAMProject"

# Files/directories to exclude
EXCLUDE_PATTERNS = {
    ".git",
    ".gitignore",
    ".env",
    ".venv",
    "__pycache__",
    "*.pyc",
    ".pytest_cache",
    "node_modules",
    ".DS_Store",
    "database.db",
}


def load_gitignore():
    """Load patterns from .gitignore file."""
    patterns = set()
    gitignore_path = Path(".gitignore")
    if gitignore_path.exists():
        with open(gitignore_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    patterns.add(line.rstrip("/"))
    return patterns


def should_exclude(path, exclude_patterns):
    """Check if a path should be excluded."""
    path_obj = Path(path)
    
    # Check exact matches and parent directories
    for pattern in exclude_patterns:
        if path == pattern or path.startswith(pattern + os.sep):
            return True
        if path_obj.name == pattern:
            return True
    
    return False


def rsync_via_ssh(local_path, remote_path):
    """Fall back to using rsync if available, or tar+ssh."""
    print("📦 Creating archive for transfer...")
    
    # Create a tar file excluding the necessary files
    tar_file = "/tmp/samsung_ram_sync.tar.gz"
    exclude_args = []
    
    for pattern in EXCLUDE_PATTERNS:
        exclude_args.extend(["--exclude", pattern])
    
    exclude_patterns = load_gitignore()
    for pattern in exclude_patterns:
        if pattern and not pattern.startswith("#"):
            exclude_args.extend(["--exclude", pattern])
    
    # Try tar method
    try:
        print(f"🔍 Using tar to create archive (excluding build artifacts)...")
        cmd = ["tar", "-czf", tar_file] + exclude_args + ["."]
        subprocess.run(cmd, check=True)
        
        print(f"📤 Uploading to {PI_USER}@{PI_HOST}...")
        scp_cmd = [
            "scp",
            tar_file,
            f"{PI_USER}@{PI_HOST}:/tmp/samsung_ram_sync.tar.gz"
        ]
        subprocess.run(scp_cmd, check=True)
        
        print(f"📂 Extracting on Pi...")
        ssh_cmd = [
            "ssh",
            f"{PI_USER}@{PI_HOST}",
            f"cd {PI_DEST} && tar -xzf /tmp/samsung_ram_sync.tar.gz && rm /tmp/samsung_ram_sync.tar.gz"
        ]
        subprocess.run(ssh_cmd, check=True)
        
        # Clean up local tar
        os.remove(tar_file)
        
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Tar method failed: {e}")
        return False
    except FileNotFoundError:
        print("❌ Required tool not found (tar or ssh)")
        return False


def sync_to_pi():
    """Main sync function."""
    print(f"🔍 Preparing to sync to {PI_HOST}...")
    
    # Try rsync first (fastest if available)
    try:
        result = subprocess.run(
            ["rsync", "--version"],
            capture_output=True,
            timeout=2
        )
        if result.returncode == 0:
            print("✅ rsync found, using it for sync...")
            exclude_args = []
            for pattern in EXCLUDE_PATTERNS:
                exclude_args.extend(["--exclude", pattern])
            
            exclude_patterns = load_gitignore()
            for pattern in exclude_patterns:
                if pattern and not pattern.startswith("#"):
                    exclude_args.extend(["--exclude", pattern])
            
            cmd = [
                "rsync",
                "-avz",
                "--exclude-from=.gitignore",
                "--exclude=.git/",
                "--exclude=.env",
            ] + exclude_args + [
                ".",
                f"{PI_USER}@{PI_HOST}:{PI_DEST}"
            ]
            
            result = subprocess.run(cmd)
            if result.returncode == 0:
                print("✅ Sync complete!")
                print("💡 To finish setup on the Pi, run: sudo ./deploy_pi.sh")
                return True
            else:
                print("❌ rsync sync failed.")
                return False
    except (FileNotFoundError, subprocess.TimeoutExpired):
        print("⚠️  rsync not found, falling back to tar+ssh method...")
    
    # Fallback to tar+ssh
    if rsync_via_ssh(".", f"{PI_USER}@{PI_HOST}:{PI_DEST}"):
        print("✅ Sync complete!")
        print("💡 To finish setup on the Pi, run: sudo ./deploy_pi.sh")
        return True
    else:
        print("❌ Sync failed - no suitable transfer method available.")
        print("\n📖 To install rsync on Windows Git Bash:")
        print("   1. Install MSYS2 from https://www.msys2.org/")
        print("   2. Run: pacman -S rsync")
        print("   3. Use rsync from MSYS2 shell, or add to PATH")
        return False


def test_connection():
    """Test SSH connectivity to the Pi."""
    print(f"🔗 Testing SSH connection to {PI_USER}@{PI_HOST}...")
    try:
        result = subprocess.run(
            ["ssh", "-o", "ConnectTimeout=5", f"{PI_USER}@{PI_HOST}", "echo OK"],
            capture_output=True,
            timeout=10,
            text=True
        )
        if result.returncode == 0:
            print("✅ SSH connection successful!")
            return True
        else:
            print(f"❌ SSH connection failed: {result.stderr}")
            return False
    except FileNotFoundError:
        print("❌ ssh command not found")
        return False
    except subprocess.TimeoutExpired:
        print("❌ SSH connection timeout")
        return False
    except Exception as e:
        print(f"❌ SSH test failed: {e}")
        return False


def test_rsync_available():
    """Check if rsync is available."""
    print("🔧 Checking for rsync...")
    try:
        result = subprocess.run(
            ["rsync", "--version"],
            capture_output=True,
            timeout=2
        )
        if result.returncode == 0:
            version = result.stdout.decode().split('\n')[0]
            print(f"✅ rsync found: {version}")
            return True
        else:
            print("❌ rsync not found (fallback to tar will be used)")
            return False
    except (FileNotFoundError, subprocess.TimeoutExpired):
        print("⚠️  rsync not available (will use tar+ssh fallback)")
        return False


def test_exclude_patterns():
    """Test that exclude patterns work correctly."""
    print("\n📋 Testing exclude patterns...")
    exclude_patterns = EXCLUDE_PATTERNS | load_gitignore()
    
    test_cases = [
        (".git", True, "Should exclude .git"),
        (".env", True, "Should exclude .env"),
        ("server.py", False, "Should include server.py"),
        (".git/config", True, "Should exclude .git subdirectories"),
        (".venv/bin/python", True, "Should exclude .venv"),
        ("README.md", False, "Should include README.md"),
    ]
    
    all_passed = True
    for path, should_be_excluded, description in test_cases:
        is_excluded = should_exclude(path, exclude_patterns)
        status = "✅" if is_excluded == should_be_excluded else "❌"
        print(f"{status} {description}")
        if is_excluded != should_be_excluded:
            all_passed = False
    
    return all_passed


def run_tests():
    """Run all diagnostic tests."""
    print("=" * 50)
    print("🧪 Running sync script diagnostics...\n")
    
    results = {
        "Exclude patterns": test_exclude_patterns(),
        "rsync available": test_rsync_available(),
        "SSH connection": test_connection(),
    }
    
    print("\n" + "=" * 50)
    print("📊 Test Summary:")
    for test, passed in results.items():
        status = "✅" if passed else "⚠️ "
        print(f"{status} {test}")
    
    print("=" * 50)
    
    if results["SSH connection"]:
        print("\n✅ Your Pi is reachable! The sync should work.")
        print(f"   Ready to sync to: {PI_USER}@{PI_HOST}:{PI_DEST}")
    else:
        print("\n⚠️  Cannot reach your Pi. Check:")
        print(f"   1. Pi hostname/IP: {PI_HOST}")
        print(f"   2. Pi username: {PI_USER}")
        print(f"   3. SSH access: Can you run 'ssh {PI_USER}@{PI_HOST}' manually?")
        print(f"   4. Network: Are you on the same network or via VPN?")
    
    return all(results.values())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync project to Raspberry Pi")
    parser.add_argument("--test", action="store_true", help="Run diagnostic tests only")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be synced without uploading")
    
    args = parser.parse_args()
    
    try:
        if args.test:
            success = run_tests()
            sys.exit(0 if success else 1)
        elif args.dry_run:
            print("📋 Dry-run mode: showing files that would be synced\n")
            exclude_patterns = EXCLUDE_PATTERNS | load_gitignore()
            print("Files to sync:")
            for root, dirs, files in os.walk("."):
                # Filter out excluded directories
                dirs[:] = [d for d in dirs if not should_exclude(d, exclude_patterns)]
                
                for file in files:
                    path = os.path.join(root, file).lstrip("./")
                    if not should_exclude(path, exclude_patterns):
                        print(f"  ✓ {path}")
            
            print("\nFiles excluded:")
            for root, dirs, files in os.walk("."):
                dirs[:] = [d for d in dirs if should_exclude(d, exclude_patterns)]
                for file in files:
                    path = os.path.join(root, file).lstrip("./")
                    if should_exclude(path, exclude_patterns):
                        print(f"  ✗ {path}")
            
            sys.exit(0)
        else:
            success = sync_to_pi()
            sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n⚠️  Operation cancelled by user.")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
