import './App.css'
import Joke from './Joke'

function App() {
  
  const dadJoke = {
    joke: "this is a new joke which is quite good",
    rating: 4
  }

  const jokes = [
    {
      id: 1,
      joke: "joke 1 of an object",
      rating: 5
    }, {
      id: 2,
      joke: "and another joke of the object",
      rating: 2
    }, {
      id: 3,
      joke: "third joke",
      rating: 4
    }
  ]

  const jokesComponent = jokes.map(item => (
    <Joke key={item.id} joke={item.joke} rating={item.rating} />
  ))

  return (
    <>
      <h1>Dad Jokes</h1>
      <Joke joke={"I used to be a banker, but then I lost interest."} rating={3}/>
      <Joke {...dadJoke}/> 
      <Joke/>
      {jokes.map((joke, index) => {
        return <Joke key={index} joke={joke.joke} rating={joke.rating} />
      })}

      {jokesComponent}
    </>
  )
}

export default App
