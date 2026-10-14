#!/usr/bin/env bash
# READ-ONLY report on the server: changes nothing. Run it first, before installing, and keep the output.
#   sudo bash preflight.sh            (works without sudo too, but shows less)
set -uo pipefail
API_PORT="${API_PORT:-4100}"; WEB_PORT="${WEB_PORT:-3100}"; PUBLIC_PORT="${PUBLIC_PORT:-8080}"
say() { printf '%s\n' "$*"; }
hdr() { printf '\n== %s ==\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

hdr "Machine"
. /etc/os-release 2>/dev/null && say "OS: ${PRETTY_NAME:-unknown}"; say "Arch: $(uname -m)"; say "CPUs: $(nproc)"
awk '/MemTotal|MemAvailable|SwapTotal|SwapFree/ {printf "%s %d MB\n",$1,$2/1024}' /proc/meminfo
df -h / | tail -1 | awk '{print "Disk /: "$4" free of "$2" ("$5" used)"}'
have systemctl && say "systemd: yes" || say "systemd: NO (the installer needs it)"

hdr "What is listening now (so we do not collide)"
if have ss; then ss -ltnp 2>/dev/null | awk 'NR==1 || /LISTEN/' ; else say "ss not found"; fi
for p in "$API_PORT" "$WEB_PORT" "$PUBLIC_PORT"; do
  if have ss && ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${p}$"; then say "PORT $p: IN USE  <-- choose another (API_PORT / WEB_PORT / PUBLIC_PORT)"; else say "port $p: free"; fi
done

hdr "Web server"
if have nginx; then say "nginx: $(nginx -v 2>&1)"; grep -n "conf.d\|sites-enabled" /etc/nginx/nginx.conf 2>/dev/null | head -3
  say "listening server blocks:"; grep -rhn "^\s*listen " /etc/nginx/conf.d /etc/nginx/sites-enabled 2>/dev/null | head -10
else say "nginx: not installed"; fi
have apache2 && say "apache2 present"; have httpd && say "httpd present"; have caddy && say "caddy present"

hdr "Existing app processes (the prototype)"
ps -eo pid,user,rss,args --sort=-rss 2>/dev/null | awk 'NR==1 || /node|pm2|gunicorn|uvicorn|python|java|nginx|postgres/ && !/awk/' | head -12 | cut -c1-160
have pm2 && say "pm2 present: $(pm2 -v 2>/dev/null)"
have systemctl && systemctl list-units --type=service --state=running --no-legend 2>/dev/null | awk '{print $1}' | grep -v "^\(systemd\|dbus\|getty\|serial\|user@\|amazon\|ssh\|chrony\|cron\|rsyslog\|polkit\|snap\|acpid\|irqbalance\|multipathd\|udisks\|unattended\|ModemManager\|networkd\|resolved\|cloud\|atd\|lvm\|auditd\|sssd\|gssproxy\|rpc\|libstoragemgmt\)" | head -15

hdr "Runtimes and database"
have node && say "system node: $(node -v)  (left alone; the installer brings its own private Node 22)" || say "system node: none"
if have psql; then say "psql: $(psql --version)"; else say "psql: not installed"; fi
if have pg_lsclusters; then pg_lsclusters 2>/dev/null; fi
have systemctl && systemctl list-units --no-legend 2>/dev/null | awk '{print $1}' | grep -i "postgres\|mysql\|maria" | head
for t in curl tar openssl sudo; do have $t && say "$t: ok" || say "$t: MISSING"; done

hdr "Verdict hints"
MEM=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo); SW=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo)
[ "$MEM" -lt 450 ] && say "- Only ${MEM} MB available: add swap (ADD_SWAP=1 on install) and expect slow starts."
[ "$SW" -eq 0 ] && say "- No swap: strongly recommended on a 1 GB machine (ADD_SWAP=1 creates a 1 GB swap file; it touches nothing else)."
say "- The installer needs ~1.2 GB free disk (Node, bundle, database)."
