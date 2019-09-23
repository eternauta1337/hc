pragma solidity ^0.4.24;

import "./ProposalBase.sol";

import "@aragon/os/contracts/apps/AragonApp.sol";
import "@aragon/os/contracts/common/IForwarder.sol";

import "@aragon/os/contracts/lib/math/SafeMath.sol";

import "@aragon/apps-shared-minime/contracts/MiniMeToken.sol";


contract HCVoting is ProposalBase, IForwarder, AragonApp {
    using SafeMath for uint256;

    /* ROLES */

    bytes32 public constant CREATE_PROPOSALS_ROLE = keccak256("CREATE_PROPOSALS_ROLE");

    /* ERRORS */

    string internal constant ERROR_BAD_REQUIRED_SUPPORT  = "HCVOTING_BAD_REQUIRED_SUPPORT";
    string internal constant ERROR_PROPOSAL_IS_RESOLVED  = "HCVOTING_PROPOSAL_IS_RESOLVED";
    string internal constant ERROR_ALREADY_VOTED         = "HCVOTING_ALREADY_VOTED";
    string internal constant ERROR_NO_VOTING_POWER       = "HCVOTING_NO_VOTING_POWER";
    string internal constant ERROR_NO_CONSENSUS          = "HCVOTING_NO_CONSENSUS";
    string internal constant ERROR_CAN_NOT_FORWARD       = "HCVOTING_CAN_NOT_FORWARD";
    string internal constant ERROR_ALREADY_EXECUTED      = "HCVOTING_ALREADY_EXECUTED";

    /* CONSTANTS */

    // Used to avoid integer precision loss in divisions.
    uint256 internal constant MILLION = 1000000;

    /* PROPERTIES */

    MiniMeToken public voteToken;

    uint256 public requiredSupport; // Expressed as parts per million, 51% = 510000

    /* EVENTS */

    event ProposalCreated(uint256 proposalId, address creator, string metadata);
    event VoteCasted(uint256 proposalId, address voter, bool supports);
    event ProposalExecuted(uint256 indexed proposalId);
    event ProposalResolved(uint256 indexed proposalId);

    /* INIT */

    function initialize(MiniMeToken _voteToken, uint256 _requiredSupport) public onlyInit {
        initialized();

        require(_requiredSupport > 0, ERROR_BAD_REQUIRED_SUPPORT);
        require(_requiredSupport <= MILLION, ERROR_BAD_REQUIRED_SUPPORT);

        voteToken = _voteToken;
        requiredSupport = _requiredSupport;
    }

    /* PUBLIC */

    function propose(bytes _executionScript, string _metadata) public {
        uint64 creationBlock = getBlockNumber64() - 1;
        require(voteToken.totalSupplyAt(creationBlock) > 0, ERROR_NO_VOTING_POWER);

        uint256 proposalId = numProposals;
        numProposals++;

        Proposal storage proposal_ = proposals[proposalId];
        proposal_.creationBlock = creationBlock;
        proposal_.executionScript = _executionScript;

        emit ProposalCreated(proposalId, msg.sender, _metadata);
    }

    function vote(uint256 _proposalId, bool _supports) public {
        Proposal storage proposal_ = _getProposal(_proposalId);

        require(!proposal_.resolved, ERROR_PROPOSAL_IS_RESOLVED);

        uint256 userVotingPower = voteToken.balanceOfAt(msg.sender, proposal_.creationBlock);
        require(userVotingPower > 0, ERROR_NO_VOTING_POWER);

        // Reject re-voting.
        require(getUserVote(_proposalId, msg.sender) == Vote.Absent, ERROR_ALREADY_VOTED);

        // Update user Vote and totalYeas/totalNays.
        if (_supports) {
            proposal_.totalYeas = proposal_.totalYeas.add(userVotingPower);
        } else {
            proposal_.totalNays = proposal_.totalNays.add(userVotingPower);
        }
        proposal_.votes[msg.sender] = _supports ? Vote.Yea : Vote.Nay;

        emit VoteCasted(_proposalId, msg.sender, _supports);
    }

    function resolve(uint256 _proposalId) public {
        Proposal storage proposal_ = _getProposal(_proposalId);

        require(!proposal_.resolved, ERROR_PROPOSAL_IS_RESOLVED);

        Vote support = getConsensus(_proposalId);
        require(support != Vote.Absent, ERROR_NO_CONSENSUS);

        proposal_.resolved = true;

        if (support == Vote.Yea) {
            _executeProposal(_proposalId, proposal_);
        }

        emit ProposalResolved(_proposalId);
    }

    /* CALCULATED PROPERTIES */

    function getConsensus(uint256 _proposalId) public view returns (Vote) {
        uint256 yeaPPM = getSupport(_proposalId, true);
        if (yeaPPM >= requiredSupport) {
            return Vote.Yea;
        }

        uint256 nayPPM = getSupport(_proposalId, false);
        if (nayPPM >= requiredSupport) {
            return Vote.Nay;
        }

        return Vote.Absent;
    }

    function getSupport(uint _proposalId, bool _supports) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);

        uint256 votingPower = voteToken.totalSupplyAt(proposal_.creationBlock);
        uint256 votes = _supports ? proposal_.totalYeas : proposal_.totalNays;

        return votes.mul(MILLION).div(votingPower);
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

    /* INTERNAL */

    function _executeProposal(uint256 _proposalId, Proposal storage proposal_) internal {
        require(!proposal_.executed, ERROR_ALREADY_EXECUTED);

        address[] memory blacklist = new address[](0);
        bytes memory input = new bytes(0);
        runScript(proposal_.executionScript, input, blacklist);

        proposal_.executed = true;

        emit ProposalExecuted(_proposalId);
    }
}
