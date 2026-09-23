set -eu
PGDATA="${PGDATA:-/var/lib/postgresql/data}"
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  find "$PGDATA" -mindepth 1 -delete
  until pg_basebackup -h postgres -p 5432 -U replicator -D "$PGDATA" -Fp -Xs -P -R; do
    echo "waiting for primary to accept replication"
    sleep 3
  done
  chown -R postgres:postgres "$PGDATA"
  chmod 700 "$PGDATA"
fi
exec gosu postgres postgres -c hot_standby=on
