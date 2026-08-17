const socket = io();
let myId = null;
let state = null;
let myDice = [];

const $ = id => document.getElementById(id);

socket.on("connect", () => { myId = socket.id; });

socket.on("errorMessage", msg => {
  $("error").textContent = msg;
  setTimeout(() => $("error").textContent = "", 3500);
});

socket.on("privateDice", payload => {
  myDice = payload.dice || [];
  renderDice();
});

socket.on("state", s => {
  state = s;
  $("login").hidden = true;
  $("game").hidden = false;
  $("code").textContent = s.code;
  $("phaseLabel").textContent = s.phase === "playing" ? "LIVE" : s.phase.toUpperCase();

  $("lobby").hidden = s.phase !== "lobby";
  $("play").hidden = s.phase !== "playing";
  $("gameOver").hidden = s.phase !== "gameOver";

  if (s.phase === "lobby") {
    $("lobbyPlayers").innerHTML = s.players.map((p, i) =>
      `<div class="player"><span>${i === 0 ? "👑 " : ""}${escapeHtml(p.name)}</span><span>${p.connected ? "✓" : "offline"}</span></div>`
    ).join("");
    $("start").hidden = !(s.players[0]?.id === myId && s.players.length >= 2);
  }

  if (s.phase === "playing") {
    renderPlayers();
    $("message").textContent = s.message || "";
    $("bid").textContent = s.bid ? `${s.bid.quantity} × ${s.bid.face}s` : "No bid yet";
    const myTurn = s.currentPlayerId === myId;
    $("bidBtn").disabled = !myTurn;
    $("liarBtn").disabled = !myTurn || !s.bid;
    $("qty").max = totalDice(s);

    if (s.bid && s.bid.playerId === myId) {
      $("qty").min = s.bid.quantity;
    } else if (s.bid) {
      $("qty").min = 1;
    } else {
      $("qty").min = 1;
    }

    $("result").hidden = true;
  }

  if (s.phase === "gameOver") {
    $("winner").textContent = `🏆 ${s.winner} wins!`;
  }
});

function totalDice(s) {
  return s.players.reduce((n, p) => n + p.diceCount, 0);
}

function renderDice() {
  $("myDice").innerHTML = myDice.map(d => `<div class="die">${d}</div>`).join("");
}

function renderPlayers() {
  $("players").innerHTML = state.players.map(p => {
    const active = p.id === state.currentPlayerId ? " active" : "";
    const you = p.id === myId ? " you" : "";
    return `<div class="player${you}">
      <span>${escapeHtml(p.name)}${p.id === myId ? " (you)" : ""}</span>
      <span class="${active}">${p.diceCount} dice${active ? " • TURN" : ""}</span>
    </div>`;
  }).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

$("create").onclick = () => socket.emit("createRoom", { name: $("name").value });

$("showJoin").onclick = () => {
  $("joinBox").hidden = !$("joinBox").hidden;
};

$("join").onclick = () => socket.emit("joinRoom", {
  code: $("roomCode").value,
  name: $("name").value
});

$("start").onclick = () => socket.emit("startGame");

$("bidBtn").onclick = () => socket.emit("bid", {
  quantity: Number($("qty").value),
  face: Number($("face").value)
});

$("liarBtn").onclick = () => socket.emit("callLiar");

$("restart").onclick = () => socket.emit("restartGame");
