pragma solidity ^0.5.0;

import "./HCWithdrawals.sol";

contract HolographicConsensus is HCWithdrawals {
    
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
}
