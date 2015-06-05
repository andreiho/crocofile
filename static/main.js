$(document).ready(function(){
	$('#passphrase').val(generatePass()); 
	$('#generate').on('click', newPass);
});
	var alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-+@!€§|~[]";
	var filename;
	// Close alert messages.
	$('.message .close').on('click', function() {
	  console.log("lalala");
	  $(this).closest('.message').fadeOut();
	});

	// Close alerts after some seconds.
	setTimeout(function () {
	  $('.message').fadeOut();
	}, 5000);


function sliceFile(file){
  file.slice = file.mozSlice || file.webkitSlice || file.slice; // compatibility
  var pos = 0;
  var slices = [];
  while(pos < file.size){
     slices.push(file.slice(pos, pos += 65536));
  }
  return slices;
}
function createIV() {
	return CryptoJS.lib.WordArray.random(128 / 8);
}

function encryptFile(slices, passphrase, iv) {

	var encryptedSlices = [];
	var aesEncryptor = CryptoJS.algo.AES.createEncryptor(passphrase, { iv: iv });
	

	for (var i = 0; i < slices.length; i++) {

		var reader = new FileReader();

		reader.onload = function(e) {

		  	var ui8a = new Uint8Array(reader.result);
			var wordarray = CryptoJS.enc.u8array.parse(ui8a);
			console.log("plaintext word array: ");
			console.log(wordarray);

			encryptedSlices.push(aesEncryptor.process(wordarray));
		
		}
		reader.readAsArrayBuffer(slices[i]);
		reader.onloadend = function(e) {

			if (i == slices.length) {

				encryptedSlices.push(aesEncryptor.finalize());
				
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
				        'X-File-Content-Type': "application/octet-stream",
				        'X-File-Name': filename,
				        'X-Chunk-Number': index
				      },
				      data: value, // binary chunk
				      processData: false,
				      cache: false
				    });
				});
			}
		}
	} 
}

function uploadFile(){
	var file =  $("#file-input")[0].files[0];
	filename = $('#filename').val();
	if (filename.length < 1){
		filename = file.name;
	}

	if(!file) {
		return window.alert("Please attach a file to share.");
	}

	var slices = sliceFile(file);
	var passphrase = $('#passphrase').val();
	var iv = createIV();
	
	console.log("iv: " + iv);
	console.log("passphrase: " + passphrase);
	
	encryptFile(slices, passphrase, iv);

}

function successHandler(response) {
  console.log(response);
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
function newPass() {
	$('#passphrase').val(generatePass());
}
function generatePass() {
	
	var length = Math.floor(Math.random() * 20) + 10;
	return randomString(length, alphabet);

}
function randomString(length, chars) {
    var result = '';
    for (var i = length; i > 0; --i) {
    	result += chars[Math.round(Math.random() * (chars.length - 1))];
    }    
    return result;
}

function convertUint8ArrayToBinaryString(u8Array) {
	var i, len = u8Array.length, b_str = "";
	for (i=0; i<len; i++) {
		b_str += String.fromCharCode(u8Array[i]);
	}
	return b_str;
}
 
function convertBinaryStringToUint8Array(bStr) {
	var i, len = bStr.length, u8_array = new Uint8Array(len);
	for (var i = 0; i < len; i++) {
		u8_array[i] = bStr.charCodeAt(i);
	}
	return u8_array;
}

	$('#passphrase').val(generatePass()); 
	$('#generate').on('click', newPass);
	//$('#upload-submit').on('click', uploadFile);
//});
