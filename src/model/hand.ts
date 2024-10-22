import { update, pipe } from 'ramda';
import {Card, Deck, dealCards, shuffleDeck, createInitialDeck, Color} from './deck';
import {Shuffler, standardShuffler} from "../utils/random_utils";
import {PlayerName} from "./uno";

export type Hand = Readonly<{
    hands: ReadonlyArray<ReadonlyArray<Card>>;
    playerCount: number;
    players: ReadonlyArray<string>;
    dealer: number;
    playerInTurn: number;
    currentColor?: Color;
    topCard: Card;
    direction: 1 | -1;
    drawPile: Deck;
    discardPile: Deck;
}>;

export const createHand = (players: ReadonlyArray<PlayerName>, dealer: number, shuffler: Shuffler<Card> = standardShuffler, cardsPerPlayer: number = 7): Hand => {
    const playerCount = players.length

    if (playerCount < 2) {
        throw new Error("At least 2 players are required");
    } else if (playerCount > 10) {
        throw new Error("At most 10 players are allowed");
    }

    const [hands, remainingDeck] = pipe(
        shuffleDeck(shuffler),
        (shuffledDeck: Deck) => dealInitialHands(playerCount, cardsPerPlayer, shuffledDeck)
    )(createInitialDeck());

    let [topCard, drawPile] = dealCards(1)(remainingDeck);

    while (topCard?.[0]?.type === "WILD" || topCard?.[0]?.type === "WILD DRAW") {
        // Reshuffle the deck
        const reshuffledDeck = shuffleDeck(shuffler)(drawPile);
        // Draw a new top card and update the draw pile
        [topCard, drawPile] = dealCards(1)(reshuffledDeck);
    }

    if (!topCard?.[0]) {
        throw new Error("Not enough cards to deal");
    }

    return {
        hands: hands,
        playerCount: playerCount,
        players: players,
        dealer: dealer,
        playerInTurn: dealer,
        currentColor: topCard[0].color,
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
    cardIndex: number,
    color?: Color,
    // @ts-ignore
    hand: Hand,
): Hand => {
    const playerHand = hand.hands[hand.playerInTurn];
    const playedCard = playerHand[cardIndex];

    if (!playedCard) {
        throw new Error("Invalid card index");
    }

    return {
        ...hand,
        hands: update(
            hand.playerInTurn,
            playerHand.filter((_, i) => i !== cardIndex),
            hand.hands
        ),
        topCard: playedCard,
        playerInTurn: getNextPlayer(hand),
        discardPile: [playedCard, ...hand.discardPile]
    };
};

export const draw = (hand: Hand): Hand => {
    const [drawnCards, newDrawPile] = dealCards(1)(hand.drawPile);

    if (drawnCards.length === 0) {
        // Reshuffle discard pile
        const newDeck = shuffleDeck()(hand.discardPile.slice(1)); // Keep top card
        const [reshuffledCards, remainingDeck] = dealCards(1)(newDeck);

        if (reshuffledCards.length === 0) {
            throw new Error("No cards left in deck");
        }

        return {
            ...hand,
            hands: update(
                hand.playerInTurn,
                [...hand.hands[hand.playerInTurn], reshuffledCards[0]],
                hand.hands
            ),
            drawPile: remainingDeck,
            discardPile: [hand.discardPile[0]]
        };
    }

    return {
        ...hand,
        hands: update(
            hand.playerInTurn,
            [...hand.hands[hand.playerInTurn], drawnCards[0]],
            hand.hands
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
        playerInTurn: getNextPlayer(intermediateHand)
    };
};

const getNextPlayer = (hand: Hand): number => {
    const nextPlayer = hand.playerInTurn + hand.direction;
    const playerCount = hand.hands.length;

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
    hand.hands[playerIndex].length === 0;

export const topOfDiscard = (hand: Hand): Card => {
    return hand.discardPile[0];
};

export const canPlayAny = (hand: Hand): boolean => {
    const topCard = topOfDiscard(hand);
    return hand.hands[hand.playerInTurn].some((card) => isValidPlay(card, topCard));
};