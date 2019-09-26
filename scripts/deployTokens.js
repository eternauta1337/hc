const MiniMeToken = artifacts.require('@aragon/apps-shared-minime/contracts/MiniMeToken')

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const deployToken = async (name, symbol) => {
  return await MiniMeToken.new(ZERO_ADDRESS, ZERO_ADDRESS, 0, name, 18, symbol, true)
}

module.exports = async callback => {
  const voteToken = await deployToken('VoteToken', 'VOT')
  const stakeToken = await deployToken('StakeToken', 'STK')

  console.log(`vote token`, voteToken.address)
  console.log(`stake token`, stakeToken.address)

  callback()
}
