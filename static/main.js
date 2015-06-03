$(document).ready(function() {

    // Close alert messages.
    $('.message .close').on('click', function() {
        $(this).closest('.message').fadeOut();
    });

    // Close alerts after some seconds.
    setTimeout(function() {
        $('.message').fadeOut();
    }, 5000);

    // heavily inspired by: https://github.com/STRML/securesha.re-client/blob/master/jquery-spaghetti/app/uploader.js#L139

    function sliceFile(file) {
        file.slice = file.mozSlice || file.webkitSlice || file.slice; // compatibility
        var pos = 0;
        var slices = [];
        while (pos < file.size) {
            slices.push(file.slice(pos, pos += 1000000));
        }
        return slices;
    }

    function uploadFile() {
        var file = $("#file-input")[0].files[0];
        var filename = $('#filename').val();

        if (filename.length < 1) {
            filename = file.name;
        }

        if (!file) {
            return window.alert("Please attach a file to share.");
        }

        var slices = sliceFile(file);

        $.each(slices, function(index, value) {
            $.ajax({
                url: '/upload',
                type: 'POST',
                xhr: function() { // custom xhr
                    var myXhr = $.ajaxSettings.xhr();
                    if (myXhr.upload) { // check if upload property exists
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

    function successHandler(response) {
        console.log(response);
    }

    function errorHandler() {
        console.log("error");
    }

    function progressHandler(e) {
        if (e.lengthComputable) {
            console.log("progress");
        }

        if (e.loaded != e.total) {
            $(".itemStatus").html("Uploading: " + ((e.loaded / e.total) * 100).toFixed(0) + "% complete.");
        } else {
            $(".itemStatus").html("Upload complete. Generating URL...");
        }
    }

    function generatePass() {
        var wordArray = CryptoJS.lib.WordArray.random(32);
        $('#passphrase').val(CryptoJS.enc.Latin1.stringify(wordArray));
    }

    var wordArray = CryptoJS.lib.WordArray.random(32);

    $('#passphrase').val(CryptoJS.enc.Latin1.stringify(wordArray));
    $('#generate').on('click', generatePass);

    $('#upload-submit').on('click', uploadFile);
});
