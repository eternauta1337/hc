const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript')

module.exports = {
  initialize: (app, voteToken, stakeToken) => {
    let balanceOf = {}
    let proposals = {}

    balanceOf[app.address] = 0

    async function createProposal(proposalId, creator) {
      await voteToken.generateTokens(creator, 1)
      await app.createProposal(EMPTY_SCRIPT, `Proposal metadata proposalId`)

      proposals[proposalId] = {
        upstake: 0,
        downstake: 0,
        upstakes: {},
        downstakes: {}
      }
    }

    function initializeUserOnProposal(proposalId, staker) {
      if (!proposals[proposalId].upstakes[staker]) {
        proposal = proposals[proposalId]
        proposal.upstakes[staker] = 0
        proposal.downstakes[staker] = 0
      }
    }

    async function mintStakeTokens(staker, amount) {
      await stakeToken.generateTokens(staker, amount)
      balanceOf[staker] = balanceOf[staker] ? balanceOf[staker] + amount : amount
    }

    async function upstake(proposalId, staker, amount) {
      initializeUserOnProposal(proposalId, staker)

      const receipt = await app.upstake(proposalId, amount, { from: staker })
      balanceOf[staker] -= amount
      balanceOf[app.address] += amount
      proposals[proposalId].upstake += amount
      proposals[proposalId].upstakes[staker] += amount

      return receipt
    }

    async function downstake(proposalId, staker, amount) {
      initializeUserOnProposal(proposalId, staker)

      const receipt = await app.downstake(proposalId, amount, { from: staker })
      balanceOf[staker] -= amount
      balanceOf[app.address] += amount
      proposals[proposalId].downstake += amount
      proposals[proposalId].downstakes[staker] += amount

      return receipt
    }

    async function withdrawUpstake(proposalId, staker, amount) {
      const receipt = await app.withdrawUpstake(proposalId, amount, { from: staker })
      balanceOf[staker] += amount
      balanceOf[app.address] -= amount
      proposals[proposalId].upstake -= amount
      proposals[proposalId].upstakes[staker] -= amount

      return receipt
    }

    async function withdrawDownstake(proposalId, staker, amount) {
      const receipt = await app.withdrawDownstake(proposalId, amount, { from: staker })
      balanceOf[staker] += amount
      balanceOf[app.address] -= amount
      proposals[proposalId].downstake -= amount
      proposals[proposalId].downstakes[staker] -= amount

      return receipt
    }

    return {
      balanceOf,
      proposals,
      createProposal,
      mintStakeTokens,
      upstake,
      downstake,
      withdrawUpstake,
      withdrawDownstake
    }
  }
}
