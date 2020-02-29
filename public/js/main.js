
// @ts-check

/**
 * @typedef Content
 * @property {boolean} folder
 * @property {string} [name]
 * @property {string} path
 * @property {Array<Content>} [contents]
 */

/* Getting server info */

var IPandPort = document.getElementById('IPandPort');
var theQRCode = document.getElementById('theQRCode');
var updateAddress = function (addresses, port) {
    if (!(addresses instanceof Array)) return;
    IPandPort.classList.remove("error", "warning");
    IPandPort.innerText = addresses.map(function (address) {
        return [address, port].join(":");
    }).join(", ");
    if (addresses.length > 0) {
        theQRCode.setAttribute("src", `/qr_codes/${addresses[0]}_${port}.png`)
    } else {
        theQRCode.setAttribute("src", "");
    }
}
var updateAddressWError = function (isWarning) {
    if (isWarning) {
        IPandPort.classList.remove("error");
        IPandPort.classList.add("warning");
    }
    else {
        IPandPort.classList.remove("warning");
        IPandPort.classList.add("error");
    }
}

var previousRootContentMD5 = null;
var fileList = document.getElementById('fileList');
var updateFiles = function (rootContentObject, rootContentMD5, allowDeletion) {
    // console.log("rootContentObject", rootContentObject);

    if (
        rootContentMD5 != null &&
        rootContentMD5 == previousRootContentMD5
    ) {
        return;
    }

    if (!(rootContentObject instanceof Object)) {
        fileList.innerHTML = "";
        return;
    }

    fileList.innerHTML = recursiveContentHTML(rootContentObject, allowDeletion);

    previousRootContentMD5 = rootContentMD5;
}
/**
 * @param {Content} contentObject
 * @param {boolean} allowDeletion
 */
var recursiveContentHTML = function (contentObject, allowDeletion) {
    // //TODO(baris) do this with document.createElement
    let strArray = [];

    if (contentObject.folder) {
        if (contentObject.path != "") {
            strArray.push(`<div class="folder-item">`);
            strArray.push(`<div class="folder-name" onclick="this.parentNode.classList.toggle('closed')">/${contentObject.path}</div>`);
        }

        strArray.push(...contentObject.contents.map((childContentObject) => {
            return recursiveContentHTML(childContentObject, allowDeletion);
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

function arrayEquals(ar1, ar2) {
    if (ar1 == null) {
        return ar2 == null;
    }
    if (ar2 == null) {
        return ar1 == null;
    }
    if (ar1.length != ar2.length) {
        return false;
    } else {
        for (let index = 0; index < ar1.length; index++) {
            if (ar1[index] != ar2[index]) return false;
        }
        return true;
    }
}

var deleteFile = function (fileName) {
    if (!confirm("Are you sure?")) return;
    var request = new XMLHttpRequest()
    request.open('GET', `./f/del/` + fileName, true)
    request.send();
}

var getServerInfo = function (callback) {
    var request = new XMLHttpRequest();
    request.open('GET', '/info', true);

    request.onload = function () {
        if (request.status >= 200 && request.status < 400) {
            // Success!
            var resp = request.responseText;
            var data = JSON.parse(resp);
            if ("addresses" in data && "port" in data) {
                updateAddress(data["addresses"], data["port"]);
            }
            if ("rootContent" in data) {
                updateFiles(data["rootContent"], data["rootContentMD5"], data["allowDeletion"]);
            }
        } else {
            updateAddressWError(true);
            console.error(request);
        }
    };

    request.onerror = function () {
        updateAddressWError(false);
        console.error(request);
    };

    request.send();
}

getServerInfo();
setInterval(function () {
    getServerInfo();
}, 2000);


/* Query based upload success error stuff */

var queryText = location.search;

//Clearing query.
window.history.pushState('obj', document.title, "http://" + location.host + location.pathname);

//TODO do this properly
var successIndex = queryText.startsWith("?success=");
if (successIndex) {
    var successPanel = document.getElementById('successPanel');
    if (successPanel) successPanel.className = successPanel.className.replace("hidden", "");

    var fileSuccessName = document.getElementById('fileSuccessName');
    fileSuccessName.innerText = decodeURIComponent(queryText.substring(9));

} else if (queryText.startsWith("?error=")) {
    var errorPanel = document.getElementById('errorPanel');
    if (errorPanel) errorPanel.className = errorPanel.className.replace("hidden", "");
}

/* Drag n Drop Upload */

var holder = document.body;
var fileToUploadButton = document.getElementById('fileToUploadButton');

holder.ondragover = function (e) {
    e.preventDefault();
    e.stopPropagation();
    var x = e.pageX;
    var y = e.pageY;

    fileToUploadButton.style.position = "fixed";
    fileToUploadButton.style.top = (y - 11) + "px";
    fileToUploadButton.style.left = (x - 40) + "px";

};

var fixButtonBack = function () { fileToUploadButton.style.position = "static"; }
holder.ondragend = fixButtonBack;
holder.ondragexit = fixButtonBack;
holder.ondragleave = function (e) {
    //console.log("holder.ondragleave",e);
    if (e.target == fileToUpload
        || e.pageX <= 10 || e.pageX >= window.innerWidth - 10
        || e.pageY <= 10 || e.pageY >= window.innerHeight - 10) {
        fixButtonBack();
    }
}
holder.ondrop = function (e) {
    if (e.target != fileToUpload) {
        e.preventDefault();
    }
    fixButtonBack();
}

/** @type {HTMLInputElement} */
// @ts-ignore
var fileToUpload = document.getElementById('fileToUpload');
fileToUpload.onchange = function (e) {
    holder.className += " success";
    setTimeout(function () {
        fileToUpload.form.submit();
    }, 1);
}