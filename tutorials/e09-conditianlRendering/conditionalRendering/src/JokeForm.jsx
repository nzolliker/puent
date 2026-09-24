import {useState} from 'react'
import './JokeForm.css'

export default function JokeForm({onNewJoke}) {

    const [text, setText] = useState("")
    const [error, setError] = useState("")

    const handleSubmit = (event) => {
        event.preventDefault()
        if (text.length < 5){
            setError("Joke must be at least 5 characters long")
            return
        }
        setError("")
        onNewJoke(text)
        setText("")
    }

    return (
        <form onSubmit={handleSubmit}>
        <label htmlFor="text">New Joke </label>
            <input type="text" placeholder="Enter a joke" value={text} onChange={e => setText(e.target.value)}/>
            <button type="submit">Add Joke</button>
            <p className="form">test Text</p>
        {error && <p>{error}</p>}
        </form>
    )
}