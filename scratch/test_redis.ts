import { redisService } from '../lib/redis-service';
import * as dotenv from 'dotenv';
dotenv.config();

async function testRedis() {
  console.log('Testing Redis connection...');
  console.log('URL:', process.env.UPSTASH_REDIS_REST_URL);
  
  const testKey = 'test:health';
  const testValue = { status: 'ok', ts: Date.now() };
  
  const setOk = await redisService.setJson(testKey, testValue, 60);
  console.log('Set result:', setOk);
  
  if (setOk) {
    const getVal = await redisService.getJson<typeof testValue>(testKey);
    console.log('Get result:', getVal);
    
    if (getVal && getVal.status === 'ok') {
      console.log('✅ Redis is working correctly.');
    } else {
      console.log('❌ Redis data mismatch.');
    }
  } else {
    console.log('❌ Redis set failed. Check credentials.');
  }
}

testRedis().catch(console.error);
