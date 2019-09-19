/* global contract beforeEach it assert */

const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript')
const { getEventAt } = require('@aragon/test-helpers/events')
const { defaultParams, deployAllAndInitializeApp, PROPOSAL_STATE } = require('./helpers/deployApp')

contract('HCVoting (boost)', ([appManager, voter1, voter2, voter3, voter4, voter5, staker]) => {
  let app, voteToken, stakeToken

  before('deploy app and mint some vote tokens', async () => {
    ({ app, voteToken, stakeToken } = await deployAllAndInitializeApp(appManager))

    await voteToken.generateTokens(voter1, '50e18')
    await voteToken.generateTokens(voter2, '50e18')
    await voteToken.generateTokens(voter3, '120e18')
    await voteToken.generateTokens(voter4, '220e18')
    await voteToken.generateTokens(voter5, '320e18')
  })

  describe('when no proposals exist', () => {
    it('reverts when attempting to boost a proposal that doesn\'t exist', async () => {
      await assertRevert(
        app.boost(0),
        'HCVOTING_PROPOSAL_DOES_NOT_EXIST'
      )
    })
  })

  describe('when a proposal exists', () => {
    let creationDate

    before('create a proposal', async () => {
      await app.propose(EMPTY_SCRIPT, 'Proposal metadata')
      creationDate = (await app.getCreationDate(0)).toNumber()
    })

    it('reports the proposal\'s state as Queued', async () => {
      assert.equal((await app.getState(0)).toNumber(), PROPOSAL_STATE.QUEUED)
    })

    describe('when the proposal has not yet received stake', () => {
      it('confidence is 0', async () => {
        assert.equal((await app.getConfidence(0)).toNumber(), 0);
      })

      it('hasConfidence is false', async () => {
        assert.equal(await app.hasConfidence(0), false)
      })
    })

    describe('when the proposal is staked on', () => {
      before('stake on proposal', async () => {
        await stakeToken.generateTokens(staker, '100000e18')
        await stakeToken.approve(app.address, '10000000e18', { from: staker })

        await app.stake(0, '3000e18', true, { from: staker })
        await app.stake(0, '1000e18', false, { from: staker })
      })

      it('correctly calculates the proposal\'s current confidence', async () => {
        assert.equal((await app.getConfidence(0)).toNumber(), 3000000);
      })

      it('correctly reports that the proposal doesn\'t have enough confidence', async () => {
        assert.equal(await app.hasConfidence(0), false)
      })

      describe('when a proposal reaches enough confidence', () => {
        before('stake on proposal so that confidence is reached', async () => {
          await app.stake(0, '1000e18', true, { from: staker })
        })

        it('has confidence', async () => {
          assert.equal(await app.hasConfidence(0), true)
        })

        it('sets the proposal\'s state to Pended', async () => {
          assert.equal((await app.getState(0)).toNumber(), PROPOSAL_STATE.PENDED)
        })

        it('sets the proposal\'s pendedDate', async () => {
          assert.notEqual((await app.getPendedDate(0)).toNumber(), 0)
        })

        describe('when a proposal looses confidence', () => {
          before('withdraw stake', async () => {
            await app.unstake(0, '1000e18', true, { from: staker })
          })

          it('sets the proposal\'s state back to Queued', async () => {
            assert.equal((await app.getState(0)).toNumber(), PROPOSAL_STATE.QUEUED)
          })

          it('sets the proposal\'s pendedDate back to zero', async () => {
            assert.equal((await app.getPendedDate(0)).toNumber(), 0)
          })

          after('restore stake', async () => {
            await app.stake(0, '1000e18', true, { from: staker })
          })
        })

        describe('when the proposal\'s queue period elapses', () => {
          before('shift time to past the queue period', async () => {
            await app.mockSetTimestamp(creationDate + defaultParams.queuePeriod + 1)
          })

          it('reports the proposal\'s state as Closed', async () => {
            assert.equal((await app.getState(0)).toNumber(), PROPOSAL_STATE.CLOSED)
          })

          it('reverts when trying to boost the proposal', async () => {
            await assertRevert(
              app.boost(0),
              'HCVOTING_PROPOSAL_IS_CLOSED'
            )
          })
        })

        describe('when the time elapses within the pended period', () => {
          let pendedDate

          before('record pended date', async () => {
            pendedDate = (await app.getPendedDate(0)).toNumber()
          })

          describe('when half of the pended period has elapsed', () => {
            before('shift time to half the pended period', async () => {
              await app.mockSetTimestamp(pendedDate + defaultParams.pendedPeriod / 2)
            })

            it('reports that the proposal has not yet maintained confidence', async () => {
              assert.equal(await app.hasMaintainedConfidence(0), false)
            })

            it('reverts when trying to boost the proposal', async () => {
              await assertRevert(
                app.boost(0),
                'HCVOTING_HASNT_MAINTAINED_CONF'
              )
            })

            describe('when the pended period has elapsed', () => {
              before('shift time to past the pended period', async () => {
                await app.mockSetTimestamp(pendedDate + defaultParams.pendedPeriod + 1)
              })

              it('reports that the proposal has maintained confidence', async () => {
                assert.equal(await app.hasMaintainedConfidence(0), true)
              })

              describe('when boosting the proposal', () => {
                let boostReceipt

                before('boost the proposal', async () => {
                  boostReceipt = await app.boost(0)
                })

                it('reverts when trying to boost the proposal again', async () => {
                  await assertRevert(
                    app.boost(0),
                    'HCVOTING_PROPOSAL_IS_BOOSTED'
                  )
                })

                it('rejects stake', async () => {
                  await assertRevert(
                    app.stake(0, 1, true, { from: staker }),
                    'HCVOTING_PROPOSAL_IS_BOOSTED'
                  )
                  await assertRevert(
                    app.stake(0, 1, false, { from: staker }),
                    'HCVOTING_PROPOSAL_IS_BOOSTED'
                  )
                })

                it('rejects stake withdrawals', async () => {
                  await assertRevert(
                    app.unstake(0, 1, true, { from: staker }),
                    'HCVOTING_PROPOSAL_IS_BOOSTED'
                  )
                  await assertRevert(
                    app.unstake(0, 1, false, { from: staker }),
                    'HCVOTING_PROPOSAL_IS_BOOSTED'
                  )
                })

                it('sets boosted to true', async () => {
                  assert.equal(await app.getBoosted(0), true)
                })

                it('reports the proposal\'s state as Boosted', async () => {
                  assert.equal((await app.getState(0)).toNumber(), PROPOSAL_STATE.BOOSTED)
                })

                it('emits a ProposalBoosted event', async () => {
                  const boostEvent = getEventAt(boostReceipt, 'ProposalBoosted')
                  assert.equal(boostEvent.args.proposalId.toNumber(), 0, 'invalid proposal id')
                })

                it('modifies the proposal\'s closeDate', async () => {
                  assert.equal((await app.getCloseDate(0)).toNumber(), pendedDate + defaultParams.boostPeriod)
                })

                describe('when half the boost period has elapsed', () => {
                  before('shift time to half the boost period', async () => {
                    await app.mockSetTimestamp(pendedDate + defaultParams.pendedPeriod + defaultParams.boostPeriod / 2)
                  })

                  before('vote on proposal avoiding absolute support', async () => {
                    await app.vote(0, true, { from: voter1 })
                  })

                  it('reverts when trying to resolve the proposal with relative support before the boost period elapses', async () => {
                    await assertRevert(
                      app.resolve(0),
                      'HCVOTING_ON_BOOST_PERIOD'
                    )
                  })

                  describe('when entering the ending period', () => {
                    let closeDate

                    before('shift time to the ending period', async () => {
                      closeDate = (await app.getCloseDate(0)).toNumber()
                      await app.mockSetTimestamp(closeDate - defaultParams.endingPeriod + 1)
                    })

                    describe('when a new vote does not flip consensus', () => {
                      before('vote', async () => {
                        await app.vote(0, true, { from: voter2 })
                      })

                      it('does not extend the proposal\'s lifetime', async () => {
                        const newCloseDate = (await app.getCloseDate(0)).toNumber()
                        assert.equal(newCloseDate, closeDate)
                      })
                    })

                    describe('when a new vote flips consensus', () => {
                      before('vote', async () => {
                        await app.vote(0, false, { from: voter4 })
                      })

                      it('extends the proposal\'s lifetime', async () => {
                        const newCloseDate = (await app.getCloseDate(0)).toNumber()
                        assert.equal(newCloseDate, closeDate + defaultParams.endingPeriod)
                      })

                      describe('when yet another new vote flips consensus', () => {
                        before('shift time to the ending period', async () => {
                          closeDate = (await app.getCloseDate(0)).toNumber()
                          await app.mockSetTimestamp(closeDate - defaultParams.endingPeriod + 1)
                        })

                        before('vote', async () => {
                          await app.vote(0, true, { from: voter5 })
                        })

                        it('extends the proposal\'s lifetime', async () => {
                          const newCloseDate = (await app.getCloseDate(0)).toNumber()
                          assert.equal(newCloseDate, closeDate + defaultParams.endingPeriod)
                        })
                      })
                    })
                  })

                  describe('when the proposal\'s close date passes', () => {
                    before('shift time to past the close date', async () => {
                      const closeDate = (await app.getCloseDate(0)).toNumber()
                      await app.mockSetTimestamp(closeDate + 1)
                    })

                    describe('when resolving the proposal', () => {
                      before('resolve proposal', async () => {
                        await app.resolve(0)
                      })

                      it('proposal state is Resolved', async () => {
                        assert.equal((await app.getState(0)).toNumber(), PROPOSAL_STATE.RESOLVED)
                      })

                      it('reverts when trying to boost the proposal', async () => {
                        await assertRevert(
                          app.boost(0),
                          'HCVOTING_PROPOSAL_IS_RESOLVED'
                        )
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
  })
})
