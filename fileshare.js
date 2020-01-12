// @ts-check

const express = require('express');
const formidable = require('formidable');
const path = require('path');
const fs = require('fs');
const os = require('os');
const qr_image = require("qr-image");
const crypto = require('crypto');

/** @typedef {import('fs').Stats} FileStats */

/**
 * @typedef Content
 * @property {boolean} folder
 * @property {string} [name]
 * @property {string} path
 * @property {Array<Content>} [contents]
 */

/**
 * @param {string} targetPath
 * @param {string} basePath
 * @param {string} [name=null]
 * @returns {Promise<Content>}
 */
function recursiveReaddir(targetPath, basePath, name = null) {
    return readdirPromise(targetPath).then((contentNames) => {
        return Promise.all(contentNames.map((fileOrDirName) => {
            let fileOrDirPath = path.join(targetPath, fileOrDirName);
            return lstatPromise(fileOrDirPath).then((stats) => {
                if (stats.isDirectory()) {
                    return recursiveReaddir(fileOrDirPath, basePath, fileOrDirName);
                } else if (stats.isFile()) {
                    return {
                        "folder": false,
                        "name": fileOrDirName,
                        "path": path.relative(basePath, fileOrDirPath)
                    };
                } else {
                    // NOTE(baris): Only handling file and folders
                    return null;
                }
            });
        }));
    }).then((contentObjects) => {
        if (contentObjects.length == 0 && targetPath != basePath) { // Ignoring empty (sub)folders
            return null;
        } else {
            return {
                "folder": true,
                "name": name,
                "path": path.relative(basePath, targetPath),
                "contents": contentObjects.filter(obj => (obj != null))
            }
        }
    })
}
/**
 * @param {string} targetPath
 * @returns {Promise<Array<string>>}
 */
function readdirPromise(targetPath) {
    return new Promise((resolve) => {
        fs.readdir(targetPath, (err, contentNames) => {
            if (contentNames == null) {
                resolve([]);
            } else {
                // NOTE(baris): Ignoring hidden files all together.
                resolve(contentNames.filter((contentName) => contentName[0] != '.'));
            }
        })
    });
}
/**
 * @param {string} targetPath
 * @returns {Promise<FileStats>}
 */
function lstatPromise(targetPath) {
    return new Promise((resolve) => {
        fs.lstat(targetPath, (err, stats) => {
            resolve(stats);
        });
    });
}

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
            filesFolderPath:...,
            publicPath:...,
            port:...|8080,
            allowDeletion:false,
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
    var filesFolderPath = conf.filesFolderPath || path.join(__dirname, 'files'),
        publicPath = conf.publicPath || path.join(__dirname, 'public'),
        port = normalizePort(conf.port || '8080'),
        allowDeletion = conf.allowDeletion === true,
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
    if(!disable.fileDownload) app.use('/f',express.static(filesFolderPath));

    app.get('/f/del/:filename',function(req, res) {
        
        if (allowDeletion) {
            var filename = req.params.filename

            try {
                fs.unlinkSync(`./files/`+filename)
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
                res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
                res.setHeader('Access-Control-Allow-Credentials', "true"); // If needed
                res.status(200)
                //file removed
            } catch(err) {
                err.status = 404;
                res.send(err);
            }    
        } else {
            res.sendStatus(500);
        }
        
    });

    app.post('/', function(req, res) {
        
        // Bug fix for when the filesFolderPath folder does not exists
        if (!!conf.filesFolderPath) {
            // For a path that can have multiple non existent folders.
            // Borrowed from: https://stackoverflow.com/a/41970204
            filesFolderPath.split(path.sep).reduce((currentPath, folder) => {
                currentPath += folder + path.sep;
                if (!fs.existsSync(currentPath)){
                    fs.mkdirSync(currentPath);
                }
                return currentPath;
            }, '');   
        } else {
            // For the simple './files' path.
            if (!fs.existsSync(filesFolderPath)){
                fs.mkdirSync(filesFolderPath);
            }
        }
    
        var form = new formidable.IncomingForm();
        
        form.parse(req);
        
        var finalName,
            progress;
        
        form.on('fileBegin', function (_, file){
            
            progress = 0;
            
            var fileName = file.name;
            var splitted = fileName.split(".");
            var extension, name;
            if (splitted.length > 1) {
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
            while(fs.existsSync(path.join(filesFolderPath, fileName))){
                fileName = name + " dup" + (i++) + "." + extension;
            }
            
            file.path = path.join(filesFolderPath, fileName);
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
        
        if (disable.info) {
            var err = new Error('Not Found');
            // @ts-ignore
            err.status = 404;
            res.send(err);
            return;
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // If needed
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // If needed
        res.setHeader('Access-Control-Allow-Credentials', "true"); // If needed
        
        var info = {"addresses":addresses,"port":port,"allowDeletion":allowDeletion};
        
        if (disable.fileDownload) {
            res.json(info);
            return;
        }
        
        recursiveReaddir(filesFolderPath, filesFolderPath, null).then((rootContent) => {
            info.rootContent = rootContent;
            // NOTE(baris): For client to not re-render UI when there are no changes.
            info.rootContentMD5 = crypto.createHash('md5').update(JSON.stringify(rootContent)).digest("hex");
            res.json(info);
        })
        
    });
    
    // catch 404
    app.use(function(req, res, next) {
        var err = new Error('Not Found');
        // @ts-ignore
        err.status = 404;
        next(err);
    });

    // development error handler
    app.use(function(err, req, res, next) {
        if(errorCallback) errorCallback(req.url, err);
        if (err.status == 404) {
            res.sendStatus(404);
        } else {
            res.sendStatus(500);
        }
    });
    
    app.set('port', port);

    return {
        "addresses":addresses,
        "app":app,
        "disable":disable, //For changing later.
        "port":port
    };
    
};
