var http = require('http');
var fileShare = require('./fileshare')({
    filesFolderPath: (process.argv[3] || null),
    port: (process.argv[2] || process.env.PORT),
    allowDeletion: false,
    multiUpload: false,
    folderUpload: false,
    progressCallback: function (progress, doneFileName) {
        //TODO: connect to UI when writing the electron app.
        if(progress != null) {
            console.log("Progress: " + Math.floor(progress) + "%");
        } else {
            console.log("Done file", doneFileName);
        }
    },
    errorCallback: function (url, err) {
        if (err.status == 404) {
            console.log("(Not Found) " + url);
        } else {
            console.log("(errorCallback) " + url);
            console.error(err);
        }
    }
});

var server = http.createServer(fileShare.app);

function onError(error) {
    if (error.syscall !== 'listen') {
        throw error;
    }

    var bind = typeof port === 'string'
        ? 'Pipe ' + fileShare.port
        : 'Port ' + fileShare.port;

    // handle specific listen errors with friendly messages
    switch (error.code) {
        case 'EACCES':
            console.error(bind + ' requires elevated privileges');
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(bind + ' is already in use');
            process.exit(1);
            break;
        default:
            throw error;
    }
}

function onListening() {
    var addr = server.address();

    if (typeof addr === 'string') {
        console.log('Listening on pipe ' + addr);
    } else {
        fileShare.addresses.forEach(function (address) {
            console.log('Listening on ' + address + ':' + addr.port);
        });
    }
}

server.listen(fileShare.port);
server.on('error', onError);
server.on('listening', onListening);