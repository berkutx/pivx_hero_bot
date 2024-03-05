const _ = require("lodash");
const RpcHelper = require('./helpers/rpcHelper');
const logger = require('./helpers/logger').Logger;

var zmq = require('zeromq');
const http = require('http');
const https = require('https');
const ccoreAPIKey = process.env.PIVX_CCORE_API_KEY;

const zmqHostUrl = "tcp://127.0.0.1:28331"; // ZMQ for rawtx

const CHECK_MN_INTERVAL_S = 20;

const rpcUser = process.env.PIVX_RPC_USER;
const rpcPass = process.env.PIVX_RPC_PASS;
const rpcPort = process.env.PIVX_RPC_PORT;
const rpcHost = process.env.PIVX_RPC_HOST;
let rpcHelper = new RpcHelper(rpcHost, rpcPort, rpcUser, rpcPass);
let commandEmitter;
async function runZMQ() {
    const sock = new zmq.Subscriber
    sock.connect(zmqHostUrl)
    sock.subscribe("rawtx")
    for await (const [topic, msg] of sock) {
        // logger.debug("received a message related to:", topic.toString(), "containing message len:", msg.length)
        if (topic.toString() === 'rawtx') {
            let rawTx = msg.toString('hex');
            try {
                logger.debug(`rawTx= ${rawTx}`)
                let answer = await rpcHelper.SendPost({method: "decoderawtransaction", params: [rawTx]})
                logger.debug(`decodedTx= ${JSON.stringify(answer.result)}`)
                let addressesFromTransaction = new Set()
                for (let out of answer.result.vout)
                    if (out.scriptPubKey && out.scriptPubKey.addresses)
                        for (let addr of out.scriptPubKey.addresses)
                            if (!addressesFromTransaction.has(addr))
                                addressesFromTransaction.add(addr)
                for (let addr of addressesFromTransaction.keys()) {
                    logger.debug("Updated address: " + addr)
                    if (commandEmitter)
                        commandEmitter.emit("updateAddress", addr);
                }
            } catch (err) {
                logger.error(err);
            }
        }
    }
}

let PrevMNAddresses;
let busyMasterNodeInfo = false;
let busyBlockchainInfo = false;
async function getBlockchainInfo() {
    try {
        let answer = await rpcHelper.SendPost({method: "getblockchaininfo"})
        return answer
    } catch (e) {
        return e
    }
}
async function getMNInfoHandler() {
    if (busyMasterNodeInfo)
        return;
    try {
        busyMasterNodeInfo = true;
        let answer = await rpcHelper.SendPost({method: "listmasternodes", params: []});
        let stat_mnByNet = new Map();
        let nowAddresses = new Map();
        if (answer.result) {
            // Statuses: https://github.com/PIVX-Project/PIVX/blob/v5.0.1/src/masternode.h#L245
            /*
                "PRE_ENABLED"
                "ENABLED"
                "EXPIRED"
                "VIN_SPENT"
                "REMOVE"
             */
            for (let item of answer.result) {
                /*
                  "rank": 1,
                  "network": "onion",
                  "txhash": "1ed2ff8f301c44d40d1caff8674ed55213174cb241596b7152014792a02aa010",
                  "outidx": 0,
                  "status": "ENABLED",
                  "addr": "D5gJz2nLxKSBCjpTwHZXEeQV146iQRwmFf",
                  "version": 70914,
                  "lastseen": 1545858469,
                  "activetime": 1915137,
                  "lastpaid": 1545815679
                 */
                nowAddresses.set(item.addr, item.status);
                if (PrevMNAddresses) {
                    if (PrevMNAddresses.has(item.addr)) {
                        if (PrevMNAddresses.get(item.addr) != item.status)
                            if (commandEmitter)
                                commandEmitter.emit("updateMNStatus", {addr: item.addr, status: item.status});
                    } else {
                        if (commandEmitter)
                            commandEmitter.emit("updateMNStatus", {addr: item.addr, status: item.status});
                    }
                }
                if (!stat_mnByNet.has(item.network))
                    stat_mnByNet.set(item.network, []);
                stat_mnByNet.get(item.network).push(item.addr);
            }
            if (PrevMNAddresses)
                for (let oldAddr of PrevMNAddresses.keys())
                    if (!nowAddresses.has(oldAddr))
                        if (commandEmitter)
                            commandEmitter.emit("deletedFromMNList", oldAddr);
            commandEmitter.emit("networkMN", stat_mnByNet);
            PrevMNAddresses = nowAddresses;
        } else
            logger.error(`[Get masternode list] skipped error: ${answer.error.message}`);
        busyMasterNodeInfo = false;
    } catch (err) {
        logger.error(`[Get masternode list] error: ${err.message}. Pause 145s.`);
        setTimeout(() => {
            busyMasterNodeInfo = false;
        }, 245 * 1000);
    }
}

async function getBudgetsHandler() {
    try {
        let answer = await rpcHelper.SendPost({method: "getbudgetinfo", params: []});
        if (answer.result) {
            commandEmitter.emit('budgets', answer.result);
        } else
            logger.error(`[getBudgetsHandler] skipped error: ${answer.error.message}`);
    } catch (err) {
        logger.error(`[getBudgetsHandler] error: ${err.message}.`);
    }
}

async function getSoftForks() {
    if (busyBlockchainInfo)
        return;
    try {
        busyBlockchainInfo = true;
        if (!commandEmitter)
            return;
        let answer = (await rpcHelper.SendPost({method: "getblockchaininfo"})).result;
        if (answer && answer["softforks"] && answer["softforks"].length > 0) {
            commandEmitter.emit("softforks", answer["softforks"]);
        } else
            commandEmitter.emit("softforks", []);
        busyBlockchainInfo = false;
    } catch (err) {
        logger.error(`[Get blockchain info] error: ${err.message}. Pause 145 sec`);
        setTimeout(() => {
            busyBlockchainInfo = false;
        }, 145 * 1000);
    }
}

setInterval(getBudgetsHandler, (CHECK_MN_INTERVAL_S + 10) * 1000);
setInterval(getMNInfoHandler, CHECK_MN_INTERVAL_S * 1000);
setInterval(getSoftForks, CHECK_MN_INTERVAL_S * 5 * 1000)

function SetEmitter(emitter) {
    commandEmitter = emitter;
}

(async () => {
    let res = await getBlockchainInfo()
    let str = JSON.stringify(res)
    logger.debug(`getBlockchainInfo: ${str}`)
    runZMQ()
})()

/**
 * Get balance from api https://pivx.ccore.online/ext/getbalance/Addr
 * @return {{err: string}}
 */
function GetBalanceSite(address) {
    return new Promise((resolve, reject) => {
        if (address.length !== 34)
            return resolve({err: "Incorrect address, check address or write to me in telegram."})
        https.get(`https://pivx.ccore.online/ext/getbalance/${address}?api_key=${ccoreAPIKey}`, (res) => {
            const {statusCode} = res;
            const contentType = res.headers['content-type'];

            let error;
            if (statusCode !== 200) {
                error = new Error('Request Failed.\n' + `Status Code: ${statusCode}`);
            } else if (!/^application\/json/.test(contentType)) {
                error = new Error('Invalid content-type.\n' + `Expected application/json but received ${contentType}`);
            }
            if (error) {
                res.resume();
                return reject(error.message);
            }

            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', (chunk) => {
                rawData += chunk;
            });
            res.on('end', () => {
                try {
                    const parsedData = parseFloat(rawData);
                    if (!isNaN(parsedData))
                        return resolve({result: parsedData});
                    else
                        return reject("[get balance] Error, try later. Err: " + rawData);
                } catch (e) {
                    reject(e.message);
                }
            });
        }).on('error', (e) => {
            reject(e.message);
        });
    });
}

module.exports.SetEventEmitter = SetEmitter;
module.exports.GetBalanceSite = GetBalanceSite;