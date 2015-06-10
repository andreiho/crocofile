/* ============================================================================
** General stuff.
** ==========================================================================*/

// Global variable declarations.
var csrfToken;

// Close alert messages.
$('.message .close').on('click', function() {
	$(this).closest('.message').fadeOut();
});

$("#file-input").change(function() {
  alert("Your IP address has been logged. We know where you live. Just kidding. Only registration/login is available now. ;)");
});

// Close alerts after some seconds.
setTimeout(function () {
	$('.message').fadeOut();
}, 5000);


