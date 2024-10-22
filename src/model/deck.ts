import { map, filter, pipe, range, flatten } from 'ramda';
import { Shuffler, standardShuffler } from "../utils/random_utils";

export const types = [
    "NUMBERED",
    "SKIP",
    "REVERSE",
    "DRAW",
    "WILD",
    "WILD DRAW",
] as const;

export const colors = [
    'RED',
    'YELLOW',
    'GREEN',
    'BLUE'
] as const;

export type Type = (typeof types)[number];
export type Color = (typeof colors)[number];

export type Card = Readonly<{
    type: Type;
    color?: Color;
    number?: number;
}>;

export type Deck = ReadonlyArray<Card>;

const createNumberedCard = (color: Color, number: number): Card => ({
    type: 'NUMBERED',
    color,
    number
});

const createSpecialCard = (type: Exclude<Type, 'NUMBERED' | 'WILD' | 'WILD DRAW'>, color: Color): Card => ({
    type,
    color
});

const createWildCard = (type: 'WILD' | 'WILD DRAW'): Card => ({
    type
});

const generateNumberedCards = pipe(
    () => Object.values(colors),
    map((color: Color) => [
        createNumberedCard(color, 0),
        ...pipe(
            () => range(1, 10),
            map(num => [createNumberedCard(color, num), createNumberedCard(color, num)]),
            flatten
        )()
    ]),
    flatten
);

const generateSpecialCards = pipe(
    () => Object.values(colors),
    map((color: Color) =>
        ['SKIP', 'REVERSE', 'DRAW'].flatMap(type => [
            createSpecialCard(type as Exclude<Type, 'NUMBERED' | 'WILD' | 'WILD DRAW'>, color),
            createSpecialCard(type as Exclude<Type, 'NUMBERED' | 'WILD' | 'WILD DRAW'>, color)
        ])
    ),
    flatten
);

const generateWildCards = pipe(
    () => ['WILD', 'WILD DRAW'],
    map(type => range(0, 4).map(() => createWildCard(type as 'WILD' | 'WILD DRAW'))),
    flatten
);

export const createInitialDeck = (): Deck => [
    ...generateNumberedCards(),
    ...generateSpecialCards(),
    ...generateWildCards()
];

export const shuffleDeck = (shuffler: Shuffler<Card> = standardShuffler) =>
    (deck: Deck): Deck => shuffler([...deck]);

export const dealCard = (deck: Deck): [Card | undefined, Deck] => {
    const [firstCard, ...rest] = deck;
    return [firstCard, rest];
};

export const dealCards = (count: number) => (deck: Deck): [Card[], Deck] => {
    const cards: Card[] = [];
    let remainingDeck: Deck = deck;

    for (let i = 0; i < count; i++) {
        const [card, newDeck] = dealCard(remainingDeck);
        if (!card) break;
        cards.push(card);
        remainingDeck = newDeck;
    }

    return [cards, remainingDeck];
};

export const filterDeck = (predicate: (card: Card) => boolean) =>
    (deck: Deck): Deck => filter(predicate, deck);

export const isNumberedCard = (card: Card): card is Card & { number: number } =>
    card.type === 'NUMBERED' && typeof card.number === 'number';

export const isColoredCard = (card: Card): card is Card & { color: Color } =>
    card.type !== 'WILD' && card.type !== 'WILD DRAW';

export const isWildCard = (card: Card): boolean =>
    card.type === 'WILD' || card.type === 'WILD DRAW';