const app = require('express')(),
    http = require('http').Server(app),
    io = require('socket.io')(http),
    generateName = require('./data/names'),
    Player = require('./objects/player');

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

http.listen(5150, () => {
    console.log('Server running on port 5150');
});

var s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);

var generateUID = () => {
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
};

let players = [],
    rooms = {},
    games = [
        {
            id: 'cah',
            name: 'Cards Against Humanity',
        },
        // {
        //     id: 'joking_hazard',
        //     name: 'Joking Hazard',
        // },
        // {
        //     id: 'ava',
        //     name: 'Avalon',
        // },
        // {
        //     id: 'lol',
        //     name: 'Love Letters',
        // }
    ];

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
}

var game = new Game();

io.on('connection', client => {
    client.emit('welcome', {
        games: games,
        suggested_name: generateName(),
    });

    client.on('choose game', (name, type) => {
        if(typeof client.player === 'undefined'){
            for(let player of players){
                if(player.id == client.id){
                    console.log('Player is already connected');
                    client.player = player;
                    break;
                }
    
                if(player.name == name){
                    console.log('A player is already using that name');
                    client.emit('join failed', {message: 'That name is already in use', suggested_name: generateName()});
                    return;
                }
            }

            if( !client.player ){
                let player = new Player(client.id, name);
                players.push(player);
                client.player = player;
            }
        }

        let game = games.find(g => g.id === type);
        if( !game ){
            client.emit('join failed', {message: 'No matching game found'});
            return;
        }

        client.player.game = game;

        client.emit('update player', client.player);
        client.emit('chose game');
    });

    client.on('start game', () => {
        console.log(`${client.player.name} has started a game!`);
        let game = client.player.game.id;
        if(typeof rooms[ game ] === 'undefined'){
            rooms[ game ] = {};
        }

        let room = s4();
        while(typeof rooms[ game ][ room ] !== 'undefined'){
            room = s4();
        }

        client.join(`${game}_${room}`);
        client.player.room = room;
        rooms[ game ][ room ] = [client.player];

        client.emit('update player', client.player);
        client.emit('started game');
    });

    client.on('join game', room => {
        let game = client.player.game.id;
        console.log(`${client.player.name} would like to join room ${room} in game ${game}`);
        client.to(`${game}_${room}`).emit('player joined', client.player);

        client.join(`${game}_${room}`);
        client.player.room = room;
        rooms[ game ][ room ].push(client.player);

        client.emit('update player', client.player);
        client.emit('joined game', rooms[ game ][ room ]);
        /*
        let player = new Player();
        game.addPlayer(player);
        client.emit('connected', player);
        var hand = game.whiteCards.splice(0, 5);
        client.emit('draw', hand);
        */
    });

    client.on('choose card', card => {
        console.log(`Player chose card ${card}`);
    });

    client.on('leave game', () => {
        let game = client.player.game.id;
        let room = client.player.room;
        client.leave(`${game}_${room}`);
        rooms[ game ][ room ] = rooms[ game ][ room ].filter(p => p !== client.player);
        if(rooms[ game ][ room ].length < 1){
            delete rooms[ game ][ room ];
            if(rooms[ game ].length < 1){
                delete rooms[ game ];
            }
        }

        delete client.player.room;
        client.to(`${game}_${room}`).emit('player left', client.player);
        
        client.emit('update player', client.player);
        client.emit('chose game');
    })

    client.on('disconnect', () => {
        console.log(`Player ${client.id} has left the game`);
        players = players.filter(p => p.id !== client.id);
    });
})
