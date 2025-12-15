const clickedText = document.getElementById('clickedText')
const clickedButton = document.getElementById('clickedButton')

let count = 0
clickedButton.addEventListener('click', function () {
    count++
    clickedText.textContent = `count: ${count}`
})