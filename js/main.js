let counter = 0;
let betsNumber = [];
let lotto = [];
let equal = 0;
let bets = 6;

function lottoNumber(value) {
    /* Falls 6 Zahlen ausgewählt wurden */
    if (counter == 6) {}
    /* Falls noch nicht 6 ausgewählt wurden */
    else {
        document.querySelector(".chooseNumber button:nth-child(" + (value + 1) + ")").style.background = "none";
        document.querySelector(".chooseNumber button:nth-child(" + (value + 1) + ")").style.background = "white";
        document.querySelector(".chooseNumber button:nth-child(" + (value + 1) + ")").style.color = "black";
        document.querySelector(".chooseNumber button:nth-child(" + (value + 1) + "):hover").style.borderColor = "white";
        document.querySelector(".chooseNumber button:nth-child(" + (value + 1) + ")").style.setProperty("cursor", "context-menu");
        /* https://stackoverflow.com/questions/42528100/nth-child-in-javascript/42528240 */
        betsNumber.push(value);
        var myBets = document.getElementById("myBets");
        var p = document.createElement("p");
        p.appendChild(document.createTextNode(value));
        myBets.appendChild(p);
        bets--;
        document.querySelector("h2").innerHTML = "Please chose " + bets + " out of 49";
        counter++;

        /* Zur Sicherheit wird nochmals überprüft */
        if (counter == 6) {
            /* Lottozahlen werden generiert */
            let lotto1 = Math.floor(Math.random() * 49) + 1;
            let lotto2 = Math.floor(Math.random() * 49) + 1;
            let lotto3 = Math.floor(Math.random() * 49) + 1;
            let lotto4 = Math.floor(Math.random() * 49) + 1;
            let lotto5 = Math.floor(Math.random() * 49) + 1;
            let lotto6 = Math.floor(Math.random() * 49) + 1;
            /* https://www.codegrepper.com/code-examples/javascript/js+random+number+between+1+and+100 */

            /* Alle generierten Lottozahlen gehen in ein Array */
            lotto.push(lotto1);
            lotto.push(lotto2);
            lotto.push(lotto3);
            lotto.push(lotto4);
            lotto.push(lotto5);
            lotto.push(lotto6);

            /* Durch das Erstellen eines "p" Elements, werden die Lottozahlen angezeigt, welche im "p" Element drin sind */
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

            /* Überprüft wie viele Zahlen stimmen */
            for (var i = 0; i < lotto.length; i++) {
                if (lotto[i] == myBets[i]) {
                    equal++;
                }
            }
            /* Falls alle stimmen */
            if (equal == 6) {
                /* Hier wird die Animation hinzugefügt */
                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 }
                });
            }
            /* Falls nicht alle stimmen */
            else {
                document.querySelector("body").style.background = "none";
                document.querySelector("body").style.backgroundColor = "red";
                document.getElementById("tryagain").style.display = "block";
            }
        }
    }
}

function refreshPage() {
    window.location = window.location;
    /* https://stackoverflow.com/questions/15897434/javascript-refresh-parent-page-without-entirely-reloading */
}