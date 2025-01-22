const dotenv = require('dotenv');
const fs = require('fs');
const telegramBot = require('node-telegram-bot-api');

dotenv.config();

const bot1 = new telegramBot(process.env.TELEGRAM_API_KEY1, { polling: true });
const bot2 = new telegramBot(process.env.TELEGRAM_API_KEY2, { polling: true });
const bot3 = new telegramBot(process.env.TELEGRAM_API_KEY3, { polling: true });

const users = {
    "bot1": [],
    "bot2": [],
    "bot3": []
};

/** Tg bot handlers */
bot1.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    if (!users.bot1.includes(chatId)) {
        console.warn(`New user started: ${chatId}`)
        users.bot1.push(chatId);
        try {
            // saveUsersToFile();
        } catch { }
    }
});

bot2.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    if (!users.bot2.includes(chatId)) {
        console.warn(`New user started: ${chatId}`)
        users.bot2.push(chatId);
    }
});

bot3.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    if (!users.bot3.includes(chatId)) {
        console.warn(`New user started: ${chatId}`)
        users.bot3.push(chatId);
    }
});

/** Broadcast msg to users */
const sendTgMsgToUsers = async (msg, botName) => {
    // users.forEach(async (chatId) => {
    //     bot.sendMessage(chatId, msg, {
    //         parse_mode: "HTML",
    //     });
    // });





    if (botName == "bot1"){
        users.bot1.forEach(async (chatId) => {
            while (!isSent) {
                try {
                  await bot1.sendMessage(chatId, msg, {
                    parse_mode: "HTML",
                });
                  isSent = true; // message successfully sent
                } catch (error) {
                  if (error.response && error.response.statusCode === 429) {
                    const retryAfter = error.response.body.parameters.retry_after;
                    console.log(`Rate limit exceeded. Retrying after ${retryAfter} seconds.`);
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                  } else {
                    console.error('Unexpected error:', error);
                    break; // exit the loop on non-rate limit errors
                  }
                }
    
            }
            // bot1.sendMessage(chatId, msg, {
            //     parse_mode: "HTML",
            // });
        });
    }
    // if (botName == "bot2"){
    //     users.bot2.forEach(async (chatId) => {
    //         bot2.sendMessage(chatId, msg, {
    //             parse_mode: "HTML",
    //         });
    //     });
    // }
    // if (botName == "bot3"){
    //     users.bot3.forEach(async (chatId) => {
    //         bot3.sendMessage(chatId, msg, {
    //             parse_mode: "HTML",
    //         });
    //     });
    // }
    if(botName == "bot") {
        users.bot1.forEach(async (chatId) => {
            bot1.sendMessage(chatId, msg, {
                parse_mode: "HTML",
            });
        });
        // users.bot2.forEach(async (chatId) => {
        //     bot2.sendMessage(chatId, msg, {
        //         parse_mode: "HTML",
        //     });
        // });
        // users.bot3.forEach(async (chatId) => {
        //     bot3.sendMessage(chatId, msg, {
        //         parse_mode: "HTML",
        //     });
        // });
    }
};

const saveUsersToFile = () => {
    const filePath = "users.json";
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error("Error deleting the file:", err.message);
                return;
            } else {
                console.log(`${filePath} has been deleted.`);
            }
        });
    }
    // Create a new file
    fs.writeFile(filePath, JSON.stringify(users, null, 2), "utf8", (err) => {
        if (err) {
            console.error("Error creating the file:", err.message);
        } else {
            console.log(`${filePath} has been created with new data.`);
        }
    });
};

const loadUsersFromFile = () => {
    try {
        const data = fs.readFileSync("users.json", "utf8");
        users.push(...JSON.parse(data));
        console.log(`Loaded ${users.length} users.`);
    } catch (err) {
        console.error("Error loading users from file:", err);
    }
};

module.exports = {
    bot1,
    bot2,
    bot3,
    sendTgMsgToUsers,
    saveUsersToFile,
    loadUsersFromFile,
}
