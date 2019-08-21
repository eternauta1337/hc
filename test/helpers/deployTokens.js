/* global artifacts */

const MiniMeToken = artifacts.require('@aragon/apps-shared-minime/contracts/MiniMeToken')

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const deployVoteToken = async () => {
  voteToken = await MiniMeToken.new(
    ZERO_ADDRESS, // tokenFactory
    ZERO_ADDRESS, // parentToken
    0, // parentSnapShotBlock
    'VoteToken', // tokenName
    18, // decimalUnits
    'VOT', // tokenSymbol
    true // transfersEnabled
  )

  return voteToken
}

module.exports = {
  deployVoteToken
}
