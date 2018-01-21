class Game {
    constructor(io, gameRoom, minPlayers, maxPlayers, announce = true) {
        this.io = io;
        this.gameRoom = gameRoom;
        this.minPlayers = minPlayers;
        this.maxPlayers = maxPlayers;
        this.players = [];

        this.announce = announce;
        this.started = false;
    }

    get playerCount() {
        return this.players.length;
    }

    updatePlayerId(newId, oldId) {
        this.players.some(p => {
            if(p.id === oldId){
                p.id = newId;
                return true;
            }
        });
    }

    addPlayer(player) {
    	if(this.playerCount >= this.maxPlayers){
    		throw Error('Too many players');
    	}
    	
        this.players.push({id: player.id, name: player.name});
        this.checkPlayerCount();
    }
    
    removePlayer({id: playerId}) {
        this.players = this.players.filter(p => p.id !== playerId);
        this.checkPlayerCount();
    }
    
    checkPlayerCount() {
        if(this.playerCount >= this.minPlayers){
            this.sendRoomMessage('game-ready', 'Enough players');
        } else {
            let shortCount = this.minPlayers - this.playerCount;
            this.sendRoomMessage('game-wait', `Need ${shortCount} player${shortCount === 1 ? '' : 's'}`);
        }
    }

    findPlayerInGame({id: playerId}) {
        return this.players.find(p => p.id === playerId);
    }

    handleReconnect() {
        throw new Error('Game does not implement reconnecting');
    }

    shuffle(objects) {
        objects = objects.slice();
        for(let i = objects.length - 1; i > 0; i--){
            let j = Math.floor(Math.random() * (i + 1));
            [objects[i], objects[j]] = [objects[j], objects[i]];
        }
        return objects;
    }

    dealCard(deck) {
        return deck.splice(0, 1)[0];
    }

    sendPlayerMessage({id: playerId}, message, ...data) {
        return this.io.sockets.sockets[ playerId ].emit('game-data', message, ...data);
    }

    sendRoomMessage(message, ...data) {
        this.io.to(this.gameRoom).emit('game-data', message, ...data);
    }
}

module.exports = Game;