pragma solidity ^0.4.24;

import "@aragon/os/contracts/apps/AragonApp.sol";
import "@aragon/apps-shared-minime/contracts/MiniMeToken.sol";

contract HCBase is AragonApp {

    // Token used for voting.
    MiniMeToken public voteToken;

    // Vote state.
    // Absent: A vote that hasn't been made yet.
    // Yea: A positive vote signaling support for a proposal.
    // Nay: A negative vote signaling disapproval for a proposal.
    enum VoteState { Absent, Yea, Nay }

    // Proposal state.
    // Queued: A proposal that has just been created, expires in queuePeriod and can only be resolved with absolute majority.
    // Pended: A proposal that has received enough confidence at a given moment.
    // Unpended: A proposal that had been pended, but who's confindence dropped before pendedBoostPeriod elapses.
    // Resolved: A proposal that was resolved positively either by absolute or relative majority.
    // Expired: A proposal that expired, due to lack of resolution either by queuePeriod or boostPeriod elapsing.
    enum ProposalState { Queued, Unpended, Pended, Boosted, Resolved, Expired }

    // Proposal data structure.
    struct Proposal {
        uint256 id;
        uint256 snapshotBlock;
        uint256 votingPower;
        bytes executionScript;
        ProposalState state;
        uint256 lifetime;
        uint256 startDate;
        uint256 lastPendedDate;
        uint256 lastRelativeSupportFlipDate;
        VoteState lastRelativeSupport;
        uint256 resolutionCompensationFee;
        uint256 yea;
        uint256 nay;
        uint256 upstake;
        uint256 downstake;
        mapping (address => VoteState) votes;
        mapping (address => uint256) upstakes;
        mapping (address => uint256) downstakes;
    }

    // Note: getProposal() is split into multiple getProposal<X>() functions
    // to avoid 'Stack Too Deep' errors.

    function getProposalInfo(uint256 _proposalId) public view returns (
        uint256 id,
        uint256 votingPower,
        bytes executionScript,
        ProposalState state,
        VoteState lastRelativeSupport,
        uint256 resolutionCompensationFee
    ) {
        require(_proposalExists(_proposalId), ERROR_PROPOSAL_DOES_NOT_EXIST);
        Proposal storage proposal_ = proposals[_proposalId];
        id = proposal_.id;
        votingPower = proposal_.votingPower;
        executionScript = proposal_.executionScript;
        state = proposal_.state;
        lastRelativeSupport = proposal_.lastRelativeSupport;
        resolutionCompensationFee = proposal_.resolutionCompensationFee;
    }

    function getProposalTimeInfo(uint256 _proposalId) public view returns (
        uint256 snapshotBlock,
        uint256 lifetime,
        uint256 startDate,
        uint256 lastPendedDate,
        uint256 lastRelativeSupportFlipDate
    )
    {
        require(_proposalExists(_proposalId), ERROR_PROPOSAL_DOES_NOT_EXIST);
        Proposal storage proposal_ = proposals[_proposalId];
        snapshotBlock = proposal_.snapshotBlock;
        lifetime = proposal_.lifetime;
        startDate = proposal_.startDate;
        lastPendedDate = proposal_.lastPendedDate;
        lastRelativeSupportFlipDate = proposal_.lastRelativeSupportFlipDate;
    }

    function getProposalVotes(uint256 _proposalId) public view returns (uint256 yea, uint256 nay) {
        require(_proposalExists(_proposalId), ERROR_PROPOSAL_DOES_NOT_EXIST);
        Proposal storage proposal_ = proposals[_proposalId];
        yea = proposal_.yea;
        nay = proposal_.nay;
    }

    function getProposalStakes(uint256 _proposalId) public view returns (uint256 upstake, uint256 downstake) {
        require(_proposalExists(_proposalId), ERROR_PROPOSAL_DOES_NOT_EXIST);
        Proposal storage proposal_ = proposals[_proposalId];
        upstake = proposal_.upstake;
        downstake = proposal_.downstake;
    }

    // Store proposals in a mapping, by numeric id.
    mapping (uint256 => Proposal) internal proposals;
    uint256 public numProposals;

    // Lifetime of a proposal when it is not boosted.
    uint256 public queuePeriod;
    function _validateQueuePeriod(uint256 _queuePeriod) internal pure {
        // TODO
    }
    function changeQueuePeriod(uint256 _queuePeriod) public auth(MODIFY_PERIODS_ROLE) {
        _validateQueuePeriod(_queuePeriod);
        queuePeriod = _queuePeriod;
    }

    // Lifetime of a proposal when it is boosted.
    // Note: The effective lifetime of a proposal when it is boosted is dynamic, and can be extended
    // due to the requirement of quiet endings.
    uint256 public boostPeriod;
    function _validateBoostPeriod(uint256 _boostPeriod) internal pure {
        // TODO
    }
    function changeBoostPeriod(uint256 _boostPeriod) public auth(MODIFY_PERIODS_ROLE) {
        _validateBoostPeriod(_boostPeriod);
        boostPeriod = _boostPeriod;
    }
    uint256 public quietEndingPeriod;
    function _validateQuietEndingPeriod(uint256 _quietEndingPeriod) internal pure {
        // TODO
    }
    function changeQuietEndingPeriod(uint256 _quietEndingPeriod) public auth(MODIFY_PERIODS_ROLE) {
        _validateQuietEndingPeriod(_quietEndingPeriod);
        quietEndingPeriod = _quietEndingPeriod;
    }

    // Time for a pended proposal to become boosted if it maintained confidence within such period.
    uint256 public pendedBoostPeriod;
    function _validatePendedBoostPeriod(uint256 _pendedBoostPeriod) internal pure {
        // TODO
    }
    function changePendedBoostPeriod(uint256 _pendedBoostPeriod) public auth(MODIFY_PERIODS_ROLE) {
        _validatePendedBoostPeriod(_pendedBoostPeriod);
        pendedBoostPeriod = _pendedBoostPeriod;
    }

    // Compensation fee for external callers of functions that resolve and expire proposals.
    uint256 public compensationFeePct;
    function _validateCompensationFeePct(uint256 _compensationFeePct) internal pure {
        // TODO
    }
    function changeCompensationFeePct(uint256 _compensationFeePct) public auth(MODIFY_COMPENSATION_FEES_ROLE) {
        _validateCompensationFeePct(_compensationFeePct);
        compensationFeePct = _compensationFeePct;
    }

    // Multiplier used to avoid losing precision when using division or calculating percentages.
    uint256 internal constant PRECISION_MULTIPLIER = 10 ** 16;

    // Events.
    event ProposalCreated(uint256 indexed _proposalId, address indexed _creator, string _metadata);
    event ProposalStateChanged(uint256 indexed _proposalId, ProposalState _newState);

    // Roles.
    bytes32 public constant CREATE_PROPOSALS_ROLE = keccak256("CREATE_PROPOSALS_ROLE");
    bytes32 public constant MODIFY_SUPPORT_PERCENT_ROLE = keccak256("MODIFY_SUPPORT_PERCENT_ROLE");
    bytes32 public constant MODIFY_PERIODS_ROLE = keccak256("MODIFY_PERIODS_ROLE");
    bytes32 public constant MODIFY_COMPENSATION_FEES_ROLE = keccak256("MODIFY_COMPENSATION_FEES_ROLE");
    bytes32 public constant MODIFY_CONFIDENCE_THRESHOLD_ROLE = keccak256("MODIFY_CONFIDENCE_THRESHOLD_ROLE");

    // Error messages.
    string internal constant ERROR_SENDER_DOES_NOT_HAVE_ENOUGH_FUNDS         = "VOTING_ERROR_SENDER_DOES_NOT_HAVE_ENOUGH_FUNDS";
    string internal constant ERROR_INSUFFICIENT_ALLOWANCE                    = "VOTING_ERROR_INSUFFICIENT_ALLOWANCE";
    string internal constant ERROR_SENDER_DOES_NOT_HAVE_REQUIRED_STAKE       = "VOTING_ERROR_SENDER_DOES_NOT_HAVE_REQUIRED_STAKE ";
    string internal constant ERROR_PROPOSAL_DOES_NOT_HAVE_REQUIRED_STAKE     = "VOTING_ERROR_PROPOSAL_DOES_NOT_HAVE_REQUIRED_STAKE ";
    string internal constant ERROR_PROPOSAL_DOESNT_HAVE_ENOUGH_CONFIDENCE    = "VOTING_ERROR_PROPOSAL_DOESNT_HAVE_ENOUGH_CONFIDENCE";
    string internal constant ERROR_PROPOSAL_IS_NOT_FINALIZED                 = "VOTING_ERROR_PROPOSAL_IS_NOT_FINALIZED";
    string internal constant ERROR_PROPOSAL_IS_NOT_BOOSTED                   = "VOTING_ERROR_PROPOSAL_IS_NOT_BOOSTED";
    string internal constant ERROR_PROPOSAL_IS_BOOSTED                       = "VOTING_ERROR_PROPOSAL_IS_BOOSTED";
    string internal constant ERROR_NO_WINNING_STAKE                          = "VOTING_ERROR_NO_WINNING_STAKE";
    string internal constant ERROR_PROPOSAL_HASNT_HAD_CONFIDENCE_ENOUGH_TIME = "VOTING_ERROR_PROPOSAL_HASNT_HAD_CONFIDENCE_ENOUGH_TIME";
    string internal constant ERROR_PROPOSAL_DOES_NOT_EXIST                   = "VOTING_ERROR_PROPOSAL_DOES_NOT_EXIST";
    string internal constant ERROR_PROPOSAL_IS_CLOSED                        = "VOTING_ERROR_PROPOSAL_IS_CLOSED";
    string internal constant ERROR_INIT_SUPPORT_TOO_SMALL                    = "VOTING_ERROR_INIT_SUPPORT_TOO_SMALL";
    string internal constant ERROR_INIT_SUPPORT_TOO_BIG                      = "VOTING_ERROR_INIT_SUPPORT_TOO_BIG";
    string internal constant ERROR_USER_HAS_NO_VOTING_POWER                  = "VOTING_ERROR_USER_HAS_NO_VOTING_POWER";
    string internal constant ERROR_NOT_ENOUGH_ABSOLUTE_SUPPORT               = "VOTING_ERROR_NOT_ENOUGH_ABSOLUTE_SUPPORT";
    string internal constant ERROR_NOT_ENOUGH_RELATIVE_SUPPORT               = "VOTING_ERROR_NOT_ENOUGH_RELATIVE_SUPPORT";
    string internal constant ERROR_VOTING_DOES_NOT_HAVE_ENOUGH_FUNDS         = "VOTING_ERROR_VOTING_DOES_NOT_HAVE_ENOUGH_FUNDS";
    string internal constant ERROR_PROPOSAL_IS_ACTIVE                        = "VOTING_ERROR_PROPOSAL_IS_ACTIVE";
    string internal constant ERROR_NO_STAKE_TO_WITHDRAW                      = "VOTING_ERROR_NO_STAKE_TO_WITHDRAW";
    string internal constant ERROR_INVALID_COMPENSATION_FEE                  = "VOTING_ERROR_INVALID_COMPENSATION_FEE";
    string internal constant ERROR_NO_VOTING_POWER 							 = "VOTING_NO_VOTING_POWER";
    string internal constant ERROR_CAN_NOT_FORWARD                           = "VOTING_CAN_NOT_FORWARD";

    /*
     * External functions.
     */

    function createProposal(bytes _executionScript, string _metadata) 
        public 
        auth(CREATE_PROPOSALS_ROLE)
        returns (uint256 proposalId) 
    {
        return _createProposal(_executionScript, _metadata);
    }

    function _createProposal(bytes _executionScript, string memory _metadata)
        internal
        returns (uint256 proposalId) 
    {
        // Increment proposalId.
        proposalId = numProposals;
        numProposals++;

        // Initialize proposal.
        Proposal storage proposal_ = proposals[proposalId];
        proposal_.id = proposalId;
        proposal_.executionScript = _executionScript;
        proposal_.startDate = now;
        proposal_.lifetime = queuePeriod;

        // Avoid double voting.
		uint256 snapshotBlock = getBlockNumber64() - 1;
        uint256 votingPower = voteToken.totalSupplyAt(snapshotBlock);
        require(votingPower > 0, ERROR_NO_VOTING_POWER);
		proposal_.votingPower = votingPower;
		proposal_.snapshotBlock = snapshotBlock;

        emit ProposalCreated(proposalId, msg.sender, _metadata);
    }

    /*
     * Utility functions.
     */

    function _proposalExists(uint256 _proposalId) internal view returns (bool) {
        return _proposalId < numProposals;
    }

    function _proposalStateIs(uint256 _proposalId, ProposalState _state) internal view returns (bool) {
        Proposal storage proposal_ = proposals[_proposalId];
        return proposal_.state == _state;
    }
}
