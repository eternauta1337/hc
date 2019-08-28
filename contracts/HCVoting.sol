import "./ProposalBase.sol";

import "@aragon/os/contracts/apps/AragonApp.sol";
import "@aragon/os/contracts/common/IForwarder.sol";

import "@aragon/os/contracts/lib/math/SafeMath.sol";
import "@aragon/os/contracts/lib/math/SafeMath64.sol";

import "@aragon/apps-shared-minime/contracts/MiniMeToken.sol";


contract HCVoting is ProposalBase, IForwarder, AragonApp {
    using SafeMath for uint256;
    using SafeMath64 for uint64;

    /*
     * Roles
     */

    bytes32 public constant CREATE_PROPOSALS_ROLE = keccak256("CREATE_PROPOSALS_ROLE");
    bytes32 public constant CHANGE_SUPPORT_ROLE   = keccak256("CHANGE_SUPPORT_ROLE");

    /*
     * Errors
     */

    string internal constant ERROR_BAD_REQUIRED_SUPPORT  = "HCVOTING_BAD_REQUIRED_SUPPORT";
    string internal constant ERROR_BAD_QUEUE_PERIOD      = "HCVOTING_BAD_QUEUE_PERIOD";
    string internal constant ERROR_BAD_PENDED_PERIOD     = "HCVOTING_BAD_PENDED_PERIOD";
    string internal constant ERROR_BAD_BOOST_PERIOD      = "HCVOTING_BAD_BOOST_PERIOD";
    string internal constant ERROR_PROPOSAL_IS_RESOLVED  = "HCVOTING_PROPOSAL_IS_RESOLVED";
    string internal constant ERROR_PROPOSAL_IS_CLOSED    = "HCVOTING_PROPOSAL_IS_CLOSED";
    string internal constant ERROR_PROPOSAL_IS_BOOSTED   = "HCVOTING_PROPOSAL_IS_BOOSTED";
    string internal constant ERROR_REDUNDANT_VOTE        = "HCVOTING_REDUNDANT_VOTE";
    string internal constant ERROR_NO_VOTING_POWER       = "HCVOTING_NO_VOTING_POWER";
    string internal constant ERROR_NO_CONSENSUS          = "HCVOTING_NO_CONSENSUS";
    string internal constant ERROR_TOKEN_TRANSFER_FAILED = "HCVOTING_TOKEN_TRANSFER_FAILED";
    string internal constant ERROR_INSUFFICIENT_STAKE    = "HCVOTING_INSUFFICIENT_STAKE";
    string internal constant ERROR_HASNT_MAINTAINED_CONF = "HCVOTING_HASNT_MAINTAINED_CONF";
    string internal constant ERROR_ON_BOOST_PERIOD       = "HCVOTING_ON_BOOST_PERIOD";
    string internal constant ERROR_NOT_ENOUGH_CONFIDENCE = "HCVOTING_NOT_ENOUGH_CONFIDENCE";
    string internal constant ERROR_CAN_NOT_FORWARD       = "HCVOTING_CAN_NOT_FORWARD";
    string internal constant ERROR_ALREADY_EXECUTED      = "HCVOTING_ALREADY_EXECUTED";

    /*
     * Events
     */

    event ProposalCreated(uint256 proposalId, address creator, string metadata);
    event VoteCasted(uint256 proposalId, address voter, bool supports);
    event ProposalUpstaked(uint256 proposalId, address staker, uint256 amount);
    event ProposalDownstaked(uint256 proposalId, address staker, uint256 amount);
    event UpstakeWithdrawn(uint256 proposalId, address staker, uint256 amount);
    event DownstakeWithdrawn(uint256 proposalId, address staker, uint256 amount);
    event ProposalExecuted(uint256 proposalId);
    event ProposalBoosted(uint256 proposalId);
    event ProposalResolved(uint256 proposalId);

    /*
     * Constants
     */

    uint256 internal constant MILLION = 1000000;

    /*
     * Data strucures
     */

    enum ProposalState {
        Queued,
        Pended,
        Boosted,
        Resolved,
        Closed
    }

    /*
     * Properties
     */

    MiniMeToken public voteToken;
    MiniMeToken public stakeToken;

    uint256 public requiredSupport; // Expressed in parts per million, 51% = 510000
    uint64 public queuePeriod;
    uint64 public pendedPeriod;
    uint64 public boostPeriod;

    /*
     * Init
     */

    function initialize(
        MiniMeToken _voteToken,
        MiniMeToken _stakeToken,
        uint256 _requiredSupport,
        uint64 _queuePeriod,
        uint64 _pendedPeriod,
        uint64 _boostPeriod
    )
        public onlyInit
    {
        require(_requiredSupport > 0, ERROR_BAD_REQUIRED_SUPPORT);
        require(_queuePeriod > 0, ERROR_BAD_QUEUE_PERIOD);
        require(_pendedPeriod > 0, ERROR_BAD_PENDED_PERIOD);
        require(_boostPeriod > 0, ERROR_BAD_BOOST_PERIOD);

        voteToken = _voteToken;
        stakeToken = _stakeToken;
        requiredSupport = _requiredSupport;
        queuePeriod = _queuePeriod;
        pendedPeriod = _pendedPeriod;
        boostPeriod = _boostPeriod;

        initialized();
    }

    /*
     * Public
     */

    function createProposal(bytes _executionScript, string _metadata) public auth(CREATE_PROPOSALS_ROLE) {
        uint64 creationBlock = getBlockNumber64() - 1;
        require(voteToken.totalSupplyAt(creationBlock) > 0, ERROR_NO_VOTING_POWER);

        uint256 proposalId = numProposals;
        numProposals++;

        Proposal storage proposal_ = _getProposal(proposalId);
        proposal_.creationBlock = creationBlock;
        proposal_.executionScript = _executionScript;

        uint64 currentDate = getTimestamp64();
        proposal_.creationDate = currentDate;
        proposal_.closeDate = currentDate.add(queuePeriod);

        emit ProposalCreated(proposalId, msg.sender, _metadata);
    }

    function vote(uint256 _proposalId, bool _supports) public {
        Proposal storage proposal_ = _getProposal(_proposalId);

        ProposalState state = getProposalState(_proposalId);
        require(state != ProposalState.Resolved, ERROR_PROPOSAL_IS_RESOLVED);
        require(state != ProposalState.Closed, ERROR_PROPOSAL_IS_CLOSED);

        uint256 userVotingPower = voteToken.balanceOfAt(msg.sender, proposal_.creationBlock);
        require(userVotingPower > 0, ERROR_NO_VOTING_POWER);

        Vote previousVote = proposal_.votes[msg.sender];
        require(
            previousVote == Vote.Absent || !(previousVote == Vote.Yea && _supports || previousVote == Vote.Nay && !_supports),
            ERROR_REDUNDANT_VOTE
        );

        if (previousVote == Vote.Absent) {
            if (_supports) {
                proposal_.totalYeas = proposal_.totalYeas.add(userVotingPower);
            } else {
                proposal_.totalNays = proposal_.totalNays.add(userVotingPower);
            }
        } else {
            if (previousVote == Vote.Yea && !_supports) {
                proposal_.totalYeas = proposal_.totalYeas.sub(userVotingPower);
                proposal_.totalNays = proposal_.totalNays.add(userVotingPower);
            } else if (previousVote == Vote.Nay && _supports) {
                proposal_.totalNays = proposal_.totalNays.sub(userVotingPower);
                proposal_.totalYeas = proposal_.totalYeas.add(userVotingPower);
            }
        }

        proposal_.votes[msg.sender] = _supports ? Vote.Yea : Vote.Nay;

        emit VoteCasted(_proposalId, msg.sender, _supports);
    }

    function upstake(uint256 _proposalId, uint256 _amount) public {
        _stake(_proposalId, _amount, true);
    }

    function downstake(uint256 _proposalId, uint256 _amount) public {
        _stake(_proposalId, _amount, false);
    }

    function withdrawUpstake(uint256 _proposalId, uint256 _amount) public {
        _withdrawStake(_proposalId, _amount, true);
    }

    function withdrawDownstake(uint256 _proposalId, uint256 _amount) public {
        _withdrawStake(_proposalId, _amount, false);
    }

    function boostProposal(uint256 _proposalId) public {
        Proposal storage proposal_ = _getProposal(_proposalId);

        ProposalState state = getProposalState(_proposalId);
        require(state != ProposalState.Resolved, ERROR_PROPOSAL_IS_RESOLVED);
        require(state != ProposalState.Closed, ERROR_PROPOSAL_IS_CLOSED);
        require(state != ProposalState.Boosted, ERROR_PROPOSAL_IS_BOOSTED);

        require(proposalHasConfidence(_proposalId), ERROR_NOT_ENOUGH_CONFIDENCE);
        require(proposalHasMaintainedConfidence(_proposalId), ERROR_HASNT_MAINTAINED_CONF);

        proposal_.boosted = true;
        proposal_.closeDate = getTimestamp64().add(boostPeriod);

        emit ProposalBoosted(_proposalId);
    }

    function resolveProposal(uint256 _proposalId) public {
        Proposal storage proposal_ = _getProposal(_proposalId);

        ProposalState state = getProposalState(_proposalId);
        require(state != ProposalState.Resolved, ERROR_PROPOSAL_IS_RESOLVED);

        Vote support = getProposalConsensus(_proposalId, false);
        if (support == Vote.Absent && state == ProposalState.Boosted) {
            require(getTimestamp64() >= proposal_.closeDate, ERROR_ON_BOOST_PERIOD);
            support = getProposalConsensus(_proposalId, true);
        }
        require(support != Vote.Absent, ERROR_NO_CONSENSUS);

        proposal_.resolved = true;

        if (support == Vote.Yea) {
            _executeProposal(_proposalId);
        }

        emit ProposalResolved(_proposalId);
    }

    /*
     * Calculated properties
     */

    function getProposalState(uint256 _proposalId) public view returns (ProposalState) {
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

    function getProposalConsensus(uint256 _proposalId, bool _relative) public view returns (Vote) {
        uint256 yeaPPM = getProposalSupport(_proposalId, true, _relative);
        uint256 nayPPM = getProposalSupport(_proposalId, false, _relative);

        if (yeaPPM > requiredSupport) {
            return Vote.Yea;
        }

        if (nayPPM > requiredSupport) {
            return Vote.Nay;
        }

        return Vote.Absent;
    }

    function getProposalSupport(uint _proposalId, bool _supports, bool _relative) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);

        uint256 votingPower = _relative ? proposal_.totalYeas.add(proposal_.totalNays) : voteToken.totalSupplyAt(proposal_.creationBlock);
        uint256 votes = _supports ? proposal_.totalYeas : proposal_.totalNays;

        return votes.mul(MILLION).div(votingPower);
    }

    function getProposalConfidence(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);

        if (proposal_.totalDownstake == 0) {
            return proposal_.totalUpstake.mul(MILLION);
        }

        return proposal_.totalUpstake.mul(MILLION).div(proposal_.totalDownstake);
    }

    function proposalHasConfidence(uint256 _proposalId) public view returns (bool) {
        return getProposalConfidence(_proposalId) >= uint256(4).mul(MILLION);
    }

    function proposalHasMaintainedConfidence(uint256 _proposalId) public view returns (bool) {
        Proposal storage proposal_ = _getProposal(_proposalId);

        if (proposal_.pendedDate == 0) {
            return false;
        }

        if (!proposalHasConfidence(_proposalId)) {
            return false;
        }

        return getTimestamp64() >= proposal_.pendedDate.add(pendedPeriod);
    }

    /*
     * Internal
     */

    function _stake(uint256 _proposalId, uint256 _amount, bool _upstake) internal {
        Proposal storage proposal_ = _getProposal(_proposalId);

        ProposalState state = getProposalState(_proposalId);
        require(state != ProposalState.Resolved, ERROR_PROPOSAL_IS_RESOLVED);
        require(state != ProposalState.Closed, ERROR_PROPOSAL_IS_CLOSED);

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

        _updatePendedDate(_proposalId);
    }

    function _withdrawStake(uint256 _proposalId, uint256 _amount, bool _upstake) internal {
        Proposal storage proposal_ = _getProposal(_proposalId);

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

        _updatePendedDate(_proposalId);
    }

    function _updatePendedDate(uint256 _proposalId) internal {
        Proposal storage proposal_ = _getProposal(_proposalId);

        ProposalState state = getProposalState(_proposalId);
        if (state == ProposalState.Resolved || state == ProposalState.Boosted) {
            return;
        }

        if (proposalHasConfidence(_proposalId)) {
            if (state == ProposalState.Queued) {
                proposal_.pendedDate = getTimestamp64();
            }
        } else {
            if (state == ProposalState.Pended) {
                proposal_.pendedDate = 0;
            }
        }
    }

    function _executeProposal(uint256 _proposalId) internal {
        Proposal storage proposal_ = _getProposal(_proposalId);
        require(!proposal_.executed, ERROR_ALREADY_EXECUTED);

        address[] memory blacklist = new address[](0);
        bytes memory input = new bytes(0);
        runScript(proposal_.executionScript, input, blacklist);

        proposal_.executed = true;

        emit ProposalExecuted(_proposalId);
    }

    /*
     * Forwarding
     */

    function isForwarder() external pure returns (bool) {
        return true;
    }

    function forward(bytes _evmScript) public {
        require(canForward(msg.sender, _evmScript), ERROR_CAN_NOT_FORWARD);
        createProposal(_evmScript, "");
    }

    function canForward(address _sender, bytes) public view returns (bool) {
        return canPerform(_sender, CREATE_PROPOSALS_ROLE, arr());
    }

    /*
     * Setters
     */

    function changeRequiredSupport(uint256 _newRequiredSupport) public auth(CHANGE_SUPPORT_ROLE) {
        require(_newRequiredSupport > 0, ERROR_BAD_REQUIRED_SUPPORT);
        requiredSupport = _newRequiredSupport;
    }
}
