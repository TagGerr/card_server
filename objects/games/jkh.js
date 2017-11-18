const cards = require('../../data/decks/joking_hazard'),
    Game = require('../game');

const MAX_POINTS = 3;
const CARDS_PER_HAND = 7;

class JokingHazard extends Game {
    constructor(io, gameRoom) {
        super(io, gameRoom, 1, 10);

        this.judge = 0;
        this.state = 'new';
        this.pausedState = null;

        this.round = {};
    }

    get broadcastPlayerData() {
        return this.players.map(p => {
            return {id: p.id, name: p.name, score: p.score};
        });
    }

    handleGameEvent(player, eventName, ...data){
        switch(eventName){
            case 'start':
                this.prepareGame(player);
                break;

            case 'setup-comic':
                this.setupComic(player, ...data);
                break;

            case 'play-card':
                this.playCard(player, ...data);
                break;

            case 'select-card':
                this.selectCard(player, ...data);
                break;

            default:
                console.log(`${eventName} is not yet handled!`);
        }
    }

    removePlayer(player) {
        super.removePlayer(player);
        if(this.state !== 'new'){
            if(this.playerCount < this.minPlayers){
                this.pausedState = this.state;
                this.state = 'paused';
            }
        }
    }

    addPlayer(player) {
        super.addPlayer(player);
        if(this.state === 'paused'){
            if(this.playerCount >= this.minPlayers){
                this.state = this.pausedState;
            }
        }
    }

    prepareGame(player) {
        if(this.state !== 'new' && this.state !== 'end'){
            return this.sendPlayerMessage(player, 'start-failed', `Invalid state: ${this.state}`);
        }

    	if(this.playerCount < this.minPlayers){
    		return this.sendPlayerMessage(player, 'start-failed', 'Not enough players');
        }
    	
        this.players = this.shuffle(this.players);

        this.players.map(p => {
            p.hand = [];
            p.score = 0;
        });

        this.deck = this.shuffle(cards);
        
        this.sendRoomMessage('game-started', this.broadcastPlayerData, MAX_POINTS);

        this.startRound();
    }

    startRound() {
        this.state = 'setup';

        this.fillHands();
        
        let introCard = this.dealCard(this.deck);
        this.round = {
            introCard: introCard,
            style: introCard.color === 'red' ? 'bonus' : 'regular',
            playedCards: {}
        };

        let playerMessage = 'player-wait',
            judgeMessage = 'judge-setup';
        if(this.round.style === 'bonus'){
            playerMessage = 'player-bonus';
            judgeMessage = 'judge-bonus';
        }

        this.players.forEach((p, idx) => {
            if(idx === this.judge){
                this.sendPlayerMessage(p, judgeMessage, this.round.introCard, p.hand);
            } else {
                this.sendPlayerMessage(p, playerMessage, this.round.introCard, p.hand);
            }
        });
    }

    fillHands() {
        let keepDealing = true;
        while(keepDealing){
            keepDealing = false;
            this.players.forEach(p => {
                if(p.hand.length < CARDS_PER_HAND){
                    p.hand.push(this.dealCard(this.deck));
                    keepDealing = true;
                }
            });
        }
        return;
    }

    setupComic(player, card, position = 'before') {
        if(this.state !== 'setup'){
            return this.sendPlayerMessage(player, 'invalid-state');
        }

        player = this.findPlayerInGame(player);
        if(player !== this.players[ this.judge ]){
            return this.sendPlayerMessage(player, 'not-judge');
        }

        if(typeof this.round.setupCard !== 'undefined'){
            return this.sendPlayerMessage(player, 'already-setup');
        }

        let cardIndex = player.hand.findIndex(c => c.id === card.id);
        if(cardIndex === -1){
            return this.sendPlayerMessage(player, 'invalid-card');
        }

        player.hand.splice(cardIndex, 1);
        this.round.setupCard = card;

        this.state = 'play';

        this.players.forEach((p, idx) => {
            if(idx === this.judge){
                this.sendPlayerMessage(p, 'judge-wait');
            } else {
                this.sendPlayerMessage(p, 'joke-setup', this.round.setupCard, position);
            }
        });
    }

    playCard(player, cards) {
        if(this.state !== 'play'){
            return this.sendPlayerMessage(player, 'invalid-state');
        }

        player = this.findPlayerInGame(player);
        
        if(typeof this.round.playedCards[ player.id ] !== 'undefined'){
            return this.sendPlayerMessage(player, 'already-played');
        }

        if(cards.length < 1){
            return this.sendPlayerMessage(player, 'bad-cards', 'You must choose at least one card');
        } else if(this.round.style === 'regular' && cards.length !== 1){
            return this.sendPlayerMessage(player, 'bad-cards', 'Regular rounds only need one card');
        } else if(this.round.style === 'bonus' && cards.length !== 2){
            return this.sendPlayerMessage(player, 'bad-card', 'Bonus rounds require exactly 2 cards');
        }

        let cardIds = cards.map(c => c.id);

        let cardsAreUnique = cardIds.length !== (new Set(cardIds)).length;
        let playerHasCards = cardIds.every(i => player.hand.some(pc => pc.id === i));
        if( !cardsAreUnique || !playerHasCards ){
            return this.sendPlayerMessage(player, 'invalid-cards');
        }

        player.hand = player.hand.filter(pc => !cardIds.includes(pc.id));

        this.round.playedCards[ player.id ] = cards;

        let playersPlayed = Object.keys(this.round.playedCards);
        let allPlayersPlayed = this.players.every((p, idx) => playersPlayed.includes(p.id) || idx === this.judge);
        if( allPlayersPlayed ){
            return this.judgeRound();
        }
    }

    judgeRound() {
        this.state = 'judge';

        let selectedCards = Array.from(Object.values(this.round.playedCards));
        selectedCards = this.shuffle(selectedCards);

        this.sendRoomMessage('cards-played', selectedCards);
    }
}

module.exports = JokingHazard;