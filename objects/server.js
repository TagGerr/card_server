const generateName = require('../data/names'),
    Player = require('./player'),
    gameObjects = require('./games');

var s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);

class Server {
    constructor(io) {
        this.players = [];
        this.rooms = {};
        this.games = [
            {
                id: 'cah',
                name: 'Cards Against Humanity',
            },
            {
                id: 'jkh',
                name: 'Joking Hazard',
            },
            {
                id: 'lol',
                name: 'Love Letter',
            },
            {
                id: '31',
                name: 'Thirty-One',
            },
            {
                id: 'ava',
                name: 'Avalon',
            }
        ];
        this.gameKeys = this.games.map(g => g.id);
        this.roomRegex = new RegExp(`^(?:${this.gameKeys.join('|')})_[0-9a-e]{4}$`, 'i');

        this.io = io;
        this.io.on('connection', client => this.clientConnected(client));
    }

    clientConnected(client) {
        client.use((packet, next) => {
            if(packet[0] == 'game-event'){
                let game = this.findClientGame(client);
                if( game ){
                    return game.handleGameEvent(client.player, ...packet.slice(1));
                }
            }
            next();
        });

        client
            .on('send-chat', msg => this.handleChatMessage(client, msg))
            .on('choose-game', (playerName, gameId) => this.chooseGame(client, playerName, gameId))
            .on('create-game', () => this.createGame(client))
            .on('join-game', room => this.joinGame(client, room))
            .on('leave-game', () => this.leaveGame(client))
            .on('disconnect', () => this.disconnect(client));

        this.sendDirectMessage(client, 'welcome', {
            games: this.games,
            suggested_name: generateName(),
            client_id: client.id
        });
    }

    findClientGame(client) {
        if(typeof client.player === 'undefined' || typeof client.player.game === 'undefined' || typeof client.player.room === 'undefined'){
            return false;
        }

        let game = client.player.game.id;
        let room = client.player.room;

        return this.rooms[ game ][ room ];
    }

    handleChatMessage(client, msg) {
        let playersRooms = Object.keys(client.rooms);
        for(let room of playersRooms){
            if( this.roomRegex.test(room) ){
                this.sendRoomMessage(client, room, 'received-chat', msg, client.player.name);
            }
        }
    }

    getOpenGames(gameId) {
        let openGames = {};
        if(typeof this.rooms[ gameId ] !== 'undefined'){
            for(let [room, game] of Object.entries(this.rooms[ gameId ])){
                if( game.announce && game.playerCount < game.maxPlayers ){
                    openGames[ room ] = {
                        players: game.playerCount,
                        maxPlayers: game.maxPlayers
                    };
                }
            }
        }
        return openGames;
    }

    announceOpenGames(gameId) {
        let openGames = this.getOpenGames(gameId);
        this.players.forEach(player => {
            if(typeof player.game !== 'undefined' && player.game.id === gameId && typeof player.room === 'undefined'){
                this.sendDirectMessage(player, 'open-games', openGames);
            }
        });
    }

    chooseGame(client, playerName, gameId) {
        playerName = playerName.trim();
        if(playerName.length < 3){
            return this.sendDirectMessage(client, 'join-failed', {message: 'Player names must be at least 3 characters', suggested_name: generateName()});
        }

        if(typeof client.player === 'undefined'){
            for(let player of this.players){
                if(player.id === client.id){
                    console.log('Player is already connected');
                    client.player = player;
                    break;
                }
    
                if(player.name === playerName){
                    console.log('A player is already using that name');
                    return this.sendDirectMessage(client, 'join-failed', {message: 'That name is already in use', suggested_name: generateName()});
                }
            }

            if( !client.player ){
                let player = new Player(client.id, playerName);
                this.players.push(player);
                client.player = player;
            }
        }

        let game = this.games.find(g => g.id === gameId);
        if( !game ){
            return this.sendDirectMessage(client, 'join-failed', {message: 'No matching game found'});
        }

        client.player.game = game;

        this.sendDirectMessage(client, 'player-update', client.player);
        this.sendDirectMessage(client, 'chose-game');

        this.sendDirectMessage(client, 'open-games', this.getOpenGames(gameId));
    }

    createGame(client) {
        let game = client.player.game.id,
            gameTitle = this.games.find(g => g.id === game).name;

        console.log(`${client.player.name} has created a game of ${gameTitle}!`);
        
        if(typeof this.rooms[ game ] === 'undefined'){
            this.rooms[ game ] = {};
        }

        let room;
        do {
            room = s4();
        } while(typeof this.rooms[ game ][ room ] !== 'undefined');

        let gameRoom = `${game}_${room}`;
        client.join(gameRoom);
        client.player.room = room;

        console.log(`${gameTitle} can now be played in room ${room}`);

        let gameObj = new gameObjects[ game ](this.io, gameRoom);
        gameObj.addPlayer(client.player);

        this.rooms[ game ][ room ] = gameObj;

        this.sendDirectMessage(client, 'player-update', client.player);
        this.sendDirectMessage(client, 'created-game');

        if( gameObj.announce ){
            this.announceOpenGames(game);
        }
    }

    joinGame(client, room) {
        room = room.trim().toLowerCase();
        if(room.length < 1){
            return this.sendDirectMessage(client, 'join-failed', {message: 'Please specify a room code'});
        }

        let game = client.player.game.id,
            gameRoom = `${game}_${room}`;

        if(typeof this.rooms[ game ] === 'undefined' || typeof this.rooms[ game ][ room ] === 'undefined'){
            return this.sendDirectMessage(client, 'join-failed', {message: 'Invalid room code'});
        }
        
        console.log(`${client.player.name} would like to join room ${room} in game ${game}`);

        client.join(gameRoom);
        client.player.room = room;
        
        try {
        	this.rooms[ game ][ room ].addPlayer(client.player);
        } catch (err) {
        	return this.sendDirectMessage(client, 'join-failed', {message: err.message});
        }

        this.sendRoomMessage(client, gameRoom, 'player-joined', client.player);

        this.sendDirectMessage(client, 'player-update', client.player);
        this.sendDirectMessage(client, 'joined-game', this.rooms[ game ][ room ].players);

        if(this.rooms[ game ][ room ].announce){
            this.announceOpenGames(game);
        }
    }

    leaveGame(client) {
        if(typeof client.player === 'undefined'){
            return;
        }
        
        let game = client.player.game.id;
        let room = client.player.room;
        let gameRoom = `${game}_${room}`;

        if(typeof game === 'undefined' || typeof room === 'undefined'){
            return;
        }

        client.leave(gameRoom);
        if(this.rooms[ game ][ room ]){
            this.rooms[ game ][ room ].removePlayer(client.player);
            if(this.rooms[ game ][ room ].playerCount < 1){
                let announceRemoval = this.rooms[ game ][ room ].announce;
                delete this.rooms[ game ][ room ];

                if( announceRemoval ){
                    this.announceOpenGames(game);
                }

                if(this.rooms[ game ].length < 1){
                    delete this.rooms[ game ];
                }
            }
        }

        delete client.player.room;

        this.sendRoomMessage(client, gameRoom, 'player-left', client.player);
        
        this.sendDirectMessage(client, 'player-update', client.player);
        this.sendDirectMessage(client, 'chose-game');

        this.sendDirectMessage(client, 'open-games', this.getOpenGames(game));
    }

    disconnect(client) {
        console.log(`Player ${client.id} has left the game`);
        this.leaveGame(client);
        this.players = this.players.filter(p => p.id !== client.id);
    }

    sendDirectMessage({id: socketId}, message, ...data) {
        this.io.to(socketId).emit(message, ...data);
        return true;
    }

    sendRoomMessage(client, room, message, ...data) {
        client.to(room).emit(message, ...data);
        return true;
    }
}

module.exports = Server;