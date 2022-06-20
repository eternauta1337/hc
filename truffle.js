module.exports = require('@aragon/os/truffle-config')

module.exports = {
    ...module.exports,
    networks: {
        ...module.exports.networks,
        development: {
          network_id: 15,
          host: 'localhost',
          port: 8545,
          gas: 6.9e6,
          gasPrice: 15000000001,
        },
    },
}
