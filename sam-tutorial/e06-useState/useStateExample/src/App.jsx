import './App.css'
import Joke from './Joke'
import JokeForm from './JokeForm'
import {useState} from 'react'

function App() {

      const [favorite, setFavorite] = useState(1)

  const jokes = [
    {
      id: 1,
      text: "I'm afraid for the calendar. Its days are numbered."
    },
    {
      id: 2,
      text: "I used to be addicted to soap, but I'm clean now."
    }
  ]

  const handleFavorite = (id) => {
    setFavorite(id)
  }

  const handleNewJoke = (text) => {
    console.log("new joke: ", text)
  }

  return (
    <>
      <JokeForm onNewJoke={handleNewJoke}/>
      {jokes.map(joke => (
        <Joke onFavorite={handleFavorite} favorite={favorite === joke.id} key={joke.id} id={joke.id} text={joke.text} />
      ))}
      
    </>
  )
}

export default App
