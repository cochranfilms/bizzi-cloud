#!/usr/bin/env bash
# Canonical SDK runtime root on the worker (see README).
export LD_LIBRARY_PATH="/opt/braw-sdk/BlackmagicRawAPI:${LD_LIBRARY_PATH:-}"
exec /opt/braw-worker/bin/ffmpeg-braw.real "$@"
