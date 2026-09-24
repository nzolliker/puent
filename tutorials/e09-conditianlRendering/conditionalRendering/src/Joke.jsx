import {useState} from 'react'

export default function Joke({ id, text, onDelete }) {

    const [likes, setLike] = useState(0)
    const [dislikes, setDislike] = useState(0)


    const handleLike = () => {
        setLike(likes + 1)
        console.log(`like id: ${id}, total likes is ${likes}`)
    }

    const handleDislike = () => {
        setDislike(dislikes + 1)
        console.log(`dislike id: ${id}, total dislikes is ${dislikes}`)
    }


    return (
        <div>
            <p>{text}</p>
            <p>Likes: {likes - dislikes}</p>
            <button onClick={handleLike}>👍🏼</button>
            <button onClick={handleDislike}>👎🏼</button> 
            <button onClick={() => onDelete(id)}>delete</button>
        </div>
    )
}