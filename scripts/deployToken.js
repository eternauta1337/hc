const MiniMeToken = artifacts.require('@aragon/apps-shared-minime/contracts/MiniMeToken')

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const deployToken = async (name, symbol) => {
  return await MiniMeToken.new(ZERO_ADDRESS, ZERO_ADDRESS, 0, name, 18, symbol, true)
}

module.exports = async callback => {
  const name = process.argv[3]
  const symbol = process.argv[4]

  const token = await deployToken(name, symbol)
  console.log(token.address)
  callback()
}
