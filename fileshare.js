// @ts-check
"use_strict";

const express = require('express');
const formidable = require('formidable');
const path = require('path');
const fs = require('fs');
const os = require('os');
const qr_image = require("qr-image");
const crypto = require('crypto');
const util = require("util");
const chokidar = require('chokidar');

/**
 * @callback FileShareProgressCallback
 * @param {number} progress
 * @param {string} fileName
 */

/**
 * @typedef FileShareConfig
 * @property {string} [filesFolderPath]
 * @property {string} [publicPath]
 * @property {number} [port]
 * @property {boolean} [allowDeletion]
 * @property {boolean} [multiUpload]
 * @property {boolean} [folderUpload]
 * @property {FileShareProgressCallback} [progressCallback]
 * @property {function} [errorCallback]
 * @property {number} [progressThreshold]
 * @property {boolean} [orderByTime]
 * @property {number} [maxFileSize]
 * @property {{"info": boolean, "fileDownload": boolean}} [disable]
 */

/** @typedef {import('fs').Stats} FileStats */

/**
 * @typedef FolderContent
 * @property {true} folder
 * @property {string} name
 * @property {string} path
 * @property {Array<Content>} contents
 * @property {number} timestamp
 * // TODO(baris): size
 */
/**
 * @typedef FileContent
 * @property {false} folder
 * @property {string} name
 * @property {string} path
 * @property {number} timestamp
 * // TODO(baris): size
 */
/**
 * @typedef {FolderContent|FileContent} Content
 */

/**
 * @typedef ServerInfoResult
 * @property {Array<string>} addresses
 * @property {number} port
 * @property {FolderContent} rootContent
 * @property {string} rootContentMD5
 * @property {boolean} allowDeletion
 * @property {boolean} multiUpload
 * @property {boolean} folderUpload
 */

/**
 * @param {string} targetPath
 * @param {string} basePath
 * @param {string} [name=null]
 * @returns {Promise<FolderContent>}
 */
function recursiveReaddir(targetPath, basePath, name = null, orderByTime = false) {
    return readdirPromise(targetPath).then((contentNames) => {
        return Promise.all(contentNames.map((fileOrDirName) => {
            let fileOrDirPath = path.join(targetPath, fileOrDirName);
            return lstatPromise(fileOrDirPath).then(
                /** @returns {Content|Promise<Content>} */
                (stats) => {
                if (stats.isDirectory()) {
                    return recursiveReaddir(fileOrDirPath, basePath, fileOrDirName);
                } else if (stats.isFile()) {
                    /** @type {FileContent} */
                    const fileContent = {
                        "folder": false,
                        "name": fileOrDirName,
                        "path": path.relative(basePath, fileOrDirPath),
                        "timestamp": Math.max(...[stats.ctimeMs, stats.mtimeMs].filter(x => (x != null)))
                    };
                    return fileContent;
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
            let timestamp = null;
            if (contentObjects.length > 0) {
                contentObjects = contentObjects.filter(obj => (obj != null));
                if (orderByTime) {
                    contentObjects = contentObjects.sort((a, b) => {
                        if (a.timestamp == null) return 1;
                        if (b.timestamp == null) return -1;
                        return b.timestamp - a.timestamp;
                    });
                    timestamp = contentObjects[0].timestamp;
                } else {
                    timestamp = contentObjects.map((x) => x.timestamp).filter(x => (x != null)).sort((a, b) => b - a)[0];
                }
            }
            return {
                "folder": true,
                "name": name,
                "path": path.relative(basePath, targetPath),
                "contents": contentObjects,
                "timestamp": timestamp
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

//

/**
 * @param {string} msg
 * @param  {...any} args
 */
const logDebug = (
    (process.env.NODE_ENV === "debug") ?
    (msg, ...args) => {console.log(msg, ...args.map(arg => util.inspect(arg, false, 10, true)))} :
    (msg, ...args) => {}
)


/**
 * @typedef LiveCacheFolderContent
 * @property {true} folder
 * @property {string} path
 * @property {Object<string, LiveCacheContent>} contents
 * @property {number} timestamp
 * // TODO(baris): Sum size of files inside for size?
 */
/**
 * @typedef LiveCacheFileContent
 * @property {false} folder
 * @property {string} path
 * @property {number} timestamp
 * @property {number} size
 */
/**
 * @typedef {LiveCacheFolderContent|LiveCacheFileContent} LiveCacheContent
 */

class LiveCache {
    constructor(filesFolderPath, orderByTime=true) {
        
        this.orderByTime = orderByTime;
        
        /** @type {LiveCacheFolderContent} */
        const rootContent = {
            "folder": true,
            "path": "",
            "contents": {},
            "timestamp": null
        };
        this.rootContent = rootContent;
        
        const watcher = chokidar.watch(filesFolderPath, {
            cwd: filesFolderPath,
            ignored: /(^|[\/\\])\../, // ignore dotfiles
            persistent: true,
            alwaysStat: true,
        });
        this.watcher = watcher;
        
        watcher.on('error', error => {
            logDebug(`LiveCache: error`, error)
            // TODO(baris): Add error handling.
        })
        
        this.contentPrepPromise = new Promise((resolve) => {
            watcher.on('ready', () => {
                logDebug('Initial scan complete. Ready for changes')
                resolve();
            });
        })
        
        this._contentOutputJSON = null;
        this.contentOutputMD5 = null;
        
        /**
         * @param {string} pathStr
         * @returns {Array<string>}
         */
        function splitPath(pathStr) {
            if(pathStr == '') {
                return [];
            } else {
                return pathStr.split(path.sep);
            }
        }
        
        /**
         * @param {string} pathStr
         * @param {fs.Stats} stats
         */
        function addFolderToCache(pathStr, stats) {
            if(pathStr == "") {
                rootContent["timestamp"] = Math.max(...[stats.ctimeMs, stats.mtimeMs].filter(x => (x != null)))
            } else {
                const pathParts = splitPath(pathStr);
                const partCount = pathParts.length;
                
                let currentDir = rootContent;
                for (let index = 0; index <= (partCount-2); index++) {
                    // @ts-ignore
                    currentDir = currentDir.contents[pathParts[index]];
                }
                currentDir.contents[pathParts[partCount-1]] = {
                    "folder": true,
                    "path": pathStr,
                    "contents": {},
                    // TODO(baris): Double check if valid for folders
                    "timestamp": Math.max(...[stats.ctimeMs, stats.mtimeMs].filter(x => (x != null)))
                };
            }
        }
        /**
         * @param {string} pathStr
         * @param {fs.Stats} stats
         * NOTE(baris): Overwrites if in same path.
         */
        function addFileToCache(pathStr, stats) {
            if(pathStr == "") {
                console.error("addFileToCache root cannot be a file");
                return;
            }
            const pathParts = splitPath(pathStr);
            const partCount = pathParts.length;
            
            let currentDir = rootContent;
            for (let index = 0; index <= (partCount-2); index++) {
                // @ts-ignore
                currentDir = currentDir.contents[pathParts[index]];
            }
            currentDir.contents[pathParts[partCount-1]] = {
                "folder": false,
                "path": pathStr,
                "timestamp": Math.max(...[stats.ctimeMs, stats.mtimeMs].filter(x => (x != null))),
                "size": stats.size
            }
            
        }
        
        /**
         * @param {string} pathStr
         */
        function removeFromCache(pathStr) {
            if(pathStr == "") {
                console.error("removeFromCache root cannot be removed");
                return;
            }
            const pathParts = splitPath(pathStr);
            const partCount = pathParts.length;
            
            let currentDir = rootContent;
            for (let index = 0; index <= (partCount-2); index++) {
                // @ts-ignore
                currentDir = currentDir.contents[pathParts[index]];
            }
            delete currentDir.contents[pathParts[partCount-1]];
        }
        
        watcher
            .on('add', (path, stats) => {
                logDebug(`LiveCache: File has been added`, path, stats);
                this._invalidateOutputCache();
                addFileToCache(path, stats);
                logDebug(`LiveCache: rootContent`, rootContent);
            })
            .on('change', (path, stats) => {
                logDebug(`LiveCache: File has been changed`, path, stats);
                this._invalidateOutputCache();
                addFileToCache(path, stats);
                logDebug(`LiveCache: rootContent`, rootContent);
            })
            .on('unlink', path => {
                logDebug(`LiveCache: File has been removed`, path);
                this._invalidateOutputCache();
                removeFromCache(path);
                logDebug(`LiveCache: rootContent`, rootContent);
            })
            .on('addDir',  (path, stats) => {
                logDebug(`LiveCache: Directory has been added`, path, stats);
                this._invalidateOutputCache();
                addFolderToCache(path, stats);
                logDebug(`LiveCache: rootContent`, rootContent);
            })
            .on('unlinkDir', path => {
                logDebug(`LiveCache: Directory has been removed`, path);
                this._invalidateOutputCache();
                removeFromCache(path);
                logDebug(`LiveCache: rootContent`, rootContent);
            })
            .on('error', error => {
                console.error("LiveCache error:", error);
            })
        
    }
    
    /**
     * @param {string} baseFolderName
     * @param {LiveCacheFolderContent} baseFolderContent 
     * @returns {FolderContent}
     */
    _getContentRecursive(baseFolderName, baseFolderContent) {
        
        const contentNames = Object.keys(baseFolderContent.contents);
        
        if(contentNames.length == 0) return null;
        
        let contents = contentNames.map((contentName) => {
            const content = baseFolderContent.contents[contentName];
            if (content.folder) {
                return this._getContentRecursive(contentName, content);
            } else {
                /** @type {FileContent} */
                const fileContent = {
                    "folder": false,
                    "name": contentName,
                    "path": content.path,
                    "timestamp": content.timestamp
                }
                return fileContent;
            }
        }).filter(x => x != null);
        
        if (this.orderByTime) {
            contents = contents.sort((a, b) => {
                if (a.timestamp == null) return 1;
                if (b.timestamp == null) return -1;
                return b.timestamp - a.timestamp;
            });
        }
        
        return {
            "folder": true,
            "name": baseFolderName,
            "path": baseFolderContent.path,
            "contents": contents,
            // TODO(baris): Calculate timestamp from contents?
            "timestamp": baseFolderContent.timestamp,
        }
    }
    
    _invalidateOutputCache() {
        this._contentOutputJSON = null;
        this.contentOutputMD5 = null;
    }
    
    /**
     * Returns output content.
     * @returns {Promise<[FolderContent, string]>} -- [root folder content, md5]
     */
    prepContentOutput() {
        return this.contentPrepPromise.then(() => {
            // NOTE(baris): In class instance cache hit, independent of browser state.
            if(this.contentOutputMD5 == null) {
                this._contentOutputJSON = this._getContentRecursive(null, this.rootContent);
                this.contentOutputMD5 = crypto.createHash('md5').update(JSON.stringify(this._contentOutputJSON)).digest("hex")
            }
            return [this._contentOutputJSON, this.contentOutputMD5];
        });
    }
    
    // TODO(baris): attachUpdateListener
    // TODO(baris): detachUpdateListener
    
    destroy() {
        this.watcher.close().then(() => {
            logDebug("LiveCache destroy")
        })
    }
}

//

function normalizePort(val) {
    const port = parseInt(val, 10);

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

function getAddresses() {
    let interfaces = os.networkInterfaces();
    let addresses = [];
    for (const k in interfaces) {
        for (const k2 in interfaces[k]) {
            let address = interfaces[k][k2];
            // NOTE: Only handling IPv4 at the moment.
            if (address.family === 'IPv4' && !address.internal) {
                addresses.push(address.address);
            }
        }
    }
    return addresses;
}

function generateQRCodeIfNotExists(imagePath, address, port) {
    return new Promise((resolve, reject) => {
        fs.exists(imagePath, function (exists) {
            if (exists) {
                resolve();
            } else {
                let qr_svg = qr_image.image(`http://${address}:${port}/`, { type: 'png' });
                qr_svg.pipe(fs.createWriteStream(imagePath))
                    .on("finish", () => { resolve(); })
                    .on("error", () => { reject(); });
            }
        })
    })
}

function getAddressesWQRCodes(publicPath, port) {
    const addresses = getAddresses();
    return Promise.all(addresses.map((address) => {
        const imagePath = path.join(publicPath, `./qr_codes/${address}_${port}.png`);
        return generateQRCodeIfNotExists(imagePath, address, port).catch(() => {
            // NOTE(baris): Ignoring errors here.
        });
    })).then(() => addresses);
}

/**
 * @param {FileShareConfig} conf
 */
module.exports = function (conf) {

    //Getting config from conf.
    let filesFolderPath = conf.filesFolderPath || path.join(__dirname, 'files'),
        publicPath = conf.publicPath || path.join(__dirname, 'public'),
        port = normalizePort(conf.port || '8080'),
        allowDeletion = conf.allowDeletion === true,
        multiUpload = conf.multiUpload === true,
        folderUpload = conf.folderUpload === true,
        progressCallback = conf.progressCallback,
        errorCallback = conf.errorCallback,
        progressThreshold = conf.progressThreshold || 10,
        orderByTime = conf.orderByTime || true,
        maxFileSize = conf.maxFileSize || (100*1024*1024*1024), // 100GB
        disable = conf.disable || {"info": false, "fileDownload": false};
        
    const vueDistPath = path.join(__dirname, "./node_modules/vue/dist");

    let qrCodesPath = path.join(publicPath, "./qr_codes/");
    if (!fs.existsSync(qrCodesPath)) {
        fs.mkdirSync(qrCodesPath);
    }
    
    const liveCache = new LiveCache(filesFolderPath, orderByTime);

    //New express app
    const app = express();

    //For index. Basically app.get('/',...);
    app.use(express.static(publicPath));

    //For vue.js
    app.use('/vue', express.static(vueDistPath));

    //For downloading files
    if (!disable.fileDownload) app.use('/f', express.static(filesFolderPath));

    app.get('/delete/:filename', function (req, res) {
        
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // Just in case
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // Just in case
        res.setHeader('Access-Control-Allow-Credentials', "true"); // Just in case

        if (allowDeletion) {
            const filename = decodeURIComponent(req.params.filename);
            const filesFolderFullPath = path.resolve(filesFolderPath);
            const fileFullPath = path.join(filesFolderFullPath, filename);
            logDebug("fileFullPath", fileFullPath);
            if(
                fileFullPath != filesFolderFullPath &&
                fileFullPath.startsWith(filesFolderFullPath)
            ) {
                try {
                    fs.unlinkSync(fileFullPath)
                    res.sendStatus(200);
                } catch (error) {
                    error.status = 404;
                    console.error("fs.unlinkSync error", error);
                    res.send();
                }
            } else {
                res.statusCode = 500;
                res.send("Invalid filename");
            }
        } else {
            res.sendStatus(500);
        }

    });

    app.post('/', function (req, res) {

        // Bug fix for when the filesFolderPath folder does not exists
        if (!!conf.filesFolderPath) {
            // For a path that can have multiple non existent folders.
            // Borrowed from: https://stackoverflow.com/a/41970204
            filesFolderPath.split(path.sep).reduce((currentPath, folder) => {
                currentPath += folder + path.sep;
                if (!fs.existsSync(currentPath)) {
                    fs.mkdirSync(currentPath);
                }
                return currentPath;
            }, '');
        } else {
            // For the simple './files' path.
            if (!fs.existsSync(filesFolderPath)) {
                fs.mkdirSync(filesFolderPath);
            }
        }

        const form = new formidable.IncomingForm();
        
        form.uploadDir = filesFolderPath;
        
        form.maxFields = 10000;
        form.multiples = true;
        form.maxFileSize = maxFileSize;
        
        let progress = 0;
        form.on('progress', function (bytesReceived, bytesExpected) {
            const temp = bytesReceived * 100 / bytesExpected;
            if (temp > progress + progressThreshold) {
                progress = Math.floor(temp);
                if (progressCallback) progressCallback(progress, null);
            }
        });
        
        const foldersCreated = new Map(); // given folder => duplicate handled folder
        form.on('fileBegin', function (webkitRelativePath, file) {
            
            logDebug("fileBegin", webkitRelativePath, file);
            
            let {dir:parsedPathDir, name:parsedPathName, ext:parsedPathExt} = path.parse(webkitRelativePath);
            if(parsedPathDir != "") {
                // Borrowed from: https://stackoverflow.com/a/41970204
                parsedPathDir = parsedPathDir.split(path.sep).reduce((currentPath, folder, index) => {
                    let combinedPath = [currentPath, folder, path.sep].join('');
                    if(index == 0) {
                        if(foldersCreated.has(folder)) {
                            combinedPath = [currentPath, foldersCreated.get(folder), path.sep].join('');
                        } else {
                            let i = 0;
                            let handledFolder = folder;
                            while(fs.existsSync(path.join(filesFolderPath, combinedPath))) {
                                handledFolder = [folder, " dup", (i++)].join('');
                                combinedPath = [currentPath, handledFolder, path.sep].join('');
                            }
                            foldersCreated.set(folder, handledFolder);
                            fs.mkdirSync(path.join(filesFolderPath, combinedPath));
                        }
                    } else {
                        if (!fs.existsSync(path.join(filesFolderPath, combinedPath))) {
                            logDebug("combinedPath", combinedPath);
                            fs.mkdirSync(path.join(filesFolderPath, combinedPath));
                        }
                    }
                    return combinedPath;
                }, '');
            }
            
            let fileName = parsedPathName + parsedPathExt;
            let filePath = path.join(filesFolderPath, parsedPathDir, fileName);
            
            //For not overwriting files.
            let i = 0;
            while (fs.existsSync(filePath)) {
                fileName = [parsedPathName, " dup", (i++), ".", parsedPathExt].join('');
                filePath = path.join(filesFolderPath, parsedPathDir, fileName);
            }

            file.path = filePath;

        });
        
        form.on('file', function (name, file) {
            logDebug("file done", name, file);
            if (progressCallback) progressCallback(null, file.name);
        });

        form.parse(req, (error, fields, files) => {
            if(error != null) {
                console.error("form error", error);
                res.sendStatus(400);
            } else {
                // logDebug("files", files);
                logDebug("file uploads done");
                res.sendStatus(200);
            }
        });

    });

    app.get('/info', function (req, res) {

        if (disable.info) {
            res.sendStatus(404);
            return;
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE'); // Just in case
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,contenttype'); // Just in case
        res.setHeader('Access-Control-Allow-Credentials', "true"); // Just in case
        
        const addressesPromise = getAddressesWQRCodes(publicPath, port);
        
        /** @type {Promise<[FolderContent, string]>} */
        let rootContentPromise;
        if(disable.fileDownload) {
            rootContentPromise = Promise.resolve([null, null]);
        } else if(req.query.md5 != null && liveCache.contentOutputMD5 === req.query.md5) {
            // NOTE(baris): In browser cache hit case. Browser will not update.
            rootContentPromise = Promise.resolve([null, liveCache.contentOutputMD5]);
        } else {
            rootContentPromise = liveCache.prepContentOutput();
        }

        Promise.all([
            addressesPromise,
            rootContentPromise
        ]).then(([addresses, [rootContent, rootContentMD5]]) => {

            /** @type {ServerInfoResult} */
            const info = {
                "addresses": addresses,
                "port": port,
                "allowDeletion": allowDeletion,
                "multiUpload": multiUpload,
                "folderUpload": folderUpload,
                "rootContent": rootContent,
                "rootContentMD5": rootContentMD5
            };

            res.json(info);
        })

    });

    // catch 404
    app.use(function (req, res, next) {
        if (errorCallback) { // NOTE(baris): Preserved for backwards compatibility.
            var err = new Error('Not Found');
            // @ts-ignore
            err.status = 404;
            // development error handler
            errorCallback(req.url, err);
        }
        res.sendStatus(404);
    });

    app.use(function (err, req, res, next) {
        // development error handler
        if (errorCallback) errorCallback(req.url, err);
        res.sendStatus(500);
    });

    app.set('port', port);

    return {
        "addresses": getAddresses(),
        "app": app,
        "disable": disable, // For manual debugging.
        "port": port
    };

};
