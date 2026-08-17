const socket = io();

let myId = null;
let state = null;
let myDice = [];


// --------------------------------
// HELPER
// --------------------------------

function $(id) {
    return document.getElementById(id);
}


function escapeHTML(value) {

    return String(value).replace(
        /[&<>"']/g,
        character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[character])
    );

}


// --------------------------------
// CONNECT
// --------------------------------

socket.on(
    "connect",
    () => {

        myId =
            socket.id;

    }
);


// --------------------------------
// ERROR MESSAGE
// --------------------------------

socket.on(
    "errorMessage",
    message => {

        $("error").textContent =
            message;


        setTimeout(
            () => {

                $("error").textContent =
                    "";

            },
            3500
        );

    }
);


// --------------------------------
// PRIVATE DICE
// --------------------------------

socket.on(
    "privateDice",
    data => {

        myDice =
            data.dice || [];


        renderMyDice();

    }
);


// --------------------------------
// GAME STATE
// --------------------------------

socket.on(
    "state",
    newState => {

        state =
            newState;


        $("login").hidden =
            true;


        $("game").hidden =
            false;


        $("code").textContent =
            state.code;


        $("phaseLabel").textContent =
            state.phase.toUpperCase();


        // -----------------------------
        // LOBBY
        // -----------------------------

        $("lobby").hidden =
            state.phase !== "lobby";


        if (
            state.phase ===
            "lobby"
        ) {

            renderLobby();

        }


        // -----------------------------
        // PLAYING
        // -----------------------------

        $("play").hidden =
            !(
                state.phase ===
                "playing" ||

                state.phase ===
                "reveal"
            );


        if (
            state.phase ===
            "playing"
        ) {

            renderPlaying();

        }


        // -----------------------------
        // REVEAL
        // -----------------------------

        if (
            state.phase ===
            "reveal"
        ) {

            renderReveal();

        }


        // -----------------------------
        // GAME OVER
        // -----------------------------

        $("gameOver").hidden =
            state.phase !==
            "gameOver";


        if (
            state.phase ===
            "gameOver"
        ) {

            renderGameOver();

        }

    }
);


// --------------------------------
// RENDER LOBBY
// --------------------------------

function renderLobby() {

    $("lobbyPlayers").innerHTML =

        state.players
            .map(
                (player, index) => `

                    <div class="player">

                        <span>

                            ${
                                index === 0
                                    ? "👑 "
                                    : ""
                            }

                            ${escapeHTML(
                                player.name
                            )}

                        </span>

                        <span>

                            ${
                                player.connected
                                    ? "✓"
                                    : "offline"
                            }

                        </span>

                    </div>

                `
            )
            .join("");


    $("start").hidden = !(
        state.players[0]?.id ===
        myId &&

        state.players.length >= 2
    );

}


// --------------------------------
// MY DICE
// --------------------------------

function renderMyDice() {

    $("myDice").innerHTML =

        myDice
            .map(
                die => `

                    <div class="die">

                        ${die}

                    </div>

                `
            )
            .join("");

}


// --------------------------------
// PLAYING
// --------------------------------

function renderPlaying() {

    renderPlayers();


    $("message").textContent =
        state.message;


    $("bid").textContent =
        state.bid

            ? `${state.bid.quantity} × ${state.bid.face}s`

            : "No bid yet";


    const myTurn =
        state.currentPlayerId ===
        myId;


    $("bidBtn").disabled =
        !myTurn;


    $("liarBtn").disabled =
        !myTurn ||
        !state.bid;


    $("reveal").hidden =
        true;

}


// --------------------------------
// PLAYERS
// --------------------------------

function renderPlayers() {

    $("players").innerHTML =

        state.players
            .map(
                player => `

                    <div class="player">

                        <span>

                            ${escapeHTML(
                                player.name
                            )}

                            ${
                                player.id === myId
                                    ? " (you)"
                                    : ""
                            }

                        </span>


                        <span
                            class="${
                                player.id ===
                                state.currentPlayerId
                                    ? "active"
                                    : ""
                            }"
                        >

                            ${
                                player.diceCount
                            }

                            dice


                            ${
                                player.id ===
                                state.currentPlayerId
                                    ? " • TURN"
                                    : ""
                            }

                        </span>

                    </div>

                `
            )
            .join("");

}


// --------------------------------
// REVEAL
// --------------------------------

function renderReveal() {

    $("reveal").hidden =
        false;


    const reveal =
        state.reveal;


    if (!reveal) {
        return;
    }


    const challengedFace =
        reveal.face;


    const challengedQuantity =
        reveal.quantity;


    // --------------------------------
    // IMPORTANT:
    //
    // Use the frozen dice from the
    // server, NOT the player's current
    // dice count.
    // --------------------------------

    $("revealDice").innerHTML =

        reveal.dice
            .map(
                player => `

                    <div
                        class="revealPlayer"
                    >

                        <strong>

                            ${escapeHTML(
                                player.name
                            )}

                        </strong>


                        <div
                            class="revealDice"
                        >

                            ${
                                player.dice
                                    .map(
                                        (die, index) => `

                                            <div
                                                class="
                                                    revealDie
                                                    ${
                                                        die ===
                                                        challengedFace
                                                            ? "match"
                                                            : ""
                                                    }
                                                "
                                                style="
                                                    animation-delay:
                                                    ${
                                                        index * 0.12
                                                    }s
                                                "
                                            >

                                                ${die}

                                            </div>

                                        `
                                    )
                                    .join("")
                            }

                        </div>

                    </div>

                `
            )
            .join("");


    // --------------------------------
    // RESULT
    // --------------------------------

    if (
        reveal.bidWasTrue
    ) {

        $("revealResult").innerHTML = `

            <div
                class="resultHeadline true"
            >

                THE BID WAS TRUE

            </div>


            <div>

                ${reveal.actualCount}
                ${reveal.face}s were rolled.

            </div>


            <div>

                The bid was:

                <strong>

                    ${challengedQuantity}
                    ×
                    ${challengedFace}s

                </strong>

            </div>


            <div
                style="
                    margin-top:10px
                "
            >

                <strong>

                    ${escapeHTML(
                        reveal.loser
                    )}

                </strong>

                loses a die.

            </div>

        `;

    } else {

        $("revealResult").innerHTML = `

            <div
                class="resultHeadline liar"
            >

                LIAR!

            </div>


            <div>

                Only

                <strong>

                    ${reveal.actualCount}

                </strong>

                ${reveal.face}s were rolled.

            </div>


            <div>

                The bid was:

                <strong>

                    ${challengedQuantity}
                    ×
                    ${challengedFace}s

                </strong>

            </div>


            <div
                style="
                    margin-top:10px
                "
            >

                <strong>

                    ${escapeHTML(
                        reveal.loser
                    )}

                </strong>

                loses a die.

            </div>

        `;

    }


    $("continue").disabled =
        false;

}


// --------------------------------
// GAME OVER
// --------------------------------

function renderGameOver() {

    $("winner").textContent =
        `🏆 ${state.winner} wins the game!`;

}


// --------------------------------
// CREATE ROOM
// --------------------------------

$("create").onclick =
    () => {

        socket.emit(
            "createRoom",
            {
                name:
                    $("name").value
            }
        );

    };


// --------------------------------
// SHOW JOIN
// --------------------------------

$("showJoin").onclick =
    () => {

        $("joinBox").hidden =
            !$("joinBox").hidden;

    };


// --------------------------------
// JOIN ROOM
// --------------------------------

$("join").onclick =
    () => {

        socket.emit(
            "joinRoom",
            {

                code:
                    $("roomCode").value,

                name:
                    $("name").value

            }
        );

    };


// --------------------------------
// START GAME
// --------------------------------

$("start").onclick =
    () => {

        socket.emit(
            "startGame"
        );

    };


// --------------------------------
// BID
// --------------------------------

$("bidBtn").onclick =
    () => {

        socket.emit(
            "bid",
            {

                quantity:
                    Number(
                        $("qty").value
                    ),

                face:
                    Number(
                        $("face").value
                    )

            }
        );

    };


// --------------------------------
// CALL LIAR
// --------------------------------

$("liarBtn").onclick =
    () => {

        socket.emit(
            "callLiar"
        );

    };


// --------------------------------
// CONTINUE
// --------------------------------

$("continue").onclick =
    () => {

        socket.emit(
            "continueRound"
        );

    };


// --------------------------------
// RESTART
// --------------------------------

$("restart").onclick =
    () => {

        socket.emit(
            "restartGame"
        );

    };
