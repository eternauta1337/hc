/* global contract beforeEach it assert */

const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript')
const { defaultParams, deployAllAndInitializeApp, PROPOSAL_STATE } = require('./helpers/deployApp')

contract('HCVoting (multiboost)', ([appManager, voter, staker]) => {
  let app, voteToken, stakeToken
  let proposalId

  function itCountsTheCorrectNumberOfBoostedProposals(numProposals, numBoostedProposals) {
    it('tracks the correct number of proposals', async () => {
      assert.equal((await app.numProposals()).toNumber(), numProposals)
    })

    it('tracks the correct number of boosted proposals', async () => {
      assert.equal((await app.numBoostedProposals()).toNumber(), numBoostedProposals)
    })
  }

  function itPendsTheProposalWithAMinimumStakeOf(minimumStake) {
    it('does not pend the proposal with less than the minimumStake', async () => {
      await app.stake(proposalId, minimumStake - 1, true, { from: staker })
      assert.equal((await app.getState(proposalId)).toNumber(), PROPOSAL_STATE.QUEUED)
    })

    it('pends the proposal when the minimumStake is reached', async () => {
      await app.stake(proposalId, 1, true, { from: staker })
      assert.equal((await app.getState(proposalId)).toNumber(), PROPOSAL_STATE.PENDED)
    })
  }

  before('deploy app and mint some tokens', async () => {
    ({ app, voteToken, stakeToken } = await deployAllAndInitializeApp(appManager))

    await voteToken.generateTokens(voter, 1)

    await stakeToken.generateTokens(staker, 10000)
    await stakeToken.approve(app.address, 100000000, { from: staker })
  })

  describe('when proposal 1 is created', () => {
    before('create proposal', async () => {
      await app.propose(EMPTY_SCRIPT, 'Proposal metadata')
      proposalId = (await app.numProposals()).toNumber() - 1
    })

    itPendsTheProposalWithAMinimumStakeOf(4 ** 1)

    describe('when proposal 1 is boosted', () => {
      before('boost proposal', async () => {
        const pendedDate = (await app.getPendedDate(proposalId)).toNumber()
        await app.mockSetTimestamp(pendedDate + defaultParams.pendedPeriod + 1)
        await app.boost(proposalId)
      })

      itCountsTheCorrectNumberOfBoostedProposals(1, 1)

      describe('when proposal 2 is created', () => {
        before('create proposal', async () => {
          await app.propose(EMPTY_SCRIPT, 'Proposal metadata')
          proposalId = (await app.numProposals()).toNumber() - 1
        })

        itPendsTheProposalWithAMinimumStakeOf(4 ** 2)

        describe('when proposal 2 is boosted', () => {
          before('boost proposal', async () => {
            const pendedDate = (await app.getPendedDate(proposalId)).toNumber()
            await app.mockSetTimestamp(pendedDate + defaultParams.pendedPeriod + 1)
            await app.boost(proposalId)
          })

          itCountsTheCorrectNumberOfBoostedProposals(2, 2)

          describe('when proposal 3 is created', () => {
            before('create proposal', async () => {
              await app.propose(EMPTY_SCRIPT, 'Proposal metadata')
              proposalId = (await app.numProposals()).toNumber() - 1
            })

            itPendsTheProposalWithAMinimumStakeOf(4 ** 3)

            describe('when proposal 3 is boosted', () => {
              before('boost proposal', async () => {
                const pendedDate = (await app.getPendedDate(proposalId)).toNumber()
                await app.mockSetTimestamp(pendedDate + defaultParams.pendedPeriod + 1)
                await app.boost(proposalId)
              })

              itCountsTheCorrectNumberOfBoostedProposals(3, 3)

              describe('when proposal 4 is created', () => {
                before('create proposal', async () => {
                  await app.propose(EMPTY_SCRIPT, 'Proposal metadata')
                  proposalId = (await app.numProposals()).toNumber() - 1
                })

                itPendsTheProposalWithAMinimumStakeOf(4 ** 4)

                describe('when proposal 4 is boosted', () => {
                  before('boost proposal', async () => {
                    const pendedDate = (await app.getPendedDate(proposalId)).toNumber()
                    await app.mockSetTimestamp(pendedDate + defaultParams.pendedPeriod + 1)
                    await app.boost(proposalId)
                  })

                  itCountsTheCorrectNumberOfBoostedProposals(4, 4)

                  describe('when proposal 4 is resolved', () => {
                    before('resolve proposal', async () => {
                      await app.vote(proposalId, true, { from: voter })
                      await app.resolve(proposalId)
                    })

                    it('sets the proposal state to Resolved', async () => {
                      assert.equal((await app.getState(proposalId)).toNumber(), PROPOSAL_STATE.RESOLVED)
                    })

                    itCountsTheCorrectNumberOfBoostedProposals(4, 3)
                  })
                })
              })
            })
          })
        })
      })
    })
  })
})
