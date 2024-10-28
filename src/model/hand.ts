import {update} from 'ramda';
import {Card, Deck, dealCards, shuffleDeck, createInitialDeck, Color} from './deck';
import {Shuffler, standardShuffler} from "../utils/random_utils";

export type Hand = Readonly<{
    playerCount: number;
    dealer: number;
    playerInTurn: number | undefined;
    hands: ReadonlyArray<ReadonlyArray<Card>>;
    discardPile: ReadonlyArray<Card>;
    drawPile: Deck;
    direction: 1 | -1;
    unoCalls: ReadonlyArray<boolean>;
    previousPlayer: number | null;
    isAccusationWindowOpen: boolean;
    players: ReadonlyArray<string>;
    currentColor?: Color;
    shuffler: Shuffler<Card>;
}>;

const drawCards = (playerIndex: number, amount: number, hand: Hand): Hand => {
    let drawPile = hand.drawPile;
    let discardPile = hand.discardPile;
    let cards: Card[] = [];

    for (let i = 0; i < amount; i++) {
        const [drawnCards, remainingDeck] = dealCards(1)(drawPile);
        cards = [...cards, ...drawnCards];
        drawPile = remainingDeck;

        if (drawPile.length === 0) {
            const [topCard, ...restCards] = discardPile;
            drawPile = shuffleDeck(hand.shuffler)(restCards);
            discardPile = [topCard];
        }
    }

    return {
        ...hand,
        hands: update(
            playerIndex,
            [...hand.hands[playerIndex], ...cards],
            hand.hands
        ),
        drawPile,
        discardPile,
        unoCalls: update(playerIndex, false, hand.unoCalls)
    };
};

const isPlayable = (playerHand: ReadonlyArray<Card>, card: Card, topCard: Card): boolean => {
    if (card.color === topCard.color) return true;

    if (card.type === "WILD") return true;

    if (card.type === "WILD DRAW") {
        return playerHand.every(c => c.color !== topCard.color);
    }

    if (card.type === "NUMBERED" && card.number === topCard.number) {
        return true;
    }

    return card.type === topCard.type && card.type !== "NUMBERED";
};

const getNextPlayer = (hand: Hand, skip: boolean = false): number => {
    if (hand.playerInTurn === undefined) {
        throw new Error("No active player");
    }

    const modifier = skip ? hand.direction * 2 : hand.direction;
    const next = hand.playerInTurn + modifier;

    if (next >= hand.playerCount) return next % hand.playerCount;
    if (next < 0) return hand.playerCount + next;
    return next;
};

export const createHand = (
    players: ReadonlyArray<string>,
    dealer: number,
    shuffler: Shuffler<Card> = standardShuffler,
    cardsPerPlayer: number = 7
): Hand => {
    if (players.length < 2 || players.length > 10) {
        throw new Error("Invalid number of players");
    }

    let hand: Hand = {
        playerCount: players.length,
        dealer,
        playerInTurn: dealer,
        hands: Array(players.length).fill([]),
        discardPile: [],
        drawPile: shuffleDeck(shuffler)(createInitialDeck()),
        direction: 1,
        unoCalls: Array(players.length).fill(false),
        previousPlayer: null,
        isAccusationWindowOpen: false,
        players,
        currentColor: undefined,
        shuffler
    };

    // Deal initial cards
    for (let i = 0; i < players.length; i++) {
        hand = drawCards(i, cardsPerPlayer, hand);
    }

    // Get initial top card
    let currentDrawPile = hand.drawPile;
    while (currentDrawPile[0]?.type === "WILD" || currentDrawPile[0]?.type === "WILD DRAW") {
        currentDrawPile = shuffleDeck(shuffler)(currentDrawPile);
    }

    const [topCard, remainingDeck] = dealCards(1)(currentDrawPile);
    if (!topCard[0]) {
        throw new Error("Not enough cards to deal");
    }

    // Handle initial card effects
    let direction = 1;
    let playerInTurn = (dealer + 1) % players.length;

    if (topCard[0].type === "REVERSE") {
        direction = -1;
        playerInTurn = dealer - 1 < 0 ? players.length - 1 : dealer - 1;
    } else if (topCard[0].type === "SKIP") {
        playerInTurn = (dealer + 2) % players.length;
    }

    hand = {
        ...hand,
        drawPile: remainingDeck,
        discardPile: [topCard[0]],
        currentColor: topCard[0].color,
        direction: direction as 1 | -1,
        playerInTurn
    };

    if (topCard[0].type === "DRAW") {
        if (hand.playerInTurn === undefined) {
            throw new Error("No active player");
        }
        hand = drawCards(hand.playerInTurn, 2, hand);
        hand = {
            ...hand,
            playerInTurn: getNextPlayer(hand)
        };
    }

    return hand;
};

export const play = (cardIndex: number, color: Color | undefined, hand: Hand): Hand => {
    if (hand.playerInTurn === undefined) {
        throw new Error("Game has ended");
    }

    const playerHand = hand.hands[hand.playerInTurn];
    const card = playerHand[cardIndex];

    if (!card) {
        throw new Error("Card not found");
    }

    if (card.color && color) {
        throw new Error("Cannot set colour of a non-WILD card");
    }

    if (!canPlay(cardIndex, hand)) {
        throw new Error("Cannot play this card");
    }

    if ((card.type === "WILD" || card.type === "WILD DRAW") && !color) {
        throw new Error("Color is required for WILD cards");
    }

    // First remove card from hand and add to discard pile
    const updatedHands = update(
        hand.playerInTurn,
        playerHand.filter((_, i) => i !== cardIndex),
        hand.hands
    );

    const playedCard = (card.type === "WILD" || card.type === "WILD DRAW")
        ? { ...card, color }
        : card;

    let newHand: Hand = {
        ...hand,
        hands: updatedHands,
        discardPile: [playedCard, ...hand.discardPile],
        currentColor: color || playedCard.color,
    };

    // Then handle special cards
    let nextPlayer = getNextPlayer(hand);
    let newDirection = hand.direction;

    if (card.type === "REVERSE") {
        if (hand.playerCount === 2) {
            nextPlayer = hand.playerInTurn;
        } else {
            newDirection = (hand.direction === 1 ? -1 : 1) as 1 | -1;
            nextPlayer = getNextPlayer({ ...hand, direction: newDirection });
        }
    } else if (card.type === "SKIP") {
        nextPlayer = getNextPlayer(hand, true);
    } else if (card.type === "DRAW") {
        newHand = drawCards(getNextPlayer(hand), 2, newHand);
        nextPlayer = getNextPlayer(hand, true);
    } else if (card.type === "WILD DRAW") {
        newHand = drawCards(getNextPlayer(hand), 4, newHand);
        nextPlayer = getNextPlayer(hand, true);
    }

    if (updatedHands[hand.playerInTurn].length === 0) {
        return {
            ...newHand,
            direction: newDirection,
            playerInTurn: undefined,
            previousPlayer: hand.playerInTurn,
            isAccusationWindowOpen: false
        };
    }

    return {
        ...newHand,
        direction: newDirection,
        playerInTurn: nextPlayer,
        previousPlayer: hand.playerInTurn,
        isAccusationWindowOpen: true,
        unoCalls: hand.unoCalls.map((call, i) =>
            (i === hand.playerInTurn || i === hand.previousPlayer) ? call : false
        )
    };
};

export const draw = (hand: Hand): Hand => {
    if (hand.playerInTurn === undefined) {
        throw new Error("Game has ended");
    }

    const newHand = drawCards(hand.playerInTurn, 1, hand);

    if (!canPlayAny(newHand)) {
        return {
            ...newHand,
            playerInTurn: getNextPlayer(newHand),
            previousPlayer: hand.playerInTurn,
            isAccusationWindowOpen: false
        };
    }

    return newHand;
};

export const canPlay = (cardIndex: number, hand: Hand): boolean => {
    if(hasEnded(hand)) return false;

    if (hand.playerInTurn === undefined) return false;

    const playerHand = hand.hands[hand.playerInTurn];

    const card = playerHand[cardIndex];
    if (!card) return false;

    return isPlayable(playerHand, card, hand.discardPile[0]);
};

export const canPlayAny = (hand: Hand): boolean => {
    if (hand.playerInTurn === undefined) return false;
    return hand.hands[hand.playerInTurn].some((_, index) => canPlay(index, hand));
};

export const topOfDiscard = (hand: Hand): Card => {
    return hand.discardPile[0];
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
    return drawCards(params.accused, 4, {
        ...hand,
        isAccusationWindowOpen: false
    });
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
        unoCalls: update(playerIndex, true, hand.unoCalls)
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

    return hand.hands.reduce((total, playerHand, index) =>
            index === winningPlayer
                ? total
                : total + playerHand.reduce((sum, card) => sum + getCardScore(card), 0),
        0
    );
};

export type Action = (hand: Hand) => Hand;