const cards = require('../../data/decks/cards_against_humanity'),
    Game = require('../game');

const MAX_POINTS = 5;
const CARDS_PER_HAND = 10;

class CardsAgainstHumanity extends Game {
    constructor(io, gameRoom, announce = true) {
        super(io, gameRoom, 3, 10, announce);

        this.czar = 0;
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
        if(this.state !== 'new'){
            throw Error('Cannot join a game in progress');
        }
        super.addPlayer(player);
        if(this.state === 'paused'){
            if(this.playerCount >= this.minPlayers){
                this.state = this.pausedState;
            }
        }
    }

    handleReconnect(player, oldId) {
        if( this.round.playedCards.hasOwnProperty(oldId) ){
            Object.defineProperty(this.round.playedCards, player.id, Object.getOwnPropertyDescriptor(this.round.playedCards, oldId));
            delete this.round.playedCards[ oldId ];
        }

        let reconnected = this.players.some(p => {
            if(p.id === player.id){
                let gameData = {
                    players: this.broadcastPlayerData,
                    maxPoints: MAX_POINTS,
                    czar: this.players[ this.czar ].id,
                    blackCard: this.round.blackCard,
                    hand: p.hand,
                    selectedCards: this.round.playedCards[ player.id ] || []
                };

                if(this.state === 'judge'){
                    let playedCards = Array.from(Object.values(this.round.playedCards));
                    gameData.playedCards = this.shuffle(playedCards);
                }

                this.sendPlayerMessage(player, 'game-reconnected', gameData);
                return true;
            }
        });
    }

    prepareGame(player) {
        if(this.state !== 'new' && this.state !== 'end'){
            return this.sendPlayerMessage(player, 'start-failed', `Invalid state: ${this.state}`);
        }
        
    	if(this.playerCount < this.minPlayers){
            return this.sendPlayerMessage(player, 'start-failed', 'Not enough players');
        }
        
        this.started = true;
        this.announce = false;
        this.czar = 0;
        this.whiteDeck = this.shuffle(cards.white);
        this.blackDeck = this.shuffle(cards.black);
        this.players = this.shuffle(this.players);

        this.players.map(p => {
            p.hand = [];
            p.score = 0;
        });
        
        this.sendRoomMessage('game-started', this.broadcastPlayerData, MAX_POINTS);

        this.startRound();
    }

    startRound() {
        this.state = 'play';

        this.fillHands();
        
        this.round = {
            blackCard: this.dealCard(this.blackDeck),
            playedCards: {}
        };

        this.sendRoomMessage('round-start', this.players[ this.czar ].id);

        this.players.forEach((p, idx) => {
            if(idx === this.czar){
                this.sendPlayerMessage(p, 'czar-wait', this.round.blackCard);
            } else {
                this.sendPlayerMessage(p, 'cards-dealt', this.round.blackCard, p.hand);
            }
        });
    }

    fillHands() {
        let keepDealing = true;
        while(keepDealing){
            keepDealing = false;
            this.players.forEach(p => {
                if(p.hand.length < CARDS_PER_HAND){
                    p.hand.push(this.dealCard(this.whiteDeck));
                    keepDealing = true;
                }
            });
        }
        return;
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
            return this.sendPlayerMessage(player, 'no-cards', player.hand);
        }

        let cardIds = cards.map(c => c.id);

        let cardsAreUnique = cardIds.length === (new Set(cardIds)).size;
        let playerHasCards = cardIds.every(i => player.hand.some(pc => pc.id === i));
        if( !cardsAreUnique || !playerHasCards ){
            return this.sendPlayerMessage(player, 'invalid-cards', player.hand);
        }

        player.hand = player.hand.filter(pc => !cardIds.includes(pc.id));

        this.round.playedCards[ player.id ] = cards;

        let playersPlayed = Object.keys(this.round.playedCards);
        let allPlayersPlayed = this.players.every((p, idx) => playersPlayed.includes(p.id) || idx === this.czar);
        if( allPlayersPlayed ){
            return this.judgeRound();
        }
    }

    judgeRound() {
        this.state = 'judge';

        let playedCards = Array.from(Object.values(this.round.playedCards));
        playedCards = this.shuffle(playedCards);

        this.sendRoomMessage('cards-played', playedCards);
    }

    selectCard(player, card) {
        if(this.state !== 'judge'){
            return this.sendPlayerMessage(player, 'invalid-state');
        }

        player = this.findPlayerInGame(player);
        if(player !== this.players[ this.czar ]){
            return this.sendPlayerMessage(player, 'not-czar');
        }

        let winningPlayer, winningCards;
        for(const [playerId, playedCards] of Object.entries(this.round.playedCards)){
            if( playedCards.some(c => c.id === card.id) ){
                winningPlayer = this.findPlayerInGame({id: playerId});
                winningCards = playedCards;
                break;
            }
        }

        if(typeof winningPlayer === 'undefined'){
            return this.sendPlayerMessage(player, 'invalid-card');
        }

        winningPlayer.score += 1;
        this.sendRoomMessage('selected-card', winningCards, winningPlayer);

        return this.scoreRound();
    }

    scoreRound() {
        this.state = 'score';
        this.czar += 1;
        if(this.czar >= this.players.length){
            this.czar = 0;
        }

        this.sendRoomMessage('update-scores', this.broadcastPlayerData);

        let gameOver = this.players.some(p => {
            if(p.score >= MAX_POINTS){
                return this.endGame(p);
            }
        });

        if( !gameOver ){
            return this.startRound();
        }
    }

    endGame(player) {
        this.state = 'end';

        this.sendRoomMessage('player-wins', player);
        return true;
    }
}

module.exports = CardsAgainstHumanity;