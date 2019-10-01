/* global contract beforeEach it assert */

const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript')
const { deployAllAndInitializeApp } = require('./helpers/deployApp')

contract('HCVoting (withdraw)', ([appManager, voter, winner1, winner2, looser]) => {
  let app, voteToken, stakeToken

  before('deploy app and mint tokens', async () => {
    ({ app, voteToken, stakeToken } = await deployAllAndInitializeApp(appManager))

    await voteToken.generateTokens(voter, 1)

    await stakeToken.generateTokens(winner1, '10000e18')
    await stakeToken.generateTokens(winner2, '10000e18')
    await stakeToken.generateTokens(looser, '10000e18')

    await stakeToken.approve(app.address, '1000000e18', { from: winner1 })
    await stakeToken.approve(app.address, '1000000e18', { from: winner2 })
    await stakeToken.approve(app.address, '1000000e18', { from: looser })
  })

  async function itHandlesRewardsProperly(proposalId, bet) {
    it('reverts when stakers try to withdraw stake', async () => {
      await assertRevert(
        app.unstake(proposalId, 1, true, { from: winner1 }),
        'HCVOTING_PROPOSAL_IS_RESOLVED'
      )
      await assertRevert(
        app.unstake(proposalId, 1, true, { from: winner1 }),
        'HCVOTING_PROPOSAL_IS_RESOLVED'
      )
    })

    it('reverts when the looser attempts to withdraw rewards', async () => {
      await assertRevert(
        app.withdraw(proposalId, { from: looser }),
        'HCVOTING_NO_WINNING_STAKE'
      )
    })

    it('allows winner1 to withdraw rewards', async () => {
      const initBalance = await stakeToken.balanceOf(winner1)
      await app.withdraw(proposalId, { from: winner1 })
      assert.deepEqual(await stakeToken.balanceOf(winner1), initBalance.plus(bet.mul(1.5)))
    })

    it('allows winner2 to withdraw rewards', async () => {
      const initBalance = await stakeToken.balanceOf(winner2)
      await app.withdraw(proposalId, { from: winner2 })
      assert.deepEqual(await stakeToken.balanceOf(winner2), initBalance.plus(bet.mul(1.5)))
    })
  }

  const BET = web3.toBigNumber('1000e18')

  describe('when a proposal is resolved positively', () => {
    before('create proposal', async () => {
      await app.propose(EMPTY_SCRIPT, 'Proposal metadata')
    })

    describe('when the proposal is staked on', () => {
      before('stake on proposal', async () => {
        await app.stake(0, BET, true, { from: winner1 })
        await app.stake(0, BET, true, { from: winner2 })
        await app.stake(0, BET, false, { from: winner1 })
      })

      describe('when the proposal is resolved', () => {
        before('vote on proposal', async () => {
          await app.vote(0, true, { from: voter })
          await app.resolve(0)
        })

        itHandlesRewardsProperly(0, BET)

        describe('when a proposal is resolved negatively', () => {
          before('create proposal', async () => {
            await app.propose(EMPTY_SCRIPT, 'Proposal metadata')
          })

          describe('when the proposal is staked on', () => {
            before('stake on proposal', async () => {
              await app.stake(1, BET, true, { from: looser })
              await app.stake(1, BET, false, { from: winner1 })
              await app.stake(1, BET, false, { from: winner2 })
            })

            describe('when the proposal is resolved', () => {
              before('vote on proposal', async () => {
                await app.vote(1, false, { from: voter })
                await app.resolve(1)
              })

              itHandlesRewardsProperly(1, BET)
            })
          })
        })
      })
    })
  })
})
