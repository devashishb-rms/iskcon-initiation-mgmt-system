#!/usr/bin/env bash
# Removes ONLY what install.sh created. Other sites, other databases and the prototype are not touched.
#   sudo bash uninstall.sh                 stop and remove services and the nginx block, keep data
#   sudo bash uninstall.sh --purge-data    also delete /opt/iskcon-saas (documents, settings, releases) and the database
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/iskcon-saas}"; SERVICE_USER="${SERVICE_USER:-iskcon-saas}"
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
for s in iskcon-saas-web iskcon-saas-api; do systemctl disable --now "$s" 2>/dev/null || true; rm -f "/etc/systemd/system/$s.service"; done
systemctl daemon-reload 2>/dev/null || true
if [ -f /etc/nginx/conf.d/iskcon-saas.conf ]; then rm -f /etc/nginx/conf.d/iskcon-saas.conf /etc/nginx/conf.d/iskcon-saas.conf.bak; nginx -t >/dev/null 2>&1 && nginx -s reload; fi
if [ "${1:-}" = "--purge-data" ]; then
  sudo -u postgres psql -qAt -c "drop database if exists iskcon_saas" -c "drop role if exists iskcon_saas" 2>/dev/null || echo "could not drop the database (external server?): drop iskcon_saas yourself"
  rm -rf "$APP_DIR"; userdel "$SERVICE_USER" 2>/dev/null || true
  echo "Everything removed."
else
  echo "Services and web block removed. Data kept in $APP_DIR and database iskcon_saas (use --purge-data to delete)."
fi
