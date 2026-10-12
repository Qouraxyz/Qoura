#!/usr/bin/env bash
# Fetches forge-std and OpenZeppelin Contracts into contracts/lib (not committed).
# Run once before `forge build` / `forge test`.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p lib
if [ ! -d lib/forge-std/src ]; then
  curl -sL https://github.com/foundry-rs/forge-std/archive/refs/tags/v1.9.4.tar.gz | tar xz -C lib
  mv lib/forge-std-1.9.4 lib/forge-std
fi
if [ ! -d lib/openzeppelin-contracts/contracts ]; then
  curl -sL https://github.com/OpenZeppelin/openzeppelin-contracts/archive/refs/tags/v5.1.0.tar.gz | tar xz -C lib
  mv lib/openzeppelin-contracts-5.1.0 lib/openzeppelin-contracts
fi
echo "forge-std and OpenZeppelin Contracts 5.1.0 ready"
