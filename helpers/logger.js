var winston = require('winston');
winston.emitErrs = true;

var logger = new winston.Logger({
    transports: [
        new winston.transports.File({
            timestamp: true,
            level: 'debug',
            filename: 'logs/all-logs.log',
            handleExceptions: true,
            humanReadableUnhandledException: true,
            json: true,
            maxsize: 15 * 1024 * 1024, //15MB
            maxFiles: 5,
            colorize: false
        }),
        new winston.transports.Console({
            timestamp: true,
            level: 'debug',
            handleExceptions: true,
            humanReadableUnhandledException: true,
            json: false,
            colorize: true
        })
    ],
    exitOnError: false
});
if (process.env.NODE_ENV === "PRODUCTION") {
    logger.transports.console.level = 'info';
    logger.transports.file.level = 'info';
}

module.exports = {Logger: logger};
