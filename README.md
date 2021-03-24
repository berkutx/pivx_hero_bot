# README #

Pivx hero bot: monitoring for balances\masternodes\price\budgets.  
We use https://pivx.ccore.online/ as explorer.

## How do I get set up? ###

### Setup environments ###
1) Install pivxd(or build from sources with ```./configure --with-zmq --without-gui --with-miniupnpc=no --disable-tests```).  
   Sync blockchain.
2) Run pivxd as daemon, set up you passwords:
> pivxd -zmqpubrawtx=tcp://127.0.0.1:28331 -rpcuser=*** -rpcpassword=*** -rpcallowip=127.0.0.1 -server=1 -rpcport=51473 -daemon=1
3) Fill \*\*\*, coinmarketcap-api-key, BOT_API_TOKEN_TELEGRAM, PIVX_CCORE_API_KEY in pm2_pivxHeroBot.json file
   
    "NODE_ENV": "PRODUCTION",  
    "PIVX_RPC_USER":"\*\*\*",  
    "PIVX_RPC_PASS":"\*\*\*",  
    "PIVX_RPC_PORT":"51473",  
    "PIVX_CCORE_API_KEY":"get from @jimwal",  
    "CMC_API_KEY": "get from http://pro.coinmarketcap.com",  
    "market": "BTC-PIVX",  
    "BOT_API_TOKEN_TELEGRAM": "get from @BotFather",  
    "TELEGRAM_SESSION_HOST": "127.0.0.1",  
    "TELEGRAM_SESSION_PORT": 6379  

4) Install nodejs & pm2
>sudo apt install nodejs  
>sudo npm install pm2@latest -g

5) Install redis(for telegram accounts and sessions).  
You can change DB-id and prefix in ```config/productionConfig.js```: 

```
db: 3,
prefix: "pivxherobot_prod"
```
   
6) Downloads content of this repo or clone it
>git clone https://github.com/berkutx/pivx_hero_bot.git

7) Install dependencies from packages.json
>npm install
 

### Run ###
>pm2 start pm2_pivxHeroBot.json

pivx.dat contains addresses for monitoring in next format(\t):
> addr7	telegramId	alias7  
> addr8	telegramId	alias8

## Who do I talk to? ###

* Other community or team contact: 
