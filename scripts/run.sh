#!/usr/bin/env bash

# 'ipfs' or 'http'
MODE=$1
echo Running app in MODE: \"$MODE\"

# Exit script as soon as a command fails.
set -o errexit

# Executes cleanup function at script exit.
trap cleanup EXIT

cleanup() {
  # Kill the RPC instance that we started (if we started one and if it's still running).
  if [ -n "$pid" ] && ps -p $pid > /dev/null; then
    kill -9 $pid
  fi
}

startDevchain() {
  echo Starting devchain
  npx aragon devchain --verbose > /dev/null &
  pid=$!
  sleep 3
  echo Running devchain with pid ${pid}
}

deployTokens() {
  echo Deploying tokens
  VOTE_TOKEN=$(npx truffle exec scripts/deployToken.js 'VoteToken' 'VOT' | tail -1)
  STAKE_TOKEN=$(npx truffle exec scripts/deployToken.js 'StakeToken' 'STK' | tail -1)
  echo Vote token: ${VOTE_TOKEN}
  echo Stake token: ${STAKE_TOKEN}
}

prepareAppInitParams() {
  echo Running app with parameters
  REQUIRED_SUPPORT=500000
  QUEUE_PERIOD=864000
  PENDED_PERIOD=3600
  BOOST_PERIOD=21600
  ENDING_PERIOD=1800
  echo Required support: ${REQUIRED_SUPPORT}
  echo Queue period: ${QUEUE_PERIOD}
  echo Pended period: ${PENDED_PERIOD}
  echo Boost period: ${BOOST_PERIOD}
  echo Ending period: ${ENDING_PERIOD}
}

runUsingIPFS() {
  npx aragon run --debug --files dist --app-init-args ${VOTE_TOKEN} ${STAKE_TOKEN} ${REQUIRED_SUPPORT} ${QUEUE_PERIOD} ${PENDED_PERIOD} ${BOOST_PERIOD} ${ENDING_PERIOD}
}

runUsingHTTP() {
  npx aragon run --debug --http localhost:8001 --http-served-from ./dist --app-init-args ${VOTE_TOKEN} ${STAKE_TOKEN} ${REQUIRED_SUPPORT} ${QUEUE_PERIOD} ${PENDED_PERIOD} ${BOOST_PERIOD} ${ENDING_PERIOD}
}

startDevchain
deployTokens
prepareAppInitParams

if [ $MODE == 'ipfs' ]
then
  runUsingIPFS
elif [ $MODE == 'http' ]
then
  runUsingHTTP
else
  echo ERROR: Unrecognized mode \"$MODE\". Please specify 'ipfs' or 'http'.
fi
