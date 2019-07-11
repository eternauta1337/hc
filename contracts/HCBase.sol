pragma solidity ^0.5.0;

contract HCBase {

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

    struct Proposal {
    // Proposal data structure.
        uint256 id;
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

    function getProposal(uint256 _proposalId) public view returns (
        uint256 id,
        ProposalState state,
        uint256 lifetime,
        uint256 startDate,
        uint256 lastPendedDate,
        uint256 lastRelativeSupportFlipDate,
        VoteState lastRelativeSupport,
        uint256 resolutionCompensationFee,
        uint256 yea,
        uint256 nay,
        uint256 upstake,
        uint256 downstake
    ) {
        require(_proposalExists(_proposalId), ERROR_PROPOSAL_DOES_NOT_EXIST);

        Proposal storage proposal_ = proposals[_proposalId];
        id = proposal_.id;
        state = proposal_.state;
        lifetime = proposal_.lifetime;
        startDate = proposal_.startDate;
        lastPendedDate = proposal_.lastPendedDate;
        lastRelativeSupportFlipDate = proposal_.lastRelativeSupportFlipDate;
        lastRelativeSupport = proposal_.lastRelativeSupport;
        resolutionCompensationFee = proposal_.resolutionCompensationFee;
        yea = proposal_.yea;
        nay = proposal_.nay;
        upstake = proposal_.upstake;
        downstake = proposal_.downstake;
    }


    // Store proposals in a mapping, by numeric id.
    mapping (uint256 => Proposal) internal proposals;
    uint256 public numProposals;

    // Lifetime of a proposal when it is not boosted.
    uint256 public queuePeriod;

    // Lifetime of a proposal when it is boosted.
    // Note: The effective lifetime of a proposal when it is boosted is dynamic, and can be extended
    // due to the requirement of quiet endings.
    uint256 public boostPeriod;
    uint256 public quietEndingPeriod;

    // Time for a pended proposal to become boosted if it maintained confidence within such period.
    uint256 public pendedBoostPeriod;

    // Compensation fee for external callers of functions that resolve and expire proposals.
    uint256 public compensationFeePct;

    // Multiplier used to avoid losing precision when using division or calculating percentages.
    uint256 internal constant PRECISION_MULTIPLIER = 10 ** 16;

    // Events.
    event ProposalCreated(uint256 indexed _proposalId, address indexed _creator, string _metadata);
    event ProposalStateChanged(uint256 indexed _proposalId, ProposalState _newState);

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

    /*
     * External functions.
     */

    function createProposal(string memory _metadata) public returns (uint256 proposalId) {

        // Increment proposalId.
        proposalId = numProposals;
        numProposals++;

        // Initialize proposal.
        Proposal storage proposal_ = proposals[proposalId];
        proposal_.id = proposalId;
        proposal_.startDate = now;
        proposal_.lifetime = queuePeriod;

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
