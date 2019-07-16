const { 
  defaultSetup,
  QUEUE_PERIOD_SECS,
  ANY_ADDRESS
} = require('./common.js');
const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript');
const { assertRevert } = require('@aragon/test-helpers/assertThrow');
const timeUtil = require('../scripts/timeUtil.js');

contract('HCVoting', accounts => {

  const [ 
    stakeHolder1, 
    stakeHolder2, 
    stakeHolder3, 
    appManager
  ] = accounts;

  const HOLDER_1_STAKE_BALANCE = 100;
  const HOLDER_2_STAKE_BALANCE = 100;
  const HOLDER_3_STAKE_BALANCE = 200;

  const INIFINITE_ALLOWANCE = 100000000000000000;

  describe('When proposals expire', () => {

    beforeEach(async () => {
      await defaultSetup(this, appManager);

      await this.voteToken.generateTokens(ANY_ADDRESS, 999);
      
      await this.stakeToken.generateTokens(stakeHolder1, HOLDER_1_STAKE_BALANCE);
      await this.stakeToken.generateTokens(stakeHolder2, HOLDER_2_STAKE_BALANCE);
      await this.stakeToken.generateTokens(stakeHolder3, HOLDER_3_STAKE_BALANCE);

      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder1 });
      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder2 });
      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder3 });

      await this.app.createProposal(EMPTY_SCRIPT, `Proposal message`);
      
      // Stake, but without enough confidence for pending or boosting.
      await this.app.stake(0, HOLDER_1_STAKE_BALANCE, true, { from: stakeHolder1 });
      await this.app.stake(0, HOLDER_2_STAKE_BALANCE, true, { from: stakeHolder2 });
      await this.app.stake(0, HOLDER_3_STAKE_BALANCE, false, { from: stakeHolder3 });
    });
    
    
    describe('When a Queued proposal does not reach absolute majority within its lifetime', () => {

      beforeEach(async () => {
        await timeUtil.advanceTimeAndBlock(web3, QUEUE_PERIOD_SECS + 2 * 3600);
      });
      
      it('Stakers should be able to withdraw their stake', async () => {

        await this.app.unstake(0, HOLDER_1_STAKE_BALANCE, true, { from: stakeHolder1 });
        await this.app.unstake(0, HOLDER_2_STAKE_BALANCE, true, { from: stakeHolder2 });
        await this.app.unstake(0, HOLDER_3_STAKE_BALANCE, false, { from: stakeHolder3 });

        const stakeHoder1NewBalance = (await this.stakeToken.balanceOf(stakeHolder1)).toString();
        const stakeHoder2NewBalance = (await this.stakeToken.balanceOf(stakeHolder2)).toString();
        const stakeHoder3NewBalance = (await this.stakeToken.balanceOf(stakeHolder3)).toString();

        expect(stakeHoder1NewBalance).to.equal(`${HOLDER_1_STAKE_BALANCE}`);
        expect(stakeHoder2NewBalance).to.equal(`${HOLDER_2_STAKE_BALANCE}`);
        expect(stakeHoder3NewBalance).to.equal(`${HOLDER_3_STAKE_BALANCE}`);
      });

    });

  });

});
