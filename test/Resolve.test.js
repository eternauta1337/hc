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

  const INITIAL_APP_STAKE_BALANCE = 100000000000000000;
  const INIFINITE_ALLOWANCE = 100000000000000000;

  describe('When resolving proposals', () => {

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

      await this.stakeToken.generateTokens(this.app.address, INITIAL_APP_STAKE_BALANCE);

      await this.app.createProposal(EMPTY_SCRIPT, `Proposal message`);
    });

    it('A proposal\'s state should remain as Queued (and not resolve) while it doesn\'t reach absolute majority', async () => {

      await this.app.vote(0, true, { from: voteHolder1 });
      await this.app.vote(0, false, { from: voteHolder3 });

      const [
        votingPower, 
        executionScript, 
        state, 
        lastRelativeSupport
      ] = await this.app.getProposalInfo(0);
      expect(state.toString()).to.equal(`0`); // ProposalState '0' = Queued
    });

    describe('When a Queued proposal reaches absolute majority', () => {

      let resolveReceipt;

      beforeEach(async () => {
        await this.app.vote(0, true, { from: voteHolder1 });
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

      it('The retrieved proposal\'s state should be Resolved', async () => {
        const [
          votingPower, 
          executionScript, 
          state, 
          lastRelativeSupport
        ] = await this.app.getProposalInfo(0);
        expect(state.toString()).to.equal(`4`); // ProposalState '4' = Resolved
      });

      it('Should not allow additional votes on a resolved proposal', async () => {
        await assertRevert(
          this.app.vote(0, false, { from: voteHolder3 }),
          `PROPOSAL_IS_CLOSED`
        );
      });

      it('Should not allow staking on a resolved proposal', async () => {
        await assertRevert(
          this.app.stake(0, 1, false, { from: stakeHolder1 }),
          `PROPOSAL_IS_CLOSED`
        );
      });

      it.skip('Stakers should be able to withdraw their stake', async () => {
        
      });

    });

    describe.skip('When a Queued proposal does not reach absolute majority within its lifetime', () => {

      // TODO: Before each, skip time to expire
      
      it.skip('External callers should be able to expire a proposal from Queue and be compensated for it', async () => {
        
      });

      it.skip('Stakers should be able to withdraw their stake', async () => {
        
      });

    });

    describe('When a proposal is boosted and reaches the end of its lifetime', () => {

      beforeEach(async () => {
        await this.app.vote(0, true, { from: voteHolder1 });
        await this.app.vote(0, true, { from: voteHolder2 });
        await this.app.stake(0, HOLDER_1_STAKE_BALANCE, false, { from: stakeHolder1 });
        await this.app.stake(0, HOLDER_5_STAKE_BALANCE, true, { from: stakeHolder5 });
        await timeUtil.advanceTimeAndBlock(web3, PENDED_BOOST_PERIOD_SECS);
        await this.app.boostProposal(0, { from: stakeHolder1 });
        await timeUtil.advanceTimeAndBlock(web3, BOOST_PERIOD_SECS + 2 * 3600);
      });

      it('An external caller should be able to resolve the proposal', async () => {
        await this.app.resolveProposal(0, { from: stakeHolder1 });
      });

      describe('When a boosted proposal is resolved by an external caller', () => {

        beforeEach(async () => {
          await this.app.resolveProposal(0);
        });

        it.skip('A ProposalStateChanged should be triggered');

        it('The proposal state should be set to resolved', async () => {
          const [
            votingPower, 
            executionScript, 
            state, 
            lastRelativeSupport
          ] = await this.app.getProposalInfo(0);
          expect(state.toString()).to.equal(`4`); // ProposalState '4' = Resolved
        });

        it('Should have been executed', async () => {
          const [
            votingPower, 
            executionScript, 
            state, 
            lastRelativeSupport,
            executed
          ] = await this.app.getProposalInfo(0);
          expect(executed).to.equal(true);
        });
        
      });
      
    });

    describe('When a proposal does not have relative support', () => {
      
      beforeEach(async () => {
        await this.app.vote(0, true, { from: voteHolder1 });
        await this.app.vote(0, false, { from: voteHolder2 });
      });

    });
    
  });
  
});
