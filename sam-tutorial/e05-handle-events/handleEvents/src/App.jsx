import './App.css'
import Form from './Form.jsx'

function App() {

  function handleClick() {
    console.log('Button clicked')
  }

  function handleSubmit(e) {
    e.preventDefault()
    console.log("form submitted")
  }

  function handleTextChange(e) {
    console.log(e.target.value)
  }

  return (
    <>

     <button onClick={handleClick}>Do Something</button>

     <Form onSubmit={handleSubmit}/>

    </>
  )
}

export default App
