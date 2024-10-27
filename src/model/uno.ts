import { Randomizer, Shuffler, standardRandomizer, standardShuffler } from "../utils/random_utils";
import { Card } from "./deck";
import * as Hand from "./hand";

export type Score = number;
export type PlayerName = string;

export type Game = Readonly<{
    players: ReadonlyArray<PlayerName>;
    scores: ReadonlyArray<Score>;
    playerCount: number;
    targetScore: number;
    currentHand?: Hand.Hand;
    dealer: number;
    winner?: number;
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

    const dealer = randomizer(players.length);
    const initialHand = Hand.createHand(players, dealer, shuffler, cardsPerPlayer);

    return {
        players,
        playerCount: players.length,
        scores: Array(players.length).fill(0),
        targetScore,
        currentHand: initialHand,
        dealer
    };
};

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

export const startNewHand = (state: Game, randomizer: Randomizer = standardRandomizer, shuffler: Shuffler<Card> = standardShuffler): Game => {
    const nextDealer = (state.dealer + 1) % state.players.length;
    const newHand = Hand.createHand(state.players, nextDealer, shuffler);

    return {
        ...state,
        currentHand: newHand,
        dealer: nextDealer
    };
};

export const play = (
    action: (hand: Hand.Hand) => Hand.Hand,
    state: Game
): Game => {
    if (!state.currentHand) {
        throw new Error("No active hand");
    }

    return {
        ...state,
        currentHand: action(state.currentHand)
    };
};