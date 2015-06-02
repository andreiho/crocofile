// Close alert messages.
$('.message .close').on('click', function() {
  console.log("lalala");
  $(this).closest('.message').fadeOut();
});
