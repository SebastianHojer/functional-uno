import { Randomizer, Shuffler, standardRandomizer, standardShuffler } from "../utils/random_utils";
import { Card } from "./deck";
import { createHand, Hand, play as playHand, hasEnded, score as handScore } from "./hand";

export type Game = Readonly<{
    playerCount: number;
    players: ReadonlyArray<string>;
    targetScore: number;
    scores: ReadonlyArray<number>;
    currentHand?: Hand;
    winner?: number;
    shuffler: Shuffler<Card>;
    randomizer: Randomizer;
    cardsPerPlayer?: number;
}>;

export type GameParams = {
    players?: ReadonlyArray<string>;
    targetScore?: number;
    randomizer?: Randomizer;
    shuffler?: Shuffler<Card>;
    cardsPerPlayer?: number;
};

export const createGame = ({
                               players = ["A", "B"],
                               targetScore = 500,
                               randomizer = standardRandomizer,
                               shuffler = standardShuffler,
                               cardsPerPlayer
                           }: GameParams): Game => {
    if (players.length < 2) {
        throw new Error("At least 2 players are required");
    }

    if (targetScore <= 0) {
        throw new Error("Target score must be greater than 0");
    }

    return {
        playerCount: players.length,
        players,
        targetScore,
        scores: Array(players.length).fill(0),
        currentHand: createHand(players, randomizer(players.length), shuffler, cardsPerPlayer),
        shuffler,
        randomizer,
        cardsPerPlayer
    };
};

export const play = (action: (hand: Hand) => Hand, game: Game): Game => {
    if (!game.currentHand || game.winner !== undefined) {
        return game;
    }

    const newHand = action(game.currentHand);

    if (!hasEnded(newHand)) {
        return {
            ...game,
            currentHand: newHand
        };
    }

    // Hand has ended, update scores
    const winningPlayer = newHand.hands.findIndex(h => h.length === 0);
    const handPoints = handScore(newHand);

    if (handPoints === undefined || winningPlayer === -1) {
        return game;
    }

    const newScores = [...game.scores];
    newScores[winningPlayer] += handPoints;

    // Check if game is over
    if (newScores[winningPlayer] >= game.targetScore) {
        return {
            ...game,
            scores: newScores,
            currentHand: undefined,
            winner: winningPlayer
        };
    }

    // Start new hand with original shuffler
    return {
        ...game,
        scores: newScores,
        currentHand: createHand(
            game.players,
            game.randomizer(game.players.length),
            game.shuffler,
            game.cardsPerPlayer
        )
    };
};