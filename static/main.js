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


	// some shit from google code, needs to be in different file

	CryptoJS.enc.u8array = {
	    /**
	     * Converts a word array to a Uint8Array.
	     *
	     * @param {WordArray} wordArray The word array.
	     *
	     * @return {Uint8Array} The Uint8Array.
	     *
	     * @static
	     *
	     * @example
	     *
	     *     var u8arr = CryptoJS.enc.u8array.stringify(wordArray);
	     */
	    stringify: function (wordArray) {
	        // Shortcuts
	        var words = wordArray.words;
	        var sigBytes = wordArray.sigBytes;

	        // Convert
	        var u8 = new Uint8Array(sigBytes);
	        for (var i = 0; i < sigBytes; i++) {
	            var byte = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
	            u8[i]=byte;
	        }

	        return u8;
	    },

	    /**
	     * Converts a Uint8Array to a word array.
	     *
	     * @param {string} u8Str The Uint8Array.
	     *
	     * @return {WordArray} The word array.
	     *
	     * @static
	     *
	     * @example
	     *
	     *     var wordArray = CryptoJS.enc.u8array.parse(u8arr);
	     */
	    parse: function (u8arr) {
	        // Shortcut
	        var len = u8arr.length;

	        // Convert
	        var words = [];
	        for (var i = 0; i < len; i++) {
	            words[i >>> 2] |= (u8arr[i] & 0xff) << (24 - (i % 4) * 8);
	        }

	        return CryptoJS.lib.WordArray.create(words, len);
	    }
	};

	function sliceFile(file){
	  file.slice = file.mozSlice || file.webkitSlice || file.slice; // compatibility
	  var pos = 0;
	  var slices = [];
	  while(pos < file.size){
	     slices.push(file.slice(pos, pos += 1000000));
	  }
	  return slices;
	}
	function createIV() {
		return CryptoJS.lib.WordArray.random(128 / 8);
	}

	function encryptFile(slices, passphrase, iv) {

		var encryptedSlices = [];
		var aesEncryptor = CryptoJS.algo.AES.createEncryptor(passphrase, { iv: iv });

		var decryptedSlices = [];
		

		for (var i = 0; i < slices.length; i++) {

			var reader = new FileReader();

			reader.onload = function(e) {

			  	var ui8a = new Uint8Array(reader.result);
				var wordarray = CryptoJS.enc.u8array.parse(encryptedSlices[0]);
				console.log("plaintext word array: ");
				console.log(wordarray);

				encryptedSlices.push(aesEncryptor.process(wordarray));
			
			}
			reader.readAsArrayBuffer(slices[i]);
			reader.onloadend = function(e) {

				if (i == slices.length) {

					encryptedSlices.push(aesEncryptor.finalize());
					console.log("ciphertext 1: ");
					
					var wordarray = CryptoJS.enc.u8array.parse(encryptedSlices[0]);
					console.log(ui8a);
					console.log("ciphertext 2: ");
					console.log(encryptedSlices[1]);

					decrypt(encryptedSlices[0], encryptedSlices[1], passphrase, iv);
					
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
	function decrypt(text1, text2, iv, passphrase) {
		var aesDecryptor = CryptoJS.algo.AES.createDecryptor(passphrase, { iv: iv });
		console.log("ciphertext 1 in decrypt: ");
		console.log(text1);
    	var plaintextPart1 = aesDecryptor.process(CryptoJS.enc.u8array.parse(text1));
    	
    	console.log("plaintext 1: " + plaintextPart1);

    	var plaintextPart2 = aesDecryptor.process(CryptoJS.enc.u8array.parse(text2));
    	
    	console.log("plaintext 2: " + plaintextPart2);
	}

	$('#passphrase').val(generatePass()); 
	$('#generate').on('click', newPass);
	//$('#upload-submit').on('click', uploadFile);
//});
