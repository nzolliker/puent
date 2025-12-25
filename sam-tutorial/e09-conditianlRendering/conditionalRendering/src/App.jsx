import './App.css'
import Joke from './Joke'
import JokeForm from './JokeForm'
import {useState} from 'react'

function App() {

  const [showForm, setShowForm] = useState(false)
  const [jokes, setJokes] = useState([
    {
      id: 1,
      text: "I'm afraid for the calendar. Its days are numbered."
    },
    {
      id: 2,
      text: "I used to be addicted to soap, but I'm clean now."
    }
  ])

  const handleFavorite = (id) => {
    setFavorite(id)
  }

  const handleNewJoke = (text) => {
    const joke = {
      text,
      id: self.crypto.randomUUID()
    }
    setJokes(
      [joke, ...jokes]
    )
    setShowForm(false)
  }

  const handleDelete = (id) => {
    setJokes(jokes.filter(joke => joke.id !== id))
  }

  const handleAddNewJoke = () => {
    console.log("test")
    setShowForm(true)
  }

  return (
    <>
      <h1>Jokes</h1>
      {showForm ?
      <JokeForm onNewJoke={handleNewJoke}/>
      :
      <>
        <button onClick={handleAddNewJoke}>Add new joke</button>
        {jokes.map(joke => (
        <Joke onDelete={handleDelete} key={joke.id} id={joke.id} text={joke.text} />))}
      </>}
    </>
  )
}

export default App
