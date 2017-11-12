const cards = require('../../data/decks/thirty_one'),
    Game = require('../game');

class ThirtyOne extends Game {
    constructor(io) {
        super(io, 2, 8);
    }
}