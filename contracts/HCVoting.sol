import "@aragon/os/contracts/apps/AragonApp.sol";
import "@aragon/os/contracts/common/IForwarder.sol";

import "@aragon/os/contracts/lib/math/SafeMath.sol";
import "@aragon/os/contracts/lib/math/SafeMath64.sol";

import "@aragon/apps-shared-minime/contracts/MiniMeToken.sol";


contract HCVoting is IForwarder, AragonApp {
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

    string internal constant ERROR_PROPOSAL_DOES_NOT_EXIST = "HCVOTING_PROPOSAL_DOES_NOT_EXIST";
    string internal constant ERROR_VOTE_ALREADY_CASTED     = "HCVOTING_VOTE_ALREADY_CASTED";
    string internal constant ERROR_NO_VOTING_POWER         = "HCVOTING_NO_VOTING_POWER";
    string internal constant ERROR_INVALID_SUPPORT         = "HCVOTING_INVALID_SUPPORT";
    string internal constant ERROR_CAN_NOT_FORWARD         = "HCVOTING_CAN_NOT_FORWARD";
    string internal constant ERROR_NOT_ENOUGH_SUPPORT      = "HCVOTING_NOT_ENOUGH_SUPPORT";
    string internal constant ERROR_PROPOSAL_IS_RESOLVED    = "HCVOTING_PROPOSAL_IS_RESOLVED";
    string internal constant ERROR_PROPOSAL_IS_CLOSED      = "HCVOTING_PROPOSAL_IS_CLOSED";
    string internal constant ERROR_TOKEN_TRANSFER_FAILED   = "HCVOTING_TOKEN_TRANSFER_FAILED";
    string internal constant ERROR_INSUFFICIENT_STAKE      = "HCVOTING_INSUFFICIENT_STAKE";
    string internal constant ERROR_INVALID_DURATION        = "HCVOTING_INVALID_DURATION";
    string internal constant ERROR_INV_BOOSTING_DURATION   = "HCVOTING_INV_BOOSTING_DURATION";
    string internal constant ERROR_INV_BOOSTED_DURATION    = "HCVOTING_INV_BOOSTED_DURATION";
    string internal constant ERROR_PROPOSAL_STILL_BOOSTING = "HCVOTING_PROPOSAL_STILL_BOOSTING";
    string internal constant ERROR_PROPOSAL_NOT_BOOSTING   = "HCVOTING_PROPOSAL_NOT_BOOSTING";
    string internal constant ERROR_NOT_ENOUGH_CONFIDENCE   = "HCVOTING_NOT_ENOUGH_CONFIDENCE";
    string internal constant ERROR_PROPOSAL_IS_BOOSTED     = "HCVOTING_PROPOSAL_IS_BOOSTED";

    /*
     * Events
     */

    event ProposalCreated(uint256 proposalId, address creator, string metadata);
    event VoteCasted(uint256 proposalId, address voter, bool supports);
    event ProposalUpstaked(uint256 proposalId, address staker, uint256 amount);
    event ProposalDownstaked(uint256 proposalId, address staker, uint256 amount);
    event UpstakeWithdrawn(uint256 proposalId, address staker, uint256 amount);
    event DownstakeWithdrawn(uint256 proposalId, address staker, uint256 amount);

    /*
     * Constants
     */

    uint256 public constant MILLION = 1000000;

    /*
     * Properties
     */

    enum Vote { Absent, Yea, Nay }

    enum ProposalState {
        Active,
        Boosting,
        Boosted,
        Resolved,
        Closed
    }

    struct Proposal {
        uint64 creationDate;
        uint64 closeDate;
        uint64 boostingDate;
        uint64 creationBlock;
        bytes executionScript;
        bool boosted;
        bool executed;
        uint256 totalYeas;
        uint256 totalNays;
        mapping (address => Vote) votes;
        uint256 totalUpstake;
        uint256 totalDownstake;
        mapping (address => uint256) upstakes;
        mapping (address => uint256) downstakes;
    }

    mapping (uint256 => Proposal) proposals;
    uint256 public numProposals;

    MiniMeToken public voteToken;
    MiniMeToken public stakeToken;

    uint256 public supportPPM;
    uint64 public proposalDuration;
    uint64 public boostingDuration;
    uint64 public boostedDuration;

    /*
     * Set properties
     */

    function changeSupportPPM(uint256 _newSupportPPM) public auth(CHANGE_SUPPORT_ROLE) {
        require(_newSupportPPM > 0, ERROR_INVALID_SUPPORT);
        supportPPM = _newSupportPPM;
    }

    /*
     * Init
     */

    function initialize(
        MiniMeToken _voteToken,
        MiniMeToken _stakeToken,
        uint256 _supportPPM,
        uint64 _proposalDuration,
        uint64 _boostingDuration,
        uint64 _boostedDuration
    )
        public onlyInit
    {
        require(_supportPPM > 0, ERROR_INVALID_SUPPORT);
        require(_proposalDuration > 0, ERROR_INVALID_DURATION);
        require(_boostingDuration > 0, ERROR_INV_BOOSTING_DURATION);
        require(_boostedDuration > 0, ERROR_INV_BOOSTED_DURATION);

        initialized();

        voteToken = _voteToken;
        stakeToken = _stakeToken;
        supportPPM = _supportPPM;
        proposalDuration = _proposalDuration;
        boostingDuration = _boostingDuration;
        boostedDuration = _boostedDuration;
    }

    /*
     * Public
     */

    function createProposal(bytes _executionScript, string _metadata) public auth(CREATE_PROPOSALS_ROLE) {
        uint256 proposalId = numProposals;
        numProposals++;

        Proposal storage proposal_ = _getProposal(proposalId);
        uint64 creationBlock = getBlockNumber64() - 1;
        proposal_.creationBlock = creationBlock;
        proposal_.executionScript = _executionScript;

        uint64 currentDate = getTimestamp64();
        proposal_.creationDate = currentDate;
        proposal_.closeDate = currentDate.add(proposalDuration);

        emit ProposalCreated(proposalId, msg.sender, _metadata);
    }

    function vote(uint256 _proposalId, bool _supports) public {
        Proposal storage proposal_ = _getProposal(_proposalId);

        ProposalState state = getProposalState(_proposalId);
        require(state != ProposalState.Resolved, ERROR_PROPOSAL_IS_RESOLVED);
        require(state != ProposalState.Closed, ERROR_PROPOSAL_IS_CLOSED);

        uint256 userVotingPower = voteToken.balanceOfAt(msg.sender, proposal_.creationBlock);
        require(userVotingPower > 0, ERROR_NO_VOTING_POWER);

        // Reject redundant votes.
        Vote previousVote = proposal_.votes[msg.sender];
        require(
            previousVote == Vote.Absent || !(previousVote == Vote.Yea && _supports || previousVote == Vote.Nay && !_supports),
            ERROR_VOTE_ALREADY_CASTED
        );

        // Update yea/nay count.
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

        // Update vote record for the sender.
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

        require(hasConfidence(_proposalId), ERROR_NOT_ENOUGH_CONFIDENCE);
        require(hasMaintainedConfidence(_proposalId), ERROR_PROPOSAL_STILL_BOOSTING);

        proposal_.boosted = true;
        proposal_.closeDate = proposal_.creationDate.add(boostedDuration);
    }

    function executeProposal(uint256 _proposalId) public {
        Proposal storage proposal_ = _getProposal(_proposalId);

        ProposalState state = getProposalState(_proposalId);
        require(state != ProposalState.Resolved, ERROR_PROPOSAL_IS_RESOLVED);

        // require(getProposalSupport(_proposalId), ERROR_NOT_ENOUGH_SUPPORT);
        bool supported = getProposalSupport(_proposalId);
        if (!supported && state == ProposalState.Boosted) {
            require(getTimestamp64() > proposal_.closeDate, ERROR_PROPOSAL_STILL_BOOSTING);
            uint256 relativeVotingPower = proposal_.totalYeas.add(proposal_.totalNays);
            supported = getProposalSupport(_proposalId, relativeVotingPower);
        }
        require(supported, ERROR_NOT_ENOUGH_SUPPORT);

        address[] memory blacklist = new address[](0);
        bytes memory input = new bytes(0);
        runScript(proposal_.executionScript, input, blacklist);

        proposal_.executed = true;
    }

    /*
     * Getters
     */

    function getVote(uint256 _proposalId, address _user) public view returns (Vote) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.votes[_user];
    }

    function getProposalYeas(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.totalYeas;
    }

    function getProposalNays(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.totalNays;
    }

    function getProposalSupport(uint256 _proposalId) public view returns (bool) {
        Proposal storage proposal_ = _getProposal(_proposalId);

        uint256 votingPower = voteToken.totalSupplyAt(proposal_.creationBlock);
        uint256 yeaPPM = _calculatePPM(proposal_.totalYeas, votingPower);
        return yeaPPM > supportPPM;
    }

    function getProposalSupport(uint256 _proposalId, uint256 _votingPower) public view returns (bool) {
        Proposal storage proposal_ = _getProposal(_proposalId);

        uint256 yeaPPM = _calculatePPM(proposal_.totalYeas, _votingPower);
        return yeaPPM > supportPPM;
    }

    function getProposalCreationBlock(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.creationBlock;
    }

    function getCreationDate(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.creationDate;
    }

    function getCloseDate(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.closeDate;
    }

    function getProposalUpstake(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.totalUpstake;
    }

    function getProposalDownstake(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.totalDownstake;
    }

    function getUpstake(uint256 _proposalId, address _user) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.upstakes[_user];
    }

    function getDownstake(uint256 _proposalId, address _user) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.downstakes[_user];
    }

    function getConfidenceRatio(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);

        if (proposal_.totalDownstake == 0) {
            return proposal_.totalUpstake.mul(MILLION);
        }

        return proposal_.totalUpstake.mul(MILLION).div(proposal_.totalDownstake);
    }

    function hasConfidence(uint256 _proposalId) public view returns (bool) {
        return getConfidenceRatio(_proposalId) >= uint256(4).mul(MILLION);
    }

    function hasMaintainedConfidence(uint256 _proposalId) public view returns (bool) {
        Proposal storage proposal_ = _getProposal(_proposalId);

        require(proposal_.boostingDate > 0, ERROR_PROPOSAL_NOT_BOOSTING);
        require(hasConfidence(_proposalId), ERROR_PROPOSAL_NOT_BOOSTING);

        return getTimestamp64() > proposal_.boostingDate.add(boostingDuration);
    }

    function getProposalState(uint256 _proposalId) internal view returns (ProposalState) {
        Proposal storage proposal_ = _getProposal(_proposalId);

        if (proposal_.executed) {
            return ProposalState.Resolved;
        }

        if (proposal_.boosted) {
            return ProposalState.Boosted;
        }

        if (proposal_.boostingDate > 0) {
            return ProposalState.Boosting;
        }

        if (getTimestamp64() > proposal_.closeDate) {
            return ProposalState.Closed;
        }

        return ProposalState.Active;
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

        _updateBoostingDate(_proposalId);
    }

    function _withdrawStake(uint256 _proposalId, uint256 _amount, bool _upstake) internal {
        Proposal storage proposal_ = _getProposal(_proposalId);

        if (_upstake) {
            require(getUpstake(_proposalId, msg.sender) >= _amount, ERROR_INSUFFICIENT_STAKE);

            proposal_.totalUpstake = proposal_.totalUpstake.sub(_amount);
            proposal_.upstakes[msg.sender] = proposal_.upstakes[msg.sender].sub(_amount);

            emit UpstakeWithdrawn(_proposalId, msg.sender, _amount);
        } else {
            require(getDownstake(_proposalId, msg.sender) >= _amount, ERROR_INSUFFICIENT_STAKE);

            proposal_.totalDownstake = proposal_.totalDownstake.sub(_amount);
            proposal_.downstakes[msg.sender] = proposal_.downstakes[msg.sender].sub(_amount);

            emit DownstakeWithdrawn(_proposalId, msg.sender, _amount);
        }

        require(
            stakeToken.transfer(msg.sender, _amount),
            ERROR_TOKEN_TRANSFER_FAILED
        );

        _updateBoostingDate(_proposalId);
    }

    function _updateBoostingDate(uint256 _proposalId) internal {
        Proposal storage proposal_ = _getProposal(_proposalId);

        ProposalState state = getProposalState(_proposalId);
        if (state == ProposalState.Resolved || state == ProposalState.Boosted) {
            return;
        }

        if (hasConfidence(_proposalId) && state == ProposalState.Active) {
            proposal_.boostingDate = getTimestamp64();
        } else if (state == ProposalState.Boosting) {
            proposal_.boostingDate = 0;
        }
    }

    function _calculatePPM(uint256 _votes, uint256 _total) internal pure returns (uint256) {
        return _votes.mul(MILLION).div(_total);
    }

    function _getProposal(uint256 _proposalId) internal view returns (Proposal storage) {
        require(_proposalId < numProposals, ERROR_PROPOSAL_DOES_NOT_EXIST);
        return proposals[_proposalId];
    }
}
