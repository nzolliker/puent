import './App.css'
import RandomImage from './RandomImage'

function App() {

  return (
    <>
    <div className="App">
      <h1>Test</h1>
      <p>some text</p>
      <p>{new Date().toString()}</p>
    </div>
      <RandomImage/>
      <RandomImage/>
    </>
  )
}

export default App
