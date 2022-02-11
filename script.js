let counter = 0;
let betsNumber = [];
let lotto = [];
let equal = 0;
let bets = 6;

function lottoNumber(value) {
    if (counter == 6) {} else {
        document.querySelector(".chooseNumber button:nth-child(" + (value + 1) + ")").style.background = "none";
        document.querySelector(".chooseNumber button:nth-child(" + (value + 1) + ")").style.background = "white";
        document.querySelector(".chooseNumber button:nth-child(" + (value + 1) + ")").style.color = "black";
        betsNumber.push(value);
        var myBets = document.getElementById("myBets");
        var p = document.createElement("p");
        p.appendChild(document.createTextNode(value));
        myBets.appendChild(p);
        bets--;
        document.querySelector("h2").innerHTML = "Please chose " + bets + " out of 49";
        counter++;

        if (counter == 6) {
            let lotto1 = Math.floor(Math.random() * 49);
            let lotto2 = Math.floor(Math.random() * 49);
            let lotto3 = Math.floor(Math.random() * 49);
            let lotto4 = Math.floor(Math.random() * 49);
            let lotto5 = Math.floor(Math.random() * 49);
            let lotto6 = Math.floor(Math.random() * 49);

            lotto.push(lotto1);
            lotto.push(lotto2);
            lotto.push(lotto3);
            lotto.push(lotto4);
            lotto.push(lotto5);
            lotto.push(lotto6);

            var winners = document.getElementById("winners");
            var p = document.createElement("p");
            p.appendChild(document.createTextNode(lotto1));
            winners.appendChild(p);

            var p = document.createElement("p");
            p.appendChild(document.createTextNode(lotto2));
            winners.appendChild(p);

            var p = document.createElement("p");
            p.appendChild(document.createTextNode(lotto3));
            winners.appendChild(p);

            var p = document.createElement("p");
            p.appendChild(document.createTextNode(lotto4));
            winners.appendChild(p);

            var p = document.createElement("p");
            p.appendChild(document.createTextNode(lotto5));
            winners.appendChild(p);

            var p = document.createElement("p");
            p.appendChild(document.createTextNode(lotto6));
            winners.appendChild(p);

            for (var i = 0; i < lotto.length; i++) {
                if (lotto[i] == myBets[i]) {
                    equal++;
                }
            }
            if (equal == 6) {
                document.querySelector("body").style.background = "none";
                document.querySelector("body").style.backgroundColor = "green";
            } else {
                alert("You Lost!");
                document.querySelector("body").style.background = "none";
                document.querySelector("body").style.backgroundColor = "red";
                document.getElementById("tryagain").style.display = "block";
            }
        }
    }
}

function refreshPage() {
    window.location = window.location;
}