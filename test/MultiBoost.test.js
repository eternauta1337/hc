const { 
  defaultSetup,
  CONFIDENCE_THRESHOLD_BASE,
  PENDED_BOOST_PERIOD_SECS
} = require('./common.js');
const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript');
const { assertRevert } = require('@aragon/test-helpers/assertThrow');
const timeUtil = require('../scripts/timeUtil.js');

contract('HCVoting', accounts => {

  const [ 
    stakeHolder1, 
    stakeHolder2,
    voteHolder1,
    appManager
  ] = accounts;

  const HOLDER_1_VOTE_BALANCE = 10000;

  const HOLDER_1_STAKE_BALANCE = 10000;
  const HOLDER_2_STAKE_BALANCE = 10000;

  const INIFINITE_ALLOWANCE = 100000000000000000;

  const stakeOnProposalToAchieveConfidence = async (proposalId, numBoostedProposals) => {
    const exponent = numBoostedProposals > 0 ? numBoostedProposals + 1 : 1;
    const upstake = CONFIDENCE_THRESHOLD_BASE ** exponent;
    await this.app.stake(proposalId, 1, false, { from: stakeHolder2 });
    const receipt = await this.app.stake(proposalId, upstake, true, { from: stakeHolder1 });
    return receipt;
  }

  describe('When boosting multiple proposals', () => {

    beforeEach(async () => {
      await defaultSetup(this, appManager);

      await this.voteToken.generateTokens(voteHolder1, HOLDER_1_VOTE_BALANCE);

      await this.stakeToken.generateTokens(stakeHolder1, HOLDER_1_STAKE_BALANCE);
      await this.stakeToken.generateTokens(stakeHolder2, HOLDER_2_STAKE_BALANCE);

      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder1 });
      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder2 });
    });

    describe(`When there are 0 boosted proposals`, () => {

      beforeEach(async () => {
        await this.app.createProposal(EMPTY_SCRIPT, `Proposal message`);
      });

      it('The app reports 1 proposal', async () => {
        expect((await this.app.numProposals()).toNumber()).to.equal(1);
      });

      it('The app reports 0 boosted proposals', async () => {
        expect((await this.app.numBoostedProposals()).toNumber()).to.equal(0);
      });

      it('Proposals can be Pended with a confidence threshold of C^1', async () => {
        await stakeOnProposalToAchieveConfidence(0, 0);
        const [,,state,] = await this.app.getProposalInfo(0);
        expect(state.toNumber()).to.equal(2); // Proposal state 2 = Pended
      });

      describe('Afert the pended boost period elapses and the proposal is boosted', () => {

        beforeEach(async () => {
          await stakeOnProposalToAchieveConfidence(0, 0);
          await timeUtil.advanceTimeAndBlock(web3, PENDED_BOOST_PERIOD_SECS);
          await this.app.boostProposal(0);
        });

        it('The proposal state is Boosted', async () => {
          const [,,state,] = await this.app.getProposalInfo(0);
          expect(state.toNumber()).to.equal(3); // Proposal state 3 = Boosted
        });

        describe('When there is 1 boosted proposal', () => {
          
          beforeEach(async () => {
            await this.app.createProposal(EMPTY_SCRIPT, `Proposal message`);
          });

          it('The app reports 2 proposals', async () => {
            expect((await this.app.numProposals()).toNumber()).to.equal(2);
          });

          it('The app reports 1 boosted proposal', async () => {
            expect((await this.app.numBoostedProposals()).toNumber()).to.equal(1);
          });

          it('Proposals cannot be Pended with a confidence threshold of C^1', async () => {
            await stakeOnProposalToAchieveConfidence(1, 0);
            const [,,state,] = await this.app.getProposalInfo(1);
            expect(state.toNumber()).to.equal(0); // Proposal state 2 = Queued
          });

          it('Proposals can be Pended with a confidence threshold of C^2', async () => {
            await stakeOnProposalToAchieveConfidence(1, 1);
            const [,,state,] = await this.app.getProposalInfo(1);
            expect(state.toNumber()).to.equal(2); // Proposal state 2 = Pended
          });

          describe('Afert the pended boost period elapses and the proposal is boosted', () => {

            beforeEach(async () => {
              await stakeOnProposalToAchieveConfidence(1, 1);
              await timeUtil.advanceTimeAndBlock(web3, PENDED_BOOST_PERIOD_SECS);
              await this.app.boostProposal(1);
            });

            it('The proposal state is Boosted', async () => {
              const [,,state,] = await this.app.getProposalInfo(1);
              expect(state.toNumber()).to.equal(3); // Proposal state 3 = Boosted
            });

            describe('When there are 2 boosted proposals', () => {
              
              beforeEach(async () => {
                await this.app.createProposal(EMPTY_SCRIPT, `Proposal message`);
              });

              it('The app reports 3 proposals', async () => {
                expect((await this.app.numProposals()).toNumber()).to.equal(3);
              });

              it('The app reports 2 boosted proposals', async () => {
                expect((await this.app.numBoostedProposals()).toNumber()).to.equal(2);
              });

              it('Proposals cannot be Pended with a confidence threshold of C^2', async () => {
                await stakeOnProposalToAchieveConfidence(2, 1);
                const [,,state,] = await this.app.getProposalInfo(2);
                expect(state.toNumber()).to.equal(0); // Proposal state 2 = Queued
              });

              it('Proposals can be Pended with a confidence threshold of C^3', async () => {
                await stakeOnProposalToAchieveConfidence(2, 2);
                const [,,state,] = await this.app.getProposalInfo(2);
                expect(state.toNumber()).to.equal(2); // Proposal state 2 = Pended
              });

              describe('When one of the boosted proposals resolves', () => {
                
                beforeEach(async () => {
                  await this.app.vote(0, true, { from: voteHolder1 });
                  await this.app.resolveProposal(0);
                });

                it('The proposal\'s state is set to Resolved', async () => {
                  const [,,state,] = await this.app.getProposalInfo(0);
                  expect(state.toNumber()).to.equal(4); // Proposal state 4 = Resolved
                });

                it('The app reports 1 boosted proposal', async () => {
                  expect((await this.app.numBoostedProposals()).toNumber()).to.equal(1);
                });

              });

            });

          });

        });

      });

    });

  });

});
