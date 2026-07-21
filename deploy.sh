#!/usr/bin/env bash
#
# ABID AK Contracting — Expense Management deployment helper.
# Usage:
#   ./deploy.sh up          Build images and start the full stack (nginx + frontend + backend)
#   ./deploy.sh ssl         Obtain/renew a Let's Encrypt certificate and enable HTTPS
#   ./deploy.sh down        Stop and remove containers
#   ./deploy.sh restart     Restart the stack
#   ./deploy.sh logs [svc]  Tail logs (optionally for one service)
#   ./deploy.sh status      Show container status
#
set -euo pipefail

cd "$(dirname "$0")"
BLUE='\033[0;34m'; ORANGE='\033[0;33m'; GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
say()  { echo -e "${BLUE}▸ $*${NC}"; }
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
warn() { echo -e "${ORANGE}! $*${NC}"; }
die()  { echo -e "${RED}✗ $*${NC}" >&2; exit 1; }

# --- pick docker compose command ---
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  die "Docker Compose is not installed."
fi

# --- load env ---
[ -f .env ] || { cp .env.example .env; warn "Created .env from template — review it."; }
set -a; . ./.env; set +a
DOMAIN="${DOMAIN:-samimreza.me}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-admin@${DOMAIN}}"

preflight() {
  command -v docker >/dev/null 2>&1 || die "Docker is not installed."
  [ -f backend/.env ] || { cp backend/.env.example backend/.env; die "backend/.env was missing — created from example. Fill in Supabase credentials and re-run."; }
  ok "Preflight checks passed."
}

cmd_up() {
  preflight
  say "Building images (this can take a few minutes the first time)…"
  $DC build
  say "Starting the stack…"
  $DC up -d
  echo
  ok "ABID AK is up."
  echo -e "   App:      ${ORANGE}http://${DOMAIN}${NC}  (run './deploy.sh ssl' for HTTPS)"
  echo -e "   API docs: ${ORANGE}http://${DOMAIN}/docs${NC}"
  echo -e "   Login:    admin / abidak2024  (change after first login)"
  $DC ps
}

cmd_ssl() {
  preflight
  say "Requesting Let's Encrypt certificate for ${DOMAIN}…"
  mkdir -p deploy/certbot/www deploy/certbot/conf
  # ensure HTTP config is active so the ACME challenge is reachable
  $DC up -d nginx
  docker run --rm \
    -v "$(pwd)/deploy/certbot/conf:/etc/letsencrypt" \
    -v "$(pwd)/deploy/certbot/www:/var/www/certbot" \
    certbot/certbot certonly --webroot -w /var/www/certbot \
    -d "${DOMAIN}" -d "www.${DOMAIN}" \
    --email "${CERTBOT_EMAIL}" --agree-tos --no-eff-email --non-interactive \
    || die "Certificate issuance failed. Check that ${DOMAIN} points to this server and port 80 is open."
  say "Enabling HTTPS config…"
  cp deploy/nginx.ssl.conf deploy/nginx.conf.active 2>/dev/null || true
  cp deploy/nginx.ssl.conf deploy/nginx.conf
  $DC restart nginx
  ok "HTTPS enabled → https://${DOMAIN}"
  warn "Tip: add a cron job to run './deploy.sh renew' monthly."
}

cmd_renew() {
  docker run --rm \
    -v "$(pwd)/deploy/certbot/conf:/etc/letsencrypt" \
    -v "$(pwd)/deploy/certbot/www:/var/www/certbot" \
    certbot/certbot renew --webroot -w /var/www/certbot
  $DC restart nginx
  ok "Certificates renewed."
}

case "${1:-up}" in
  up|deploy) cmd_up ;;
  ssl)       cmd_ssl ;;
  renew)     cmd_renew ;;
  down)      $DC down; ok "Stopped." ;;
  restart)   $DC restart; ok "Restarted." ;;
  build)     $DC build ;;
  logs)      $DC logs -f --tail=120 ${2:-} ;;
  status|ps) $DC ps ;;
  *) echo "Usage: ./deploy.sh {up|ssl|renew|down|restart|logs|status}"; exit 1 ;;
esac
