/* global contract beforeEach it assert */

const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript')
const { getEventAt } = require('@aragon/test-helpers/events')
const { deployAllAndInitializeApp } = require('./helpers/deployApp')

const REQUIRED_SUPPORT_PPM = 510000
const PROPOSAL_DURATION = 24 * 60 * 60
const BOOSTING_DURATION = 1 * 60 * 60
const BOOSTED_DURATION = 6 * 60 * 60

const PROPOSAL_STATE = {
  ACTIVE: '0',
  BOOSTING: '1',
  BOOSTED: '2',
  RESOLVED: '3',
  CLOSED: '4'
}

contract('HCVoting (boost)', ([appManager, voter1, voter2, voter3, staker]) => {
  let app, voteToken, stakeToken

  before('deploy app and mint some vote tokens', async () => {
    ({ app, voteToken, stakeToken } = await deployAllAndInitializeApp(
      appManager,
      REQUIRED_SUPPORT_PPM,
      PROPOSAL_DURATION,
      BOOSTING_DURATION,
      BOOSTED_DURATION
    ))

    await voteToken.generateTokens(voter1, 50)
    await voteToken.generateTokens(voter2, 50)
    await voteToken.generateTokens(voter3, 100)
  })

  describe('when a proposal is staked on without reaching enough confidence', () => {
    let creationDate

    before('create a proposal', async () => {
      creationDate = Math.floor(new Date().getTime() / 1000)
      await app.createProposal(EMPTY_SCRIPT, 'Proposal metadata')
    })

    before('stake on proposal', async () => {
      await stakeToken.generateTokens(staker, 100000)
      await stakeToken.approve(app.address, 10000000, { from: staker })

      await app.upstake(0, 3000, { from: staker })
      await app.downstake(0, 1000, { from: staker })
    })

    it('reports the proposal\'s state as active', async () => {
      assert.equal((await app.getProposalState(0)).toString(), PROPOSAL_STATE.ACTIVE)
    })

    it('correctly calculates the proposal\'s current confidence ratio', async () => {
      assert.equal((await app.getConfidenceRatio(0)).toNumber(), 3000000);
    })

    it('correctly reports that the proposal doesn\'t have enough confidence', async () => {
      assert.equal(await app.hasConfidence(0), false)
    })

    describe('when a proposal reaches enough confidence', () => {
      let boostingDate

      before('stake on proposal so that confidence is reached', async () => {
        boostingDate = Math.floor(new Date().getTime() / 1000)
        await app.upstake(0, 1000, { from: staker })
      })

      it('correctly reports that the proposal has enough confidence', async () => {
        assert.equal(await app.hasConfidence(0), true)
      })

      it('sets the proposal\'s state to boosting', async () => {
        assert.equal((await app.getProposalState(0)).toString(), PROPOSAL_STATE.BOOSTING)
      })

      it('sets the proposal\'s boostingDate', async () => {
        assert.equal((await app.getProposalBoostingDate(0)).toNumber(), boostingDate)
      })

      describe('when a proposal looses confidence', () => {
        before('withdraw stake', async () => {
          await app.withdrawUpstake(0, 1000, { from: staker })
        })

        it('sets the proposal\'s state back to active', async () => {
          assert.equal((await app.getProposalState(0)).toString(), PROPOSAL_STATE.ACTIVE)
        })

        it('sets the proposal\'s boosting date back to zero', async () => {
          assert.equal((await app.getProposalBoostingDate(0)).toNumber(), 0)
        })

        after('restore stake', async () => {
          boostingDate = Math.floor(new Date().getTime() / 1000)
          await app.upstake(0, 1000, { from: staker })
        })
      })

      describe('when the proposal\'s lifetime expires', () => {
        before('shift time to past the proposal period', async () => {
          await app.mockSetTimestamp(creationDate + PROPOSAL_DURATION + 1)
        })

        it('reports the proposal\'s state as closed', async () => {
          assert.equal((await app.getProposalState(0)).toString(), PROPOSAL_STATE.CLOSED)
        })

        it('reverts when trying to boost the proposal', async () => {
          await assertRevert(
            app.boostProposal(0),
            'HCVOTING_PROPOSAL_IS_CLOSED'
          )
        })
      })

      describe('when half of the boosting period has elapsed', () => {
        before('shift time to half the boosting period', async () => {
          await app.mockSetTimestamp(creationDate + BOOSTING_DURATION / 2)
        })

        it('reports that the proposal has not yet maintained confidence', async () => {
          assert.equal(await app.hasMaintainedConfidence(0), false)
        })

        it('reverts when trying to boost the proposal', async () => {
          await assertRevert(
            app.boostProposal(0),
            'HCVOTING_ON_BOOSTING_PERIOD'
          )
        })

        describe('when the boosting period has elapsed', () => {
          before('shift time to past the boosting period', async () => {
            await app.mockSetTimestamp(creationDate + BOOSTING_DURATION + 1)
          })

          it('reports that the proposal has maintained confidence', async () => {
            assert.equal(await app.hasMaintainedConfidence(0), true)
          })

          describe('when boosting the proposal', () => {
            let boostReceipt

            before('boost the proposal', async () => {
              boostReceipt = await app.boostProposal(0)
            })

            it('reverts when trying to boost the proposal again', async () => {
              await assertRevert(
                app.boostProposal(0),
                'HCVOTING_PROPOSAL_IS_BOOSTED'
              )
            })

            it('reports the proposal\'s state as boosted', async () => {
              assert.equal((await app.getProposalState(0)).toString(), PROPOSAL_STATE.BOOSTED)
            })

            it('emits a ProposalBoosted event', async () => {
              const boostEvent = getEventAt(boostReceipt, 'ProposalBoosted')
              assert.equal(boostEvent.args.proposalId.toNumber(), 0, 'invalid proposal id')
            })

            it('modifies the proposal\'s closeDate', async () => {
              assert.equal((await app.getProposalCloseDate(0)).toNumber(), creationDate + BOOSTED_DURATION)
            })

            describe('when half the boost period has elapsed', () => {
              before('shift time to half the boost period', async () => {
                await app.mockSetTimestamp(creationDate + BOOSTING_DURATION + BOOSTED_DURATION / 2)
              })

              before('vote on proposal avoiding absolute support', async () => {
                await app.vote(0, true, { from: voter1 })
              })

              it('reverts when trying to execute the proposal with relative support before the boost period elapses', async () => {
                await assertRevert(
                  app.executeProposal(0),
                  'HCVOTING_ON_BOOST_PERIOD'
                )
              })

              describe('when the boost period has elapsed', () => {
                before('shift time to past the boost period', async () => {
                  await app.mockSetTimestamp(creationDate + BOOSTING_DURATION + BOOSTED_DURATION + 1)
                })

                it('can execute the proposal with relative support', async () => {
                  await app.executeProposal(0)
                  assert.equal((await app.getProposalState(0)).toString(), PROPOSAL_STATE.RESOLVED)
                })
              })
            })
          })
        })
      })
    })
  })
})
