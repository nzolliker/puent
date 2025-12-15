export default function Joke({joke="default joke", rating=0}) {

    let stars = ""
    for (let i = 0; i < 5; i++) {
        if (i < rating) {
            stars += "⭐️️️"
        } else {
            stars += "️☆"
        }
    }

    return (
        <div>
            <p>{joke}</p>
            <p>{stars}</p>
        </div>
    )
}