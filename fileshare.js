var express = require('express');
var formidable = require('formidable');
var path = require('path');
var fs = require('fs');
var os = require('os');
var qr_image = require("qr-image");

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
            // NOTE: Only handling IPv4 at the moment.
            if (address.family === 'IPv4' && !address.internal) {
                addresses.push(address.address);
            }
        }
    }

    let qrCodesPath = path.join(publicPath, "./qr_codes/");
    if (!fs.existsSync(qrCodesPath)){
        fs.mkdirSync(qrCodesPath);
    }
    addresses.forEach((address) => {
        let qr_svg = qr_image.image(`http://${address}:${port}/`, { type: 'png' });
        qr_svg.pipe(fs.createWriteStream(path.join(publicPath, `./qr_codes/${address}_${port}.png`)));
    });
    
    //New express app
    var app = express();
    
    //For index. Basically app.get('/',...);
    app.use(express.static(publicPath));

    //For downloading files
    if(!disable.fileDownload) app.use('/f',express.static(filePath));
    
    app.post('/', function(req, res) {
        
        // Bug fix for when the filePath folder does not exists
        if (!!conf.filePath) {
            // For a path that can have multiple non existent folders.
            // Borrowed from: https://stackoverflow.com/a/41970204
            filePath.split(path.sep).reduce((currentPath, folder) => {
                currentPath += folder + path.sep;
                if (!fs.existsSync(currentPath)){
                    fs.mkdirSync(currentPath);
                }
                return currentPath;
            }, '');   
        } else {
            // For the simple './files' path.
            if (!fs.existsSync(filePath)){
                fs.mkdirSync(filePath);
            }
        }
    
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
                    return !(fileName[0] == '.' || fileName == "index.html");
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
        //res.status(err.status || 500).send({ error: err });
        next();
    });
    
    app.set('port', port);

    return {
        "addresses":addresses,
        "app":app,
        "disable":disable, //For changing later.
        "port":port
    };
    
};
