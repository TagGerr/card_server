const cards = require('../../data/decks/cards_against_humanity'),
    Game = require('../game');

const GAME_STATE = [
    'prepare',
    'play',
    'choose',
    'score'
];
const MAX_POINTS = 5;
const CARDS_PER_HAND = 10;

class CardsAgainstHumanity extends Game {
    constructor(io, gameRoom) {
        super(io, gameRoom, 3, 6);

        this.czar = 0;
        this.state = null;

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
                this.prepareGame();
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

    prepareGame() {
        this.players = this.shuffle(this.players);

        this.players.map(p => {
            p.hand = [];
            p.score = 0;
        });

        this.blackDeck = this.shuffle(cards.black);
        this.whiteDeck = this.shuffle(cards.white);
        
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

    playCard(player, card) {
        if(this.state !== 'play'){
            this.sendPlayerMessage(player, 'invalid-state');
            return;
        }

        player = this.findPlayerInGame(player);
        
        if(typeof this.round.playedCards[ player.id ] !== 'undefined'){
            return this.sendPlayerMessage(player, 'already-played');
        }

        let cardIndex = player.hand.findIndex(c => c.id === card.id);

        if(cardIndex === -1){
            return this.sendPlayerMessage(player, 'invalid-card');
        }

        player.hand.splice(cardIndex, 1);
        this.round.playedCards[ player.id ] = card;

        let playersPlayed = Object.keys(this.round.playedCards);
        let allPlayersPlayed = this.players.every((p, idx) => playersPlayed.includes(p.id) || idx === this.czar);
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
            this.sendPlayerMessage(player, 'invalid-state');
            return;
        }

        player = this.findPlayerInGame(player);
        if(player !== this.players[ this.czar ]){
            return this.sendPlayerMessage(player, 'not-czar');
        }

        let winningPlayer;
        for(const [playerId, playedCard] of Object.entries(this.round.playedCards)){
            if(playedCard.id === card.id){
                winningPlayer = this.findPlayerInGame({id: playerId});
                break;
            }
        }

        if(typeof winningPlayer === 'undefined'){
            return this.sendPlayerMessage(player, 'invalid-card');
        }

        winningPlayer.score += this.round.blackCard.play;
        this.sendRoomMessage('selected-card', card, winningPlayer);

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