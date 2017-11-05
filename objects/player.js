const NAMES = require('../data/names');

module.exports = class Player {
    constructor(name = null) {
        this.name = name;
        if(this.name === null){
            const adjective = NAMES.adjectives[ Math.ceil(Math.random() * NAMES.adjectives.length) ];
            const noun = NAMES.nouns[ Math.ceil(Math.random() * NAMES.nouns.length)  ];
            
            this.name = `${adjective} ${noun}`;
        }
    }
}