const { DataSource } = require('typeorm')
require("dotenv").config();
const { Token } = require('./entities/Token');
const { Mint } = require('./entities/Mint');

const AppDataSource = new DataSource({
    type: "postgres",
    host: process.env.DB_HOST || '',
    port: parseInt(process.env.DB_PORT || "0"),
    username: process.env.DB_USERNAME || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || '',
    synchronize: true,
    logging: false,
    entities: [Token, Mint],
    migrations: [__dirname + "/migration/*.js"],
    subscribers: [],
})

module.exports = { AppDataSource }