import { update, pipe } from 'ramda';
import { Card, Deck, dealCards, shuffleDeck } from './deck';
import {Shuffler} from "../utils/random_utils";

export type Hand = Readonly<{
    playerHands: ReadonlyArray<ReadonlyArray<Card>>;
    currentPlayer: number;
    topCard: Card;
    direction: 1 | -1;
    drawPile: Deck;
    discardPile: Deck;
}>;

export type HandConfig = Readonly<{
    playersCount: number;
    cardsPerPlayer: number;
    deck: Deck;
    dealer: number;
    shuffler: Shuffler<Card>
}>;

export const createInitialHand = (config: HandConfig): Hand => {
    const { playersCount, cardsPerPlayer, deck, dealer, shuffler } = config;

    const [hands, remainingDeck] = pipe(
        shuffleDeck(shuffler),
        (shuffledDeck: Deck) => dealInitialHands(playersCount, cardsPerPlayer, shuffledDeck)
    )(deck);

    const [topCard, drawPile] = dealCards(1)(remainingDeck);

    if (!topCard?.[0]) {
        throw new Error("Not enough cards to deal");
    }

    return {
        playerHands: hands,
        currentPlayer: dealer,
        topCard: topCard[0],
        direction: 1,
        drawPile,
        discardPile: [topCard[0]]
    };
};

const dealInitialHands = (
    playersCount: number,
    cardsPerPlayer: number,
    deck: Deck
): [Card[][], Deck] => {
    let currentDeck = deck;
    const hands: Card[][] = [];

    for (let i = 0; i < playersCount; i++) {
        const [playerCards, remainingDeck] = dealCards(cardsPerPlayer)(currentDeck);
        hands.push(playerCards);
        currentDeck = remainingDeck;
    }

    return [hands, currentDeck];
};

export const play = (
    hand: Hand,
    playerIndex: number,
    cardIndex: number
): Hand => {
    const playerHand = hand.playerHands[playerIndex];
    const playedCard = playerHand[cardIndex];

    if (!playedCard) {
        throw new Error("Invalid card index");
    }

    return {
        ...hand,
        playerHands: update(
            playerIndex,
            playerHand.filter((_, i) => i !== cardIndex),
            hand.playerHands
        ),
        topCard: playedCard,
        currentPlayer: getNextPlayer(hand),
        discardPile: [playedCard, ...hand.discardPile]
    };
};

export const draw = (hand: Hand): Hand => {
    const [drawnCards, newDrawPile] = dealCards(1)(hand.drawPile);

    if (drawnCards.length === 0) {
        // Reshuffle discard pile if draw pile is empty
        const newDeck = shuffleDeck()(hand.discardPile.slice(1)); // Keep top card in discard pile
        const [reshuffledCards, remainingDeck] = dealCards(1)(newDeck);

        if (reshuffledCards.length === 0) {
            throw new Error("No cards left in deck");
        }

        return {
            ...hand,
            playerHands: update(
                hand.currentPlayer,
                [...hand.playerHands[hand.currentPlayer], reshuffledCards[0]],
                hand.playerHands
            ),
            drawPile: remainingDeck,
            discardPile: [hand.discardPile[0]]
        };
    }

    return {
        ...hand,
        playerHands: update(
            hand.currentPlayer,
            [...hand.playerHands[hand.currentPlayer], drawnCards[0]],
            hand.playerHands
        ),
        drawPile: newDrawPile
    };
};

export const reverseDirection = (hand: Hand): Hand => ({
    ...hand,
    direction: hand.direction === 1 ? -1 : 1
});

export const skipTurn = (hand: Hand): Hand => {
    const intermediateHand = {
        ...hand,
        currentPlayer: getNextPlayer(hand)
    };

    return {
        ...intermediateHand,
        currentPlayer: getNextPlayer(intermediateHand)
    };
};

const getNextPlayer = (hand: Hand): number => {
    const nextPlayer = hand.currentPlayer + hand.direction;
    const playerCount = hand.playerHands.length;

    if (nextPlayer >= playerCount) {
        return 0;
    }
    if (nextPlayer < 0) {
        return playerCount - 1;
    }
    return nextPlayer;
};

export const isValidPlay = (card: Card, topCard: Card): boolean => {
    if (card.type === 'WILD' || card.type === 'WILD DRAW') {
        return true;
    }

    return card.color === topCard.color ||
        (card.type === topCard.type && card.type === 'NUMBERED' && card.number === topCard.number);
};

export const hasWon = (hand: Hand, playerIndex: number): boolean =>
    hand.playerHands[playerIndex].length === 0;