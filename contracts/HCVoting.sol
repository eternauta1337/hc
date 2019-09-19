pragma solidity ^0.4.24;

import "./ProposalBase.sol";

import "@aragon/os/contracts/apps/AragonApp.sol";
import "@aragon/os/contracts/common/IForwarder.sol";

import "@aragon/os/contracts/lib/math/SafeMath.sol";
import "@aragon/os/contracts/lib/math/SafeMath64.sol";

import "@aragon/apps-shared-minime/contracts/MiniMeToken.sol";


contract HCVoting is ProposalBase, IForwarder, AragonApp {
    using SafeMath for uint256;
    using SafeMath64 for uint64;

    /* ROLES */

    bytes32 public constant CREATE_PROPOSALS_ROLE = keccak256("CREATE_PROPOSALS_ROLE");
    bytes32 public constant CHANGE_SUPPORT_ROLE   = keccak256("CHANGE_SUPPORT_ROLE");

    /* ERRORS */

    string internal constant ERROR_BAD_REQUIRED_SUPPORT  = "HCVOTING_BAD_REQUIRED_SUPPORT";
    string internal constant ERROR_BAD_QUEUE_PERIOD      = "HCVOTING_BAD_QUEUE_PERIOD";
    string internal constant ERROR_BAD_PENDED_PERIOD     = "HCVOTING_BAD_PENDED_PERIOD";
    string internal constant ERROR_BAD_BOOST_PERIOD      = "HCVOTING_BAD_BOOST_PERIOD";
    string internal constant ERROR_BAD_ENDING_PERIOD     = "HCVOTING_BAD_ENDING_PERIOD";
    string internal constant ERROR_PROPOSAL_IS_RESOLVED  = "HCVOTING_PROPOSAL_IS_RESOLVED";
    string internal constant ERROR_PROPOSAL_IS_CLOSED    = "HCVOTING_PROPOSAL_IS_CLOSED";
    string internal constant ERROR_PROPOSAL_IS_BOOSTED   = "HCVOTING_PROPOSAL_IS_BOOSTED";
    string internal constant ERROR_ALREADY_VOTED         = "HCVOTING_ALREADY_VOTED";
    string internal constant ERROR_NO_VOTING_POWER       = "HCVOTING_NO_VOTING_POWER";
    string internal constant ERROR_NO_CONSENSUS          = "HCVOTING_NO_CONSENSUS";
    string internal constant ERROR_TOKEN_TRANSFER_FAILED = "HCVOTING_TOKEN_TRANSFER_FAILED";
    string internal constant ERROR_INSUFFICIENT_STAKE    = "HCVOTING_INSUFFICIENT_STAKE";
    string internal constant ERROR_HASNT_MAINTAINED_CONF = "HCVOTING_HASNT_MAINTAINED_CONF";
    string internal constant ERROR_ON_BOOST_PERIOD       = "HCVOTING_ON_BOOST_PERIOD";
    string internal constant ERROR_NOT_ENOUGH_CONFIDENCE = "HCVOTING_NOT_ENOUGH_CONFIDENCE";
    string internal constant ERROR_CAN_NOT_FORWARD       = "HCVOTING_CAN_NOT_FORWARD";
    string internal constant ERROR_ALREADY_EXECUTED      = "HCVOTING_ALREADY_EXECUTED";
    string internal constant ERROR_NOT_RESOLVED          = "HCVOTING_NOT_RESOLVED";
    string internal constant ERROR_NO_WINNING_STAKE      = "HCVOTING_NO_WINNING_STAKE";

    /* CONSTANTS */

    // Used to avoid integer precision loss in divisions.
    uint256 internal constant MILLION = 1000000;

    /* DATA STRUCURES */

    enum ProposalState {
        Queued,   // Proposal receiving votes and stake. Can be resolved with absolute consensus.
        Pended,   // Proposal received stake and has confidence. Is maintaining confidence for boosting.
        Boosted,  // Proposal is boosted and can be resolved with relative consensus.
        Resolved, // Proposal has been resolved and executed if it had positive consensus.
        Closed    // If boosted, proposal can be resolved. If not boosted, proposal expired and cannot receive votes or stake.
    }

    /* PROPERTIES */

    MiniMeToken public voteToken;
    MiniMeToken public stakeToken;

    uint256 public requiredSupport; // Expressed as parts per million, 51% = 510000
    uint64 public queuePeriod;
    uint64 public pendedPeriod;
    uint64 public boostPeriod;
    uint64 public endingPeriod;

    uint256 public numBoostedProposals;

    /* EVENTS */

    event ProposalCreated(uint256 indexed proposalId, address indexed creator, string metadata);
    event VoteCasted(uint256 indexed proposalId, address indexed voter, bool supports);
    event ProposalUpstaked(uint256 indexed proposalId, address indexed staker, uint256 amount);
    event ProposalDownstaked(uint256 indexed proposalId, address indexed staker, uint256 amount);
    event UpstakeWithdrawn(uint256 indexed proposalId, address indexed staker, uint256 amount);
    event DownstakeWithdrawn(uint256 indexed proposalId, address indexed staker, uint256 amount);
    event ProposalExecuted(uint256 indexed proposalId);
    event ProposalBoosted(uint256 indexed proposalId);
    event ProposalResolved(uint256 indexed proposalId);
    event RequiredSupportChanged(uint256 newSupport);

    /* INIT */

    /**
    * @notice Initialize HCVoting app
    * @param _voteToken MiniMeToken Governance token used for voting
    * @param _stakeToken MiniMeToken Token used for staking
    * @param _requiredSupport uint256 Minimal percentage (expressed in parts per million) of yeas in casted votes for a proposal to succeed
    * @param _queuePeriod uint256 Seconds that a proposal will be open for votes and staking while not being boosted
    * @param _pendedPeriod uint256 Seconds for which a proposal needs to maintain confidence for it to become boosted
    * @param _boostPeriod uint256 Seconds that a proposal will be open for votes but not staking while being boosted. Boosted proposals can only be resolved when this period elapses
    * @param _endingPeriod uint256 Seconds at the ending of _boostPeriod in which a support flip will cause _boostPeriod to be extended by another _endingPeriod
    */
    function initialize(
        MiniMeToken _voteToken,
        MiniMeToken _stakeToken,
        uint256 _requiredSupport,
        uint64 _queuePeriod,
        uint64 _pendedPeriod,
        uint64 _boostPeriod,
        uint64 _endingPeriod
    )
        public onlyInit
    {
        initialized();

        _validateRequiredSupport(_requiredSupport);
        require(_queuePeriod > 0, ERROR_BAD_QUEUE_PERIOD);
        require(_pendedPeriod > 0, ERROR_BAD_PENDED_PERIOD);
        require(_boostPeriod > 0, ERROR_BAD_BOOST_PERIOD);
        require(_endingPeriod > 0, ERROR_BAD_ENDING_PERIOD);
        require(_endingPeriod < _boostPeriod, ERROR_BAD_ENDING_PERIOD);

        voteToken = _voteToken;
        stakeToken = _stakeToken;
        requiredSupport = _requiredSupport;
        queuePeriod = _queuePeriod;
        pendedPeriod = _pendedPeriod;
        boostPeriod = _boostPeriod;
        endingPeriod = _endingPeriod;
    }

    /* PUBLIC */

    /**
    * @notice Create a new proposal about "`_metadata`" with the specified execution script
    * @param _executionScript EVM script to be executed on approval
    * @param _metadata string metadata
    */
    function propose(bytes _executionScript, string _metadata) public auth(CREATE_PROPOSALS_ROLE) {
        uint64 creationBlock = getBlockNumber64() - 1;
        require(voteToken.totalSupplyAt(creationBlock) > 0, ERROR_NO_VOTING_POWER);

        uint256 proposalId = numProposals;
        numProposals++;

        Proposal storage proposal_ = proposals[proposalId];
        proposal_.creationBlock = creationBlock;
        proposal_.executionScript = _executionScript;

        uint64 currentDate = getTimestamp64();
        proposal_.creationDate = currentDate;
        proposal_.closeDate = currentDate.add(queuePeriod);

        emit ProposalCreated(proposalId, msg.sender, _metadata);
    }

    /**
    * @notice Vote `_supports ? 'yes' : 'no'` in proposal #`_proposalId`
    * @param _proposalId Id for vote
    * @param _supports Whether voter supports the vote
    */
    function vote(uint256 _proposalId, bool _supports) public {
        Proposal storage proposal_ = _getProposal(_proposalId);

        ProposalState state = getState(_proposalId);
        require(state != ProposalState.Resolved, ERROR_PROPOSAL_IS_RESOLVED);
        require(state != ProposalState.Closed, ERROR_PROPOSAL_IS_CLOSED);

        uint256 userVotingPower = voteToken.balanceOfAt(msg.sender, proposal_.creationBlock);
        require(userVotingPower > 0, ERROR_NO_VOTING_POWER);

        // Reject re-voting.
        require(getUserVote(_proposalId, msg.sender) == Vote.Absent, ERROR_ALREADY_VOTED);

        // See "Quiet endings" below.
        Vote relativeConsensusBeforeVote = Vote.Absent;
        if (state == ProposalState.Boosted) {
            if (getTimestamp64() >= proposal_.closeDate.sub(endingPeriod)) {
                relativeConsensusBeforeVote = getConsensus(_proposalId, true);
            }
        }

        // Update user Vote and totalYeas/totalNays.
        if (_supports) {
            proposal_.totalYeas = proposal_.totalYeas.add(userVotingPower);
        } else {
            proposal_.totalNays = proposal_.totalNays.add(userVotingPower);
        }
        proposal_.votes[msg.sender] = _supports ? Vote.Yea : Vote.Nay;

        // Quite endings - Consensus flips in the ending period will cause closeDate extensions.
        if (relativeConsensusBeforeVote != Vote.Absent) {
            Vote relativeConsensusAfterVote = getConsensus(_proposalId, true);
            if (relativeConsensusAfterVote != relativeConsensusBeforeVote) {
                proposal_.closeDate = proposal_.closeDate.add(endingPeriod);
            }
        }

        emit VoteCasted(_proposalId, msg.sender, _supports);
    }

    /**
    * @notice Stake `_amount` tokens on proposal #`_proposalId`
    * @param _proposalId uint256 Id of proposal to stake on
    * @param _amount uint256 Amount of tokens to stake on proposal #`_proposalId`
    * @param _upstake bool Signal 'upstake' or 'downstake' on proposal #`_proposalId`
    */
    function stake(uint256 _proposalId, uint256 _amount, bool _upstake) public {
        Proposal storage proposal_ = _getProposal(_proposalId);

        ProposalState state = getState(_proposalId);
        require(state != ProposalState.Resolved, ERROR_PROPOSAL_IS_RESOLVED);
        require(state != ProposalState.Closed, ERROR_PROPOSAL_IS_CLOSED);
        require(state != ProposalState.Boosted, ERROR_PROPOSAL_IS_BOOSTED);

        if (_upstake) {
            proposal_.totalUpstake = proposal_.totalUpstake.add(_amount);
            proposal_.upstakes[msg.sender] = proposal_.upstakes[msg.sender].add(_amount);

            emit ProposalUpstaked(_proposalId, msg.sender, _amount);
        } else {
            proposal_.totalDownstake = proposal_.totalDownstake.add(_amount);
            proposal_.downstakes[msg.sender] = proposal_.downstakes[msg.sender].add(_amount);

            emit ProposalDownstaked(_proposalId, msg.sender, _amount);
        }

        require(
            stakeToken.transferFrom(msg.sender, address(this), _amount),
            ERROR_TOKEN_TRANSFER_FAILED
        );

        _evaluatePended(_proposalId, proposal_);
    }

    /**
    * @notice Withdraw stake `_amount` tokens from proposal #`_proposalId`
    * @param _proposalId uint256 Id of proposal to remove stake from
    * @param _amount uint256 Amount of tokens to remove stake from proposal #`_proposalId`
    * @param _upstake bool Indicate the removal from 'upstake' or 'downstake' on proposal #`_proposalId`
    */
    function unstake(uint256 _proposalId, uint256 _amount, bool _upstake) public {
        Proposal storage proposal_ = _getProposal(_proposalId);

        ProposalState state = getState(_proposalId);
        require(state != ProposalState.Resolved, ERROR_PROPOSAL_IS_RESOLVED);
        require(state != ProposalState.Boosted, ERROR_PROPOSAL_IS_BOOSTED);

        if (_upstake) {
            require(getUserUpstake(_proposalId, msg.sender) >= _amount, ERROR_INSUFFICIENT_STAKE);

            proposal_.totalUpstake = proposal_.totalUpstake.sub(_amount);
            proposal_.upstakes[msg.sender] = proposal_.upstakes[msg.sender].sub(_amount);

            emit UpstakeWithdrawn(_proposalId, msg.sender, _amount);
        } else {
            require(getUserDownstake(_proposalId, msg.sender) >= _amount, ERROR_INSUFFICIENT_STAKE);

            proposal_.totalDownstake = proposal_.totalDownstake.sub(_amount);
            proposal_.downstakes[msg.sender] = proposal_.downstakes[msg.sender].sub(_amount);

            emit DownstakeWithdrawn(_proposalId, msg.sender, _amount);
        }

        require(
            stakeToken.transfer(msg.sender, _amount),
            ERROR_TOKEN_TRANSFER_FAILED
        );

        _evaluatePended(_proposalId, proposal_);
    }

    /**
    * @notice Boost proposal #`_proposalId`
    * @param _proposalId uint256 Id of proposal to boost
    */
    function boost(uint256 _proposalId) public {
        Proposal storage proposal_ = _getProposal(_proposalId);

        ProposalState state = getState(_proposalId);
        require(state != ProposalState.Resolved, ERROR_PROPOSAL_IS_RESOLVED);
        require(state != ProposalState.Closed, ERROR_PROPOSAL_IS_CLOSED);
        require(state != ProposalState.Boosted, ERROR_PROPOSAL_IS_BOOSTED);

        require(hasMaintainedConfidence(_proposalId), ERROR_HASNT_MAINTAINED_CONF);

        proposal_.boosted = true;
        proposal_.closeDate = proposal_.pendedDate.add(boostPeriod);

        numBoostedProposals = numBoostedProposals.add(1);

        emit ProposalBoosted(_proposalId);
    }

    /**
    * @notice Resolve proposal #`_proposalId`
    * @param _proposalId uint256 Id of proposal to resolve
    */
    function resolve(uint256 _proposalId) public {
        Proposal storage proposal_ = _getProposal(_proposalId);

        ProposalState state = getState(_proposalId);
        require(state != ProposalState.Resolved, ERROR_PROPOSAL_IS_RESOLVED);

        // Try to resolve with absolute consensus, otherwise try relative consensus if boosted.
        Vote support = getConsensus(_proposalId, false);
        if (support == Vote.Absent && state == ProposalState.Boosted) {
            require(getTimestamp64() >= proposal_.closeDate, ERROR_ON_BOOST_PERIOD);
            support = getConsensus(_proposalId, true);
        }
        require(support != Vote.Absent, ERROR_NO_CONSENSUS);

        if (state == ProposalState.Boosted) {
            numBoostedProposals = numBoostedProposals.sub(1);
        }

        proposal_.resolved = true;

        if (support == Vote.Yea) {
            _executeProposal(_proposalId, proposal_);
        }

        emit ProposalResolved(_proposalId);
    }

    /**
    * @notice Withdraw stake from resolved proposal, including rewards from winning stakes
    * @param _proposalId uint256 Id of proposal to withdraw stake from
    */
    function withdraw(uint256 _proposalId) public {
        Proposal storage proposal_ = proposals[_proposalId];

        ProposalState state = getState(_proposalId);
        require(state == ProposalState.Resolved, ERROR_NOT_RESOLVED);

        bool supported = proposal_.totalYeas > proposal_.totalNays;

        uint256 winningStake = supported ? proposal_.upstakes[msg.sender] : proposal_.downstakes[msg.sender];
        require(winningStake > 0, ERROR_NO_WINNING_STAKE);

        // Winners split the loosing pot pro-rata.
        uint256 totalWinningStake = supported ? proposal_.totalUpstake : proposal_.totalDownstake;
        uint256 totalLosingStake = supported ? proposal_.totalDownstake : proposal_.totalUpstake;
        uint256 sendersWinningRatio = winningStake.mul(MILLION).div(totalWinningStake);
        uint256 reward = sendersWinningRatio.mul(totalLosingStake).div(MILLION);
        uint256 total = winningStake.add(reward);

        require(
            stakeToken.transfer(msg.sender, total),
            ERROR_TOKEN_TRANSFER_FAILED
        );
    }

    /* CALCULATED PROPERTIES */

    function getState(uint256 _proposalId) public view returns (ProposalState) {
        Proposal storage proposal_ = _getProposal(_proposalId);

        if (proposal_.resolved) {
            return ProposalState.Resolved;
        }

        if (proposal_.boosted) {
            return ProposalState.Boosted;
        }

        if (getTimestamp64() >= proposal_.closeDate) {
            return ProposalState.Closed;
        }

        if (proposal_.pendedDate > 0) {
            return ProposalState.Pended;
        }

        return ProposalState.Queued;
    }

    function getConsensus(uint256 _proposalId, bool _relative) public view returns (Vote) {
        uint256 yeaPPM = getSupport(_proposalId, true, _relative);
        if (yeaPPM > requiredSupport) {
            return Vote.Yea;
        }

        uint256 nayPPM = getSupport(_proposalId, false, _relative);
        if (nayPPM > requiredSupport) {
            return Vote.Nay;
        }

        return Vote.Absent;
    }

    function getSupport(uint _proposalId, bool _supports, bool _relative) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);

        uint256 votingPower = _relative ? proposal_.totalYeas.add(proposal_.totalNays) : voteToken.totalSupplyAt(proposal_.creationBlock);
        uint256 votes = _supports ? proposal_.totalYeas : proposal_.totalNays;

        return votes.mul(MILLION).div(votingPower);
    }

    function getConfidence(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);

        if (proposal_.totalDownstake == 0) {
            return proposal_.totalUpstake.mul(MILLION);
        }

        return proposal_.totalUpstake.mul(MILLION).div(proposal_.totalDownstake);
    }

    function hasConfidence(uint256 _proposalId) public view returns (bool) {
        uint256 exponent = numBoostedProposals + 1;
        uint256 confidenceThreshold = (uint256(4) ** exponent).mul(MILLION);
        return getConfidence(_proposalId) >= confidenceThreshold;
    }

    function hasMaintainedConfidence(uint256 _proposalId) public view returns (bool) {
        Proposal storage proposal_ = _getProposal(_proposalId);

        if (proposal_.pendedDate == 0) {
            return false;
        }

        if (!hasConfidence(_proposalId)) {
            return false;
        }

        return getTimestamp64() >= proposal_.pendedDate.add(pendedPeriod);
    }

    /* FORWARDING */

    function isForwarder() external pure returns (bool) {
        return true;
    }

    function forward(bytes _evmScript) public {
        require(canForward(msg.sender, _evmScript), ERROR_CAN_NOT_FORWARD);
        propose(_evmScript, "");
    }

    function canForward(address _sender, bytes) public view returns (bool) {
        return canPerform(_sender, CREATE_PROPOSALS_ROLE, arr());
    }

	/* VALIDATORS */

    function _validateRequiredSupport(uint256 _requiredSupport) internal {
        require(_requiredSupport > 0, ERROR_BAD_REQUIRED_SUPPORT);
        require(_requiredSupport <= MILLION, ERROR_BAD_REQUIRED_SUPPORT);
    }

    /* SETTERS */

    /**
    * @notice Change required support to approve a proposal. Expressed in parts per million, i.e. 51% = 510000.
    * @param _newRequiredSupport uint256 New required support
    */
    function changeRequiredSupport(uint256 _newRequiredSupport) public auth(CHANGE_SUPPORT_ROLE) {
        _validateRequiredSupport(_newRequiredSupport);
        requiredSupport = _newRequiredSupport;

        emit RequiredSupportChanged(requiredSupport);
    }

    /* INTERNAL */

    function _evaluatePended(uint256 _proposalId, Proposal storage proposal_) internal {
        ProposalState state = getState(_proposalId);
        if (state == ProposalState.Resolved || state == ProposalState.Boosted) {
            return;
        }

        if (hasConfidence(_proposalId)) {
            if (state == ProposalState.Queued) {
                proposal_.pendedDate = getTimestamp64();
            }
        } else {
            if (state == ProposalState.Pended) {
                proposal_.pendedDate = 0;
            }
        }
    }

    function _executeProposal(uint256 _proposalId, Proposal storage proposal_) internal {
        require(!proposal_.executed, ERROR_ALREADY_EXECUTED);

        address[] memory blacklist = new address[](0);
        bytes memory input = new bytes(0);
        runScript(proposal_.executionScript, input, blacklist);

        proposal_.executed = true;

        emit ProposalExecuted(_proposalId);
    }
}
