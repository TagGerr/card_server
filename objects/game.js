class Game {
    constructor(io, minPlayers, maxPlayers) {
        this.io = io;
        this.minPlayers = minPlayers;
        this.maxPlayers = maxPlayers;
        this.players = [];
    }

    get playerCount() {
        return this.players.length;
    }

    addPlayer(player) {
        this.players.push(player);
    }

    removePlayer(player) {
        this.players = this.players.filter(p => p.id !== player.id);
    }

    shuffle(cards) {
        for(let i = cards.length - 1; i > 0; i--){
            let j = Math.floor(Math.random() * (i + 1));
            [cards[i], cards[j]] = [cards[j], cards[i]];
        }
        return cards;
    }

    dealCard(deck) {
        return deck.splice(0, 1);
    }
}

module.exports = Game;