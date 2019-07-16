const { 
  defaultSetup,
  ANY_ADDRESS
} = require('./common.js');
const { assertRevert } = require('@aragon/test-helpers/assertThrow');
const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript');

contract('HCVoting', accounts => {

  const [ 
    stakeHolder1, 
    stakeHolder2, 
    stakeHolder3, 
    stakeHolder4, 
    appManager
  ] = accounts;

  const HOLDER_1_BALANCE = 100;
  const HOLDER_2_BALANCE = 100;
  const HOLDER_3_BALANCE = 100;
  const HOLDER_4_BALANCE = 100;

  const INIFINITE_ALLOWANCE = 100000000000000000;

  describe('When staking on proposals', () => {

    beforeEach(async () => {
      await defaultSetup(this, appManager);

      await this.voteToken.generateTokens(ANY_ADDRESS, 999);

      await this.stakeToken.generateTokens(stakeHolder1, HOLDER_1_BALANCE);
      await this.stakeToken.generateTokens(stakeHolder2, HOLDER_2_BALANCE);
      await this.stakeToken.generateTokens(stakeHolder3, HOLDER_3_BALANCE);
      await this.stakeToken.generateTokens(stakeHolder4, HOLDER_4_BALANCE);

      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder1 });
      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder2 });
      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder3 });
      await this.stakeToken.approve(this.app.address, 10, { from: stakeHolder4 });

      await this.app.createProposal(EMPTY_SCRIPT, `Proposal message`);
    });

    it('Should reject staking on proposals that do not exist', async () => {
      await assertRevert(
        this.app.stake(999, 10, true, { from: stakeHolder1 }),
        `PROPOSAL_DOES_NOT_EXIST`
      );
    });

    it('Should not allow an account to stake more tokens that it holds', async () => {
      await assertRevert(
        this.app.stake(0, 10000, true, { from: stakeHolder1 }),
        `INSUFFICIENT_TOKENS`
      );
    });

    it('Should not allow an account to stake without having provided sufficient allowance', async () => {
      await assertRevert(
        this.app.stake(0, 100, true, { from: stakeHolder4 }),
        `INSUFFICIENT_ALLOWANCE`
      );
    });

    it('Should not allow an account to withdraw tokens that it didn\'t stake', async () => {
      await this.app.stake(0, 100, true, { from: stakeHolder1 }),
      await assertRevert(
        this.app.unstake(0, 100, true, { from: stakeHolder2 }),
        `SENDER_DOES_NOT_HAVE_REQUIRED_STAKE`
      );
    });

    it('Should not allow an account to withdraw stake from a proposal that was never staked on', async () => {
      await this.app.stake(0, 10, true, { from: stakeHolder1 });
      await this.app.createProposal(EMPTY_SCRIPT, `Proposal message`);
      await assertRevert(
        this.app.unstake(1, 100, true, { from: stakeHolder1 }),
        `SENDER_DOES_NOT_HAVE_REQUIRED_STAKE`
      );
    });

    it('Should properly transfer tokens when a stake is made', async () => {
      const amount = 10;
      await this.app.stake(0, amount, true, { from: stakeHolder1 });
      expect((await this.stakeToken.balanceOf(stakeHolder1)).toString()).to.equal(`${HOLDER_1_BALANCE - amount}`);
      expect((await this.stakeToken.balanceOf(this.app.address)).toString()).to.equal(`${amount}`);
    });

    it('Should properly transfer tokens when an unstake is made', async () => {
      const amount = 10;
      await this.app.stake(0, amount, true, { from: stakeHolder1 });
      await this.app.unstake(0, amount, true, { from: stakeHolder1 });
      expect((await this.stakeToken.balanceOf(stakeHolder1)).toString()).to.equal(`${HOLDER_1_BALANCE}`);
      expect((await this.stakeToken.balanceOf(this.app.address)).toString()).to.equal(`0`);
    });

    it('Should emit events when staking on a proposal', async () => {
      const amount = 10;
      const receipt = await this.app.stake(0, amount, true, { from: stakeHolder1 });
      const event = receipt.logs.filter(l => l.event === 'UpstakeProposal')[0];
      expect(event).to.be.an('object');
      expect(event.args._proposalId.toString()).to.equal(`0`);
      expect(event.args._staker).to.equal(stakeHolder1);
      expect(event.args._amount.toString()).to.equal(`${amount}`);
    });

    it('Should emit events when unstaking from a proposal', async () => {
      const amount = 10;
      await this.app.stake(0, amount, true, { from: stakeHolder1 });
      const receipt = await this.app.unstake(0, amount, true, { from: stakeHolder1 });
      const event = receipt.logs.filter(l => l.event === 'WithdrawUpstake')[0];
      expect(event).to.be.an('object');
      expect(event.args._proposalId.toString()).to.equal(`0`);
      expect(event.args._staker).to.equal(stakeHolder1);
      expect(event.args._amount.toString()).to.equal(`${amount}`);
    });

    it('Should keep track of a proposal\'s total upstake/downstake', async () => {

      let proposalUpstake = 0;
      let proposalDownstake = 0;

      const stake = async (amount, supports, holder) => {
        await this.app.stake(0, amount, supports, { from: holder });
        if(supports) proposalUpstake += amount;
        else proposalDownstake += amount;
      }

      const unstake = async (amount, supports, holder) => {
        await this.app.unstake(0, amount, supports, { from: holder });
        if(supports) proposalUpstake -= amount;
        else proposalDownstake -= amount;
      }

      await stake(10, true, stakeHolder1);
      await stake(2, false, stakeHolder1);
      await unstake(4, true, stakeHolder1);
      await stake(80, true, stakeHolder2);
      await stake(10, false, stakeHolder3);
      await unstake(5, false, stakeHolder3);

      const [ upstake, downstake ] = await this.app.getProposalStakes(0);
      expect(upstake.toString()).to.equal(`${proposalUpstake}`);
      expect(downstake.toString()).to.equal(`${proposalDownstake}`);
    });

    it('Should keep track of an acount\'s staking balance', async () => {
      
      let holderUpstake = 0;
      let holderDownstake = 0;

      const stake = async (amount, supports) => {
        await this.app.stake(0, amount, supports, { from: stakeHolder1 });
        if(supports) holderUpstake += amount;
        else holderDownstake += amount;
      }

      const unstake = async (amount, supports, holder) => {
        await this.app.unstake(0, amount, supports, { from: stakeHolder1 });
        if(supports) holderUpstake -= amount;
        else holderDownstake -= amount;
      }

      await stake(10, true);
      await stake(2, false);
      await unstake(4, true);
      await stake(80, true);
      await stake(10, false);
      await unstake(5, false);

      expect((await this.app.getUpstake(0, stakeHolder1)).toString()).to.equal(`${holderUpstake}`);
      expect((await this.app.getDownstake(0, stakeHolder1)).toString()).to.equal(`${holderDownstake}`);
    });

    it('Should not allow unstaking from upstake if the stake was made in downstake, and viceversa', async () => {
      await this.app.stake(0, 10, true, { from: stakeHolder1 });
      await assertRevert(
        this.app.unstake(0, 10, false, { from: stakeHolder1 }),
        `SENDER_DOES_NOT_HAVE_REQUIRED_STAKE`
      );
    });

  });
});
