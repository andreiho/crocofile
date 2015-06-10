/* ============================================================================
** General stuff.
** ==========================================================================*/

// Global variable declarations.
var csrfToken;


// Close alert messages.
$('.message .close').on('click', function() {
	$(this).closest('.message').fadeOut();
});

// Close alerts after some seconds.
setTimeout(function () {
	$('.message').fadeOut();
}, 5000);


$("#file-input").change(function() {
  alert("Your IP address has been logged. We know where you live.");
});