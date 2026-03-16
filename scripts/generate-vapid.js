const webpush = require('web-push');

const vapidKeys = webpush.generateVAPIDKeys();

console.log('\n🚀 RSIQ PRO - SAFE VAPID KEY GENERATOR\n');
console.log('--------------------------------------------------');
console.log('NEXT_PUBLIC_VAPID_PUBLIC_KEY:');
console.log(vapidKeys.publicKey);
console.log('\nVAPID_PRIVATE_KEY:');
console.log(vapidKeys.privateKey);
console.log('--------------------------------------------------');
console.log('\n✅ COPY THESE TO YOUR VERCEL ENVIRONMENT VARIABLES');
console.log('⚠️  After updating Vercel, RE-SUBSCRIBE in the app (toggle 24/7 Alerts).\n');
