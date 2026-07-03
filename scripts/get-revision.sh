#!/usr/bin/env sh

git rev-parse --short HEAD 2>/dev/null || echo unknown
