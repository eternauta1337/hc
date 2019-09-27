import 'core-js/stable'
import 'regenerator-runtime/runtime'
import { of } from 'rxjs'
import AragonApi from '@aragon/api'

const INITIALIZATION_TRIGGER = Symbol('INITIALIZATION_TRIGGER')

const api = new AragonApi()

api.store(
  async (state, event) => {
    let newState

    switch (event.event) {
      case INITIALIZATION_TRIGGER:
        newState = { numProposals: await getNumProposals() }
        break
      case 'Increment':
        newState = { numProposals: await getNumProposals() }
        break
      case 'Decrement':
        newState = { numProposals: await getNumProposals() }
        break
      default:
        newState = state
    }

    return newState
  },
  [
    // Always initialize the store with our own home-made event
    of({ event: INITIALIZATION_TRIGGER }),
  ]
)

async function getNumProposals() {
  return parseInt(await api.call('numProposals').toPromise(), 10)
}
