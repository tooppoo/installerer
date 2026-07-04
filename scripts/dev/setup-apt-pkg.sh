#!/usr/bin/env sh
set -eu

sudo apt update
sudo apt upgrade -y
sudo apt install just=1.40.0-1+b1 shellcheck=0.10.0-1 -y
