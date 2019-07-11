pragma solidity ^0.5.0;

import "./HCWithdrawals.sol";

import "@aragon/os/contracts/common/IForwarder.sol";

contract HolographicConsensus is IForwarder, HCWithdrawals {
    
    function initialize(
        Token _voteToken, 
        Token _stakeToken, 
        uint256 _supportPct,
        uint256 _queuePeriod,
        uint256 _boostPeriod,
        uint256 _quietEndingPeriod,
        uint256 _pendedBoostPeriod,
        uint256 _compensationFeePct,
        uint256 _confidenceThresholdBase
    ) 
        external 
        onlyInit 
    {
        initialized();
        initializeVoting(
            _voteToken, 
            _supportPct,
            _queuePeriod,
            _boostPeriod,
            _quietEndingPeriod,
            _compensationFeePct
        );
        initializeStaking(
            _stakeToken, 
            _pendedBoostPeriod,
            _confidenceThresholdBase
        );
    }

    function isForwarder() external pure returns (bool) {
        return true;
    }

    function forward(bytes _evmScript) public {
        require(canForward(msg.sender, _evmScript), ERROR_CAN_NOT_FORWARD);
        _createProposalVote(_evmScript, "");
    }

    function canForward(address _sender, bytes) public view returns (bool) {
        // Note that `canPerform()` implicitly does an initialization check itself
        return canPerform(_sender, CREATE_PROPOSALS_ROLE, arr());
    }
}
