document.addEventListener('DOMContentLoaded', function() {
    const lotto = document.querySelector('#lotto');
    lotto.addEventListener('input', lottoNumberChanged);

    function lottoNumberChanged(event) {
        let chosenNumbers = lotto.querySelectorAll(
            'input[type=checkbox]:checked');
        if (chosenNumbers.length > 6) {
            event.target.checked = false;
            alert('Mit sieben Zahlen wird Ihr Tippschein ungültig!');
        }
    }
});