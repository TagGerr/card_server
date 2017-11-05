const express = require('express'),
    app = express(),
    Player = require('./objects/player');

const server = app.listen(process.env.PORT || 5150, () => {
    var port = server.address().port;
    console.log(`Server running on port ${port}`);
});

const io = require('socket.io')(server);

var generateUID = () => {
    var s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

console.log(generateUID());

class Game {
    constructor() {
        this.blackCards = [1,2,3,4,5];
        this.whiteCards = [21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50];
        this.players = [];

        this.shuffle(this.blackCards);
        this.shuffle(this.whiteCards);
    }

    shuffle(arr) {
        for(let i = arr.length - 1; i > 0; i--){
            let j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    addPlayer(player) {
        this.players.push(player);
        console.log(this.players);
    }

    removePlayer(player) {
        this.players = this.players.filter(p => p.id !== player.id);
    }
}

var game = new Game();

io.on('connection', client => {
    console.log('User connected');

    client.on('join', name => {
        let player = new Player();
        game.addPlayer(player);
        client.emit('connected', player);
        var hand = game.whiteCards.splice(0, 5);
        client.emit('draw', hand);
    });

    client.on('choose', card => {
        console.log(`Player chose card ${card}`);
    })
})
