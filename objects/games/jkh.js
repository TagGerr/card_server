const cards = require('../../data/decks/joking_hazard'),
    Game = require('../game');

const MAX_POINTS = 5;
const CARDS_PER_HAND = 7;

class JokingHazard extends Game {
    constructor(io, gameRoom, {announce = true, points = MAX_POINTS} = {}) {
        super(io, gameRoom, 3, 10, announce);

        this.judge = 0;
        this.state = 'new';
        this.pausedState = null;
        this.maxPoints = points;

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
            
            case 'trash-cards':
                this.trashCards(player, ...data);
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
        let playerIndex = this.players.findIndex(p => p.id === player.id);
        super.removePlayer(player);

        if(this.state === 'end'){
            return;
        }
        
        if(this.state !== 'new'){
            if(this.playerCount < this.minPlayers){
                let highScore = Math.max.apply(Math, this.players.map(p => p.score)),
                    winningPlayers = this.players.filter(p => p.score === highScore);
                this.endGame.apply(this, winningPlayers);
            } else {
                if(playerIndex === this.judge){
                    this.sendRoomMessage('judge-left');
                    if(this.judge >= this.playerCount){
                        this.judge = 0;
                    }
                    return this.startRound();
                } else {
                    delete this.round.playedCards[ player.id ];
                    this.checkPlayedCards();
                }
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
                    maxPoints: this.maxPoints,
                    judge: this.players[ this.judge ].id,
                    introCard: this.round.introCard,
                    roundStyle: this.round.style,
                    hand: p.hand,
                    selectedCards: this.round.playedCards[ player.id ] || []
                };

                if(typeof this.round.setupCard !== 'undefined'){
                    gameData.setupCard = this.round.setupCard;
                }

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
        this.judge = 0;
        this.deck = this.shuffle(cards);
        this.players = this.shuffle(this.players);

        this.players.map(p => {
            p.hand = [];
            p.score = 0;
        });
        
        this.sendRoomMessage('game-started', this.broadcastPlayerData, this.maxPoints);

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
            this.state = 'play';
        }

        this.sendRoomMessage('round-start', this.players[ this.judge ].id);

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

    trashCards(player) {
        if(['play', 'setup'].includes(this.state) === false){
            return this.sendPlayerMessage(player, 'invalid-state');
        }

        player = this.findPlayerInGame(player);

        if(typeof this.round.playedCards[ player.id ] !== 'undefined'){
            return this.sendPlayerMessage(player, 'already-played');
        }

        player.hand = [];
        while(player.hand.length < CARDS_PER_HAND){
            player.hand.push(this.dealCard(this.deck));
        }

        this.sendPlayerMessage(player, 'cards-dealt', player.hand);
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
            return this.sendPlayerMessage(player, 'invalid-card', player.hand);
        }

        player.hand.splice(cardIndex, 1);
        this.round.setupCard = {card: card, position: position};

        this.state = 'play';

        this.players.forEach((p, idx) => {
            if(idx === this.judge){
                this.sendPlayerMessage(p, 'judge-wait');
            } else {
                this.sendPlayerMessage(p, 'joke-setup', this.round.setupCard);
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

        let cardsAreUnique = cardIds.length === (new Set(cardIds)).size;
        let playerHasCards = cardIds.every(i => player.hand.some(pc => pc.id === i));
        if( !cardsAreUnique || !playerHasCards ){
            return this.sendPlayerMessage(player, 'invalid-cards', player.hand);
        }

        player.hand = player.hand.filter(pc => !cardIds.includes(pc.id));

        this.round.playedCards[ player.id ] = cards;

        this.sendRoomMessage('cards-chosen', {id: player.id, name: player.name});

        this.checkPlayedCards();
    }

    checkPlayedCards() {
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

    selectCard(player, card) {
        if(this.state !== 'judge'){
            return this.sendPlayerMessage(player, 'invalid-state');
        }

        player = this.findPlayerInGame(player);
        if(player !== this.players[ this.judge ]){
            return this.sendPlayerMessage(player, 'not-judge');
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

        winningPlayer.score += this.round.style === 'bonus' ? 2 : 1;
        this.sendRoomMessage('selected-card', winningCards, winningPlayer);

        return this.scoreRound();
    }

    scoreRound() {
        this.state = 'score';
        this.judge += 1;
        if(this.judge >= this.players.length){
            this.judge = 0;
        }

        this.sendRoomMessage('update-scores', this.broadcastPlayerData);

        let gameOver = this.players.some(p => {
            if(p.score >= this.maxPoints){
                return this.endGame(p);
            }
        });

        if( !gameOver ){
            return this.startRound();
        }
    }

    endGame(...players) {
        this.state = 'end';

        this.sendRoomMessage('game-won', players);
        return true;
    }
}

module.exports = JokingHazard;