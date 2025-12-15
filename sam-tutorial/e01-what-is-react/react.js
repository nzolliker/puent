
function Counter() {
    let [count, setCount] = React.useState(0)

    return (
        <div>
            <p>count: {count}</p>
            <button onClick={() => {
                setCount(count + 1)
            }}>
                click me
            </button>
        </div> 
    )
}