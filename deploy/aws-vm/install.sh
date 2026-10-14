#!/usr/bin/env bash
# Installs (or upgrades) the ISKCON Initiation Management System on a Linux server WITHOUT Docker, beside whatever
# already runs there. Idempotent: run it again with a newer bundle to upgrade.
#
#   sudo BUNDLE=./iskcon-saas-<version>-linux-x64.tar.gz \
#        ADMIN_NAME="Full Name" ADMIN_EMAIL=admin@example.org bash install.sh
#
# What it touches (and only this):
#   /opt/iskcon-saas                   all files of this app (releases, config, uploaded documents, private Node)
#   user  iskcon-saas                  system user that owns it, no login
#   systemd iskcon-saas-api / -web     two services, memory-capped
#   database iskcon_saas + role        a NEW database in the local PostgreSQL (other databases are never touched)
#   nginx  conf.d/iskcon-saas.conf     ONE extra server block on its own port; added only if `nginx -t` passes,
#                                      then a graceful reload (existing sites keep serving)
# It never stops, restarts or edits anything that already exists. DRY_RUN=1 shows the plan and changes nothing.
#
# Settings (environment variables; defaults in brackets):
#   BUNDLE [./iskcon-saas-*.tar.gz]  APP_DIR [/opt/iskcon-saas]   PUBLIC_PORT [8080]  API_PORT [4100]  WEB_PORT [3100]
#   PUBLIC_HOST [auto: EC2 public name or IP]   PUBLIC_SCHEME [http]  (set https only when TLS is in front)
#   ADMIN_NAME, ADMIN_EMAIL [none: first administrator is created only when both are given]   ADMIN_PHONE
#   TEMPLE_NAME ["ISKCON Newtown"]  SEED_DEMO [0] (1 loads invented sample people; never on a real database)
#   NODE_VERSION [22.22.0]  ADD_SWAP [0] (1 adds a 1 GB swap file when the machine has none)
#   PG_ADMIN_URL [auto: local postgres via `sudo -u postgres`]  (an admin connection string for another server)
#   PROTOTYPE_URL [none]  a URL of the running prototype; checked before and after to prove it is unaffected
#   DELIVERY_MODE [console] 'console' prints sign-in codes to the service log; 'live' needs SMTP_URL set in the env file
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/iskcon-saas}"
SERVICE_USER="${SERVICE_USER:-iskcon-saas}"
PUBLIC_PORT="${PUBLIC_PORT:-8080}"; API_PORT="${API_PORT:-4100}"; WEB_PORT="${WEB_PORT:-3100}"
PUBLIC_SCHEME="${PUBLIC_SCHEME:-http}"
NODE_VERSION="${NODE_VERSION:-22.22.0}"
TEMPLE_NAME="${TEMPLE_NAME:-ISKCON Newtown}"
DRY_RUN="${DRY_RUN:-0}"; ADD_SWAP="${ADD_SWAP:-0}"; SEED_DEMO="${SEED_DEMO:-0}"
SKIP_SYSTEMD="${SKIP_SYSTEMD:-0}"; SKIP_NGINX="${SKIP_NGINX:-0}"   # for tests
HERE="$(cd "$(dirname "$0")" && pwd)"

say()  { printf '\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m!!  %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31mxx  %s\033[0m\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
run()  { if [ "$DRY_RUN" = 1 ]; then printf '[dry-run] %s\n' "$*"; else "$@"; fi; }

[ "$(id -u)" = 0 ] || die "run as root (sudo)"
have runuser || die "runuser is required (util-linux)"
have ss || warn "ss (iproute2) not found: port checks are skipped"
for t in curl tar openssl; do have "$t" || die "$t is required"; done
[ "$SKIP_SYSTEMD" = 1 ] || have systemctl || die "systemd is required"
[ "$(uname -m)" = x86_64 ] || [ "$(uname -m)" = aarch64 ] || die "unsupported CPU $(uname -m)"

# ───────────────────────── 1. checks (read-only) ─────────────────────────
say "Checking the machine"
port_busy() { have ss && ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$1$"; }
OWN_RUNNING=0
if [ "$SKIP_SYSTEMD" != 1 ] && systemctl is-active --quiet iskcon-saas-api 2>/dev/null; then OWN_RUNNING=1; fi
if [ "$OWN_RUNNING" = 0 ]; then
  for p in "$API_PORT" "$WEB_PORT" "$PUBLIC_PORT"; do
    port_busy "$p" && die "port $p is already in use by something else. Pick another with API_PORT / WEB_PORT / PUBLIC_PORT. Nothing was changed."
  done
fi
[ "$(df --output=avail -m / | tail -1)" -gt 1200 ] || die "less than 1.2 GB free on /"
MEM_AVAIL=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo); SWAP_TOTAL=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo)
[ "$SWAP_TOTAL" -gt 0 ] || [ "$ADD_SWAP" = 1 ] || warn "no swap on this machine and ${MEM_AVAIL} MB free: set ADD_SWAP=1 (recommended on a 1 GB server)"

BUNDLE="${BUNDLE:-$(ls -1t "$HERE"/iskcon-saas-*-linux-x64.tar.gz ./iskcon-saas-*-linux-x64.tar.gz 2>/dev/null | head -1 || true)}"
[ -n "$BUNDLE" ] && [ -f "$BUNDLE" ] || die "bundle not found: set BUNDLE=/path/to/iskcon-saas-<version>-linux-x64.tar.gz"
BUNDLE="$(readlink -f "$BUNDLE")"; cd /
if [ -f "$BUNDLE.sha256" ]; then ( cd "$(dirname "$BUNDLE")" && sha256sum -c "$(basename "$BUNDLE").sha256" >/dev/null ) || die "bundle checksum mismatch"; say "Bundle checksum OK"; fi

if [ -z "${PUBLIC_HOST:-}" ]; then
  T=$(curl -s -m 2 -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' || true)
  PUBLIC_HOST=$(curl -s -m 2 -H "X-aws-ec2-metadata-token: $T" http://169.254.169.254/latest/meta-data/public-hostname || true)
  [ -n "$PUBLIC_HOST" ] || PUBLIC_HOST=$(curl -s -m 2 -H "X-aws-ec2-metadata-token: $T" http://169.254.169.254/latest/meta-data/public-ipv4 || true)
  [ -n "$PUBLIC_HOST" ] || PUBLIC_HOST=localhost
fi
PUBLIC_URL="$PUBLIC_SCHEME://$PUBLIC_HOST:$PUBLIC_PORT"
HAVE_NGINX=0; if [ "$SKIP_NGINX" != 1 ] && have nginx && grep -q "conf.d" /etc/nginx/nginx.conf 2>/dev/null; then HAVE_NGINX=1; fi
if [ "$HAVE_NGINX" = 1 ]; then WEB_BIND=127.0.0.1; else WEB_BIND=0.0.0.0; WEB_PORT="$PUBLIC_PORT"; fi

say "Plan"
cat <<PLAN
  app directory : $APP_DIR            service user : $SERVICE_USER
  public address: $PUBLIC_URL         (web on $WEB_BIND:$WEB_PORT, API on 127.0.0.1:$API_PORT)
  web front     : $([ "$HAVE_NGINX" = 1 ] && echo "nginx server block on port $PUBLIC_PORT (existing sites untouched)" || echo "the app's own web server listens on port $PUBLIC_PORT directly")
  database      : $([ -n "${PG_ADMIN_URL:-}" ] && echo "new database on the server in PG_ADMIN_URL" || echo "new database iskcon_saas in the local PostgreSQL (installed if missing)")
  documents     : $APP_DIR/shared/storage (local disk)
  bundle        : $BUNDLE
PLAN
[ "$DRY_RUN" = 1 ] && { say "DRY_RUN: nothing was changed."; exit 0; }

# Baseline of what the prototype is doing now, to prove it is unaffected afterwards.
others_listening() { { ss -ltn 2>/dev/null | awk 'NR>1 {print $4}' | grep -Ev "[:.]($API_PORT|$WEB_PORT|$PUBLIC_PORT)$" | sort | tr '\n' ' '; } || true; }
BASE_LISTEN="$(others_listening)"
proto_status() { [ -n "${PROTOTYPE_URL:-}" ] && curl -s -o /dev/null -m 5 -w '%{http_code}' "$PROTOTYPE_URL" || echo n/a; }
PROTO_BEFORE="$(proto_status)"; say "Prototype before: HTTP $PROTO_BEFORE"

# ───────────────────────── 2. swap (optional) ─────────────────────────
if [ "$ADD_SWAP" = 1 ] && [ "$SWAP_TOTAL" -eq 0 ]; then
  say "Adding a 1 GB swap file at /swapfile-iskcon"
  fallocate -l 1G /swapfile-iskcon 2>/dev/null || dd if=/dev/zero of=/swapfile-iskcon bs=1M count=1024 status=none
  chmod 600 /swapfile-iskcon; mkswap /swapfile-iskcon >/dev/null; swapon /swapfile-iskcon
  grep -q swapfile-iskcon /etc/fstab || echo '/swapfile-iskcon none swap sw 0 0' >> /etc/fstab
fi

# ───────────────────────── 3. user, directories, private Node ─────────────────────────
say "Creating the service user and directories"
id "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
mkdir -p "$APP_DIR"/{releases,shared/storage,node}
chmod 755 "$APP_DIR"

# NODE_BIN=/path/to/node (22+) uses an existing Node instead of downloading one (also if nodejs.org is unreachable).
if [ -z "${NODE_BIN:-}" ]; then
  NODE_BIN="$APP_DIR/node/node-v$NODE_VERSION-linux-x64/bin/node"
  [ "$(uname -m)" = aarch64 ] && NODE_BIN="$APP_DIR/node/node-v$NODE_VERSION-linux-arm64/bin/node"
  NEED_NODE=1
else NEED_NODE=0; fi
if [ "$NEED_NODE" = 1 ] && [ ! -x "$NODE_BIN" ]; then
  say "Downloading a private Node $NODE_VERSION (the system Node, if any, is not used or changed)"
  ARCH=x64; [ "$(uname -m)" = aarch64 ] && ARCH=arm64
  TB="node-v$NODE_VERSION-linux-$ARCH.tar.xz"; TMP="$(mktemp -d)"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/$TB" -o "$TMP/$TB"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" -o "$TMP/SHASUMS256.txt"
  ( cd "$TMP" && grep " $TB\$" SHASUMS256.txt | sha256sum -c - >/dev/null ) || die "Node download failed its checksum"
  tar -xJf "$TMP/$TB" -C "$APP_DIR/node"; rm -rf "$TMP"
fi
[ "$("$NODE_BIN" -p "process.versions.node.split('.')[0]")" -ge 22 ] || die "Node 22 or newer is required"

# ───────────────────────── 4. PostgreSQL ─────────────────────────
ENV_FILE="$APP_DIR/shared/iskcon-saas.env"
INSTALLED_PG=0
if [ -f "$ENV_FILE" ]; then
  say "Reusing the existing settings in $ENV_FILE"
else
  say "Preparing the database"
  DB_PASS="$(openssl rand -hex 24)"
  if [ -n "${PG_ADMIN_URL:-}" ]; then
    PSQL=(psql "$PG_ADMIN_URL" -v ON_ERROR_STOP=1 -qAt)
    DB_HOST_URL="$(printf '%s' "$PG_ADMIN_URL" | sed -E 's#^(postgres(ql)?://)[^@/]*@#\1#; s#/[^/]*$##')"
  else
    if ! have psql || ! { systemctl is-active --quiet postgresql 2>/dev/null || pg_lsclusters 2>/dev/null | grep -q online; }; then
      INSTALLED_PG=1
      say "PostgreSQL is not running here: installing it (a separate service; nothing existing is changed)"
      if have apt-get; then DEBIAN_FRONTEND=noninteractive apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql >/dev/null
      elif have dnf; then dnf install -y -q postgresql16-server postgresql16 >/dev/null 2>&1 || dnf install -y -q postgresql-server postgresql >/dev/null
        [ -d /var/lib/pgsql/data/base ] || postgresql-setup --initdb >/dev/null 2>&1 || /usr/pgsql-16/bin/postgresql-16-setup initdb >/dev/null 2>&1 || true
        systemctl enable --now postgresql >/dev/null
      else die "no apt-get or dnf: install PostgreSQL 13+ yourself and re-run with PG_ADMIN_URL=postgres://admin@host/postgres"; fi
      systemctl enable --now postgresql >/dev/null 2>&1 || true
      # A small footprint for a small machine (only on a server WE installed).
      CONFD="$(runuser -u postgres -- psql -qAt -c 'show config_file' | xargs dirname)/conf.d"
      mkdir -p "$CONFD" 2>/dev/null && printf 'shared_buffers = 64MB\nmax_connections = 30\nwork_mem = 4MB\n' > "$CONFD/iskcon-small.conf" || true
      systemctl restart postgresql   # our own just-installed instance only
    fi
    PSQL=(runuser -u postgres -- psql -v ON_ERROR_STOP=1 -qAt)
    DB_HOST_URL="postgresql://localhost:5432"
  fi
  PGV="$("${PSQL[@]}" -c "show server_version_num")"; [ "$PGV" -ge 130000 ] || die "PostgreSQL 13 or newer is required (found $PGV)"
  [ "$("${PSQL[@]}" -c "select 1 from pg_roles where rolname='iskcon_saas'")" = 1 ] || "${PSQL[@]}" -c "create role iskcon_saas login password '$DB_PASS'"
  [ "$("${PSQL[@]}" -c "select 1 from pg_database where datname='iskcon_saas'")" = 1 ] || "${PSQL[@]}" -c "create database iskcon_saas owner iskcon_saas"
  "${PSQL[@]}" -c "alter role iskcon_saas password '$DB_PASS'" >/dev/null   # settings file is the source of truth

  say "Writing $ENV_FILE"
  umask 077
  cat > "$ENV_FILE" <<ENV
NODE_ENV=production
LOG_LEVEL=info
PORT=$API_PORT
DATABASE_URL=${DB_HOST_URL/\/\//\/\/iskcon_saas:$DB_PASS@}/iskcon_saas
DATABASE_POOL_MAX=5
RUN_MIGRATIONS_ON_BOOT=false
# Seals authenticator secrets and keys sign-in code hashes. Keep a copy somewhere safe; changing it signs everyone out.
APP_ENCRYPTION_KEY=$(openssl rand -base64 32)
DEFAULT_TENANT_SLUG=newtown
PUBLIC_WEB_URL=$PUBLIC_URL
CORS_ORIGIN=$PUBLIC_URL
COOKIE_SECURE=$([ "$PUBLIC_SCHEME" = https ] && echo true || echo false)
# console: one-time sign-in codes appear in the service log (journalctl -u iskcon-saas-api). live: set SMTP_URL (and MAIL_FROM).
DELIVERY_MODE=${DELIVERY_MODE:-console}
# SMTP_URL=smtps://user:pass@smtp.example.org:465
# MAIL_FROM=Initiation Office <no-reply@example.org>
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=$APP_DIR/shared/storage
MAX_UPLOAD_MB=10
SCHEDULER_ENABLED=true
ENV
  umask 022
  # The app connects over TCP with a password. On a server we installed ourselves, make sure pg_hba allows that.
  if ! psql "$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)" -qAt -c 'select 1' >/dev/null 2>&1; then
    if [ "$INSTALLED_PG" = 1 ]; then
      HBA="$("${PSQL[@]}" -c 'show hba_file')"
      sed -i '1i host iskcon_saas iskcon_saas 127.0.0.1/32 scram-sha-256\nhost iskcon_saas iskcon_saas ::1/128 scram-sha-256' "$HBA"
      "${PSQL[@]}" -c 'select pg_reload_conf()' >/dev/null
    fi
    psql "$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)" -qAt -c 'select 1' >/dev/null 2>&1 \
      || die "cannot log in to the new database over TCP. Add to pg_hba.conf:  host iskcon_saas iskcon_saas 127.0.0.1/32 scram-sha-256  (then reload PostgreSQL) and re-run."
  fi
fi
API_PORT="$(grep '^PORT=' "$ENV_FILE" | cut -d= -f2)"
chown root:"$SERVICE_USER" "$ENV_FILE"; chmod 640 "$ENV_FILE"
chown -R "$SERVICE_USER":"$SERVICE_USER" "$APP_DIR/shared/storage"

# ───────────────────────── 5. release ─────────────────────────
REL_ID="$(tar -xzOf "$BUNDLE" ./VERSION 2>/dev/null | tr -d '\n' || true)"; REL_ID="${REL_ID:-manual}-$(date +%Y%m%d%H%M%S)"
REL="$APP_DIR/releases/$REL_ID"
say "Unpacking release $REL_ID"
mkdir -p "$REL"; tar -xzf "$BUNDLE" -C "$REL"; chown -R root:root "$REL"; chmod -R a+rX "$REL"

with_env() { ( set -a; . "$ENV_FILE"; set +a; cd "$REL/api"; runuser -u "$SERVICE_USER" -- env "PATH=$(dirname "$NODE_BIN"):$PATH" "$@" ); }
say "Applying database migrations"
with_env "$NODE_BIN" dist/database/migrate.js
if [ -n "${ADMIN_NAME:-}" ] && [ -n "${ADMIN_EMAIL:-}" ]; then
  say "Setting up the temple and its first administrator (safe to repeat)"
  with_env "$NODE_BIN" dist/cli/provision.js --name "$TEMPLE_NAME" --admin-name "$ADMIN_NAME" --admin-email "$ADMIN_EMAIL" ${ADMIN_PHONE:+--admin-phone "$ADMIN_PHONE"}
else
  warn "ADMIN_NAME / ADMIN_EMAIL not given: no administrator was created. Re-run this script with them to create one."
fi
if [ "$SEED_DEMO" = 1 ]; then warn "SEED_DEMO=1: loading INVENTED sample people (not for a real temple)"; [ -f "$REL/api/dist/seed/run.js" ] && with_env "$NODE_BIN" dist/seed/run.js || warn "seed is not part of this bundle"; fi

# ───────────────────────── 6. services ─────────────────────────
if [ "$SKIP_SYSTEMD" != 1 ]; then
  say "Installing the two services (iskcon-saas-api, iskcon-saas-web)"
  sed -e "s#@APP_DIR@#$APP_DIR#g" -e "s#@USER@#$SERVICE_USER#g" -e "s#@NODE@#$NODE_BIN#g" "$HERE/systemd/iskcon-saas-api.service" > /etc/systemd/system/iskcon-saas-api.service
  sed -e "s#@APP_DIR@#$APP_DIR#g" -e "s#@USER@#$SERVICE_USER#g" -e "s#@NODE@#$NODE_BIN#g" -e "s#@WEB_PORT@#$WEB_PORT#g" -e "s#@WEB_BIND@#$WEB_BIND#g" "$HERE/systemd/iskcon-saas-web.service" > /etc/systemd/system/iskcon-saas-web.service
  ln -sfn "$REL" "$APP_DIR/current"
  systemctl daemon-reload
  systemctl enable iskcon-saas-api iskcon-saas-web >/dev/null 2>&1
  systemctl restart iskcon-saas-api iskcon-saas-web      # our own services only
else
  ln -sfn "$REL" "$APP_DIR/current"
fi

# ───────────────────────── 7. nginx (one extra server block) ─────────────────────────
if [ "$HAVE_NGINX" = 1 ]; then
  say "Adding an nginx server block on port $PUBLIC_PORT"
  CONF=/etc/nginx/conf.d/iskcon-saas.conf
  [ -f "$CONF" ] && cp "$CONF" "$CONF.bak"
  sed -e "s#@PUBLIC_PORT@#$PUBLIC_PORT#g" -e "s#@WEB_PORT@#$WEB_PORT#g" "$HERE/nginx/iskcon-saas.conf" > "$CONF"
  if nginx -t >/dev/null 2>&1; then nginx -s reload     # graceful: existing sites keep serving
  else
    warn "nginx rejected the new block; removing it. The existing nginx configuration is untouched."
    nginx -t 2>&1 | tail -3 >&2; rm -f "$CONF"; [ -f "$CONF.bak" ] && mv "$CONF.bak" "$CONF"; die "nginx step failed (app services are running on 127.0.0.1:$WEB_PORT)"
  fi
fi

# ───────────────────────── 8. verify ─────────────────────────
say "Waiting for the services"
ok=0; for i in $(seq 1 45); do
  if curl -fs -m 3 "http://127.0.0.1:$API_PORT/readyz" >/dev/null && curl -fs -m 3 -o /dev/null "http://127.0.0.1:$WEB_PORT/login"; then ok=1; break; fi; sleep 2; done
[ "$ok" = 1 ] || { warn "services did not become healthy; see: journalctl -u iskcon-saas-api -u iskcon-saas-web -n 80"; exit 1; }
curl -fs -m 5 -o /dev/null "http://127.0.0.1:$PUBLIC_PORT/login" || warn "the public port $PUBLIC_PORT did not answer locally"

AFTER_LISTEN="$(others_listening)"
[ "$BASE_LISTEN" = "$AFTER_LISTEN" ] && say "Everything that was listening before still is: no listener was added or removed besides ours" || warn "listener set differs from before (before: $BASE_LISTEN | after: $AFTER_LISTEN)"
PROTO_AFTER="$(proto_status)"; say "Prototype after: HTTP $PROTO_AFTER (before: $PROTO_BEFORE)"
[ "$PROTO_BEFORE" = "$PROTO_AFTER" ] || warn "the prototype answered differently: check it now"

# Keep the three newest releases.
ls -1dt "$APP_DIR"/releases/*/ | tail -n +4 | xargs -r rm -rf

cat <<DONE

Installed.
  Open        : $PUBLIC_URL     (open TCP port $PUBLIC_PORT in the EC2 security group if you cannot reach it)
  Sign in     : enter ${ADMIN_EMAIL:-the administrator's email}; the one-time code is printed in the log:
                journalctl -u iskcon-saas-api -n 50 --no-pager | grep -B1 "is your"
  Settings    : $ENV_FILE   (set DELIVERY_MODE=live and SMTP_URL to send real email, then: systemctl restart iskcon-saas-api)
  Services    : systemctl status iskcon-saas-api iskcon-saas-web
  Remove all  : sudo bash $HERE/uninstall.sh
DONE
