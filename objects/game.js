class Game {
    constructor(io, gameRoom, minPlayers, maxPlayers) {
        this.io = io;
        this.gameRoom = gameRoom;
        this.minPlayers = minPlayers;
        this.maxPlayers = maxPlayers;
        this.players = [];
    }

    get playerCount() {
        return this.players.length;
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

    shuffle(cards) {
        for(let i = cards.length - 1; i > 0; i--){
            let j = Math.floor(Math.random() * (i + 1));
            [cards[i], cards[j]] = [cards[j], cards[i]];
        }
        return cards;
    }

    dealCard(deck) {
        return deck.splice(0, 1)[0];
    }

    sendPlayerMessage({id: playerId}, message, ...data) {
        return this.io.to(playerId).emit('game-data', message, ...data);
    }

    sendRoomMessage(message, ...data) {
        this.io.to(this.gameRoom).emit('game-data', message, ...data);
    }
}

module.exports = Game;