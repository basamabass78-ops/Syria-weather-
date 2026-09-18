// Service Worker بسيط: وظيفته الوحيدة تفعيل شرط "قابل للتثبيت" (installable) للـ PWA.
// التطبيق يعمل حصرًا بوجود اتصال بالإنترنت، فلا يوجد هنا أي تخزين مؤقت أو دعم عمل دون اتصال.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

// لا يوجد حدث fetch مُعترَض هنا عن قصد: كل الطلبات تذهب للشبكة مباشرة كالمعتاد.
