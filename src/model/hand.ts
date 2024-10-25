import { update } from 'ramda';
import { Card, Deck, dealCards, shuffleDeck, createInitialDeck, Color } from './deck';
import { Shuffler, standardShuffler } from "../utils/random_utils";
import { PlayerName } from "./uno";

export type Hand = Readonly<{
    hands: ReadonlyArray<ReadonlyArray<Card>>;
    playerCount: number;
    players: ReadonlyArray<string>;
    dealer: number;
    playerInTurn?: number;
    currentColor?: Color;
    topCard: Card;
    direction: 1 | -1;
    drawPile: Deck;
    discardPile: Deck;
    unoCalls: ReadonlyArray<boolean>;
    previousPlayer?: number;
    isAccusationWindowOpen: boolean;
}>;

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

export const checkUnoFailure = (params: { accuser: number, accused: number }, hand: Hand): boolean => {
    if (params.accused < 0 || params.accused >= hand.playerCount) {
        throw new Error("Player index out of bounds");
    }

    // Can only catch UNO failure during the accusation window
    if (!hand.isAccusationWindowOpen || params.accused !== hand.previousPlayer) {
        return false;
    }

    // Check if player has one card and hasn't said UNO
    return hand.hands[params.accused].length === 1 && !hand.unoCalls[params.accused];
};

export const catchUnoFailure = (params: { accuser: number, accused: number }, hand: Hand): Hand => {
    if (params.accused < 0 || params.accused >= hand.playerCount) {
        throw new Error("Player index out of bounds");
    }

    if (!checkUnoFailure(params, hand)) {
        return hand;
    }

    // Draw 4 cards for the accused player
    const [drawnCards, newDrawPile] = dealCards(4)(hand.drawPile);

    // If draw pile is empty, reshuffle discard pile
    if (drawnCards.length < 4) {
        const [topCard, ...restCards] = hand.discardPile;
        const reshuffledDeck = shuffleDeck()(restCards);
        const [remainingCards, finalDrawPile] = dealCards(4 - drawnCards.length)(reshuffledDeck);

        return {
            ...hand,
            hands: update(
                params.accused,
                [...hand.hands[params.accused], ...drawnCards, ...remainingCards],
                hand.hands
            ),
            drawPile: finalDrawPile,
            discardPile: [topCard],
            isAccusationWindowOpen: false
        };
    }

    return {
        ...hand,
        hands: update(
            params.accused,
            [...hand.hands[params.accused], ...drawnCards],
            hand.hands
        ),
        drawPile: newDrawPile,
        isAccusationWindowOpen: false
    };
};

export const sayUno = (playerIndex: number, hand: Hand): Hand => {
    if (hasEnded(hand)) {
        throw new Error("Game has ended");
    }

    if (playerIndex < 0 || playerIndex >= hand.playerCount) {
        throw new Error("Player index out of bounds");
    }

    // Only allow UNO call if player has 2 or fewer cards
    if (hand.hands[playerIndex].length > 2) {
        return hand;
    }

    return {
        ...hand,
        unoCalls: update(playerIndex, true, hand.unoCalls as boolean[])
    };
};

export const hasEnded = (hand: Hand): boolean => {
    return hand.playerInTurn === undefined || hand.hands.some(playerHand => playerHand.length === 0);
};

export const winner = (hand: Hand): number | undefined => {
    if (!hasEnded(hand)) return undefined;
    return hand.hands.findIndex(playerHand => playerHand.length === 0);
};

export const getCardScore = (card: Card): number => {
    if (card.type === 'WILD' || card.type === 'WILD DRAW') return 50;
    if (card.type !== 'NUMBERED') return 20;
    return card.number ?? 0;
};

export const score = (hand: Hand): number | undefined => {
    if (!hasEnded(hand)) return undefined;

    const winningPlayer = winner(hand);
    if (winningPlayer === undefined) return undefined;

    return hand.hands.reduce((total, playerHand, index) => {
        if (index === winningPlayer) return total;
        return total + playerHand.reduce((cardTotal, card) => cardTotal + getCardScore(card), 0);
    }, 0);
};

export const play = (
    cardIndex: number,
    color?: Color,
    // @ts-ignore
    hand: Hand,
): Hand => {
    if (hasEnded(hand) || hand.playerInTurn === undefined) {
        throw new Error("Game has ended");
    }

    const playerHand = hand.hands[hand.playerInTurn];
    const playedCard = playerHand[cardIndex];

    if (!playedCard) {
        throw new Error("Invalid card index");
    }

    if (!canPlay(cardIndex, hand)) {
        throw new Error("Invalid play");
    }

    if ((playedCard.type === 'WILD' || playedCard.type === 'WILD DRAW') && !color) {
        throw new Error("Color must be specified for wild cards");
    }

    if (playedCard.color && color) {
        throw new Error("Cannot specify color for colored cards");
    }

    // Handle special cards
    let nextPlayer = getNextPlayer(hand);
    let newDirection = hand.direction;
    let newHands = hand.hands;
    let newDrawPile = hand.drawPile;

    if (playedCard.type === 'REVERSE') {
        if (hand.playerCount === 2) {
            // In 2 player game, reverse acts as skip
            nextPlayer = hand.playerInTurn;
        } else {
            newDirection = (hand.direction === 1 ? -1 : 1) as 1 | -1;
            nextPlayer = getNextPlayer({ ...hand, direction: newDirection });
        }
    } else if (playedCard.type === 'SKIP') {
        nextPlayer = getNextPlayer({ ...hand, playerInTurn: nextPlayer });
    } else if (playedCard.type === 'DRAW') {
        // Give next player 2 cards
        const [drawnCards, remainingPile] = dealCards(2)(hand.drawPile);
        newHands = update(
            nextPlayer,
            [...hand.hands[nextPlayer], ...drawnCards],
            hand.hands
        );
        nextPlayer = getNextPlayer({ ...hand, playerInTurn: nextPlayer });
        newDrawPile = remainingPile;
    } else if (playedCard.type === 'WILD DRAW') {
        // Give next player 4 cards
        const [drawnCards, remainingPile] = dealCards(4)(hand.drawPile);
        newHands = update(
            nextPlayer,
            [...hand.hands[nextPlayer], ...drawnCards],
            hand.hands
        );
        nextPlayer = getNextPlayer({ ...hand, playerInTurn: nextPlayer });
        newDrawPile = remainingPile;
    }

    const updatedHands = update(
        hand.playerInTurn,
        playerHand.filter((_, i) => i !== cardIndex),
        newHands
    );

    // If player played their last card, end the game
    if (updatedHands[hand.playerInTurn].length === 0) {
        return {
            ...hand,
            hands: updatedHands,
            currentColor: color || playedCard.color || hand.currentColor,
            topCard: playedCard,
            playerInTurn: undefined,
            direction: newDirection,
            drawPile: newDrawPile,
            discardPile: [playedCard, ...hand.discardPile],
            previousPlayer: hand.playerInTurn,
            isAccusationWindowOpen: false,
            unoCalls: hand.unoCalls.map((_, i) => i === hand.playerInTurn ? hand.unoCalls[i] : false)
        };
    }

    // Regular play, update state including UNO tracking
    return {
        ...hand,
        hands: updatedHands,
        currentColor: color || playedCard.color || hand.currentColor,
        topCard: playedCard,
        playerInTurn: nextPlayer,
        direction: newDirection,
        drawPile: newDrawPile,
        discardPile: [playedCard, ...hand.discardPile],
        previousPlayer: hand.playerInTurn,
        isAccusationWindowOpen: true,
        unoCalls: hand.unoCalls.map((_, i) => i === hand.playerInTurn ? hand.unoCalls[i] : false)
    };
};

export const createHand = (
    players: ReadonlyArray<PlayerName>,
    dealer: number,
    shuffler: Shuffler<Card> = standardShuffler,
    cardsPerPlayer: number = 7
): Hand => {
    const playerCount = players.length;

    if (playerCount < 2) {
        throw new Error("At least 2 players are required");
    } else if (playerCount > 10) {
        throw new Error("At most 10 players are allowed");
    }

    const [hands, remainingDeck] = dealInitialHands(playerCount, cardsPerPlayer, shuffleDeck(shuffler)(createInitialDeck()));
    let [topCard, drawPile] = dealCards(1)(remainingDeck);

    while (topCard?.[0]?.type === "WILD" || topCard?.[0]?.type === "WILD DRAW") {
        const reshuffledDeck = shuffleDeck(shuffler)(drawPile);
        [topCard, drawPile] = dealCards(1)(reshuffledDeck);
    }

    if (!topCard?.[0]) {
        throw new Error("Not enough cards to deal");
    }

    // Determine initial player turn based on top card
    let initialPlayer = (dealer + 1) % playerCount;
    let direction: 1 | -1 = 1;

    if (topCard[0].type === 'REVERSE') {
        direction = -1;
        initialPlayer = dealer - 1;
        if (initialPlayer < 0) initialPlayer = playerCount - 1;
    } else if (topCard[0].type === 'SKIP') {
        initialPlayer = (dealer + 2) % playerCount;
    } else if (topCard[0].type === 'DRAW') {
        // Add 2 cards to the next player
        const nextPlayer = (dealer + 1) % playerCount;
        const [drawnCards, newDrawPile] = dealCards(2)(drawPile);
        hands[nextPlayer] = [...hands[nextPlayer], ...drawnCards];
        drawPile = newDrawPile;
        initialPlayer = (dealer + 2) % playerCount;
    }

    return {
        hands,
        playerCount,
        players,
        dealer,
        playerInTurn: initialPlayer,
        currentColor: topCard[0].color,
        topCard: topCard[0],
        direction,
        drawPile,
        discardPile: [topCard[0]],
        unoCalls: Array(players.length).fill(false),
        isAccusationWindowOpen: false,
    };
};

export const draw = (hand: Hand): Hand => {
    if (hasEnded(hand)) {
        throw new Error("Game has ended");
    }

    if (hand.playerInTurn === undefined) {
        throw new Error("No active player");
    }

    if (hand.drawPile.length === 0) {
        // Reshuffle discard pile except top card
        const [topCard, ...restCards] = hand.discardPile;
        const newDeck = shuffleDeck()(restCards);
        const [drawnCards, remainingDeck] = dealCards(1)(newDeck);

        if (drawnCards.length === 0) {
            throw new Error("No cards left in deck");
        }

        const newHands = update(
            hand.playerInTurn,
            [...hand.hands[hand.playerInTurn], drawnCards[0]],
            hand.hands
        );

        // Check if drawn card is playable
        const canPlayDrawnCard = canPlay(newHands[hand.playerInTurn].length - 1, {
            ...hand,
            hands: newHands
        });

        return {
            ...hand,
            hands: newHands,
            drawPile: remainingDeck,
            discardPile: [topCard],
            playerInTurn: canPlayDrawnCard ? hand.playerInTurn : getNextPlayer(hand),
            isAccusationWindowOpen: false,
            unoCalls: update(hand.playerInTurn, false, hand.unoCalls as boolean[])
        };
    }

    const [drawnCards, newDrawPile] = dealCards(1)(hand.drawPile);
    const newHands = update(
        hand.playerInTurn,
        [...hand.hands[hand.playerInTurn], drawnCards[0]],
        hand.hands
    );

    // Check if drawn card is playable
    const canPlayDrawnCard = canPlay(newHands[hand.playerInTurn].length - 1, {
        ...hand,
        hands: newHands
    });

    return {
        ...hand,
        hands: newHands,
        drawPile: newDrawPile,
        playerInTurn: canPlayDrawnCard ? hand.playerInTurn : getNextPlayer(hand),
        isAccusationWindowOpen: false,
        unoCalls: hand.unoCalls.map((_, i) => i === hand.playerInTurn ? hand.unoCalls[i] : false)
    };
};

export const canPlay = (cardIndex: number, hand: Hand): boolean => {
    if (hasEnded(hand) || hand.playerInTurn === undefined) {
        return false;
    }

    const playerHand = hand.hands[hand.playerInTurn];
    const card = playerHand[cardIndex];

    if (!card || cardIndex < 0 || cardIndex >= playerHand.length) {
        return false;
    }

    const topCard = hand.topCard;

    // Wild card is always playable
    if (card.type === 'WILD') {
        return true;
    }

    // WILD DRAW 4 is only playable if no cards match the current color
    if (card.type === 'WILD DRAW') {
        return !playerHand.some(c => c.color === hand.currentColor);
    }

    // Special cards (REVERSE, SKIP, DRAW) of same type can be played regardless of color
    if (card.type === topCard.type &&
        (card.type === 'REVERSE' || card.type === 'SKIP' || card.type === 'DRAW')) {
        return true;
    }

    // Otherwise, must match color or (for numbered cards) number
    if (!card.color) return false;

    return card.color === hand.currentColor ||
        (card.type === 'NUMBERED' &&
            topCard.type === 'NUMBERED' &&
            card.number === topCard.number);
};

export const reverseDirection = (hand: Hand): Hand => {
    if (hasEnded(hand) || hand.playerInTurn === undefined) {
        throw new Error("Game has ended");
    }

    return {
        ...hand,
        direction: hand.direction === 1 ? -1 : 1 as 1 | -1
    };
};

export const skipTurn = (hand: Hand): Hand => {
    if (hasEnded(hand) || hand.playerInTurn === undefined) {
        throw new Error("Game has ended");
    }

    return {
        ...hand,
        playerInTurn: getNextPlayer(hand)
    };
};

const getNextPlayer = (hand: Hand): number => {
    if (hand.playerInTurn === undefined) {
        throw new Error("No active player");
    }

    const nextPlayer = hand.playerInTurn + hand.direction;
    if (nextPlayer >= hand.playerCount) return 0;
    if (nextPlayer < 0) return hand.playerCount - 1;
    return nextPlayer;
};

export const canPlayAny = (hand: Hand): boolean => {
    if (hasEnded(hand) || hand.playerInTurn === undefined) {
        return false;
    }

    return hand.hands[hand.playerInTurn].some((_, index) =>
        canPlay(index, hand)
    );
};

export const topOfDiscard = (hand: Hand): Card => {
    return hand.discardPile[0];
};