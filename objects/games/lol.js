const cards = require('../../data/decks/love_letters'),
    Game = require('../game');

class LoveLetters extends Game {
    constructor(io) {
        super(io, 2, 4);
    }
}