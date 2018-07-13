const cards = require('../../data/decks/love_letters'),
    Game = require('../game');

class LoveLetters extends Game {
    constructor(io, gameRoom, announce = true) {
        super(io, gameRoom, 2, 4, announce);

        this.state = 'new';
        this.activePlayer = -1;
        this.burnedCard = {};
        this.court = [];
    }

    get broadcastPlayerData() {
        return this.players.map(p => this.displayPlayer(p));
    }
    
    displayPlayer(player) {
        return {
            id: player.id,
            name: player.name,
            discards: player.discards,
            affection: player.affection,
            isPlaying: player.isPlaying
        };;
    }

    getDiscardValue(player) {
        return player.discards.reduce((t, c) => t += c.value, 0);
    }

    handleGameEvent(player, eventName, ...data){
        switch(eventName){
            case 'start':
                this.prepareGame(player);
                break;

            case 'play-card':
                this.playCard(player, ...data);
                break;
            
            default:
                console.log(`${eventName} is not yet handled!`);
        }
    }

    prepareGame(player) {
        if(this.state !== 'new' && this.state !== 'end'){
            return this.sendPlayerMessage(player, 'start-failed', `Invalid state: ${this.state}`);
        }

        if(this.playerCount < this.minPlayers){
    		return this.sendPlayerMessage(player, 'start-failed', 'Not enough players');
        }

        this.announce = false;
        this.players = this.shuffle(this.players);

        this.players.forEach(p => {
            p.cards = [];
            p.affection = 0;
        });

        this.totalAffection = Math.floor((this.maxPlayers - this.playerCount) * 2.5) + this.playerCount;
        this.activePlayer = -1;

        this.sendRoomMessage('game-started', this.broadcastPlayerData, this.totalAffection);

        this.dealPlayerCards();
    }

    dealPlayerCards() {
        this.deck = this.shuffle(cards);
        this.burnedCard = this.dealCard(this.deck);
        this.court = [];

        this.players.forEach(p => {
            p.cards = [];
            p.cards.push(this.dealCard(this.deck));
            p.discards = [];
            p.isPlaying = true;

            this.sendPlayerMessage(p, 'start-round', p);
        });

        if(this.playerCount === 2){
            while(this.court.length < 3){
                this.court.push(this.dealCard(this.deck));
            }
            this.sendRoomMessage('court-deal', this.court);
        }

        this.nextPlayer();
    }

    nextPlayer() {
        let player;
        
        if(this.players.filter(p => p.isPlaying).length <= 1){
            return this.scoreRound();
        }

        do {
            this.activePlayer += 1;
            if(this.activePlayer >= this.playerCount){
                this.activePlayer = 0;
            }

            if( this.players[ this.activePlayer ].isPlaying ){
                player = this.players[ this.activePlayer ];
            }
        } while(typeof player === 'undefined');

        if(this.deck.length < 1){
            return this.scoreRound();
        }

        let drawCard = this.dealCard(this.deck);
        player.cards.push(drawCard);

        this.sendRoomMessage('player-turn', this.displayPlayer(player));
        return this.sendPlayerMessage(player, 'your-turn', drawCard);
    }

    playCard(player, card, callback) {
        player = this.findPlayerInGame(player);
        if(player !== this.players[ this.activePlayer ]){
            callback(false);
            return this.sendPlayerMessage(player, 'not-your-turn');
        }

        const playerHasCard = player.cards.some(pc => pc.id === card.id);
        if( !playerHasCard ){
            callback(false);
            return this.sendPlayerMessage(player, 'invalid-card', 'You do not have that card');
        }

        if(player.cards.some(c => c.type === 'countess') && card.type !== 'countess' && ['king', 'prince'].some(t => card.type === t)){
            callback(false);
            return this.sendPlayerMessage(player, 'invalid-card', 'You must discard the Countess when you have the King or Prince');
        }

        player.cards = player.cards.filter(c => c.id !== card.id);
        player.discards.push(card);

        callback(true);

        this.sendRoomMessage('player-update', this.displayPlayer(player));

        switch(card.type){
            case 'guard':
                return this.playGuard(player);
                break;
            
            case 'priest':
                return this.playPriest(player);
                break;

            case 'baron':
                return this.playBaron(player);
                break;

            case 'handmaid':
                this.sendRoomMessage('handmaid-help', this.displayPlayer(player));
                break;
            
            case 'prince':
                return this.playPrince(player);
                break;

            case 'king':
                return this.playKing(player);
                break;

            case 'countess':
                this.sendRoomMessage('countess-council', this.displayPlayer(player));
                break;

            case 'princess':
                player.isPlaying = false;
                this.sendRoomMessage('princess-purge', this.displayPlayer(player));
                break;
        }

        return this.nextPlayer();
    }

    playGuard(player) {
        const targets = this.getAvailableTargets(),
            callback = (target, guess) => {
                const targetPlayer = this.findPlayerInGame(target);
                let message = 'guard-incorrect';

                if(targetPlayer.cards[0].type === guess.type){
                    this.discardCard(targetPlayer);
                    message = 'guard-correct';
                }

                this.sendRoomMessage(message, this.displayPlayer(player), target, guess);
                return this.nextPlayer();
            };

        if(targets.length < 1){
            this.sendRoomMessage('no-targets', this.displayPlayer(player), 'guard');
            return this.nextPlayer();
        }

        this.sendPlayerMessage(player, 'guard-guess', targets, this.getCardTypes(), callback);
    }

    playPriest(player) {
        const targets = this.getAvailableTargets(),
            callback = target => {
                const targetPlayer = this.findPlayerInGame(target),
                    acknowledge = () => {
                        this.sendRoomMessage('priest-viewed', this.displayPlayer(player), target);
                        return this.nextPlayer();
                    };

                this.sendPlayerMessage(player, 'priest-card', target, targetPlayer.cards[0], acknowledge);
            };

        if(targets.length < 1){
            this.sendRoomMessage('no-targets', this.displayPlayer(player), 'priest');
            return this.nextPlayer();
        }
        
        this.sendPlayerMessage(player, 'priest-peek', targets, callback);
    }
    
    playBaron(player) {
        const targets = this.getAvailableTargets(),
            callback = target => {
                let acks = new Set();

                const targetPlayer = this.findPlayerInGame(target),
                    acknowledge = ({id: playerId}) => {
                        return () => {
                            acks.add(playerId);

                            if(acks.size === 2){
                                let dataPoints = [player, targetPlayer],
                                    message = 'baron-equal';

                                if(targetPlayer.cards[0].value !== player.cards[0].value){
                                    const losingPlayer = (targetPlayer.cards[0].value < player.cards[0].value) ? targetPlayer : player;
                                    this.discardCard(losingPlayer);
                                    
                                    message = 'baron-loser';
                                    dataPoints.push(losingPlayer);
                                }

                                this.sendRoomMessage(message, ...dataPoints.map(p => this.displayPlayer(p)));
            
                                return this.nextPlayer();
                            }
                        };
                    };
                
                this.sendPlayerMessage(player, 'baron-view', this.displayPlayer(targetPlayer), targetPlayer.cards[0], acknowledge(player));
                this.sendPlayerMessage(target, 'baron-view', this.displayPlayer(player), player.cards[0], acknowledge(target));
            };

        
        if(targets.length < 1){
            this.sendRoomMessage('no-targets', this.displayPlayer(player), 'baron');
            return this.nextPlayer();
        }
        
        return this.sendPlayerMessage(player, 'baron-brawl', targets, callback);
    }
    
    playPrince(player) {
        const targets = this.getAvailableTargets(true),
            callback = target => {
                const targetPlayer = this.findPlayerInGame(target);
                this.discardCard(targetPlayer, true);

                this.sendPlayerMessage(targetPlayer, 'prince-picked', this.displayPlayer(player), targetPlayer.cards, () => {
                    this.sendRoomMessage('prince-replace', this.displayPlayer(player), target);
                    return this.nextPlayer();
                });
            };
        
        if(targets.length < 1){
            this.sendRoomMessage('no-targets', this.displayPlayer(player), 'prince');
            return this.nextPlayer();
        }

        return this.sendPlayerMessage(player, 'prince-patch', targets, callback);
    }

    playKing(player) {
        let targets = this.getAvailableTargets(),
            callback = target => {
                let targetPlayer = this.findPlayerInGame(target),
                    playerDisplay = this.displayPlayer(player),
                    targetDisplay = this.displayPlayer(targetPlayer);

                [player.cards, targetPlayer.cards] = [targetPlayer.cards, player.cards];

                let acks = new Set(),
                    acknowledge = ({id: playerId}) => {
                        return () => {
                            acks.add(playerId);

                            if(acks.size === 2){
                                this.sendRoomMessage('king-swap', playerDisplay, targetDisplay);
                                return this.nextPlayer();
                            }
                        };
                    };

                this.sendPlayerMessage(player, 'king-card', playerDisplay, targetDisplay, player.cards, acknowledge(player));
                this.sendPlayerMessage(target, 'king-card', playerDisplay, targetDisplay, targetPlayer.cards, acknowledge(targetPlayer));
            };
            
        if(targets.length < 1){
            this.sendRoomMessage('no-targets', this.displayPlayer(player), 'king');
            return this.nextPlayer();
        }

        return this.sendPlayerMessage(player, 'king-klepto', this.getAvailableTargets(), callback);
    }

    discardCard(player, canRedraw = false) {
        let playerCard = player.cards.shift();
        player.discards.push(playerCard);

        if(playerCard.type === 'princess'){
            player.isPlaying = false;
            this.sendRoomMessage('princess-purge', this.displayPlayer(player));
        } else if( canRedraw ){
            let newCard = (this.deck.length > 0) ? this.dealCard(this.deck) : this.burnedCard;
            player.cards.push(newCard);
        }

        if(player.cards.length < 1){
            player.isPlaying = false;
        }

        this.sendRoomMessage('player-update', this.displayPlayer(player));
    }

    getCardTypes(includeGuard = false) {
        let cardTypes = {};
        cards.forEach(c => {
            cardTypes[ c.type ] = {
                type: c.type,
                name: c.name,
                image: c.image
            };
        });
        return Object.values(cardTypes).filter(c => includeGuard || c.type !== 'guard');
    }

    getAvailableTargets(includeCurrentPlayer = false) {
        let currentPlayerId = this.players[ this.activePlayer ].id;
        return this.players.filter(p => {
            let protectedByHandmaid = (p.discards.length > 0 && p.discards[ p.discards.length - 1 ].type === 'handmaid');
            
            if( p.id === currentPlayerId && !includeCurrentPlayer ){
                return false;
            }

            return p.isPlaying && !protectedByHandmaid;
        }).map(p => { return this.displayPlayer(p) });
    }

    scoreRound() {
        let highScore = 0,
            winner = null;
        this.players
            .filter(p => p.isPlaying)
            .forEach(player => {
                let score = player.cards[0].value;
                if(score > highScore){
                    highScore = score;
                    winner = player;
                } else if(score === highScore && this.getDiscardValue(player) > this.getDiscardValue(winner)){
                    winner = player;
                }
            });
        winner.affection += 1;

        if(winner.affection >= this.totalAffection){
            this.sendRoomMessage('game-over', [winner]);
        } else {
            let acks = new Set(),
                acknowledge = player => {
                    return () => {
                        acks.add(player.id);

                        this.sendRoomMessage('player-round-ready', this.displayPlayer(player));

                        if(acks.size === this.playerCount){
                            this.activePlayer = this.players.findIndex(p => p.id === winner.id) - 1;
                            this.dealPlayerCards();
                        }
                    };
                };
            
            this.players.forEach(player => {
                this.sendPlayerMessage(player, 'round-end', this.broadcastPlayerData, this.displayPlayer(winner), acknowledge(player));
            });
        }
    }
}

module.exports = LoveLetters;