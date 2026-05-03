#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/broadcaster
SERVICE_FILE=/etc/systemd/system/broadcaster.service

sudo mkdir -p "$APP_DIR"
sudo rsync -a --delete ./ "$APP_DIR" --exclude .git --exclude node_modules

if [[ ! -f "$APP_DIR/.env" ]]; then
  sudo cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo "Created $APP_DIR/.env (please edit before start)."
fi

sudo cp "$APP_DIR/deploy/broadcaster.service" "$SERVICE_FILE"
sudo systemctl daemon-reload
sudo systemctl enable broadcaster
sudo systemctl restart broadcaster
sudo systemctl status broadcaster --no-pager
