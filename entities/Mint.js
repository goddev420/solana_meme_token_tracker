const { EntitySchema } = require('typeorm');

const Mint = new EntitySchema({
    name: 'Mint',
    tableName: 'mints',
    columns: {
        mint: {
            type: 'varchar',
            primary: true,
        },
        slot: {
            type: 'int',
        },
        insiders: {
            type: 'int',
            default: 0,
        },
        snipers: {
            type: 'int',
            default: 0,
        },
        complete: {
            type: 'boolean',
            default: false,
        }
    },
});

module.exports = {
    Mint,
};
