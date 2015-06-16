/* ============================================================================
** General stuff.
** ==========================================================================*/

// Global variable declarations.
var alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-+@!€§|~[]";
var filename;
var uploadToken;
var iv;
var downloadChunks;
var downloadedChunks = [];
var decryptedChunks = [];
var csrfToken;
var lastRequest;
var fileId;
var passphrase;
var downloadLink;
var peer;
var keyPair;
var privateKey;
var publicKey;
var pki = forge.pki;
var rsa = pki.rsa;
var peerPublicKey;
var peerUserId;
var userId;

// Bindings.
$('#passphrase').val(generatePass()); // Generate random passphrase on page load.
$('#generate').on('click', newPass); // Generate random passphrase on user request.
$('#dec-submit').on('click', decryptChunks); // Decrypt downloaded chunks.
$('#download-submit').on('click', downloadFile); // Download file.
$('#file-input').change(uploadFile); // Upload a file on change.

$('#generate-keypair').on('click', setPublicKey);
$('.user_name').on('click', getPublicKey)

// Close alert messages.
$('.message .close').on('click', function() {
  $(this).closest('.message').fadeOut();
});

// Close alerts after some seconds.
setTimeout(function () {
  $('.message').fadeOut();
}, 5000);

// Select input value.
$("input[type='text'].select").click(function() {
   $(this).select();
});

// Convert timestamps into timeago format.
$("abbr.timeago").timeago();

// Show a tip when hovering over the file input.
$('.tip')
  .popup({
    position : 'right center',
  })
;

// Show a tip when focusing on the username input.
$('#username')
  .popup({
    on: 'focus',
    position : 'right center',
  })
;

// Trigger the user sidebar.
$('.sidebar').first()
  .sidebar('attach events', '.launch.button')
;


// Messaging

$("#message-submit").on('click', function(){

    var conn = peer.connect(peerUserId);
    var data = new Object();
    conn.on('open', function(){
      var msg = $("#textarea").val();
      var md = forge.md.sha1.create();
      md.update(msg, 'utf-8');
      var signature = privateKey.sign(md);
      data.signature = signature;
      data.message = msg;
      var dataJSON = JSON.stringify(data); 
      conn.send(dataJSON);
    });
});

/* ============================================================================
** File download.
** ==========================================================================*/

$(document).ready(function() {
  if (localStorage.privateKey) {
    privateKey = pki.privateKeyFromPem(localStorage.privateKey);
    publicKey = pki.publicKeyFromPem(localStorage.publicKey);
  }
  if (localStorage.peerPublicKey) {
    peerPublicKey = pki.publicKeyFromPem(localStorage.peerPublicKey);
  }
  lastRequest = "false";
  csrfToken = document.getElementsByName("_csrf_token")[0].value;

  var href = window.location.href;
  href = href.substr(href.lastIndexOf('/') + 1);

  userId = parseInt($("#logged-in").html());

  if (userId > -1) {
    peer = new Peer(userId, {key: 'tnyh1aenu1y8pvi'});
    peer.on('connection', function(conn) {
      conn.on('data', function(dataJSON){
        var data = JSON.parse(dataJSON);
        peerUserId = conn.peer;
        csrfToken = $("#master_csrf_token").val();
        lastRequest = "false";
        // AJAX call for public key
        $.ajax({
          url: '/getPublicKey',
          type: 'POST',
          xhr: function() { // custom xhr
            var myXhr = $.ajaxSettings.xhr();
            if(myXhr.upload) { // check if upload property exists
              myXhr.upload.addEventListener('progress', progressHandler, false); // for handling the progress of the upload
            }
            return myXhr;
          },
          contentType: 'text/plain',
          //Ajax events
          //beforeSend: beforeSendHandler,
          success: getPublicKeySuccessHandler,
          error: errorHandler,
          // Form data
          headers: {
            'X-File-Content-Type' : "application/octet-stream",
            'X-Csrf-Token' : csrfToken,
            'X-User-Id' : peerUserId,
            'X-Last-Request': lastRequest
          },
          processData: false,
          cache: false
        });
        var md = forge.md.sha1.create();
        md.update(data.message, 'utf8');
        var verified = peerPublicKey.verify(md.digest().bytes(), data.signature);
        console.log("Identity verified:" + verified);
        console.log("Message:"  + data.message);
      });
    });
  }

  if (href.indexOf('?') > -1) {
    href = href.substr(0,href.indexOf('?'));
  }

  if(href == "download") {
    $.ajax({
     url: '/downloadHandler',
      type: 'POST',
      xhr: function() { // custom xhr
        var myXhr = $.ajaxSettings.xhr();
        if(myXhr.upload) { // check if upload property exists
          myXhr.upload.addEventListener('progress', progressHandler, false); // for handling the progress of the upload
        }
        return myXhr;
      },
      contentType: 'text/plain',
      //Ajax events
      success: downloadSuccessHandler,
      error: errorHandler,
      // Form data
      headers: {
        'X-File-Content-Type' : "application/octet-stream",
        'X-Last-Request' : lastRequest,
        'X-Csrf-Token' : csrfToken,
        'X-File-Request' : "true",
        'X-File-Name' : getParameterByName("file")
      },
      processData: false,
      cache: false
    });
  }
  else if(href == "login") {
    setPublicKey();
  }
});


/* ============================================================================
** File encryption.
** ==========================================================================*/

// Encrypt slices of a file.
function encryptFile(slices, passphrase) {

  var encryptedSlices = [];
  var aesEncryptor = CryptoJS.algo.AES.createEncryptor(passphrase, { iv: iv });

  var readerArray = [];

  for (var j = 0; j < slices.length; j++) {
    readerArray.push(new FileReader()); // Initialize the file reader.
  }

  $.each(readerArray, function(index, value) {

    value.onload = function(e) {

      var ui8a = new Uint8Array(value.result);
      var wordarray = CryptoJS.enc.u8array.parse(ui8a);

      encryptedSlices.push(aesEncryptor.process(wordarray).toString(CryptoJS.enc.Base64));

    };

    value.readAsArrayBuffer(slices[index]);

    readerArray[readerArray.length - 1].onloadend = function(e) {

      if (encryptedSlices.length == slices.length) {

        encryptedSlices.push(aesEncryptor.finalize().toString(CryptoJS.enc.Base64));

        $.each(encryptedSlices, function(index, value) {

          if (index == encryptedSlices.length -1) {
            lastRequest = "true";
          }

          $.ajax({

            url: '/upload',
            type: 'POST',
            xhr: function() { // custom xhr
              var myXhr = $.ajaxSettings.xhr();
              if(myXhr.upload) { // check if upload property exists
                myXhr.upload.addEventListener('progress', progressHandler, false); // for handling the progress of the upload
              }
              return myXhr;
            },
            contentType: 'text/plain',
            //Ajax events
            success: successHandler,
            error: errorHandler,
            // Form data
            headers: {
              'X-File-Content-Type' : "application/octet-stream",
              'X-Csrf-Token' : csrfToken,
              'X-Last-Request' : lastRequest,
              'X-Chunk-Number' : index,
              'X-Upload-Token' : uploadToken,
              'X-Total-Chunks' : encryptedSlices.length
            },
            data: value, // binary chunk
            processData: false,
            cache: false
          });

        });
      }
    }
  });
}

/* ============================================================================
** File upload.
** ==========================================================================*/
function uploadFile() {
  // Get the chosen file.
  var file =  $("#file-input")[0].files[0];

  // Get the name of the file given by the user...
  filename = $('#filename').val();

  // ...or just take the existing name.
  if (filename.length < 1){
    filename = file.name;
  }

  if(!file) {
    return window.alert("Please choose a file.");
  }

  var username = $('#username').val();

  // set upload token
  uploadToken = uploadToken();

  // Create the initialization vector.
  iv = createIV();

  // establish upload session
  $.ajax({

    url: '/upload',
    type: 'POST',
    xhr: function() { // custom xhr
      var myXhr = $.ajaxSettings.xhr();
      if(myXhr.upload) { // check if upload property exists
        myXhr.upload.addEventListener('progress', progressHandler, false); // for handling the progress of the upload
      }
      return myXhr;
    },
    contentType: 'text/plain',
    //Ajax events
    beforeSend: beforeSendHandler,
    success: tokenSuccessHandler, //start actual upload after token is set
    error: errorHandler,
    // data
    headers: {
      'X-File-Content-Type' : "application/octet-stream",
      'X-Last-Request' : lastRequest,
      'X-Csrf-Token' : csrfToken,
      'X-File-Name' : filename,
      'X-Upload-Token' : uploadToken,
      'X-IV' : iv,
      'X-User-Name' : username
    },
    processData: false,
    cache: false
  });

}

// File upload handler.
function doUpload() {
  // Get the chosen file.
  var file =  $("#file-input")[0].files[0];

  // Get the name of the file given by the user...
  filename = $('#filename').val();

  // ...or just take the existing name.
  if (filename.length < 1){
    filename = file.name;
  }
  // Slice the chosen file.
  var slices = sliceFile(file);

  // Get the passphrase chosen by the user.
  passphrase = $('#passphrase').val();

  // Finally encrypt the slices using the passphrase and the iv.
  encryptFile(slices, passphrase);
}

// File download handler.
function doDownload() {
    // Get the name of the file given by the user...
  for (var i = 0; i < downloadChunks; i++) {
    $.ajax({
      url: '/downloadHandler',
      type: 'POST',
      xhr: function() { // custom xhr
        var myXhr = $.ajaxSettings.xhr();
        if(myXhr.upload) { // check if upload property exists
          myXhr.upload.addEventListener('progress', progressHandler, false); // for handling the progress of the upload
        }
        return myXhr;
      },
      contentType: 'text/plain',
      //Ajax events
      //beforeSend: beforeSendHandler,
      success: downloadChunkSuccessHandler,
      error: errorHandler,
      // Form data
      headers: {
        'X-File-Content-Type' : "application/octet-stream",
        'X-Last-Request' : lastRequest,
        'X-Csrf-Token' : csrfToken,
        'X-File-Request' : "false",
        'X-Requested-Chunk' : i.toString(),
        'X-File-Name' : filename
      },
      processData: false,
      cache: false
    });
  }
}

// Decrypt chunks of a file.
function decryptChunks() {
  var passphrase = $('#dec-passphrase').val();

  if (passphrase !== "") {
    iv = CryptoJS.enc.Hex.parse(iv);

    var aesDecryptor = CryptoJS.algo.AES.createDecryptor(passphrase, { iv: iv });

    for (var i = 0; i < downloadedChunks.length; i++) {
      var cipherText = CryptoJS.enc.Base64.parse(downloadedChunks[i]);
      decryptedChunks.push(aesDecryptor.process(cipherText));
    }

    decryptedChunks.push(aesDecryptor.finalize());

    // Disable previous inputs
    $("#dec-passphrase, #dec-submit").prop("disabled", true);

    // Show the download controls.
    $('#download-container').show();

    // Get the full file name.
    var index = filename.lastIndexOf("_");
    filename = filename.substr(index+1);

    $("#download-filename").val(filename).focus().select();


  } else {
    alert("You have to enter the passphrase to decrypt the file.");
  }
}

// Download file after decryption.
function downloadFile() {
  var fileToDownload = "";
  var typedArray = [];

  for (var i = 0; i < decryptedChunks.length; i++) {
    typedArray.push(convertWordArrayToUint8Array(decryptedChunks[i]));
  }

  var blob = new Blob(typedArray);
  var downloadURL = window.URL.createObjectURL(blob);

  filename = $("#download-filename").val();

  $("#download").attr({ href: downloadURL, download: filename });
  $("#download")[0].click();

}

/* ============================================================================
** XHR handlers
** ==========================================================================*/

function beforeSendHandler() {
  $("#upload-form").addClass("loading");
}

function progressHandler(e) {

  if(e.lengthComputable) {
    // handle chunk progress
  }
}

function successHandler(response) {
	if (response != uploadToken) {
		fileId = response.match("^[^_]+(?=_)");

    // Hide the loading state.
    $("#upload-form").removeClass("loading");

    // Output the passphrase.
    $("#file-passphrase").val(passphrase).select();

    // Build the download link.
    downloadLink = window.location.host + "/download?file=" + fileId;
    $("#file-link").val(downloadLink);
    $("#file-download").attr("href", "/download?file=" + fileId);

    // Show the modal.
    $('#upload-modal').modal('show');

    // Reload page to refresh tokens on modal closed.
    $('#upload-modal').modal({
      onHidden: function() {
        window.location.reload();
      }
    });
  }
}

function errorHandler() {
  console.log("error");
}

function tokenSuccessHandler(response) {
  doUpload();
}

function downloadSuccessHandler(response) {
  var responseObject = JSON.parse(response);

  downloadChunks = responseObject.chunks;
  filename = responseObject.filename;
  iv = responseObject.iv;

  doDownload();
}

function downloadChunkSuccessHandler(response) {
  var responseObject = JSON.parse(response);
  downloadedChunks[responseObject.number] = responseObject.chunk;
}
function getPublicKeySuccessHandler(response) {
  peerPublicKey = pki.publicKeyFromPem(response);
  localStorage.peerPublicKey = response;

  if (peerPublicKey == "offline") {
    alert("The user seems offline");
  }
  else if (peerPublicKey == "failed"){
    alert("An error occured");
  }
  else {
    $("#idiot").show();
  }
}
/* ============================================================================
** Messaging
** ==========================================================================*/

function setPublicKey() {
  generateKeyPair();
  localStorage.publicKey = pki.publicKeyToPem(keyPair.publicKey);
  localStorage.privateKey = pki.privateKeyToPem(keyPair.privateKey);
  $('#public-key').val(pki.publicKeyToPem(keyPair.publicKey)); 
}

function getPublicKey() {
  peerUserId = $(this).children(".user-id").data("userId");
  csrfToken = $(this).children("._csrf_token").val();
  lastRequest = "false";
  // AJAX call for public key
  $.ajax({
    url: '/getPublicKey',
    type: 'POST',
    xhr: function() { // custom xhr
      var myXhr = $.ajaxSettings.xhr();
      if(myXhr.upload) { // check if upload property exists
        myXhr.upload.addEventListener('progress', progressHandler, false); // for handling the progress of the upload
      }
      return myXhr;
    },
    contentType: 'text/plain',
    //Ajax events
    //beforeSend: beforeSendHandler,
    success: getPublicKeySuccessHandler,
    error: errorHandler,
    // Form data
    headers: {
      'X-File-Content-Type' : "application/octet-stream",
      'X-Csrf-Token' : csrfToken,
      'X-User-Id' : peerUserId,
      'X-Last-Request': lastRequest
    },
    processData: false,
    cache: false
  });
}

/* ============================================================================
** Utilities.
** ==========================================================================*/

// Unique token for upload.
function uploadToken() {

  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }

  return s4() + s4() + s4() + s4() +
    s4() + s4() + new Date().getTime();
}

// Get query parameters.
function getParameterByName(name) {
  name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
  var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
      results = regex.exec(location.search);
  return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

// Slice a file into chunks.
function sliceFile(file) {
  file.slice = file.mozSlice || file.webkitSlice || file.slice;

  var pos = 0;
  var slices = [];

  while(pos < file.size){
    slices.push(file.slice(pos, pos += 65536)); // Must be divisible by 16.
  }

  return slices;
}

// Create a random initialization vector.
function createIV() {
  return CryptoJS.lib.WordArray.random(128 / 8);
}

// Generate a new passphrase at page load.
function newPass() {
  $('#passphrase').val(generatePass());
}

// Generate a new passphrase.
function generatePass() {
  var length = Math.floor(Math.random() * 20) + 10;
  return randomString(length, alphabet);
}

// Randomize a string based on a length and charset.
function randomString(length, chars) {
  var result = '';

  for (var i = length; i > 0; --i) {
    result += chars[Math.round(Math.random() * (chars.length - 1))];
  }

  return result;
}

// Convert uint8array to binary string.
function convertUint8ArrayToBinaryString(u8Array) {
  var i, len = u8Array.length, b_str = "";

  for (i = 0; i < len; i++) {
    b_str += String.fromCharCode(u8Array[i]);
  }

  return b_str;
}

// Convert binary string to uint8array.
function convertBinaryStringToUint8Array(bStr) {
  var i, len = bStr.length, u8_array = new Uint8Array(len);

  for (i = 0; i < len; i++) {
    u8_array[i] = bStr.charCodeAt(i);
  }

  return u8_array;
}

// Convert word array to uint8 array.
function convertWordArrayToUint8Array(wordArray) {
  var len = wordArray.words.length,
    u8_array = new Uint8Array(len << 2),
    offset = 0, word, i
  ;

  for (i=0; i<len; i++) {
    word = wordArray.words[i];
    u8_array[offset++] = word >> 24;
    u8_array[offset++] = (word >> 16) & 0xff;
    u8_array[offset++] = (word >> 8) & 0xff;
    u8_array[offset++] = word & 0xff;
  }

  return u8_array;
}

// generate an RSA key parseInt
function generateKeyPair() {
  keyPair = rsa.generateKeyPair({bits: 2048, e: 0x10001});
}