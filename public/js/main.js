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

let previousRootContentMD5 = null;
const fileListElement = document.getElementById('fileList');
function updateFiles(rootContentObject, rootContentMD5, allowDeletion) {
    // console.log("rootContentObject", rootContentObject);

    if (
        rootContentMD5 != null &&
        rootContentMD5 == previousRootContentMD5
    ) {
        return;
    }

    if (!(rootContentObject instanceof Object)) {
        fileListElement.innerHTML = "";
        return;
    }

    fileListElement.innerHTML = generateHTMLFromContentRecursive(rootContentObject, allowDeletion);

    previousRootContentMD5 = rootContentMD5;
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

function deleteFile(fileName) {
    if (!confirm("Are you sure?")) return;
    const request = new XMLHttpRequest()
    request.open('GET', `./delete/` + encodeURIComponent(fileName), true)
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

function refreshInfoOnPage() {
    return getServerInfo().then((infoResult) => {
        const { addresses, port, rootContent, rootContentMD5, allowDeletion } = infoResult;

        if (
            (addresses != null && (addresses instanceof Array)) &&
            (port != null && !isNaN(port))
        ) {
            updateAddressInfo(addresses, port);
            updateAddressInfoStatus("success");
        }

        if (rootContent != null) {
            updateFiles(rootContent, rootContentMD5, allowDeletion);
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

if (TheURLSearchParams.has("success")) {
    document.getElementById('successPanel').classList.remove("hidden");
    document.getElementById('fileSuccessName').innerText = decodeURIComponent(TheURLSearchParams.get("success"));
    clearSearchQuery();
} else if (TheURLSearchParams.has("error")) {
    document.getElementById('errorPanel').classList.remove("hidden");
    clearSearchQuery();
}

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

/** @type {HTMLInputElement} */
// @ts-ignore
const fileToUploadInputElement = document.getElementById('fileToUpload');
fileToUploadInputElement.onchange = function (e) {
    dragDropHolder.classList.add("success");
    setTimeout(function () {
        fileToUploadInputElement.form.submit();
    }, 1); // NOTE(baris): Hack for submitting after page rendering with success class.
}
