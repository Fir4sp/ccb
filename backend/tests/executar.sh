#!/usr/bin/env bash
# Recria o banco de testes do zero, sobe o servidor PHP e roda os testes de ponta a ponta.
# Requer um MySQL/MariaDB local. Ajuste as variáveis abaixo se precisar.
set -euo pipefail
cd "$(dirname "$0")/.."

export CCB_DB_HOST=${CCB_DB_HOST:-127.0.0.1}
export CCB_DB_NOME=${CCB_DB_NOME:-ccb_test}
export CCB_DB_USUARIO=${CCB_DB_USUARIO:-ccb}
export CCB_DB_SENHA=${CCB_DB_SENHA:-ccb}
export CCB_AMBIENTE=desenvolvimento
PORTA=${PORTA:-8099}

mysql -h"$CCB_DB_HOST" -u"$CCB_DB_USUARIO" -p"$CCB_DB_SENHA" -e \
  "DROP DATABASE IF EXISTS $CCB_DB_NOME; CREATE DATABASE $CCB_DB_NOME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
php bin/migrar.php > /dev/null
php bin/criar_tenant.php --nome="Tenant A" --slug=tenant-a --admin-nome="Admin A" --admin-email=admin@a.test --admin-senha=Senha1234 --grupos="8.1,8.2,8.3,8.4" > /dev/null
php bin/criar_tenant.php --nome="Tenant B" --slug=tenant-b --admin-nome="Admin B" --admin-email=admin@b.test --admin-senha=Senha1234 --grupos="1" > /dev/null

php -S 127.0.0.1:$PORTA tests/roteador_dev.php > /tmp/ccb-servidor.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT
sleep 1

CCB_URL="http://127.0.0.1:$PORTA/api" php tests/testes.php
