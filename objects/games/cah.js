const cards = require('../../data/decks/cards_against_humanity'),
    Game = require('../game');

class CardsAgainstHumanity extends Game {
    constructor(io) {
        super(io, 3, 6);
        this.blackDeck = this.shuffle(cards.black);
        this.whiteDeck = this.shuffle(cards.white);
    }

    handleGameEvent(event, data){
        switch(event){
            case 'start':
                this.startGame();
                break;

            default:
                console.log(`${event} is not yet handled!`);
        }
    }

    startGame() {
        this.players.map(p => p.hand = []);
        for(let c = 0; c < 10; c++){
            this.players.map(p => p.hand.push(this.dealCard(this.whiteDeck)));
        }
        this.players.forEach(p => this.io.to(p.id).emit('player-update', p));
    }
}

module.exports = CardsAgainstHumanity;