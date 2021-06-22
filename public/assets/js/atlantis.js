"use strict";

$(document).ready(function(){

	$('[data-toggle="tooltip"]').tooltip();
	$('[data-toggle="popover"]').popover();

	let scrollbarDashboard = $('.sidebar .scrollbar');
	let contentScrollbar = $('.main-panel .content-scroll');

	if (scrollbarDashboard.length > 0) {
		scrollbarDashboard.scrollbar();
	}

	if (contentScrollbar.length > 0) {
		contentScrollbar.scrollbar();
	}

	$('.scroll-bar').draggable();

	//select all
	$('[data-select="checkbox"]').change(function(){
		var target = $(this).attr('data-target');
		$(target).prop('checked', $(this).prop("checked"));
	})

	//form-group-default active if input focus
	$(".form-group-default .form-control").focus(function(){
		$(this).parent().addClass("active");
	}).blur(function(){
		$(this).parent().removeClass("active");
	})

});

function showPassword(button) {
	var inputPassword = $(button).parent().find('input');
	if (inputPassword.attr('type') === "password") {
		inputPassword.attr('type', 'text');
	} else {
		inputPassword.attr('type','password');
	}
}

$('.show-password').on('click', function(){
	showPassword(this);
})