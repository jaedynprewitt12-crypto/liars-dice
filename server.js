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

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function rollDice(count) {
  return Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6));
}

function activePlayers(room) {
  return room.players.filter(p => p.dice.length > 0);
}

function totalDice(room) {
  return room.players.reduce((sum, p) => sum + p.dice.length, 0);
}

function countFace(room, face) {
  return room.players.reduce((sum, p) => sum + p.dice.filter(d => d === face).length, 0);
}

function isBidHigher(newBid, oldBid) {
  if (!oldBid) return true;
  if (newBid.quantity > oldBid.quantity) return true;
  return newBid.quantity === oldBid.quantity && newBid.face > oldBid.face;
}

function nextActivePlayer(room, fromId) {
  const players = activePlayers(room);
  if (!players.length) return null;
  const idx = players.findIndex(p => p.id === fromId);
  return players[(idx + 1) % players.length];
}

function publicState(room) {
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      diceCount: p.dice.length,
      connected: p.connected
    })),
    currentPlayerId: room.currentPlayerId,
    bid: room.bid ? {
      quantity: room.bid.quantity,
      face: room.bid.face,
      playerId: room.bid.playerId
    } : null,
    challengeResult: room.challengeResult,
    message: room.message,
    winner: room.winner
  };
}

function sendState(room) {
  io.to(room.code).emit("state", publicState(room));
  for (const p of room.players) {
    io.to(p.id).emit("privateDice", { dice: p.dice, name: p.name });
  }
}

function removeDie(player) {
  if (player && player.dice.length) player.dice.pop();
}

function checkWinner(room) {
  const alive = activePlayers(room);
  if (alive.length === 1) {
    room.phase = "gameOver";
    room.winner = alive[0].name;
    room.currentPlayerId = null;
    room.message = `${alive[0].name} wins the game!`;
    return true;
  }
  return false;
}

function dealRound(room) {
  room.players.forEach(p => {
    if (p.dice.length > 0) p.dice = rollDice(p.dice.length);
  });
  room.bid = null;
  room.challengeResult = null;
  room.phase = "playing";
}

function startRound(room, starterId) {
  dealRound(room);
  room.currentPlayerId = starterId;
  const starter = room.players.find(p => p.id === starterId);
  room.message = `${starter ? starter.name : "Player"}'s turn.`;
  sendState(room);
}

io.on("connection", socket => {
  socket.on("createRoom", ({ name }) => {
    name = String(name || "").trim().slice(0, 20);
    if (!name) return socket.emit("errorMessage", "Enter a name.");

    const code = makeRoomCode();
    const room = {
      code,
      phase: "lobby",
      players: [{ id: socket.id, name, dice: [], connected: true }],
      currentPlayerId: null,
      bid: null,
      challengeResult: null,
      message: "Waiting for players...",
      winner: null
    };

    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    sendState(room);
  });

  socket.on("joinRoom", ({ code, name }) => {
    code = String(code || "").trim().toUpperCase();
    name = String(name || "").trim().slice(0, 20);

    const room = rooms.get(code);
    if (!name) return socket.emit("errorMessage", "Enter a name.");
    if (!room) return socket.emit("errorMessage", "Room not found.");
    if (room.phase !== "lobby") return socket.emit("errorMessage", "That game has already started.");
    if (room.players.length >= MAX_PLAYERS) return socket.emit("errorMessage", "Room is full.");
    if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase()))
      return socket.emit("errorMessage", "That name is already in use.");

    room.players.push({ id: socket.id, name, dice: [], connected: true });
    socket.join(code);
    socket.data.roomCode = code;
    room.message = `${name} joined the room.`;
    sendState(room);
  });

  socket.on("startGame", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    if (room.players[0]?.id !== socket.id)
      return socket.emit("errorMessage", "Only the host can start the game.");
    if (room.players.length < MIN_PLAYERS)
      return socket.emit("errorMessage", "You need at least 2 players.");

    room.players.forEach(p => p.dice = rollDice(STARTING_DICE));
    room.phase = "playing";
    room.bid = null;
    room.challengeResult = null;
    room.winner = null;
    room.currentPlayerId = room.players[0].id;
    room.message = `${room.players[0].name}'s turn.`;
    sendState(room);
  });

  socket.on("bid", ({ quantity, face }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== "playing") return;
    if (room.currentPlayerId !== socket.id)
      return socket.emit("errorMessage", "It is not your turn.");

    quantity = Number(quantity);
    face = Number(face);

    if (!Number.isInteger(quantity) || !Number.isInteger(face) || face < 1 || face > 6)
      return socket.emit("errorMessage", "Invalid bid.");
    if (quantity < 1 || quantity > totalDice(room))
      return socket.emit("errorMessage", `Quantity must be between 1 and ${totalDice(room)}.`);

    const newBid = { quantity, face, playerId: socket.id };
    if (!isBidHigher(newBid, room.bid))
      return socket.emit("errorMessage", "Your bid must be higher than the current bid.");

    room.bid = newBid;
    const next = nextActivePlayer(room, socket.id);
    room.currentPlayerId = next.id;
    room.message = `${next.name}'s turn.`;
    sendState(room);
  });

  socket.on("callLiar", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== "playing") return;
    if (room.currentPlayerId !== socket.id)
      return socket.emit("errorMessage", "It is not your turn.");
    if (!room.bid)
      return socket.emit("errorMessage", "There is no bid to challenge.");

    const caller = room.players.find(p => p.id === socket.id);
    const bidder = room.players.find(p => p.id === room.bid.playerId);

    if (!caller || !bidder) return socket.emit("errorMessage", "Unable to resolve the bid.");

    const actualCount = countFace(room, room.bid.face);
    const bidWasTrue = actualCount >= room.bid.quantity;
    const loser = bidWasTrue ? caller : bidder;

    removeDie(loser);

    room.challengeResult = {
      caller: caller.name,
      bidder: bidder.name,
      quantity: room.bid.quantity,
      face: room.bid.face,
      actualCount,
      bidWasTrue,
      loser: loser.name
    };

    if (checkWinner(room)) {
      sendState(room);
      return;
    }

    // The player who lost the die starts the next round.
    startRound(room, loser.id);
  });

  socket.on("restartGame", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    if (room.players[0]?.id !== socket.id)
      return socket.emit("errorMessage", "Only the host can restart the game.");

    room.players.forEach(p => {
      p.dice = rollDice(STARTING_DICE);
      p.connected = true;
    });
    room.phase = "playing";
    room.bid = null;
    room.challengeResult = null;
    room.winner = null;
    room.currentPlayerId = room.players[0].id;
    room.message = `${room.players[0].name}'s turn.`;
    sendState(room);
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return;

    const p = room.players.find(x => x.id === socket.id);
    if (!p) return;
    p.connected = false;

    // In the lobby, remove disconnected players so the room stays clean.
    if (room.phase === "lobby") {
      room.players = room.players.filter(x => x.id !== socket.id);
      if (!room.players.length) {
        rooms.delete(code);
        return;
      }
    }

    sendState(room);
  });
});

server.listen(PORT, () => {
  console.log(`Liar's Dice server running on http://localhost:${PORT}`);
});
