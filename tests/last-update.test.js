import {test} from 'node:test';
import assert from 'node:assert/strict';
import {latestSuccessfulUpdate} from '../src/last-update.js';

test('usa a atualização bem-sucedida mais recente e ignora datas inválidas',()=>{
 const sources=[{last_success:'2026-10-29 12:00:00',updated:'2026-10-30 12:00:00',state:'error'},{last_success:null},{last_success:'inválida'}];
 const details=[{last_success:'2026-10-29 14:15:00',state:'ok'}];
 assert.equal(latestSuccessfulUpdate(sources,details)?.toISOString(),'2026-10-29T14:15:00.000Z');
 assert.equal(latestSuccessfulUpdate([],[]),null);
});
