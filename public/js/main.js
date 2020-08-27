"use strict";
// @ts-check

/** @typedef {import('../../fileshare').Content} Content */
/** @typedef {import('../../fileshare').ServerInfoResult} ServerInfoResult */

/* Getting server info */

const IPandPortElement = document.getElementById('IPandPort');
const theQRCodeElement = document.getElementById('theQRCode');

let previousIpPortString = null;
/**
 * @param {Array<string>} addresses
 * @param {number} port
 */
function updateAddressInfo(addresses, port) {
    const newIpPortString = addresses.map(function (address) {
        return [address, port].join(":");
    }).join(", ");
    if (previousIpPortString != newIpPortString) {
        IPandPortElement.innerText = newIpPortString;
        if (addresses.length > 0) {
            theQRCodeElement.setAttribute("src", `/qr_codes/${addresses[0]}_${port}.png`)
        } else {
            theQRCodeElement.setAttribute("src", "");
        }
        previousIpPortString = newIpPortString;
    }
}

/** @typedef {"success"|"warning"|"error"} AddressInfoStatusEnum */

/**
 * @param {AddressInfoStatusEnum} statusEnum
 */
function updateAddressInfoStatus(statusEnum) {
    if (statusEnum == "success") {
        IPandPortElement.classList.remove("error", "warning");
    } else if (statusEnum == "warning") {
        IPandPortElement.classList.remove("error");
        IPandPortElement.classList.add("warning");
    } else if (statusEnum == "error") {
        IPandPortElement.classList.remove("warning");
        IPandPortElement.classList.add("error");
    } else {
        console.error("updateAddressWError unknown statusEnum", statusEnum);
    }
}

/** @type {Object<string, boolean>} */
let _path2isCollapsed = null;
let _isCollapsedCacheTimeout = null;
const isCollapsedCache = {
    get(path) {
        if(_path2isCollapsed == null) {
            let cacheStr = null;
            try {
                cacheStr = localStorage.getItem("path2isCollapsed");
            } catch (error) {
                console.error("localStorage.getItem error", error);
            }
            if(cacheStr != null) {
                _path2isCollapsed = JSON.parse(cacheStr);
            } else {
                _path2isCollapsed = {};
            }
        }
        return _path2isCollapsed[path] == true;
    },
    set(path, isCollapsed) {
        if(isCollapsed) {
            _path2isCollapsed[path] = true;
        } else {
            // NOTE(baris): No need to store since default state is not collapsed
            delete _path2isCollapsed[path];
        }
        
        if(_isCollapsedCacheTimeout != null) clearTimeout(_isCollapsedCacheTimeout);
        
        _isCollapsedCacheTimeout = setTimeout(() => {
            let cacheStr = JSON.stringify(_path2isCollapsed)
            try {
                localStorage.setItem("path2isCollapsed", cacheStr);
            } catch (error) {
                console.error("localStorage.getItem error", error);
            }
        }, 100);
    }
}

Vue.component('folderItem', {
    created() {
        // console.log("folderItem created");
        this.isCollapsed = isCollapsedCache.get(this.contentObject.path);
    },
    data () {
        return {
            "isCollapsed": false,
        }
    },
    watch: {
        "isCollapsed": function () {
            isCollapsedCache.set(this.contentObject.path, this.isCollapsed);
        }
    },
    template: `<div class="folder-item" :class="{'closed': isCollapsed}">
        <div class="folder-name" @click="isCollapsed = !isCollapsed">
            /{{contentObject.path}}
        </div>
        <list-item
            v-for="content in contentObject.contents"
            :key="content.path"
            :content="content"
            :deletion="allowDeletion"
        />
    </div>`,
    props: ["contentObject", "allowDeletion"]
})

Vue.component('fileItem', {
    // created() { console.log("fileItem created");},
    template: `<div class="file-item">
        <a
            target="_blank"
            :href="'./f/' + contentObject.path"
            class="file-name"
            download
        >
            {{contentObject.name}}
        </a>
        <a
            v-if="allowDeletion"
            class="file-delete-button"
            @click="$deleteFile(contentObject.path)"
        >
            &times;
        </a>
    </div>`,
    props: ["contentObject", "allowDeletion"]
})

Vue.component('listItem', {
    // created() { console.log("listItem created");},
    template: `<span>
        <folder-item
            v-if="content.folder"
            :contentObject="content"
            :allowDeletion="deletion"
        ></folder-item>
        <file-item
            v-if="!content.folder"
            :contentObject="content"
            :allowDeletion="deletion"
        ></file-item>
    </span>`,
    props: ["content", "deletion"]
})


// TODO(baris): comment
Vue.config.devtools = true

const fileListVueApp = new Vue({
    el: '#fileList',
    data: {
        rootContentObject: {"contents": []},
        allowDeletion: false
    },
    created() {
        // ...
    },
    methods: {
        /**
         * @param {Content} rootContentObject
         * @param {boolean} allowDeletion
         */
        updateFiles(rootContentObject, allowDeletion) {
            this.rootContentObject = rootContentObject;
            this.allowDeletion = allowDeletion;
        },
    }
})
Vue.prototype.$deleteFile = deleteFile;

/**
 * @param {Content} rootContentObject
 * @param {boolean} allowDeletion
 */
function updateFiles(rootContentObject, allowDeletion) {
    console.log("rootContentObject", rootContentObject, allowDeletion);
    if (!(rootContentObject instanceof Object)) {
        fileListVueApp.updateFiles({"contents":[]}, allowDeletion);
        return;
    }
    fileListVueApp.updateFiles(rootContentObject, allowDeletion);
}

/**
 * @param {Content} contentObject
 * @param {boolean} allowDeletion
 * //TODO(baris) do this with document.createElement ? Use Virtual DOM instead ???
 */
function generateHTMLFromContentRecursive(contentObject, allowDeletion) {
    let strArray = [];

    if (contentObject.folder) {
        if (contentObject.path != "") {
            strArray.push(`<div class="folder-item">`);
            strArray.push(`<div class="folder-name" onclick="this.parentNode.classList.toggle('closed')">/${contentObject.path}</div>`);
        }

        strArray.push(...contentObject.contents.map((childContentObject) => {
            return generateHTMLFromContentRecursive(childContentObject, allowDeletion);
        }));

        if (contentObject.path != "") {
            strArray.push(`</div>`);
        }
    } else {
        strArray.push(`<div class="file-item">`);
        strArray.push(`<a target="_blank" href="./f/${contentObject.path}" class="file-name" download>${contentObject.name}</a>`);
        if (allowDeletion) {
            strArray.push(`<a class="file-delete-button" href="javascript:void(0);" onclick="deleteFile('${contentObject.path}')">&times;</a>`);
        }
        strArray.push(`</div>`);
    }
    return strArray.join('');
}

function deleteFile(path) {
    if (!confirm("Are you sure?")) return;
    const request = new XMLHttpRequest()
    request.open('GET', `./delete/` + encodeURIComponent(path), true)
    request.send();
}

class ServerError extends Error {
    /**
     * @param {XMLHttpRequest} request
     */
    constructor(request) {
        super();
        this.request = request;
        this.name = "ServerError";
    }
}
class ConnectionError extends Error {
    /**
     * @param {XMLHttpRequest} request
     */
    constructor(request) {
        super();
        this.request = request;
        this.name = "ConnectionError";
    }
}

/**
 * @param {string} [oldMD5=null]
 * @returns {Promise<ServerInfoResult>}
 */
function getServerInfo(oldMD5 = null) {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        const URL = (oldMD5 != null ? `/info?md5=${encodeURIComponent(oldMD5)}` : '/info');
        request.open('GET', URL, true);

        request.onload = function () {
            if (request.status >= 200 && request.status < 400) {
                const data = JSON.parse(request.responseText);
                resolve(data);
            } else {
                console.error("getServerInfo server error", request);
                reject(new ServerError(request));
            }
        };
        request.onerror = function () {
            console.error("getServerInfo connection error", request);
            reject(new ConnectionError(request));
        };

        request.send();
    })
}

let multiUploadFileInput = false;
let folderUploadFileInput = false;
let previousRootContentMD5 = null;
function refreshInfoOnPage() {
    return getServerInfo(previousRootContentMD5).then((infoResult) => {
        const { addresses, port, rootContent, rootContentMD5, allowDeletion, multiUpload, folderUpload } = infoResult;

        if (
            (addresses != null && (addresses instanceof Array)) &&
            (port != null && !isNaN(port))
        ) {
            updateAddressInfo(addresses, port);
            updateAddressInfoStatus("success");
        }

        if (
            (previousRootContentMD5 == null) ||
            (previousRootContentMD5 != rootContentMD5)
        ) {
            updateFiles(rootContent, allowDeletion);
            previousRootContentMD5 = rootContentMD5;
        }
        
        if(multiUpload && !multiUploadFileInput) {
            multiUploadFileInput = true;
            fileToUploadInputElement.addAttribute("multiple");
        } else if(!multiUpload && multiUploadFileInput) {
            multiUploadFileInput = false;
            fileToUploadInputElement.removeAttribute("multiple");
        }
        
        if(folderUpload && !folderUploadFileInput) {
            folderUploadFileInput = true;
            fileToUploadInputElement.addAttribute("webkitdirectory");
        } else if(!folderUpload && folderUploadFileInput) {
            folderUploadFileInput = false;
            fileToUploadInputElement.removeAttribute("webkitdirectory");
        }
        

    }, (error) => {
        if (error instanceof ServerError) {
            updateAddressInfoStatus("warning");
        } else if (error instanceof ServerError) {
            updateAddressInfoStatus("error");
        } else {
            console.error("refreshInfoOnPage error", error);
        }
    }).then(() => {
        setTimeout(() => {
            refreshInfoOnPage();
        }, 1000);
    })
}
refreshInfoOnPage();

/* Query based upload success error stuff */

/** @type {URLSearchParams|Map<string, string>} */
let TheURLSearchParams = null;
try {
    let theURL = new URL(location.href);
    TheURLSearchParams = theURL.searchParams;
} catch (error) {
    console.error("URL parse error", error);
}
if (TheURLSearchParams == null) { // Dirty hack polyfill.
    try {
        /** @type {Array<[string, string]>} */
        let parts;
        if (location.search != null) {
            parts = (location.search.substring(1)).split("&").map((pairStr) => {
                let [key, rawValue] = pairStr.split("=");
                return [
                    key,
                    (
                        rawValue != null ?
                            decodeURIComponent(rawValue) :
                            null
                    )
                ];
            });
        } else {
            parts = [];
        }
        TheURLSearchParams = new Map(parts);
    } catch (error) {
        console.error("Manuel TheURLSearchParams parse error", error);
    }
}

function clearSearchQuery() {
    window.history.replaceState('obj', document.title, "http://" + location.host + location.pathname);
}

// if (TheURLSearchParams.has("success")) {
//     document.getElementById('successPanel').classList.remove("hidden");
//     document.getElementById('fileSuccessName').innerText = decodeURIComponent(TheURLSearchParams.get("success"));
//     clearSearchQuery();
// } else if (TheURLSearchParams.has("error")) {
//     document.getElementById('errorPanel').classList.remove("hidden");
//     clearSearchQuery();
// }

/* Drag n Drop Upload */

const dragDropHolder = document.body;
const fileToUploadButton = document.getElementById('fileToUploadButton');

dragDropHolder.ondragover = function (e) {
    e.preventDefault();
    e.stopPropagation();

    fileToUploadButton.style.position = "fixed";
    fileToUploadButton.style.top = (e.pageY - 11) + "px";
    fileToUploadButton.style.left = (e.pageX - 40) + "px";

};

const fixButtonBack = function () { fileToUploadButton.style.position = "static"; }
dragDropHolder.ondragend = fixButtonBack;
dragDropHolder.ondragexit = fixButtonBack;
dragDropHolder.ondragleave = function (e) {
    //console.log("holder.ondragleave",e);
    if (e.target == fileToUploadInputElement
        || e.pageX <= 10 || e.pageX >= window.innerWidth - 10
        || e.pageY <= 10 || e.pageY >= window.innerHeight - 10) {
        fixButtonBack();
    }
}
dragDropHolder.ondrop = function (e) {
    if (e.target != fileToUploadInputElement) {
        e.preventDefault();
    }
    fixButtonBack();
}

const errorPanelDiv = document.getElementById('errorPanel')

function handleFileUploadRequestEvents(eventName, event) {
    console.log("handleFileUploadRequestEvents", eventName);
    if(
        eventName == "load" ||
        eventName == "abort" ||
        eventName == "error" ||
        eventName == "timeout"
    ) {
        dragDropHolder.classList.remove("success");
        fileToUploadInputElement.value = "";
    }
    if(
        eventName == "abort" ||
        eventName == "error" ||
        eventName == "timeout"
    ) {
        errorPanelDiv.classList.remove("hidden");
    }
}

/** @type {HTMLInputElement} */
// @ts-ignore
const progressMessageDiv = document.getElementById('progressMessage');

/** @type {HTMLInputElement} */
// @ts-ignore
const fileToUploadInputElement = document.getElementById('fileToUpload');
fileToUploadInputElement.onchange = function (e) {
    const files = Array.from(fileToUploadInputElement.files);
    console.log("fileToUploadInputElement.onchange files", files);
    
    dragDropHolder.classList.add("success");
    errorPanelDiv.classList.add("hidden");
    
    const uploadRequest = new XMLHttpRequest();
    uploadRequest.open('POST', "/", true);
    
    uploadRequest.addEventListener('readystatechange', (event) => {handleFileUploadRequestEvents('readystatechange', event)});
    uploadRequest.addEventListener('load', (event) => {handleFileUploadRequestEvents('load', event)});
    uploadRequest.addEventListener('abort', (event) => {handleFileUploadRequestEvents('abort', event)});
    uploadRequest.addEventListener('error', (event) => {handleFileUploadRequestEvents('error', event)});
    uploadRequest.addEventListener('timeout', (event) => {handleFileUploadRequestEvents('timeout', event)});
    
    uploadRequest.upload.addEventListener('progress', (event) => {
        if(event.lengthComputable) {
            const percent = Math.floor((event.loaded / event.total) * 100);
            console.log('progress', percent);
            progressMessageDiv.innerText = percent + "%";
        } else {
            console.log('progress', uploadRequest);
            progressMessageDiv.innerHTML = "&nbsp;&nbsp;&nbsp;Uploading...";
        }
    });
    
    const formData = new FormData();
    for (let index = 0; index < files.length; index++) {
        const file = files[index];
        const filePath = (
            (file.webkitRelativePath != null && file.webkitRelativePath != "") ?
            file.webkitRelativePath :
            file.name
        )
        formData.append(filePath, file);
    }
    
    uploadRequest.send(formData);
}
