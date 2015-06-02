// Close alert messages.
$('.message .close').on('click', function() {
  console.log("lalala");
  $(this).closest('.message').fadeOut();
});

// Close alerts after some seconds.
setTimeout(function () {
  $('.message').fadeOut();
}, 5000);
