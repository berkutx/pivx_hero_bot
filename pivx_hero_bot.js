let logger = require("./helpers/logger.js").Logger
const axios = require('axios')
const Telegraf = require('telegraf')
const Extra = require('telegraf/extra')
const Markup = require('telegraf/markup')
let TelegrafI18n = require('telegraf-i18n')
const _ = require('lodash')
const redis = require("redis")
const RedisSession = require('telegraf-session-redis')
const BlockchainMonitor = require("./blockchain_monitor").BlockchainMonitor

let BOT_API_TOKEN_TELEGRAM = process.env.BOT_API_TOKEN_TELEGRAM;

let ConfModule = process.env.PRODUCTION === "1" ? require("./configs/productionConfig") : require("./configs/debugConfig");
const Config = ConfModule.Config;
const Messages = require("./configs/messages");

let redisStore = {
    host: process.env.TELEGRAM_SESSION_HOST || '127.0.0.1',
    port: process.env.TELEGRAM_SESSION_PORT || 6379,
    db: Config.redis.db,
    prefix: Config.redis.prefix
}
const redisSession = new RedisSession({
    store: redisStore
})
const i18n = new TelegrafI18n({
    defaultLanguage: 'en',
    useSession: true
});
i18n.loadLocale('en', Messages.En)
// i18n.loadLocale('ru', Messages.Ru)


const bot = new Telegraf(BOT_API_TOKEN_TELEGRAM)
bot.use(redisSession)
bot.use(i18n.middleware());
bot.use((ctx, next) => {
    const start = new Date();
    return next().then(() => {
        const ms = new Date() - start
        let isChannelOrMessage = ctx.updateType === 'channel_post' || ctx.updateType === 'message';
        if (isChannelOrMessage) {
            let isChannel = ctx.updateType === 'channel_post';
            const messageText = isChannel ? ctx.channelPost.text : ctx.message.text;
            let userId = isChannel ? "channel=" + (ctx.chat.username ? ctx.chat.username : ctx.chat.id) : (ctx.message.from.username + "=" + ctx.message.from.id)
            logger.debug(`Response time for \x1b[38;5;50m${userId}\x1b[38;0;0m, mess: \x1b[38;5;192m${messageText}\x1b[38;0;0m, elapsed: \x1b[38;5;192m${ms}\x1b[38;0;0m ms`);
        } else {
            let isCallback = ctx.updateType === 'callback_query';
            if (isCallback) {
                let userId = "callback=" + ctx.chat.username;
                let messageText = ctx.update.callback_query.data;
                logger.debug(`Response time for \x1b[38;5;50m${userId}\x1b[38;0;0m, mess: \x1b[38;5;192m${messageText}\x1b[38;0;0m, elapsed: \x1b[38;5;192m${ms}\x1b[38;0;0m ms`);
            }
        }
    })
})

async function DoCBQueryActionOnSession(ctx, action, needSave) {
    return new Promise(async (resolve, reject) => {
        let messRoot = ctx.update.callback_query ? ctx.update.callback_query : ctx.update;
        let userIdTo = messRoot.message.chat.id;
        let sessionKey = userIdTo + ":" + userIdTo;
        if (ctx.session) {
            try {
                await action(ctx)
                if (needSave)
                    redisSession.saveSession(sessionKey, ctx.session)
                resolve()
            } catch (e) {
                resolve(e)
            }
        } else {
            redisSession.getSession(sessionKey).then(async (sess) => {
                try {
                    ctx.session = ctx
                    await action(ctx)
                    if (needSave)
                        redisSession.saveSession(sessionKey, sess)
                } catch (e) {
                    resolve(e)
                }
            })
        }
    })

}

function ReplyLangMenuAsync(_ctx) {
    return _ctx.reply("Select Language. Выберите язык.",
        Extra.load({caption: 'Caption'})
            .markdown()
            .markup((m) =>
                m.inlineKeyboard([
                    m.callbackButton("English 🇬🇧", 'langen'),
                    //m.callbackButton("Русский 🇷🇺", 'langru')
                ]).resize()
            ))
}

function ReturnKeyboardMarkup(_ctx) {
    let messRoot = _ctx.update.callback_query ? _ctx.update.callback_query : _ctx.update;
    let chatId = messRoot.message.chat.id;
    if (chatId < 0) {
        return {reply_markup: {remove_keyboard: true}, parse_mode: "HTML"}
    } else
        return Markup
            .keyboard([['Start', _ctx.i18n.t('mainMenuItems.list'), _ctx.i18n.t('mainMenuItems.help')],
                [_ctx.i18n.t('mainMenuItems.addressOrMN'), _ctx.i18n.t('mainMenuItems.statPivx')],
                [_ctx.i18n.t('mainMenuItems.budgets'), _ctx.i18n.t('mainMenuItems.masternodes')]])
            .resize()
            .extra({parse_mode: "HTML"});
}

async function openMenuStart(ctx) {
    try {
        await DoCBQueryActionOnSession(ctx, async (_ctx) => {
            if (_ctx.session.__language_code) {
                await _ctx.reply(_ctx.i18n.t('commands.start'), ReturnKeyboardMarkup(_ctx))
            } else {
                return await ReplyLangMenuAsync(_ctx);
            }
        }, true);
    } catch (err) {
        logger.error(`[ERROR] [on start] ${err}`);
    }
}

bot.action('langru', async ctx => {
    try {
        await DoCBQueryActionOnSession(ctx, async (_ctx) => {
            _ctx.session.__language_code = "ru"
            _ctx.i18n.languageCode = "ru"
            _ctx.i18n.shortLanguageCode = "ru"

            await _ctx.answerCbQuery('Русский')
            logger.debug("Select ru");
            openMenuStart(_ctx)
        }, true)
    } catch (e) {
        logger.error(e);
    }
})
bot.action('langen', async ctx => {
    try {
        await DoCBQueryActionOnSession(ctx, async (_ctx) => {
            _ctx.session.__language_code = "en"
            _ctx.i18n.languageCode = "en"
            _ctx.i18n.shortLanguageCode = "en"
            await _ctx.answerCbQuery('English')
            openMenuStart(_ctx)
            logger.debug("Select en");
        }, true)
    } catch (e) {
        logger.error(e);
    }
})
bot.action(/remove_(.*)/, async (ctx, next) => {
    let data = ctx.update.callback_query.data
    let arr = data.split('_')
    let address = arr[2]
    let chatId = arr[1]
    let res = pivxBlockchain.RemoveAddress(address, parseInt(chatId));
    let str = res ? "Result: deleted" : "Error: not found address in you account";
    ctx.reply(str, ReturnKeyboardMarkup(ctx));
    next()
})
bot.action(/rename_(.*)/, async (ctx, next) => {
    let data = ctx.update.callback_query.data
    let arr = data.split('_')
    let address = arr[2]
    ctx.reply("Rename alias to:", ReturnKeyboardMarkup(ctx))
    ctx.session.address = address;
    ctx.session.state = "renameAlias"
    next()
})
bot.on('callback_query', async (context, next) => {
    try {
        let data = context.update.callback_query.data;
        logger.debug(`callback_query from ${context.update.callback_query.from.username}=${context.update.callback_query.from.id}: ${data}`);
        if (data.startsWith("Description for ")) {
            let id = data.substring("Description for ".length);
            //let pageInfo = await getPageInfo(id);
            //let trimmed = pageInfo[1].substring(0, Math.min(pageInfo[1].length, 2000));
            //context.reply(trimmed);
        }
    } catch (e) {
        logger.error(e);
    }
    next();
})

bot.command('/start', async (ctx) => {
    await openMenuStart(ctx);
})

async function DownLoadFileContent(url) {
    return new Promise(async (resolve, reject) => {
        try {
            let response = await axios({
                method: 'get',
                url: url,
                proxy: false,
                //httpsAgent: socksAgent2,
                responseType: 'stream'
            })
            if (response.status !== 200)
                reject(`[ERROR] [DownLoadFileContent] Got response: ${response.status}. Url: ${url}. Mess: ${response.data}.`);
            else
                resolve(response.data);
        } catch (err) {
            reject(`[ERROR] [DownLoadFileContent] Get by ${url} got error: ${err}`);
        }
    })
}

bot.on("message", async (ctx, next) => {
    let messRoot = ctx.update;
    let mess = messRoot.message;
    if (mess && !mess.via_bot && mess.text) {
        if (mess.text.startsWith('/')) {
            let pos = mess.text.toLowerCase().indexOf("@")
            if (pos !== -1) {
                let s = mess.text.substr(0, mess.text.length - (mess.text.length - pos))
                mess.text = _.trim(s, '"');
            }
        }
        if (mess.text === "/stat")
            showStat(ctx)
        if (mess.text === "/mnstat")
            showMNStat(ctx)
        if (mess.text === "/budgets")
            showBudgets(ctx);

        if (mess.text === 'Start') openMenuStart(ctx);
        if (mess.text === 'Помощь' || mess.text === 'Help') {
            try {
                await ctx.reply(ctx.i18n.t('commands.help'), ReturnKeyboardMarkup(ctx))
            } catch (err) {
                logger.error(`[ERROR] [on help] ${err}`)
            }
        }
        if (mess.text === ctx.i18n.t('mainMenuItems.addressOrMN')) {
            ctx.session.state = "inputAddress"
            ctx.session.newAddr = ""
            ctx.session.newAlias = ""
            return ctx.reply(ctx.i18n.t('commands.inputAddress'), ReturnKeyboardMarkup(ctx))
        }
        if (ctx.session.state === "inputAddress") {
            ctx.session.state = "inputAlias"
            ctx.session.newAddr = mess.text
            ctx.session.newAlias = ""
            ctx.reply(ctx.i18n.t('commands.inputAlias'), ReturnKeyboardMarkup(ctx))
            return next()
        }
        if (ctx.session.state === "inputAlias") {
            let chatId = ctx.chat.id
            let alias = ctx.message.text
            let address = ctx.session.newAddr
            try {
                return await pivxBlockchain.AddAddress(ctx, address, alias, chatId)
            } catch (e) {
                logger.error(e)
                return ctx.reply("Can't add address for monitoring. Try later.", ReturnKeyboardMarkup(ctx))
            } finally {
                ctx.session.state = ""
            }
        }
        if (ctx.session.state === "renameAlias") {
            let chatId = ctx.chat.id
            let alias = ctx.message.text
            let address = ctx.session.address
            let oldAlias = ""
            try {
                if (pivxBlockchain.chatsByAddresses.has(address)) {
                    let chats = pivxBlockchain.chatsByAddresses.get(address).chats
                    for (const chat of chats) {
                        if (chat.id === chatId) {
                            oldAlias = chat.alias
                            chat.alias = alias
                            break
                        }
                    }
                    pivxBlockchain.replaceAlias(address, oldAlias, alias, chatId)
                    ctx.reply("Changed!", ReturnKeyboardMarkup(ctx))
                }
            } catch (e) {
                logger.error(e)
                return ctx.reply("Can't rename alias. Try later...", ReturnKeyboardMarkup(ctx))
            } finally {
                ctx.session.state = ""
                ctx.session.address = ""
            }
        }
    }
    next()
})

async function showMNStat(ctx) {
    try {
        let mnStat = pivxBlockchain.GetMNStat();
        if (mnStat.ip4 > 0) {
            let mnSummary = `MN: ${mnStat.ip4 + mnStat.ip6 + mnStat.onion}(ip4:${mnStat.ip4}, ip6:${mnStat.ip6}, onion: ${mnStat.onion})`;
            let str = `<code>${mnSummary}\n</code>`;
            let stream = await DownLoadFileContent("http://178.254.23.111/~pub/DN/DN_masternode_count7.png")
            ctx.replyWithPhoto({source: stream},
                {
                    caption: str,
                    parse_mode: "HTML"
                });
        } else
            ctx.reply("Please wait, collecting...", ReturnKeyboardMarkup(ctx))
    } catch (e) {
        logger.error(e);
        ctx.reply("Inner error, write to admin, please.", ReturnKeyboardMarkup(ctx))
    }
}

async function showStat(ctx) {
    try {
        let marketMess = "";
        if (CMC_Pivx_Stat)
            marketMess = `Summary: ${CMC_Pivx_Stat["usd"]}$, Rank: ${CMC_Pivx_Stat["rank"]}\n` +
                `1H: ${CMC_Pivx_Stat["change1h"]}, 24H: ${CMC_Pivx_Stat["change24h"]}, 7d: ${CMC_Pivx_Stat["change7d"]}\n` +
                `MN price: ${10000 * CMC_Pivx_Stat["usd"]}$`;

        const chatId = ctx.chat.id;
        const market = "BTC-PIVX";
        let mnStat = pivxBlockchain.GetMNStat();
        if (mnStat.ip4 > 0) {
            let mnSummary = `MN: ${mnStat.ip4 + mnStat.ip6 + mnStat.onion}(ip4:${mnStat.ip4}, ip6:${mnStat.ip6}, onion: ${mnStat.onion})`;
            let str = `<code>${mnSummary}\n${marketMess}\n</code>`;
            ctx.reply(str, ReturnKeyboardMarkup(ctx));
        } else
            ctx.reply("Please wait, collecting...", ReturnKeyboardMarkup(ctx))
    } catch (e) {
        logger.error(e);
        ctx.reply("Inner error, write to admin, please.", ReturnKeyboardMarkup(ctx))
    }
}

async function showBudgets(ctx) {
    try {
        const chatId = ctx.chat.id;
        const market = "BTC-PIVX";
        let mnStat = pivxBlockchain.GetMNStat();
        let mnTotal = mnStat.ip4 + mnStat.ip6 + mnStat.onion;
        let mn10Percent = mnTotal / 10;
        let stat = pivxBlockchain.GetBudgetsStat();
        if (stat && stat.length > 0) {
            let answer = "";
            for (const bi of stat) {
                /*
                    "Name": "PIVX-Dev-JanMar2021",
                    "URL": "http://bit.ly/34XpoPg",
                    "Hash": "aa83d72de8f7a35d5b7a32e6be589f44e92134f640e4e273a323a78838b370bf",
                    "FeeHash": "7b5a4f1a3b850c2a2ce0ab5179d94b490ffd2f6100b5c99cc2b37f481dc2a418",
                    "BlockStart": 2678400,
                    "BlockEnd": 2808003,
                    "TotalPaymentCount": 3,
                    "RemainingPaymentCount": 1,
                    "PaymentAddress": "DSzmDVFAMAUELrCMkRVYUgRpSmwVFwEkHa",
                    "Ratio": 1,
                    "Yeas": 611,
                    "Nays": 0,
                    "Abstains": 0,
                    "TotalPayment": 75000.00000000,
                    "MonthlyPayment": 25000.00000000,
                    "IsEstablished": true,
                    "IsValid": true,
                    "Allotted": 25000.00000000
                */
                answer += `${(bi.Yeas - bi.Nays > mn10Percent) ? "✅" : "❔"} <b><a href="${bi.URL}">${bi.Name}</a></b>: ` +
                    `\nY(${bi.Yeas})\\N(${bi.Nays}).` +
                    ` Payments: ${bi.RemainingPaymentCount}\\${bi.TotalPaymentCount}, ${bi.MonthlyPayment}\\${bi.TotalPayment} PIVX` +
                    `\n--------------------------\n`
            }
            ctx.reply(answer, ReturnKeyboardMarkup(ctx));
        } else
            ctx.reply("Please wait, collecting...")
    } catch (e) {
        logger.error(e);
    }
}

bot.command('/help', async (ctx) => {
    try {
        await ctx.reply(ctx.i18n.t('commands.help'), ReturnKeyboardMarkup(ctx));
    } catch (err) {
        logger.error(`[ERROR] [on help] ${err}`);
    }
})
bot.command('/lang', async (ctx) => {
    try {
        return await ReplyLangMenuAsync(ctx);
    } catch (e) {
        logger.error(e);
    }
})

bot.hears(['Stat Pivx', '!stat', 'stat', 'стат', 'статистика', 'стата'], showStat)
bot.hears(['Masternodes', 'nodes', '!masternodes', 'что там по нодам', 'ноды'], showMNStat)

bot.hears(['Budgets'], showBudgets)

bot.hears(['Watch list'], async (ctx) => {
    try {
        const chatId = ctx.chat.id;
        let addressesInfo = []
        for (const addr of pivxBlockchain.chatsByAddresses.keys()) {
            let info = pivxBlockchain.chatsByAddresses.get(addr);
            for (let chat of info.chats)
                if (chat.id === chatId) {
                    addressesInfo.push({addr: addr, alias: chat.alias, balance: info.value})
                    break;
                }
        }
        for (let info of addressesInfo) {
            ctx.reply(`${info.alias} **${info.balance}**:\n${info.addr}`, Extra.load()
                .markdown()
                .markup((m) =>
                    m.inlineKeyboard([
                        m.callbackButton("Remove from monitoring", 'remove_' + chatId + "_" + info.addr),
                        m.callbackButton("Rename", 'rename_' + chatId + "_" + info.addr),
                    ])))
        }
    } catch (e) {
        logger.error(e);
    }
})

bot.catch(error => {
    logger.error(error)
});

const CMC_API_KEY = process.env.CMC_API_KEY;

let BlockchainMonitorByCoin = new Map();
let pivxBlockchain = new BlockchainMonitor("pivx", bot);
BlockchainMonitorByCoin.set("pivx", pivxBlockchain);

// -----
const CoinMarketCap = require('coinmarketcap-api')

const coinmarketcap = new CoinMarketCap(CMC_API_KEY)
let CMC_Pivx_Stat = {usd: "wait", rank: "wait", change1h: "wait"};
const CMC_interval_s = 300; // 10000 per month on free account => ~300s pause
setInterval(async () => {
    let res = await coinmarketcap.getQuotes({symbol: 'pivx'});
    let coin = res.data.PIVX;
    let quote_USD = coin.quote.USD;
    let usd = parseFloat(quote_USD.price).toFixed(2);
    let rank = coin.cmc_rank;
    CMC_Pivx_Stat["usd"] = usd;
    CMC_Pivx_Stat["change1h"] = quote_USD.percent_change_1h.toFixed(2) + "%";
    CMC_Pivx_Stat["change24h"] = quote_USD.percent_change_24h.toFixed(2) + "%";
    CMC_Pivx_Stat["change7d"] = quote_USD.percent_change_7d.toFixed(2) + "%";
    CMC_Pivx_Stat["rank"] = rank;
}, CMC_interval_s * 1000);


setTimeout(async () => {
    await bot.launch();
    logger.info("telegram bot Started.");
}, 1000);