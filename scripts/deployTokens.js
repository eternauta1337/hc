const MiniMeToken = artifacts.require('@aragon/apps-shared-minime/contracts/MiniMeToken')

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const deployToken = async (name, symbol) => {
  const token = await MiniMeToken.new(
    ZERO_ADDRESS, // tokenFactory
    ZERO_ADDRESS, // parentToken
    0, // parentSnapShotBlock
    'VoteToken', // tokenName
    18, // decimalUnits
    'VOT', // tokenSymbol
    true // transfersEnabled
  )

  return token
}

module.exports = async callback => {
  const voteToken = await deployToken('VoteToken', 'VOT')
  const stakeToken = await deployToken('StakeToken', 'STK')

  console.log(`vote token`, voteToken.address)
  console.log(`stake token`, stakeToken.address)

  callback()
}
