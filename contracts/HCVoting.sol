import "@aragon/os/contracts/apps/AragonApp.sol";
import "@aragon/os/contracts/common/IForwarder.sol";

import "@aragon/os/contracts/lib/math/SafeMath.sol";

import "@aragon/apps-shared-minime/contracts/MiniMeToken.sol";


contract HCVoting is IForwarder, AragonApp {
    using SafeMath for uint256;

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
    string internal constant ERROR_ALREADY_EXECUTED        = "HCVOTING_ALREADY_EXECUTED";
    /*
     * Events
     */

    event ProposalCreated(uint256 proposalId, address creator, string metadata);
    event VoteCasted(uint256 proposalId, address voter, bool supports);

    /*
     * Constants
     */

    uint256 public constant MILLION = 1000000;

    /*
     * Properties
     */

    enum Vote { Absent, Yea, Nay }

    struct Proposal {
        uint64 creationBlock;
        bytes executionScript;
        bool executed;
        uint256 totalYeas;
        uint256 totalNays;
        mapping (address => Vote) votes;
    }

    mapping (uint256 => Proposal) proposals;
    uint256 public numProposals;

    MiniMeToken public voteToken;

    uint256 public supportPPM;

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

    function initialize(MiniMeToken _voteToken, uint256 _supportPPM) public onlyInit {
        require(_supportPPM > 0, ERROR_INVALID_SUPPORT);

        initialized();

        voteToken = _voteToken;
        supportPPM = _supportPPM;
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

        emit ProposalCreated(proposalId, msg.sender, _metadata);
    }

    function vote(uint256 _proposalId, bool _supports) public {
        Proposal storage proposal_ = _getProposal(_proposalId);

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

    function executeProposal(uint256 _proposalId) public {
        Proposal storage proposal_ = _getProposal(_proposalId);
        require(!proposal_.executed, ERROR_ALREADY_EXECUTED);
        require(getProposalSupport(_proposalId), ERROR_NOT_ENOUGH_SUPPORT);

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

    function getProposalCreationBlock(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.creationBlock;
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

    function _calculatePPM(uint256 _votes, uint256 _total) internal pure returns (uint256) {
        return _votes.mul(MILLION).div(_total);
    }

    function _getProposal(uint256 _proposalId) internal view returns (Proposal storage) {
        require(_proposalId < numProposals, ERROR_PROPOSAL_DOES_NOT_EXIST);
        return proposals[_proposalId];
    }
}
