/* global contract beforeEach it assert */

const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const { getEventAt } = require('@aragon/test-helpers/events')
const { defaultParams, deployAllAndInitializeApp } = require('./helpers/deployApp')
const Tracker = require('./helpers/stakeTracker')

contract('HCVoting (stake)', ([appManager, voter, staker1, staker2]) => {
  let app, voteToken, stakeToken
  let tracker

  async function itRegistersTheCorrectBalances(proposalId, staker) {
    it('transfers tokens from the user to the app', async () => {
      assert.deepEqual(await stakeToken.balanceOf(staker), tracker.balanceOf[staker], 'invalid user balance')
      assert.deepEqual(await stakeToken.balanceOf(app.address), tracker.balanceOf[app.address], 'invalid app balance')
    })

    it('registers the total stakes in the proposal', async () => {
      assert.deepEqual(await app.getTotalUpstake(proposalId), tracker.proposals[proposalId].totalUpstake, 'invalid upstake')
      assert.deepEqual(await app.getTotalDownstake(proposalId), tracker.proposals[proposalId].totalDownstake, 'invalid downstake')
    })

    it('registers the user\'s stake in the proposal', async () => {
      assert.deepEqual(await app.getUserUpstake(proposalId, staker), tracker.proposals[proposalId].upstakes[staker], 'invalid user upstake')
      assert.deepEqual(await app.getUserDownstake(proposalId, staker), tracker.proposals[proposalId].downstakes[staker], 'invalid user downstake')
    })
  }

  before('deploy app', async () => {
    ({ app, voteToken, stakeToken } = await deployAllAndInitializeApp(appManager))
  })

  before('initialize tracker', async () => {
    tracker = Tracker.initialize(app, voteToken, stakeToken)
  })

  it('reverts when attempting to stake on a proposal that does not exist', async () => {
    await assertRevert(
      app.stake(0, '100e18', true, { from: staker1 }),
      `HCVOTING_PROPOSAL_DOES_NOT_EXIST`
    )
    await assertRevert(
      app.stake(0, '100e18', false, { from: staker1 }),
      `HCVOTING_PROPOSAL_DOES_NOT_EXIST`
    )
  })

    describe('when a proposal exists', () => {
      before('create a proposal', async () => {
        await tracker.propose(0, voter)
      })

      it('reverts when a user with no tokens attempts to stake', async () => {
        await assertRevert(
          app.stake(0, '100e18', true, { from: staker1 }),
          `HCVOTING_TOKEN_TRANSFER_FAILED`
        )
        await assertRevert(
          app.stake(0, '100e18', false, { from: staker1 }),
          `HCVOTING_TOKEN_TRANSFER_FAILED`
        )
      })

      describe('when staker1 has tokens but hasn\'t provided allowance yet', () => {
        before('mint stake tokens', async () => {
          await tracker.mintStakeTokens(staker1, '10000e18')
        })

        it('reverts when a user with tokens but no allowance attempts to stake', async () => {
          await assertRevert(
            app.stake(0, 100, true, { from: staker1 }),
            `HCVOTING_TOKEN_TRANSFER_FAILED`
          )
          await assertRevert(
            app.stake(0, 100, false, { from: staker1 }),
            `HCVOTING_TOKEN_TRANSFER_FAILED`
          )
        })

        describe('when staker1 provides allowance to the app', () => {
          before('provide allowance', async () => {
            await stakeToken.approve(app.address, '10000000e18', { from: staker1 })
          })

          it('reverts when staker1 attempts to stake more tokens than it owns', async () => {
            await assertRevert(
              app.stake(0, '100000000e18', true, { from: staker1 }),
              'HCVOTING_TOKEN_TRANSFER_FAILED'
            )
            await assertRevert(
              app.stake(0, '100000000e18', false, { from: staker1 }),
              'HCVOTING_TOKEN_TRANSFER_FAILED'
            )
          })

          describe('when staker1 upstakes on the proposal', () => {
            let upstakeReceipt

            before('upstake', async () => {
              upstakeReceipt = await tracker.stake(0, staker1, true, '1000e18')
            })

            it('emits a ProposalUpstaked event', async () => {
              const event = getEventAt(upstakeReceipt, 'ProposalUpstaked')
              assert.equal(event.args.proposalId.toNumber(), 0, 'invalid proposal id')
              assert.equal(event.args.staker, staker1, 'invalid staker')
              assert.deepEqual(event.args.amount, web3.toBigNumber('1000e18'), 'invalid stake amount')
            })

            itRegistersTheCorrectBalances(0, staker1)
          })

          describe('when staker1 downstakes on the proposal', () => {
            let downstakeReceipt

            before('downstake', async () => {
              downstakeReceipt = await tracker.stake(0, staker1, false, '100e18')
            })

            it('emits a ProposalDownstaked event', async () => {
              const event = getEventAt(downstakeReceipt, 'ProposalDownstaked')
              assert.equal(event.args.proposalId.toNumber(), 0, 'invalid proposal id')
              assert.equal(event.args.staker, staker1, 'invalid staker')
              assert.deepEqual(event.args.amount, web3.toBigNumber('100e18'), 'invalid stake amount')
            })

            it('reverts when staker1 attempts to withdraw an invalid amount of stake', async () => {
              await assertRevert(
                app.unstake(0, tracker.proposals[0].upstakes[staker1].plus(1), true, { from: staker1 }),
                'HCVOTING_INSUFFICIENT_STAKE'
              )
              await assertRevert(
                app.unstake(0, tracker.proposals[0].downstakes[staker1].plus(1), false, { from: staker1 }),
                'HCVOTING_INSUFFICIENT_STAKE'
              )
            })

            itRegistersTheCorrectBalances(0, staker1)
          })

          describe('when staker1 withdraws upstake from the proposal', () => {
            let withdrawUpstakeReceipt

            before('withdraw upstake', async () => {
              withdrawUpstakeReceipt = await tracker.unstake(0, staker1, true, '100e18')
            })

            it('emits an UpstakeWithdrawn event', async () => {
              const event = getEventAt(withdrawUpstakeReceipt, 'UpstakeWithdrawn')
              assert.equal(event.args.proposalId.toNumber(), 0, 'invalid proposal id')
              assert.equal(event.args.staker, staker1, 'invalid staker')
              assert.deepEqual(event.args.amount, web3.toBigNumber('100e18'), 'invalid stake amount')
            })

            itRegistersTheCorrectBalances(0, staker1)
          })

          describe('when staker1 withdraws downstake from the proposal', () => {
            let withdrawDownstakeReceipt

            before('withdraw downstake', async () => {
              withdrawDownstakeReceipt = await tracker.unstake(0, staker1, false, '100e18')
            })

            it('emits a DownstakeWithdrawn event', async () => {
              const event = getEventAt(withdrawDownstakeReceipt, 'DownstakeWithdrawn')
              assert.equal(event.args.proposalId.toNumber(), 0, 'invalid proposal id')
              assert.equal(event.args.staker, staker1, 'invalid staker')
              assert.deepEqual(event.args.amount, web3.toBigNumber('100e18'), 'invalid stake amount')
            })

            itRegistersTheCorrectBalances(0, staker1)
          })
      })

      describe('when staker2 has tokens and provides allowance to the app', () => {
        before('mint stake tokens', async () => {
          await tracker.mintStakeTokens(staker2, '10000e18')
          await stakeToken.approve(app.address, '10000000e18', { from: staker2 })
        })

        it('reverts when a user that hasn\'t staked attempts to withdraw stake', async () => {
          await assertRevert(
            app.unstake(0, '100e18', true, { from: staker2 }),
            `HCVOTING_INSUFFICIENT_STAKE`
          )
          await assertRevert(
            app.unstake(0, '100e18', false, { from: staker2 }),
            `HCVOTING_INSUFFICIENT_STAKE`
          )
        })

        describe('when staker2 upstakes on the proposal', () => {
          before('upstake', async () => {
            await tracker.stake(0, staker2, true, '1000e18')
          })

          itRegistersTheCorrectBalances(0, staker2)
        })

        describe('when staker2 downstakes on the proposal', () => {
          before('downstake', async () => {
            await tracker.stake(0, staker2, false, '100e18')
          })

          itRegistersTheCorrectBalances(0, staker2)
        })

        describe('when staker2 withdraws upstake from the proposal', () => {
          before('withdraw upstake', async () => {
            await tracker.unstake(0, staker2, true, '100e18')
          })

          itRegistersTheCorrectBalances(0, staker2)
        })

        describe('when staker2 withdraws downstake from the proposal', () => {
          before('withdraw downstake', async () => {
            await tracker.unstake(0, staker2, false, '100e18')
          })

          itRegistersTheCorrectBalances(0, staker2)
        })
      })
    })

    describe('when the proposal is resolved', () => {
      before('resolve proposal', async () => {
        await app.vote(0, true, { from: voter })
        await app.resolve(0)
      })

      it('reverts when staker1 attempts to stake', async () => {
        await assertRevert(
          app.stake(0, 1, true, { from: staker1 }),
          'HCVOTING_PROPOSAL_IS_RESOLVED'
        )
        await assertRevert(
          app.stake(0, 1, false, { from: staker1 }),
          'HCVOTING_PROPOSAL_IS_RESOLVED'
        )
      })

      it('reverts when staker1 attempts to withdraw stake', async () => {
        await assertRevert(
          app.unstake(0, 1, true, { from: staker1 }),
          'HCVOTING_PROPOSAL_IS_RESOLVED'
        )
        await assertRevert(
          app.unstake(0, 1, false, { from: staker1 }),
          'HCVOTING_PROPOSAL_IS_RESOLVED'
        )
      })
    })
  })
})
