import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nextRefreshDelay,startRefreshScheduler} from '../scheduler.js';

test('agenda nos horários de quatro em quatro horas em Brasília',()=>{
 assert.equal(nextRefreshDelay(new Date('2026-10-30T02:59:30.000Z')),30000);
 assert.equal(nextRefreshDelay(new Date('2026-10-30T03:00:00.000Z')),4*60*60*1000);
 assert.equal(nextRefreshDelay(new Date('2026-10-30T14:12:30.500Z')),47*60*1000+29500);
});
test('executa os supermercados em sequência e continua depois de erro',async()=>{
 const timers=[];let resolveFirst;const order=[];
 const stop=startRefreshScheduler(['a','b','c'],async p=>{order.push(p);if(p==='a')await new Promise(r=>{resolveFirst=r;});if(p==='b')throw Error('falhou');},{now:()=>new Date('2026-10-30T02:59:30Z'),setTimer:(fn,delay)=>{const timer={fn,delay,unref(){}};timers.push(timer);return timer;},clearTimer:timer=>{timer.cleared=true;},log:()=>{}});
 assert.equal(timers[0].delay,30000);const execution=timers[0].fn();assert.deepEqual(order,['a']);assert.equal(timers.length,2);
 await timers[1].fn();assert.deepEqual(order,['a']);resolveFirst();await execution;assert.deepEqual(order,['a','b','c']);stop();assert.equal(timers.at(-1).cleared,true);
});
