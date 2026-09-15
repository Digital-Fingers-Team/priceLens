# nginx upstreams

`web.conf` in this directory names the container currently serving the web app:

```nginx
upstream pricelens_web { server 10.89.1.77:3000; } # pricelens-web-green
```

It is written by `scripts/deploy-web.sh` on every deploy and is **not tracked
in git**. That is deliberate. It previously lived as a literal address inside
`docker/nginx.prod.conf`, which is tracked — so any git operation on the deploy
checkout would either revert the address to a container that no longer exists,
or replace the file by rename and silently detach the proxy's single-file bind
mount. Both took the site down.

If the file is missing, `deploy-web.sh` recreates it. To bootstrap by hand:

```bash
IP=$(podman inspect pricelens-web-green \
  --format '{{.NetworkSettings.Networks.pricelens_external.IPAddress}}')
printf 'upstream pricelens_web { server %s:3000; }\n' "$IP" \
  > docker/nginx-upstreams/web.conf
docker exec pricelens-proxy nginx -s reload
```
