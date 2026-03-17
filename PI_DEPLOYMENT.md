# Raspberry Pi Deployment & Cloudflare Guide

This guide covers how to manage the Raspberry Pi deployment, find connection links, and set up a custom domain.

## 1. Setting Admin Credentials

We use a `.env` file to keep your secrets safe and prevent them from being overwritten when you sync code from your computer.

1.  **Create the .env file on your Pi**:
    ```bash
    cd ~/SamsungRAMProject
    cp .env.example .env
    nano .env
    ```
2.  **Edit the credentials**:
    Update the `ADMIN_USER`, `ADMIN_PASS`, and `JWT_SECRET` in that file.
3.  **Apply changes**:
    If you've already run the deployment script, just restart the service:
    ```bash
    sudo systemctl restart samsung-ram
    ```

> [!TIP]
> Your local `sync_to_pi.sh` is now configured to **never** overwrite your `.env` or `samsung-ram.service` files on the Pi. You can safely sync code without losing your Pi-specific settings.

---

## 2. Using Cloudflare Tunnel
Cloudflare Tunnels are the safest way to expose your Pi to the internet without opening ports.

### Finding the Anonymous Link
If you are using a basic `cloudflared tunnel --url http://localhost:5001` command:
1.  **Check the logs**:
    ```bash
    journalctl -u samsung-ram -f
    ```
    (Or whichever service is running `cloudflared`)
2.  **Look for a URL ending in `.trycloudflare.com`**. This is your temporary link. It will change every time the tunnel restarts.

### Setting a "Make Sense" Professional Link
To get a permanent, readable URL (like `queue.yourdomain.com`), you need a Cloudflare account and a registered domain.

1.  **Install Cloudflared on the Pi**:
    Follow [Cloudflare's official guide](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/install-run/remote-admin/) to install and authenticate.
2.  **Create a Named Tunnel**:
    ```bash
    cloudflared tunnel create samsung-queue
    ```
3.  **Configure the Tunnel**:
    Create a `config.yml` (usually in `~/.cloudflared/`):
    ```yaml
    tunnel: <TUNNEL_ID>
    credentials-file: /home/pi/.cloudflared/<TUNNEL_ID>.json
    ingress:
      - hostname: queue.yourdomain.com
        service: https://localhost:5001
        originRequest:
          noTLSVerify: true # Required for self-signed certs
      - service: http_status:404
    ```
4.  **Route the Domain**:
    ```bash
    cloudflared tunnel route dns samsung-queue queue.yourdomain.com
    ```
5.  **Run as a Service**:
    ```bash
    sudo cloudflared service install
    ```
