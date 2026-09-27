# nginx upstreams

`web.conf` in this directory names the web colour currently serving the site
and its fixed loopback port (blue 3010, green 3011):

```nginx
upstream pricelens_web { server 127.0.0.1:3011; } # pricelens-web-green
```

It is written by `scripts/deploy-web.sh` on every deploy and is **not tracked
in git**. That is deliberate. It previously lived as a literal address inside
`docker/nginx.prod.conf`, which is tracked — so any git operation on the deploy
checkout would either revert the address to a container that no longer exists,
or replace the file by rename and silently detach the proxy's single-file bind
mount. Both took the site down.

The proxy runs in the host's network namespace (D-31), so upstreams here must
be host addresses (`127.0.0.1:<port>`), never container names or podman
network IPs.

If the file is missing, `deploy-web.sh` recreates it. To bootstrap by hand
(truncate in place, never replace the file):

```bash
printf 'upstream pricelens_web { server 127.0.0.1:3011; } # pricelens-web-green\n' \
  > docker/nginx-upstreams/web.conf
docker exec pricelens-proxy nginx -t && docker exec pricelens-proxy nginx -s reload
```
