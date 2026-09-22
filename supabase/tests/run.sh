#!/bin/bash
#
# Applies the migrations and seed to a throwaway local Postgres and runs
# supabase/tests/checks.sql against it — scoring, the lock, and the RLS
# privacy rules, which are easy to get subtly wrong and impossible to
# verify by reading.
#
# Needs a local Postgres 15+ (`initdb`/`pg_ctl` on PATH). It never touches
# the real Supabase project.
#
#   ./supabase/tests/run.sh
#
set -e

DATA_DIR=${PGTEST_DATA_DIR:-/var/tmp/mlbplayoffs-pgtest}
PORT=${PGTEST_PORT:-55432}
SOCKET_DIR=${PGTEST_SOCKET_DIR:-/var/tmp}
DB=mlbplayoffs_test
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL="psql -h $SOCKET_DIR -p $PORT -U postgres"

if ! pg_ctl -D "$DATA_DIR" status >/dev/null 2>&1; then
  [ -d "$DATA_DIR/base" ] || initdb -D "$DATA_DIR" -U postgres --auth=trust >/dev/null
  pg_ctl -D "$DATA_DIR" -o "-k $SOCKET_DIR -p $PORT -c listen_addresses=" -l "$DATA_DIR/log" start
  sleep 2
fi

$PSQL -q -c "drop database if exists $DB;" -c "create database $DB;"
for f in "$REPO"/supabase/tests/supabase_stub.sql \
         "$REPO"/supabase/migrations/*.sql \
         "$REPO"/supabase/seed.sql; do
  $PSQL -d "$DB" -q -v ON_ERROR_STOP=1 -f "$f"
done

$PSQL -d "$DB" -v ON_ERROR_STOP=1 -f "$REPO"/supabase/tests/checks.sql 2>&1 \
  | grep -E "NOTICE|ERROR|PASSED" | sed 's/^.*NOTICE:  //'
