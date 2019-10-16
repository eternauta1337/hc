import 'core-js/stable'
import 'regenerator-runtime/runtime'
import Aragon, { events } from '@aragon/api'

const MiniMeToken = require('./abi/MiniMeToken.json')
const app = new Aragon()

const initialState = async () => {
  return {
    numProposals: 0,
    voteToken: await getVoteToken(),
    stakeToken: await getStakeToken(),
    account: undefined
  }
}

const reducer = async (state, { event, returnValues }) => {
  let nextState = { ...state }
  const { voteToken, stakeToken, account } = state

  switch (event) {
    case 'ProposalCreated':
      nextState = {
        ...state,
        numProposals: await getNumProposals()
      }
      break
    case events.ACCOUNTS_TRIGGER:
      const newAccount = returnValues.account
      nextState = {
        ...state,
        account: newAccount,
        voteTokenBalance: await getTokenBalance(voteToken, newAccount),
        stakeTokenBalance: await getTokenBalance(stakeToken, newAccount)
      }
      break
    case events.SYNC_STATUS_SYNCING:
      nextState = { ...state, isSyncing: true }
      break
    case events.SYNC_STATUS_SYNCED:
      nextState = { ...state, isSyncing: false }
      break
  }

  return nextState
}

app.store(reducer, { init: initialState })

async function getNumProposals() {
  return parseInt(await app.call('numProposals').toPromise(), 10)
}

async function getVoteToken() {
  return await app.call('voteToken').toPromise()
}

async function getStakeToken() {
  return await app.call('stakeToken').toPromise()
}

async function getTokenBalance(token, account) {
  const tokenContract = app.external(token, MiniMeToken.abi)
  return await tokenContract.balanceOf(account).toPromise()
}
