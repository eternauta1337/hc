/* global contract beforeEach it assert */

const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript')
const { getEventAt } = require('@aragon/test-helpers/events')
const { deployAllAndInitializeApp } = require('./helpers/deployApp')

const STAKER_BALANCE = 100
const REQUIRED_SUPPORT_PPM = 510000

contract('HCVoting (stake)', ([appManager, creator, staker1, staker2, staker3]) => {
  let app, stakeToken

  const mintStakeTokens = async (staker) => {
    await stakeToken.generateTokens(staker, STAKER_BALANCE)
    await stakeToken.approve(app.address, 10000000, { from: staker })
  }

  beforeEach('deploy app', async () => {
    ({ app, stakeToken } = await deployAllAndInitializeApp(
      appManager,
      REQUIRED_SUPPORT_PPM
    ))
  })

  it('should reject staking on proposals that do not exist', async () => {
    await assertRevert(
      app.upstake(0, 10, { from: staker1 }),
      `HCVOTING_PROPOSAL_DOES_NOT_EXIST`
    )
    await assertRevert(
      app.downstake(0, 10, { from: staker1 }),
      `HCVOTING_PROPOSAL_DOES_NOT_EXIST`
    )
  })

  describe('when staking on proposals', () => {
    beforeEach('create a proposal', async () => {
      await app.createProposal(EMPTY_SCRIPT, 'Proposal metadata')
    })

    it('should not allow an account to stake more tokens that it holds', async () => {
      await mintStakeTokens(staker1)

      await assertRevert(
        app.upstake(0, 10000, { from: staker1 }),
        `HCVOTING_TOKEN_TRANSFER_FAILED`
      )
      await assertRevert(
        app.downstake(0, 10000, { from: staker1 }),
        `HCVOTING_TOKEN_TRANSFER_FAILED`
      )
    })

    it('should not allow an account to withdraw tokens that it didn\'t stake', async () => {
      await assertRevert(
        app.withdrawUpstake(0, 100, { from: staker1 }),
        `HCVOTING_INSUFFICIENT_STAKE`
      )
      await assertRevert(
        app.withdrawDownstake(0, 100, { from: staker1 }),
        `HCVOTING_INSUFFICIENT_STAKE`
      )
    })

    it('emits events when staking on proposals', async () => {
      await mintStakeTokens(staker1)

      const upstakeReceipt = await app.upstake(0, STAKER_BALANCE / 2, { from: staker1 })
      const upstakeEvent = getEventAt(upstakeReceipt, 'ProposalUpstaked')
      assert.equal(upstakeEvent.args.proposalId.toNumber(), 0, 'invalid proposal id')
      assert.equal(upstakeEvent.args.staker, staker1, 'invalid staker')
      assert.equal(upstakeEvent.args.amount, STAKER_BALANCE / 2, 'invalid stake amount')

      const downstakeReceipt = await app.downstake(0, STAKER_BALANCE / 2, { from: staker1 })
      const downstakeEvent = getEventAt(downstakeReceipt, 'ProposalDownstaked')
      assert.equal(downstakeEvent.args.proposalId.toNumber(), 0, 'invalid proposal id')
      assert.equal(downstakeEvent.args.staker, staker1, 'invalid staker')
      assert.equal(downstakeEvent.args.amount, STAKER_BALANCE / 2, 'invalid stake amount')
    })

    it('emits events when retrieving stake', async () => {
      await mintStakeTokens(staker1)
      await app.upstake(0, STAKER_BALANCE / 2, { from: staker1 })
      await app.downstake(0, STAKER_BALANCE / 2, { from: staker1 })

      const upstakeReceipt = await app.withdrawUpstake(0, STAKER_BALANCE / 2, { from: staker1 })
      const upstakeEvent = getEventAt(upstakeReceipt, 'UpstakeWithdrawn')
      assert.equal(upstakeEvent.args.proposalId.toNumber(), 0, 'invalid proposal id')
      assert.equal(upstakeEvent.args.staker, staker1, 'invalid staker')
      assert.equal(upstakeEvent.args.amount, STAKER_BALANCE / 2, 'invalid stake amount')

      const downstakeReceipt = await app.withdrawDownstake(0, STAKER_BALANCE / 2, { from: staker1 })
      const downstakeEvent = getEventAt(downstakeReceipt, 'DownstakeWithdrawn')
      assert.equal(downstakeEvent.args.proposalId.toNumber(), 0, 'invalid proposal id')
      assert.equal(downstakeEvent.args.staker, staker1, 'invalid staker')
      assert.equal(downstakeEvent.args.amount, STAKER_BALANCE / 2, 'invalid stake amount')
    })

    it('should properly transfer tokens when staking', async () => {
      await mintStakeTokens(staker1)

      await app.upstake(0, STAKER_BALANCE / 2, { from: staker1 })
      assert.equal((await stakeToken.balanceOf(staker1)).toNumber(), STAKER_BALANCE / 2)
      assert.equal((await stakeToken.balanceOf(app.address)).toNumber(), STAKER_BALANCE / 2)

      await app.downstake(0, STAKER_BALANCE / 2, { from: staker1 })
      assert.equal((await stakeToken.balanceOf(staker1)).toNumber(), 0)
      assert.equal((await stakeToken.balanceOf(app.address)).toNumber(), STAKER_BALANCE)
    })

    it('should properly transfer tokens when withdrawing stake', async () => {
      await mintStakeTokens(staker1)

      await app.upstake(0, STAKER_BALANCE / 2, { from: staker1 })
      await app.downstake(0, STAKER_BALANCE / 2, { from: staker1 })

      await app.withdrawUpstake(0, STAKER_BALANCE / 2, { from: staker1 })
      assert.equal((await stakeToken.balanceOf(staker1)).toNumber(), STAKER_BALANCE / 2)
      assert.equal((await stakeToken.balanceOf(app.address)).toNumber(), STAKER_BALANCE / 2)

      await app.withdrawDownstake(0, STAKER_BALANCE / 2, { from: staker1 })
      assert.equal((await stakeToken.balanceOf(staker1)).toNumber(), STAKER_BALANCE)
      assert.equal((await stakeToken.balanceOf(app.address)).toNumber(), 0)
    })

    it('should keep track of a proposal\'s total upstake/downstake', async () => {
      await mintStakeTokens(staker1)
      await mintStakeTokens(staker2)
      await mintStakeTokens(staker3)

      let totalUpstake = 0
      let totalDownstake = 0

      const upstake = async (amount, staker) => {
        await app.upstake(0, amount, { from: staker })
        totalUpstake += amount
      }

      const downstake = async (amount, staker) => {
        await app.downstake(0, amount, { from: staker })
        totalDownstake += amount
      }

      const withdrawUpstake = async (amount, staker) => {
        await app.withdrawUpstake(0, amount, { from: staker })
        totalUpstake -= amount
      }

      const withdrawDownstake = async (amount, staker) => {
        await app.withdrawDownstake(0, amount, { from: staker })
        totalDownstake -= amount
      }

      await upstake(10, staker1)
      await downstake(2, staker1)
      await withdrawUpstake(4, staker1)
      await upstake(80, staker2)
      await downstake(10, staker3)
      await withdrawDownstake(5, staker3)

      const recordedUpstake = await app.getProposalUpstake(0)
      const recordedDownstake = await app.getProposalDownstake(0)

      assert.equal(recordedUpstake.toNumber(), totalUpstake)
      assert.equal(recordedDownstake.toNumber(), totalDownstake)
    })

    it('should keep track of a staker\'s stakes on a proposal', async () => {
      await mintStakeTokens(staker1)

      let totalUpstake = 0
      let totalDownstake = 0

      const upstake = async (amount, staker) => {
        await app.upstake(0, amount, { from: staker })
        totalUpstake += amount
      }

      const downstake = async (amount, staker) => {
        await app.downstake(0, amount, { from: staker })
        totalDownstake += amount
      }

      const withdrawUpstake = async (amount, staker) => {
        await app.withdrawUpstake(0, amount, { from: staker })
        totalUpstake -= amount
      }

      const withdrawDownstake = async (amount, staker) => {
        await app.withdrawDownstake(0, amount, { from: staker })
        totalDownstake -= amount
      }

      await upstake(10, staker1)
      await downstake(2, staker1)
      await withdrawUpstake(4, staker1)
      await upstake(80, staker1)
      await downstake(10, staker1)
      await withdrawDownstake(5, staker1)

      const recordedUpstake = await app.getUpstake(0, staker1)
      const recordedDownstake = await app.getDownstake(0, staker1)

      assert.equal(recordedUpstake.toNumber(), totalUpstake)
      assert.equal(recordedDownstake.toNumber(), totalDownstake)
    })
  })
})
