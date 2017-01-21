var http = require('http');

var shareSettings = require('./fileshare')({
	progressCallback: function(progress,fileName) {
      //TODO: connect to UI when writing the electron app.
      console.log("Progress: "+fileName+" "+Math.floor(progress)+"%");
 	},
 	errorCallback: function (err) {
 		console.error(err);
 	}
});

var server = http.createServer(shareSettings.app);

function onError(error) {
    if (error.syscall !== 'listen') {
        throw error;
    }
    
    var bind = typeof port === 'string'
    ? 'Pipe ' + shareSettings.port
    : 'Port ' + shareSettings.port;
    
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
    
    if(typeof addr === 'string'){
        console.log('Listening on pipe ' + addr);
    } else {
        shareSettings.addresses.forEach(function (address) {
            console.log('Listening on ' + address + ':' + addr.port);
        });
    }
}

server.listen(shareSettings.port);
server.on('error', onError);
server.on('listening', onListening);