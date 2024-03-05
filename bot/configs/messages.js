let ConfModule = process.env.PRODUCTION === "1" ?
    require("../configs/productionConfig") : require("../configs/debugConfig");

let MessagesEn = {
    mainMenuItems: {
        addressOrMN: "Monitor Balance or Masternode",
        help: "Help",
        list: "Watch list",
        statPivx: "Stat Pivx",
        budgets: "Budgets",
        masternodes: "Masternodes"
    },
    commands: {
        start: 'Monitoring masternodes and addresses.' +
            '\nUse /lang to change language.\n',
        help: 'Commands:' +
            '\nShow stats: \'Stat Pivx\', \'!stat\', \'stat\', \'стат\', \'статистика\', \'стата\'' +
            '\nMasternodes graph: \'Masternodes\', \'nodes\', \'!masternodes\', \'что там по нодам\', \'ноды\'' +
            '\n\nWe use https://pivx.ccore.online/ as explorer.',
        inputAddress: "Input address for watching:",
        inputAlias: "Accepted. Input alias for this address:",
    },
    errors: {}
}
let MessagesRu = {}
module.exports.En = MessagesEn
module.exports.Ru = MessagesRu