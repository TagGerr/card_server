const cards = require('../../data/decks/avalon'),
    Game = require('../game');

class Avalon extends Game {
    constructor(io) {
        super(io, 5, 10);
    }
}