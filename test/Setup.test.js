const { 
  HCVoting,
  defaultSetup,
  deployDAOFactory,
  deployDAO,
  deployTokens,
  deployApp,
  SUPPORT_PERCENT,
  QUEUE_PERIOD_SECS,
  PENDED_BOOST_PERIOD_SECS,
  BOOST_PERIOD_SECS,
  QUIET_ENDING_PERIOD_SECS,
  CONFIDENCE_THRESHOLD_BASE,
  COMPENSATION_FEE_PERCENT,
  ANY_ADDRESS
} = require('./common.js');
const { assertRevert } = require('@aragon/test-helpers/assertThrow');
const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript');

contract('HCVoting', ([appManager]) => {

  describe('When interacting with the base app', () => {
    
    beforeEach(async () => {
      await deployTokens(this);
      this.base = await HCVoting.new();
    });

    it('It is petrified and cannot be initialized', async () => {
      assert.isTrue(await this.base.isPetrified());
      await assertRevert(
        this.base.initialize(
          this.voteToken.address, 
          this.stakeToken.address, 
          SUPPORT_PERCENT,
          QUEUE_PERIOD_SECS,
          BOOST_PERIOD_SECS,
          QUIET_ENDING_PERIOD_SECS,
          PENDED_BOOST_PERIOD_SECS,
          CONFIDENCE_THRESHOLD_BASE
        )
      );
    });
  });

  describe('When initializing the app with valid parameters', () => {

    beforeEach(() => defaultSetup(this, appManager));
    
    it('Tokens get deployed', async () => {
      expect(web3.isAddress(this.voteToken.address)).to.be.true;
      expect(web3.isAddress(this.stakeToken.address)).to.be.true;
    });

    it('Tokens are set correctly', async () => {
      expect((await this.app.voteToken()).toString()).to.equal(this.voteToken.address);
      expect((await this.app.stakeToken()).toString()).to.equal(this.stakeToken.address);
    });

    it('App gets deployed', async () => {
      expect(web3.isAddress(this.app.address)).to.equal(true);
    });

    it('App parameters are set correctly', async () => {
      expect((await this.app.supportPct()).toString()).to.equal(`${SUPPORT_PERCENT}`);
      expect((await this.app.queuePeriod()).toString()).to.equal(`${QUEUE_PERIOD_SECS}`);
      expect((await this.app.pendedBoostPeriod()).toString()).to.equal(`${PENDED_BOOST_PERIOD_SECS}`);
      expect((await this.app.boostPeriod()).toString()).to.equal(`${BOOST_PERIOD_SECS}`);
      expect((await this.app.quietEndingPeriod()).toString()).to.equal(`${QUIET_ENDING_PERIOD_SECS}`);
    });

    it('App cannot be re-initialized', async () => {
      await assertRevert(
        this.app.initialize(
          this.voteToken.address, 
          this.stakeToken.address, 
          SUPPORT_PERCENT,
          QUEUE_PERIOD_SECS,
          BOOST_PERIOD_SECS,
          QUIET_ENDING_PERIOD_SECS,
          PENDED_BOOST_PERIOD_SECS,
          CONFIDENCE_THRESHOLD_BASE
        ),
        `INIT_ALREADY_INITIALIZED`
      );

    });
    it('The app is a forwarder', async () => {
      assert.isTrue(await this.app.isForwarder());
    })
  });

  describe('When attempting to interact with an un-initialized app', () => {
    
    beforeEach(async () => {
      await deployDAOFactory(this);
      await deployDAO(this, appManager);
      await deployApp(this, appManager);
      await deployTokens(this);
    });

    it('Reverts when trying to create a proposal', async () => {
      await assertRevert(
        this.app.createProposal(EMPTY_SCRIPT, "Some proposal"),
        `APP_AUTH_FAILED`
      );
    });
  });

  describe('When initializing the app with invalid parameters', () => {
    
    beforeEach(async () => {
      await deployDAOFactory(this);
      await deployDAO(this, appManager);
      await deployApp(this, appManager);
      await deployTokens(this);
    });

    it('Fails when using an invalid supportPct value', async () => {
      await assertRevert(
        this.app.initialize(
          this.voteToken.address, 
          this.stakeToken.address, 
          101,
          QUEUE_PERIOD_SECS,
          BOOST_PERIOD_SECS,
          QUIET_ENDING_PERIOD_SECS,
          PENDED_BOOST_PERIOD_SECS,
          CONFIDENCE_THRESHOLD_BASE
        ),
        `INVALID_SUPPORT_PCT`
      );
      await assertRevert(
        this.app.initialize(
          this.voteToken.address, 
          this.stakeToken.address, 
          49,
          QUEUE_PERIOD_SECS,
          BOOST_PERIOD_SECS,
          QUIET_ENDING_PERIOD_SECS,
          PENDED_BOOST_PERIOD_SECS,
          CONFIDENCE_THRESHOLD_BASE
        ),
        `INVALID_SUPPORT_PCT`
      );
    });

    // TODO: Implement other validators

  });

});
