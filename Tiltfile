# Local dev with auto-refresh, layered on docker-compose.yml.
#
#   tilt up
#
# The `app` service runs `next dev` (Dockerfile.dev). Tilt live-syncs
# src/ and public/ straight into the running container and Turbopack
# refreshes the browser; any other change rebuilds the image. The build
# context is whatever `.dockerignore` doesn't exclude — no second list to
# keep in sync.

docker_compose('docker-compose.yml')

docker_build(
    'template-me-app',
    context='.',
    dockerfile='Dockerfile.dev',
    live_update=[
        sync('src', '/app/src'),
        sync('public', '/app/public'),
    ],
)
