const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript')

module.exports = {
  initialize: (app, voteToken, stakeToken) => {
    let balanceOf = {}
    let proposals = {}

    balanceOf[app.address] = 0

    async function create(proposalId, creator) {
      await voteToken.generateTokens(creator, 1)
      await app.create(EMPTY_SCRIPT, `Proposal metadata proposalId`)

      proposals[proposalId] = {
        totalUpstake: 0,
        totalDownstake: 0,
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

    async function stake(proposalId, staker, upstake, amount) {
      initializeUserOnProposal(proposalId, staker)

      const receipt = await app.stake(proposalId, amount, upstake, { from: staker })
      balanceOf[staker] -= amount
      balanceOf[app.address] += amount
      if (upstake) {
        proposals[proposalId].totalUpstake += amount
        proposals[proposalId].upstakes[staker] += amount
      } else {
        proposals[proposalId].totalDownstake += amount
        proposals[proposalId].downstakes[staker] += amount
      }

      return receipt
    }

    async function unstake(proposalId, staker, upstake, amount) {
      const receipt = await app.unstake(proposalId, amount, upstake, { from: staker })
      balanceOf[staker] += amount
      balanceOf[app.address] -= amount
      if (upstake) {
        proposals[proposalId].totalUpstake -= amount
        proposals[proposalId].upstakes[staker] -= amount
      } else {
        proposals[proposalId].totalDownstake -= amount
        proposals[proposalId].downstakes[staker] -= amount
      }

      return receipt
    }

    return {
      balanceOf,
      proposals,
      create,
      mintStakeTokens,
      stake,
      unstake
    }
  }
}
