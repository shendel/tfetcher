import logo from './logo.svg';
import './App.css';
import { useState, useEffect } from 'react'
import { QueryParameter, DuneClient } from "@cowprotocol/ts-dune-client"
import { ExecutionState } from "@cowprotocol/ts-dune-client"

const DUNE_TERMINAL_STATES = [
  ExecutionState.CANCELLED,
  ExecutionState.COMPLETED,
  ExecutionState.FAILED,
]

const EVM_ADDRESS_REGEXP = /^0x[A-Fa-f0-9]{40}$/
const isEvmAddress = (value) => typeof value === 'string' && EVM_ADDRESS_REGEXP.test(value)

function App() {
  const [ duneApiKey, setDuneApiKey ] = useState('')

  // Список исключения
  const initErc20BL = [
    '0x1a3496c18d558bd9c6c8f609e1b129f67ab08163',
    '0xb22c05cedbf879a661fcc566b5a759d005cf7b4c'
  ]
  const queryLimit = 100

  const duneQueryID = '2553257' // ID запроса 
  const [ duneClient, setDuneClient ] = useState(null)
  const [ duneJobID, setDuneJobID ] = useState(false)
  const [ duneJobStatus, setDuneJobStatus ] = useState(false)

  const [ erc20BL, setErc20BL ] = useState(initErc20BL)
  const [ duneResult, setDuneResult ] = useState([])

  const createDuneClient = () => {
    const client = new DuneClient(duneApiKey)
    setDuneClient(client)
  }

  const sleep = (seconds) => {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  const saveResult = () => {
    let existsResults = localStorage.getItem('erc20result')
    try {
      existsResults = JSON.parse(existsResults)
    } catch (err) {
      existsResults = {}
    }
    if (existsResults === null) existsResults = {}
    duneResult.forEach((item) => {
      const existsRow = existsResults[item.contract_address] ? existsResults[item.contract_address] : {}
      existsRow.contract_address = item.contract_address
      existsResults[item.contract_address] = existsRow
    })
    localStorage.setItem('erc20result', JSON.stringify(existsResults))
  }

  useEffect(() => {
    let existsResults = localStorage.getItem('erc20result')
    try {
      existsResults = JSON.parse(existsResults)
    } catch (err) {
      existsResults = {}
    }
    
    if (existsResults === null) existsResults = {}
    const _r = Object.keys(existsResults).map((key) => {
      return {
        contract_address: key,
        info: existsResults[key]
      }
    })
    setDuneResult(_r)
  }, [])

  const makeDuneRequest = async (options) => {
    const {
      queryID,
      parameters
    } = options
    const pingFrequency = 5

    const { execution_id: jobID } = await duneClient.execute(queryID, parameters)
    setDuneJobID(jobID)
    let _status = await duneClient.getStatus(jobID)
    setDuneJobStatus(_status)
    let { state } = _status
    while (!DUNE_TERMINAL_STATES.includes(state)) {
      await sleep(pingFrequency)
      if (jobID) {
        _status = await duneClient.getStatus(jobID)
        setDuneJobStatus(_status)
        state = _status.state
        console.log('>>> _status', _status)
      } else {
        return false
      }
    }
    setDuneJobStatus(false)
    setDuneJobID(false)
    if (state === ExecutionState.COMPLETED) {
      return duneClient.getResult(jobID);
    }
  }

  useEffect(() => {
    // console.log('>>> new status', duneJobStatus)
  }, [ duneJobStatus ])

  const makeFetchTokens = () => {
    if (duneClient !== null) {
      const parameters = [
        QueryParameter.text("blacklist", erc20BL.join(',')),
        QueryParameter.number("limit", queryLimit)
      ]

      makeDuneRequest({
        queryID: duneQueryID,
        parameters,
        onJob: (jobID) => {
          console.log('>>> dune job id', jobID)
          setDuneJobID(jobID)
        }
      }).then((executionResult) => {
        setDuneJobID(false)
        if (executionResult) {
          console.log(executionResult.result?.rows)
          setDuneResult(executionResult.result?.rows)
        }
      })
    }
  }

  const cancelDuneJob = () => {
    duneClient.cancelExecution(duneJobID)
    setDuneJobID(false)
    setDuneJobStatus(false)
  }
  const getDuneStatus = () => {
    if (duneClient !== null) {
      const status = duneClient.getStatus()
      console.log(status)
    }
  }

  const onSetErc20BL = (val) => {
    console.log('>>> val', val)
    const newBL = val.split(`\n`).filter((addr) => {
      return isEvmAddress(addr)
    })
    console.log (newBL)
    setErc20BL(newBL)
  }
  
  return (
    <div className="App">
      <section>
        <h1>API keys</h1>
        <div>
          <label>DUNE ApiKey</label>
          <input type="text" value={duneApiKey} onChange={(e) => { setDuneApiKey(e.target.value) }} />
          {(duneClient === null) ? (
            <button onClick={createDuneClient}>Make Dune client</button>
          ) : (
            <strong>Client created</strong>
          )}
        </div>
      </section>
      <section>
        <div>BlackList ERC20 (address by line)</div>
        <textarea onChange={(e) => { onSetErc20BL(e.target.value) }} value={erc20BL.join(`\r\n`) + `\r\n`} style={{width: '100%', height: '100px'}}>
        </textarea>
      </section>
      <button onClick={saveResult}>test</button>
      {duneClient !== null && (
        <section>
          {!duneJobID ? (
            <button onClick={makeFetchTokens}>Fetch tokens</button>
          ) : (
            <button onClick={cancelDuneJob}>Cancel job</button>
          )}
          <div>
          {duneJobStatus && duneJobStatus.state == "QUERY_STATE_PENDING" && duneJobStatus.queue_position && (
            <div>Pending in query: {duneJobStatus.queue_position}</div>
          )}
          {duneJobStatus && duneJobStatus.state == "QUERY_STATE_EXECUTING" && (
            <div>Query is execution</div>
          )}
          </div>
          {duneResult.length && (
            <table>
              <thead>
                <tr>
                  <td>Address</td>
                  <td>Actions</td>
                </tr>
              </thead>
              <tbody>
              {duneResult.map((item, key) => {
                return (
                  <tr key={key}>
                    <td>{item.contract_address}</td>
                    <td>---</td>
                  </tr>
                )
              })}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}

export default App;
