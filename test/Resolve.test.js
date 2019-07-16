const { 
  defaultSetup,
  CONFIDENCE_THRESHOLD_BASE,
  PENDED_BOOST_PERIOD_SECS,
  BOOST_PERIOD_SECS
} = require('./common.js');
const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript');
const { assertRevert } = require('@aragon/test-helpers/assertThrow');
const timeUtil = require('../scripts/timeUtil.js');

contract('HCVoting', accounts => {

  const [ 
    stakeHolder1, 
    stakeHolder2, 
    stakeHolder3, 
    stakeHolder4, 
    stakeHolder5, 
    voteHolder1,
    voteHolder2,
    voteHolder3,
    appManager
  ] = accounts;

  const HOLDER_1_STAKE_BALANCE = 100;
  const HOLDER_2_STAKE_BALANCE = 100;
  const HOLDER_3_STAKE_BALANCE = 200;
  const HOLDER_4_STAKE_BALANCE = 400;
  const HOLDER_5_STAKE_BALANCE = CONFIDENCE_THRESHOLD_BASE * HOLDER_1_STAKE_BALANCE;

  const HOLDER_1_VOTE_BALANCE = 100;
  const HOLDER_2_VOTE_BALANCE = 100;
  const HOLDER_3_VOTE_BALANCE = 200;

  const INIFINITE_ALLOWANCE = 100000000000000000;

  const HOLDER_2_STAKING = HOLDER_2_STAKE_BALANCE * 0.5;

  describe('When resolving proposals', () => {

    let resolveReceipt;

    beforeEach(async () => {
      await defaultSetup(this, appManager);

      await this.voteToken.generateTokens(voteHolder1, HOLDER_1_VOTE_BALANCE);
      await this.voteToken.generateTokens(voteHolder2, HOLDER_2_VOTE_BALANCE);
      await this.voteToken.generateTokens(voteHolder3, HOLDER_3_VOTE_BALANCE);

      await this.stakeToken.generateTokens(stakeHolder1, HOLDER_1_STAKE_BALANCE);
      await this.stakeToken.generateTokens(stakeHolder2, HOLDER_2_STAKE_BALANCE);
      await this.stakeToken.generateTokens(stakeHolder3, HOLDER_3_STAKE_BALANCE);
      await this.stakeToken.generateTokens(stakeHolder4, HOLDER_4_STAKE_BALANCE);
      await this.stakeToken.generateTokens(stakeHolder5, HOLDER_5_STAKE_BALANCE);

      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder1 });
      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder2 });
      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder3 });
      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder4 });
      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder5 });

      await this.app.createProposal(EMPTY_SCRIPT, `Proposal message`);
    });

    it('A proposal\'s state should remain as Queued (and not resolve) while it doesn\'t reach absolute majority', async () => {

      await this.app.vote(0, true, { from: voteHolder1 });
      await this.app.vote(0, false, { from: voteHolder3 });
      const [,,state,] = await this.app.getProposalInfo(0);
      expect(state.toString()).to.equal(`0`); // ProposalState '0' = Queued
    });

    describe('When a Queued proposal reaches absolute majority', () => {

      beforeEach(async () => {

        // Stake, but without enough confidence for pending or boosting.
        await this.app.stake(0, HOLDER_4_STAKE_BALANCE, false, { from: stakeHolder4 });
        await this.app.stake(0, HOLDER_1_STAKE_BALANCE, true, { from: stakeHolder1 });
        await this.app.stake(0, HOLDER_2_STAKING, true, { from: stakeHolder2 });

        // Vote with absolute support.
        await this.app.vote(0, false, { from: voteHolder1 });
        await this.app.vote(0, true, { from: voteHolder2 });
        await this.app.vote(0, true, { from: voteHolder3 });

        resolveReceipt = await this.app.resolveProposal(0);
      });

      it('A ProposalStateChanged event with the Resolved state should be emitted', async () => {
        const event = resolveReceipt.logs.filter(l => l.event === 'ProposalStateChanged')[0];
        expect(event).to.be.an('object');
        expect(event.args._proposalId.toString()).to.equal(`0`);
        expect(event.args._newState.toString()).to.equal(`4`); // ProposalState '4' = Resolved
      });

      it('The proposal\'s state should be Resolved', async () => {
        const [,,state,] = await this.app.getProposalInfo(0);
        expect(state.toString()).to.equal(`4`); // ProposalState '4' = Resolved
      });

      it('Should not allow additional votes on a resolved proposal', async () => {
        await assertRevert(
          this.app.vote(0, false, { from: voteHolder3 }),
          `PROPOSAL_IS_CLOSED`
        );
      });

      it('Should not allow staking/unstaking on a resolved proposal', async () => {
        await assertRevert(
          this.app.stake(0, HOLDER_2_STAKING, true, { from: stakeHolder2 }),
          `PROPOSAL_IS_CLOSED`
        );
        await assertRevert(
          this.app.unstake(0, HOLDER_4_STAKE_BALANCE, false, { from: stakeHolder4 }),
          `PROPOSAL_IS_CLOSED`
        );
      });

    });

    describe('When a proposal gets boosted', () => {

      beforeEach(async () => {

        // Vote, but without reaching absolute support.
        await this.app.vote(0, true, { from: voteHolder1 });
        await this.app.vote(0, true, { from: voteHolder2 });

        // Stake with enough confidence to pend and boost the proposal later.
        await this.app.stake(0, HOLDER_1_STAKE_BALANCE, false, { from: stakeHolder1 });
        await this.app.stake(0, HOLDER_5_STAKE_BALANCE, true, { from: stakeHolder5 });

        // Skip pendedBoostTime and boost the proposal.
        await timeUtil.advanceTimeAndBlock(web3, PENDED_BOOST_PERIOD_SECS);
        await this.app.boostProposal(0, { from: stakeHolder1 });
      });
      
      describe('Before the boosted proposal\'s lifetime ends', () => {

        beforeEach(async () => {
          await timeUtil.advanceTimeAndBlock(web3, BOOST_PERIOD_SECS / 2);
        });

        it('A proposal should be resolvable before its lifetime ends if it reaches absolute majority', async () => {
          await this.app.vote(0, true, { from: voteHolder3 });
          await this.app.resolveProposal(0, { from: stakeHolder3 });
          const [,,state,] = await this.app.getProposalInfo(0);
          expect(state.toString()).to.equal(`4`); // ProposalState '4' = Resolved
        });

        describe('When a proposal is boosted and reaches the end of its lifetime', () => {

          beforeEach(async () => {
            await timeUtil.advanceTimeAndBlock(web3, BOOST_PERIOD_SECS / 2 + 2 * 3600);
          });

          it('An external caller should be able to resolve the proposal', async () => {
            await this.app.resolveProposal(0, { from: stakeHolder1 });
          });

          describe('When a boosted proposal is resolved by an external caller', () => {

            beforeEach(async () => {
              resolveReceipt = await this.app.resolveProposal(0);
            });

            it('A ProposalStateChanged event with the Resolved state should be emitted', async () => {
              const event = resolveReceipt.logs.filter(l => l.event === 'ProposalStateChanged')[0];
              expect(event).to.be.an('object');
              expect(event.args._proposalId.toString()).to.equal(`0`);
              expect(event.args._newState.toString()).to.equal(`4`); // ProposalState '4' = Resolved
            });


            it('The proposal state should be set to resolved', async () => {
              const [,,state,] = await this.app.getProposalInfo(0);
              expect(state.toString()).to.equal(`4`); // ProposalState '4' = Resolved
            });

            it('Should have been executed', async () => {
              const [,,,,executed] = await this.app.getProposalInfo(0);
              expect(executed).to.equal(true);
            });

            it('Should not allow additional votes on a resolved proposal', async () => {
              await assertRevert(
                this.app.vote(0, false, { from: voteHolder3 }),
                `PROPOSAL_IS_CLOSED`
              );
            });

            it('Should not allow staking/unstaking on a resolved proposal', async () => {
              await assertRevert(
                this.app.stake(0, HOLDER_2_STAKING, true, { from: stakeHolder2 }),
                `PROPOSAL_IS_CLOSED`
              );
              await assertRevert(
                this.app.unstake(0, HOLDER_4_STAKE_BALANCE, false, { from: stakeHolder4 }),
                `PROPOSAL_IS_CLOSED`
              );
            });
            
          });
          
        });

      });

    });

  });
  
});
