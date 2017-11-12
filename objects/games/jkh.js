const Game = require('../game');

class JokingHazard extends Game {
    constructor() {
        super(io, 3, 6);
    }
}