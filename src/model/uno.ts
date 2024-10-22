import { pipe } from 'ramda';
import {Randomizer, Shuffler, standardRandomizer, standardShuffler} from "../utils/random_utils";
import { Card } from "./deck";
import {Hand, createHand, reverseDirection, skipTurn, draw as handDrawCard} from "./hand";

// Immutable types
export type Score = number;
export type PlayerName = string;

export type Game = Readonly<{
    players: ReadonlyArray<PlayerName>;
    scores: ReadonlyArray<Score>;
    playerCount: number;
    targetScore: number;
    currentHand?: Hand;
    winner?: number;
    dealer: number;
}>;

export type Props = Readonly<{
    players?: ReadonlyArray<PlayerName>;
    targetScore?: number;
    randomizer?: Randomizer;
    shuffler?: Shuffler<Card>;
    cardsPerPlayer?: number;
}>;

export const createGame = (config: Props): Game => {
    const {
        players = ["A", "B"],
        targetScore = 500,
        randomizer = standardRandomizer,
        shuffler = standardShuffler,
        cardsPerPlayer = 7
    } = config;

    if (targetScore <= 0) {
        throw new Error("Target score must be greater than 0");
    }

    if (players.length < 2) {
        throw new Error("Game requires at least 2 players");
    }

    if (players.length > 10) {
        throw new Error("Maximum 10 players allowed");
    }

    const initialDealer = randomizer(players.length);

    const initialHand = createHand(players, initialDealer, shuffler, cardsPerPlayer);

    return {
        players,
        playerCount: players.length,
        scores: Array(players.length).fill(0),
        targetScore,
        currentHand: initialHand,
        dealer: initialDealer,
    };
};

// Game operations
export const getPlayer = (state: Game, playerIndex: number): PlayerName => {
    if (playerIndex < 0 || playerIndex >= state.players.length) {
        throw new Error("Player index out of bounds");
    }
    return state.players[playerIndex];
};

export const getScore = (state: Game, playerIndex: number): Score => {
    if (playerIndex < 0 || playerIndex >= state.scores.length) {
        throw new Error("Player index out of bounds");
    }
    return state.scores[playerIndex];
};

export const calculateHandScore = (hand: Hand, winner: number): number => {
    return hand.hands.reduce((total, playerHand, index) => {
        if (index === winner) return total;

        return total + playerHand.reduce((cardTotal, card) => {
            if (card.type === 'WILD' || card.type === 'WILD DRAW') return cardTotal + 50;
            if (card.type !== 'NUMBERED') return cardTotal + 20;
            return cardTotal + (card.number ?? 0);
        }, 0);
    }, 0);
};

export const startNewHand = (state: Game, randomizer: Randomizer = standardRandomizer, shuffler: Shuffler<Card> = standardShuffler): Game => {
    const nextDealer = (state.dealer+1) % state.players.length

    return {
        ...state,
        currentHand: createHand(state.players, nextDealer, shuffler)
    };
};

// Handle end of hand and update game state
export const endHand = (state: Game, handWinner: number): Game => {
    if (!state.currentHand) {
        throw new Error("No active hand to end");
    }

    const handScore = calculateHandScore(state.currentHand, handWinner);

    const newScores = [...state.scores];
    newScores[handWinner] += handScore;
    const hasWinner = newScores[handWinner] >= state.targetScore;

    if (hasWinner) {
        return {
            ...state,
            scores: newScores,
            winner: handWinner,
            currentHand: undefined
        };
    }

    // Start new hand if no winner
    return pipe(
        (s: Game) => ({ ...s, scores: newScores }),
        startNewHand
    )(state);
};

export const play = (
    state: Game,
    playerIndex: number,
    cardIndex: number
): Game => {
    if (!state.currentHand) {
        throw new Error("No active hand");
    }

    if (state.currentHand.playerInTurn !== playerIndex) {
        throw new Error("Not player's turn");
    }

    return {
        ...state,
        currentHand: state.currentHand.hands[playerIndex][cardIndex].type === 'SKIP'
            ? pipe(
                (hand: Hand) => hand.hands[playerIndex][cardIndex].type === 'REVERSE'
                    ? reverseDirection(hand)
                    : hand,
                (hand: Hand) => skipTurn(hand)
            )(state.currentHand)
            : state.currentHand
    };
};

export const draw = (state: Game): Game => {
    if (!state.currentHand) {
        throw new Error("No active hand");
    }

    return {
        ...state,
        currentHand: handDrawCard(state.currentHand)
    };
};

// Type guard functions
export const isGameOver = (state: Game): boolean =>
    state.winner !== undefined;

export const isValidPlayer = (state: Game, playerIndex: number): boolean =>
    playerIndex >= 0 && playerIndex < state.players.length;

export const isPlayerTurn = (state: Game, playerIndex: number): boolean =>
    state.currentHand?.playerInTurn === playerIndex;

// Helper functions
export const getWinningPlayer = (state: Game): PlayerName | undefined =>
    state.winner !== undefined ? state.players[state.winner] : undefined;

export const getLeadingPlayer = (state: Game): PlayerName => {
    const maxScore = Math.max(...state.scores);
    const leaderIndex = state.scores.findIndex(score => score === maxScore);
    return state.players[leaderIndex];
};

export const getPlayerRanking = (state: Game): PlayerName[] =>
    state.players
        .map((name, index) => ({ name, score: state.scores[index] }))
        .sort((a, b) => b.score - a.score)
        .map(player => player.name);