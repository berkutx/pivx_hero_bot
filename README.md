# README #

Pivx hero bot: monitoring for balances\masternodes\price\budgets.  
We use https://pivx.ccore.online/ as explorer.

## How do I get set up? ###

### Setup environments ###
1) Downloads content of this repo or clone it
>git clone https://github.com/berkutx/pivx_hero_bot.git
2) Install docker
3) Update secrets in .env. Keep .env in secret!
4) execute: ./run.sh
5) wait a hour for synced node by snapshot
6) open telegram bot and test answer

pivx.dat contains addresses for monitoring in next format(\t):
> addr7	telegramId	alias7  
> addr8	telegramId	alias8

## Who do I talk to? ###