const {app, BrowserWindow} = require('electron')
const path = require('path')
const url = require('url')

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

function createWindow () {
  // Create the browser window.
  win = new BrowserWindow({width: 800, height: 600})

  // and load the index.html of the app.
  win.loadURL(url.format({
    pathname: path.join(__dirname, 'electron-index.html'),
    protocol: 'file:',
    slashes: true
  }))

  // Open the DevTools.
  win.webContents.openDevTools()

  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

/* */

var http = require('http');

//TODO randomize port option

var fileShare = require('./fileshare')({
  port:8080,
  progressCallback: function(progress,fileName) {
      //TODO: connect to UI when writing the electron app.
      //console.log("Progress: "+fileName+" "+Math.floor(progress)+"%");
  },
  errorCallback: function (err) {
    //console.error(err);
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
        //process.exit(1);
        break;
        case 'EADDRINUSE':
        console.error(bind + ' is already in use');
        //process.exit(1);
        server.close();
        fileShare.port = Math.floor(Math.random() * 8000 + 1000)
        server.listen(fileShare.port);
        break;
        default:
        throw error;
    }
}

function onListening() {
    var addr = server.address();
    
    if(typeof addr === 'string'){
        //console.log('Listening on pipe ' + addr);
    } else {
        fileShare.addresses.forEach(function (address) {
            //console.log('Listening on ' + address + ':' + addr.port);
        });
    }
}

exports.fileShare = fileShare;

exports.startServer = function (argument) {
  server.listen(fileShare.port);
  server.on('error', onError);
  server.on('listening', onListening);
}