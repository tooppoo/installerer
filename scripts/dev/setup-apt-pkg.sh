#!/usr/bin/env sh
set -eu

sudo apt update
sudo apt install just shellcheck -y

just --version
shellcheck --version
