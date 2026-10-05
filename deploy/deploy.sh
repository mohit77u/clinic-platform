#!/usr/bin/env bash
# Pull-based deploy on the VPS. Order matters: back up -> migrate -> restart. Rollback = checkout previous tag, rebuild, `migration:revert` only if the new migration was destructive.
set -euo pipefail
cd /srv/clinic-platform
git pull --ff-only
( cd backend && npm ci && ./scripts/backup.sh && npm run migration:run && npm run build )
( cd frontend && npm ci && npm run build )
sudo systemctl restart clinic-api clinic-web
sleep 3 && curl -fsS http://127.0.0.1:3001/health && echo " api ok"
