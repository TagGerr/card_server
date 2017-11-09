const app = require('express')(),
    http = require('http').Server(app),
    io = require('socket.io')(http),
    generateName = require('./data/names'),
    Player = require('./objects/player'),
    CardsAgainstHumanity = require('./objects/games/cah');

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, *');
    
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
        {
            id: 'joking_hazard',
            name: 'Joking Hazard',
        },
        {
            id: 'ava',
            name: 'Avalon',
        },
        {
            id: 'lol',
            name: 'Love Letters',
        }
    ];

io.on('connection', client => {
    client.emit('welcome', {
        games: games,
        suggested_name: generateName(),
    });

    client.on('send-chat', msg => {
        if(typeof client.player.game == 'undefined' || typeof client.player.room == 'undefined'){
            return;
        }
        client.to(`${client.player.game.id}_${client.player.room}`).emit('received-chat', client.player.name, msg);
    });

    client.on('choose-game', (name, type) => {
        if(typeof client.player === 'undefined'){
            for(let player of players){
                if(player.id == client.id){
                    console.log('Player is already connected');
                    client.player = player;
                    break;
                }
    
                if(player.name == name){
                    console.log('A player is already using that name');
                    client.emit('join-failed', {message: 'That name is already in use', suggested_name: generateName()});
                    return;
                }
            }

            if( !client.player ){
                let player = new Player(client.id, name);
                client.player = player;
            }
        }

        let game = games.find(g => g.id === type);
        if( !game ){
            client.emit('join-failed', {message: 'No matching game found'});
            return;
        }

        client.player.game = game;

        client.emit('player-update', client.player);
        client.emit('chose-game');
    });

    client.on('create-game', () => {
        console.log(`${client.player.name} has created a game!`);
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

        let gameObj;
        switch(game){
            case 'cah':
                gameObj = new CardsAgainstHumanity(io);
                break;
        }
        rooms[ game ][ room ] = gameObj;

        gameObj.addPlayer(client.player);

        client.emit('player-update', client.player);
        client.emit('created-game');
    });

    client.on('join-game', room => {
        let game = client.player.game.id;
        console.log(`${client.player.name} would like to join room ${room} in game ${game}`);
        client.to(`${game}_${room}`).emit('player-joined', client.player);

        client.join(`${game}_${room}`);
        client.player.room = room;
        rooms[ game ][ room ].addPlayer(client.player);

        client.emit('player-update', client.player);
        client.emit('joined-game', rooms[ game ][ room ].players);
    });

    client.on('choose-card', card => {
        console.log(`Player chose card ${card}`);
    });

    client.on('game-event', (msg, ...data) => {
        console.log(`${client.player.name} sent a ${msg} message to the game object`);
        if(typeof client.player.game == 'undefined' || typeof client.player.room == 'undefined'){
            return;
        }

        let game = client.player.game.id;
        let room = client.player.room;

        rooms[ game ][ room ].handleGameEvent(msg, data);

        console.log(data);

    });

    client.on('leave-game', () => {
        let game = client.player.game.id;
        let room = client.player.room;
        client.leave(`${game}_${room}`);
        rooms[ game ][ room ].removePlayer(client.player);
        if(rooms[ game ][ room ].playerCount < 1){
            delete rooms[ game ][ room ];
            if(rooms[ game ].length < 1){
                delete rooms[ game ];
            }
        }

        delete client.player.room;
        client.to(`${game}_${room}`).emit('player left', client.player);
        
        client.emit('player-update', client.player);
        client.emit('chose-game');
    })

    client.on('disconnect', () => {
        console.log(`Player ${client.id} has left the game`);
        players = players.filter(p => p.id !== client.id);
    });
})
