window.dataLayer = window.dataLayer || [];
window.gtag = function gtag() {
	window.dataLayer.push(arguments);
};
window.gtag('js', new Date());
window.gtag('config', 'G-45CKHTJECJ');

setTimeout(() => {
	const lang = document.documentElement.lang || 'vi';
	const isVi = lang.startsWith('vi');
	const cssTitle =
		'color: red; font-size: 50px; font-weight: bold; text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff; font-family: sans-serif;';
	const cssText = 'font-size: 16px; font-family: sans-serif; line-height: 1.5;';
	const cssBold = 'font-size: 16px; font-weight: bold; font-family: sans-serif;';
	const title = isVi ? 'Dừng lại!' : 'Stop!';
	const message = isVi
		? 'Đây là tính năng dành cho nhà phát triển. Đừng dán mã do người khác đưa cho bạn: đó có thể là hành vi lừa đảo chiếm tài khoản.'
		: 'This is a developer feature. Do not paste code someone gave you: it may be a scam that compromises your account.';
	const warning = isVi ? 'Tuyệt đối không dán mã lạ vào đây!' : 'Never paste unknown code here!';

	console.log('%c' + title, cssTitle);
	console.log('%c' + message, cssText);
	console.log('%c' + warning, cssBold);
}, 100);
