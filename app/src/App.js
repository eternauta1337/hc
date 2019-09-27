import React from 'react'
import { useAragonApi } from '@aragon/api-react'
import { Main, Button } from '@aragon/ui'
import styled from 'styled-components'
import { EMPTY_SCRIPT } from '@aragon/test-helpers/evmScript'

function App() {
  const { api, appState } = useAragonApi()
  const { numProposals, syncing } = appState
  return (
    <Main>
      <BaseLayout>
        {syncing && <Syncing />}
        <Count>Existing proposals: {numProposals}</Count>
        <Buttons>
          <Button mode="secondary" onClick={() => api.propose(EMPTY_SCRIPT, "Proposal metadata").toPromise()}>
            Create proposal
          </Button>
          <Button mode="secondary" onClick={
            async () => {
              const num = await api.call('numProposals').toPromise()
              console.log(`NUM`, num)
            }
          }>
            Read numProposals
          </Button>
        </Buttons>
      </BaseLayout>
    </Main>
  )
}

const BaseLayout = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  flex-direction: column;
`

const Count = styled.h1`
  font-size: 30px;
`

const Buttons = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-gap: 40px;
  margin-top: 20px;
`

const Syncing = styled.div.attrs({ children: 'Syncing…' })`
  position: absolute;
  top: 15px;
  right: 20px;
`

export default App
