const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript')
const { BIG_ZERO } = require('./deployApp.js')

module.exports = {
  initialize: (app, voteToken, stakeToken) => {
    let balanceOf = {}
    let proposals = {}

    balanceOf[app.address] = BIG_ZERO

    async function propose(proposalId, creator) {
      await voteToken.generateTokens(creator, 1)
      await app.propose(EMPTY_SCRIPT, `Proposal metadata proposalId`)

      proposals[proposalId] = {
        totalUpstake: BIG_ZERO,
        totalDownstake: BIG_ZERO,
        upstakes: {},
        downstakes: {}
      }
    }

    function initializeUserOnProposal(proposalId, staker) {
      if (!proposals[proposalId].upstakes[staker]) {
        proposal = proposals[proposalId]
        proposal.upstakes[staker] = BIG_ZERO
        proposal.downstakes[staker] = BIG_ZERO
      }
    }

    async function mintStakeTokens(staker, amount) {
      await stakeToken.generateTokens(staker, amount)
      balanceOf[staker] = balanceOf[staker] ? balanceOf[staker].plus(amount) : web3.toBigNumber(amount)
    }

    async function stake(proposalId, staker, upstake, amount) {
      initializeUserOnProposal(proposalId, staker)

      const receipt = await app.stake(proposalId, amount, upstake, { from: staker })
      balanceOf[staker] = balanceOf[staker].minus(amount)
      balanceOf[app.address] = balanceOf[app.address].plus(amount)
      if (upstake) {
        proposals[proposalId].totalUpstake = proposals[proposalId].totalUpstake.plus(amount)
        proposals[proposalId].upstakes[staker] = proposals[proposalId].upstakes[staker].plus(amount)
      } else {
        proposals[proposalId].totalDownstake = proposals[proposalId].totalDownstake.plus(amount)
        proposals[proposalId].downstakes[staker] = proposals[proposalId].downstakes[staker].plus(amount)
      }

      return receipt
    }

    async function unstake(proposalId, staker, upstake, amount) {
      const receipt = await app.unstake(proposalId, amount, upstake, { from: staker })
      balanceOf[staker] = balanceOf[staker].plus(amount)
      balanceOf[app.address] = balanceOf[app.address].minus(amount)
      if (upstake) {
        proposals[proposalId].totalUpstake = proposals[proposalId].totalUpstake.minus(amount)
        proposals[proposalId].upstakes[staker] = proposals[proposalId].upstakes[staker].minus(amount)
      } else {
        proposals[proposalId].totalDownstake = proposals[proposalId].totalDownstake.minus(amount)
        proposals[proposalId].downstakes[staker] = proposals[proposalId].downstakes[staker].minus(amount)
      }

      return receipt
    }

    return {
      balanceOf,
      proposals,
      propose,
      mintStakeTokens,
      stake,
      unstake
    }
  }
}
