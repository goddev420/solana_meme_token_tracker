const { EntitySchema } = require('typeorm');

const Token = new EntitySchema({
    name: 'Token',
    tableName: 'tokens',
    columns: {
        mint: {
            type: 'varchar',
            primary: true,
        },
        symbol: {
            type: 'varchar',
            nullable: true,
        },
        name: {
            type: 'varchar',
            nullable: true,
        },
        twitter: {
            type: 'varchar',
            nullable: true,
        },
        telegram: {
            type: 'varchar',
            nullable: true,
        },
        website: {
            type: 'varchar',
            nullable: true,
        },
        marketCap: {
            type: 'float',
        },
        owner: {
            type: 'varchar',
            nullable: true,
        },
        createdAt: {
            type: 'int',
            nullable: true,
        },
        devAta: {
            type: 'varchar',
            nullable: true,
        },
        aBondingCurve: {
            type: 'varchar',
            nullable: true,
        },
        bondingCurve: {
            type: 'varchar',
            nullable: true,
        },
        isMint: {
            type: 'boolean',
            nullable: true,
        },
        multiple: {
            type: 'int',
            nullable: true,
        },
        dexPaid: {
            type: 'boolean',
            default: false,
        },
        snipers: {
            type: 'int',
            default: 0,
        },
        insiders: {
            type: 'int',
            default: 0,
        },
        raydium: {
            type: 'varchar',
            nullable: true,
        }
    },
});

module.exports = {
    Token,
};
