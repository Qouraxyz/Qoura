#!/usr/bin/env bash
# Rebuilds the redeem circuit, its Solidity verifier and the browser artifact.
# Needs nargo 1.0.0-beta.22 and bb 5.0.0-nightly.20260522 (the versions bb.js and noir_js in package.json match).
#   ~/.nargo/bin/nargo, ~/.bb/bb (or on PATH)
# With --check it only reports whether the committed files match a fresh build.
set -euo pipefail
cd "$(dirname "$0")/redeem"
NARGO="$(command -v nargo || echo ~/.nargo/bin/nargo)"
BB="$(command -v bb || echo ~/.bb/bb)"
"$NARGO" --version | head -1
"$BB" --version
"$NARGO" test
"$NARGO" compile
"$BB" write_vk -b target/redeem.json -o target -t evm
"$BB" write_solidity_verifier -k target/vk -o target/generated-verifier.sol -t evm
# bb names every verifier the same; give this project's contracts their own names.
sed -E -f ../verifier-names.sed target/generated-verifier.sol > target/QouraRedeemCheck.sol
if grep -nE '[[:<:]](Honk|ZKTranscript|Relations|FrLib|IVerifier|Errors)[A-Za-z]*[[:>:]]' target/QouraRedeemCheck.sol | grep -v 'Qoura' | head -3 | grep -q .; then
  echo "verifier still carries generic names; extend circuits/verifier-names.sed" >&2
  exit 1
fi
if [ "${1:-}" = "--check" ]; then
  cmp target/QouraRedeemCheck.sol ../../contracts/src/QouraRedeemCheck.sol && echo "verifier matches"
  node -e 'const a=require("./target/redeem.json"),b=require("../../public/zk/redeem.json");process.exit(a.bytecode===b.bytecode?0:1)' && echo "circuit artifact matches"
else
  cp target/QouraRedeemCheck.sol ../../contracts/src/QouraRedeemCheck.sol
  # Ship only what provers need; debug symbols and the file map carry local paths.
  node -e 'const j=require("./target/redeem.json");const o={noir_version:j.noir_version,hash:j.hash,abi:j.abi,bytecode:j.bytecode};require("fs").writeFileSync("../../public/zk/redeem.json",JSON.stringify(o))'
  echo "verifier and artifact updated"
fi
