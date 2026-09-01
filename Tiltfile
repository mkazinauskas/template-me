# Local dev with auto-refresh, on top of the same docker-compose.yml setup
# used by `docker compose up` (see README's "Running locally with Docker
# Compose" section for prerequisites, e.g. .env.docker).
#
# Usage:
#   tilt up
#
# Unlike `docker compose up`, the `app` service here runs `next dev`
# (Dockerfile.dev) instead of a production build. Tilt live-syncs changes to
# `src`/`public` straight into the running container — no image rebuild — and
# Next's own Turbopack watcher picks them up and refreshes the browser.
# Everything else (package.json, Dockerfile.dev, config files, ...) falls
# back to a normal image rebuild, since those need a fresh `npm ci` / process
# restart anyway.

docker_compose(['docker-compose.yml', 'docker-compose.dev.yml'])

docker_build(
    'template-me-app',
    context='.',
    dockerfile='Dockerfile.dev',
    only=['package.json', 'package-lock.json', 'src', 'public'],
    live_update=[
        sync('src', '/app/src'),
        sync('public', '/app/public'),
    ],
)

dc_resource('db', labels=['app'])
dc_resource('migrate', labels=['app'])
dc_resource('app', labels=['app'])
