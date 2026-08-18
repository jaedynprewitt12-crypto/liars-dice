const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

const MAX_PLAYERS = 6;
const MIN_PLAYERS = 2;
const STARTING_DICE = 5;


// ======================================================
// DICE
// ======================================================

function rollDice(count) {

    return Array.from(
        { length: count },
        () => Math.floor(Math.random() * 6) + 1
    );

}


// ======================================================
// ROOM CODE
// ======================================================

function makeRoomCode() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code;

    do {

        code = Array.from(
            { length: 5 },
            () =>
                chars[
                    Math.floor(
                        Math.random() * chars.length
                    )
                ]
        ).join("");

    } while (rooms.has(code));

    return code;

}


// ======================================================
// ACTIVE PLAYERS
// ======================================================

function activePlayers(room) {

    return room.players.filter(
        player =>
            player.dice.length > 0
    );

}


// ======================================================
// TOTAL DICE
// ======================================================

function totalDice(room) {

    return room.players.reduce(
        (total, player) =>
            total + player.dice.length,
        0
    );

}


// ======================================================
// COUNT FACE
// ======================================================

function countFace(room, face) {

    return room.players.reduce(
        (total, player) =>
            total +
            player.dice.filter(
                die => die === face
            ).length,
        0
    );

}


// ======================================================
// NEXT PLAYER
// ======================================================

function getNextPlayer(
    room,
    currentPlayerId
) {

    const players =
        activePlayers(room);

    const index =
        players.findIndex(
            player =>
                player.id ===
                currentPlayerId
        );

    return players[
        (index + 1) %
        players.length
    ];

}


// ======================================================
// BIDDING RULE
//
// SAME FACE:
// quantity MUST increase.
//
// HIGHER FACE:
// quantity can reset to ANY number.
//
// LOWER FACE:
// NEVER allowed.
//
// Examples:
//
// 3 x 1 -> 2 x 2  ✅
// 2 x 2 -> 1 x 3  ✅
// 1 x 3 -> 1 x 4  ✅
// 1 x 4 -> 4 x 4  ✅
// 4 x 4 -> 3 x 4  ❌
// 3 x 4 -> 5 x 3  ❌
// 3 x 4 -> 1 x 5  ✅
// ======================================================

function isHigherBid(
    newBid,
    oldBid
) {

    if (!oldBid) {

        return true;

    }


    // Higher face:
    // quantity can reset to anything.

    if (
        newBid.face >
        oldBid.face
    ) {

        return true;

    }


    // Same face:
    // quantity must increase.

    if (
        newBid.face ===
        oldBid.face &&

        newBid.quantity >
        oldBid.quantity
    ) {

        return true;

    }


    // Lower face is never allowed.

    return false;

}


// ======================================================
// PUBLIC GAME STATE
// ======================================================

function getPublicState(room) {

    return {

        code:
            room.code,

        phase:
            room.phase,

        players:
            room.players.map(
                player => ({

                    id:
                        player.id,

                    name:
                        player.name,

                    diceCount:
                        player.dice.length,

                    connected:
                        player.connected,

                    // During reveal, everyone
                    // gets everyone's dice.

                    revealedDice:

                        (
                            room.phase ===
                            "reveal" ||

                            room.phase ===
                            "gameOver"
                        )

                            ? player.dice.slice()

                            : null

                })
            ),

        currentPlayerId:
            room.currentPlayerId,

        bid:
            room.bid
                ? {

                    quantity:
                        room.bid.quantity,

                    face:
                        room.bid.face,

                    playerId:
                        room.bid.playerId

                }
                : null,

        reveal:
            room.reveal,

        message:
            room.message,

        winner:
            room.winner

    };

}


// ======================================================
// SEND STATE
// ======================================================

function sendState(room) {

    io.to(room.code).emit(
        "state",
        getPublicState(room)
    );


    // Send each player their private dice.

    for (
        const player of room.players
    ) {

        io.to(player.id).emit(
            "privateDice",
            {
                dice:
                    player.dice
            }
        );

    }

}


// ======================================================
// START NEXT ROUND
// ======================================================

function startNextRound(
    room,
    starterId
) {

    room.players.forEach(
        player => {

            if (
                player.dice.length > 0
            ) {

                player.dice =
                    rollDice(
                        player.dice.length
                    );

            }

        }
    );


    room.phase =
        "playing";


    room.bid =
        null;


    room.reveal =
        null;


    room.currentPlayerId =
        starterId;


    room.winner =
        null;


    const starter =
        room.players.find(
            player =>
                player.id ===
                starterId
        );


    room.message =
        `${starter.name}'s turn.`;


    sendState(room);

}


// ======================================================
// CHECK WINNER
// ======================================================

function checkWinner(room) {

    const alive =
        activePlayers(room);


    if (
        alive.length === 1
    ) {

        room.phase =
            "gameOver";


        room.winner =
            alive[0].name;


        room.currentPlayerId =
            null;


        room.message =
            `${alive[0].name} wins the game!`;


        return true;

    }


    return false;

}


// ======================================================
// SOCKET CONNECTION
// ======================================================

io.on(
    "connection",
    socket => {


        // ==================================================
        // CREATE ROOM
        // ==================================================

        socket.on(
            "createRoom",
            ({ name }) => {

                name =
                    String(
                        name || ""
                    )
                    .trim()
                    .slice(0, 20);


                if (!name) {

                    return socket.emit(
                        "errorMessage",
                        "Enter a name."
                    );

                }


                const roomCode =
                    makeRoomCode();


                const room = {

                    code:
                        roomCode,

                    phase:
                        "lobby",

                    players: [

                        {

                            id:
                                socket.id,

                            name:
                                name,

                            dice:
                                [],

                            connected:
                                true

                        }

                    ],

                    currentPlayerId:
                        null,

                    bid:
                        null,

                    reveal:
                        null,

                    message:
                        "Waiting for players...",

                    winner:
                        null

                };


                rooms.set(
                    roomCode,
                    room
                );


                socket.join(
                    roomCode
                );


                socket.data.roomCode =
                    roomCode;


                sendState(room);

            }
        );


        // ==================================================
        // JOIN ROOM
        // ==================================================

        socket.on(
            "joinRoom",
            ({ code, name }) => {

                code =
                    String(
                        code || ""
                    )
                    .trim()
                    .toUpperCase();


                name =
                    String(
                        name || ""
                    )
                    .trim()
                    .slice(0, 20);


                const room =
                    rooms.get(code);


                if (!name) {

                    return socket.emit(
                        "errorMessage",
                        "Enter a name."
                    );

                }


                if (!room) {

                    return socket.emit(
                        "errorMessage",
                        "Room not found."
                    );

                }


                if (
                    room.phase !==
                    "lobby"
                ) {

                    return socket.emit(
                        "errorMessage",
                        "Game already started."
                    );

                }


                if (
                    room.players.length >=
                    MAX_PLAYERS
                ) {

                    return socket.emit(
                        "errorMessage",
                        "Room is full."
                    );

                }


                if (
                    room.players.some(
                        player =>
                            player.name
                                .toLowerCase() ===
                            name.toLowerCase()
                    )
                ) {

                    return socket.emit(
                        "errorMessage",
                        "That name is already being used."
                    );

                }


                room.players.push({

                    id:
                        socket.id,

                    name:
                        name,

                    dice:
                        [],

                    connected:
                        true

                });


                socket.join(code);


                socket.data.roomCode =
                    code;


                room.message =
                    `${name} joined the table.`;


                sendState(room);

            }
        );


        // ==================================================
        // START GAME
        // ==================================================

        socket.on(
            "startGame",
            () => {

                const room =
                    rooms.get(
                        socket.data.roomCode
                    );


                if (!room) {
                    return;
                }


                if (
                    room.players[0].id !==
                    socket.id
                ) {

                    return socket.emit(
                        "errorMessage",
                        "Only the host can start the game."
                    );

                }


                if (
                    room.players.length <
                    MIN_PLAYERS
                ) {

                    return socket.emit(
                        "errorMessage",
                        "You need at least 2 players."
                    );

                }


                room.players.forEach(
                    player => {

                        player.dice =
                            rollDice(
                                STARTING_DICE
                            );

                    }
                );


                room.phase =
                    "playing";


                room.bid =
                    null;


                room.reveal =
                    null;


                room.winner =
                    null;


                room.currentPlayerId =
                    room.players[0].id;


                room.message =
                    `${room.players[0].name}'s turn.`;


                sendState(room);

            }
        );


        // ==================================================
        // MAKE BID
        // ==================================================

        socket.on(
            "bid",
            ({ quantity, face }) => {

                const room =
                    rooms.get(
                        socket.data.roomCode
                    );


                if (
                    !room ||
                    room.phase !==
                    "playing"
                ) {

                    return;

                }


                if (
                    room.currentPlayerId !==
                    socket.id
                ) {

                    return socket.emit(
                        "errorMessage",
                        "It is not your turn."
                    );

                }


                quantity =
                    Number(quantity);


                face =
                    Number(face);


                if (
                    !Number.isInteger(
                        quantity
                    ) ||

                    quantity < 1 ||

                    quantity >
                    totalDice(room)
                ) {

                    return socket.emit(
                        "errorMessage",
                        `Quantity must be between 1 and ${totalDice(room)}.`
                    );

                }


                if (
                    !Number.isInteger(
                        face
                    ) ||

                    face < 1 ||

                    face > 6
                ) {

                    return socket.emit(
                        "errorMessage",
                        "Invalid die face."
                    );

                }


                const newBid = {

                    quantity:
                        quantity,

                    face:
                        face,

                    playerId:
                        socket.id

                };


                if (
                    !isHigherBid(
                        newBid,
                        room.bid
                    )
                ) {

                    return socket.emit(
                        "errorMessage",

                        room.bid

                            ? `Invalid bid. You must increase the quantity if using ${room.bid.face}s, or choose a higher face than ${room.bid.face}.`

                            : "Invalid bid."
                    );

                }


                room.bid =
                    newBid;


                const next =
                    getNextPlayer(
                        room,
                        socket.id
                    );


                room.currentPlayerId =
                    next.id;


                room.message =
                    `${next.name}'s turn.`;


                sendState(room);

            }
        );


        // ==================================================
        // CALL LIAR
        // ==================================================

        socket.on(
            "callLiar",
            () => {

                const room =
                    rooms.get(
                        socket.data.roomCode
                    );


                if (
                    !room ||
                    room.phase !==
                    "playing"
                ) {

                    return;
                }


                if (
                    room.currentPlayerId !==
                    socket.id
                ) {

                    return socket.emit(
                        "errorMessage",
                        "It is not your turn."
                    );

                }


                if (!room.bid) {

                    return socket.emit(
                        "errorMessage",
                        "There is no bid to challenge."
                    );

                }


                const caller =
                    room.players.find(
                        player =>
                            player.id ===
                            socket.id
                    );


                const bidder =
                    room.players.find(
                        player =>
                            player.id ===
                            room.bid.playerId
                    );


                // ------------------------------------------
                // FREEZE EVERYONE'S DICE
                // BEFORE PENALTY
                // ------------------------------------------

                const frozenDice =
                    room.players.map(
                        player => ({

                            id:
                                player.id,

                            name:
                                player.name,

                            dice:
                                player.dice.slice()

                        })
                    );


                const actualCount =
                    countFace(
                        room,
                        room.bid.face
                    );


                const bidWasTrue =
                    actualCount >=
                    room.bid.quantity;


                const loser =
                    bidWasTrue
                        ? caller
                        : bidder;


                room.reveal = {

                    caller:
                        caller.name,

                    bidder:
                        bidder.name,

                    quantity:
                        room.bid.quantity,

                    face:
                        room.bid.face,

                    actualCount:
                        actualCount,

                    bidWasTrue:
                        bidWasTrue,

                    loser:
                        loser.name,

                    loserId:
                        loser.id,

                    dice:
                        frozenDice

                };


                // Freeze the game.

                room.phase =
                    "reveal";


                room.currentPlayerId =
                    null;


                room.message =
                    bidWasTrue

                        ? `${caller.name} called Liar — the bid was TRUE.`

                        : `${caller.name} called Liar — LIAR!`;


                // DO NOT REMOVE DIE YET.

                sendState(room);

            }
        );


        // ==================================================
        // CONTINUE AFTER REVEAL
        // ==================================================

        socket.on(
            "continueRound",
            () => {

                const room =
                    rooms.get(
                        socket.data.roomCode
                    );


                if (
                    !room ||
                    room.phase !==
                    "reveal"
                ) {

                    return;
                }


                if (!room.reveal) {

                    return;
                }


                // ------------------------------------------
                // NOW REMOVE LOSER'S DIE
                // ------------------------------------------

                const loser =
                    room.players.find(
                        player =>
                            player.id ===
                            room.reveal.loserId
                    );


                if (
                    loser &&
                    loser.dice.length > 0
                ) {

                    loser.dice.pop();

                }


                // ------------------------------------------
                // CHECK WINNER
                // ------------------------------------------

                if (
                    checkWinner(room)
                ) {

                    sendState(room);

                    return;

                }


                // ------------------------------------------
                // LOSER STARTS NEXT ROUND
                // ------------------------------------------

                startNextRound(
                    room,
                    room.reveal.loserId
                );

            }
        );


        // ==================================================
        // RESTART GAME
        // ==================================================

        socket.on(
            "restartGame",
            () => {

                const room =
                    rooms.get(
                        socket.data.roomCode
                    );


                if (!room) {
                    return;
                }


                if (
                    room.players[0].id !==
                    socket.id
                ) {

                    return socket.emit(
                        "errorMessage",
                        "Only the host can restart the game."
                    );

                }


                room.players.forEach(
                    player => {

                        player.dice =
                            rollDice(
                                STARTING_DICE
                            );

                        player.connected =
                            true;

                    }
                );


                room.phase =
                    "playing";


                room.bid =
                    null;


                room.reveal =
                    null;


                room.winner =
                    null;


                room.currentPlayerId =
                    room.players[0].id;


                room.message =
                    `${room.players[0].name}'s turn.`;


                sendState(room);

            }
        );


        // ==================================================
        // DISCONNECT
        // ==================================================

        socket.on(
            "disconnect",
            () => {

                const room =
                    rooms.get(
                        socket.data.roomCode
                    );


                if (!room) {
                    return;
                }


                const player =
                    room.players.find(
                        p =>
                            p.id ===
                            socket.id
                    );


                if (!player) {
                    return;
                }


                player.connected =
                    false;


                if (
                    room.phase ===
                    "lobby"
                ) {

                    room.players =
                        room.players.filter(
                            p =>
                                p.id !==
                                socket.id
                        );


                    if (
                        room.players.length ===
                        0
                    ) {

                        rooms.delete(
                            room.code
                        );

                        return;

                    }

                }


                sendState(room);

            }
        );

    }
);


// ======================================================
// START SERVER
// ======================================================

server.listen(
    PORT,
    () => {

        console.log(
            `Liar's Dice server running on port ${PORT}`
        );

    }
);
