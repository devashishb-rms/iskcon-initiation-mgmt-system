# Parallel deployment on an existing server (no Docker)

Installs the production system **beside** whatever already runs on the server (for example the prototype on a
t3.micro), in its own directory, on its own ports, as its own system user, with its own database. It never stops,
restarts or edits anything that already exists.

```
/opt/iskcon-saas/                 everything of this app
  releases/<version>/{api,web}    unpacked bundles (the three newest are kept)
  current -> releases/<version>   what the services run
  shared/iskcon-saas.env          settings and secrets (root:iskcon-saas, mode 640)
  shared/storage/                 uploaded documents
  node/                           private Node 22 (the server's own Node is not used or changed)
systemd: iskcon-saas-api, iskcon-saas-web      memory-capped, restart on failure
PostgreSQL: new database + role iskcon_saas    other databases untouched
nginx: conf.d/iskcon-saas.conf                 one extra server block on PUBLIC_PORT (only if nginx exists)
```

## What you need

* A Linux x86_64 (or arm64) server with systemd, root access, and outbound internet (Node download, packages).
* A free TCP port for the public address (default **8080**) opened in the EC2 security group. Internal ports
  4100 (API) and 3100 (web) are bound to localhost and need no firewall rule.
* The bundle `iskcon-saas-<version>-linux-x64.tar.gz` and its `.sha256`, built by `build-bundle.sh` or downloaded
  from the repository's Releases page.

A 1 GB machine is enough for the two services plus PostgreSQL (measured: API about 150 MB, web about 80 MB, PostgreSQL
about 60 MB with the small profile), but it is shared with the prototype: use `ADD_SWAP=1`, and look at `free -m`
before and after.

## Install

```bash
# 1. copy the kit and the bundle to the server
scp -r deploy/aws-vm iskcon-saas-*-linux-x64.tar.gz* ec2-user@<server>:~/

# 2. read-only look at the server (changes nothing): ports, memory, what is running
sudo bash ~/aws-vm/preflight.sh

# 3. rehearse: prints the plan, changes nothing
sudo DRY_RUN=1 BUNDLE=~/iskcon-saas-*-linux-x64.tar.gz bash ~/aws-vm/install.sh

# 4. install
sudo ADD_SWAP=1 PROTOTYPE_URL=http://localhost/ \
     ADMIN_NAME="Full Name" ADMIN_EMAIL=you@example.org \
     BUNDLE=~/iskcon-saas-*-linux-x64.tar.gz bash ~/aws-vm/install.sh
```

`PROTOTYPE_URL` (optional) is any URL of the running prototype: the installer checks it before and after and compares
the set of listening ports, and says so if anything differs. The installer also refuses to start if one of its ports
is already used.

Sign in at `http://<server>:8080` with the administrator's email. While `DELIVERY_MODE=console` (the default) the
one-time code is written to the service log instead of being emailed:

```bash
sudo journalctl -u iskcon-saas-api -n 50 --no-pager | grep -B1 "is your"
```

The president and administrator are asked to set up an authenticator app on first sign-in.

## Settings you will want to change

Edit `/opt/iskcon-saas/shared/iskcon-saas.env`, then `sudo systemctl restart iskcon-saas-api`:

| Setting | Why |
| --- | --- |
| `DELIVERY_MODE=live`, `SMTP_URL`, `MAIL_FROM` | Send real email (SES, Gmail SMTP, …) instead of logging codes. |
| `PUBLIC_WEB_URL`, `CORS_ORIGIN`, `COOKIE_SECURE=true` | When you put HTTPS in front (a domain with TLS), update all three. Plain HTTP on a port is fine for trying it out, not for real candidate data. |
| `STORAGE_DRIVER=s3` + `S3_*` | Move documents to a bucket (see `docs/operations.md`). |

## Upgrade, rollback, remove

* **Upgrade:** build or download the newer bundle and run `install.sh` again with it. It unpacks a new release,
  applies migrations, switches `current`, and restarts only its own two services. Settings, database and documents are kept.
* **Rollback:** `sudo ln -sfn /opt/iskcon-saas/releases/<older> /opt/iskcon-saas/current && sudo systemctl restart iskcon-saas-api iskcon-saas-web`
  (migrations only move forward; take a database backup before an upgrade that adds one).
* **Remove:** `sudo bash uninstall.sh` removes the services and the nginx block and keeps the data;
  `--purge-data` also deletes `/opt/iskcon-saas` and the database.
* **Backups:** `sudo -u postgres pg_dump iskcon_saas | gzip > iskcon-$(date +%F).sql.gz` and copy `/opt/iskcon-saas/shared/`
  (settings including `APP_ENCRYPTION_KEY`, and `storage/`).

## How "no impact on the prototype" is kept

| Risk | Guard |
| --- | --- |
| Port clash | Installer aborts before changing anything if any of its three ports is in use. |
| Node version clash | A private Node 22 under `/opt/iskcon-saas/node`; the system Node and global packages are not touched. |
| Memory starvation | systemd `MemoryHigh/MemoryMax` (API 300/400 MB, web 250/320 MB), low CPU weight, optional swap file. |
| Web server breakage | One new server block on its own port, added only if `nginx -t` passes, then a graceful `nginx -s reload`; on failure the block is removed and nothing else changed. Without nginx, the app's own server listens on the port. |
| Database clash | A new database and role; the installer never alters other databases. If it has to install PostgreSQL (none running), that is a separate new service. |
| Files | Everything under `/opt/iskcon-saas`, one system user, two unit files, one nginx file. |

## Building the bundle

`deploy/aws-vm/build-bundle.sh` on a development machine (needs pnpm, Node 22; about two minutes). Do not build on the
small server: the Next.js build needs more memory than a t3.micro has.

## Not verified here

The installer was run end to end on a Linux machine with PostgreSQL, using an unprivileged service user and the real
bundle: migrations, first administrator, both servers, one-time-code sign-in through the public port. Not exercised
because the test machine has neither systemd nor nginx: the two unit files, the nginx block, the swap file, and
installing PostgreSQL from the package manager (Ubuntu/Debian `apt` and Amazon Linux `dnf` paths). Use the
`DRY_RUN=1` rehearsal and `preflight.sh` first; if a step fails, nothing outside `/opt/iskcon-saas` has been changed
beyond what the step list above names.
