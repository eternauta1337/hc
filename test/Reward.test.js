const { 
  defaultSetup 
} = require('./common.js');
const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript');
const { assertRevert } = require('@aragon/test-helpers/assertThrow');

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

  const HOLDER_1_VOTE_BALANCE = 100;
  const HOLDER_2_VOTE_BALANCE = 100;
  const HOLDER_3_VOTE_BALANCE = 200;

  const INIFINITE_ALLOWANCE = 100000000000000000;

  const HOLDER_2_STAKING = HOLDER_2_STAKE_BALANCE * 0.5;

  describe('When stakes withdraw rewards from resolved proposals', () => {

    beforeEach(async () => {
      await defaultSetup(this, appManager);
      
      await this.voteToken.generateTokens(voteHolder1, HOLDER_1_VOTE_BALANCE);
      await this.voteToken.generateTokens(voteHolder2, HOLDER_2_VOTE_BALANCE);
      await this.voteToken.generateTokens(voteHolder3, HOLDER_3_VOTE_BALANCE);

      await this.stakeToken.generateTokens(stakeHolder1, HOLDER_1_STAKE_BALANCE);
      await this.stakeToken.generateTokens(stakeHolder2, HOLDER_2_STAKE_BALANCE);
      await this.stakeToken.generateTokens(stakeHolder3, HOLDER_3_STAKE_BALANCE);
      await this.stakeToken.generateTokens(stakeHolder4, HOLDER_4_STAKE_BALANCE);

      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder1 });
      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder2 });
      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder3 });
      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder4 });

      await this.app.createProposal(EMPTY_SCRIPT, `Proposal message`);

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
    
    it('Losing stakers should not be able to withdraw rewards from the proposal', async () => {
      await assertRevert(
        this.app.withdrawStakeFromResolvedProposal(0, { from: stakeHolder4 }),
        `NO_WINNING_STAKE`
      );
    });

    it('Winning stakers should be able to withdraw rewards from the proposal', async () => {

      const totalWinningStake = HOLDER_1_STAKE_BALANCE + HOLDER_2_STAKING;
      const totalLosingStake = HOLDER_4_STAKE_BALANCE;
      const stakeHolder1Reward = Math.floor(totalLosingStake * (HOLDER_1_STAKE_BALANCE / totalWinningStake));
      const stakeHolder2Reward = Math.floor(totalLosingStake * (HOLDER_2_STAKING / totalWinningStake));

      await this.app.withdrawStakeFromResolvedProposal(0, { from: stakeHolder1 });
      await this.app.withdrawStakeFromResolvedProposal(0, { from: stakeHolder2 });

      const stakeHoder1NewBalance = (await this.stakeToken.balanceOf(stakeHolder1)).toString();
      const stakeHoder2NewBalance = (await this.stakeToken.balanceOf(stakeHolder2)).toString();
      
      expect(stakeHoder1NewBalance).to.equal(`${HOLDER_1_STAKE_BALANCE + stakeHolder1Reward}`);
      expect(stakeHoder2NewBalance).to.equal(`${HOLDER_2_STAKE_BALANCE + stakeHolder2Reward}`);
    });

  });

});
