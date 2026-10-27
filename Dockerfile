# The sandbox image. Sandbox commands run here, not in the Worker.
# The donor stage supplies sandbox-shim, the helper that file operations run.
# Keep its tag equal to the installed @cloudflare/sandbox version.
ARG SANDBOX_TOOLS_IMAGE=docker.io/cloudflare/sandbox:1.0.3

FROM ${SANDBOX_TOOLS_IMAGE} AS sandbox-tools

FROM alpine:3.24
COPY --from=sandbox-tools /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim
RUN mkdir -p /workspace
WORKDIR /workspace
CMD ["sleep", "infinity"]
