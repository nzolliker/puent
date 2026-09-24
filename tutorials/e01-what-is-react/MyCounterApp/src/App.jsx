import './App.css'
import Counter from './Counter'
import {useState} from 'react'
import axios from 'axios'

function App() {

  const [quote, setQuote] = useState('')

  return (
    <>
      <h1>Hello</h1>
      <Counter />
      <Counter />
      <Counter />
      <Counter />

      <h1> {quote} </h1>

      <button onClick={() => axios.get('https://api.kanye.rest').then(result => setQuote(result.data.quote))}>
        Get a quote
      </button>
    </>
  )
}

export default App
