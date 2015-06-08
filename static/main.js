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

// Bindings.
$('#passphrase').val(generatePass()); // Generate random passphrase on page load.
$('#generate').on('click', newPass); // Generate random passphrase on user request.

$('#file-input').change(uploadFile); // Upload a file on change.

// Close alert messages.
$('.message .close').on('click', function() {
	$(this).closest('.message').fadeOut();
});

// Close alerts after some seconds.
setTimeout(function () {
	$('.message').fadeOut();
}, 5000);

// ajax call on /download load
$(document).ready(function() {

  var href = window.location.href;
  href = href.substr(href.lastIndexOf('/') + 1);

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
      //beforeSend: beforeSendHandler,
      success: downloadSuccessHandler,
      error: errorHandler,
      // Form data
      headers: {
        'X-File-Content-Type' : "application/octet-stream",
        'X-File-Request' : "true",
        'X-File-Name' : getParameterByName("file")
      },
      processData: false,
      cache: false
    });
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
						//beforeSend: beforeSendHandler,
						success: successHandler,
						error: errorHandler,
						// Form data
						headers: {
							'X-File-Content-Type' : "application/octet-stream",
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

// Upload slices of a file.
function uploadFile(){
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
  // set upload token
  uploadToken = uploadToken();

  // Create the initialization vector.
  iv = createIV();
  console.log("iv: " + iv);

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
    //beforeSend: beforeSendHandler,
    success: tokenSuccessHandler, //start actual upload after token is set
    error: errorHandler,
    // data
    headers: {
      'X-File-Content-Type' : "application/octet-stream",
      'X-File-Name' : filename,
      'X-Upload-Token' : uploadToken,
      'X-IV' : iv
    },
    processData: false,
    cache: false
  });

}
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
  var passphrase = $('#passphrase').val();
  console.log("passphrase: " + passphrase);

  // Finally encrypt the slices using the passphrase and the iv.
  encryptFile(slices, passphrase);
}
function doDownload() {
    // Get the name of the file given by the user...
  filename = getParameterByName('file')
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
        'X-File-Request' : "false",
        'X-Requested-Chunk' : i.toString(),
        'X-File-Name' : filename
      },
      processData: false,
      cache: false
    });
  }
}

/* ============================================================================
** XHR handlers
** ==========================================================================*/

function successHandler(response) {
  console.log(response);
}
function tokenSuccessHandler(response) {
  doUpload();
}
function downloadSuccessHandler(response) {
  downloadChunks = parseInt(response);
  doDownload();
}
function downloadChunkSuccessHandler(response) {
  downloadedChunks.push(response);
}
function errorHandler() {
	console.log("error");
}

function progressHandler(e) {
	if(e.lengthComputable) {
		console.log("progress");
	}

	if(e.loaded != e.total){
    $(".itemStatus").html("Uploading: " + ((e.loaded / e.total) * 100).toFixed(0) + "% complete.");
  } else {
    $(".itemStatus").html("Upload complete. Generating URL...");
  }
}


/* ============================================================================
** Utilities.
** ==========================================================================*/

// get query parameters
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

// unique token for upload
function uploadToken() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + s4() + s4() +
    s4() + s4() + new Date().getTime();
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
