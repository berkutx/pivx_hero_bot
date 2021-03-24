let logger = require("./helpers/logger.js").Logger
const PivxWorker = require('./pivxWalletWorker')
const EventEmitter = require('events');
const fs = require('fs')
const _ = require('lodash')

class BlockchainMonitor {
    constructor(coin, bot) {
        this.chatsByAddresses = new Map()
        this.coin = coin
        this.filepath = coin + ".dat"
        this.emitter = new EventEmitter()
        this.mnStatPrev = {ip4: 0, ip6: 0, onion: 0}
        this.softForks = [];
        this.budgets = []
        this.bot = bot
        let context = this;
        context.emitter.on("deletedFromMNList", function (addr) {
            logger.info("Deleted MN: " + addr);
            if (context.chatsByAddresses.has(addr))
                for (let chatId of context.chatsByAddresses.get(addr).chats)
                    context.bot.telegram.sendMessage(chatId.id, `${chatId.alias} (${addr}) deleted from masternodes.`);
        });
        context.emitter.on("updateMNStatus", function (info) {
            logger.info("Update status for MN(" + info.addr + "): " + info.status);
            if (context.chatsByAddresses.has(info.addr))
                for (let chatId of context.chatsByAddresses.get(info.addr).chats)
                    context.bot.telegram.sendMessage(chatId.id, `Masternode ${chatId.alias} (${info.addr}) status: ${info.status}`);
        });
        context.emitter.on("networkMN", (stat_mnByNet) => {
            context.mnStatPrev.ip4 = stat_mnByNet.get("ipv4").length;
            context.mnStatPrev.ip6 = stat_mnByNet.get("ipv6").length;
            context.mnStatPrev.onion = stat_mnByNet.get("onion").length;
            let networkStat = "";
            for (let key of stat_mnByNet.keys())
                networkStat += key + ": " + stat_mnByNet.get(key).length + " ";
            // logger.debug("Stat by network(MN): " + networkStat);
        });
        context.emitter.on("budgets", (_budgets) => {
            context.budgets = _budgets
        });
        context.emitter.on("softforks", function (info) {
            if (!info && info.length === 0)
                context.softForks = [];
            else {
                let res = [];
                for (let t of info) {
                    if (t.reject)
                        res.push({"id": t.id, percent: Math.round((t.reject.found / t.reject.window) * 10000) / 100})
                }
                context.softForks = res;
            }
            //logger.debug(`Stat by softforks: ${JSON.stringify(info)}`);
        });
        context.emitter.on("updateAddress", async function (address) {
            if (!context.chatsByAddresses.has(address))
                return;
            let info = context.chatsByAddresses.get(address);
            setTimeout(async () => {
                try {
                    let value = await context.GetAddressBalance(address);
                    if (value != info.value) { // !=
                        let count = 0;
                        for (let chatInfo of info.chats) {
                            count++;
                            let valueOld = info.value;
                            setTimeout(() => {
                                let diff = value - valueOld
                                try {
                                    context.bot.telegram.sendMessage(chatInfo.id, `<b>${chatInfo.alias} (${address})</b> changed balance from ${valueOld} to ${value}: ${diff < 0 ? diff : `+${diff}`}`, {
                                        parse_mode: "HTML"
                                    });
                                } catch (err) {
                                    logger.error(err);
                                }
                            }, (count / 30) * 1000);
                        }
                        info.value = value;
                    }
                } catch (e) {
                    logger.error("[updateAddress] Error: " + e.message);
                }
            }, 20 * 1000)
        });

        PivxWorker.SetEventEmitter(context.emitter);

        this.LoadWatchListFromFile();
    }

    LoadWatchListFromFile() {
        if (fs.existsSync(this.filepath)) {
            let buf = fs.readFileSync(this.filepath, "utf8")
            let lines = buf.split("\n")
            let bCount = 0
            let context = this
            for (let line of lines) {
                if (!line)
                    continue;
                bCount++;
                setTimeout(async function () {
                    let arr = line.split("\t");
                    let address = arr[0];
                    let chatId = parseInt(arr[1]);
                    let alias = arr[2]
                    try {
                        let value = await context.GetAddressBalance(address)
                        if (!context.chatsByAddresses.has(address))
                            context.chatsByAddresses.set(address, {chats: [], value: value});
                        let chats = context.chatsByAddresses.get(address).chats;
                        let found = _.find(chats, (o) => {
                            return o.id === chatId;
                        });
                        if (!found)
                            chats.push({id: chatId, alias: alias});
                    } catch (e) {
                        logger.error(e)
                    }
                }, bCount * 1500);
            }
        }
    }

    GetMNStat() {
        return this.mnStatPrev;
    }

    GetBudgetsStat() {
        return this.budgets;
    }

    GetSoftForksStr() {
        let str = "";
        if (this.softForks) {
            for (let f of this.softForks)
                str += f.id + ": " + f.percent + "%;"
        }
        return str;
    }

    async appendToFile(address, chatId, alias) {
        await fs.appendFileSync(this.filepath, `${address}\t${chatId}\t${alias}\n`);
    }

    RemoveAddressFromFile(address, chatId) {
        logger.info("Remove " + address + " from file for chatId= " + chatId);
        const data = fs.readFileSync(this.filepath, "utf8");
        const splitData = data.split('\n');
        let searchLine = `${address}\t${chatId}\t`;
        let lineIndex = -1;
        for (let i = 0; i < splitData.length; i++) {
            if (splitData[i].startsWith(searchLine)) {
                lineIndex = i;
                break;
            }
        }
        if (lineIndex !== -1) {
            const line = splitData.splice(lineIndex, 1);
            logger.debug("Deleted line from filepath: " + line);
            fs.writeFileSync(this.filepath, splitData.join('\n'));
            return true;
        } else
            return false;
    }

    RemoveAddressFromMonitoring(address, chatId) {
        logger.info("[removeAddressFromMonitoring] Remove " + address + " from chatsByAddresses for chatId= " + chatId);
        if (!this.chatsByAddresses.has(address))
            return false;
        let chats = this.chatsByAddresses.get(address).chats;
        let found = _.find(chats, (o) => {
            return o.id === chatId;
        });
        if (!found)
            return false;
        let lineIndex = -1;
        for (let i = 0; i < chats.length; i++) {
            if (chats[i].id === chatId) {
                lineIndex = i;
                break;
            }
        }
        chats.splice(lineIndex, 1); // check it
        return true;
    }

    RemoveAddress(address, chatId) {
        let res1 = this.RemoveAddressFromFile(address, chatId);
        let res2 = this.RemoveAddressFromMonitoring(address, chatId);
        return res1 && res2;
    }

    async GetAddressBalance(address) {
        try {
            let res = await PivxWorker.GetBalanceSite(address);
            if (res.err) {
                logger.error(res.err);
                return {err: res.err};
            } else {
                let onlyValueDecimal = res.result;
                logger.debug(`Balance of ${address} = ${onlyValueDecimal}`);
                return onlyValueDecimal;
            }
        } catch (e) {
            logger.error(e);
            throw e;
        }
    }

    async AddAddress(ctx, address, alias, chatId) {
        let value = await this.GetAddressBalance(address)
        if (value.err)
            throw "Address error!"
        if (!this.chatsByAddresses.has(address))
            this.chatsByAddresses.set(address, {chats: [], value: value});
        let chats = this.chatsByAddresses.get(address).chats;
        let found = _.find(chats, (o) => {
            return o.id === chatId;
        });
        if (!found) {
            this.chatsByAddresses.get(address).chats.push({id: chatId, alias: alias});
            context.bot.telegram.sendMessage(chatId, `Success! You are watching: ${address}, current value: ${value}`);
        } else {
            context.bot.telegram.sendMessage(chatId, `You are already watching ${address}, current value: ${value}`);
        }
        await this.appendToFile(address, chatId, alias);
    }

    async replaceAlias(address, oldAlias, newAlias, chatId) {
        let data = await fs.readFileSync(this.filepath, 'utf8');
        data = data.replace(`${address}\t${chatId}\t${oldAlias}`, `${address}\t${chatId}\t${newAlias}`)
        await fs.writeFileSync(this.filepath, data);
    }
}

module.exports.BlockchainMonitor = BlockchainMonitor