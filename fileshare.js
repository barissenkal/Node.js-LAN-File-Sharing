var express = require('express');
var formidable = require('formidable');
var path = require('path');
var fs = require('fs');
var os = require('os');

function normalizePort(val) {
    var port = parseInt(val, 10);
    
    if (isNaN(port)) {
        // named pipe
        return val;
    }
    
    if (port >= 0) {
        // port number
        return port;
    }
    
    return false;
}


module.exports = function (conf) {
    
    /*
        conf = {
            filePath:...,
            publicPath:...,
            port:...|8080,
            progressCallback:...,
            errorCallback:...,
            progressThreshold:...|10,
            disable: {
                fileDownload:...|false,
                info:...|false
            }
        }
    */
    
    //Getting config from conf.
    var filePath = conf.filePath || path.join(__dirname, 'files'),
        publicPath = conf.publicPath || path.join(__dirname, 'public'),
        port = normalizePort(conf.port || '8080'),
        progressCallback = conf.progressCallback || false,
        errorCallback = conf.errorCallback || false,
        progressThreshold = conf.progressThreshold || 10,
        disable = conf.disable || {};
    
    var interfaces = os.networkInterfaces();
    
    var addresses = [];
    for (var k in interfaces) {
        for (var k2 in interfaces[k]) {
            var address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal) {
                addresses.push(address.address);
            }
        }
    }
    
    //New express app
    var app = express();
    
    //For index. Basically app.get('/',...);
    app.use(express.static(publicPath));

    //For downloading files
    if(!disable.fileDownload) app.use('/f',express.static(filePath));
    
    app.post('/', function(req, res) {
    
        var form = new formidable.IncomingForm();
        
        form.parse(req);
        
        var finalName,
            progress;
        
        form.on('fileBegin', function (name, file){
            
            progress = 0;
            
            fileName = file.name;
            var splitted = fileName.split(".");
            var extension, name;
            if(splitted.length > 1) {
                extension = splitted[splitted.length-1];
                name = "";
                for (var i = 0; i < splitted.length-1; i++) {
                    name += splitted[i];
                }
            } else {
                extension = "";
                name = fileName;
            }
            
            //For not overwriting files.
            var i = 0;
            while(fs.existsSync(path.join(filePath, fileName))){
                fileName = name + " dup" + (i++) + "." + extension;
            }
            
            file.path = path.join(filePath, fileName);
            file.finalName = fileName;
            finalName = fileName;
            
        });
        
        form.on('file', function (name, file){
            res.redirect('/?success=' + encodeURIComponent(file.finalName));
        });
        
        form.on('error', function(err) {
            res.redirect('/?error=1');
        });
        
        form.on('progress', function (bytesReceived,bytesExpected) {
            var temp = bytesReceived * 100 / bytesExpected;
            if (temp > progress + progressThreshold) {
              progress = Math.floor(temp);
              if(progressCallback) progressCallback(progress,finalName);
            }
        });

    });
    
    app.get('/info',function(req, res) {
        
        if(disable.info) {
            var err = new Error('Not Found');
            err.status = 404;
            res.send(err);
            return;
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', true); // If needed
        
        var info = {"addresses":addresses,"port":port};
        
        if(disable.fileDownload){
            res.json(info);
            return;
        }
        
        fs.readdir(filePath, (err, files) => {
            
            var fileList = [];
            if (files) {
                fileList = files.filter(function (fileName) {
                    return fileName[0] != '.';
                });
            }
            
            info.fileList = fileList;
            res.json(info);
        })
        
    });
    
    // catch 404
    app.use(function(req, res, next) {
        var err = new Error('Not Found');
        err.status = 404;
        next(err);
    });

    // development error handler
    app.use(function(err, req, res, next) {
        if(errorCallback) errorCallback(err);
        res.status(err.status || 500).send({ error: err });
    });
    
    app.set('port', port);

    return {
        "addresses":addresses,
        "app":app,
        "disable":disable, //For changing later.
        "port":port,
        "changeFilesPath": function (newPath) {
            console.log("Old filePath:"+filePath);
            filePath = newPath;
            console.log("New filePath:"+filePath);
        },
        "getFilePath": function () {
            return '' + filePath;
        }
    };
    
};
