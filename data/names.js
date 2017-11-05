const NAMES = {
    adjectives: [
        'Aggressive',
        'Blasted',
        'Constipated',
        'Devious',
        'Excited',
        'Flighty',
        'Grounded',
        'Hilarious',
        'Indignant',
        'Jealous',
        'Karmic',
        'Loud',
        'Magnetic',
        'Needy',
        'Outgoing',
        'Pesky',
        'Quirky',
        'Rancid',
        'Smashing',
        'Ticklish',
        'Upset',
        'Vexing',
        'Whiny',
        'Xerothermic',
        'Yucky',
        'Zesty',
    ],
    nouns: [
        'Aardvark',
        'Bison',
        'Capybara',
        'Dragon',
        'Emu',
        'Frog',
        'Giraffe',
        'Harpy',
        'Iguana',
        'Javelina',
        'Koala',
        'Leech',
        'Mongoose',
        'Newt',
        'Orca',
        'Parakeet',
        'Quetzal',
        'Rooster',
        'Salamander',
        'Tapir',
        'Umbrina',
        'Vulture',
        'Weasel',
        'Xiphias',
        'Yak',
        'Zebu',
    ]
};

module.exports = () => {
    const adjective = NAMES.adjectives[ Math.floor(Math.random() * NAMES.adjectives.length) ];
    const noun = NAMES.nouns[ Math.floor(Math.random() * NAMES.nouns.length)  ];
    
    return `${adjective} ${noun}`;
};