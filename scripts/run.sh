#!/usr/bin/env bash

# 'ipfs' or 'http'
MODE=$1
echo Running app in MODE: \"$MODE\"

# Exit script as soon as a command fails.
set -o errexit
set -x

# Executes cleanup function at script exit.
trap cleanup EXIT

cleanup() {
  # Kill the RPC instance that we started (if we started one and if it's still running).
  if [ -n "$pid" ] && ps -p $pid > /dev/null; then
    kill -9 $pid
  fi
}

startDevchain() {
  echo Starting devchain...
  npx aragon devchain --verbose > /dev/null &
  pid=$!
  sleep 3
  echo \ \ Running devchain with pid ${pid}
}

deployTokens() {
  echo Deploying tokens...
  STAKE_TOKEN=$(npx truffle exec scripts/deployToken.js 'StakeToken' 'STK' --network rpc | tail -1)
  echo \ \ Stake token: ${STAKE_TOKEN}
}

run() {
  if [ $MODE == 'ipfs' ]
  then runUsingIPFS
  elif [ $MODE == 'http' ]
  then runUsingHTTP
  else
    echo ERROR: Unrecognized mode \"$MODE\". Please specify 'ipfs' or 'http'.
  fi
}

runUsingIPFS() {
  npx aragon run --debug --files dist --template Template --template-init @ARAGON_ENS --template-new-instance newInstance --template-args ${STAKE_TOKEN} --env default
}

runUsingHTTP() {
  npx aragon run --debug --http localhost:8001 --http-served-from ./dist --template Template --template-init @ARAGON_ENS --template-new-instance newInstance --template-args ${STAKE_TOKEN} --env default
}

startDevchain
deployTokens
run
