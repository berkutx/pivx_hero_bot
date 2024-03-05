cd snapshot
rm PIVXsnapshotLatest.tgz
wget https://snapshot.rockdev.org/PIVXsnapshotLatest.tgz
cd ..
docker compose -f Docker-compose_pivxhero.yml up -d --build --force-recreate --renew-anon-volumes
